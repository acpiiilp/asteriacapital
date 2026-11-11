#!/usr/bin/env python3
"""SIG · afina una georreferencia aproximada empatando la línea gruesa del límite del plano con el polígono
de OSM (ICP afín, recortando puntos lejanos para ignorar líneas internas).
Uso: icp_boundary.py plano.png inicial.json limite.json crop x0,y0,x1,y1 salida.json [espesor_min_px]
"""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy.spatial import cKDTree
img, init, lim, crop, out = sys.argv[1:6]
thk = float(sys.argv[6]) if len(sys.argv) > 6 else 3.5
x0, y0, x1, y1 = map(int, crop.split(","))
g = np.asarray(Image.open(img).convert("L"))
sub = g[y0:y1, x0:x1]
dt = cv2.distanceTransform((sub < 90).astype(np.uint8), cv2.DIST_L2, 5)
ys, xs = np.nonzero(dt >= thk)
P = np.c_[xs + x0, ys + y0].astype(float)
P = P[np.random.default_rng(0).choice(len(P), min(8000, len(P)), replace=False)]
B = np.vstack([np.array(s) for s in json.load(open(lim))])
# densify OSM boundary
Bd = []
for s in json.load(open(lim)):
    s = np.array(s)
    for a, b in zip(s[:-1], s[1:]):
        n = max(1, int(np.hypot(*(b - a)) / 5)); Bd.append(a + (b - a) * np.linspace(0, 1, n, endpoint=False)[:, None])
Bd = np.vstack(Bd); tree = cKDTree(Bd)
A = np.vstack([np.array(json.load(open(init))["A"]), [0, 0, 1]])
P2U = np.linalg.inv(A)
for thr in (500, 300, 200, 120, 80, 60, 50, 40, 40, 40):
    U = (P2U @ np.c_[P, np.ones(len(P))].T).T[:, :2]
    d, i = tree.query(U)
    m = d < thr
    if m.sum() < 30:
        break
    X = np.c_[P[m], np.ones(m.sum())]
    sol = np.linalg.lstsq(X, Bd[i[m]], rcond=None)[0]                          # px -> UTM affine
    P2U = np.vstack([sol.T, [0, 0, 1]])
    print(f"thr {thr} puntos {m.sum()} mediana {np.median(d[m]):.1f} m", file=sys.stderr)
U2P = np.linalg.inv(P2U)
json.dump({"A": U2P[:2].tolist(), "size": [g.shape[1], g.shape[0]], "m_per_px": float(np.sqrt(abs(np.linalg.det(P2U[:2, :2]))))}, open(out, "w"), indent=1)
