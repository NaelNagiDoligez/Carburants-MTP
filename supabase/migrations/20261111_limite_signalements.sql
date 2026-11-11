-- À APPLIQUER dans Supabase (SQL Editor) : préparée le 11 nov. 2026, testée dans une transaction annulée, pas encore en place.
-- Les 4 migrations précédentes sont dans Supabase (table supabase_migrations.schema_migrations), pas encore dans ce dépôt.
-- Au plus 30 signalements « épuisé / il y en a » par personne et par heure : évite le remplissage de la base et le harcèlement d'amis.
create function public.stock_reports_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.stock_reports r where r.user_id = new.user_id and r.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de signalements en une heure : réessaie plus tard.' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.stock_reports_limit() from public, anon, authenticated;
create trigger stock_reports_limit before insert on public.stock_reports for each row execute function public.stock_reports_limit();
