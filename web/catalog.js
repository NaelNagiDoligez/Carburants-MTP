// Catalogue de modèles courants pour pré-remplir le réservoir et la conso d'un véhicule.
// Valeurs indicatives (fiches constructeur, conso moyenne en usage mixte) : l'utilisateur les vérifie,
// les cases remplies automatiquement sont mises en évidence. `source` = valeur vérifiée sur une page citée.

export const CATALOG = [
  // ---- Motos et scooters ----
  { name: "CFMoto 450MT", aliases: ["450mt", "450 mt", "cfmoto 450"], gens: [{ from: 2024, tank: 17.5, conso: 4.5, source: "Le Repaire des Motards" }] },
  { name: "Yamaha MT-07", aliases: ["mt07", "mt 07"], gens: [{ from: 2014, tank: 14, conso: 4.2 }] },
  { name: "Yamaha MT-09", aliases: ["mt09", "mt 09"], gens: [{ from: 2013, to: 2020, tank: 14, conso: 5.4 }, { from: 2021, tank: 14, conso: 5.0 }] },
  { name: "Yamaha Tracer 7", aliases: ["tracer 7", "tracer7", "tracer 700"], gens: [{ from: 2016, tank: 17, conso: 4.3 }] },
  { name: "Yamaha Ténéré 700", aliases: ["tenere 700", "t7", "tenere"], gens: [{ from: 2019, tank: 16, conso: 4.3 }] },
  { name: "Yamaha XMAX 125", aliases: ["xmax 125", "x max 125", "xmax"], gens: [{ from: 2018, tank: 13, conso: 2.6 }] },
  { name: "Yamaha NMAX 125", aliases: ["nmax 125", "nmax"], gens: [{ from: 2015, tank: 7.1, conso: 2.2 }] },
  { name: "Honda CB500F", aliases: ["cb500f", "cb 500 f", "cb500"], gens: [{ from: 2013, tank: 17.1, conso: 3.6 }] },
  { name: "Honda NX500", aliases: ["nx500", "nx 500", "cb500x", "cb 500 x"], gens: [{ from: 2013, to: 2023, tank: 17.7, conso: 3.6 }, { from: 2024, tank: 17.5, conso: 3.6 }] },
  { name: "Honda NC750X", aliases: ["nc750x", "nc 750", "nc750"], gens: [{ from: 2016, tank: 14.1, conso: 3.5 }] },
  { name: "Honda Africa Twin", aliases: ["africa twin", "crf1100", "crf 1100"], gens: [{ from: 2020, tank: 18.8, conso: 4.9 }] },
  { name: "Honda CB125R", aliases: ["cb125r", "cb 125 r"], gens: [{ from: 2018, tank: 10.1, conso: 2.3 }] },
  { name: "Honda PCX 125", aliases: ["pcx 125", "pcx"], gens: [{ from: 2018, tank: 8.1, conso: 2.1 }] },
  { name: "Kawasaki Z650", aliases: ["z650", "z 650"], gens: [{ from: 2017, tank: 15, conso: 4.3 }] },
  { name: "Kawasaki Z900", aliases: ["z900", "z 900"], gens: [{ from: 2017, tank: 17, conso: 5.6 }] },
  { name: "Triumph Trident 660", aliases: ["trident 660", "trident"], gens: [{ from: 2021, tank: 14, conso: 4.6 }] },
  { name: "BMW R 1250 GS", aliases: ["r1250gs", "r 1250 gs", "1250 gs", "1250gs"], gens: [{ from: 2019, to: 2023, tank: 20, conso: 4.8 }] },
  { name: "BMW R 1300 GS", aliases: ["r1300gs", "r 1300 gs", "1300 gs", "1300gs"], gens: [{ from: 2024, tank: 19, conso: 4.8 }] },
  // ---- Voitures ----
  { name: "Renault Clio", aliases: ["clio"], gens: [{ from: 2012, to: 2019, tank: 45, conso: 5.5 }, { from: 2019, tank: 42, conso: 5.3 }] },
  { name: "Peugeot 208", aliases: ["208"], gens: [{ from: 2012, to: 2019, tank: 50, conso: 5.2 }, { from: 2019, tank: 44, conso: 5.4 }] },
  { name: "Peugeot 2008", aliases: ["2008"], gens: [{ from: 2019, tank: 44, conso: 5.8 }] },
  { name: "Peugeot 308", aliases: ["308"], gens: [{ from: 2021, tank: 52, conso: 5.6 }] },
  { name: "Dacia Sandero", aliases: ["sandero"], gens: [{ from: 2020, tank: 50, conso: 5.3 }] },
  { name: "Dacia Duster", aliases: ["duster"], gens: [{ from: 2018, to: 2024, tank: 50, conso: 6.2 }] },
  { name: "Citroën C3", aliases: ["c3"], gens: [{ from: 2016, to: 2023, tank: 45, conso: 5.3 }] },
  { name: "Renault Captur", aliases: ["captur"], gens: [{ from: 2019, tank: 48, conso: 6.0 }] },
  { name: "Volkswagen Golf", aliases: ["golf"], gens: [{ from: 2012, tank: 50, conso: 5.6 }] },
  { name: "Toyota Yaris hybride", aliases: ["yaris"], gens: [{ from: 2020, tank: 36, conso: 4.0 }] },
  { name: "Fiat 500", aliases: ["fiat 500", "500"], gens: [{ from: 2007, tank: 35, conso: 5.0 }] },
];

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Noms proposés dans la liste de saisie. */
export const catalogNames = () => CATALOG.map((m) => m.name);

/**
 * Reconnaît un modèle dans un nom libre (« ma MT-07 », « Clio de Papa ») et choisit la génération par l'année.
 * @returns {{name:string, tank:number, conso:number, from:number, to?:number, source?:string, yearUsed:boolean}|null}
 */
export function matchVehicle(text, year) {
  const t = ` ${norm(text)} `;
  if (!t.trim()) return null;
  let best = null;
  for (const m of CATALOG) {
    for (const key of [m.name, ...m.aliases]) {
      const k = norm(key);
      // mot entier, sans espaces ou avec : « mt07 » comme « mt 07 »
      const hit = t.includes(` ${k} `) || t.replace(/ /g, "").includes(k.replace(/ /g, "")) && k.replace(/ /g, "").length >= 4;
      if (hit && (!best || k.length > best.len)) best = { m, len: k.length };
    }
  }
  if (!best) return null;
  const y = Number(year);
  const gens = best.m.gens;
  const byYear = y ? gens.find((g) => y >= g.from && y <= (g.to ?? 9999)) : null;
  const g = byYear || gens[gens.length - 1];
  return { name: best.m.name, ...g, yearUsed: Boolean(byYear) };
}
