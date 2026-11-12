#!/usr/bin/env python3
"""SIG · georreferencia un plano de programa parcial con la zonificación por predio (datos abiertos SEDUVI).

Cada predio trae su uso (p. ej. "Área verde", "Unifamiliar 1 viv/1000 m²"); el plano pinta esas zonas con colores
de su leyenda. Se busca la transformación (escala, giro, traslación → luego afín) que hace que el mayor número de
predios caiga sobre el color de su zona. No requiere cruces de calles ni contorno.

Uso: fit_predios.py conf.json
conf: {"img": plano, "crop": [x0,y0,x1,y1], "out": salida.json,
       "bbox_ll": [lat0,lon0,lat1,lon1],            # zona donde buscar predios
       "classes": {"AV": [[r,g,b],...], "H1": [[r,g,b]], ...},   # colores del plano por clase
       "rules": [["regex sobre alcaldia|uso|densidad|niv|alt|libre|min", "clase"], ...],
       "mpp": 0.7, "giro": 0, "work": 1600}
"""
import sys, json, gzip, struct, re
import numpy as np, cv2
from PIL import Image
from pyproj import Transformer
from scipy.optimize import minimize

Image.MAX_IMAGE_PIXELS = None
C = json.load(open(sys.argv[1]))
DATA = C.get("datos", "/root/src/datos/uso_suelo_cdmx.bin.gz")
b = gzip.open(DATA).read(); hl = struct.unpack("<I", b[:4])[0]
H = json.loads(b[4:4 + hl]); a = np.frombuffer(b[4 + hl:], dtype="<i4").reshape(-1, 3)
lat = a[:, 0] / 1e6 + 19; lon = a[:, 1] / 1e6 - 100
la0, lo0, la1, lo1 = C["bbox_ll"]
sel = (lat > la0) & (lat < la1) & (lon > lo0) & (lon < lo1)
names = list(C["classes"])
cls_of_key = {}
for i, k in enumerate(H["keys"]):
    for rx, c in C["rules"]:
        if re.search(rx, k, re.I): cls_of_key[i] = names.index(c); break
pc = np.array([cls_of_key.get(int(k), -1) for k in a[sel, 2]])
E, N = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True).transform(lon[sel], lat[sel])
E = np.asarray(E)[pc >= 0]; N = np.asarray(N)[pc >= 0]; pc = pc[pc >= 0]
print("predios con clase", len(pc), np.bincount(pc, minlength=len(names)), file=sys.stderr)

x0, y0, x1, y1 = C["crop"]
full = Image.open(C["img"]).convert("RGB")
crop = full.crop((x0, y0, x1, y1))
f = C.get("work", 1600) / crop.width
small = np.asarray(crop.resize((int(crop.width * f), int(crop.height * f)), Image.BILINEAR)).astype(np.float32)
small = cv2.medianBlur(small.astype(np.uint8), 5).astype(np.float32)
# clase por pixel: centro de color más cercano (con umbral)
cent = []; lab = []
for i, n in enumerate(names):
    for c in C["classes"][n]: cent.append(c); lab.append(i)
cent = np.array(cent, np.float32); lab = np.array(lab)
d = ((small[:, :, None, :] - cent[None, None]) ** 2).sum(-1)
j = d.argmin(-1); dm = np.sqrt(d.min(-1))
pix = np.where(dm < C.get("tol", 45), lab[j], -1)
masks = []
tolpx = C.get("tolpx", 3)
for i in range(len(names)):
    m = (pix == i).astype(np.uint8)
    m = cv2.dilate(m, np.ones((2 * tolpx + 1,) * 2, np.uint8))
    masks.append(m)
masks = np.stack(masks)
anym = (pix >= 0)
anyd = cv2.dilate(anym.astype(np.uint8), np.ones((2 * tolpx + 1,) * 2, np.uint8)) > 0
PEN = C.get("pen", 0.5)
hh, ww = pix.shape
Image.fromarray((np.array([[200, 0, 0], [0, 150, 0], [0, 0, 220], [220, 160, 0], [150, 0, 150], [0, 160, 160], [90, 90, 90]], np.uint8)[pix % 7] * (pix >= 0)[..., None]).astype(np.uint8)).save(C["out"][:-5] + "_cls.png")


def to_px(p, E, N):
    s, th, tx, ty = p                       # UTM -> small px: rotate/scale around, + translate
    c, sn = np.cos(th), np.sin(th)
    X = (E - E0c); Y = (N - N0c)
    u = s * (c * X + sn * Y) + tx; v = s * (sn * X - c * Y) + ty
    return u, v


E0c, N0c = E.mean(), N.mean()


def score(p):
    u, v = to_px(p, E, N)
    ui = np.round(u).astype(int); vi = np.round(v).astype(int)
    ok = (ui >= 0) & (vi >= 0) & (ui < ww) & (vi < hh)
    hit = np.zeros(len(u)); hit[ok] = masks[pc[ok], vi[ok], ui[ok]]
    wh = np.ones(len(u)); wh[ok] = ~anyd[vi[ok], ui[ok]]
    return -(hit.mean() - PEN * wh.mean())


s0 = f / C["mpp"]                            # small px per metre
ys, xs = np.nonzero(anym)
best = None
for th in np.radians(np.arange(C.get("giro", 0) - 4, C.get("giro", 0) + 4.1, 1)):
    for sc in s0 * np.linspace(C.get("smin", .85), C.get("smax", 1.15), C.get("sn", 7)):
        for dx in np.linspace(-.25, .25, 11) * ww:
            for dy in np.linspace(-.25, .25, 11) * hh:
                p = (sc, th, xs.mean() + dx, ys.mean() + dy)
                v = score(p)
                if best is None or v < best[0]: best = (v, p)
print("grueso", round(-best[0], 3), file=sys.stderr)
r = minimize(score, best[1], method="Nelder-Mead", options={"xatol": 1e-3, "fatol": 1e-4, "maxiter": 3000})
p = r.x
print("fino", round(-r.fun, 3), "m/px", round(f / p[0], 3), "giro", round(np.degrees(p[1]), 2), file=sys.stderr)
# afín UTM -> pixel del plano completo
s, th, tx, ty = p
c, sn = np.cos(th), np.sin(th)
A_small = np.array([[s * c, s * sn, tx - s * (c * E0c + sn * N0c)], [s * sn, -s * c, ty - s * (sn * E0c - c * N0c)]])
A = np.vstack([A_small / f, [0, 0, 1]]) ; A[0, 2] += x0; A[1, 2] += y0
# afinar afín libre con los predios que ya coinciden (desplazamiento al pixel más cercano de su clase)
json.dump({"A": A[:2].tolist(), "size": list(full.size), "match": float(-r.fun), "m_per_px": float(f / s)}, open(C["out"], "w"), indent=1)
vis = (small.astype(np.uint8) * .6).astype(np.uint8)
u, v = to_px(p, E, N)
for uu, vv, k in zip(u, v, pc):
    hit = 0 <= int(vv) < hh and 0 <= int(uu) < ww and masks[k, int(vv), int(uu)]
    cv2.circle(vis, (int(uu), int(vv)), 2, (0, 255, 0) if hit else (255, 0, 0), -1)
Image.fromarray(vis).save(C["out"][:-5] + "_fit.jpg", quality=85)
print(json.dumps({"match": -r.fun}))
