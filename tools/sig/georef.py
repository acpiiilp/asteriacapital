#!/usr/bin/env python3
"""SIG · georreferencia un plano escaneado (sin cuadrícula de coordenadas) contra las calles de OpenStreetMap.

Idea: las calles del plano son los "huecos" claros entre manzanas de color. Se rasteriza la red de OSM en
UTM 14N y se busca la transformación (escala, giro, traslación) que mejor empalma ambas redes; luego se
afina a una afín con ECC. Se guarda la matriz pixel <- UTM (A, 2x3) y una imagen de control.

Uso: python3 georef.py plano.jpg --osm calles.json.gz --centro 19.4335,-99.195 --ancho 2400 [--giro -5..5]
  --ancho: ancho aproximado del polígono del programa en metros (de la escala gráfica o del mapa).
"""
import argparse, gzip, json, math, sys
import numpy as np, cv2
from PIL import Image
from pyproj import Transformer

Image.MAX_IMAGE_PIXELS = None
WGS2UTM = Transformer.from_crs("EPSG:4326", "EPSG:32614", always_xy=True)
W = {"motorway": 30, "trunk": 28, "primary": 24, "secondary": 18, "tertiary": 14, "motorway_link": 10, "trunk_link": 10,
     "primary_link": 10, "secondary_link": 10, "residential": 9, "unclassified": 9, "living_street": 7}


def load_osm(path):
    d = json.load(gzip.open(path) if path.endswith(".gz") else open(path))
    ways = []
    for e in d["elements"]:
        if e.get("type") != "way" or "geometry" not in e:
            continue
        lon = [p["lon"] for p in e["geometry"]]; lat = [p["lat"] for p in e["geometry"]]
        E, N = WGS2UTM.transform(lon, lat)
        ways.append((np.c_[E, N], W.get(e.get("tags", {}).get("highway"), 8)))
    return ways


def osm_raster(ways, E0, N1, mpp, w, h):
    r = np.zeros((h, w), np.uint8)
    for xy, wd in ways:
        p = np.c_[(xy[:, 0] - E0) / mpp, (N1 - xy[:, 1]) / mpp].round().astype(np.int32)
        cv2.polylines(r, [p], False, 255, max(1, int(round(wd / mpp))))
    return r


def plan_streets(rgb):
    """street mask: light, unsaturated pixels inside the colored zoning area."""
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    v, s = hsv[..., 2].astype(int), hsv[..., 1].astype(int)
    import os
    smin = int(os.environ.get("SIG_SMIN", 40))                  # pale scans (cream fills) need ~25
    colored = (s > smin) & (v > 90)
    light = (v > 215) & (s < min(28, smin - 8))
    k = max(5, int(min(rgb.shape[:2]) / 60)) | 1
    area = cv2.morphologyEx(colored.astype(np.uint8) * 255, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    area = cv2.erode(area, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    m = (light & (area > 0)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return m, area


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("img"); ap.add_argument("--osm", required=True)
    ap.add_argument("--centro", required=True); ap.add_argument("--ancho", type=float, required=True)
    ap.add_argument("--giro", default="-6,6"); ap.add_argument("--crop", default="", help="x0,y0,x1,y1 en pixeles del plano (zona del mapa)")
    ap.add_argument("--out", required=True); ap.add_argument("--mpp", type=float, default=6.0)
    a = ap.parse_args()
    full = np.asarray(Image.open(a.img).convert("RGB"))
    H0, W0 = full.shape[:2]
    cx0 = cy0 = 0
    if a.crop:
        x0, y0, x1, y1 = map(int, a.crop.split(","))
        full = full[y0:y1, x0:x1]; cx0, cy0 = x0, y0
    lat, lon = map(float, a.centro.split(","))
    Ec, Nc = WGS2UTM.transform(lon, lat)
    ways = load_osm(a.osm)
    mpp = a.mpp
    # OSM search window: 3x the program width around the center
    R = a.ancho * 1.6
    E0, N1 = Ec - R, Nc + R
    ow = oh = int(2 * R / mpp)
    osm = osm_raster(ways, E0, N1, mpp, ow, oh)
    osm_f = cv2.GaussianBlur(osm.astype(np.float32) / 255, (0, 0), 1.2)
    m, area = plan_streets(full)
    # plan width in pixels: extent of the zoning area
    ys, xs = np.nonzero(area)
    pw = xs.max() - xs.min()
    s0 = a.ancho / pw                                # metres per plan pixel (initial)
    g0, g1 = map(float, a.giro.split(","))
    best = (-1,)
    for sc in np.linspace(.85, 1.15, 13):
        s = s0 * sc
        f = s / mpp                                   # plan px -> osm px
        small = cv2.resize(m, None, fx=f, fy=f, interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        if small.shape[0] >= oh or small.shape[1] >= ow:
            continue
        for g in np.arange(g0, g1 + .01, 1.0):
            M = cv2.getRotationMatrix2D((small.shape[1] / 2, small.shape[0] / 2), g, 1)
            rot = cv2.warpAffine(small, M, (small.shape[1], small.shape[0]))
            res = cv2.matchTemplate(osm_f, rot, cv2.TM_CCORR_NORMED)
            _, v, _, loc = cv2.minMaxLoc(res)
            if v > best[0]:
                best = (v, sc, g, loc, M, f, small.shape)
    v, sc, g, loc, M, f, shp = best
    print(f"coarse score {v:.3f} scale {sc:.3f} rot {g:.1f}", file=sys.stderr)
    # compose: plan px -> small px (f) -> rotated (M) -> osm px (+loc) -> UTM
    S = np.array([[f, 0, 0], [0, f, 0], [0, 0, 1]])
    Mr = np.vstack([M, [0, 0, 1]])
    T = np.array([[1, 0, loc[0]], [0, 1, loc[1]], [0, 0, 1]])
    P2O = T @ Mr @ S                                   # plan px -> osm px
    # refine with ECC at finer resolution (affine)
    mpp2 = mpp / 2
    osm2 = osm_raster(ways, E0, N1, mpp2, ow * 2, oh * 2)
    osm2 = cv2.GaussianBlur(osm2.astype(np.float32) / 255, (0, 0), 1.5)
    P2O2 = np.diag([2, 2, 1]) @ P2O
    warp = P2O2[:2].astype(np.float32)
    plan_w = cv2.warpAffine(m.astype(np.float32) / 255, warp, (osm2.shape[1], osm2.shape[0]))
    try:
        # ECC estimates map osm->plan_w misalignment; apply as correction
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5)
        wm = np.eye(2, 3, dtype=np.float32)
        cc, wm = cv2.findTransformECC(osm2, cv2.GaussianBlur(plan_w, (0, 0), 1.5), wm, cv2.MOTION_AFFINE, crit, None, 5)
        Wm = np.vstack([wm, [0, 0, 1]])                # osm2 px -> plan_w px
        P2O2 = np.linalg.inv(Wm) @ P2O2
        print(f"ecc {cc:.3f}", file=sys.stderr)
    except cv2.error as e:
        cc = None; print("ecc failed", e, file=sys.stderr)
    # osm2 px -> UTM
    O2U = np.array([[mpp2, 0, E0], [0, -mpp2, N1], [0, 0, 1]])
    shift = np.array([[1, 0, -cx0], [0, 1, -cy0], [0, 0, 1]])  # full plan px -> crop px
    P2U = O2U @ P2O2 @ shift                            # full plan px -> UTM
    U2P = np.linalg.inv(P2U)
    out = {"A": U2P[:2].tolist(), "size": [W0, H0], "score": float(v), "ecc": cc, "m_per_px": float(math.sqrt(abs(np.linalg.det(P2U[:2, :2]))))}
    json.dump(out, open(a.out, "w"), indent=1)
    # control image: OSM streets in red over the plan crop, at osm2 resolution
    vis = cv2.warpAffine(full, P2O2[:2], (osm2.shape[1], osm2.shape[0]), borderValue=(255, 255, 255))
    vis[osm2 > .5] = (220, 0, 0)
    Image.fromarray(vis).save(a.out.replace(".json", "_check.jpg"), quality=80)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
