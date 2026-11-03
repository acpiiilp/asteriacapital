#!/usr/bin/env python3
"""SIG · prepara las hojas de la CDMX para teselas.py: recorta al polígono del programa (máscara),
baja la resolución a ~0.5 m/px y escribe tools/sig/cdmx_hojas.json.

Uso: cdmx_hojas.py <dir_imagenes> <dir_georef> <dir_salida> id1 id2 ...
Cada id necesita <dir_imagenes>/<id>.jpg y <dir_georef>/<id>.json (matriz A: UTM -> pixel).
"""
import sys, os, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
Image.MAX_IMAGE_PIXELS = None
src, geo, out = sys.argv[1:4]
ids = sys.argv[4:]
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(out, exist_ok=True)
CROPS = {l.split("\t")[0]: list(map(int, l.split("\t")[1].split(","))) for l in open(os.path.join(geo, "..", "jobs.tsv")) if l.strip()}
hojas = []
for i in ids:
    g = json.load(open(f"{geo}/{i}.json")); A = np.array(g["A"])
    im = np.asarray(Image.open(f"{src}/{i}.jpg").convert("RGB"))
    H, W = im.shape[:2]
    f = min(1.0, g["m_per_px"] / 0.5)                      # target ~0.5 m/px
    x0, y0, x1, y1 = CROPS.get(i, [0, 0, W, H])
    crop = im[y0:y1, x0:x1]
    hsv = cv2.cvtColor(crop, cv2.COLOR_RGB2HSV)
    ST = {"PPDU-BJ-Napoles": 75, "PPDU-MH-LomasAltasW": 22}.get(i, 40)          # scanned beige paper needs a stricter saturation cut
    col = ((hsv[..., 1] > ST) & (hsv[..., 2] > 90)).astype(np.uint8)
    k = max(9, int(min(crop.shape[:2]) / 50)) | 1
    col = cv2.morphologyEx(col, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    col = ndi.binary_fill_holes(col)
    lab, n = ndi.label(col)
    if n:
        sz = ndi.sum(col, lab, range(1, n + 1)); col = lab == (1 + int(np.argmax(sz)))
    col = cv2.erode(col.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    CLIP = {"PPDU-BJ-Napoles": [(0, 0), (.905, 0), (.61, 1), (0, 1)]}       # polygon limit drawn by hand (fractions)
    if i in CLIP:
        hh0, ww0 = col.shape; m = np.zeros_like(col)
        cv2.fillPoly(m, [np.int32([(x * ww0, y * hh0) for x, y in CLIP[i]])], 1); col = col & m
    rgba = np.dstack([crop, col * 255]).astype(np.uint8)
    small = cv2.resize(rgba, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    p = f"{out}/{i}.png"; Image.fromarray(small, "RGBA").save(p, optimize=False, compress_level=1)
    # A for the cropped & scaled image: px' = (A·[E,N,1] - [x0,y0]) * f
    A2 = (A - np.array([[0, 0, x0], [0, 0, y0]])) * f
    Ai = np.linalg.inv(np.vstack([A2, [0, 0, 1]]))
    hh, ww = small.shape[:2]
    cs = np.array([[0, 0, 1], [ww, 0, 1], [0, hh, 1], [ww, hh, 1]]) @ Ai.T
    bbox = [cs[:, 0].min(), cs[:, 1].min(), cs[:, 0].max(), cs[:, 1].max()]
    prio = 60 if i.startswith("PPDU") else 40
    hojas.append({"id": i, "img": os.path.relpath(p, REPO) if p.startswith(REPO) else p, "A": A2.tolist(), "size": [ww, hh],
                  "bbox": bbox, "prio": prio, "m_per_px": g["m_per_px"] / f, "rms_m": g.get("rms_m")})
    print(i, ww, hh, round(g["m_per_px"] / f, 2), "m/px", "opaco", round(float(col.mean()), 2))
json.dump(hojas, open(os.path.join(REPO, "tools/sig/cdmx_hojas.json"), "w"), indent=1)
