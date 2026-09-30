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
 * cada pagina) NO va aca: vive en la base y se carga desde /admin/contenido.
 */
import { normalizar } from "./texto";

export type Explicacion = { titulo: string; texto: string };

/**
 * Las reglas que /reglamento muestra mientras el reglamento oficial no esta
 * cargado. Son las que el programa ya tiene confirmadas; con el reglamento
 * publicado, la pagina (y el chat) pasan a decir lo que diga el reglamento.
 */
export const REGLAS_CONFIRMADAS: Explicacion[] = [
  {
    titulo: "Un voto por persona",
    texto:
      "Cada persona empadronada tiene un solo voto y lo usa en un único proyecto. El sistema lo verifica: no se puede votar dos veces.",
  },
  {
    titulo: "Se vota en el distrito donde se vive",
    texto:
      "El voto solo puede aplicarse a un proyecto del distrito de residencia de la persona, que ella misma declara la primera vez que entra a votar. La ciudad tiene 20 distritos y cada uno elige su propio proyecto.",
  },
  {
    titulo: "Empadronamiento con CIDITUC",
    texto:
      "La habilitación para votar se hace con la ciudadanía digital CIDITUC, de manera virtual desde la web municipal o presencial en las asambleas participativas.",
  },
  {
    titulo: "Tres categorías de proyecto",
    texto:
      "Las propuestas se encuadran en espacio socio ambiental, espacio cultural deportivo o espacio de innovación urbana.",
  },
  {
    titulo: "Evaluación técnica previa a la votación",
    texto:
      "Toda idea pasa por una evaluación técnica y presupuestaria. Puede quedar como factible, no factible, o integrarse con otra propuesta parecida. Solo las factibles se votan.",
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
 * Como se vota en el sitio, paso por paso: lo que hace de verdad /votar (y
 * /ingresar antes). Lo muestra /acerca-de y lo dice el chat. Si cambia el
 * circuito de votacion, hay que cambiarlo aca.
 */
export const PASOS_PARA_VOTAR: Explicacion[] = [
  {
    titulo: "Ingresá con CIDITUC",
    texto:
      "Mientras la votación está abierta, entrá a Votar e ingresá con tu cuenta de ciudadanía digital CIDITUC. Si todavía no la tenés, la podés hacer desde la página de la Municipalidad o en una asamblea participativa.",
  },
  {
    titulo: "Declará en qué distrito vivís",
    texto:
      "La primera vez, buscás tu barrio o marcás tu casa en el mapa, y confirmás que vivís en ese distrito. Solo se guarda el número de distrito, y lo podés cambiar hasta que votes.",
  },
  {
    titulo: "Elegí un proyecto y confirmá",
    texto:
      "La boleta muestra, en orden alfabético, los proyectos factibles de tu distrito. Tenés un solo voto: una vez confirmado queda registrado y no se puede votar otra vez en la misma edición.",
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
