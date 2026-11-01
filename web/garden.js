// Fond brodé « jardin » : dessiné à chaque ouverture, aux couleurs de la saison.
// Même vocabulaire que le bouquet (classes t-*, w*, satin, knot). Pas de dépendance.
(() => {
  const W = 390, H = 844, F = (v) => v.toFixed(1);
  const rad = (d) => (d * Math.PI) / 180;

  function season(d = new Date()) {
    const m = d.getMonth(); // 0 = janvier
    return m >= 2 && m <= 4 ? "printemps" : m >= 5 && m <= 7 ? "ete" : m >= 8 && m <= 10 ? "automne" : "hiver";
  }

  function rng(seed) { // mulberry32
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function draw(seed, sea) {
    const rand = rng(seed);
    const u = (a, b) => a + (b - a) * rand();
    const wob = (v, a = 0.9) => v + u(-a, a);
    const out = [];
    const path = (d, cls) => out.push(`<path class="${cls}" d="${d}"/>`);
    const knot = (x, y, r, cls = "t-ochre knot-fill") => out.push(`<circle class="${cls}" cx="${F(x)}" cy="${F(y)}" r="${F(r)}"/>`);

    function petal(cx, cy, ang, len, wid, cls, bend = 0) {
      const a = rad(ang), c = Math.cos(a), s = Math.sin(a);
      const T = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
      const p0 = T(0, 0), tip = T(bend * len, -len);
      const c1 = T(wid * 1.1, -len * 0.25), c2 = T(wid * 0.7 + bend * len, -len * 0.85);
      const c3 = T(-wid * 0.7 + bend * len, -len * 0.85), c4 = T(-wid * 1.1, -len * 0.25);
      const P = (p) => `${F(wob(p[0]))} ${F(wob(p[1]))}`;
      path(`M${F(p0[0])} ${F(p0[1])}C${P(c1)} ${P(c2)} ${F(tip[0])} ${F(tip[1])}C${P(c3)} ${P(c4)} ${F(p0[0])} ${F(p0[1])}Z`, cls);
    }
    const quad = (x, y, ex, ey, mx, my, t) => [(1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * ey];

    function daisy(x, y, s, rot, color, n = 8) {
      for (let k = 0; k < n; k++) petal(x, y, rot + (k * 360) / n + u(-5, 5), s, s * 0.3, `${color} w12`);
      knot(x, y, s * 0.22);
      for (let k = 0; k < 6; k++) knot(x + s * 0.42 * Math.cos((k * Math.PI) / 3), y + s * 0.42 * Math.sin((k * Math.PI) / 3), 0.9);
    }
    function five(x, y, s, rot, color = "t-coral") {
      for (let k = 0; k < 5; k++) petal(x, y, rot + k * 72 + u(-6, 6), s * 1.25, s * 0.55, `${color} w12`);
      knot(x, y, s * 0.26);
    }
    function tulip(x, y, s, rot) {
      path(`M${F(x)} ${F(y)}C${F(x + 3)} ${F(y + s)} ${F(x - 2)} ${F(y + s * 1.8)} ${F(x + 1)} ${F(y + s * 2.6)}`, "t-sage w15");
      petal(x, y, rot - 24, s * 1.3, s * 0.45, "t-rose w12");
      petal(x, y, rot + 24, s * 1.3, s * 0.45, "t-rose w12");
      petal(x, y, rot, s * 1.5, s * 0.5, "t-rose w15 satin-rose");
    }
    function lavender(x, y, len, rot) {
      const a = rad(rot), ex = x + len * Math.sin(a), ey = y - len * Math.cos(a);
      const mx = (x + ex) / 2 + len * 0.12 * Math.cos(a), my = (y + ey) / 2 + len * 0.12 * Math.sin(a);
      path(`M${F(x)} ${F(y)}Q${F(mx)} ${F(my)} ${F(ex)} ${F(ey)}`, "t-lav w15");
      for (let i = 3; i <= 10; i++) {
        const [bx, by] = quad(x, y, ex, ey, mx, my, i / 10);
        for (const side of [-1, 1]) {
          const cx = bx + side * 3.4 * Math.cos(a), cy = by + side * 3.4 * Math.sin(a);
          out.push(`<ellipse class="t-lav w12 knot" cx="${F(cx)}" cy="${F(cy)}" rx="2.4" ry="3.6" transform="rotate(${F(rot + side * 24)} ${F(cx)} ${F(cy)})"/>`);
        }
      }
    }
    function sprig(x, y, len, rot, leaves, curve) {
      const a = rad(rot), ex = x + len * Math.sin(a), ey = y - len * Math.cos(a);
      const mx = (x + ex) / 2 + len * curve * Math.cos(a), my = (y + ey) / 2 + len * curve * Math.sin(a);
      path(`M${F(x)} ${F(y)}Q${F(mx)} ${F(my)} ${F(ex)} ${F(ey)}`, "t-sage w12");
      for (let i = 1; i <= leaves; i++) {
        const t = i / (leaves + 1), [bx, by] = quad(x, y, ex, ey, mx, my, t), L = len * 0.26 * (1 - t * 0.45);
        petal(bx, by, rot + (i % 2 ? 58 : -58), L, L * 0.36, "t-sage w1 satin", 0.06);
      }
      petal(ex, ey, rot, len * 0.2, len * 0.07, "t-sage w1 satin");
    }
    function wisp(x, y, r, turns, rot, cls) {
      const n = Math.floor(26 * turns), pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, ang = rad(rot) + t * turns * 2 * Math.PI, rr = r * (1 - 0.78 * t);
        pts.push(`${F(x + rr * Math.cos(ang))} ${F(y + rr * Math.sin(ang))}`);
      }
      path("M" + pts.join(" L"), cls);
    }
    // ---- Motifs de saison ----
    function holly(x, y, s, rot) { // hiver : deux feuilles de houx et trois baies
      for (const side of [-1, 1]) {
        const a = rot + side * 38, ar = rad(a), len = s * 1.9;
        const pts = [];
        for (let i = 0; i <= 6; i++) { // feuille dentelée : zigzag le long de la nervure
          const t = i / 6, w = Math.sin(t * Math.PI) * s * 0.55 * (i % 2 ? 1.25 : 0.8);
          pts.push([t * len, w]);
        }
        const back = pts.map(([px, py]) => [px, -py]).reverse();
        const P = ([px, py]) => `${F(x + px * Math.sin(ar) + py * Math.cos(ar))} ${F(y - px * Math.cos(ar) + py * Math.sin(ar))}`;
        path(`M${[...pts, ...back].map(P).join(" L")}Z`, "t-sage w12 satin");
        path(`M${P([0, 0])} L${P([len, 0])}`, "t-sage w1");
      }
      for (let k = 0; k < 3; k++) knot(x + u(-5, 5), y + u(-2, 6), s * 0.24, "t-rose berry");
    }
    function snow(x, y, r) { // hiver : flocon au point lancé, six branches
      const rot = u(0, 60);
      for (let k = 0; k < 6; k++) {
        const a = rad(rot + k * 60), ex = x + r * Math.cos(a), ey = y + r * Math.sin(a);
        path(`M${F(x)} ${F(y)}L${F(ex)} ${F(ey)}`, "t-sky w12 stitch");
        const mx = x + r * 0.6 * Math.cos(a), my = y + r * 0.6 * Math.sin(a);
        for (const side of [-1, 1]) {
          const b = a + side * rad(40);
          path(`M${F(mx)} ${F(my)}L${F(mx + r * 0.32 * Math.cos(b))} ${F(my + r * 0.32 * Math.sin(b))}`, "t-sky w1");
        }
      }
      knot(x, y, 1.6, "t-sky knot-fill");
    }
    function poppy(x, y, s, rot) { // été : coquelicot, quatre grands pétales et un cœur sombre
      for (let k = 0; k < 4; k++) petal(x, y, rot + k * 90 + u(-8, 8), s * 1.3, s * 0.95, `t-coral w12${k % 2 ? "" : " satin-rose"}`);
      knot(x, y, s * 0.3, "t-ink knot-fill");
      for (let k = 0; k < 5; k++) knot(x + s * 0.45 * Math.cos(k * 1.26), y + s * 0.45 * Math.sin(k * 1.26), 0.9, "t-ink knot-fill");
    }
    function sunflower(x, y, s, rot) { // été : tournesol, couronne de pétales ocre et cœur au point de nœud
      for (let k = 0; k < 16; k++) petal(x, y, rot + k * 22.5 + u(-4, 4), s * 1.1, s * 0.26, "t-ochre w12");
      knot(x, y, s * 0.42, "t-umber knot-fill");
      for (let k = 0; k < 8; k++) knot(x + s * 0.25 * Math.cos(k * 0.785), y + s * 0.25 * Math.sin(k * 0.785), 0.8, "t-ochre knot-fill");
    }
    function olive(x, y, len, rot) { // été et automne : rameau d'olivier, feuilles fines et deux olives
      const a = rad(rot), ex = x + len * Math.sin(a), ey = y - len * Math.cos(a);
      const mx = (x + ex) / 2 + len * 0.1 * Math.cos(a), my = (y + ey) / 2 + len * 0.1 * Math.sin(a);
      path(`M${F(x)} ${F(y)}Q${F(mx)} ${F(my)} ${F(ex)} ${F(ey)}`, "t-sage w12");
      for (let i = 1; i <= 6; i++) {
        const [bx, by] = quad(x, y, ex, ey, mx, my, i / 7);
        petal(bx, by, rot + (i % 2 ? 50 : -50), len * 0.22, len * 0.035, "t-sage w1 satin");
      }
      for (const t of [0.35, 0.6]) {
        const [bx, by] = quad(x, y, ex, ey, mx, my, t);
        out.push(`<ellipse class="t-lav olive" cx="${F(bx + 5)}" cy="${F(by + 3)}" rx="2.6" ry="3.8" transform="rotate(${F(rot + 30)} ${F(bx + 5)} ${F(by + 3)})"/>`);
      }
    }
    function blossom(x, y, len, rot) { // printemps : branche d'amandier en fleurs
      const a = rad(rot), ex = x + len * Math.sin(a), ey = y - len * Math.cos(a);
      const mx = (x + ex) / 2 - len * 0.15 * Math.cos(a), my = (y + ey) / 2 - len * 0.15 * Math.sin(a);
      path(`M${F(x)} ${F(y)}Q${F(mx)} ${F(my)} ${F(ex)} ${F(ey)}`, "t-umber w15");
      for (const t of [0.4, 0.7, 1]) {
        const [bx, by] = quad(x, y, ex, ey, mx, my, t), r = u(4.5, 6.5);
        for (let k = 0; k < 5; k++) petal(bx, by, k * 72 + u(0, 20), r, r * 0.75, "t-rose w1");
        knot(bx, by, 1.3);
      }
    }
    function leaf(x, y, s, rot) { // automne : feuille qui tombe, nervures au point de tige
      petal(x, y, rot, s * 1.6, s * 0.7, "t-coral w12 satin", u(-0.15, 0.15));
      const a = rad(rot);
      path(`M${F(x)} ${F(y)}L${F(x + s * 1.5 * Math.sin(a))} ${F(y - s * 1.5 * Math.cos(a))}`, "t-coral w1");
      path(`M${F(x - s * 0.3 * Math.sin(a))} ${F(y + s * 0.3 * Math.cos(a))}l${F(-s * 0.25 * Math.sin(a))} ${F(s * 0.25 * Math.cos(a))}`, "t-sage w1");
    }
    function seeds(x, y) {
      for (let i = 0; i < 4; i++) knot(x + u(-10, 10), y + u(-10, 10), u(0.9, 1.5), rand() < 0.66 ? "t-ochre knot-fill" : "t-coral knot-fill");
    }

    // Poids des motifs par saison : chaque saison a ses fleurs, le reste du vocabulaire fait le lien.
    const kinds = ["daisy", "five", "tulip", "lav", "sprig", "wisp", "seeds", "holly", "snow", "poppy", "sunflower", "olive", "blossom", "leaf"];
    const weights = {
      //          daisy five tulip lav sprig wisp seeds holly snow poppy sun olive blossom leaf
      printemps: [3, 3, 5, 1, 3, 2, 2, 0, 0, 1, 0, 0, 5, 0],
      ete: [1, 2, 0, 5, 2, 1, 2, 0, 0, 4, 3, 3, 0, 0],
      automne: [4, 1, 0, 1, 4, 2, 3, 0, 0, 0, 0, 3, 0, 5],
      hiver: [1, 0, 0, 0, 3, 3, 2, 5, 4, 0, 0, 1, 0, 0],
    }[sea];
    const total = weights.reduce((a, b) => a + b, 0);
    const pick = () => { let r = rand() * total; for (let i = 0; i < kinds.length; i++) { r -= weights[i]; if (r < 0) return kinds[i]; } return "sprig"; };

    function motif(x, y, edge) {
      const rot = u(-35, 35) + edge;
      switch (pick()) {
        case "daisy": daisy(x, y, u(12, 18), u(0, 45), rand() < 0.66 ? "t-rose" : "t-lav", sea === "automne" ? 14 : 8); break;
        case "five": five(x, y, u(8.5, 12.5), u(0, 72)); break;
        case "tulip": tulip(x, y, u(9, 13), rot); break;
        case "lav": lavender(x, y, u(44, 70), rot); break;
        case "sprig": sprig(x, y, u(44, 80), rot, Math.floor(u(4, 8)), u(-0.25, 0.25)); break;
        case "wisp": wisp(x, y, u(13, 22), u(1.2, 1.7), u(0, 360), rand() < 0.5 ? "t-sky w1 stitch" : "t-lav w1 stitch"); break;
        case "holly": holly(x, y, u(9, 12), rot); break;
        case "snow": snow(x, y, u(9, 14)); break;
        case "poppy": poppy(x, y, u(9, 12), u(0, 90)); break;
        case "sunflower": sunflower(x, y, u(11, 15), u(0, 22)); break;
        case "olive": olive(x, y, u(50, 76), rot); break;
        case "blossom": blossom(x, y, u(50, 78), rot); break;
        case "leaf": leaf(x, y, u(9, 13), u(0, 360)); break;
        default: seeds(x, y);
      }
    }

    // Semis le long des bords et du bas : le centre reste calme.
    const accept = (x, y) => Math.max(Math.max(0, 1 - Math.min(x, W - x) / 62), Math.max(0, 1 - (H - y) / 130) * 0.9) ** 1.1;
    const pts = [];
    for (let i = 0; i < 4000 && pts.length < 30; i++) {
      const x = u(-8, W + 8), y = u(-8, H + 8), p = y < 130 ? 0 : accept(x, y); // rien sous le logo et l'en-tête
      if (p <= 0 || rand() > p || pts.some(([px, py]) => (x - px) ** 2 + (y - py) ** 2 < 48 * 48)) continue;
      pts.push([x, y]);
    }
    pts.forEach(([x, y]) => motif(x, y, x < W / 2 ? 18 : -18));
    return `<svg class="garden" data-season="${sea}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g class="stitches">${out.join("")}</g></svg>`;
  }

  const SEASONS = ["printemps", "ete", "automne", "hiver"];
  function plant(forceSeason) {
    const old = document.querySelector(".garden");
    const asked = new URLSearchParams(location.search).get("saison"); // aperçu : ?saison=hiver
    const sea = forceSeason || (SEASONS.includes(asked) ? asked : season());
    const seed = (Math.random() * 4294967296) >>> 0;
    const html = draw(seed, sea);
    if (old) old.remove();
    document.body.insertAdjacentHTML("afterbegin", html);
  }

  window.garden = { plant, season, draw };
  plant();
})();
