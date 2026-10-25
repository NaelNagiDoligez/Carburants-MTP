# Carburants Montpellier

Pipeline de données qui historise chaque jour les prix des carburants (SP95, E10, SP98, gazole...)
autour de Montpellier, à partir du flux officiel
[Prix des carburants en France, flux instantané v2](https://www.data.gouv.fr/fr/datasets/6407d088d4e23dc662022e2c)
(licence ouverte 2.0).

Le flux ne donne que le prix actuel, sans historique. Ce dépôt construit cet historique,
le contrôle, puis sert à analyser et prévoir les prix (voir `docs/roadmap.html`).

## Où en est le projet

- [x] Étape 1 : ingestion, contrôles qualité, stockage Parquet, tests, GitHub Actions
- [ ] Étape 2 : analyse et appli (station la moins chère autour de moi)
- [ ] Étape 3 : prévision du prix à 7 jours

## Lancer en local (Windows, PowerShell)

```powershell
git clone <ton-depot>
cd carburant-montpellier
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"

pytest -q                       # tests
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

Zone suivie : départements 34 et 30 (modifiable avec la variable `CARBURANTS_DEPARTMENTS`).

## Points à vérifier au premier lancement réel

Le schéma du flux (noms de colonnes `sp95_prix`, `sp95_maj`, `dep_code`...) a été écrit
d'après la documentation, sans pouvoir être testé sur le vrai flux. Si les colonnes diffèrent,
`transform.py` s'arrête avec la liste des colonnes disponibles : il suffit d'ajuster `config.py`.
