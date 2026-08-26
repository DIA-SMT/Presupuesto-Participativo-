/**
 * Convierte la geografia oficial del municipio a los GeoJSON que usa el sitio.
 *
 * Entra:  data/geo-oficial/*.shp (+ .dbf), tal como los entrego el municipio.
 * Sale:   public/geo/distritos.geojson  y  public/geo/barrios.geojson
 *
 * Se corre a mano cuando el municipio manda geografia nueva, no en cada build:
 *
 *     npx tsx scripts/geo-oficial.ts
 *
 * Igual que el ETL de las ideas, deja constancia de todo lo que decidio: que
 * barrios se excluyeron y por que, que nombres estan repetidos, cuanto se
 * corrio cada distrito respecto de la geometria anterior. Sin ese reporte el
 * archivo generado seria imposible de auditar, y la geografia decide en que
 * distrito compite cada propuesta.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fajaTresAGeografica } from "../src/lib/gauss-kruger";
import { leerAtributos, leerPoligonos, type Poligono } from "../src/lib/shapefile";

const RAIZ = process.cwd();
const ENTRADA = join(RAIZ, "data", "geo-oficial");
const SALIDA = join(RAIZ, "public", "geo");

/**
 * Barrios que NO entran en la capa, con el motivo.
 *
 * Queda como lista explicita y no como filtro generico: excluir un barrio de la
 * capa es decidir que ahi el sitio no va a autocompletar nada, y eso tiene que
 * poder revisarse leyendo una linea.
 */
const BARRIOS_EXCLUIDOS = new Map([
  [
    "ASENTAMIENTO FRANCISCO I (AMPLIACIÓN)",
    "queda fuera del ejido municipal (confirmado por el municipio, 26/08/2026)",
  ],
]);

/** Redondea a 6 decimales: ~11 cm, de sobra y mantiene el archivo chico. */
const red = (n: number) => Math.round(n * 1e6) / 1e6;

const aMultiPoligono = (
  poligonos: Poligono[],
  proyectar: (x: number, y: number) => [number, number],
) =>
  poligonos.map((poligono) =>
    poligono.map((anillo) =>
      anillo.map(([x, y]) => {
        const [lon, lat] = proyectar(x, y);
        return [red(lon), red(lat)];
      }),
    ),
  );

/** Caja de un multipoligono, para poder comparar geometrias. */
function caja(coords: number[][][][]) {
  const pts = coords.flat(2);
  return {
    lonMin: Math.min(...pts.map((p) => p[0])),
    latMin: Math.min(...pts.map((p) => p[1])),
    lonMax: Math.max(...pts.map((p) => p[0])),
    latMax: Math.max(...pts.map((p) => p[1])),
  };
}

const METROS_POR_GRADO_LAT = 110_574;
const METROS_POR_GRADO_LON = 111_320 * Math.cos((-26.85 * Math.PI) / 180);

function main() {
  const notas: string[] = [];
  mkdirSync(SALIDA, { recursive: true });

  // -------------------------------------------------------------------------
  // Distritos: ya vienen en WGS84 (lo declara su .prj), no hay que reproyectar
  // -------------------------------------------------------------------------
  const formasD = leerPoligonos(join(ENTRADA, "distritos-pp-corregida.shp"));
  const filasD = leerAtributos(join(ENTRADA, "distritos-pp-corregida.dbf"));
  if (formasD.length !== filasD.length) {
    throw new Error(
      `distritos: ${formasD.length} geometrias y ${filasD.length} filas de atributos.`,
    );
  }

  const distritos = formasD
    .map((forma, i) => {
      const numero = Number(filasD[i]["ID DISTRIT"]);
      if (!Number.isInteger(numero) || numero < 1 || numero > 20) {
        throw new Error(`distritos: fila ${i} tiene un numero invalido: ${filasD[i]["ID DISTRIT"]}`);
      }
      return {
        type: "Feature" as const,
        properties: { id: numero, name: `Distrito ${numero}`, numero },
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: aMultiPoligono(forma.poligonos, (x, y) => [x, y]),
        },
      };
    })
    .sort((a, b) => a.properties.numero - b.properties.numero);

  const numeros = distritos.map((d) => d.properties.numero);
  if (new Set(numeros).size !== 20) {
    throw new Error(`distritos: se esperaban los 20 numeros y hay ${new Set(numeros).size}.`);
  }

  // Cuanto se mueve cada distrito respecto del archivo que estaba en uso.
  const rutaVieja = join(SALIDA, "distritos.geojson");
  let comparacion: string[] = [];
  try {
    const viejo = JSON.parse(readFileSync(rutaVieja, "utf8")) as {
      features: Array<{ properties: { numero: number }; geometry: { type: string; coordinates: unknown } }>;
    };
    comparacion = distritos.map((nuevo) => {
      const antes = viejo.features.find((f) => f.properties.numero === nuevo.properties.numero);
      if (!antes) return `D${nuevo.properties.numero}: no existia en el archivo anterior`;
      const coordsAntes = (antes.geometry.type === "Polygon"
        ? [antes.geometry.coordinates]
        : antes.geometry.coordinates) as number[][][][];
      const a = caja(coordsAntes);
      const b = caja(nuevo.geometry.coordinates);
      const dLon = Math.max(Math.abs(a.lonMin - b.lonMin), Math.abs(a.lonMax - b.lonMax));
      const dLat = Math.max(Math.abs(a.latMin - b.latMin), Math.abs(a.latMax - b.latMax));
      const metros = Math.round(
        Math.max(dLon * METROS_POR_GRADO_LON, dLat * METROS_POR_GRADO_LAT),
      );
      return `D${String(nuevo.properties.numero).padStart(2)}: la caja se corre ${metros} m`;
    });
  } catch {
    comparacion = ["(no habia un archivo anterior para comparar)"];
  }

  writeFileSync(
    rutaVieja,
    `${JSON.stringify(
      {
        type: "FeatureCollection",
        name: "distritos_pp_smt",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: distritos,
      },
      null,
      1,
    )}\n`,
  );
  notas.push(`distritos: ${distritos.length} features desde la capa oficial corregida`);

  // -------------------------------------------------------------------------
  // Barrios: vienen en faja 3 y hay que reproyectar
  // -------------------------------------------------------------------------
  const formasB = leerPoligonos(join(ENTRADA, "barrios-2022.shp"));
  const filasB = leerAtributos(join(ENTRADA, "barrios-2022.dbf"));
  if (formasB.length !== filasB.length) {
    throw new Error(
      `barrios: ${formasB.length} geometrias y ${filasB.length} filas de atributos. ` +
        "Un .dbf que no coincide con el .shp desalinea TODOS los nombres.",
    );
  }

  /*
   * Un registro por NOMBRE, no por poligono.
   *
   * Cuatro nombres aparecen dos veces (VIAL, SAN JOSE, SAN MARTIN, SAN MIGUEL)
   * y no son duplicados: son barrios distintos que comparten nombre, separados
   * entre 3 y 8,5 km. Borrar uno dejaria un agujero donde el sitio no
   * autocompletaria nada. Agrupados en un multipoligono, el nombre queda unico
   * y no se pierde geometria: el point-in-polygon devuelve el mismo nombre
   * caiga el clic en cualquiera de los dos, que es la respuesta correcta.
   */
  const porNombre = new Map<
    string,
    { poligonos: number[][][][]; problemas: boolean; partes: number }
  >();
  const excluidos: string[] = [];
  let sinGeometria = 0;

  formasB.forEach((forma, i) => {
    const nombre = filasB[i].BARRIOS?.trim();
    if (!nombre) return;

    const motivo = BARRIOS_EXCLUIDOS.get(nombre);
    if (motivo) {
      excluidos.push(`${nombre}: ${motivo}`);
      return;
    }
    if (!forma.poligonos.length) {
      sinGeometria += 1;
      return;
    }

    const coords = aMultiPoligono(forma.poligonos, fajaTresAGeografica);
    const previo = porNombre.get(nombre);
    if (previo) {
      previo.poligonos.push(...coords);
      previo.partes += 1;
      previo.problemas = previo.problemas || filasB[i].Problemas === "si";
    } else {
      porNombre.set(nombre, {
        poligonos: coords,
        problemas: filasB[i].Problemas === "si",
        partes: 1,
      });
    }
  });

  const barrios = [...porNombre.entries()]
    .map(([nombre, d]) => ({
      type: "Feature" as const,
      properties: {
        nombre,
        /*
         * El campo "Problemas" del archivo original. Nadie del municipio supo
         * decir que significa (preguntado el 26/08/2026), asi que estos ocho
         * barrios NO se excluyen —excluirlos dejaria agujeros sin saber por
         * que— pero el marcador viaja hasta aca para poder revisarlo cuando
         * alguien lo aclare.
         */
        revisar: d.problemas,
      },
      geometry: { type: "MultiPolygon" as const, coordinates: d.poligonos },
    }))
    .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre, "es"));

  writeFileSync(
    join(SALIDA, "barrios.geojson"),
    `${JSON.stringify(
      {
        type: "FeatureCollection",
        name: "barrios_smt_2022",
        crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
        features: barrios,
      },
      null,
      1,
    )}\n`,
  );

  const repetidos = [...porNombre.entries()].filter(([, d]) => d.partes > 1);
  const paraRevisar = barrios.filter((b) => b.properties.revisar);

  // -------------------------------------------------------------------------
  // Reporte
  // -------------------------------------------------------------------------
  const lineas = [
    "# Conversion de la geografia oficial",
    "",
    "Generado por `npx tsx scripts/geo-oficial.ts` desde `data/geo-oficial/`.",
    "",
    "## Distritos",
    "",
    ...notas.map((n) => `- ${n}`),
    "- vienen en WGS84 segun su .prj: no se reproyecta nada",
    "",
    "Diferencia contra la geometria que estaba en uso:",
    "",
    ...comparacion.map((c) => `- ${c}`),
    "",
    "## Barrios",
    "",
    `- ${formasB.length} poligonos en el archivo original`,
    `- ${barrios.length} barrios en la capa final (un registro por nombre)`,
    "- reproyectados de Gauss-Kruger faja 3 (POSGAR) a WGS84; el archivo original",
    "  no declaraba su sistema de coordenadas (ver `src/lib/gauss-kruger.ts`)",
    "",
    `### Nombres con mas de un poligono (${repetidos.length})`,
    "",
    "No son duplicados: son barrios distintos que comparten nombre. Se agrupan en",
    "un multipoligono para que el nombre quede unico sin perder geometria.",
    "",
    ...repetidos.map(([n, d]) => `- ${n}: ${d.partes} poligonos`),
    "",
    `### Excluidos (${excluidos.length})`,
    "",
    ...(excluidos.length ? excluidos.map((e) => `- ${e}`) : ["- ninguno"]),
    "",
    `### Marcados para revisar (${paraRevisar.length})`,
    "",
    'Traian `Problemas = si` en el archivo del municipio y nadie supo decir que',
    "significa. Se conservan; el marcador queda en la propiedad `revisar`.",
    "",
    ...paraRevisar.map((b) => `- ${b.properties.nombre}`),
    ...(sinGeometria ? ["", `### Sin geometria: ${sinGeometria}`] : []),
    "",
  ];
  writeFileSync(join(ENTRADA, "reporte.md"), `${lineas.join("\n")}\n`);

  console.log(lineas.join("\n"));
  console.log(`\nEscritos:\n  public/geo/distritos.geojson\n  public/geo/barrios.geojson\n  data/geo-oficial/reporte.md`);
}

main();
