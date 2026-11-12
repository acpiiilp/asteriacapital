#!/usr/bin/env python3
"""SIG · zonificación por predio de la CDMX (datos abiertos SEDUVI, datos.cdmx.gob.mx, recurso "Uso de suelo").

Entrada: binario compacto bajado en el navegador (uso_suelo_cdmx.bin.gz):
  uint32 largo_cabecera · cabecera JSON {n, keys} · int32[n,3] = (lat-19)*1e6, (lon+100)*1e6, índice de clave
  keys[i] = "alcaldia|uso|densidad|niveles|altura|area_libre|minimo_vivienda"
No se guarda ni publica nada catastral (cuenta, dirección): solo la zonificación y un punto por predio.

Salida (en sig/p/):
  codes.json       tabla de zonificaciones normalizadas + índice de celdas de 1 km
  c/{ix}_{iy}.bin  puntos de la celda: int16 dE(dm), int16 dN(dm), uint16 código   (clic)
  z/{z}/{x}/{y}.webp + z/index.json   capa de colores (misma cuadrícula que los planos)
Uso: python3 tools/sig/predios.py datos.bin.gz sig/p [--tiles]
"""
import sys, os, gzip, json, struct, re, unicodedata, math, collections
import numpy as np
from pyproj import Transformer
from scipy.spatial import cKDTree
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
DO_TILES = "--tiles" in sys.argv
OE, ON = 456032, 2133717                     # origen de la cuadrícula del visor (edomex.js DATA.o)
TS = 256

b = gzip.open(src).read()
hl = struct.unpack("<I", b[:4])[0]
head = json.loads(b[4:4 + hl])
a = np.frombuffer(b[4 + hl:], dtype="<i4").reshape(-1, 3)
lat = a[:, 0] / 1e6 + 19; lon = a[:, 1] / 1e6 - 100
E, N = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True).transform(lon, lat)
E = np.asarray(E); N = np.asarray(N)


def nrm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


# categoría de color y código corto
def uso_code(u):
    t = nrm(u)
    if "sin zonif" in t: return "SZ"
    if "rural" in t and "equipamiento" in t: return "ER"
    if "habitacional rural" in t or "habitacion rural" in t: return "HRC" if "comercio" in t else ("HRB" if "baja" in t else "HR")
    if "produccion rural" in t: return "PRA"
    if "preservacion" in t: return "PE"
    if "rescate" in t: return "RE"
    if "valor ambiental" in t or "area verde" in t or "areas verdes" in t: return "AV"
    if "espacio" in t and "abierto" in t: return "EA"
    if "centro de barrio" in t or "centros de barrio" in t: return "CB"
    if "equipamiento" in t: return "E"
    if "industria" in t: return "I"
    if "habitac" not in t and not t.startswith("hab") and re.search(r"servicio|oficina|comerci|turistic", t): return "S"
    if "mixto" in t: return "HM"
    if "oficina" in t: return "HO"
    if "comercio" in t or "comercial" in t or "servicio" in t: return "HC"
    if "habitac" in t or t.startswith("hab"): return "H"
    return "O"


CAT = {"H": 0, "HC": 1, "HO": 2, "HM": 3, "CB": 4, "E": 5, "I": 6, "EA": 7, "AV": 7,
       "HR": 8, "HRB": 8, "HRC": 8, "ER": 8, "PRA": 9, "PE": 9, "RE": 9, "SZ": 10, "O": 10, "S": 11}
COL = [(246, 220, 92), (243, 156, 70), (234, 120, 120), (214, 62, 62), (190, 80, 170), (70, 130, 220),
       (130, 95, 190), (80, 180, 90), (190, 200, 110), (60, 130, 70), (170, 170, 170), (176, 104, 60)]
LIT = {33: "A", 50: "M", 100: "B", 200: "MB", 500: "R", 1000: "R"}


def num(s):
    try:
        v = float(str(s).replace(",", ""))
        return int(v) if v == int(v) else v
    except ValueError:
        return None


def dens(d):
    t = nrm(d)
    if not t.strip(): return None, None
    if "lo que indique" in t and not re.search(r"\d", t): return "Z", None
    m = re.search(r"(?:c/|cada|/|por cada)\s*([\d,]+(?:\.\d+)?)\s*m", t)
    if m:
        v = float(m.group(1).replace(",", ""))
        v = int(v) if v == int(v) else v
        return LIT.get(v), v
    if "lo que indique" in t: return "Z", None
    return None, None


ALC = {"ALVARO OBREGON": "Álvaro Obregón", "AZCAPOTZALCO": "Azcapotzalco", "BENITO JUAREZ": "Benito Juárez", "COYOACAN": "Coyoacán",
       "CUAJIMALPA": "Cuajimalpa de Morelos", "CUAUHTEMOC": "Cuauhtémoc", "GUSTAVO A. MADERO": "Gustavo A. Madero", "IZTACALCO": "Iztacalco",
       "IZTAPALAPA": "Iztapalapa", "MAGDALENA CONTRERAS": "La Magdalena Contreras", "MIGUEL HIDALGO": "Miguel Hidalgo", "MILPA ALTA": "Milpa Alta",
       "TLAHUAC": "Tláhuac", "TLALPAN": "Tlalpan", "VENUSTIANO CARRANZA": "Venustiano Carranza", "XOCHIMILCO": "Xochimilco"}
codes = []
for k in head["keys"]:
    alc, u, d, niv, alt, al, mn = (k.split("|") + [""] * 7)[:7]
    c = uso_code(u)
    lit, m2 = dens(d)
    niv, al, alt, mn = num(niv), num(al), num(alt), num(mn)
    note = ""
    mm = re.search(r"\*\s*\((.*)\)", u)
    if mm: note = mm.group(1).strip(); u = u[:mm.start()].strip()
    u = re.sub(r"\.$", "", u.strip())
    if c in ("H", "HC", "HO", "HM", "CB", "E", "I", "EA", "AV") and niv is not None and al is not None:
        clave = f"{c} {niv}/{al}" + (f"/{lit}" if lit else (f"/{m2}" if m2 else ""))
    else:
        clave = c if c not in ("O", "S") else ""
    codes.append([clave, u, CAT[c], niv, al, lit or "", m2, mn, alt, d.strip(), note, ALC.get(alc, alc.title())])

ix = np.floor(E / 1000).astype(int); iy = np.floor(N / 1000).astype(int)
os.makedirs(f"{out}/c", exist_ok=True)
cells = collections.defaultdict(list)
key = ix * 10000 + iy
order = np.argsort(key, kind="stable")
ks, starts = np.unique(key[order], return_index=True)
ends = list(starts[1:]) + [len(order)]
idx = []
for k, s0, s1 in zip(ks, starts, ends):
    sel = order[s0:s1]; cx, cy = int(k // 10000), int(k % 10000)
    dE = np.round((E[sel] - cx * 1000) * 10).astype("<i2"); dN = np.round((N[sel] - cy * 1000) * 10).astype("<i2")
    rec = np.empty(len(sel), dtype=[("e", "<i2"), ("n", "<i2"), ("c", "<u2")])
    rec["e"] = dE; rec["n"] = dN; rec["c"] = a[sel, 2]
    rec.tofile(f"{out}/c/{cx}_{cy}.bin"); idx.append(f"{cx}_{cy}")
json.dump({"fuente": "SEDUVI · datos abiertos CDMX (datos.cdmx.gob.mx, recurso Uso de suelo)", "n": int(len(a)),
           "f": ["clave", "uso", "cat", "niveles", "area_libre", "densidad", "m2_por_vivienda", "minimo_vivienda", "altura", "densidad_texto", "nota", "alcaldia"],
           "codes": codes, "cells": idx}, open(f"{out}/codes.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("puntos", len(a), "celdas", len(idx), "códigos", len(codes),
      "sin clave", sum(1 for c in codes if not c[0]))

if not DO_TILES:
    sys.exit()

# ---------- capa de colores: Voronoi de los predios (radio máx. R), borde entre zonas distintas ----------
R = 250.0
tree = cKDTree(np.c_[E, N])
rad = np.clip(.8 * tree.query(np.c_[E, N], k=3, workers=2)[0][:, 2], 45, R)   # predios aislados (lotes grandes) cubren más
catpt = np.array([codes[c][2] for c in a[:, 2]], np.uint8)
claveid = a[:, 2]
pal = np.array(COL + [(0, 0, 0)], np.uint8)
z0 = -1; m = TS / 2 ** z0                     # 512 m por tesela, 2 m por pixel
tx0, tx1 = int((E.min() - R - OE) // m), int((E.max() + R - OE) // m)
ty0, ty1 = int((ON - N.max() - R) // m), int((ON - N.min() + R) // m)
odir = f"{out}/z"
made = collections.defaultdict(set)
i = (np.arange(TS) + .5) * (m / TS)
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        cE, cN = OE + (tx + .5) * m, ON - (ty + .5) * m
        if not tree.query_ball_point([cE, cN], m * .71 + R, return_length=True):
            continue
        GE, GN = np.meshgrid(OE + tx * m + i, ON - ty * m - i)
        d, j = tree.query(np.c_[GE.ravel(), GN.ravel()], distance_upper_bound=R, workers=2)
        ok = np.isfinite(d)
        ok[ok] = d[ok] <= rad[j[ok]]
        if not ok.any(): continue
        jj = np.where(ok, j, 0).reshape(TS, TS)
        okk = ok.reshape(TS, TS)
        cat = np.where(okk, catpt[jj], 255)
        cid = np.where(okk, claveid[jj], -1)
        rgba = np.zeros((TS, TS, 4), np.uint8)
        rgba[okk, :3] = pal[cat[okk]]; rgba[okk, 3] = 150
        edge = np.zeros((TS, TS), bool)
        edge[:, 1:] |= cid[:, 1:] != cid[:, :-1]; edge[1:, :] |= cid[1:, :] != cid[:-1, :]
        edge &= okk
        rgba[edge, :3] = (rgba[edge, :3] * .55).astype(np.uint8); rgba[edge, 3] = 210
        os.makedirs(f"{odir}/{z0}/{tx}", exist_ok=True)
        Image.fromarray(rgba, "RGBA").save(f"{odir}/{z0}/{tx}/{ty}.webp", quality=80, method=4)
        made[z0].add((tx, ty))
    print("fila", ty, len(made[z0]), flush=True)

# pirámide hacia afuera (promedio 2x2)
for z in range(z0 - 1, -7, -1):
    par = collections.defaultdict(list)
    for (x, y) in made[z + 1]: par[(x // 2, y // 2)].append((x, y))
    for (X, Y), ch in par.items():
        big = np.zeros((TS * 2, TS * 2, 4), np.float32)
        for (x, y) in ch:
            big[(y - 2 * Y) * TS:(y - 2 * Y + 1) * TS, (x - 2 * X) * TS:(x - 2 * X + 1) * TS] = np.asarray(Image.open(f"{odir}/{z+1}/{x}/{y}.webp").convert("RGBA"), np.float32)
        al = big[..., 3:4] / 255
        prem = big[..., :3] * al
        s = lambda q: q.reshape(TS, 2, TS, 2, -1).mean((1, 3))
        A = s(al); C = s(prem) / np.maximum(A, 1e-6)
        img = np.dstack([C, A * 255]).clip(0, 255).astype(np.uint8)
        os.makedirs(f"{odir}/{z}/{X}", exist_ok=True)
        Image.fromarray(img, "RGBA").save(f"{odir}/{z}/{X}/{Y}.webp", quality=80, method=4)
        made[z].add((X, Y))
    print("z", z, len(made[z]), flush=True)
idx = {}
for z, ts in made.items():
    rows = collections.defaultdict(list)
    for x, y in ts: rows[y].append(x)
    enc = {}
    for y, xs in rows.items():
        xs.sort(); runs = []; s0 = p = xs[0]
        for v in xs[1:]:
            if v == p + 1: p = v; continue
            runs += [s0, p]; s0 = p = v
        runs += [s0, p]; enc[y] = runs
    idx[str(z)] = enc
json.dump(idx, open(f"{odir}/index.json", "w"), separators=(",", ":"))
print("listo", {k: len(v) for k, v in made.items()})
