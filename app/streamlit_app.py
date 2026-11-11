"""Tableau de bord du pipeline : évolution des prix, ruptures, état de la collecte, et classement par coût total.

Lancer : streamlit run app/streamlit_app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# Rend le paquet importable sans `pip install -e .` (cas de Streamlit Community Cloud).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from carburants import analysis, config, export, geo, history

FUEL_LABELS = {"e10": "SP95-E10", "sp95": "SP95-E5", "sp98": "SP98", "gazole": "Gazole", "e85": "E85", "gplc": "GPLc"}
PLACES = {
    "Place de la Comédie": (43.6084, 3.8796),
    "Gare Saint-Roch": (43.6032, 3.8809),
    "Odysseum": (43.6046, 3.9186),
    "Campus Triolet": (43.6318, 3.8613),
    "Autre (saisir les coordonnées)": None,
}

st.set_page_config(page_title="Plein Sud · données", page_icon="⛽", layout="wide")


@st.cache_data(ttl=600, show_spinner=False)
def get_tables():
    return analysis.load_tables(config.DATA_DIR)


@st.cache_data(ttl=600, show_spinner="Calcul des médianes quotidiennes…")
def get_history(dep: str | None):
    """Médianes quotidiennes, prévision et score (même calcul que le site), France entière ou un département."""
    events, stations = get_tables()
    if dep:
        dep_of = {str(r.station_id): geo.dep_of(getattr(r, "dep_code", None), getattr(r, "cp", None)) for r in stations.itertuples()}
        events = events[events["station_id"].astype(str).map(dep_of) == dep]
    return history.build_history(events, now=pd.Timestamp.now(tz="UTC"))


def analysis_tab(events: pd.DataFrame, stations: pd.DataFrame, now: pd.Timestamp) -> None:
    deps = sorted({d for d in (geo.dep_of(getattr(r, "dep_code", None), getattr(r, "cp", None)) for r in stations.itertuples()) if d})
    zone = st.selectbox("Zone", ["France entière", *deps], help="Médiane du prix en vigueur chaque jour, sur les stations de la zone.")
    hist = get_history(None if zone == "France entière" else zone)
    if not hist["fuels"]:
        st.info("Pas encore assez de jours de relevés pour cette zone.")
        return
    curves = pd.DataFrame({FUEL_LABELS[f]: pd.Series(x["median"], index=pd.to_datetime(x["days"])) for f, x in hist["fuels"].items()})
    st.subheader("Prix médian par jour (€/L)")
    main = [c for c in curves.columns if c not in ("E85", "GPLc")]
    st.line_chart(curves[main] if main else curves)
    rows = []
    for f, x in hist["fuels"].items():
        fc, bt = x.get("forecast"), x.get("backtest")
        rows.append({
            "Carburant": FUEL_LABELS[f], "Médiane du jour": x["median"][-1], "Stations": x["n"][-1],
            "Sur la période": x["median"][-1] - x["median"][0],
            "Prévision à 7 j": fc["real"][-1] if fc else None,
            "Fourchette basse": fc["low"][-1] if fc else None, "Fourchette haute": fc["high"][-1] if fc else None,
            "Écart moyen passé (c/L)": bt["mae"] * 100 if bt else None,
            "Prévision naïve (c/L)": bt["naive_mae"] * 100 if bt else None,
            "Dans la fourchette": bt["coverage"] if bt else None,
        })
    st.subheader("Prévision à 7 jours et sa fiabilité mesurée sur le passé")
    st.dataframe(
        pd.DataFrame(rows).style.format({
            "Médiane du jour": "{:.3f}", "Sur la période": "{:+.3f}", "Prévision à 7 j": "{:.3f}", "Fourchette basse": "{:.3f}",
            "Fourchette haute": "{:.3f}", "Écart moyen passé (c/L)": "{:.1f}", "Prévision naïve (c/L)": "{:.1f}", "Dans la fourchette": "{:.0%}",
        }, na_rep="–"),
        hide_index=True, width="stretch",
    )
    st.caption("Prévision : tendance des 14 derniers jours amortie de moitié ; expérimentale. « Prévision naïve » = le prix ne bouge pas.")

    st.subheader("Ruptures déclarées par les stations (dernier relevé)")
    rupt = [(f, kind or "non précisé") for text in stations.get("ruptures", pd.Series(dtype=object)).dropna() for f, (kind, _) in export.parse_ruptures(text).items()]
    if rupt:
        table = pd.DataFrame(rupt, columns=["fuel", "Type"]).assign(Carburant=lambda d: d["fuel"].map(FUEL_LABELS))
        st.bar_chart(table.groupby(["Carburant", "Type"]).size().unstack(fill_value=0))
    else:
        st.caption("Aucune rupture dans le dernier relevé stocké (ou relevé antérieur à la collecte des ruptures).")

    st.subheader("État de la collecte")
    per_day = events.assign(jour=events["first_seen_at"].dt.strftime("%Y-%m-%d")).groupby("jour").size().tail(30)
    last = analysis.latest_prices(events)
    age_h = (now - last["price_updated_at"]).dt.total_seconds() / 3600
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Changements de prix stockés", f"{len(events):,}".replace(",", " "))
    c2.metric("Stations suivies", f"{events['station_id'].nunique():,}".replace(",", " "))
    c3.metric("Dernier relevé", f"{events['first_seen_at'].max().tz_convert('Europe/Paris'):%d/%m %H:%M}")
    c4.metric("Prix de moins de 48 h", f"{(age_h <= 48).mean():.0%}")
    st.bar_chart(per_day, y_label="nouveaux prix détectés par jour")


events, stations = get_tables()
st.title("Plein Sud · les données derrière l'appli")
st.caption("Tableau de bord du pipeline. L'appli mobile : https://naelnagidoligez.github.io/Carburants-MTP/")

if events.empty or stations.empty:
    st.info("Aucune donnée pour l'instant : lance d'abord `python -m carburants run`.")
    st.stop()

now = pd.Timestamp.now(tz="UTC")
tab_analysis, tab_rank = st.tabs(["Analyse des prix", "Où faire le plein (détour compris)"])
with tab_analysis:
    analysis_tab(events, stations, now)
coverage = analysis.fuel_coverage(events, now)

with st.sidebar:
    st.header("Ta recherche")
    fuel = st.selectbox(
        "Carburant",
        options=[f for f in FUEL_LABELS if f in coverage.index],
        format_func=lambda f: f"{FUEL_LABELS[f]} ({coverage.get(f, 0)} stations en France)",
    )
    place = st.selectbox("Point de départ (exemples à Montpellier, ou tes coordonnées)", list(PLACES))
    if PLACES[place] is None:
        lat = st.number_input("Latitude", value=43.6084, format="%.4f")
        lon = st.number_input("Longitude", value=3.8796, format="%.4f")
        origin = (lat, lon)
    else:
        origin = PLACES[place]
    radius = st.slider("Rayon maximum (km, route)", 3, 40, 15)
    tank = st.number_input("Litres à mettre", 3.0, 80.0, 14.0, step=1.0)
    conso = st.number_input("Consommation (L/100 km)", 2.0, 15.0, 4.5, step=0.5)

with tab_rank:
    ranked = analysis.rank_stations(
        events, stations, fuel, origin=origin, now=now, radius_km=radius,
        tank_litres=tank, consumption_l_per_100km=conso,
    )

    if fuel == "sp95" and len(ranked) < 5:
        st.warning(
            f"Seulement {len(ranked)} station(s) proposent du SP95 dans ce rayon : le SP95-E10 est bien plus répandu. "
            "Vérifie dans le manuel de ta moto qu'elle accepte l'E10 avant de l'utiliser."
        )

    if ranked.empty:
        st.error("Aucune station avec un prix récent dans ce rayon. Élargis le rayon ou change de carburant.")
        st.stop()

    best = ranked.iloc[0]
    nearest = ranked.loc[ranked["distance_km"].idxmin()]
    c1, c2, c3 = st.columns(3)
    c1.metric("Meilleure option", f"{best['ville']}", f"à {best['distance_km']:.1f} km", delta_color="off", delta_arrow="off")
    c2.metric(
        "Prix au litre", f"{best['price']:.3f} €",
        f"{best['price'] - nearest['price']:+.3f} € vs la plus proche", delta_color="inverse",
    )
    c3.metric(
        "Coût total, détour compris", f"{best['total_eur']:.2f} €",
        f"{-best['gain_vs_plus_proche_eur']:+.2f} € vs la plus proche", delta_color="inverse",
    )

    show = ranked.head(15).copy()
    show["Prix mis à jour"] = show["price_updated_at"].dt.tz_convert("Europe/Paris").dt.strftime("%d/%m %H:%M")
    table = show.rename(
        columns={"ville": "Ville", "adresse": "Adresse", "price": "Prix (€/L)", "distance_km": "Distance (km)",
                 "plein_eur": "Plein (€)", "detour_eur": "Détour (€)", "total_eur": "Total (€)"}
    )[["Ville", "Adresse", "Prix (€/L)", "Distance (km)", "Plein (€)", "Détour (€)", "Total (€)", "Prix mis à jour"]]
    st.dataframe(
        table.style.format({"Prix (€/L)": "{:.3f}", "Distance (km)": "{:.1f}", "Plein (€)": "{:.2f}",
                            "Détour (€)": "{:.2f}", "Total (€)": "{:.2f}"}),
        hide_index=True, width="stretch",
    )
    st.map(show[["latitude", "longitude"]], zoom=10)

    st.caption(
        f"Données : flux officiel des prix des carburants (licence ouverte 2.0). "
        f"Dernier prix relevé : {events['price_updated_at'].max():%d/%m/%Y %H:%M} UTC. "
        f"{events['station_id'].nunique()} stations suivies, "
        + (f"départements {', '.join(config.DEPARTMENTS)}." if config.DEPARTMENTS else "France entière.")
    )
    with st.expander("Comment c'est calculé ?"):
        st.markdown(
            "- **Plein** = prix au litre × litres à mettre.\n"
            "- **Détour** = aller-retour depuis ton point de départ × consommation × prix du litre. "
            "La distance est à vol d'oiseau multipliée par 1,3 pour approcher la route.\n"
            "- **Total** = plein + détour, et le classement suit le total. "
            "Une station moins chère mais loin peut donc passer derrière celle du coin.\n"
            "- Les prix de plus de 14 jours sont ignorés."
        )
