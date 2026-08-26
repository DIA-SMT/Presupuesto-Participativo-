/**
 * Gauss-Kruger argentino, faja 3, a coordenadas geograficas (WGS84).
 *
 * Por que existe: la capa oficial de barrios que entrego el municipio
 * (data/geo-oficial/barrios-2022.shp) viene en metros proyectados y **no
 * declara su sistema de coordenadas**. No trae .prj, y el GeoPackage que
 * acompaña al shapefile dice literalmente "Undefined SRS". Sin reproyectar, sus
 * coordenadas (3.572.085 / 7.026.005) no significan nada para el sitio.
 *
 * Como se determino el sistema, porque no estaba escrito en ninguna parte:
 *
 *  1. La longitud calzo con faja 3 (meridiano central -66, falsa abscisa
 *     3.500.000) con 38 m de error contra la capa de distritos, que si viene en
 *     WGS84. Un numero de faja equivocado se habria ido grados enteros.
 *  2. La falsa ordenada se ajusto por fuerza bruta: se barrio de 9.996.000 a
 *     10.006.000 midiendo cuantos de los 327 centroides de barrio caen dentro
 *     de los 20 distritos. La curva tiene un pico limpio en 10.002.000, que es
 *     el valor estandar argentino 10.001.965,729 (el arco de meridiano del
 *     ecuador al polo sobre el elipsoide GRS80).
 *  3. Entre los dos datums posibles gano POSGAR: con POSGAR entran 326 de 327
 *     centroides, con Campo Inchauspe 321.
 *  4. Lucas lo confirmo con el area que armo el archivo (26/08/2026).
 *
 * O sea EPSG:22183 (POSGAR 94 / Argentina 3) o EPSG:5345 (POSGAR 2007 /
 * Argentina 3): para este uso son equivalentes, porque los dos se apoyan en
 * GRS80 y no necesitan corrimiento de datum hacia WGS84 a esta escala.
 *
 * La transformacion es la inversa de Transverse Mercator con factor de escala 1
 * (Snyder, "Map Projections: A Working Manual", 1987, paginas 63-64).
 */

/** GRS80, el elipsoide de POSGAR. A esta escala es igual a WGS84. */
const SEMIEJE_MAYOR = 6378137.0;
const APLANAMIENTO = 1 / 298.257222101;

/** Faja 3: meridiano central -66, y los desplazamientos estandar del pais. */
const MERIDIANO_CENTRAL = -66;
const FALSA_ABSCISA = 3_500_000;
/** Arco del ecuador al polo sobre GRS80: el valor que fija la faja argentina. */
const FALSA_ORDENADA = 10_001_965.729;

const E2 = 2 * APLANAMIENTO - APLANAMIENTO * APLANAMIENTO;
const EP2 = E2 / (1 - E2);
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

/**
 * Convierte un par (este, norte) de la faja 3 a [longitud, latitud] en grados.
 *
 * Devuelve el par en orden GeoJSON: primero longitud.
 */
export function fajaTresAGeografica(este: number, norte: number): [number, number] {
  const x = este - FALSA_ABSCISA;
  const y = norte - FALSA_ORDENADA;

  // Latitud del pie de la perpendicular.
  const mu = y / (SEMIEJE_MAYOR * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const lat1 =
    mu +
    ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu);

  const sen = Math.sin(lat1);
  const cos = Math.cos(lat1);
  const tan = Math.tan(lat1);
  const c1 = EP2 * cos * cos;
  const t1 = tan * tan;
  const n1 = SEMIEJE_MAYOR / Math.sqrt(1 - E2 * sen * sen);
  const r1 = (SEMIEJE_MAYOR * (1 - E2)) / (1 - E2 * sen * sen) ** 1.5;
  const d = x / n1;

  const lat =
    lat1 -
    ((n1 * tan) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6) / 720);

  const lon =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5) / 120) /
    cos;

  return [
    MERIDIANO_CENTRAL + (lon * 180) / Math.PI,
    (lat * 180) / Math.PI,
  ];
}

/**
 * Si un par de numeros parece una coordenada de la faja 3 y no un par lat/lon.
 *
 * Sirve para el ETL: el sitio anterior guardaba las ubicaciones en un campo de
 * texto libre y algunas venian en metros proyectados. Los rangos son los del
 * ejido de San Miguel de Tucuman con holgura, no los de la faja entera: un
 * numero de siete cifras cualquiera no alcanza para dar por buena una
 * coordenada.
 */
export function pareceFajaTres(a: number, b: number): boolean {
  return a > 3_560_000 && a < 3_600_000 && b > 7_010_000 && b < 7_050_000;
}
