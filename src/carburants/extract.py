"""Extraction : télécharge le flux instantané complet (ou lit un fichier local pour les tests).

Le filtrage par département se fait ensuite en local (voir transform.normalize) :
un filtre côté serveur sur un champ au nom incertain provoquait une erreur 400.
"""

from __future__ import annotations

import json
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from . import config


def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=4, backoff_factor=2, status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def fetch_records() -> list[dict]:
    """Télécharge tous les enregistrements bruts (une ligne par station, toute la France)."""
    resp = _session().get(config.API_URL, timeout=config.REQUEST_TIMEOUT_S)
    if not resp.ok:
        # Le corps de la réponse explique presque toujours la cause : on l'affiche.
        raise requests.HTTPError(
            f"{resp.status_code} sur {resp.url}\nRéponse du serveur : {resp.text[:1000]}",
            response=resp,
        )
    records = resp.json()
    if not isinstance(records, list):
        raise TypeError(f"Réponse inattendue (type {type(records).__name__}), liste attendue.")
    return records


def read_records(path: Path) -> list[dict]:
    """Lit un export JSON local (tests, rejeu hors-ligne)."""
    return json.loads(Path(path).read_text(encoding="utf-8"))
