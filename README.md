# Carburants Montpellier

> **Version 0.9 (bêta)** : tout fonctionne ; restent à valider sur de vrais téléphones les amis à plusieurs et la restauration de la sauvegarde. Voir [CHANGELOG.md](CHANGELOG.md).

https://carte-carburants-mtp.streamlit.app

Pipeline de données qui historise chaque jour les prix des carburants (SP95, E10, SP98, gazole...)
autour de Montpellier, à partir du flux officiel
[Prix des carburants en France, flux instantané v2](https://www.data.gouv.fr/fr/datasets/6407d088d4e23dc662022e2c)
(licence ouverte 2.0).

Le flux ne donne que le prix actuel, sans historique. Ce dépôt construit cet historique,
le contrôle, puis sert à analyser et prévoir les prix (voir `docs/roadmap.html`).

## Où en est le projet

- [x] Étape 1 : ingestion, contrôles qualité, stockage Parquet, tests, GitHub Actions
- [~] Étape 2 : appli « où faire le plein » (faite, à déployer), analyses SQL et historique (à faire)
- [ ] Étape 3 : prévision du prix à 7 jours

## Site mobile « Plein Sud »

Site statique (`web/`) pensé pour le téléphone : position GPS, classement des stations par coût total
d'un plein (détour compris), profils de véhicule, animations, installable sur l'écran d'accueil.
Il lit `latest.json`, produit par `python -m carburants export` et republié sur GitHub Pages après
chaque collecte (`.github/workflows/pages.yml`).

Tester en local : `python -m carburants export` puis `python -m http.server -d web 8000` et ouvrir http://localhost:8000.

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
API data.economie.gouv.fr -> extract -> transform -> quality -> load (Parquet par mois)
                                                       |
                                          erreur bloquante = run en échec = alerte GitHub
```

| Fichier | Rôle |
|---|---|
| `src/carburants/extract.py` | Téléchargement avec reprises automatiques |
| `src/carburants/transform.py` | Passage « une colonne par carburant » vers une table propre (station, carburant, prix, date) |
| `src/carburants/quality.py` | Prix hors bornes, flux gelé, chute de volume |
| `src/carburants/load.py` | Écriture Parquet idempotente, sans doublon |
| `.github/workflows/ingest.yml` | Exécution automatique toutes les 6 h |

Zone suivie : toute la France (le flux complet est déjà téléchargé ; `CARBURANTS_DEPARTMENTS="34,30"` restreint pour les essais).
Le site ne charge que le département de l'utilisateur : `web/data/dept/<code>.json` (ses stations + celles à moins de 35 km de sa frontière),
`grid.json` (position → département) et `hist/<code>.json` (historique et prévision). Pour un trajet, les départements traversés sont chargés en plus.
Ces fichiers sont générés au déploiement (`python -m carburants export`), jamais commités ; `data/` (Parquet) ne stocke qu'un fichier par jour.
Les positions OpenStreetMap sont rafraîchies par département, 12 par passage, chacun au plus une fois par semaine.

## Points à vérifier au premier lancement réel

Le schéma du flux (noms de colonnes `sp95_prix`, `sp95_maj`, `dep_code`...) a été écrit
d'après la documentation, sans pouvoir être testé sur le vrai flux. Si les colonnes diffèrent,
`transform.py` s'arrête avec la liste des colonnes disponibles : il suffit d'ajuster `config.py`.

## Positions des stations (OpenStreetMap)

Les coordonnées du flux officiel tombent parfois au milieu de la route. Une fois par semaine, `python -m carburants osm`
récupère les stations `amenity=fuel` d'OpenStreetMap (cache `data/osm_fuel.json`) et l'export recale chaque station sur le
point OSM le plus proche (≤ 150 m), avec son enseigne. Sans cache, l'itinéraire utilise l'adresse.
Données © contributeurs OpenStreetMap, licence ODbL.

## En coulisses

La page [`web/coulisses.html`](web/coulisses.html) (lien « En coulisses » en bas des réglages de l'appli) montre le
chemin d'un prix, les chiffres du jour, les courbes par carburant et la méthode de prévision. L'export écrit
`web/data/history.json` à côté de `latest.json` : médiane quotidienne du prix en vigueur depuis le début de la
collecte, et 7 jours de scénarios (réaliste = tendance des 14 derniers jours amortie, optimiste/pessimiste =
± variation quotidienne habituelle × √jours). Code : `src/carburants/history.py`.

## Trajet

L'onglet Trajet géocode la destination (Base Adresse Nationale), demande l'itinéraire au serveur public OSRM
et classe les stations à moins de 1, 2 ou 5 km de la route (`web/trip.js`, testé dans `web/tests/trip.test.mjs`).


## Amis (Supabase)

Optionnel : connexion Google (ou pseudo + clé de récupération), amis par code d'invitation, classement d'économies du mois, signalement « carburant épuisé » (pris en compte à partir de deux personnes, ou soi-même), sauvegarde du carnet, des véhicules et des favoris. Base Supabase à Paris, règles RLS testées ; la page [confidentialité](web/confidentialite.html) détaille ce qui est stocké. Le workflow `keepalive.yml` appelle la base deux fois par semaine (un projet gratuit se met en pause après 7 jours sans activité) et purge les signalements de plus de 30 jours.
