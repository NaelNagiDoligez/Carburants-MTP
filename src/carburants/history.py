"""Historique et prévision : la médiane des prix de la zone, jour par jour, et 7 jours de scénarios.

Le flux ne donne que des changements de prix. Le prix « en vigueur » d'une station un jour J est son
dernier prix connu à la fin de J (s'il a moins de 14 jours). La médiane de ces prix fait la courbe.

La prévision reste volontairement simple et lisible :
- réaliste : la tendance des 14 derniers jours (pente des moindres carrés), amortie de moitié ;
- optimiste / pessimiste : réaliste -/+ la variation quotidienne typique, qui s'élargit avec la racine
  du nombre de jours (marche aléatoire). Peu d'historique = bande large, et on le dit.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

MIN_STATIONS = 8  # en dessous, la médiane du jour n'est pas représentative
HORIZON_DAYS = 7
TREND_DAYS = 14
MIN_DAILY_SIGMA = 0.004  # 0,4 c/L par jour : plancher, faute de recul suffisant


def daily_medians(
    events: pd.DataFrame, end: pd.Timestamp, days: int = 90, max_age_days: float = 14.0, since: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Médiane quotidienne du prix en vigueur, par carburant. Colonnes : day, fuel, median, n.

    `since` : début de la collecte. Avant, on ne connaît que les prix qui n'ont plus bougé ensuite
    (les autres ont été remplacés avant qu'on les voie) : la médiane serait biaisée, on ne la calcule pas.
    """
    if events.empty:
        return pd.DataFrame(columns=["day", "fuel", "median", "n"])
    ev = events.sort_values("price_updated_at")
    end_day = end.tz_convert("UTC").normalize()
    rows = []
    for k in range(days, -1, -1):
        day = end_day - pd.Timedelta(days=k)
        if since is not None and day < since.tz_convert("UTC").normalize():
            continue
        cutoff = day + pd.Timedelta(days=1)
        known = ev[ev["price_updated_at"] < cutoff]
        if known.empty:
            continue
        last = known.groupby(["station_id", "fuel"]).tail(1)
        fresh = last[(cutoff - last["price_updated_at"]).dt.total_seconds() / 86400 <= max_age_days]
        for fuel, grp in fresh.groupby("fuel"):
            if len(grp) >= MIN_STATIONS:
                rows.append({"day": day.strftime("%Y-%m-%d"), "fuel": fuel, "median": round(float(grp["price"].median()), 4), "n": len(grp)})
    return pd.DataFrame(rows, columns=["day", "fuel", "median", "n"])


def forecast(values: list[float], horizon: int = HORIZON_DAYS) -> dict | None:
    """Trois scénarios sur `horizon` jours à partir d'une série quotidienne (au moins 4 points)."""
    y = np.asarray(values, dtype=float)
    if len(y) < 4:
        return None
    recent = y[-TREND_DAYS:]
    x = np.arange(len(recent))
    slope = float(np.polyfit(x, recent, 1)[0]) * 0.5  # tendance amortie
    diffs = np.diff(y[-30:])
    sigma = max(float(np.std(diffs)) if len(diffs) > 1 else 0.0, MIN_DAILY_SIGMA)
    last = float(y[-1])
    real, low, high = [], [], []
    for h in range(1, horizon + 1):
        mid = last + slope * h
        spread = 1.28 * sigma * math.sqrt(h)  # ~80 % des cas si les variations restent comme avant
        real.append(round(mid, 4))
        low.append(round(mid - spread, 4))
        high.append(round(mid + spread, 4))
    return {
        "real": real, "low": low, "high": high,
        "slope_per_day": round(slope, 5), "daily_sigma": round(sigma, 5), "points": len(y),
    }


MIN_BACKTEST = 10  # en dessous, le score ne veut encore rien dire


def backtest(values: list[float], horizon: int = HORIZON_DAYS) -> dict | None:
    """Rejoue la prévision dans le passé : à chaque jour J, prévoir avec les seules données jusqu'à J,
    puis comparer aux médianes réellement observées les jours suivants.

    Renvoie l'écart moyen du scénario réaliste (en €/L), la part des jours tombés dans la bande
    optimiste/pessimiste, et l'écart moyen de la prévision « rien ne bouge » pour comparaison.
    """
    y = [float(v) for v in values]
    errs, naive, inside = [], [], 0
    for t in range(3, len(y) - 1):
        fc = forecast(y[: t + 1], horizon)
        if not fc:
            continue
        for h in range(1, horizon + 1):
            if t + h >= len(y):
                break
            actual = y[t + h]
            errs.append(abs(fc["real"][h - 1] - actual))
            naive.append(abs(y[t] - actual))
            inside += fc["low"][h - 1] <= actual <= fc["high"][h - 1]
    if len(errs) < MIN_BACKTEST:
        return None
    return {
        "n": len(errs),
        "mae": round(float(np.mean(errs)), 4),
        "naive_mae": round(float(np.mean(naive)), 4),
        "coverage": round(inside / len(errs), 3),
    }


def build_history(events: pd.DataFrame, now: pd.Timestamp, days: int = 90) -> dict:
    total_events = len(events)
    if len(events):
        # Un prix de plus de (fenêtre + 14 j) ne peut plus être « en vigueur » sur la fenêtre : inutile de le parcourir.
        events = events[events["price_updated_at"] >= now.tz_convert("UTC") - pd.Timedelta(days=days + 16)]
    first_seen = events["first_seen_at"].min() if "first_seen_at" in events and len(events) else None
    if first_seen is not None and pd.isna(first_seen):
        first_seen = None
    med = daily_medians(events, end=now, days=days, since=first_seen)
    fuels = {}
    for fuel, grp in med.groupby("fuel"):
        grp = grp.sort_values("day")
        values = grp["median"].tolist()
        fc = forecast(values)
        item = {"days": grp["day"].tolist(), "median": values, "n": grp["n"].astype(int).tolist()}
        bt = backtest(values)
        if bt:
            item["backtest"] = bt
        if fc:
            last_day = pd.Timestamp(grp["day"].iloc[-1])
            item["forecast"] = {"days": [(last_day + pd.Timedelta(days=h)).strftime("%Y-%m-%d") for h in range(1, HORIZON_DAYS + 1)], **fc}
        fuels[fuel] = item
    return {
        "version": 1,
        "generated_at": now.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ"),
        "collecting_since": first_seen.strftime("%Y-%m-%d") if first_seen is not None else None,
        "events": total_events,
        "stations": int(events["station_id"].nunique()) if len(events) else 0,
        "fuels": fuels,
    }
