/**
 * Geografia del lado servidor: carga la geometria oficial una sola vez desde
 * public/geo/distritos.geojson y resuelve el distrito de un punto con el
 * point-in-polygon de src/lib/geo.ts (mismas funciones que usa el ETL y que
 * cubren los tests).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  barrioDelPunto,
  distritoDelPunto,
  type ColeccionBarrios,
  type ColeccionDistritos,
  type Punto,
} from "./geo";

let coleccion: ColeccionDistritos | null = null;
let barrios: ColeccionBarrios | null = null;

const leer = <T>(archivo: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "public", "geo", archivo), "utf8")) as T;

export function getDistritosGeo(): ColeccionDistritos {
  if (!coleccion) coleccion = leer<ColeccionDistritos>("distritos.geojson");
  return coleccion;
}

/**
 * La capa de barrios, cargada una sola vez.
 *
 * Son 322 barrios y 334 KB: pesa mas que la de distritos, y por eso se lee
 * cuando alguien pregunta por un barrio y no al arrancar. Vive en public/ como
 * la de distritos —es dato abierto y se puede publicar— pero el navegador no la
 * descarga: el mapa dibuja distritos, no barrios, y la busqueda del barrio de
 * un punto la resuelve el servidor.
 */
export function getBarriosGeo(): ColeccionBarrios {
  if (!barrios) barrios = leer<ColeccionBarrios>("barrios.geojson");
  return barrios;
}

/** Numero de distrito que contiene al punto, o null si cae fuera del ejido. */
export function distritoDePunto(punto: Punto): number | null {
  return distritoDelPunto(punto, getDistritosGeo());
}

/** Nombre del barrio que contiene al punto, o null si no cae en ninguno. */
export function barrioDePunto(punto: Punto): string | null {
  return barrioDelPunto(punto, getBarriosGeo());
}
