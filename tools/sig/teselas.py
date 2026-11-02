#!/usr/bin/env python3
"""SIG · genera una sola pirámide de teselas (cuadrícula UTM 14N del visor, 256 px, WebP) con todos los planos.

Cada hoja (Edomex o CDMX) se describe con:
  id, prio (mayor = encima), A (afín 2x3: pixel = A · [E, N, 1], UTM 14N WGS84) y un cargador de imagen RGBA.
El visor carga solo las teselas que se ven, a la resolución del zoom: el mapa entero se recorre sin
descargar hojas completas.

Esquema (igual al L.CRS.Simple del visor): en el zoom z un pixel mide 2^-z m; la tesela (x, y) cubre
E = OE + [x, x+1]*256/2^z  y  N = ON - [y, y+1]*256/2^z, con (OE, ON) = DATA.o de edomex.js.
Uso:  python3 tools/sig/teselas.py --out sig/t --zmin -6 --zmax 0
Salida: sig/t/{z}/{x}/{y}.webp  +  sig/t/index.json (qué teselas existen, por fila, en rangos).
"""
import argparse, json, math, os, sys, collections
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

Image.MAX_IMAGE_PIXELS = None
TS = 256


OE = ON = None
MM = os.environ.get("SIG_MM", "/tmp/sig-mm")
os.makedirs(MM, exist_ok=True)


def tile_pixel_utm(z, x, y):
    m = TS / 2 ** z
    i = (np.arange(TS) + .5) / TS * m
    E, N = np.meshgrid(OE + x * m + i, ON - y * m - i)
    return E, N


def utm_to_tile(E, N, z):
    m = TS / 2 ** z
    return (E - OE) / m, (ON - N) / m


class Sheet:
    def __init__(self, sid, prio, A, size, loader, utm_bbox):
        self.id, self.prio, self.A, self.size, self.loader, self.bbox = sid, prio, np.asarray(A, float), size, loader, utm_bbox


def edomex_sheets(repo):
    s = open(os.path.join(repo, "sig/data/edomex.js")).read()
    d = json.loads(s[s.index("DATA=") + 5:].split(";\n")[0].rstrip(";"))
    base = os.path.join(repo, "sig-edomex/s")
    out = []
    for i, sh in enumerate(d["s"]):
        w, h = sh["w"], sh["h"]
        sx, sy = w / (sh["E1"] - sh["E0"]), h / (sh["N0"] - sh["N1"])
        A = [[sx, 0, -sx * sh["E0"]], [0, -sy, sy * sh["N0"]]]
        def load(sh=sh, w=w, h=h):
            im = np.zeros((h, w, 4), np.uint8)
            for f, x, y, cw, ch in sh["k"]:
                t = np.asarray(Image.open(os.path.join(base, f)).convert("RGBA"))
                im[y:y + t.shape[0], x:x + t.shape[1]] = t[:h - y, :w - x]
            return im
        prio = 100 - i if not sh["g"] else 10 - i / 100
        out.append(Sheet(sh["c"], prio, A, (w, h), load, (sh["E0"], sh["N1"], sh["E1"], sh["N0"])))
    return out


def cdmx_sheets(repo):
    p = os.path.join(repo, "tools/sig/cdmx_hojas.json")
    if not os.path.exists(p):
        return []
    out = []
    for sh in json.load(open(p)):
        img = os.path.join(repo, sh["img"])
        def load(img=img):
            return np.asarray(Image.open(img).convert("RGBA"))
        out.append(Sheet(sh["id"], sh["prio"], sh["A"], tuple(sh["size"]), load, tuple(sh["bbox"])))
    return out


class Cache:
    def __init__(self, n):
        self.n, self.d = n, collections.OrderedDict()

    def get(self, sh):
        # each sheet is decoded once to an uncompressed .npy and then memory-mapped: overlapping sheets
        # (district + general plans) stay cheap to sample without holding them all in RAM
        p = os.path.join(MM, sh.id + ".npy")
        if not os.path.exists(p):
            np.save(p, sh.loader())
        if sh.id in self.d:
            self.d.move_to_end(sh.id)
            return self.d[sh.id]
        im = np.load(p, mmap_mode="r")
        self.d[sh.id] = im
        while len(self.d) > self.n:
            self.d.popitem(last=False)
        return im


def render(sheets, cache, z, x, y):
    E, N = tile_pixel_utm(z, x, y)
    acc = np.zeros((TS, TS, 4), np.float32)
    e0, n0, e1, n1 = E.min(), N.min(), E.max(), N.max()
    for sh in sorted(sheets, key=lambda s: s.prio):          # low priority first, then painted over
        b = sh.bbox
        if b[2] < e0 or b[0] > e1 or b[3] < n0 or b[1] > n1:
            continue
        px = sh.A[0, 0] * E + sh.A[0, 1] * N + sh.A[0, 2]
        py = sh.A[1, 0] * E + sh.A[1, 1] * N + sh.A[1, 2]
        w, h = sh.size
        inside = (px >= 0) & (py >= 0) & (px < w - 1) & (py < h - 1)
        if not inside.any():
            continue
        im = cache.get(sh)
        src = np.stack([map_coordinates(im[..., c], [py, px], order=1, mode="constant", cval=0) for c in range(4)], -1).astype(np.float32)
        src[~inside] = 0
        a = src[..., 3:4] / 255
        acc[..., :3] = src[..., :3] * a + acc[..., :3] * (1 - a)
        acc[..., 3:4] = 255 * (a + acc[..., 3:4] / 255 * (1 - a))
    return acc


def save(acc, path, q):
    if acc[..., 3].max() < 8:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(np.clip(acc + .5, 0, 255).astype(np.uint8), "RGBA").save(path, "WEBP", quality=q, method=5, alpha_quality=60)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", default="sig/t")
    ap.add_argument("--zmin", type=int, default=-6)
    ap.add_argument("--zmax", type=int, default=0)
    ap.add_argument("--q", type=int, default=62)
    ap.add_argument("--only", default="", help="ids de hojas a re-generar (coma); solo toca sus teselas")
    a = ap.parse_args()
    global OE, ON
    s = open(os.path.join(a.repo, "sig/data/edomex.js")).read()
    OE, ON = json.loads(s[s.index("DATA=") + 5:].split(";\n")[0].rstrip(";"))["o"]
    sheets = edomex_sheets(a.repo) + cdmx_sheets(a.repo)
    only = set(filter(None, a.only.split(",")))
    z = a.zmax
    todo = {}
    for sh in sheets:
        if only and sh.id not in only:
            continue
        e0, n0, e1, n1 = sh.bbox
        x0, y1 = utm_to_tile(e0, n0, z)
        x1, y0 = utm_to_tile(e1, n1, z)
        for ty in range(math.floor(y0), math.floor(y1) + 1):
            for tx in range(math.floor(x0), math.floor(x1) + 1):
                todo.setdefault((tx, ty), sh.id)
    keys = sorted(todo, key=lambda k: (todo[k], k[1], k[0]))
    cache = Cache(64)
    made = set()
    for i, (tx, ty) in enumerate(keys):
        p = f"{a.out}/{z}/{tx}/{ty}.webp"
        if save(render(sheets, cache, z, tx, ty), p, a.q):
            made.add((tx, ty))
        elif only and os.path.exists(p):
            os.remove(p)
        if i % 500 == 0:
            print(f"z{z} {i}/{len(keys)}", file=sys.stderr, flush=True)
    # lower zooms: 2x2 downsample of children (only the parents of touched tiles)
    level = {k for k in todo}
    for zz in range(z - 1, a.zmin - 1, -1):
        parents = {(x // 2, y // 2) for x, y in level}
        for px, py in parents:
            big = Image.new("RGBA", (512, 512))
            for dx in (0, 1):
                for dy in (0, 1):
                    c = f"{a.out}/{zz + 1}/{2 * px + dx}/{2 * py + dy}.webp"
                    if os.path.exists(c):
                        big.paste(Image.open(c).convert("RGBA"), (dx * 256, dy * 256))
            arr = np.asarray(big.resize((256, 256), Image.LANCZOS)).astype(np.float32)
            p = f"{a.out}/{zz}/{px}/{py}.webp"
            if not save(arr, p, a.q + 6) and os.path.exists(p):
                os.remove(p)
        level = parents
    build_index(a.out)


def build_index(out):
    idx = {}
    for zs in os.listdir(out):
        if not zs.lstrip("-").isdigit():
            continue
        rows = collections.defaultdict(list)
        for xs in os.listdir(f"{out}/{zs}"):
            for f in os.listdir(f"{out}/{zs}/{xs}"):
                rows[int(f.split(".")[0])].append(int(xs))
        enc = {}
        for y, xs in rows.items():
            xs.sort(); runs = []; s = p = xs[0]
            for v in xs[1:]:
                if v == p + 1:
                    p = v; continue
                runs += [s, p]; s = p = v
            runs += [s, p]; enc[y] = runs
        idx[zs] = enc
    json.dump(idx, open(f"{out}/index.json", "w"), separators=(",", ":"))
    print("index", {k: sum(len(v) // 2 for v in d.values()) for k, d in idx.items()})


if __name__ == "__main__":
    main()
