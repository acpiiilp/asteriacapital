#!/usr/bin/env python3
"""SIG · afina la georreferencia de un plano vectorial (PDF con capa de manzanas) contra OpenStreetMap.

1) Rasteriza las manzanas del PDF (capas indicadas) en coordenadas de página.
2) Con una afín inicial (puntos de control, error ~100 m) las lleva a UTM.
3) ECC multiescala (afín) entre "calles del plano" (huecos entre manzanas) y calles de OSM.
Salida: JSON con A (UTM -> pt de página, 2x3) y una imagen de control.

Uso: icp_vector.py plano.pdf capa1,capa2 inicial.json calles.json.gz salida.json
  inicial.json: {"A": UTM->pixel del render a dpi D, "dpi": D}
"""
import sys, json, numpy as np, cv2, pymupdf
from PIL import Image
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from georef import load_osm, osm_raster

pdf, layers, init, osm, out = sys.argv[1:6]
layers = set(layers.split(","))
d = pymupdf.open(pdf); p = d[0]
polys = []
R = p.rotation_matrix
for x in p.get_drawings():
    if x.get("layer") not in layers:
        continue
    pts = []
    for it in x["items"]:
        if it[0] == "l": pts += [it[1], it[2]]
        elif it[0] == "c": pts += [it[1], it[4]]
        elif it[0] == "re": r = it[1]; pts += [r.tl, r.tr, r.br, r.bl]
        elif it[0] == "qu": q = it[1]; pts += [q.ul, q.ur, q.lr, q.ll]
    if len(pts) >= 3:
        polys.append(np.array([((q * R).x, (q * R).y) for q in pts]))       # rotated page space = render space
print("manzanas", len(polys), file=sys.stderr)
g = json.load(open(init)); k = g["dpi"] / 72.0
A0 = np.vstack([np.array(g["A"]), [0, 0, 1]])                  # UTM -> render px
A0 = np.diag([1 / k, 1 / k, 1]) @ A0                            # UTM -> page pt
P2U = np.linalg.inv(A0)                                         # page pt -> UTM
allp = np.vstack(polys); ext = allp @ P2U[:2, :2].T + P2U[:2, 2]
E0, N0 = ext.min(0) - 400; E1, N1 = ext.max(0) + 400
ways = load_osm(osm)
H = None
for mpp in (12.0, 6.0, 3.0):
    w, h = int((E1 - E0) / mpp), int((N1 - N0) / mpp)
    U2R = np.array([[1 / mpp, 0, -E0 / mpp], [0, -1 / mpp, N1 / mpp], [0, 0, 1]])  # UTM -> raster px
    o = osm_raster(ways, E0, N1, mpp, w, h).astype(np.float32) / 255
    blk = np.zeros((h, w), np.uint8)
    T = U2R @ P2U if H is None else H                           # page pt -> raster px
    for q in polys:
        r = (q @ T[:2, :2].T + T[:2, 2]).round().astype(np.int32)
        cv2.fillPoly(blk, [r], 255)
    hull = cv2.morphologyEx(blk, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(80 / mpp) | 1,) * 2))
    st = ((hull > 0) & (blk == 0)).astype(np.float32)
    s = max(1.0, 6 / mpp)
    a, b = cv2.GaussianBlur(o, (0, 0), s), cv2.GaussianBlur(st, (0, 0), s)
    wm = np.eye(2, 3, dtype=np.float32)
    try:
        cc, wm = cv2.findTransformECC(a, b, wm, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    except cv2.error as e:
        print("ecc fail", mpp, e, file=sys.stderr); cc = None
    # wm maps osm raster px -> plan-street raster px; correct T so plan lands on osm
    Wm = np.vstack([wm, [0, 0, 1]])
    T = np.linalg.inv(Wm) @ T
    H = T @ np.linalg.inv(U2R) @ U2R                            # keep in this raster's px for the next level
    print("mpp", mpp, "ecc", cc, "shift m", (np.array([wm[0, 2], wm[1, 2]]) * mpp).round(1), file=sys.stderr)
    nxt = np.array([[mpp / (mpp / 2), 0, 0], [0, mpp / (mpp / 2), 0], [0, 0, 1]])
    H = nxt @ T                                                  # page pt -> next raster px (half mpp, same origin)
    lastT, lastU2R = T, U2R
P2Uf = np.linalg.inv(lastU2R) @ lastT                          # page pt -> UTM
U2P = np.linalg.inv(P2Uf)
U2render = np.diag([k, k, 1]) @ U2P
json.dump({"A": U2render[:2].tolist(), "dpi": g["dpi"], "size": g.get("size"), "m_per_px": float(np.sqrt(abs(np.linalg.det(P2Uf[:2, :2]))) / k), "ecc": cc}, open(out, "w"), indent=1)
vis = np.dstack([o * 255, st * 255, np.zeros_like(o)]).astype(np.uint8)
blk2 = np.zeros(o.shape, np.uint8)
for q in polys:
    cv2.polylines(blk2, [(q @ lastT[:2, :2].T + lastT[:2, 2]).round().astype(np.int32)], True, 255, 1)
vis[blk2 > 0] = (0, 160, 255)
vis[o > .5] = (230, 0, 0)
Image.fromarray(vis).save(out.replace(".json", "_icp.jpg"), quality=80)
