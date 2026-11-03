#!/usr/bin/env python3
"""Dibuja las calles de OSM (rojo) sobre el plano usando su georreferencia, para revisar a ojo.
Uso: check_georef.py plano.jpg georef.json calles.json.gz salida.jpg [crop x0,y0,x1,y1] [ancho_px]"""
import sys, json, numpy as np, cv2
from PIL import Image
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from georef import load_osm
Image.MAX_IMAGE_PIXELS = None
img, gj, osm, out = sys.argv[1:5]
crop = list(map(int, sys.argv[5].split(","))) if len(sys.argv) > 5 and sys.argv[5] else None
W = int(sys.argv[6]) if len(sys.argv) > 6 else 1400
im = Image.open(img).convert("RGB")
if crop:
    im = im.crop(crop)
x0, y0 = (crop[0], crop[1]) if crop else (0, 0)
s = W / im.width
im = np.asarray(im.resize((W, int(im.height * s)))).copy()
A = np.array(json.load(open(gj))["A"])
for xy, wd in load_osm(osm):
    px = (A[0, 0] * xy[:, 0] + A[0, 1] * xy[:, 1] + A[0, 2] - x0) * s
    py = (A[1, 0] * xy[:, 0] + A[1, 1] * xy[:, 1] + A[1, 2] - y0) * s
    if px.max() < 0 or py.max() < 0 or px.min() > im.shape[1] or py.min() > im.shape[0]:
        continue
    cv2.polylines(im, [np.c_[px, py].round().astype(np.int32)], False, (230, 0, 0), 1)
Image.fromarray(im).save(out, quality=85)
