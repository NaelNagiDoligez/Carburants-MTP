"""Appli : où faire le plein autour de Montpellier, détour compris.

Lancer : streamlit run app/streamlit_app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# Rend le paquet importable sans `pip install -e .` (cas de Streamlit Community Cloud).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from carburants import analysis, config

FUEL_LABELS = {"e10": "SP95-E10", "sp95": "SP95", "sp98": "SP98", "gazole": "Gazole", "e85": "E85", "gplc": "GPLc"}
PLACES = {
    "Place de la Comédie": (43.6084, 3.8796),
    "Gare Saint-Roch": (43.6032, 3.8809),
    "Odysseum": (43.6046, 3.9186),
    "Campus Triolet": (43.6318, 3.8613),
    "Autre (saisir les coordonnées)": None,
}

st.set_page_config(page_title="Carburants Montpellier", page_icon="⛽", layout="wide")


@st.cache_data(ttl=600, show_spinner=False)
def get_tables():
    return analysis.load_tables(config.DATA_DIR)


events, stations = get_tables()
st.title("Où faire le plein autour de Montpellier")

if events.empty or stations.empty:
    st.info("Aucune donnée pour l'instant : lance d'abord `python -m carburants run`.")
    st.stop()

now = pd.Timestamp.now(tz="UTC")
coverage = analysis.fuel_coverage(events, now)

with st.sidebar:
    st.header("Ta recherche")
    fuel = st.selectbox(
        "Carburant",
        options=[f for f in FUEL_LABELS if f in coverage.index],
        format_func=lambda f: f"{FUEL_LABELS[f]} ({coverage.get(f, 0)} stations)",
    )
    place = st.selectbox("Point de départ", list(PLACES))
    if PLACES[place] is None:
        lat = st.number_input("Latitude", value=43.6084, format="%.4f")
        lon = st.number_input("Longitude", value=3.8796, format="%.4f")
        origin = (lat, lon)
    else:
        origin = PLACES[place]
    radius = st.slider("Rayon maximum (km, route)", 3, 40, 15)
    tank = st.number_input("Litres à mettre", 3.0, 80.0, 14.0, step=1.0)
    conso = st.number_input("Consommation (L/100 km)", 2.0, 15.0, 4.5, step=0.5)

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
    f"{events['station_id'].nunique()} stations suivies dans les départements {', '.join(config.DEPARTMENTS)}."
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
