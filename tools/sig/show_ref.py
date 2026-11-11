#!/usr/bin/env python3
"""Dibuja polilíneas de referencia (UTM) sobre un plano con su georreferencia. Uso: show_ref.py plano georef.json ref.json salida crop ancho"""
import sys, json, numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
img, gj, ref, out, crop, W = sys.argv[1:7]
x0, y0, x1, y1 = map(int, crop.split(",")); W = int(W)
im = np.asarray(Image.open(img).convert("RGB"))[y0:y1, x0:x1].copy()
A = np.array(json.load(open(gj))["A"])
for s in json.load(open(ref)):
    s = np.array(s); p = (A @ np.c_[s, np.ones(len(s))].T).T - [x0, y0]
    cv2.polylines(im, [p.round().astype(np.int32)], False, (230, 0, 0), 4)
Image.fromarray(im).resize((W, int(im.shape[0] * W / im.shape[1]))).save(out, quality=85)
