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
    function seeds(x, y) {
      for (let i = 0; i < 4; i++) knot(x + u(-10, 10), y + u(-10, 10), u(0.9, 1.5), rand() < 0.66 ? "t-ochre knot-fill" : "t-coral knot-fill");
    }

    // Poids des motifs par saison : l'automne penche vers les brins feuillus et les chrysanthèmes.
    const kinds = ["daisy", "five", "tulip", "lav", "sprig", "wisp", "seeds"];
    const weights = { automne: [4, 2, 1, 1, 5, 2, 4], printemps: [3, 4, 4, 1, 4, 2, 2], ete: [2, 4, 1, 6, 3, 2, 2], hiver: [2, 1, 0, 1, 3, 5, 2] }[sea];
    const total = weights.reduce((a, b) => a + b, 0);
    const pick = () => { let r = rand() * total; for (let i = 0; i < kinds.length; i++) { r -= weights[i]; if (r < 0) return kinds[i]; } return "sprig"; };

    function motif(x, y, edge) {
      const rot = u(-35, 35) + edge;
      switch (pick()) {
        case "daisy": daisy(x, y, u(9, 14), u(0, 45), rand() < 0.66 ? "t-rose" : "t-lav", sea === "automne" ? 14 : 8); break;
        case "five": five(x, y, u(6.5, 9.5), u(0, 72)); break;
        case "tulip": tulip(x, y, u(7, 10), rot); break;
        case "lav": lavender(x, y, u(34, 56), rot); break;
        case "sprig": sprig(x, y, u(34, 64), rot, Math.floor(u(4, 8)), u(-0.25, 0.25)); break;
        case "wisp": wisp(x, y, u(10, 17), u(1.2, 1.7), u(0, 360), rand() < 0.5 ? "t-sky w1 stitch" : "t-lav w1 stitch"); break;
        default: seeds(x, y);
      }
    }

    // Semis le long des bords et du bas : le centre reste calme.
    const accept = (x, y) => Math.max(Math.max(0, 1 - Math.min(x, W - x) / 62), Math.max(0, 1 - (H - y) / 130) * 0.9) ** 1.1;
    const pts = [];
    for (let i = 0; i < 4000 && pts.length < 58; i++) {
      const x = u(-8, W + 8), y = u(-8, H + 8), p = accept(x, y);
      if (p <= 0 || rand() > p || pts.some(([px, py]) => (x - px) ** 2 + (y - py) ** 2 < 34 * 34)) continue;
      pts.push([x, y]);
    }
    pts.forEach(([x, y]) => motif(x, y, x < W / 2 ? 18 : -18));
    return `<svg class="garden" data-season="${sea}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g class="stitches">${out.join("")}</g></svg>`;
  }

  function plant(forceSeason) {
    const old = document.querySelector(".garden");
    const sea = forceSeason || season();
    const seed = (Math.random() * 4294967296) >>> 0;
    const html = draw(seed, sea);
    if (old) old.remove();
    document.body.insertAdjacentHTML("afterbegin", html);
  }

  window.garden = { plant, season, draw };
  plant();
})();
