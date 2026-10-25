#!/usr/bin/env python3
"""Arma sig/data/precios.json (capa "Precio por m²" del SIG) a partir de uno o varios CSV.

CSV con columnas: lat, lon, uso, precio_m2   (opcionales: fecha, fuente)
  uso: vivienda | renta | comercio | oficina | terreno   (otros valores se agregan como tipo nuevo)
  precio_m2: pesos por m² (renta: pesos por m² al mes)

Qué hace:
  1. Pasa cada punto a UTM 14N (el mismo sistema del SIG) y lo asigna a una celda cuadrada (500 m por omisión).
  2. Quita valores atípicos por tipo de inmueble (fuera de 1.5 rangos intercuartiles).
  3. Por celda y tipo guarda [mediana, n, p25, p75]. El mapa solo pinta celdas con n >= min_n.
No guarda direcciones ni puntos individuales: solo agregados por celda.

Uso:  python3 tools/precios/construir_precios.py datos1.csv [datos2.csv ...] --celda 500 --min-n 3 --fecha 2026-11-01
"""
import csv, json, math, sys, argparse, statistics, os

def utm14(lat, lon):
    a = 6378137.0; f = 1 / 298.257223563; n = f / (2 - f); k0 = 0.9996
    A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64)
    al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16, 13 * n * n / 48 - 3 * n ** 3 / 5, 61 * n ** 3 / 240]
    L0 = math.radians(-99); c2 = 2 * math.sqrt(n) / (1 + n)
    p = math.radians(lat); l = math.radians(lon) - L0; s = math.sin(p)
    t = math.sinh(math.atanh(s) - c2 * math.atanh(c2 * s))
    xi = math.atan(t / math.cos(l)); eta = math.atanh(math.sin(l) / math.sqrt(1 + t * t))
    E, N = eta, xi
    for j in range(1, 4):
        E += al[j - 1] * math.cos(2 * j * xi) * math.sinh(2 * j * eta)
        N += al[j - 1] * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
    return 500000 + k0 * A * E, k0 * A * N

def q(v, p):
    if not v: return float("nan")
    k = (len(v) - 1) * p; i = int(k); d = k - i
    return v[i] if i + 1 >= len(v) else v[i] * (1 - d) + v[i + 1] * d

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="+"); ap.add_argument("--celda", type=int, default=500)
    ap.add_argument("--min-n", type=int, default=3); ap.add_argument("--fecha", default=None)
    ap.add_argument("--salida", default=os.path.join(os.path.dirname(__file__), "..", "..", "sig", "data", "precios.json"))
    a = ap.parse_args()
    pts = {}; bad = 0
    for fn in a.csv:
        with open(fn, newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                try:
                    lat, lon, v = float(r["lat"]), float(r["lon"]), float(str(r["precio_m2"]).replace(",", "").replace("$", ""))
                    u = (r.get("uso") or "vivienda").strip().lower()
                except Exception:
                    bad += 1; continue
                if not (18.8 < lat < 19.9 and -99.6 < lon < -98.7) or v <= 0: bad += 1; continue
                pts.setdefault(u, []).append((lat, lon, v))
    out_cells = {}; uses = {}
    LABEL = {"vivienda": "Vivienda en venta", "renta": "Vivienda en renta", "comercio": "Comercio", "oficina": "Oficinas", "terreno": "Terreno"}
    for u, P in pts.items():
        vals = sorted(p[2] for p in P); q1, q3 = q(vals, .25), q(vals, .75); iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        uses[u] = {"label": LABEL.get(u, u.capitalize())}
        if u == "renta": uses[u]["unit"] = "MXN/m² al mes"
        cells = {}
        for lat, lon, v in P:
            if not (lo <= v <= hi): continue
            E, N = utm14(lat, lon); i, j = int(E // a.celda), int(N // a.celda)
            cells.setdefault((i, j), []).append(v)
        for (i, j), vs in cells.items():
            vs.sort(); c = out_cells.setdefault((i, j), {"e": round((i + .5) * a.celda), "n": round((j + .5) * a.celda), "v": {}})
            c["v"][u] = [round(statistics.median(vs)), len(vs), round(q(vs, .25)), round(q(vs, .75))]
    doc = {"version": 1, "updated": a.fecha, "unit": "MXN/m²", "cell": a.celda, "min_n": a.min_n,
           "uses": uses or {"vivienda": {"label": "Vivienda en venta"}}, "cells": list(out_cells.values())}
    with open(a.salida, "w", encoding="utf-8") as fh: json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{sum(len(p) for p in pts.values())} puntos leídos, {bad} descartados, {len(out_cells)} celdas -> {a.salida}")

if __name__ == "__main__": main()
