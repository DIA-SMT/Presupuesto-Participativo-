/**
 * Utilidades geograficas sobre la geometria oficial de los 20 distritos.
 *
 * Reemplaza el campo "coordenadas" de texto libre del sitio anterior: cualquier
 * punto que marque un vecino se resuelve aca a un distrito concreto, sin
 * intervencion manual. La misma operacion existe en la base (ST_Contains); esta
 * version en TypeScript sirve para el navegador y para el ETL.
 */

export type Punto = { lat: number; lon: number };

export type FeatureDistrito = {
  type: "Feature";
  properties: { id: number; name: string; numero: number };
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
};

export type ColeccionDistritos = {
  type: "FeatureCollection";
  features: FeatureDistrito[];
};

/** Caja que contiene a todo el ejido municipal, segun la geometria oficial. */
export const BBOX_SMT = {
  lonMin: -65.28,
  lonMax: -65.15,
  latMin: -26.92,
  latMax: -26.78,
} as const;

export const CENTRO_SMT: Punto = { lat: -26.84725, lon: -65.21705 };

/** Ray casting sobre un anillo en formato [lon, lat]. */
function dentroDelAnillo(punto: Punto, anillo: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza =
      yi > punto.lat !== yj > punto.lat &&
      punto.lon < ((xj - xi) * (punto.lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** Un poligono es un anillo exterior seguido de sus huecos. */
function dentroDelPoligono(punto: Punto, poligono: number[][][]): boolean {
  const [exterior, ...huecos] = poligono;
  if (!exterior || !dentroDelAnillo(punto, exterior)) return false;
  return !huecos.some((hueco) => dentroDelAnillo(punto, hueco));
}

export function dentroDelDistrito(
  punto: Punto,
  feature: FeatureDistrito,
): boolean {
  return feature.geometry.coordinates.some((poligono) =>
    dentroDelPoligono(punto, poligono),
  );
}

/**
 * Devuelve el numero de distrito que contiene al punto, o null si cae fuera
 * del ejido municipal.
 */
export function distritoDelPunto(
  punto: Punto,
  distritos: ColeccionDistritos,
): number | null {
  for (const feature of distritos.features) {
    if (dentroDelDistrito(punto, feature)) return feature.properties.numero;
  }
  return null;
}

/** Descarta coordenadas que no pueden corresponder a San Miguel de Tucuman. */
export function puntoPlausible(punto: Punto): boolean {
  return (
    Number.isFinite(punto.lat) &&
    Number.isFinite(punto.lon) &&
    punto.lat >= BBOX_SMT.latMin &&
    punto.lat <= BBOX_SMT.latMax &&
    punto.lon >= BBOX_SMT.lonMin &&
    punto.lon <= BBOX_SMT.lonMax
  );
}

export type ResultadoCoordenada = {
  punto: Punto | null;
  /** Que se hizo para llegar al punto, para poder auditar la migracion. */
  nota: string | null;
};

/**
 * Interpreta el campo "coordenadas" del sitio anterior, que era texto libre.
 * Cubre los cuatro formatos encontrados en los datos de 2025:
 *   1. "-26.797050, -65.207859"              par decimal correcto
 *   2. "26.795635, -65.254633"               latitud con el signo invertido
 *   3. "26 51 20.7 S 65 15 21.0 W"           grados, minutos y segundos
 *   4. "3576679.46555, 7028253.17743"        coordenadas proyectadas
 * El caso 4 se descarta: sin saber el sistema de origen no se puede
 * reproyectar de forma confiable, y adivinarlo pondria un punto falso en el mapa.
 */
export function parsearCoordenada(bruto: string | null): ResultadoCoordenada {
  const texto = (bruto ?? "").trim();
  if (!texto) return { punto: null, nota: null };

  // Grados, minutos y segundos: 26 51 20.7 S 65 15 21.0 W
  const gms = texto.match(
    /(\d{1,3})[^\d]+(\d{1,2})[^\d]+([\d.]+)[^\dNSEWnsew]*([NSns])[^\d]+(\d{1,3})[^\d]+(\d{1,2})[^\d]+([\d.]+)[^\dNSEWnsew]*([EWew])/,
  );
  if (gms) {
    const lat =
      (Number(gms[1]) + Number(gms[2]) / 60 + Number(gms[3]) / 3600) *
      (gms[4].toUpperCase() === "S" ? -1 : 1);
    const lon =
      (Number(gms[5]) + Number(gms[6]) / 60 + Number(gms[7]) / 3600) *
      (gms[8].toUpperCase() === "W" ? -1 : 1);
    const punto = { lat, lon };
    return puntoPlausible(punto)
      ? { punto, nota: "coordenada convertida desde grados/minutos/segundos" }
      : { punto: null, nota: "coordenada en GMS fuera del ejido; descartada" };
  }

  const numeros = texto.match(/-?\d+(?:[.,]\d+)?/g);
  if (!numeros || numeros.length < 2) {
    return { punto: null, nota: "coordenada ilegible; descartada" };
  }

  const [a, b] = numeros.slice(0, 2).map((n) => Number(n.replace(",", ".")));
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return { punto: null, nota: "coordenada ilegible; descartada" };
  }

  // Coordenadas proyectadas (metros): valores de seis cifras o mas.
  if (Math.abs(a) > 1000 || Math.abs(b) > 1000) {
    return {
      punto: null,
      nota: "coordenada en un sistema proyectado desconocido; descartada",
    };
  }

  const candidatos: Array<{ punto: Punto; nota: string | null }> = [
    { punto: { lat: a, lon: b }, nota: null },
    { punto: { lat: -Math.abs(a), lon: b }, nota: "latitud con signo corregido" },
    { punto: { lat: b, lon: a }, nota: "latitud y longitud invertidas" },
    {
      punto: { lat: -Math.abs(b), lon: a },
      nota: "latitud y longitud invertidas, y signo corregido",
    },
  ];

  for (const candidato of candidatos) {
    if (puntoPlausible(candidato.punto)) return candidato;
  }

  return { punto: null, nota: "coordenada fuera del ejido municipal; descartada" };
}
