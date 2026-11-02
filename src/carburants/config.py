"""Configuration centrale. Tout ce qui peut changer est ici (ou en variable d'environnement)."""

from __future__ import annotations

import os
from pathlib import Path

# Flux instantané v2 (mis à jour toutes les 10 min, licence ouverte 2.0).
# Page du jeu de données : https://www.data.gouv.fr/fr/datasets/6407d088d4e23dc662022e2c
DATASET_ID = "prix-des-carburants-en-france-flux-instantane-v2"
API_URL = (
    "https://www.data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    f"{DATASET_ID}/exports/json"
)

# Toute la France par défaut. Pour restreindre (tests, essais) : CARBURANTS_DEPARTMENTS="34,30".
# Filtre appliqué en local après téléchargement du flux complet.
DEPARTMENTS = [
    d.strip() for d in os.getenv("CARBURANTS_DEPARTMENTS", "").split(",") if d.strip()
]

# Colonnes cherchées dans le flux : <carburant>_prix et <carburant>_maj (celles absentes sont ignorées).
FUELS = ["gazole", "sp95", "e10", "sp98", "e85", "gplc"]
STATION_COLUMNS = {
    "id": "station_id",
    "adresse": "adresse",
    "ville": "ville",
    "cp": "cp",
    "dep_code": "dep_code",
    "latitude": "latitude",
    "longitude": "longitude",
}

# Colonnes facultatives, gardées seulement si le flux les fournit (noms non vérifiés sur le flux réel).
OPTIONAL_STATION_COLUMNS = {
    "horaires_automate_24_24": "automate_24_24",
    "carburants_indisponibles": "indisponibles",
    "horaires_jour": "horaires",
    "services_service": "services",
}

DATA_DIR = Path(os.getenv("CARBURANTS_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))

# Bornes de plausibilité (€/L) utilisées par les contrôles qualité.
PRICE_MIN = 0.50
PRICE_MAX = 4.00
# Alerte si le nombre de lignes chute de plus de 30 % par rapport au dernier run.
MAX_ROW_DROP = 0.30
# Alerte si le prix le plus récent du flux date de plus de N jours.
MAX_STALENESS_DAYS = 3

REQUEST_TIMEOUT_S = 90
