"""Contrôles qualité. Une anomalie « error » fait échouer le run (donc alerte GitHub)."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from . import config


@dataclass(frozen=True)
class Issue:
    level: str  # "error" | "warning"
    check: str
    message: str


def check_events(
    events: pd.DataFrame,
    now: pd.Timestamp,
    previous_row_count: int | None = None,
) -> list[Issue]:
    issues: list[Issue] = []

    if events.empty:
        return [Issue("error", "not_empty", "Aucun événement de prix après transformation.")]

    out_of_range = events[(events["price"] < config.PRICE_MIN) | (events["price"] > config.PRICE_MAX)]
    if len(out_of_range):
        issues.append(
            Issue(
                "error",
                "price_range",
                f"{len(out_of_range)} prix hors [{config.PRICE_MIN}, {config.PRICE_MAX}] €/L "
                f"(ex. station {out_of_range.iloc[0]['station_id']} : {out_of_range.iloc[0]['price']}).",
            )
        )

    future = events[events["price_updated_at"] > now + pd.Timedelta(hours=1)]
    if len(future):
        issues.append(Issue("warning", "future_dates", f"{len(future)} dates de mise à jour dans le futur."))

    newest = events["price_updated_at"].max()
    age_days = (now - newest).total_seconds() / 86400
    if age_days > config.MAX_STALENESS_DAYS:
        issues.append(
            Issue("error", "freshness", f"Prix le plus récent vieux de {age_days:.1f} jours (flux gelé ?).")
        )

    if previous_row_count and previous_row_count > 0:
        drop = 1 - len(events) / previous_row_count
        if drop > config.MAX_ROW_DROP:
            issues.append(
                Issue(
                    "error",
                    "row_drop",
                    f"Volume en baisse de {drop:.0%} ({previous_row_count} -> {len(events)} lignes).",
                )
            )
    return issues


def has_errors(issues: list[Issue]) -> bool:
    return any(i.level == "error" for i in issues)
