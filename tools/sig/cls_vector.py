#!/usr/bin/env python3
"""SIG · ráster de claves (consulta por clic) a partir de un plano vectorial de SEDUVI.

Toma los polígonos por uso (capas *_poligono del PDF) y las etiquetas de texto ("HM" + "5/20/A"),
y escribe un PNG alineado a UTM: R + 256·G = número de clave (1..n), B = confianza
(1 etiqueta en el mismo polígono, 2 polígono con varias claves -> la más cercana, 3 sin etiqueta -> la
más cercana del mismo uso). Mismo formato que el SIG Edomex, así el visor lo usa igual.

Uso: cls_vector.py plano.pdf georef.json salida_dir id "Nombre" "Alcaldía" [m_por_px]
georef.json: A = UTM -> pixel del render a "dpi".
"""
import sys, json, re, numpy as np, cv2, pymupdf
from PIL import Image

pdf, gj, outdir, sid, name, muni = sys.argv[1:7]
res = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
LAYERS = {"H_poligono": "H", "HC_poligono": "HC", "HO_Poligono": "HO", "HM_poligono": "HM", "CB_Poligono": "CB",
          "E_Poligono": "E", "EA_poligono_final": "EA"}
ORDER = ["H", "HC", "HO", "HM", "CB", "E", "EA"]            # paint order: later wins where layers overlap
d = pymupdf.open(pdf); p = d[0]; R = p.rotation_matrix
g = json.load(open(gj)); k = g["dpi"] / 72.0
U2P = np.vstack([np.array(g["A"]), [0, 0, 1]]); U2P = np.diag([1 / k, 1 / k, 1]) @ U2P   # UTM -> page pt
P2U = np.linalg.inv(U2P)


def subpaths(items):
    cur, out, last = [], [], None
    for it in items:
        if it[0] in ("l", "c"):
            a, b = it[1], it[-1]
            if last is not None and abs(a.x - last.x) + abs(a.y - last.y) > .01:
                if len(cur) >= 3: out.append(cur)
                cur = []
            if not cur: cur.append(a * R)
            cur.append(b * R); last = b
        elif it[0] == "re":
            r = it[1]; out.append([q * R for q in (r.tl, r.tr, r.br, r.bl)]); last = None
        elif it[0] == "qu":
            q = it[1]; out.append([v * R for v in (q.ul, q.ur, q.lr, q.ll)]); last = None
    if len(cur) >= 3: out.append(cur)
    return [np.array([(q.x, q.y) for q in s]) for s in out]


polys = {u: [] for u in ORDER}
for x in p.get_drawings():
    u = LAYERS.get(x.get("layer"))
    if u: polys[u] += subpaths(x["items"])
allp = np.vstack([q for v in polys.values() for q in v])
ext = allp @ P2U[:2, :2].T + P2U[:2, 2]
E0, N0 = np.floor(ext.min(0) / 10) * 10 - 20; E1, N1 = np.ceil(ext.max(0) / 10) * 10 + 20
W, H = int((E1 - E0) / res), int((N1 - N0) / res)
P2R = np.array([[1 / res, 0, -E0 / res], [0, -1 / res, N1 / res], [0, 0, 1]]) @ P2U     # page pt -> raster px
print(sid, "raster", W, H, {u: len(v) for u, v in polys.items()}, file=sys.stderr)

# labels: use word with its density right below ("HM" over "5/20/A")
UW = re.compile(r"^(H|HC|HO|HM|HS|E|EA|CB|I|AV|HCS)$"); DW = re.compile(r"^\d+/\d+(/[A-Z]+)?$")
words = []
for w in p.get_text("words"):
    q = pymupdf.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2) * R
    r = pymupdf.Rect(w[:4]) * R
    words.append((w[4], np.array([q.x, q.y]), r.width, r.height))
uses = [w for w in words if UW.match(w[0])]; dens = [w for w in words if DW.match(w[0])]
labels = []
for t, c, wd, ht in uses:
    best, bd = None, 1e9
    for t2, c2, wd2, ht2 in dens:
        dx, dy = c2 - c
        if 0 < dy < 2.6 * ht2 + 1 and abs(dx) < .6 * max(wd, wd2) + 1:
            dd = dy + abs(dx)
            if dd < bd: best, bd = (t2, c2), dd
    clave = f"{t} {best[0]}" if best else t
    pc = (best[1] + c) / 2 if best else c
    labels.append((t, clave, (np.array([*pc, 1]) @ P2R.T)[:2]))
claves = sorted({l[1] for l in labels})
cid = {c: i + 1 for i, c in enumerate(claves)}
print(len(labels), "etiquetas,", len(claves), "claves", file=sys.stderr)

V = np.zeros((H, W), np.int32); F = np.zeros((H, W), np.uint8)
for u in ORDER:
    m = np.zeros((H, W), np.uint8)
    for q in polys[u]:
        r = (q @ P2R[:2, :2].T + P2R[:2, 2]).round().astype(np.int32)
        cv2.fillPoly(m, [r], 1)
    if not m.any():
        continue
    L = [l for l in labels if l[0] == u and 0 <= l[2][0] < W and 0 <= l[2][1] < H]
    if not L:
        continue
    seeds = np.ones((H, W), np.uint8)
    for j, l in enumerate(L):
        cv2.circle(seeds, tuple(int(v) for v in l[2]), 1, 0, -1)
    _, lab = cv2.distanceTransformWithLabels(seeds, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    # map pixel-label ids back to our label list (seed pixels are where seeds==0)
    ys, xs = np.nonzero(seeds == 0)
    pid = lab[ys, xs]
    owner = np.zeros(pid.max() + 1, np.int32)
    for y, x, i in zip(ys, xs, pid):
        dbest = min(range(len(L)), key=lambda j: (L[j][2][0] - x) ** 2 + (L[j][2][1] - y) ** 2)
        owner[i] = cid[L[dbest][1]]
    val = owner[lab]
    # one zone usually spans several blocks: bridge streets (~30 m) before counting its labels
    kk = int(30 / res) | 1
    mz = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (kk, kk)))
    ncc, cc = cv2.connectedComponents(mz, connectivity=4)
    # confidence per component: 1 one clave inside, 2 several, 3 none
    conf = np.full(ncc, 3, np.uint8)
    inside = {}
    for t, c, pt in L:
        x, y = int(pt[0]), int(pt[1])
        if mz[y, x]:
            inside.setdefault(cc[y, x], set()).add(c)
    for comp, s in inside.items():
        conf[comp] = 1 if len(s) == 1 else 2
    sel = m > 0
    V[sel] = val[sel]; F[sel] = conf[cc[sel]]
rgba = np.zeros((H, W, 4), np.uint8)
rgba[..., 0] = V & 255; rgba[..., 1] = V >> 8; rgba[..., 2] = np.where(V > 0, F, 0); rgba[..., 3] = 255
Image.fromarray(rgba, "RGBA").save(f"{outdir}/{sid}_cls.png", optimize=True)
entry = {"c": sid, "muni": muni, "n": name, "g": 1 if sid.startswith("PDDU") else 0, "E0": float(E0), "N0": float(N1), "E1": float(E1), "N1": float(N0),
         "w": W, "h": H, "cw": W, "ch": H, "claves": claves, "k": []}
json.dump(entry, open(f"{outdir}/{sid}_cls.json", "w"), ensure_ascii=False)
print("cobertura %", round(float((V > 0).mean()) * 100, 1), {k: int((F == k).sum()) for k in (1, 2, 3)}, file=sys.stderr)
