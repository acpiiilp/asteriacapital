#!/usr/bin/env python3
"""SIG · georreferencia un plano por su CONTORNO: empata la línea gruesa del límite (alcaldía o programa)
con el polígono de OpenStreetMap. Busca escala, giro y traslación (similitud) minimizando la distancia
media de los puntos del contorno del plano al límite de OSM (chamfer), y luego afina a afín con ICP.

Uso: fit_boundary.py plano.png limite.json crop x0,y0,x1,y1 salida.json [m_por_px_aprox] [giro_max]
limite.json: lista de polilíneas [[E,N],...] (UTM 14N).
"""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy.optimize import minimize
img, lim, crop, out = sys.argv[1:5]
mpp0 = float(sys.argv[5]) if len(sys.argv) > 5 else 6.5
gmax = float(sys.argv[6]) if len(sys.argv) > 6 else 8
x0, y0, x1, y1 = map(int, crop.split(","))
g = np.asarray(Image.open(img).convert("L"))[y0:y1, x0:x1]
# thick dashed boundary: dark blobs that survive an opening with a 3x3 (thin text/lines vanish)
dark = (g < 90).astype(np.uint8)
dt = cv2.distanceTransform(dark, cv2.DIST_L2, 5)
core = (dt >= float(sys.argv[7]) if len(sys.argv) > 7 else dt >= 3.5).astype(np.uint8)   # only thick strokes (the limit)
n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(core, np.ones((5, 5), np.uint8)), 8)
keepc = [i for i in range(1, n) if max(st[i, 2], st[i, 3]) >= 25]                       # drop isolated blobs (bold letters)
ys, xs = np.nonzero(np.isin(lab, keepc) & (core > 0))
sel = np.random.default_rng(0).choice(len(xs), min(4000, len(xs)), replace=False) if len(xs) else []
pts = list(zip(xs[sel], ys[sel]))
P = np.array(pts, float)
print(len(P), "puntos de contorno", file=sys.stderr)
Bs = [np.array(s) for s in json.load(open(lim))]
allb = np.vstack(Bs); E0, N0 = allb.min(0) - 3000; E1, N1 = allb.max(0) + 3000
R = 10.0                                                                     # m per px of the distance field
W, H = int((E1 - E0) / R), int((N1 - N0) / R)
bimg = np.ones((H, W), np.uint8)
for s in Bs:
    cv2.polylines(bimg, [np.c_[(s[:, 0] - E0) / R, (N1 - s[:, 1]) / R].round().astype(np.int32)], False, 0, 2)
D = cv2.distanceTransform(bimg, cv2.DIST_L2, 5) * R                          # metres to nearest boundary
def cost(p, Pp=P, trim=.8):
    s, th, tx, ty = p
    c, sn = np.cos(th), np.sin(th)
    E = tx + s * (c * Pp[:, 0] + sn * Pp[:, 1]); N = ty + s * (sn * Pp[:, 0] - c * Pp[:, 1])
    X = np.clip(((E - E0) / R).astype(int), 0, W - 1); Y = np.clip(((N1 - N) / R).astype(int), 0, H - 1)
    d = np.sort(D[Y, X]); return d[:int(len(d) * trim)].mean()
cx, cy = P.mean(0); bc = allb.mean(0)
best = None
for s in mpp0 * np.linspace(.8, 1.25, 10):
    for th in np.radians(np.arange(-gmax, gmax + .1, 1.5)):
        for dx in np.arange(-3000, 3001, 500):
            for dy in np.arange(-3000, 3001, 500):
                c, sn = np.cos(th), np.sin(th)
                tx = bc[0] + dx - s * (c * cx + sn * cy); ty = bc[1] + dy - s * (sn * cx - c * cy)
                v = cost((s, th, tx, ty))
                if best is None or v < best[0]: best = (v, (s, th, tx, ty))
print("grueso", round(best[0], 1), "m", file=sys.stderr)
b0 = best[1]
r = minimize(lambda p: cost(p) + (1e4 if not (b0[0] * .85 < p[0] < b0[0] * 1.15) else 0), b0, method="Nelder-Mead",
             options={"xatol": 1e-4, "fatol": .05, "maxiter": 6000})
s, th, tx, ty = r.x
print("fino", round(r.fun, 1), "m; m/px", round(s, 3), "giro", round(np.degrees(th), 2), file=sys.stderr)
c, sn = np.cos(th), np.sin(th)
P2U = np.array([[s * c, s * sn, tx - s * (c * x0 + sn * y0)], [s * sn, -s * c, ty - s * (sn * x0 - c * y0)], [0, 0, 1]])
U2P = np.linalg.inv(P2U)
json.dump({"A": U2P[:2].tolist(), "m_per_px": float(s), "residual_m": float(r.fun)}, open(out, "w"), indent=1)
vis = np.stack([g] * 3, -1).copy()
for sgm in Bs:
    q = (U2P @ np.c_[sgm, np.ones(len(sgm))].T).T - [x0, y0, 0]
    cv2.polylines(vis, [q[:, :2].round().astype(np.int32)], False, (230, 0, 0), 2)
for p in P: cv2.circle(vis, (int(p[0]), int(p[1])), 2, (0, 160, 255), -1)
Image.fromarray(vis).save(out.replace(".json", "_bnd.jpg"), quality=80)
