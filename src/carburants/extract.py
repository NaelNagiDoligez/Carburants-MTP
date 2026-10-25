"""Extraction : télécharge le flux instantané (ou lit un fichier local pour les tests)."""

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


def build_where(departments: list[str]) -> str | None:
    """Filtre ODSQL sur le département. None = pas de filtre (toute la France)."""
    if not departments:
        return None
    quoted = ", ".join(f'"{d}"' for d in departments)
    return f"dep_code in ({quoted})"


def fetch_records(departments: list[str] | None = None) -> list[dict]:
    """Télécharge les enregistrements bruts (une ligne par station)."""
    departments = config.DEPARTMENTS if departments is None else departments
    params: dict[str, str] = {}
    where = build_where(departments)
    if where:
        params["where"] = where
    resp = _session().get(config.API_URL, params=params, timeout=config.REQUEST_TIMEOUT_S)
    resp.raise_for_status()
    records = resp.json()
    if not isinstance(records, list):
        raise TypeError(f"Réponse inattendue (type {type(records).__name__}), liste attendue.")
    return records


def read_records(path: Path) -> list[dict]:
    """Lit un export JSON local (tests, rejeu hors-ligne)."""
    return json.loads(Path(path).read_text(encoding="utf-8"))
