#!/usr/bin/env python3
"""SIG · ráster de claves para planos ESCANEADOS (programas parciales en imagen).

1) Limpia bordes y deja solo letras (componentes chicos oscuros) y corre OCR (tesseract) por bloques.
2) Arma etiquetas "USO densidad" (p. ej. "HC 6/25", "H 4/30/150").
3) Agrupa los colores de relleno (k-means) dentro del polígono del programa.
4) Cada pixel toma la etiqueta más cercana de su mismo color. Confianza 1 si la etiqueta está cerca
   (mismo predio/manzana, < 60 m), 3 si está lejos.
5) Escribe el PNG de claves alineado a UTM (mismo formato que el SIG Edomex) y su ficha JSON.

Uso: cls_ocr.py plano.jpg georef.json mascara.png crop x0,y0,x1,y1 salida_dir id "Nombre" "Alcaldía" [m_por_px]
mascara.png: la hoja ya recortada al polígono (tools/sig/cdmx_hojas.py), mismo crop.
"""
import sys, json, re, subprocess, tempfile, os, numpy as np, cv2
from PIL import Image
from sklearn.cluster import MiniBatchKMeans
Image.MAX_IMAGE_PIXELS = None
img, gj, maskp, crop, outdir, sid, name, muni = sys.argv[1:9]
res = float(sys.argv[9]) if len(sys.argv) > 9 else 2.0
x0, y0, x1, y1 = map(int, crop.split(","))
rgb = np.asarray(Image.open(img).convert("RGB"))[y0:y1, x0:x1]
H0, W0 = rgb.shape[:2]
g = json.load(open(gj)); A = np.vstack([np.array(g["A"]), [0, 0, 1]])           # UTM -> full plan px
A = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ A                            # UTM -> crop px
mpp = g["m_per_px"]
mk = np.asarray(Image.open(maskp))[..., 3]
mk = cv2.resize(mk, (W0, H0), interpolation=cv2.INTER_NEAREST) > 127

# ---------- OCR
gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
dark = (gray < 95).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(dark, 8)
hmin, hmax = max(6, int(1.2 / mpp)), min(140, int(45 / mpp))                                  # glyphs ~1.5–12 m tall on the ground
keep = np.zeros(n, bool)
for i in range(1, n):
    x, y, w, h, ar = st[i]
    if hmin <= h <= hmax and w <= 1.4 * hmax and ar > hmin and ar / (w * h) < .85:
        keep[i] = True
clean = np.where(keep[lab] & mk, 0, 255).astype(np.uint8)
toks = []
T = 2400
with tempfile.TemporaryDirectory() as td:
    for ty in range(0, H0, T - 200):
        for tx in range(0, W0, T - 200):
            t = clean[ty:ty + T, tx:tx + T]
            if t.min() == 255:
                continue
            f = os.path.join(td, "t.png"); Image.fromarray(t).save(f)
            o = subprocess.run(["tesseract", f, "-", "--psm", "11", "tsv"], capture_output=True, text=True).stdout
            for l in o.splitlines()[1:]:
                c = l.split("\t")
                if len(c) < 12 or not c[11].strip() or float(c[10]) < 50:
                    continue
                toks.append((c[11].strip(), tx + int(c[6]), ty + int(c[7]), int(c[8]), int(c[9])))
# dedupe overlap
seen, T2 = set(), []
for t in toks:
    k = (t[0], t[1] // 20, t[2] // 20)
    if k not in seen: seen.add(k); T2.append(t)
toks = T2
fix = {"O1": "10", "Il": "11", "l": "1", "I": "1", "o": "0", "O": "0"}
UW = re.compile(r"^(H|HC|HO|HM|HS|HCS|E|EA|CB|I|AV)$")
DW = re.compile(r"^(\d{1,2}|\*)?/\d{1,3}m?\*?(/[A-Z0-9]{1,4}[mM]?\*?)?$")
CW = re.compile(r"^(HCS|HC|HO|HM|HS|CB|EA|AV|H|E|I)(\d{0,2}/\d{1,3}m?\*?(/[A-Z0-9]{1,4}[mM]?\*?)?)$")
def normd(s):
    s = s.replace("O", "0").replace("o", "0").replace("l", "1").replace("I", "1")
    return s
labels = []
for t in toks:                                                  # use and density read as one token: "H/15m", "HC6/25"
    m = CW.match(t[0])
    if m: labels.append((f"{m.group(1)} {normd(m.group(2))}".replace(" /", "/"), t[1] + t[3] / 2, t[2] + t[4] / 2))
uses = [t for t in toks if UW.match(t[0])]
dens = [t for t in toks if DW.match(normd(t[0]))]
used = set()
for u in uses:
    ux, uy, uw, uh = u[1:]
    best, bd = None, 1e9
    for j, d in enumerate(dens):
        dx, dy = d[1] - (ux + uw), d[2] - uy
        right = -uh < dx < 2.5 * uh and abs(dy) < .6 * uh                     # "HC 6/25"
        below = 0 < d[2] - (uy + uh) < 1.6 * uh and abs((d[1] + d[3] / 2) - (ux + uw / 2)) < 2.5 * uh   # stacked
        if right or below:
            dd = abs(dx) + abs(dy)
            if dd < bd: best, bd = j, dd
    if best is not None:
        d = dens[best]; used.add(best)
        cx = (min(ux, d[1]) + max(ux + uw, d[1] + d[3])) / 2; cy = (min(uy, d[2]) + max(uy + uh, d[2] + d[4])) / 2
        dd_ = normd(d[0]); labels.append((f"{u[0]}{dd_}" if dd_.startswith("/") else f"{u[0]} {dd_}", cx, cy))
    elif u[0] in ("E", "EA", "AV"):
        labels.append((u[0], ux + uw / 2, uy + uh / 2))
print(sid, "tokens", len(toks), "etiquetas", len(labels), file=sys.stderr)

# ---------- colours of the zones
f = .25
sm = cv2.resize(rgb, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
smk = cv2.resize(mk.astype(np.uint8), (sm.shape[1], sm.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
hsv = cv2.cvtColor(sm, cv2.COLOR_RGB2HSV)
fill = smk & (hsv[..., 2] > 110) & ~((hsv[..., 1] < 10) & (hsv[..., 2] > 246))     # everything but white streets (keeps pale hatches)
lab_ = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
km = MiniBatchKMeans(n_clusters=18, random_state=0, n_init=3, batch_size=4096).fit(lab_[fill.reshape(-1)][::7])
cl = km.predict(lab_).reshape(sm.shape[:2]); cl[~fill] = -1
# label colour = mode of cluster ids in a ring around it
HUE = cv2.cvtColor(km.cluster_centers_.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2RGB)
HUE = cv2.cvtColor(HUE, cv2.COLOR_RGB2HSV)[0]                    # per cluster (h, s, v)
def kind(c):
    h, s_, v = HUE[c]
    if s_ > 15 and 35 <= h < 90: return "green"
    if s_ > 15 and 90 <= h < 135: return "blue"
    return "other"
def colour_at(x, y, use):
    X, Y = int(x * f), int(y * f); r = max(3, int(6 / mpp * f))
    w = cl[max(0, Y - r):Y + r + 1, max(0, X - r):X + r + 1].ravel(); w = w[w >= 0]
    want = "green" if use in ("EA", "AV") else "blue" if use == "E" else "other"
    w = np.array([c for c in w if kind(c) == want], int)
    return int(np.bincount(w).argmax()) if len(w) else -1
L = [(t, x * f, y * f, colour_at(x, y, t.split(" ")[0].split("/")[0])) for t, x, y in labels]
L = [l for l in L if l[3] >= 0]
def valid(c):                                                    # plausible SEDUVI clave
    m = re.match(r"^[A-Z]+ ?(\d{1,2}|\*)?/(\d{1,3})m?\*?(?:/(.+))?$", c)
    if not m: return c in ("E", "EA", "AV")
    if not m.group(1) or m.group(1) == "*": return False                        # niveles must be readable
    if not 1 <= int(m.group(1)) <= 25: return False                          # OCR: taller claves are almost always misreads
    if "/" in c[:6] and not c.split("/")[0].strip().isalpha() and int(m.group(2)) not in (15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80): return False
    t = m.group(3)
    return t is None or bool(re.match(r"^([A-Z]{1,2}|\d{2,4}|\d{1,2}[mM])\*?$", t))
L = [l for l in L if valid(l[0])]
# drop likely misreads: a clave seen once whose colour already has a well-attested clave
from collections import Counter
cnt = Counter(l[0] for l in L); bycol = {}
for l in L: bycol.setdefault(l[3], Counter())[l[0]] += 1
L = [l for l in L if cnt[l[0]] > 1 or l[0] in ("E", "EA", "AV")]               # an OCR clave must be read at least twice
claves = sorted({l[0] for l in L}); cid = {c: i + 1 for i, c in enumerate(claves)}
V = np.zeros(cl.shape, np.int32); D = np.full(cl.shape, 1e9, np.float32)
for c in range(18):
    Lc = [l for l in L if l[3] == c]
    sel = cl == c
    if not Lc or not sel.any():
        continue
    seeds = np.ones(cl.shape, np.uint8)
    for l in Lc: seeds[int(l[2]), int(l[1])] = 0
    dist, idx = cv2.distanceTransformWithLabels(seeds, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(seeds == 0); own = np.zeros(idx.max() + 1, np.int32)
    for y, x in zip(ys, xs):
        j = min(range(len(Lc)), key=lambda j: (Lc[j][1] - x) ** 2 + (Lc[j][2] - y) ** 2); own[idx[y, x]] = cid[Lc[j][0]]
    V[sel] = own[idx[sel]]; D[sel] = dist[sel]
F = np.where(V > 0, np.where(D * mpp / f < 60, 1, 3), 0).astype(np.uint8)
# ---------- warp to a UTM-aligned grid
Ai = np.linalg.inv(A); cs = np.array([[0, 0, 1], [W0, 0, 1], [0, H0, 1], [W0, H0, 1]]) @ Ai.T
E0, N0 = np.floor(cs[:, :2].min(0) / 10) * 10; E1, N1 = np.ceil(cs[:, :2].max(0) / 10) * 10
W, H = int((E1 - E0) / res), int((N1 - N0) / res)
G2U = np.array([[res, 0, E0], [0, -res, N1], [0, 0, 1]])
M = (np.diag([f, f, 1]) @ A @ G2U)[:2].astype(np.float32)                         # grid px -> small plan px
mx, my = cv2.invertAffineTransform(cv2.invertAffineTransform(M)), None
Vw = cv2.warpAffine(V.astype(np.float32), M, (W, H), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP, borderValue=0).astype(np.int32)
Fw = cv2.warpAffine(F, M, (W, H), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP, borderValue=0)
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., 0] = Vw & 255; rgba[..., 1] = Vw >> 8; rgba[..., 2] = Fw; rgba[..., 3] = 255
Image.fromarray(rgba, "RGBA").save(f"{outdir}/{sid}_cls.png", optimize=True)
entry = {"c": sid, "muni": muni, "n": name, "g": 0, "E0": float(E0), "N0": float(N1), "E1": float(E1), "N1": float(N0),
         "w": W, "h": H, "cw": W, "ch": H, "claves": claves, "k": []}
json.dump(entry, open(f"{outdir}/{sid}_cls.json", "w"), ensure_ascii=False)
print(sid, "claves", len(claves), "cobertura", round(float((Vw > 0).mean()), 2), "fl1", round(float((Fw == 1).sum() / max(1, (Fw > 0).sum())), 2), claves[:25], file=sys.stderr)
