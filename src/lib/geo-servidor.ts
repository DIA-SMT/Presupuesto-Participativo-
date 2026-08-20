/**
 * Geografia del lado servidor: carga la geometria oficial una sola vez desde
 * public/geo/distritos.geojson y resuelve el distrito de un punto con el
 * point-in-polygon de src/lib/geo.ts (mismas funciones que usa el ETL y que
 * cubren los tests).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  distritoDelPunto,
  type ColeccionDistritos,
  type Punto,
} from "./geo";

let coleccion: ColeccionDistritos | null = null;

export function getDistritosGeo(): ColeccionDistritos {
  if (!coleccion) {
    const ruta = join(process.cwd(), "public", "geo", "distritos.geojson");
    coleccion = JSON.parse(readFileSync(ruta, "utf8")) as ColeccionDistritos;
  }
  return coleccion;
}

/** Numero de distrito que contiene al punto, o null si cae fuera del ejido. */
export function distritoDePunto(punto: Punto): number | null {
  return distritoDelPunto(punto, getDistritosGeo());
}
