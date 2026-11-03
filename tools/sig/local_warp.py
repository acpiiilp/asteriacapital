#!/usr/bin/env python3
"""SIG · corrige planos escaneados deformados (doblados, mal escaneados) con un ajuste por sectores.

1) Parte de una afín aproximada (puntos de control, ±150 m).
2) Divide el plano en sectores de ~700 m; en cada uno busca solo el DESPLAZAMIENTO que mejor empalma
   las calles del plano con las de OSM (ECC de traslación: estable aun en escaneos malos).
3) Descarta sectores dudosos y ajusta una deformación suave (thin-plate spline) con los sectores buenos.
4) Reproyecta el plano a una imagen en UTM norte-arriba (res m/px) con su máscara: después se trata
   como cualquier hoja (A = UTM -> pixel, trivial).

Uso: local_warp.py plano.jpg inicial.json calles.json.gz crop x0,y0,x1,y1 salida_prefijo [res] [mascara_hoja.png]
Escribe <prefijo>.jpg (RGB), <prefijo>_mask.png, <prefijo>.json (A, size, m_per_px, puntos) y <prefijo>_check.jpg.
"""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy.interpolate import RBFInterpolator
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from georef import load_osm, osm_raster, plan_streets
Image.MAX_IMAGE_PIXELS = None
img, init, osm, crop, pre = sys.argv[1:6]
res = float(sys.argv[6]) if len(sys.argv) > 6 else 0.5
x0, y0, x1, y1 = map(int, crop.split(","))
full = np.asarray(Image.open(img).convert("RGB")); pl = full[y0:y1, x0:x1]
m, area = plan_streets(pl)
g = json.load(open(init)); A = np.vstack([np.array(g["A"]), [0, 0, 1]])
A = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ A                      # UTM -> crop px
Ai = np.linalg.inv(A)
ways = load_osm(osm)
mpp, S = 3.0, 900.0                                                            # metres per raster px, sector size (m)
cs = np.array([[0, 0, 1], [pl.shape[1], 0, 1], [0, pl.shape[0], 1], [pl.shape[1], pl.shape[0], 1]]) @ Ai.T
E0, N0 = cs[:, :2].min(0); E1, N1 = cs[:, :2].max(0)
src, dst, info = [], [], []
for Ec in np.arange(E0 + S / 2, E1, S * .6):
    for Nc in np.arange(N0 + S / 2, N1, S * .6):
        pad = 250; w = h = int((S + 2 * pad) / mpp)
        e0, n1 = Ec - S / 2 - pad, Nc + S / 2 + pad
        R2U = np.array([[mpp, 0, e0], [0, -mpp, n1], [0, 0, 1]])
        W2P = A @ R2U
        st = cv2.warpAffine(m.astype(np.float32) / 255, W2P[:2], (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
        ar = cv2.warpAffine(area.astype(np.float32) / 255, W2P[:2], (w, h), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP)
        if ar[pad // 3:-pad // 3, pad // 3:-pad // 3].mean() < .35 or st.mean() < .01:
            continue
        o = osm_raster(ways, e0, n1, mpp, w, h).astype(np.float32) / 255
        if o.mean() < .004:
            continue
        a_, b_ = cv2.GaussianBlur(o, (0, 0), 3), cv2.GaussianBlur(st * (ar > 0), (0, 0), 3)
        best = None
        for tx0 in (-60, 0, 60):                                              # coarse starts (±180 m)
            for ty0 in (-60, 0, 60):
                wm = np.array([[1, 0, tx0], [0, 1, ty0]], np.float32)
                try:
                    cc, wm = cv2.findTransformECC(a_, b_, wm, cv2.MOTION_TRANSLATION, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5), None, 5)
                except cv2.error:
                    continue
                if best is None or cc > best[0]: best = (cc, wm.copy())
        if best is None:
            continue
        cc, wm = best
        sh = wm[:, 2] * mpp
        if cc < .3 or np.hypot(*sh) > 220:
            continue
        # sector centre: in osm raster it is (w/2,h/2); plan-street raster point = osm point + shift
        U = np.array([Ec, Nc]); Pr = np.array([w / 2 + wm[0, 2], h / 2 + wm[1, 2], 1])
        P = (W2P @ Pr)[:2]
        src.append(P); dst.append(U); info.append((round(float(cc), 2), sh.round(0).tolist()))
src, dst = np.array(src), np.array(dst)
print(len(src), "sectores", file=sys.stderr)
if len(src) < 4:
    sys.exit("pocos sectores confiables")
# robust: drop sectors whose shift disagrees with neighbours (median filter on residual vs affine)
X = np.c_[src, np.ones(len(src))]; Aff = np.linalg.lstsq(X, dst, rcond=None)[0]; r = X @ Aff - dst
med = np.median(np.hypot(*r.T)); ok = np.hypot(*r.T) < max(40, 3 * med)
src, dst = src[ok], dst[ok]
print(ok.sum(), "tras filtro; residual afín mediano m", round(float(med), 1), file=sys.stderr)
tps = RBFInterpolator(dst, src, kernel="thin_plate_spline", smoothing=len(dst) * 4.0)   # UTM -> crop px
# output grid (UTM, north-up)
pts = np.c_[np.array([[0, 0], [pl.shape[1], 0], [0, pl.shape[0]], [pl.shape[1], pl.shape[0]]]), np.ones(4)] @ np.linalg.inv(np.vstack([Aff.T, [0, 0, 1]]))[:2].T if False else cs[:, :2]
GE0, GN0 = np.floor(pts.min(0) / 10) * 10 - 50; GE1, GN1 = np.ceil(pts.max(0) / 10) * 10 + 50
W, H = int((GE1 - GE0) / res), int((GN1 - GN0) / res)
step = 16
gx, gy = np.meshgrid(np.arange(0, W + step, step), np.arange(0, H + step, step))
UE, UN = GE0 + gx * res, GN1 - gy * res
P = tps(np.c_[UE.ravel(), UN.ravel()]).reshape(gx.shape + (2,)).astype(np.float32)
mapx = cv2.resize(P[..., 0], (W, H), interpolation=cv2.INTER_LINEAR)
mapy = cv2.resize(P[..., 1], (W, H), interpolation=cv2.INTER_LINEAR)
out = cv2.remap(pl, mapx, mapy, cv2.INTER_LINEAR, borderValue=(255, 255, 255))
Image.fromarray(out).save(pre + ".jpg", quality=90)
if len(sys.argv) > 8:
    mk = np.asarray(Image.open(sys.argv[8]))[..., 3]
    mk = cv2.resize(mk, (pl.shape[1], pl.shape[0]), interpolation=cv2.INTER_NEAREST)
    Image.fromarray(cv2.remap(mk, mapx, mapy, cv2.INTER_NEAREST, borderValue=0)).save(pre + "_mask.png")
A2 = np.array([[1 / res, 0, -GE0 / res], [0, -1 / res, GN1 / res]])
json.dump({"A": A2.tolist(), "size": [W, H], "m_per_px": res, "sectores": int(len(src)), "residual_afin_m": float(med)}, open(pre + ".json", "w"), indent=1)
# control image
vis = out.copy()
for xy, wd in ways:
    p = np.c_[(xy[:, 0] - GE0) / res, (GN1 - xy[:, 1]) / res].round().astype(np.int32)
    cv2.polylines(vis, [p], False, (230, 0, 0), 2)
Image.fromarray(vis).resize((W // 4, H // 4)).save(pre + "_check.jpg", quality=80)
