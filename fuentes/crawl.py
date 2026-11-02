#!/usr/bin/env python3
"""Baja, una sola vez y despacio, los PDF enlazados desde una página que coincidan con un patrón.
Uso: python3 crawl.py <url_pagina> <regex_nombre> <carpeta_salida>"""
import re, sys, time, os, urllib.parse, urllib.request

page, pat, out = sys.argv[1], re.compile(sys.argv[2], re.I), sys.argv[3]
os.makedirs(out, exist_ok=True)
H = {"User-Agent": "Mozilla/5.0"}
html = urllib.request.urlopen(urllib.request.Request(page, headers=H), timeout=60).read().decode("utf-8", "ignore")
links = sorted({urllib.parse.urljoin(page, h) for h in re.findall(r'href="([^"]+)"', html)})
with open(os.path.join(out, "enlaces.txt"), "w") as f:
    f.write("\n".join(links))
for u in links:
    name = urllib.parse.unquote(u.rsplit("/", 1)[-1])
    if not name.lower().endswith((".pdf", ".jpg", ".png", ".zip")) or not pat.search(name):
        continue
    try:
        data = urllib.request.urlopen(urllib.request.Request(urllib.parse.quote(u, safe=":/%?=&"), headers=H), timeout=300).read()
        open(os.path.join(out, name.replace(" ", "_")), "wb").write(data)
        print("ok", name, len(data))
    except Exception as e:
        print("fail", name, e)
    time.sleep(4)
