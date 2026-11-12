/**
 * Lo que el sitio explica con texto fijo, escrito en el codigo y no editable
 * desde el panel, y que Migue (el chat) tiene que poder decir igual.
 *
 * Antes cada texto vivia adentro de su pagina (/reglamento, /acerca-de) y el
 * chat tenia su propia version escrita en sus instrucciones: dos copias que se
 * podian contradecir, y el chat sabiendo cosas que el sitio no decia en ningun
 * lado. Ahora hay una sola: la pagina la dibuja y el chat la lee de aca (ver
 * src/lib/chat-contexto.ts). Si una regla cambia, cambia para los dos.
 *
 * Lo editable (el reglamento oficial, las preguntas frecuentes, los textos de
 * cada pagina) NO va aca: vive en la base (tablas `textos`, `faq`, `novedades`).
 */
import { normalizar } from "./texto";
import { turnosEnTexto } from "./votacion-presencial";

export type Explicacion = { titulo: string; texto: string };

/**
 * Como funciona el programa, en pocas reglas: lo que /reglamento muestra arriba
 * del texto oficial (o en su lugar, si no esta cargado) y lo que Migue dice.
 * Salen de la Ordenanza 5.027/19, del Decreto 0981/S.Gral./2024 y de lo que
 * informo la Direccion de Centros Vecinales en noviembre de 2026 (prefactibilidad
 * antes de votar, votacion presencial en urnas, nota de recepcion presencial).
 */
export const REGLAS_CONFIRMADAS: Explicacion[] = [
  {
    titulo: "Las ideas se presentan por la web o en persona",
    texto:
      "Podés presentar tu idea desde este sitio, ingresando con CIDITUC, o en persona en Ejército del Norte 410 (Dirección de Centros Vecinales) o en los Operativos Integrales Municipales. Todas, incluso las que llegan por la web, se formalizan después con una nota de recepción presencial: el equipo del programa se contacta con cada vecino para hacerlo.",
  },
  {
    titulo: "Análisis de prefactibilidad antes de votar",
    texto:
      "Antes de la votación, las propuestas pasan únicamente por un análisis de prefactibilidad a cargo del equipo del programa. Las que resultan prefactibles se publican y forman la nómina que se vota en cada distrito.",
  },
  {
    titulo: "La votación es presencial, en urnas",
    texto:
      `Se vota en persona, en sedes distribuidas por distrito: ${turnosEnTexto()}. No se vota por internet y no hace falta CIDITUC.`,
  },
  {
    titulo: "Quién puede votar",
    texto:
      "Toda persona mayor de 16 años que acredite con su DNI que vive dentro del distrito. Las personas extranjeras sin ciudadanía pueden votar si acreditan al menos 2 años de residencia efectiva en la ciudad.",
  },
  {
    titulo: "Un vecino, un voto",
    texto:
      "Cada persona vota una sola vez, por un proyecto de su distrito, y solo por sí misma: no puede votar en nombre de otra.",
  },
  {
    titulo: "Tres categorías de proyecto",
    texto:
      "Las propuestas se encuadran en espacio socio ambiental, espacio cultural deportivo o espacio de innovación urbana.",
  },
  {
    titulo: "Evaluación técnica después de la votación",
    texto:
      "La evaluación técnica, urbanística y presupuestaria (costo y alcance de la obra) se hace después de la votación, únicamente sobre la propuesta ganadora de cada distrito.",
  },
  {
    titulo: "El proyecto ganador entra al presupuesto municipal",
    texto:
      // Decia ademas "y su ejecución se publica en este sitio". Es una regla
      // presentada como confirmada, y hoy el sitio no publica ninguna ejecucion.
      "El proyecto más votado de cada distrito se incorpora al presupuesto municipal del año siguiente.",
  },
];

/**
 * Toda idea, tambien la que llega por la web, se formaliza con una nota de
 * recepcion presencial; el equipo contacta a cada vecino (Direccion de Centros
 * Vecinales, 12/11/2026). Lo dicen el formulario, su confirmacion y el chat.
 */
export const NOTA_DE_RECEPCION =
  "Todas las ideas, incluso las presentadas por la web, se formalizan después con una nota de recepción presencial: el equipo del programa se va a contactar con vos para hacerlo.";

/**
 * Como se presenta una idea: desde el sitio, con el ingreso con CIDITUC que
 * pide /ideas/nueva (y exige /api/ideas), o en persona. Lo dicen /acerca-de y
 * el chat, con y sin modelo. Si cambian las vias, hay que cambiarlo aca.
 */
export const REQUISITO_PARA_PRESENTAR =
  "Desde este sitio, ingresás con tu ciudadanía digital CIDITUC, la misma cuenta que usás para los trámites de la Municipalidad: la idea queda a tu nombre, que solo ve el equipo que la evalúa. También la podés presentar en persona en Ejército del Norte 410 (Dirección de Centros Vecinales) o en los Operativos Integrales Municipales. " +
  NOTA_DE_RECEPCION;

/**
 * Las preguntas del formulario de propuesta 2026, con las palabras del papel
 * que se reparte en las asambleas. El formulario del sitio, la carga del panel,
 * el documento imprimible y la ficha las dicen igual: la persona que llena el
 * papel y la que entra a la web contestan lo mismo, y quien transcribe un papel
 * encuentra cada respuesta en el mismo lugar.
 *
 * Las claves son las columnas de `ideas`. La correspondencia no es obvia en
 * dos: "¿Qué les gustaría mejorar o cambiar?" se guarda en `solucion` y el
 * nombre de la propuesta en `titulo`.
 */
export const PREGUNTAS_DE_LA_IDEA = {
  problema: {
    pregunta: "¿Qué problema comparten en el barrio?",
    ayuda: "Pensá en una situación que afecte a varios vecinos o a la comunidad.",
  },
  referenciasUbicacion: {
    pregunta: "¿Dónde ocurre?",
    ayuda:
      "Contanos todas las referencias que nos ayuden a encontrar el lugar: calles, esquina, altura o algún punto cercano.",
  },
  solucion: {
    pregunta: "¿Qué les gustaría mejorar o cambiar?",
    ayuda:
      "Contanos la propuesta con palabras sencillas. No hace falta saber cómo se realiza técnicamente.",
  },
  beneficios: {
    pregunta: "¿A quiénes beneficiaría?",
    ayuda:
      "Pensá en las personas, grupos o sectores del barrio que podrían aprovechar esta mejora.",
  },
  titulo: {
    pregunta: "¿Qué nombre le pondrían a la propuesta?",
    ayuda: "Puede ser un nombre corto y sencillo que ayude a identificarla.",
  },
  organizacion: {
    pregunta: "¿Presenta esta propuesta en nombre de una organización?",
    ayuda: "Un centro vecinal, un club, una cooperadora, una parroquia…",
  },
} as const;

/**
 * La aclaracion del pie del formulario de papel. Va igual en el sitio, antes de
 * enviar, y en el documento imprimible.
 */
export const ACLARACION_DE_LA_PROPUESTA =
  "Esta ficha recoge una primera propuesta. Luego será revisada por las áreas municipales competentes para analizar su factibilidad. Presentarla no significa que ya esté aprobada ni que su ejecución sea automática.";

/**
 * Como se vota, paso por paso. La votacion es presencial (ver
 * src/lib/votacion-presencial.ts): lo muestran /votar y /acerca-de y lo dice el
 * chat. Si cambia el circuito de votacion, hay que cambiarlo aca.
 */
export const PASOS_PARA_VOTAR: Explicacion[] = [
  {
    titulo: "Fijate qué día vota tu distrito",
    texto:
      `Votan ${turnosEnTexto()}. Si no sabés cuál es tu distrito, buscá tu barrio en la página de Distritos.`,
  },
  {
    titulo: "Andá a la sede de tu distrito con tu DNI",
    texto:
      "Con el DNI acreditás que vivís dentro del distrito. No hace falta CIDITUC ni inscribirse antes. Las sedes se publican en este sitio cuando estén confirmadas.",
  },
  {
    titulo: "Votá en la urna",
    texto:
      "Elegís uno de los proyectos prefactibles de tu distrito. Tenés un solo voto y es personal: no se puede votar por otra persona.",
  },
];

/**
 * Por que ningun proyecto tiene publicado cuanto cuesta. Lo muestra /acerca-de
 * y es lo que el chat contesta cuando le preguntan por montos.
 */
export const POR_QUE_NO_HAY_MONTOS =
  "Los proyectos ganadores todavía no tienen publicado cuánto cuestan. No es un dato que " +
  "falte cargar: el sistema anterior guardaba el presupuesto de cada idea con el valor 1, " +
  "que era un relleno y no un importe, así que al traer los datos no se migró ningún monto " +
  "en lugar de inventarlo. La estructura para publicarlos —el total de cada obra y el monto " +
  "por etapa, con su historial— está hecha y espera que el municipio informe las cifras.";

// ---------------------------------------------------------------------------
// Buscar en un texto largo (el reglamento) sin mandarlo entero
// ---------------------------------------------------------------------------

/** Palabras que no dicen de que se trata una pregunta. */
const VACIAS = new Set(
  (
    "a al algo algun alguna como con cual cuales cuando cuanto cuantos cuanta cuantas de del " +
    "dice donde el ella en entre es esa ese esta este esto hay la las le les lo los mas me mi " +
    "mis muy no o para pero por puede pueden puedo que quien quienes se segun ser si sin sobre " +
    "son su sus te tengo tiene tienen un una unas unos y ya yo reglamento regla reglas dice"
  ).split(" "),
);

/**
 * La raiz de una palabra, lo justo para que "votar", "voto" y "votos" se
 * encuentren entre si. Saca hasta dos terminaciones comunes; no es un stemmer
 * de verdad y no hace falta: se compara como prefijo (ver `buscarEnParrafos`).
 */
function raiz(palabra: string): string {
  let r = palabra;
  for (let vuelta = 0; vuelta < 2; vuelta += 1) {
    const sin = r.replace(/(ciones|cion|mente|ados|adas|ado|ada|ar|er|ir|os|as|es|o|a|e|s)$/, "");
    if (sin.length < 3 || sin === r) break;
    r = sin;
  }
  return r;
}

function palabrasDe(texto: string): string[] {
  return normalizar(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Las raices de las palabras que dicen algo de un texto, sin repetir. */
export function raicesDe(texto: string): string[] {
  return [
    ...new Set(
      palabrasDe(texto)
        .filter((p) => p.length >= 3 && !VACIAS.has(p))
        .map(raiz),
    ),
  ];
}

/** Cuantas de esas raices aparecen en el texto, como prefijo de alguna palabra. */
function coincidencias(raices: string[], texto: string): number {
  const palabras = palabrasDe(texto);
  return raices.filter((r) => palabras.some((p) => p.startsWith(r))).length;
}

/**
 * La pregunta de una lista que es, casi con seguridad, la misma que hizo la
 * persona con otras palabras: comparten al menos dos palabras que dicen algo,
 * y esas son por lo menos el 60% de las de la pregunta de la lista. Es un
 * umbral alto a proposito: la usa el buscador sin IA ANTES de buscar datos, y
 * una coincidencia floja le robaria la consulta a una pregunta por proyectos.
 */
export function mismaPregunta<T extends { pregunta: string }>(
  consulta: string,
  candidatas: T[],
): T | null {
  const deLaConsulta = raicesDe(consulta);
  let mejor: { candidata: T; puntaje: number } | null = null;
  for (const candidata of candidatas) {
    const propias = raicesDe(candidata.pregunta);
    if (!propias.length) continue;
    const comunes = propias.filter((r) => deLaConsulta.some((c) => c.startsWith(r) || r.startsWith(c)));
    const puntaje = comunes.length / propias.length;
    if (comunes.length >= 2 && puntaje >= 0.6 && (!mejor || puntaje > mejor.puntaje)) {
      mejor = { candidata, puntaje };
    }
  }
  return mejor?.candidata ?? null;
}

/**
 * Los parrafos que mas tienen que ver con la consulta, en el orden en que
 * aparecen en el texto, con su numero (desde 1). Un parrafo cuenta una vez por
 * cada palabra de la consulta que contiene (como prefijo, sin tildes): asi
 * "¿quién puede votar?" encuentra "votación", "votantes" y "vota".
 *
 * Sin ninguna palabra que sirva, o sin coincidencias, devuelve vacio: quien
 * llama decide que decir.
 */
export function buscarEnParrafos(
  parrafos: string[],
  consulta: string,
  maximo = 6,
): Array<{ numero: number; texto: string }> {
  const raices = raicesDe(consulta);
  if (!raices.length) return [];

  const puntuados = parrafos
    .map((texto, indice) => ({ numero: indice + 1, texto, puntos: coincidencias(raices, texto) }))
    .filter((p) => p.puntos > 0);

  return puntuados
    .sort((a, b) => b.puntos - a.puntos || a.numero - b.numero)
    .slice(0, maximo)
    .sort((a, b) => a.numero - b.numero)
    .map(({ numero, texto }) => ({ numero, texto }));
}
