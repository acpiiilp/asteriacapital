#!/usr/bin/env python3
"""SIG · georreferencia por puntos de control (cruces de calles con nombre, coordenadas de OpenStreetMap).

  gcp.py cruce calles.json.gz "Insurgentes Sur" "Extremadura" [cerca_lat,lon]   -> E N del cruce
  gcp.py ver plano.jpg x0,y0,x1,y1 salida.jpg [ancho]                           -> recorte con cuadrícula de pixeles
  gcp.py ajustar puntos.tsv salida.json ancho_px alto_px                         -> afín UTM->pixel y residuales
puntos.tsv: px  py  calle1  calle2  [cerca]   (una fila por cruce)
"""
import sys, json, gzip, re, unicodedata, numpy as np
from pyproj import Transformer

T = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True)


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9 ]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


_W = None
def ways(osm):
    global _W
    if _W is None:
        d = json.load(gzip.open(osm))
        _W = []
        for e in d["elements"]:
            if e.get("type") == "way" and "geometry" in e:
                t = e.get("tags", {})
                names = " | ".join(norm(t.get(k, "")) for k in ("name", "alt_name", "old_name", "official_name") if t.get(k))
                g = e["geometry"]
                E, N = T.transform([p["lon"] for p in g], [p["lat"] for p in g])
                _W.append((names, np.c_[E, N]))
    return _W


def seg_inter(p, q):
    """all intersection points between two polylines"""
    out = []
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        for j in range(len(q) - 1):
            c, d = q[j], q[j + 1]
            r, s = b - a, d - c
            den = r[0] * s[1] - r[1] * s[0]
            if abs(den) < 1e-9:
                continue
            t = ((c - a)[0] * s[1] - (c - a)[1] * s[0]) / den
            u = ((c - a)[0] * r[1] - (c - a)[1] * r[0]) / den
            if -1e-6 <= t <= 1 + 1e-6 and -1e-6 <= u <= 1 + 1e-6:
                out.append(a + t * r)
    return out


def near_end(p, q, tol=25):
    """streets that meet at an end node without crossing"""
    out = []
    for a in (p[0], p[-1]):
        dd = np.hypot(*(q - a).T)
        if dd.min() < tol:
            out.append(a)
    for a in (q[0], q[-1]):
        dd = np.hypot(*(p - a).T)
        if dd.min() < tol:
            out.append(a)
    return out


def cruce(osm, a, b, cerca=None):
    A, B = norm(a), norm(b)
    wa = [g for n, g in ways(osm) if A in n]
    wb = [g for n, g in ways(osm) if B in n]
    pts = []
    for p in wa:
        for q in wb:
            pts += seg_inter(p, q) or near_end(p, q)
    if not pts:
        return None, len(wa), len(wb)
    pts = np.array(pts)
    if cerca:
        v = list(map(float, cerca.split(",")))
        e, n = T.transform(v[1], v[0]); R = v[2] if len(v) > 2 else 0
        d = np.hypot(pts[:, 0] - e, pts[:, 1] - n)
        pts = pts[d < R] if R else pts[d < d.min() + 60]
        if not len(pts):
            return None, len(wa), len(wb)
    # several carriageways: average the cluster nearest its centroid
    c = pts.mean(0)
    if np.hypot(*(pts - c).T).max() > 120:
        k = np.argmin(np.hypot(*(pts - np.median(pts, 0)).T)); c0 = pts[k]
        pts = pts[np.hypot(*(pts - c0).T) < 60]; c = pts.mean(0)
    return c, len(wa), len(wb)


def main():
    cmd = sys.argv[1]
    if cmd == "cruce":
        c, na, nb = cruce(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] if len(sys.argv) > 5 else None)
        print(c if c is None else f"{c[0]:.1f} {c[1]:.1f}", na, nb)
    elif cmd == "ver":
        from PIL import Image, ImageDraw
        import cv2
        Image.MAX_IMAGE_PIXELS = None
        x0, y0, x1, y1 = map(int, sys.argv[3].split(","))
        W = int(sys.argv[5]) if len(sys.argv) > 5 else 1400
        im = Image.open(sys.argv[2]).convert("RGB").crop((x0, y0, x1, y1))
        s = W / im.width; im = im.resize((W, int(im.height * s)))
        d = ImageDraw.Draw(im)
        step = max(50, int(round((x1 - x0) / 10, -2)))
        for gx in range((x0 // step + 1) * step, x1, step):
            X = (gx - x0) * s; d.line([(X, 0), (X, im.height)], fill=(0, 160, 255), width=1); d.text((X + 2, 2), str(gx), fill=(0, 0, 255))
        for gy in range((y0 // step + 1) * step, y1, step):
            Y = (gy - y0) * s; d.line([(0, Y), (im.width, Y)], fill=(0, 160, 255), width=1); d.text((2, Y + 2), str(gy), fill=(0, 0, 255))
        im.save(sys.argv[4], quality=85)
    elif cmd == "ajustar":
        osm = "/root/src/osm/calles.json.gz"
        lines = open(sys.argv[2]).read().splitlines()
        cen = next((l.split()[1] for l in lines if l.startswith("#centro")), None)   # "#centro lat,lon,R"
        rows = [l.split("\t") for l in lines if l.strip() and not l.startswith("#")]
        P, U, lab = [], [], []
        for r in rows:
            c, na, nb = cruce(osm, r[2], r[3], r[4] if len(r) > 4 and r[4] else cen)
            if c is None:
                print("SIN CRUCE", r[2], "x", r[3], na, nb); continue
            P.append([float(r[0]), float(r[1])]); U.append(c); lab.append(r[2] + " x " + r[3])
        P, U = np.array(P), np.array(U)
        X = np.c_[U, np.ones(len(U))]
        A, *_ = np.linalg.lstsq(X, P, rcond=None)           # UTM -> px
        # re-resolve each crossing near where the first fit puts it (names repeat across the city)
        U2T = Transformer.from_crs("EPSG:32614", "EPSG:4326", always_xy=True)
        for it in range(3):
            Ai = np.linalg.lstsq(np.c_[P, np.ones(len(P))], U, rcond=None)[0]
            pred = np.c_[P, np.ones(len(P))] @ Ai
            keep = []
            for i, l in enumerate(lab):
                lo, la = U2T.transform(*pred[i]); a1, b1 = l.split(" x ")
                c, *_ = cruce(osm, a1, b1, f"{la},{lo},{350 if it == 0 else 200}")
                if c is not None:
                    U[i] = c; keep.append(i)
            X = np.c_[U, np.ones(len(U))]
            w = np.zeros(len(U)); w[keep] = 1
            A, *_ = np.linalg.lstsq(X * w[:, None], P * w[:, None], rcond=None)
        res = X @ A - P
        Ai = np.linalg.lstsq(np.c_[P, np.ones(len(P))], U, rcond=None)[0]
        mpp = float(np.sqrt(abs(np.linalg.det(Ai[:2].T))))
        for l, e in zip(lab, res):
            print(f"{l:55s} residual {np.hypot(*e) * mpp:6.1f} m")
        json.dump({"A": A.T.tolist(), "size": [int(sys.argv[4]), int(sys.argv[5])], "m_per_px": mpp, "gcp": len(P),
                   "rms_m": float(np.sqrt((res ** 2).sum(1).mean()) * mpp)}, open(sys.argv[3], "w"), indent=1)
        print("m/px", round(mpp, 3), "rms m", round(float(np.sqrt((res ** 2).sum(1).mean()) * mpp), 1))


if __name__ == "__main__":
    main()
