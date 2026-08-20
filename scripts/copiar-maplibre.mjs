/**
 * Copia el worker de MapLibre (y su modulo compartido) a public/maplibre.
 *
 * MapLibre procesa las fuentes GeoJSON en un Web Worker. Empaquetado por
 * Turbopack, el worker no se sirve como modulo y el mapa queda sin poligonos,
 * asi que se sirve como archivo estatico y se apunta con setWorkerUrl()
 * (ver src/components/Mapa.tsx). Corre en el postinstall para que la copia
 * siga a la version instalada de maplibre-gl.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const origen = join("node_modules", "maplibre-gl", "dist");
const destino = join("public", "maplibre");

mkdirSync(destino, { recursive: true });
for (const archivo of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(origen, archivo), join(destino, archivo));
}
console.log("maplibre: worker copiado a public/maplibre");
