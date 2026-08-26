# Conversion de la geografia oficial

Generado por `npx tsx scripts/geo-oficial.ts` desde `data/geo-oficial/`.

## Distritos

- distritos: 20 features desde la capa oficial corregida
- vienen en WGS84 segun su .prj: no se reproyecta nada

Diferencia contra la geometria que estaba en uso:

- D 1: la caja se corre 12 m
- D 2: la caja se corre 26 m
- D 3: la caja se corre 11 m
- D 4: la caja se corre 14 m
- D 5: la caja se corre 22 m
- D 6: la caja se corre 21 m
- D 7: la caja se corre 39 m
- D 8: la caja se corre 27 m
- D 9: la caja se corre 20 m
- D10: la caja se corre 24 m
- D11: la caja se corre 34 m
- D12: la caja se corre 32 m
- D13: la caja se corre 19 m
- D14: la caja se corre 17 m
- D15: la caja se corre 607 m
- D16: la caja se corre 35 m
- D17: la caja se corre 15 m
- D18: la caja se corre 19 m
- D19: la caja se corre 563 m
- D20: la caja se corre 16 m

## Barrios

- 327 poligonos en el archivo original
- 322 barrios en la capa final (un registro por nombre)
- reproyectados de Gauss-Kruger faja 3 (POSGAR) a WGS84; el archivo original
  no declaraba su sistema de coordenadas (ver `src/lib/gauss-kruger.ts`)

### Nombres con mas de un poligono (4)

No son duplicados: son barrios distintos que comparten nombre. Se agrupan en
un multipoligono para que el nombre quede unico sin perder geometria.

- VIAL: 2 poligonos
- SAN JOSE: 2 poligonos
- SAN MARTIN: 2 poligonos
- SAN MIGUEL: 2 poligonos

### Excluidos (1)

- ASENTAMIENTO FRANCISCO I (AMPLIACIÓN): queda fuera del ejido municipal (confirmado por el municipio, 26/08/2026)

### Marcados para revisar (8)

Traian `Problemas = si` en el archivo del municipio y nadie supo decir que
significa. Se conservan; el marcador queda en la propiedad `revisar`.

- 11 DE FEBRERO
- AMPLIACION FEDERAL
- AMPLIACION VILLA ALEM
- ASENTAMIENTO MARGARITA
- LOS VAZQUEZ I
- LOS VAZQUEZ II
- PARQUE SUR (FALIVENE)
- SAN FERNANDO

