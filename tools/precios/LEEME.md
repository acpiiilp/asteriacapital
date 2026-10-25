# Capa "Precio por m²" del SIG

1. Junta los datos en un CSV con las columnas de `plantilla.csv`: `lat, lon, uso, precio_m2` (y si quieres `fecha, fuente`).
   - `uso`: vivienda, renta, comercio, oficina o terreno.
   - `precio_m2`: pesos por m² (en renta, pesos por m² al mes).
2. Corre `python3 tools/precios/construir_precios.py tus_datos.csv --fecha 2026-11-01`.
3. Se reescribe `sig/data/precios.json` y el SIG pinta la capa sola (rejilla de 500 m, mediana por celda, mínimo 3 datos).

El archivo publicado solo tiene agregados por celda; nunca puntos ni direcciones.
