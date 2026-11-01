import pandas as pd

from carburants import history


def _ev(sid, fuel, price, at, seen="2026-10-01"):
    return {"station_id": sid, "fuel": fuel, "price": price,
            "price_updated_at": pd.Timestamp(at, tz="UTC"), "first_seen_at": pd.Timestamp(seen, tz="UTC")}


def test_daily_median_uses_price_in_force_and_skips_small_samples():
    rows = [_ev(f"s{i}", "sp95", 2.0 + i / 1000, "2026-10-02 08:00") for i in range(10)]
    rows += [_ev(f"s{i}", "sp95", 1.9, "2026-10-04 08:00") for i in range(5)]  # la moitié baisse le 4
    rows += [_ev("x", "e85", 0.9, "2026-10-02 08:00")]  # trop peu de stations : ignoré
    med = history.daily_medians(pd.DataFrame(rows), end=pd.Timestamp("2026-10-04 20:00", tz="UTC"), days=3)
    sp = med[med["fuel"] == "sp95"].set_index("day")
    assert list(sp.index) == ["2026-10-02", "2026-10-03", "2026-10-04"]
    assert sp.loc["2026-10-02", "median"] == 2.0045 and sp.loc["2026-10-02", "n"] == 10
    assert sp.loc["2026-10-03", "median"] == 2.0045  # prix toujours en vigueur le lendemain
    assert sp.loc["2026-10-04", "median"] == 1.9525
    assert "e85" not in set(med["fuel"])


def test_days_before_collection_are_not_reconstructed():
    rows = [_ev(f"s{i}", "sp95", 2.0, "2026-09-20 08:00", seen="2026-10-03") for i in range(10)]
    med = history.daily_medians(pd.DataFrame(rows), end=pd.Timestamp("2026-10-04", tz="UTC"), days=10,
                                since=pd.Timestamp("2026-10-03", tz="UTC"))
    assert med["day"].min() == "2026-10-03"


def test_forecast_scenarios_bracket_the_trend_and_widen():
    fc = history.forecast([2.10, 2.09, 2.08, 2.07, 2.06, 2.05])
    assert fc["slope_per_day"] < 0
    assert all(lo < r < hi for lo, r, hi in zip(fc["low"], fc["real"], fc["high"]))
    assert (fc["high"][-1] - fc["low"][-1]) > (fc["high"][0] - fc["low"][0])
    assert history.forecast([2.0, 2.0]) is None
