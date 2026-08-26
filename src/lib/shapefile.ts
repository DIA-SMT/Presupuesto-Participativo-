/**
 * Lector minimo de shapefile, solo lo que necesita este proyecto.
 *
 * Existe porque el municipio entrega su geografia oficial en shapefile de ESRI
 * y no hay GDAL ni ogr2ogr en las maquinas del equipo (ni conviene pedirlo para
 * una conversion que se corre una vez por año). El formato esta publicado
 * (ESRI Shapefile Technical Description, julio de 1998) y de el se usan tres
 * cosas: poligonos, la tabla de atributos y nada mas.
 *
 * Lo que NO hace, a proposito: no lee puntos ni lineas, no lee shapefiles con
 * medida (M) ni con altura (Z) mas alla de ignorarlas, y no interpreta el .prj.
 * Si algun dia entra un archivo asi, tira en lugar de adivinar.
 */
import { readFileSync } from "node:fs";

/** Un anillo cerrado de coordenadas, en el orden del archivo. */
export type Anillo = Array<[number, number]>;

/**
 * Un poligono con su anillo exterior primero y sus huecos despues, que es
 * exactamente lo que espera GeoJSON y lo que espera src/lib/geo.ts.
 */
export type Poligono = Anillo[];

export type Forma = { poligonos: Poligono[] };

/** Tipos de geometria del formato que aceptamos (5 = Polygon). */
const POLIGONO = 5;

/**
 * Area con signo por la formula del zapatero.
 *
 * El signo es lo que distingue un anillo exterior de un hueco, y la convencion
 * de ESRI es la inversa de la de GeoJSON: ESRI dibuja los exteriores en sentido
 * horario (area negativa con esta formula) y los huecos al reves. GeoJSON
 * (RFC 7946) pide lo contrario. De ahi que `leerPoligonos` invierta cada anillo.
 */
export function areaConSigno(anillo: Anillo): number {
  let suma = 0;
  for (let i = 0; i < anillo.length - 1; i += 1) {
    suma += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1];
  }
  return suma / 2;
}

/**
 * Lee las geometrias de un .shp y las agrupa en poligonos.
 *
 * Un registro de shapefile trae sus anillos sueltos, sin decir cual es hueco de
 * cual: la unica pista es el sentido de giro. Se recorren en orden y cada
 * anillo exterior abre un poligono nuevo; los huecos se cuelgan del ultimo
 * exterior visto, que es como el formato garantiza que vienen ordenados.
 */
export function leerPoligonos(ruta: string): Forma[] {
  const b = readFileSync(ruta);
  const tipoArchivo = b.readInt32LE(32);
  if (tipoArchivo !== POLIGONO) {
    throw new Error(
      `${ruta}: tipo de geometria ${tipoArchivo}; este lector solo soporta poligonos (5).`,
    );
  }

  const formas: Forma[] = [];
  let p = 100; // la cabecera del archivo mide 100 bytes
  while (p + 8 <= b.length) {
    // Cabecera del registro: numero y largo, los dos big-endian.
    const largo = b.readInt32BE(p + 4) * 2; // viene en palabras de 16 bits
    const tipo = b.readInt32LE(p + 8);

    if (tipo !== POLIGONO) {
      // Tipo 0 es "sin geometria" y es legal; cualquier otro no lo manejamos.
      if (tipo !== 0) throw new Error(`${ruta}: registro de tipo ${tipo} inesperado.`);
      formas.push({ poligonos: [] });
      p += 8 + largo;
      continue;
    }

    let q = p + 8 + 4 + 32; // saltea el tipo y la caja del registro
    const cantidadPartes = b.readInt32LE(q);
    q += 4;
    const cantidadPuntos = b.readInt32LE(q);
    q += 4;

    const inicios: number[] = [];
    for (let i = 0; i < cantidadPartes; i += 1) {
      inicios.push(b.readInt32LE(q));
      q += 4;
    }
    const puntos: Anillo = [];
    for (let i = 0; i < cantidadPuntos; i += 1) {
      puntos.push([b.readDoubleLE(q), b.readDoubleLE(q + 8)]);
      q += 16;
    }

    const poligonos: Poligono[] = [];
    for (let i = 0; i < inicios.length; i += 1) {
      const hasta = i + 1 < inicios.length ? inicios[i + 1] : cantidadPuntos;
      const anillo = puntos.slice(inicios[i], hasta);
      if (anillo.length < 4) continue; // no cierra: no es un anillo valido
      // ESRI: exterior en sentido horario -> area negativa con esta formula.
      const esExterior = areaConSigno(anillo) < 0;
      const enGeoJson = anillo.slice().reverse() as Anillo;
      if (esExterior || poligonos.length === 0) poligonos.push([enGeoJson]);
      else poligonos[poligonos.length - 1].push(enGeoJson);
    }

    formas.push({ poligonos });
    p += 8 + largo;
  }
  return formas;
}

/**
 * Lee la tabla de atributos (.dbf, formato dBASE III).
 *
 * Los valores se devuelven como texto tal cual estan en el archivo, sin
 * convertir: los campos numericos de estos archivos vienen con desbordes (una
 * fila llena de asteriscos, que en dBASE significa "no entra en el ancho
 * declarado") y convertir a numero los volveria NaN en silencio. Que el que
 * llama decida.
 */
export function leerAtributos(ruta: string): Array<Record<string, string>> {
  const b = readFileSync(ruta);
  const cantidad = b.readUInt32LE(4);
  const inicioDatos = b.readUInt16LE(8);
  const largoRegistro = b.readUInt16LE(10);

  const campos: Array<{ nombre: string; largo: number }> = [];
  for (let p = 32; p < inicioDatos && b[p] !== 0x0d; p += 32) {
    campos.push({
      nombre: b.toString("latin1", p, p + 11).replace(/\0.*$/, "").trim(),
      largo: b[p + 16],
    });
  }

  const filas: Array<Record<string, string>> = [];
  for (let i = 0; i < cantidad; i += 1) {
    let p = inicioDatos + i * largoRegistro;
    if (b[p] === 0x2a) continue; // 0x2A marca el registro como borrado
    p += 1;
    const fila: Record<string, string> = {};
    for (const campo of campos) {
      // UTF-8: lo declara el .cpg de los archivos del municipio.
      fila[campo.nombre] = b.toString("utf8", p, p + campo.largo).trim();
      p += campo.largo;
    }
    filas.push(fila);
  }
  return filas;
}
