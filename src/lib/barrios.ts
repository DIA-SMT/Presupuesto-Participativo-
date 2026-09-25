/**
 * Barrios de la capa oficial del municipio (public/geo/barrios.geojson, 2022):
 * como encontrar el que nombro una persona y en que distrito queda.
 *
 * Antes el chat ubicaba un barrio buscandolo entre los barrios que escribieron
 * a mano quienes presentaron ideas en la edicion activa. Con una edicion recien
 * abierta, sin ideas, cualquier barrio daba "no figura", aunque la capa oficial
 * con sus 322 barrios estaba en el repo y solo la usaba el formulario de ideas.
 * Ahora la respuesta sale de la geometria: en que distrito queda un barrio no
 * depende de que alguien haya presentado una idea ahi.
 *
 * Las funciones puras reciben las capas como parametro (asi se prueban contra
 * los archivos reales); las de abajo de todo las leen de disco con
 * src/lib/geo-servidor.ts y son solo del servidor.
 */
import {
  barrioDelPunto,
  distritoDelPunto,
  type ColeccionBarrios,
  type ColeccionDistritos,
  type FeatureBarrio,
  type Punto,
} from "./geo";
import { getBarriosGeo, getDistritosGeo } from "./geo-servidor";
import { normalizar, normalizarBarrio } from "./texto";

// ---------------------------------------------------------------------------
// Nombres
// ---------------------------------------------------------------------------

/** Minusculas, sin tildes, sin puntos, con cualquier otro signo como espacio. */
function limpiar(texto: string): string {
  return normalizar(texto)
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Clave para comparar nombres de barrio.
 *
 * Los puntos se sacan (la capa escribe "Y.P.F." y "S.M.A.T.A. II"; la gente,
 * "YPF" y "Smata II"), cualquier otro signo cuenta como espacio ("1°  DE JULIO"
 * es "1 de julio") y se saca el "barrio" o "B°" de adelante, que la gente
 * escribe y la capa no.
 */
export function claveDeBarrio(texto: string): string {
  return limpiar(texto).replace(/^(?:barrio|b|bo)\s+/, "");
}

/** Si `texto` contiene a `buscado` como palabras enteras y seguidas. */
function contienePalabras(texto: string, buscado: string): boolean {
  return ` ${texto} `.includes(` ${buscado} `);
}

/**
 * El texto (ya limpio) sin "san miguel de tucuman": el nombre de la ciudad
 * contiene al barrio SAN MIGUEL, y nombrar la ciudad no es nombrar el barrio.
 */
function sinLaCiudad(texto: string): string {
  return ` ${texto} `.replace(/ san miguel de tucuman /g, " ").trim();
}

/**
 * Los barrios de la capa cuyo nombre coincide con lo que escribio la persona,
 * del que mejor coincide al que menos:
 *
 *  1. el nombre exacto ("jardín" encuentra JARDIN);
 *  2. los nombres que lo contienen ("ciudadela" encuentra tambien AMPLIACION
 *     CIUDADELA y CIUDADELA SUR), los mas cortos primero;
 *  3. solo si no hubo ninguno de esos, los nombres que estan adentro de lo que
 *     escribio ("villa urquiza, tucumán" encuentra VILLA URQUIZA), los mas
 *     largos primero y de cuatro letras o mas: un "sur" o un "cgt" metido en
 *     una frase es casualidad, no el barrio.
 *
 * Siempre por palabras enteras: "sur" no encuentra "SURCO". Y sin el nombre de
 * la ciudad, que contiene a un barrio: "Villa Urquiza, San Miguel de Tucumán"
 * tambien "encontraba" SAN MIGUEL.
 */
export function buscarBarrios(
  consulta: string,
  barrios: ColeccionBarrios,
  limite = 6,
): FeatureBarrio[] {
  const clave = sinLaCiudad(claveDeBarrio(consulta));
  if (clave.length < 2) return [];

  const exactos: FeatureBarrio[] = [];
  const contienen: Array<{ feature: FeatureBarrio; nombre: string }> = [];
  const contenidos: Array<{ feature: FeatureBarrio; nombre: string }> = [];

  for (const feature of barrios.features) {
    const nombre = claveDeBarrio(feature.properties.nombre);
    if (!nombre) continue;
    if (nombre === clave) exactos.push(feature);
    else if (contienePalabras(nombre, clave)) contienen.push({ feature, nombre });
    else if (nombre.length >= 4 && contienePalabras(clave, nombre)) {
      contenidos.push({ feature, nombre });
    }
  }

  const hallados = [
    ...exactos,
    ...contienen
      .sort((a, b) => a.nombre.length - b.nombre.length || a.nombre.localeCompare(b.nombre, "es"))
      .map((c) => c.feature),
  ];
  if (hallados.length) return hallados.slice(0, limite);

  return contenidos
    .sort((a, b) => b.nombre.length - a.nombre.length || a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => c.feature)
    .slice(0, limite);
}

/**
 * Los barrios de la capa nombrados DENTRO de una frase. Es para el buscador sin
 * IA, que recibe la pregunta entera y no el barrio suelto como el modelo.
 *
 * Una frase dice muchas cosas que coinciden con algun barrio, asi que:
 *
 *  - El nombre de la ciudad se saca antes de buscar: "San Miguel de Tucumán"
 *    contiene a SAN MIGUEL, y cualquier pregunta que nombrara la ciudad
 *    "encontraba" ese barrio.
 *  - Un nombre de una sola palabra cuenta solo si va despues de "barrio" o
 *    "B°", o si la frase es ese nombre y nada mas. "Avenida", "modelo",
 *    "victoria", "sur" o "jardín" sueltos en una pregunta casi nunca son el
 *    barrio.
 *  - Si un nombre esta adentro de otro que tambien aparece ("villa alem" en
 *    "ampliación villa alem"), queda el mas largo, que es el que se nombro.
 */
export function barriosEnFrase(
  frase: string,
  barrios: ColeccionBarrios,
  limite = 3,
): FeatureBarrio[] {
  const texto = sinLaCiudad(limpiar(frase));
  const fraseComoNombre = claveDeBarrio(frase);
  if (!texto) return [];

  const hallados: Array<{ feature: FeatureBarrio; nombre: string }> = [];
  for (const feature of barrios.features) {
    const nombre = claveDeBarrio(feature.properties.nombre);
    if (!nombre || !contienePalabras(texto, nombre)) continue;
    const unaPalabra = !nombre.includes(" ");
    const conPrefijo = ["barrio", "b", "bo"].some((prefijo) =>
      contienePalabras(texto, `${prefijo} ${nombre}`),
    );
    if (unaPalabra && !conPrefijo && fraseComoNombre !== nombre) continue;
    hallados.push({ feature, nombre });
  }

  const masLargosPrimero = hallados.sort(
    (a, b) => b.nombre.length - a.nombre.length || a.nombre.localeCompare(b.nombre, "es"),
  );
  return masLargosPrimero
    .filter(
      (hallado, indice) =>
        !masLargosPrimero
          .slice(0, indice)
          .some((otro) => contienePalabras(otro.nombre, hallado.nombre)),
    )
    .slice(0, limite)
    .map((h) => h.feature);
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------

export type ParteDelBarrio = {
  distrito: number;
  /** Parte de la superficie del barrio que cae en ese distrito, de 0 a 100. */
  porcentaje: number;
};

/**
 * Debajo de esta proporcion una parte no cuenta. Las dos capas no las dibujo la
 * misma gente ni con el mismo trazo, y un barrio que esta entero en un distrito
 * suele asomar unos metros en el vecino.
 */
const UMBRAL_PARTE = 0.1;

/** Muestras por lado de la grilla que se tiende sobre cada poligono. */
const GRILLA = 16;

/** Area de un anillo por la formula del cordon. En grados: sirve para comparar. */
function areaDelAnillo(anillo: number[][]): number {
  let doble = 0;
  for (let i = 0; i < anillo.length - 1; i += 1) {
    doble += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1];
  }
  return Math.abs(doble) / 2;
}

/** El barrio reducido a uno de sus poligonos, para preguntar por ese solo. */
function soloPoligono(barrio: FeatureBarrio, poligono: number[][][]): ColeccionBarrios {
  return {
    type: "FeatureCollection",
    features: [{ ...barrio, geometry: { type: "MultiPolygon", coordinates: [poligono] } }],
  };
}

/**
 * En que distritos cae un barrio y que parte de su superficie queda en cada
 * uno, del mayor al menor.
 *
 * Se mide superficie, no contacto: sobre cada poligono del barrio se tiende una
 * grilla de muestras y se cuenta en que distrito cae cada muestra que queda
 * adentro. Las partes de menos del 10% se descartan, salvo la mayor. Medido
 * sobre los 322 barrios con este corte quedan diez repartidos de verdad (por
 * ejemplo VILLA 9 DE JULIO, entre los distritos 6, 5 y 8), y ningun barrio sin
 * distrito.
 *
 * Cada poligono pesa por su area. Cuatro nombres de la capa (SAN MARTIN, SAN
 * JOSE, VIAL, SAN MIGUEL) son dos barrios homonimos cada uno, separados por
 * kilometros: el porcentaje se reparte entre los distritos de los dos.
 */
export function distritosDelBarrio(
  barrio: FeatureBarrio,
  distritos: ColeccionDistritos,
): ParteDelBarrio[] {
  const peso = new Map<number, number>();
  let pesoTotal = 0;

  for (const poligono of barrio.geometry.coordinates) {
    const exterior = poligono[0];
    if (!exterior || exterior.length < 4) continue;

    let lonMin = Infinity;
    let lonMax = -Infinity;
    let latMin = Infinity;
    let latMax = -Infinity;
    for (const [lon, lat] of exterior) {
      lonMin = Math.min(lonMin, lon);
      lonMax = Math.max(lonMax, lon);
      latMin = Math.min(latMin, lat);
      latMax = Math.max(latMax, lat);
    }

    const coleccion = soloPoligono(barrio, poligono);
    const cuenta = new Map<number, number>();
    const sumar = (punto: Punto) => {
      const numero = distritoDelPunto(punto, distritos);
      if (numero !== null) cuenta.set(numero, (cuenta.get(numero) ?? 0) + 1);
    };

    for (let i = 0; i < GRILLA; i += 1) {
      for (let j = 0; j < GRILLA; j += 1) {
        const punto = {
          lon: lonMin + ((i + 0.5) * (lonMax - lonMin)) / GRILLA,
          lat: latMin + ((j + 0.5) * (latMax - latMin)) / GRILLA,
        };
        if (barrioDelPunto(punto, coleccion) !== null) sumar(punto);
      }
    }
    // Un poligono tan fino que ninguna muestra cayo adentro: sus vertices son
    // lo unico que se sabe de el. Con la capa de 2022 no pasa, pero una capa
    // nueva no tiene por que cumplirlo.
    if (!cuenta.size) {
      for (const [lon, lat] of exterior) sumar({ lon, lat });
    }

    const muestras = [...cuenta.values()].reduce((suma, valor) => suma + valor, 0);
    if (!muestras) continue;
    const area = areaDelAnillo(exterior);
    for (const [numero, valor] of cuenta) {
      peso.set(numero, (peso.get(numero) ?? 0) + (area * valor) / muestras);
    }
    pesoTotal += area;
  }

  if (!pesoTotal) return [];
  return [...peso.entries()]
    .map(([distrito, valor]) => ({ distrito, proporcion: valor / pesoTotal }))
    .sort((a, b) => b.proporcion - a.proporcion || a.distrito - b.distrito)
    .filter((parte, indice) => indice === 0 || parte.proporcion >= UMBRAL_PARTE)
    .map((parte) => ({ distrito: parte.distrito, porcentaje: Math.round(parte.proporcion * 100) }));
}

/** Si el punto cae dentro del barrio (en cualquiera de sus poligonos). */
export function puntoEnBarrio(punto: Punto, barrio: FeatureBarrio): boolean {
  return barrioDelPunto(punto, { type: "FeatureCollection", features: [barrio] }) !== null;
}

/** Lo que hace falta de una idea para decir si esta en un barrio. */
type IdeaUbicable = {
  lat: number | null;
  lon: number | null;
  ubicacionAproximada: boolean;
  barrio: string | null;
};

/**
 * Las ideas de la lista que estan en el barrio: porque su punto cae adentro, o
 * porque quien la presento escribio ese mismo barrio.
 *
 * Las dos cosas, porque ninguna alcanza sola. El punto es lo mas firme, pero
 * las ideas migradas sin coordenada tienen el centro del distrito
 * (`ubicacionAproximada`) y ese punto no dice nada del barrio. El barrio
 * escrito cubre esas, comparado entero con la clave del nombre oficial: por
 * parecido, "Norte" se comeria a "Alberdi Norte" y a "Canal Norte".
 */
export function ideasDelBarrio<T extends IdeaUbicable>(barrio: FeatureBarrio, lista: T[]): T[] {
  const clave = claveDeBarrio(barrio.properties.nombre);
  return lista.filter((idea) => {
    if (idea.lat !== null && idea.lon !== null && !idea.ubicacionAproximada) {
      if (puntoEnBarrio({ lat: idea.lat, lon: idea.lon }, barrio)) return true;
    }
    return idea.barrio !== null && claveDeBarrio(idea.barrio) === clave;
  });
}

// ---------------------------------------------------------------------------
// Con las capas del sitio (solo servidor)
// ---------------------------------------------------------------------------

export type BarrioUbicado = {
  /** Como figura en la capa ("VILLA URQUIZA"). */
  nombreOficial: string;
  /** Para mostrar ("Villa Urquiza"). */
  nombre: string;
  /** Del distrito con mas superficie al de menos; al menos uno. */
  distritos: ParteDelBarrio[];
  /**
   * Poligonos del barrio en la capa. Mas de uno es un barrio en partes o, en
   * cuatro nombres, dos barrios distintos que se llaman igual.
   */
  sectores: number;
  feature: FeatureBarrio;
};

/**
 * Los distritos de cada barrio no cambian mientras no cambie la capa, que es
 * un archivo del repo: se calculan una vez por proceso y por barrio, y solo los
 * de los barrios que alguien pregunto.
 */
const distritosCalculados = new Map<string, ParteDelBarrio[]>();

function aUbicado(feature: FeatureBarrio): BarrioUbicado | null {
  const nombreOficial = feature.properties.nombre;
  let partes = distritosCalculados.get(nombreOficial);
  if (!partes) {
    partes = distritosDelBarrio(feature, getDistritosGeo());
    distritosCalculados.set(nombreOficial, partes);
  }
  // Un barrio que no cae en ningun distrito esta fuera del ejido: no es una
  // respuesta para "en que distrito queda".
  if (!partes.length) return null;
  return {
    nombreOficial,
    nombre: normalizarBarrio(nombreOficial) ?? nombreOficial,
    distritos: partes,
    sectores: feature.geometry.coordinates.length,
    feature,
  };
}

/** Los barrios de la capa que coinciden con lo que escribio la persona. */
export function ubicarBarrio(consulta: string, limite = 6): BarrioUbicado[] {
  return buscarBarrios(consulta, getBarriosGeo(), limite)
    .map(aUbicado)
    .filter((barrio): barrio is BarrioUbicado => barrio !== null);
}

/** Los barrios de la capa nombrados dentro de una pregunta entera. */
export function ubicarBarriosEnFrase(frase: string, limite = 3): BarrioUbicado[] {
  return barriosEnFrase(frase, getBarriosGeo(), limite)
    .map(aUbicado)
    .filter((barrio): barrio is BarrioUbicado => barrio !== null);
}
