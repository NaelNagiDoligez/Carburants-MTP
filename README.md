# Plein Sud : prix des carburants en France, du flux officiel à l'appli de poche

> **Version 0.9 (bêta)** : tout fonctionne ; reste à valider sur de vrais téléphones les amis à plusieurs. Voir [CHANGELOG.md](CHANGELOG.md).

- **L'appli mobile** : https://naelnagidoligez.github.io/Carburants-MTP/ (site statique installable, classement par coût total d'un plein, détour compris)
- **Le tableau de bord des données** : https://carte-carburants-mtp.streamlit.app (médianes par jour, prévision et sa fiabilité, ruptures, état de la collecte)

Pipeline de données qui historise plusieurs fois par jour les prix des carburants (SP95, E10, SP98, gazole...)
de toute la France, à partir du flux officiel
[Prix des carburants en France, flux instantané v2](https://www.data.gouv.fr/fr/datasets/6407d088d4e23dc662022e2c)
(licence ouverte 2.0).

Le flux ne donne que le prix actuel, sans historique. Ce dépôt construit cet historique,
le contrôle, puis sert à analyser et prévoir les prix (voir `docs/roadmap.html`).

## Où en est le projet

- [x] Étape 1 : ingestion, contrôles qualité, stockage Parquet, tests, GitHub Actions
- [x] Étape 2 : site mobile Plein Sud (toute la France, par département), tableau de bord Streamlit, historique
- [x] Étape 3 : prévision du prix à 7 jours, étiquetée expérimentale, vérifiée sur le passé
- [x] Ruptures déclarées par les stations (type et début), collectées et affichées
- [ ] v1 : test des amis à plusieurs sur de vrais téléphones

## Site mobile « Plein Sud »

Site statique (`web/`) pensé pour le téléphone : position GPS, classement des stations par coût total
d'un plein (détour compris), profils de véhicule, animations, installable sur l'écran d'accueil.
Il lit les fichiers produits par `python -m carburants export` (un par département), republiés sur GitHub Pages après
chaque collecte, une fois les tests passés (`.github/workflows/pages.yml`).

Tester en local : `python -m carburants export --out web/data` puis `python -m http.server -d web 8000` et ouvrir http://localhost:8000.

## Lancer en local (Windows, PowerShell)

```powershell
git clone <ton-depot>
cd carburant-montpellier
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"

pytest -q                       # tests
pip install -e ".[app]"         # une fois, pour l'appli
streamlit run app/streamlit_app.py   # appli : où faire le plein, détour compris
python -m carburants run        # télécharge un snapshot et le stocke dans data/
python -m carburants stats      # résumé de l'historique
```

Hors-ligne, avec le fichier d'exemple : `python -m carburants run --from-file tests/fixtures/sample.json`

## Fonctionnement

```
API data.economie.gouv.fr -> extract -> transform -> quality -> load (Parquet par jour)
                                                       |
                                          erreur bloquante = run en échec = alerte GitHub
```

| Fichier | Rôle |
|---|---|
| `src/carburants/extract.py` | Téléchargement avec reprises automatiques |
| `src/carburants/transform.py` | Passage « une colonne par carburant » vers une table propre (station, carburant, prix, date) |
| `src/carburants/quality.py` | Prix hors bornes (écartés ; relevé refusé au-delà de 1 %), flux gelé, chute de volume |
| `src/carburants/load.py` | Écriture Parquet idempotente, sans doublon ; dimension des stations stable, disponibilité à part |
| `src/carburants/export.py`, `history.py` | Fichiers du site par département, médianes quotidiennes, prévision et score |
| `.github/workflows/ingest.yml` | Exécution automatique, planifiée toutes les 4 h (GitHub en saute : 3 à 4 passages réels par jour) |

Zone suivie : toute la France (le flux complet est déjà téléchargé ; `CARBURANTS_DEPARTMENTS="34,30"` restreint pour les essais).
Le site ne charge que le département de l'utilisateur : `web/data/dept/<code>.json` (ses stations + celles à moins de 35 km de sa frontière),
`grid.json` (position → département) et `hist/<code>.json` (historique et prévision). Pour un trajet, les départements traversés sont chargés en plus.
Ces fichiers sont générés au déploiement (`python -m carburants export`), jamais commités ; `data/` (Parquet) ne stocke qu'un fichier par jour.
Les positions OpenStreetMap sont rafraîchies par département, 12 par passage, chacun au plus une fois par semaine.

## Données stockées

| Fichier | Contenu |
|---|---|
| `data/price_events/AAAA-MM-JJ.parquet` | Un événement par changement de prix (station, carburant, prix, date de mise à jour, date de première observation), un fichier par jour |
| `data/stations.parquet` | Dimension des stations (adresse, position, horaires, services) : triée, réécrite seulement si elle change |
| `data/station_status.parquet` | Ce qui bouge à chaque relevé : carburants indisponibles, ruptures (type, début) |
| `data/osm_fuel.json` | Cache des stations OpenStreetMap, par département |

Le flux fournit `<carburant>_prix`, `<carburant>_maj`, `<carburant>_rupture_type`, `<carburant>_rupture_debut`, `code_departement`…
Si le schéma change, `transform.py` s'arrête en listant les colonnes disponibles.

## Positions des stations (OpenStreetMap)

Les coordonnées du flux officiel tombent parfois au milieu de la route. Une fois par semaine, `python -m carburants osm`
récupère les stations `amenity=fuel` d'OpenStreetMap (cache `data/osm_fuel.json`) et l'export recale chaque station sur le
point OSM le plus proche (≤ 400 m pour la position ; l'enseigne n'est reprise qu'à moins de 150 m). Sans cache, l'itinéraire utilise l'adresse.
Données © contributeurs OpenStreetMap, licence ODbL.

## En coulisses

La page [`web/coulisses.html`](web/coulisses.html) (lien « En coulisses » en bas des réglages de l'appli) montre le
chemin d'un prix, les chiffres du jour, les courbes par carburant et la méthode de prévision. L'export écrit
`web/data/history.json` (national) et `web/data/hist/<code>.json` (par département) : médiane quotidienne du prix en vigueur depuis le début de la
collecte, et 7 jours de scénarios (réaliste = tendance des 14 derniers jours amortie, optimiste/pessimiste =
± variation quotidienne habituelle × √jours, plus l'incertitude sur la tendance). Code : `src/carburants/history.py`.

## Trajet

L'onglet Trajet géocode la destination (Base Adresse Nationale), demande l'itinéraire au serveur public OSRM
et classe les stations à moins de 1, 2 ou 5 km de la route (`web/trip.js`, testé dans `web/tests/trip.test.mjs`).


## Amis (Supabase)

Optionnel : connexion Google (ou pseudo + clé de récupération), amis par code d'invitation, classement d'économies du mois, signalement « carburant épuisé » (pris en compte à partir de deux personnes, ou soi-même), sauvegarde du carnet, des véhicules et des favoris. Base Supabase à Paris, règles RLS testées ; la page [confidentialité](web/confidentialite.html) détaille ce qui est stocké. Le workflow `keepalive.yml` appelle la base deux fois par semaine (un projet gratuit se met en pause après 7 jours sans activité) et purge les signalements de plus de 30 jours.

## Licences

Code : [MIT](LICENSE). Prix : ministère de l'Économie, flux instantané v2, Licence Ouverte 2.0. Positions et enseignes : © contributeurs OpenStreetMap (ODbL). Polices Archivo et Young Serif : SIL Open Font License. Contact : sudpleincontact@gmail.com
