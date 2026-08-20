/**
 * ETL de migracion de la edicion 2025.
 *
 * Entrada:  data/raw/proyectos_pp2025.csv        (100 ideas del sitio anterior)
 *           data/contenido-ganadores.json        (texto completo de los 19 ganadores)
 *           public/geo/distritos.geojson         (geometria oficial de los 20 distritos)
 *           data/raw/centroides_distritos.json   (centroide por distrito)
 *
 * Salida:   data/proyectos-2025.json             (dataset limpio, listo para seed)
 *           data/reporte-limpieza.md             (que se cambio y por que)
 *
 * Todo cambio queda registrado en `notasMigracion` de cada idea y en el reporte:
 * el objetivo es que la limpieza sea auditable, no invisible.
 */
import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "node:fs";
import {
  distritoDelPunto,
  parsearCoordenada,
  type ColeccionDistritos,
} from "../src/lib/geo";
import {
  normalizarBarrio,
  normalizarParrafo,
  normalizarTitulo,
  similitud,
  slugificar,
  valorODefecto,
} from "../src/lib/texto";

const ANIO = 2025;
/** Dos titulos con esta similitud o mas, en el mismo distrito, son la misma idea. */
const UMBRAL_DUPLICADO = 0.72;

type FilaCsv = {
  distrito: string;
  estado: string;
  categoria: string;
  titulo: string;
  barrio: string;
  coordenadas_originales: string;
  lat: string;
  lon: string;
  votos: string;
  fecha: string;
  cargado_por: string;
};

export type EstadoIdea =
  | "pendiente"
  | "factible"
  | "no_factible"
  | "integrado"
  | "ganador";

export type IdeaLimpia = {
  numero: number;
  distrito: number;
  categoriaSlug: string;
  titulo: string;
  tituloOriginal: string;
  slug: string;
  barrio: string | null;
  problema: string | null;
  solucion: string | null;
  beneficios: string | null;
  ubicacionTexto: string | null;
  lat: number | null;
  lon: number | null;
  ubicacionAproximada: boolean;
  coordenadasOriginales: string | null;
  estado: EstadoIdea;
  ganador: boolean;
  votos: number;
  estadoPresupuesto: "sin_asignar" | "preparacion";
  canal: "asamblea" | "municipio" | "migracion";
  cargadoPor: string | null;
  fecha: string | null;
  publicada: boolean;
  duplicadoDeSlug: string | null;
  notasMigracion: string[];
};

const CATEGORIAS: Record<string, string> = {
  "espacio socio ambiental": "socio-ambiental",
  "espacio cultural deportivo": "cultural-deportivo",
  "espacio de innovacion urbana": "innovacion-urbana",
};

const ESTADOS: Record<string, EstadoIdea> = {
  factible: "factible",
  "no-factible": "no_factible",
  integrado: "integrado",
  ganador: "ganador",
  pendiente: "pendiente",
};

/** El canal real de carga: quien la subio en el sistema anterior. */
function canalDe(cargadoPor: string | null): IdeaLimpia["canal"] {
  if (!cargadoPor) return "migracion";
  if (cargadoPor === "PParticipativo") return "asamblea";
  if (cargadoPor === "MUNICIPALIDAD") return "municipio";
  return "migracion";
}

function sinTildes(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------

const distritos = JSON.parse(
  readFileSync("public/geo/distritos.geojson", "utf8"),
) as ColeccionDistritos;

const centroides = JSON.parse(
  readFileSync("data/raw/centroides_distritos.json", "utf8"),
) as Record<string, [number, number]>;

const contenidoGanadores = JSON.parse(
  readFileSync("data/contenido-ganadores.json", "utf8"),
) as Record<
  string,
  {
    problema: string | null;
    solucion: string | null;
    beneficios: string | null;
    ubicacion?: string;
    notas: string[];
  }
>;

const csv = readFileSync("data/raw/proyectos_pp2025.csv", "utf8").replace(
  /^﻿/,
  "",
);
const filas = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as FilaCsv[];

const avisos: string[] = [];
const ideas: IdeaLimpia[] = [];

filas.forEach((fila, indice) => {
  const notas: string[] = [];
  const distrito = Number(fila.distrito);
  if (!Number.isInteger(distrito) || distrito < 1 || distrito > 20) {
    avisos.push(`Fila ${indice + 2}: distrito invalido "${fila.distrito}"; fila descartada.`);
    return;
  }

  const tituloOriginal = fila.titulo.trim();
  const titulo = normalizarTitulo(tituloOriginal);
  if (!titulo) {
    avisos.push(`Fila ${indice + 2}: sin titulo utilizable; fila descartada.`);
    return;
  }
  if (titulo !== tituloOriginal) {
    notas.push(`Titulo normalizado desde: "${tituloOriginal}"`);
  }

  const categoriaSlug = CATEGORIAS[sinTildes(fila.categoria)];
  if (!categoriaSlug) {
    avisos.push(
      `Fila ${indice + 2}: categoria desconocida "${fila.categoria}"; se asigno innovacion-urbana.`,
    );
  }

  const estado = ESTADOS[fila.estado.trim().toLowerCase()] ?? "pendiente";
  if (!ESTADOS[fila.estado.trim().toLowerCase()]) {
    avisos.push(`Fila ${indice + 2}: estado desconocido "${fila.estado}"; se asigno pendiente.`);
  }

  // --- Ubicacion -----------------------------------------------------------
  const brutoCoordenada = valorODefecto(fila.coordenadas_originales);
  const { punto, nota: notaCoordenada } = parsearCoordenada(brutoCoordenada);
  if (notaCoordenada) notas.push(notaCoordenada);

  let lat: number | null = null;
  let lon: number | null = null;
  let ubicacionAproximada = false;

  if (punto) {
    const distritoGeo = distritoDelPunto(punto, distritos);
    if (distritoGeo === null) {
      notas.push(
        "El punto cargado cae dentro del area de Tucuman pero fuera de los 20 distritos; se usa el centroide del distrito declarado.",
      );
    } else {
      lat = punto.lat;
      lon = punto.lon;
      if (distritoGeo !== distrito) {
        notas.push(
          `Revisar: el punto cargado cae en el Distrito ${distritoGeo} pero la idea esta declarada en el Distrito ${distrito}.`,
        );
        avisos.push(
          `"${titulo}": punto en D${distritoGeo}, declarada en D${distrito}. Requiere revision manual.`,
        );
      }
    }
  }

  if (lat === null) {
    const centroide = centroides[String(distrito)];
    if (centroide) {
      lon = centroide[0];
      lat = centroide[1];
      ubicacionAproximada = true;
      notas.push(
        "Sin coordenada utilizable en el origen: se ubica en el centroide del distrito y se marca como aproximada.",
      );
    }
  }

  // --- Contenido -----------------------------------------------------------
  let problema: string | null = null;
  let solucion: string | null = null;
  let beneficios: string | null = null;
  let ubicacionTexto: string | null = null;

  if (estado === "ganador") {
    const contenido = contenidoGanadores[String(distrito)];
    if (contenido) {
      problema = normalizarParrafo(contenido.problema);
      solucion = normalizarParrafo(contenido.solucion);
      beneficios = normalizarParrafo(contenido.beneficios);
      ubicacionTexto = contenido.ubicacion ?? null;
      notas.push(...contenido.notas);
    } else {
      avisos.push(`Ganador de D${distrito} sin contenido en data/contenido-ganadores.json.`);
    }
  } else {
    notas.push(
      "El relevamiento del sitio anterior no incluyo el texto completo de esta idea (solo de los ganadores).",
    );
  }

  const votosBruto = Number(valorODefecto(fila.votos) ?? 0);
  const votos = Number.isFinite(votosBruto) ? votosBruto : 0;

  ideas.push({
    numero: indice + 1,
    distrito,
    categoriaSlug: categoriaSlug ?? "innovacion-urbana",
    titulo,
    tituloOriginal,
    slug: slugificar(titulo),
    barrio: normalizarBarrio(fila.barrio),
    problema,
    solucion,
    beneficios,
    ubicacionTexto,
    lat,
    lon,
    ubicacionAproximada,
    coordenadasOriginales: brutoCoordenada,
    estado,
    ganador: estado === "ganador",
    votos,
    // El sitio anterior tenia presupuesto-total = 1 en las 100 ideas: era un
    // valor de relleno, no un monto. No se migra ningun importe.
    estadoPresupuesto: estado === "ganador" ? "preparacion" : "sin_asignar",
    canal: canalDe(valorODefecto(fila.cargado_por)),
    cargadoPor: valorODefecto(fila.cargado_por),
    fecha: valorODefecto(fila.fecha),
    publicada: true,
    duplicadoDeSlug: null,
    notasMigracion: notas,
  });
});

// ---------------------------------------------------------------------------
// Deduplicacion dentro de cada distrito
// ---------------------------------------------------------------------------

/** Orden de preferencia al elegir cual de dos ideas repetidas queda como principal. */
const PESO_ESTADO: Record<EstadoIdea, number> = {
  ganador: 5,
  factible: 4,
  integrado: 3,
  pendiente: 2,
  no_factible: 1,
};

function mejorQue(a: IdeaLimpia, b: IdeaLimpia): boolean {
  if (PESO_ESTADO[a.estado] !== PESO_ESTADO[b.estado]) {
    return PESO_ESTADO[a.estado] > PESO_ESTADO[b.estado];
  }
  if (a.votos !== b.votos) return a.votos > b.votos;
  if (a.ubicacionAproximada !== b.ubicacionAproximada) return !a.ubicacionAproximada;
  return a.titulo.length > b.titulo.length;
}

const grupos: IdeaLimpia[][] = [];
for (const idea of ideas) {
  const grupo = grupos.find((g) =>
    g.some(
      (otra) =>
        otra.distrito === idea.distrito &&
        similitud(otra.titulo, idea.titulo) >= UMBRAL_DUPLICADO,
    ),
  );
  if (grupo) grupo.push(idea);
  else grupos.push([idea]);
}

let unificadas = 0;
const detalleDuplicados: string[] = [];

for (const grupo of grupos) {
  if (grupo.length < 2) continue;
  const principal = grupo.reduce((mejor, actual) =>
    mejorQue(actual, mejor) ? actual : mejor,
  );
  for (const idea of grupo) {
    if (idea === principal) continue;
    idea.publicada = false;
    idea.duplicadoDeSlug = principal.slug;
    idea.notasMigracion.push(
      `Idea repetida: mismo proyecto que "${principal.titulo}". Se conserva el registro para auditoria pero no se publica.`,
    );
    unificadas += 1;
  }
  // Si la principal no tiene punto propio pero una repetida si, se aprovecha.
  if (principal.ubicacionAproximada) {
    const conPunto = grupo.find((i) => i !== principal && !i.ubicacionAproximada);
    if (conPunto) {
      principal.lat = conPunto.lat;
      principal.lon = conPunto.lon;
      principal.ubicacionAproximada = false;
      principal.notasMigracion.push(
        "Ubicacion tomada de un registro repetido de la misma idea, que si tenia coordenada.",
      );
    }
  }
  detalleDuplicados.push(
    `- **D${principal.distrito}** se unifican ${grupo.length} registros en "${principal.titulo}": ` +
      grupo
        .filter((i) => i !== principal)
        .map((i) => `"${i.tituloOriginal}"`)
        .join(", "),
  );
}

// Slugs unicos por edicion.
const vistos = new Map<string, number>();
for (const idea of ideas) {
  const cuenta = vistos.get(idea.slug) ?? 0;
  vistos.set(idea.slug, cuenta + 1);
  if (cuenta > 0) idea.slug = `${idea.slug}-${cuenta + 1}`;
}

// Titulos identicos en distritos distintos: no se unifican, se avisan.
const porTitulo = new Map<string, IdeaLimpia[]>();
for (const idea of ideas) {
  const clave = sinTildes(idea.titulo);
  porTitulo.set(clave, [...(porTitulo.get(clave) ?? []), idea]);
}
const cruzados = [...porTitulo.values()].filter(
  (lista) => lista.length > 1 && new Set(lista.map((i) => i.distrito)).size > 1,
);

// ---------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------

const publicadas = ideas.filter((i) => i.publicada);
const conPuntoReal = publicadas.filter((i) => i.lat !== null && !i.ubicacionAproximada);
const ganadores = publicadas.filter((i) => i.ganador);
const totalVotosGanadores = ganadores.reduce((suma, i) => suma + i.votos, 0);

writeFileSync(
  "data/proyectos-2025.json",
  JSON.stringify({ anio: ANIO, generado: "npm run etl", ideas }, null, 2) + "\n",
);

const porEstado = (estado: EstadoIdea) =>
  publicadas.filter((i) => i.estado === estado).length;

const reporte = `# Reporte de limpieza — migracion de la edicion ${ANIO}

Generado por \`npm run etl\` a partir de \`data/raw/proyectos_pp2025.csv\`.
Este archivo existe para que la limpieza sea auditable: cada cambio hecho sobre
los datos originales figura aca y en el campo \`notasMigracion\` de cada idea.

## Totales

| Concepto | Cantidad |
|---|---|
| Filas leidas del CSV | ${filas.length} |
| Ideas migradas | ${ideas.length} |
| Ideas publicadas | ${publicadas.length} |
| Registros repetidos despublicados | ${unificadas} |
| Ganadoras | ${porEstado("ganador")} |
| Factibles | ${porEstado("factible")} |
| No factibles | ${porEstado("no_factible")} |
| Integradas | ${porEstado("integrado")} |
| Con coordenada propia | ${conPuntoReal.length} |
| Con ubicacion aproximada (centroide del distrito) | ${publicadas.length - conPuntoReal.length} |
| Votos totales de las ganadoras | ${totalVotosGanadores} |

## Que se corrigio

1. **Coordenadas.** El sitio anterior guardaba la ubicacion como texto libre. Se
   interpretaron los cuatro formatos presentes (par decimal, latitud con signo
   invertido, grados/minutos/segundos y un registro en coordenadas proyectadas),
   se validaron contra el ejido municipal y se resolvio el distrito por
   point-in-polygon contra \`public/geo/distritos.geojson\`. Las ideas sin
   coordenada utilizable se ubican en el centroide de su distrito y quedan
   marcadas con \`ubicacionAproximada\`, para que el mapa nunca muestre un punto
   falso como si fuera exacto.
2. **Titulos.** Se quitaron marcas de trabajo interno (\`*\`, \`S/DATOS\`,
   \`sin identificar\`, \`- No factible\`) y se paso la mayuscula sostenida a
   texto legible conservando siglas (SUM, CAC, AGEF, SMATA, DIZA).
3. **Barrios.** Se quito el prefijo "Barrio" redundante y los marcadores de dato
   faltante pasaron a nulo.
4. **Campos corridos.** En los proyectos de los distritos 2, 3, 6, 12, 14, 15 y 17
   el contenido no correspondia a su etiqueta. Se reordeno en problema / solucion /
   beneficios y, donde el origen no tenia el dato, quedo en nulo con la nota
   correspondiente en lugar de completarlo con texto inventado.
5. **Presupuesto.** El campo \`presupuesto-total\` valia 1 en las 100 ideas: era
   relleno, no un monto. No se migro ningun importe. Los proyectos ganadores
   quedan en estado "preparacion" sin monto, como estaban.

## Registros repetidos unificados

${detalleDuplicados.length ? detalleDuplicados.join("\n") : "_Sin repetidos detectados._"}

## Titulos identicos en distritos distintos

No se unifican automaticamente porque podrian ser proyectos distintos con el
mismo nombre. Requieren decision del equipo:

${
  cruzados.length
    ? cruzados
        .map(
          (lista) =>
            `- "${lista[0].titulo}" aparece en los distritos ${lista
              .map((i) => i.distrito)
              .join(", ")}`,
        )
        .join("\n")
    : "_Sin casos._"
}

## Avisos que requieren revision manual

${avisos.length ? avisos.map((a) => `- ${a}`).join("\n") : "_Sin avisos._"}
`;

writeFileSync("data/reporte-limpieza.md", reporte);

console.log(`ETL listo:
  ideas migradas .................. ${ideas.length}
  publicadas ...................... ${publicadas.length}
  repetidas despublicadas ......... ${unificadas}
  con coordenada propia ........... ${conPuntoReal.length}
  ubicacion aproximada ............ ${publicadas.length - conPuntoReal.length}
  ganadoras ....................... ${ganadores.length} (${totalVotosGanadores} votos)
  avisos .......................... ${avisos.length}

  -> data/proyectos-2025.json
  -> data/reporte-limpieza.md`);
