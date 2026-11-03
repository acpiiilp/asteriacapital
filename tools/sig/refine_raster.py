#!/usr/bin/env python3
"""SIG · afina la georreferencia de un plano ESCANEADO partiendo de una aproximación (puntos de control).

Calles del plano = huecos claros entre manzanas de color. Se comparan con las calles de OSM con ECC
multiescala; primero afín y, si se pide, homografía (corrige escaneos torcidos o con perspectiva).
Uso: refine_raster.py plano.jpg inicial.json calles.json.gz crop x0,y0,x1,y1 salida.json [homografia]
Salida: {"A": UTM->pixel (2x3, afín final) , "Hm": UTM->pixel (3x3) si homografía}
"""
import sys, json, numpy as np, cv2
from PIL import Image
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from georef import load_osm, osm_raster, plan_streets
Image.MAX_IMAGE_PIXELS = None
img, init, osm, crop, out = sys.argv[1:6]
homog = len(sys.argv) > 6
x0, y0, x1, y1 = map(int, crop.split(","))
full = np.asarray(Image.open(img).convert("RGB"))
pl = full[y0:y1, x0:x1]
m, area = plan_streets(pl)
g = json.load(open(init)); A = np.vstack([np.array(g["A"]), [0, 0, 1]])
A = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ A                     # UTM -> crop px
Ai = np.linalg.inv(A)
cs = np.array([[0, 0, 1], [pl.shape[1], 0, 1], [0, pl.shape[0], 1], [pl.shape[1], pl.shape[0], 1]]) @ Ai.T
E0, N0 = cs[:, :2].min(0) - 300; E1, N1 = cs[:, :2].max(0) + 300
ways = load_osm(osm)
M = A.copy()                                                                  # UTM -> crop px (current)
for mpp, mode in ((8.0, cv2.MOTION_AFFINE), (4.0, cv2.MOTION_AFFINE), (2.5, cv2.MOTION_HOMOGRAPHY if homog else cv2.MOTION_AFFINE)):
    w, h = int((E1 - E0) / mpp), int((N1 - N0) / mpp)
    R2U = np.array([[mpp, 0, E0], [0, -mpp, N1], [0, 0, 1]])                 # raster px -> UTM
    o = osm_raster(ways, E0, N1, mpp, w, h).astype(np.float32) / 255
    W2P = M @ R2U                                                             # raster px -> crop px
    st = cv2.warpPerspective(m.astype(np.float32) / 255, W2P, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    ar = cv2.warpPerspective(area.astype(np.float32) / 255, W2P, (w, h), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP)
    o = o * (cv2.dilate(ar, np.ones((9, 9), np.uint8)) > 0)
    s = max(1.0, 8 / mpp)
    a, b = cv2.GaussianBlur(o, (0, 0), s), cv2.GaussianBlur(st, (0, 0), s)
    wm = np.eye(3, 3, dtype=np.float32) if mode == cv2.MOTION_HOMOGRAPHY else np.eye(2, 3, dtype=np.float32)
    try:
        cc, wm = cv2.findTransformECC(a, b, wm, mode, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 400, 1e-6), None, 5)
    except cv2.error as e:
        print("ecc fail", mpp, e, file=sys.stderr); continue
    Wm = wm if wm.shape == (3, 3) else np.vstack([wm, [0, 0, 1]])           # osm px -> plan-street px
    M = M @ R2U @ Wm @ np.linalg.inv(R2U)
    print("mpp", mpp, "ecc", round(cc, 3), "shift m", (Wm[:2, 2] * mpp).round(1), file=sys.stderr)
Mf = np.array([[1, 0, x0], [0, 1, y0], [0, 0, 1]]) @ M                         # UTM -> full px
res = {"A": (Mf[:2] / Mf[2, 2]).tolist(), "size": [full.shape[1], full.shape[0]], "m_per_px": float(np.sqrt(abs(np.linalg.det(np.linalg.inv(Mf)[:2, :2])))), "ecc": float(cc)}
if homog: res["Hm"] = Mf.tolist()
json.dump(res, open(out, "w"), indent=1)
