#!/usr/bin/env python3
"""SIG · consulta por clic en planos viejos que codifican la zonificación por COLOR (ZEDEC de las Lomas).

Cada color de la leyenda es una clave. Los números sobre la zona (9, 16, 20, 24, 32…) son alturas o
niveles en algunos planos; aquí solo se usa el color. El plano ya debe venir reproyectado a UTM
(local_warp.py) y con su máscara (cdmx_hojas.py).

Uso: cls_legend.py hoja.png georef.json leyenda.json salida_dir id "Nombre" "Alcaldía" [m_por_px]
leyenda.json: [{"clave": "Habitacional unifamiliar", "rgb": [r,g,b]}, ...]
"""
import sys, json, numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
hoja, gj, leg, outdir, sid, name, muni = sys.argv[1:8]
res = float(sys.argv[8]) if len(sys.argv) > 8 else 2.0
im = np.asarray(Image.open(hoja).convert("RGBA"))
g = json.load(open(gj)); A = np.array(g["A"]); mpp = g["m_per_px"]
L = json.load(open(leg))
f = mpp / res
sm = cv2.resize(im, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
rgb, a = sm[..., :3], sm[..., 3] > 127
lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
ref = cv2.cvtColor(np.array([[l["rgb"] for l in L]], np.uint8), cv2.COLOR_RGB2LAB)[0].astype(np.float32)
d = np.linalg.norm(lab[..., None, :] - ref[None, None], axis=-1)
k = d.argmin(-1); dm = d.min(-1)
ok = a & (dm < 28)
V = np.where(ok, k + 1, 0).astype(np.int32)
# streets / lines: fill small gaps with the nearest zone so a click on a lot edge still answers
V = cv2.morphologyEx(V.astype(np.uint16), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)).astype(np.int32)
# majority filter to clean scan noise
out = np.zeros_like(V)
for i in range(1, len(L) + 1):
    m = cv2.blur((V == i).astype(np.float32), (5, 5)); out[(m > .45) & a] = i
V = out
Ai = np.linalg.inv(np.vstack([A, [0, 0, 1]]))
H, W = V.shape
E0, N1 = (Ai @ [0, 0, 1])[:2]; E1, N0 = (Ai @ [im.shape[1], im.shape[0], 1])[:2]
rgba = np.zeros((H, W, 4), np.uint8); rgba[..., 0] = V & 255; rgba[..., 1] = V >> 8; rgba[..., 2] = np.where(V > 0, 5, 0); rgba[..., 3] = 255
Image.fromarray(rgba, "RGBA").save(f"{outdir}/{sid}_cls.png", optimize=True)
entry = {"c": sid, "muni": muni, "n": name, "g": 0, "E0": float(E0), "N0": float(N1), "E1": float(E1), "N1": float(N0), "w": W, "h": H, "cw": W, "ch": H,
         "claves": [l["clave"] for l in L], "k": [], "leyenda": True}
json.dump(entry, open(f"{outdir}/{sid}_cls.json", "w"), ensure_ascii=False)
print(sid, {L[i - 1]["clave"][:25]: round(float((V == i).mean() / max(a.mean(), 1e-9)), 3) for i in range(1, len(L) + 1)}, file=sys.stderr)
