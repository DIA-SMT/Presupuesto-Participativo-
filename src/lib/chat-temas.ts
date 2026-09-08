/**
 * Clasificador de las consultas del chat: en que tema entra cada pregunta y si
 * Migue la pudo resolver.
 *
 * Es DETERMINISTICO y no le pregunta a ningun modelo: clasificar con el modelo
 * costaria una llamada mas por consulta, daria resultados distintos para la
 * misma pregunta y haria imposible probarlo. Todo lo que hay aca son funciones
 * puras sobre dos senales que ya estan en la mesa cuando la consulta termina:
 *
 *  1. QUE HERRAMIENTAS uso Migue. Es la senal mas confiable, porque la eligio el
 *     modelo despues de entender la pregunta: si llamo a resumen_distrito, la
 *     persona estaba preguntando por un distrito. Los nombres que no estan en el
 *     catalogo (por ejemplo el "buscador-local" del modo sin clave) se ignoran:
 *     no dicen nada del tema y no pueden dar por resuelta una consulta.
 *  2. LAS PALABRAS de la pregunta, normalizadas sin tildes con `normalizar`
 *     (igual que el buscador del sitio). Es el respaldo para los dos casos en
 *     los que no hubo herramientas: el buscador deterministico de
 *     src/lib/chat-sin-ia.ts y las preguntas que Migue no supo contestar, que
 *     son justamente las que mas interesan.
 *
 * `TEMAS` es la lista canonica: el enum `tema_consulta` de la base la importa de
 * aca (ver src/db/schema.ts), asi que no hay dos listas que se puedan desfasar.
 */
import { normalizar } from "./texto";

/**
 * Temas que aparecen de verdad en este dominio. Salieron de mirar para que
 * sirven las herramientas y que responde el sitio; el ultimo es el cajon de lo
 * que no encaja, que tambien es un dato: si crece, falta un tema.
 */
export const TEMAS = [
  /** Que se presento, que gano, en que anda una obra. */
  "proyectos",
  /** Un distrito o un barrio puntual: a donde pertenezco, que hay en mi zona. */
  "distrito",
  /** Como presentar una idea: el formulario, los plazos, que se pide. */
  "presentar_idea",
  /** Como votar y como empadronarse. */
  "votar",
  /** El cronograma: fechas, plazos, etapa en curso. */
  "cronograma",
  /** Plata: el presupuesto del programa y los montos de las obras. */
  "presupuesto",
  /** Lo que no encaja en ninguno de los anteriores. */
  "otro",
] as const;

export type TemaConsulta = (typeof TEMAS)[number];

/** Como se nombra cada tema en el panel. Texto visible: lleva tildes. */
export const ETIQUETA_TEMA: Record<TemaConsulta, string> = {
  proyectos: "Proyectos y obras",
  distrito: "Un distrito o barrio",
  presentar_idea: "Cómo presentar una idea",
  votar: "Votación y empadronamiento",
  cronograma: "Fechas y cronograma",
  presupuesto: "Presupuesto y montos",
  otro: "Otros",
};

// ---------------------------------------------------------------------------
// Senal 1: las herramientas que uso Migue
// ---------------------------------------------------------------------------

/**
 * Tema que implica cada herramienta del catalogo (src/lib/chat-herramientas.ts).
 * Una herramienta que no este aca no aporta nada al tema.
 */
export const TEMA_POR_HERRAMIENTA: Record<string, TemaConsulta> = {
  como_presentar_idea: "presentar_idea",
  ubicar_barrio: "distrito",
  resumen_distrito: "distrito",
  detalle_proyecto: "proyectos",
  buscar_proyectos: "proyectos",
  estadisticas: "proyectos",
};

/**
 * Herramientas cuyo tema es una suposicion floja: `estadisticas` devuelve los
 * totales de la edicion, y con eso se contesta tanto "cuantas ideas hay" como
 * "cuanta plata se puso". Cuando la unica senal es una de estas, deciden las
 * palabras de la pregunta; solo si las palabras no dicen nada se usa su tema.
 */
const HERRAMIENTAS_AMBIGUAS = new Set(["estadisticas"]);

/**
 * Orden de especificidad. Si Migue uso varias herramientas en la misma
 * consulta, manda la primera de esta lista que aparezca: ubicar_barrio es mas
 * especifico que buscar_proyectos, porque nadie pregunta por un barrio de paso.
 */
const PRIORIDAD_HERRAMIENTAS = [
  "como_presentar_idea",
  "ubicar_barrio",
  "resumen_distrito",
  "detalle_proyecto",
  "buscar_proyectos",
] as const;

function temaFirmeDeHerramientas(
  herramientas: readonly string[],
): TemaConsulta | null {
  const usadas = new Set(herramientas);
  for (const nombre of PRIORIDAD_HERRAMIENTAS) {
    if (usadas.has(nombre)) return TEMA_POR_HERRAMIENTA[nombre];
  }
  return null;
}

function temaFlojoDeHerramientas(
  herramientas: readonly string[],
): TemaConsulta | null {
  for (const nombre of herramientas) {
    if (HERRAMIENTAS_AMBIGUAS.has(nombre)) return TEMA_POR_HERRAMIENTA[nombre];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Senal 2: las palabras de la pregunta
// ---------------------------------------------------------------------------

/**
 * Marcadores por tema, en el ORDEN en que se prueban. El orden es la regla y
 * esta elegido a proposito: primero la intencion (quiero presentar, quiero
 * votar), despues el recorte (cuando, cuanto, donde) y al final el objeto
 * (proyectos, obras). Asi "hasta cuando puedo presentar una idea" queda en
 * `presentar_idea`, que es lo que la persona vino a hacer, y no en `cronograma`.
 *
 * Los marcadores se comparan como PALABRA COMPLETA sobre el texto normalizado
 * (minusculas, sin tildes), no como prefijo: por eso estan las formas que
 * interesan y no las que confunden. "presentar" esta y "presentaron" no, porque
 * "cuantas ideas se presentaron" es una pregunta por los proyectos, no por como
 * presentar una. Lo mismo con "voto" (esta) y "votos" o "votado" (no estan):
 * "el mas votado" pregunta por un proyecto.
 */
const MARCADORES: Array<{ tema: TemaConsulta; claves: string[] }> = [
  {
    tema: "presentar_idea",
    claves: [
      "presentar", "presento", "presentarla", "presentarlo", "presentacion",
      "proponer", "propongo", "propuesta", "postular", "postularme",
      "formulario", "cargar", "subir", "anotar", "participo", "participar",
      // Las menciones sueltas a una idea ("mi idea", "tengo una idea") no estan
      // aca: son ambiguas y se resuelven aparte, en IDEA_SUELTA.
    ],
  },
  {
    tema: "votar",
    claves: [
      "votar", "vota", "votan", "votas", "voto", "votacion", "votaciones",
      "empadronar", "empadronarme", "empadronarse", "empadrono", "empadrona",
      "empadronado", "empadronada", "empadronamiento", "padron", "cidituc",
      "ciudadania digital", "habilitado", "habilitada", "dni",
    ],
  },
  {
    tema: "cronograma",
    claves: [
      "cronograma", "calendario", "cuando", "fecha", "fechas", "plazo",
      "plazos", "vence", "vencio", "cierra", "cierran", "cerro", "abre",
      "abren", "empieza", "empezo", "termina", "termino", "etapa", "etapas",
      "dia", "dias", "horario",
    ],
  },
  {
    tema: "presupuesto",
    claves: [
      "presupuesto", "monto", "montos", "plata", "dinero", "pesos", "millones",
      "cuesta", "costo", "financia", "financiamiento", "fondos", "inversion",
      "invierte",
      // "sale" a secas es demasiado ancho ("de donde sale"); la frase entera no.
      "cuanto sale",
    ],
  },
  {
    tema: "distrito",
    claves: [
      "distrito", "distritos", "barrio", "barrios", "zona", "zonas", "vivo",
      "mapa", "manzana",
    ],
  },
  {
    tema: "proyectos",
    claves: [
      "proyecto", "proyectos", "obra", "obras", "idea", "ideas", "gano",
      "ganaron", "ganador", "ganadora", "ganadores", "plaza", "plazas",
      "playon", "cancha", "vereda", "veredas", "iluminacion", "avance",
      "avances", "ejecucion", "transparencia", "factible",
    ],
  },
];

function escapar(clave: string): string {
  return clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Palabra completa sobre texto ya normalizado: el limite es "no alfanumerico". */
function patronDe(claves: string[]): RegExp {
  return new RegExp(
    `(^|[^a-z0-9])(${claves.map(escapar).join("|")})($|[^a-z0-9])`,
  );
}

const PATRONES: Array<{ tema: TemaConsulta; patron: RegExp }> = MARCADORES.map(
  (marcador) => ({ tema: marcador.tema, patron: patronDe(marcador.claves) }),
);

/**
 * El nombre del programa contiene la palabra "presupuesto", asi que cualquier
 * pregunta que lo nombre caeria en el tema de la plata. Se saca antes de buscar
 * marcadores: "que es el presupuesto participativo" no es una pregunta de
 * montos.
 */
function textoDeBusqueda(pregunta: string): string {
  return normalizar(pregunta).replace(/presupuesto participativo/g, " ");
}

/**
 * Nombrar una idea sin decir que se quiere hacer con ella. "tengo una idea para
 * la plaza" es casi siempre alguien que la quiere presentar, asi que cuenta como
 * intencion; pero "mi idea salio ganadora?" pregunta por el RESULTADO de un
 * proyecto, no por como cargar uno.
 *
 * Por eso la mencion suelta pierde cuando la pregunta ademas trae una palabra de
 * resultado. Es la misma clase de desambiguacion que sacar el nombre del programa
 * antes de buscar montos, y va aparte de MARCADORES porque es la unica clave que
 * depende de lo que NO diga la pregunta.
 */
const IDEA_SUELTA = ["mi idea", "una idea", "nueva idea", "mis ideas"];

const RESULTADO = [
  "gano", "ganaron", "ganadora", "ganador", "ganadores", "perdio",
  "factible", "rechazada", "rechazaron", "aprobada", "aprobaron",
  "salio elegida", "quedo seleccionada",
];

const PATRON_IDEA_SUELTA = patronDe(IDEA_SUELTA);
const PATRON_RESULTADO = patronDe(RESULTADO);

function temaDePalabras(pregunta: string): TemaConsulta | null {
  const texto = textoDeBusqueda(pregunta);
  if (!texto) return null;
  // La intencion de presentar va primero (ver MARCADORES) y la mencion suelta de
  // una idea cuenta como intencion, salvo que la pregunta sea por el resultado.
  // Si cede, el recorrido sigue igual: un verbo de intencion explicito
  // ("quiero presentar mi idea, gano?") lo vuelve a agarrar mas abajo.
  if (PATRON_IDEA_SUELTA.test(texto) && !PATRON_RESULTADO.test(texto)) {
    return "presentar_idea";
  }
  for (const { tema, patron } of PATRONES) {
    if (patron.test(texto)) return tema;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Clave para agrupar preguntas
// ---------------------------------------------------------------------------

/**
 * Clave con la que el panel cuenta dos preguntas como la misma. Es lo que se
 * guarda en `chat_consultas.pregunta_normalizada`.
 *
 * `normalizar` baja a minusculas y saca las tildes, pero deja los signos: sin
 * limpiarlos, "¿Cómo voto?" y "como voto" quedarian en dos filas distintas del
 * panel, que es justo lo que se quiere evitar. Asi que ademas se reemplaza todo
 * lo que no sea letra o numero por un espacio y se colapsan los espacios.
 *
 * Se calcula al registrar la consulta y no en la consulta del panel porque la
 * base no tiene la extension unaccent y no se va a agregar (ver CLAUDE.md).
 */
export function claveDePregunta(pregunta: string): string {
  return normalizar(pregunta)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------

/**
 * Tema de una consulta. Primero la senal de las herramientas (sin las
 * ambiguas), despues las palabras de la pregunta y al final el tema flojo de
 * una herramienta ambigua. Si nada dice nada, `otro`.
 */
export function temaDeConsulta(
  pregunta: string,
  herramientas: readonly string[] = [],
): TemaConsulta {
  return (
    temaFirmeDeHerramientas(herramientas) ??
    temaDePalabras(pregunta) ??
    temaFlojoDeHerramientas(herramientas) ??
    "otro"
  );
}

// ---------------------------------------------------------------------------
// Resuelta o no
// ---------------------------------------------------------------------------

/**
 * Frases con las que una respuesta admite que el dato no esta. Son las mismas
 * que el prompt de sistema le pide usar cuando falta informacion y las que
 * escribe el buscador deterministico ("No encontre nada con esa consulta").
 * Se comparan sobre la respuesta normalizada.
 */
const FRASES_SIN_DATO = [
  "no encontre",
  "no encontramos",
  "no tengo ese dato",
  "no tengo el dato",
  "no tengo datos",
  "no tengo esa informacion",
  "no tengo informacion",
  "no hay informacion",
  "no esta cargado",
  "no esta cargada",
  "no estan cargados",
  "no estan cargadas",
  "no figura",
  "no aparece",
  "no esta publicado",
  "no esta publicada",
  "no publicado todavia",
  "no puedo responder",
  "no lo tengo",
  "no lo se",
];

export type SenalesRespuesta = {
  /**
   * Nombres de las herramientas que uso Migue, en orden. Los que no estan en
   * el catalogo se ignoran.
   */
  herramientas?: readonly string[];
  /**
   * Subconjunto de `herramientas` que contesto que NO hay datos para eso (el
   * "aviso" que devuelven las herramientas cuando no encuentran nada).
   */
  sinDatos?: readonly string[];
  /** El texto que la persona termino leyendo. */
  respuesta?: string | null;
  /** true si la consulta se corto por un error del servidor o del proveedor. */
  huboError?: boolean;
};

export type SenalesConsulta = SenalesRespuesta & {
  /** La pregunta tal como la escribio la persona. */
  pregunta: string;
};

/**
 * Si la consulta quedo resuelta, mirado desde el vecino: se fue con lo que vino
 * a buscar, si o no. Es el dato mas valioso del panel, porque una pregunta que
 * Migue no supo contestar es contenido que le falta al sitio.
 *
 * No alcanza con que la respuesta no este vacia: Migue puede escribir tres
 * parrafos impecables para decir que no tiene el dato. El orden de las reglas es
 * el contrato:
 *
 *  1. Si hubo un error, no esta resuelta (la persona vio un aviso de falla).
 *  2. Si la respuesta llego vacia, tampoco.
 *  3. Si alguna herramienta del catalogo trajo datos, si: Migue contesto con
 *     datos reales de la base. Que ademas aclare que un monto no esta publicado
 *     no invalida lo que si contesto.
 *  4. Si se usaron herramientas del catalogo y TODAS avisaron que no hay datos,
 *     no esta resuelta: el sitio no tiene eso.
 *  5. Sin herramientas del catalogo (el buscador deterministico, o una respuesta
 *     armada solo con el contexto fijo), decide el texto: si admite que no tiene
 *     el dato, no esta resuelta.
 *  6. Cualquier otro caso, si.
 */
export function consultaResuelta(senales: SenalesRespuesta): boolean {
  if (senales.huboError) return false;

  const respuesta = senales.respuesta;
  // `undefined` significa "no se paso"; null o vacio significa que no hubo texto.
  if (respuesta !== undefined && !(respuesta ?? "").trim()) return false;

  const conocidas = (senales.herramientas ?? []).filter(
    (nombre) => nombre in TEMA_POR_HERRAMIENTA,
  );
  const sinDatos = new Set(senales.sinDatos ?? []);
  if (conocidas.some((nombre) => !sinDatos.has(nombre))) return true;
  if (conocidas.length) return false;

  if (respuesta && admiteQueNoTieneElDato(respuesta)) return false;
  return true;
}

/**
 * Si la respuesta ADMITE que no tiene el dato, en lugar de solo mencionarlo al
 * pasar.
 *
 * La frase se busca en la PRIMERA oracion y no en toda la respuesta. Buscarla
 * entera hundia respuestas que contestaban de lleno y agregaban una salvedad al
 * final, que es justo lo que el prompt de sistema le PIDE hacer ("Si no aparece,
 * mandalo al mapa en /distritos"). Medido con las dos respuestas del caso:
 *
 *   "Si, podes votar: tenes un voto en tu distrito. Si tu nombre no aparece en
 *    el padron, empadronate con CIDITUC..."          -> antes false, ahora true
 *   "El plazo cierra el 30 de septiembre. Si tu barrio no figura en el listado,
 *    mira el mapa en /distritos."                     -> antes false, ahora true
 *
 * Y sigue detectando lo que tiene que detectar, porque una respuesta que no
 * tiene el dato lo dice de entrada y no en una nota al pie:
 *
 *   "No encontre nada con esa consulta. Proba con:"   -> false
 *
 * El corte es la primera oracion o los primeros 160 caracteres, lo que llegue
 * antes: hay respuestas de una sola oracion larga.
 */
function admiteQueNoTieneElDato(respuesta: string): boolean {
  const texto = normalizar(respuesta);
  const finOracion = texto.search(/[.!?\n]/);
  const largo = finOracion >= 0 ? Math.min(finOracion + 1, 160) : 160;
  const apertura = texto.slice(0, largo);
  return FRASES_SIN_DATO.some((frase) => apertura.includes(frase));
}

export type Clasificacion = {
  tema: TemaConsulta;
  resuelta: boolean;
};

/**
 * Clasifica una consulta terminada. Funcion pura: las mismas senales dan
 * siempre el mismo resultado.
 */
export function clasificarConsulta(senales: SenalesConsulta): Clasificacion {
  return {
    tema: temaDeConsulta(senales.pregunta, senales.herramientas ?? []),
    resuelta: consultaResuelta(senales),
  };
}
