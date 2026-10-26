"""Génère le fond brodé « jardin » de Plein Sud : fleurs, brins et feuilles semés sur la toile.

Usage : python tools/garden.py lisiere|semis > web/art/garden.svg.html
Même vocabulaire que le bouquet (classes t-*, w*, satin, knot) : les couleurs viennent du CSS.
"""
import math, random, sys

W, H = 390, 844
F = lambda v: f"{v:.1f}"


class Garden:
    def __init__(self, seed):
        self.r = random.Random(seed)
        self.out = []

    def wob(self, v, a=0.9):
        return v + self.r.uniform(-a, a)

    def path(self, d, cls):
        self.out.append(f'<path class="{cls}" d="{d}"/>')

    def petal(self, cx, cy, ang, length, width, cls, bend=0.0):
        a = math.radians(ang)
        T = lambda x, y: (cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a))
        p0 = T(0, 0); tip = T(bend * length, -length)
        c1 = T(width * 1.1, -length * .25); c2 = T(width * .7 + bend * length, -length * .85)
        c3 = T(-width * .7 + bend * length, -length * .85); c4 = T(-width * 1.1, -length * .25)
        w = self.wob
        d = (f"M{F(p0[0])} {F(p0[1])}C{F(w(c1[0]))} {F(w(c1[1]))} {F(w(c2[0]))} {F(w(c2[1]))} {F(tip[0])} {F(tip[1])}"
             f"C{F(w(c3[0]))} {F(w(c3[1]))} {F(w(c4[0]))} {F(w(c4[1]))} {F(p0[0])} {F(p0[1])}Z")
        self.path(d, cls)
        return tip

    def knot(self, x, y, r, cls="t-ochre knot-fill"):
        self.out.append(f'<circle class="{cls}" cx="{F(x)}" cy="{F(y)}" r="{F(r)}"/>')

    # --- motifs -------------------------------------------------------------
    def daisy(self, x, y, s, rot=0, color="t-rose", n=8):
        for k in range(n):
            self.petal(x, y, rot + k * 360 / n + self.r.uniform(-5, 5), s, s * .30, f"{color} w12")
        self.knot(x, y, s * .22)
        for k in range(6):
            a = k * math.pi / 3
            self.knot(x + s * .42 * math.cos(a), y + s * .42 * math.sin(a), .9, "t-ochre knot-fill")

    def five(self, x, y, s, rot=0, color="t-coral"):
        for k in range(5):
            self.petal(x, y, rot + k * 72 + self.r.uniform(-6, 6), s * 1.25, s * .55, f"{color} w12")
        self.knot(x, y, s * .26)

    def tulip(self, x, y, s, rot=0, color="t-rose"):
        self.path(f"M{F(x)} {F(y)}C{F(x + 3)} {F(y + s)} {F(x - 2)} {F(y + s * 1.8)} {F(x + 1)} {F(y + s * 2.6)}", "t-sage w15")
        self.petal(x, y, rot - 24, s * 1.3, s * .45, f"{color} w12")
        self.petal(x, y, rot + 24, s * 1.3, s * .45, f"{color} w12")
        self.petal(x, y, rot, s * 1.5, s * .5, f"{color} w15 satin-rose")

    def lavender(self, x, y, length, rot):
        a = math.radians(rot)
        ex, ey = x + length * math.sin(a), y - length * math.cos(a)
        mx, my = (x + ex) / 2 + length * .12 * math.cos(a), (y + ey) / 2 + length * .12 * math.sin(a)
        self.path(f"M{F(x)} {F(y)}Q{F(mx)} {F(my)} {F(ex)} {F(ey)}", "t-lav w15")
        for i in range(3, 11):
            t = i / 10
            bx = (1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * ex
            by = (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * ey
            for side in (-1, 1):
                cx, cy = bx + side * 3.4 * math.cos(a), by + side * 3.4 * math.sin(a)
                self.out.append(f'<ellipse class="t-lav w12 knot" cx="{F(cx)}" cy="{F(cy)}" rx="2.4" ry="3.6" '
                                f'transform="rotate({F(rot + side * 24)} {F(cx)} {F(cy)})"/>')

    def sprig(self, x, y, length, rot, leaves=5, curve=.2):
        a = math.radians(rot)
        ex, ey = x + length * math.sin(a), y - length * math.cos(a)
        mx, my = (x + ex) / 2 + length * curve * math.cos(a), (y + ey) / 2 + length * curve * math.sin(a)
        self.path(f"M{F(x)} {F(y)}Q{F(mx)} {F(my)} {F(ex)} {F(ey)}", "t-sage w12")
        for i in range(1, leaves + 1):
            t = i / (leaves + 1)
            bx = (1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * ex
            by = (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * ey
            side = 1 if i % 2 else -1
            L = length * .26 * (1 - t * .45)
            self.petal(bx, by, rot + side * 58, L, L * .36, "t-sage w1 satin", bend=.06)
        self.petal(ex, ey, rot, length * .2, length * .07, "t-sage w1 satin")

    def wisp(self, x, y, r, turns=1.4, rot=0, cls="t-sky w1 stitch"):
        pts = []; n = int(26 * turns)
        for i in range(n + 1):
            t = i / n; ang = math.radians(rot) + t * turns * 2 * math.pi
            rr = r * (1 - .78 * t)
            pts.append((x + rr * math.cos(ang), y + rr * math.sin(ang)))
        self.path("M" + " L".join(f"{F(px)} {F(py)}" for px, py in pts), cls)

    def seeds(self, x, y, n=4, spread=10):
        for _ in range(n):
            self.knot(x + self.r.uniform(-spread, spread), y + self.r.uniform(-spread, spread), self.r.uniform(.9, 1.5),
                      self.r.choice(["t-ochre knot-fill", "t-ochre knot-fill", "t-coral knot-fill"]))

    def random_motif(self, x, y, edge_dir=0):
        r = self.r
        kind = r.choices(["daisy", "five", "tulip", "lav", "sprig", "wisp", "seeds"],
                         [3, 3, 2, 3, 4, 2, 3])[0]
        rot = r.uniform(-35, 35) + edge_dir
        if kind == "daisy": self.daisy(x, y, r.uniform(9, 14), r.uniform(0, 45), r.choice(["t-rose", "t-rose", "t-lav"]))
        elif kind == "five": self.five(x, y, r.uniform(6.5, 9.5), r.uniform(0, 72))
        elif kind == "tulip": self.tulip(x, y, r.uniform(7, 10), rot)
        elif kind == "lav": self.lavender(x, y, r.uniform(34, 56), rot)
        elif kind == "sprig": self.sprig(x, y, r.uniform(34, 64), rot, leaves=r.randint(4, 7), curve=r.uniform(-.25, .25))
        elif kind == "wisp": self.wisp(x, y, r.uniform(10, 17), r.uniform(1.2, 1.7), r.uniform(0, 360), r.choice(["t-sky w1 stitch", "t-lav w1 stitch"]))
        else: self.seeds(x, y)

    def svg(self, cls):
        return (f'<svg class="garden {cls}" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">'
                '<g class="stitches">' + "".join(self.out) + '</g></svg>')


def scatter(g, accept, count, min_gap, tries=4000):
    pts = []
    for _ in range(tries):
        if len(pts) >= count: break
        x, y = g.r.uniform(-8, W + 8), g.r.uniform(-8, H + 8)
        p = accept(x, y)
        if p <= 0 or g.r.random() > p: continue
        if any((x - px) ** 2 + (y - py) ** 2 < min_gap ** 2 for px, py in pts): continue
        pts.append((x, y))
    return pts


def lisiere():
    """Les fleurs poussent le long des bords et du bas, le centre reste calme."""
    g = Garden(11)
    def accept(x, y):
        d = min(x, W - x)                      # distance au bord latéral
        side = max(0, 1 - d / 62)              # 1 au bord, 0 à 62 px
        bottom = max(0, 1 - (H - y) / 130) * .9
        return max(side, bottom) ** 1.1
    for x, y in scatter(g, accept, 58, 34):
        g.random_motif(x, y, edge_dir=(18 if x < W / 2 else -18))
    return g.svg("garden-lisiere")


def semis():
    """Semis léger sur toute la toile, comme les petites fleurs d'un t-shirt."""
    g = Garden(23)
    for x, y in scatter(g, lambda x, y: 1, 86, 44):
        g.random_motif(x, y)
    return g.svg("garden-semis")


if __name__ == "__main__":
    print({"lisiere": lisiere, "semis": semis}[sys.argv[1]]())
