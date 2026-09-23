/**
 * Politica de etapas: que se puede hacer desde el panel segun la etapa de la
 * edicion.
 *
 * Existe porque las acciones del panel no miraban la etapa, y la votacion tiene
 * dos propiedades que la vuelven fragil:
 *  - un voto no se cambia ni se repite: la restriccion UNIQUE (edicion,
 *    votante) de `votos` lo impide. Quien voto un proyecto que despues sale de
 *    la votacion se queda sin voto, y no puede usarlo en otro;
 *  - lo que se vota y lo que se cuenta es el mismo universo: ideas `factible` y
 *    publicadas (/api/votos, getVotosPorIdea). Una idea que deja de serlo sale
 *    del ranking con sus votos adentro, y una que entra compite con menos dias.
 *
 * Todo esto es logica pura, sin base ni Next, y la usan dos lados con los MISMOS
 * textos:
 *  - las server actions (src/app/admin/acciones.ts), que releen la etapa y los
 *    conteos de la base dentro de la transaccion que escribe. Es la unica
 *    garantia: el cliente puede mandar cualquier cosa;
 *  - las pantallas del panel, que la consultan para deshabilitar y explicar los
 *    botones antes de que alguien los toque. Si una pantalla se equivoca, la
 *    accion igual rechaza.
 *
 * Los motivos se muestran tal cual al equipo: van en voseo y dicen que hacer,
 * no solo que no se puede.
 */
import type { EstadoIdea, EtapaEdicion } from "@/db/queries";
import { ETIQUETA_ETAPA, formatearNumero } from "@/lib/formato";

/**
 * Las etapas EN ORDEN: la posicion en esta lista es lo que define "avanzar" y
 * "volver". Es el mismo orden del enum `etapa_edicion` del esquema.
 */
export const ETAPAS = [
  "ideas",
  "evaluacion",
  "votacion",
  "seguimiento",
  "cerrada",
] as const satisfies readonly EtapaEdicion[];

export type Etapa = (typeof ETAPAS)[number];

/** Para validar lo que llega de un formulario: la etapa es texto libre ahi. */
export function esEtapa(valor: unknown): valor is Etapa {
  return typeof valor === "string" && (ETAPAS as readonly string[]).includes(valor);
}

/**
 * La respuesta de cada consulta de la politica. El motivo es el texto que ve la
 * persona: la accion lo devuelve como `error` y la pantalla lo muestra al lado
 * del boton deshabilitado.
 */
export type Veredicto = { permitido: true } | { permitido: false; motivo: string };

const PERMITIDO: Veredicto = { permitido: true };

function rechazo(motivo: string): Veredicto {
  return { permitido: false, motivo };
}

function posicion(etapa: Etapa): number {
  return ETAPAS.indexOf(etapa);
}

/** El nombre de la etapa como lo ve el equipo en el selector, entre comillas. */
function nombre(etapa: Etapa): string {
  return `“${ETIQUETA_ETAPA[etapa] ?? etapa}”`;
}

function cantidad(numero: number, singular: string, plural: string): string {
  return `${formatearNumero(numero)} ${numero === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Cambio de etapa
// ---------------------------------------------------------------------------

/** Lo que la base sabe de la edicion y decide si se puede volver atras. */
export type ContextoEdicion = {
  /** Votos de la edicion, contados como dice `votosDeLaEdicion`. */
  votos: number;
  /** Ideas de la edicion con la marca de ganador puesta HOY. */
  ganadores: number;
};

/**
 * Cuantos votos tiene una edicion, a efectos de esta politica.
 *
 * Se toma el mayor de dos numeros que en una edicion corrida en este sitio son
 * iguales (el voto y el contador se mueven en la misma transaccion, ver
 * /api/votos): las filas de `votos` y la suma del contador `ideas.votos`. En una
 * edicion migrada no lo son: la 2025 tiene sus votos solo en el contador y cero
 * filas en `votos`, y para esta politica tambien voto.
 */
export function votosDeLaEdicion(registrados: number, enIdeas: number): number {
  return Math.max(registrados, enIdeas);
}

/**
 * Si una edicion puede pasar de `desde` a `hasta`.
 *
 * Las reglas, y por que:
 *
 *  1. Avanzar siempre se puede, incluso salteando etapas. Avanzar no deshace
 *     nada de lo que ya paso: a lo sumo cierra algo antes de tiempo, y eso lo
 *     explica la confirmacion del selector antes de guardar.
 *
 *  2. Volver a una etapa ANTERIOR a la votacion ("ideas" o "evaluacion") solo
 *     si la edicion no tiene votos ni ganadores. Es la marcha atras de una
 *     votacion abierta por error antes de que alguien vote. Con un solo voto ya
 *     no: en esas etapas se puede evaluar y despublicar libremente, y los que
 *     votaron un proyecto que cambie no pueden volver a votar (UNIQUE). Una
 *     edicion que ya voto no se "desvota".
 *
 *  3. Volver a "votacion" desde "seguimiento" o "cerrada" solo si no hay
 *     ningun ganador proclamado. Sin ganadores es la correccion de una votacion
 *     que se cerro antes de tiempo: los votos emitidos siguen, y quien no llego
 *     a votar todavia puede. Con un ganador proclamado, reabrir la votacion es
 *     dejar votar sobre un resultado que ya se anuncio. La regla mira la marca
 *     de ganador de hoy y no el historial: si una proclamacion fue un error, un
 *     administrador la deshace desde la bandeja con motivo escrito, y eso queda
 *     en `revisiones`. Recien sin ganadores vuelve a estar disponible.
 *
 *  4. Volver de "cerrada" a "seguimiento" siempre se puede: no abre la
 *     votacion ni toca ideas, solo vuelve a mostrar la edicion como en curso.
 */
export function puedeCambiarEtapa(
  desde: Etapa,
  hasta: Etapa,
  contexto: ContextoEdicion,
): Veredicto {
  // Quedarse donde esta no es un cambio: la accion lo resuelve sin escribir.
  if (desde === hasta) return PERMITIDO;

  // Regla 1.
  if (posicion(hasta) > posicion(desde)) return PERMITIDO;

  // Regla 2.
  if (posicion(hasta) < posicion("votacion")) {
    if (contexto.votos > 0) {
      const votos = cantidad(contexto.votos, "voto", "votos");
      return rechazo(
        desde === "votacion"
          ? `La votación de esta edición ya tiene ${votos}: volver a ${nombre(hasta)} dejaría cambiar o despublicar proyectos que ya se votaron, y quienes votaron no pueden volver a votar. Si la votación tiene que terminar, pasala a “Seguimiento de obras”.`
          : `Esta edición ya votó (${votos}): no puede volver a ${nombre(hasta)}, porque eso reabriría la evaluación de proyectos que ya se votaron. Una edición que votó no vuelve a una etapa anterior a la votación.`,
      );
    }
    if (contexto.ganadores > 0) {
      return rechazo(
        `Esta edición tiene ${cantidad(contexto.ganadores, "proyecto ganador proclamado", "proyectos ganadores proclamados")}: no puede volver a ${nombre(hasta)}. Si una proclamación fue un error, reabrí esa revisión desde “Propuestas” primero.`,
      );
    }
    return PERMITIDO;
  }

  // Regla 3.
  if (hasta === "votacion") {
    if (contexto.ganadores > 0) {
      return rechazo(
        `Esta edición ya tiene ${cantidad(contexto.ganadores, "proyecto ganador proclamado", "proyectos ganadores proclamados")}: reabrir la votación dejaría votar sobre un resultado ya anunciado. Si una proclamación fue un error, un administrador tiene que reabrir esa revisión desde “Propuestas” (queda en el historial); mientras haya ganadores, la votación no se reabre.`,
      );
    }
    return PERMITIDO;
  }

  // Regla 4: de "cerrada" a "seguimiento", lo unico que queda.
  return PERMITIDO;
}

// ---------------------------------------------------------------------------
// Acciones sobre una idea
// ---------------------------------------------------------------------------

/** Lo que decide si una idea esta en la votacion. */
export type IdeaEnJuego = { estado: EstadoIdea; publicada: boolean };

/**
 * Si la idea se vota: `factible` y publicada. Es exactamente el universo de
 * /api/votos (que acepta el voto) y de getVotosPorIdea (que cuenta el ranking
 * y valida la proclamacion). Si uno de esos dos cambia, este cambia con el.
 */
export function seVota(idea: IdeaEnJuego): boolean {
  return idea.estado === "factible" && idea.publicada;
}

/** Lo que el panel le puede hacer a una idea y que mueve su estado o su publicacion. */
export type CambioDeIdea =
  | { accion: "evaluar"; estado: EstadoIdea }
  | { accion: "publicar" }
  | { accion: "despublicar" }
  | { accion: "reabrir" };

/** Como queda la idea despues del cambio, en lo que a la votacion importa. */
function despuesDe(idea: IdeaEnJuego, cambio: CambioDeIdea): IdeaEnJuego {
  switch (cambio.accion) {
    case "evaluar":
      return { estado: cambio.estado, publicada: idea.publicada };
    case "publicar":
      return { estado: idea.estado, publicada: true };
    case "despublicar":
      return { estado: idea.estado, publicada: false };
    case "reabrir":
      // reabrirRevision vuelve la idea a pendiente y no toca la publicacion.
      return { estado: "pendiente", publicada: idea.publicada };
  }
}

/**
 * El cambio dicho como lo diria la persona, para armar el motivo. Evaluar es el
 * unico que puede tanto sacar una idea de la votacion como meterla; publicar
 * solo la mete, y despublicar y reabrir solo la sacan.
 */
function comoSeDice(cambio: CambioDeIdea, sale: boolean): string {
  switch (cambio.accion) {
    case "evaluar":
      return sale ? "le cambiás el estado" : "la declarás factible";
    case "publicar":
      return "la publicás";
    case "despublicar":
      return "la despublicás";
    case "reabrir":
      return "reabrís la revisión";
  }
}

/**
 * Si el panel puede aplicarle `cambio` a una idea cuya edicion esta en `etapa`.
 *
 * La etapa es la de la edicion DE LA IDEA, no la de la edicion activa: una
 * accion puede llegar con el id de una idea de cualquier edicion.
 *
 * La regla es una sola: mientras la votacion esta abierta, el conjunto de ideas
 * que se votan queda fijo. Ninguna sale (evaluarla distinto, despublicarla o
 * reabrirla la sacaria del ranking con sus votos, y sus votantes no pueden
 * votar de nuevo) y ninguna entra (declarar factible o publicar una idea en
 * plena votacion la pone a competir con menos dias, frente a vecinos que ya
 * votaron y no pueden cambiar su voto).
 *
 * Todo lo que no mueve ese conjunto sigue permitido en votacion, a proposito:
 * escribir la devolucion de un "no" (la deuda con el vecino no espera a que
 * termine la votacion), corregir el texto de la devolucion de un proyecto sin
 * cambiarle el estado, o evaluar ideas que no estan publicadas.
 *
 * Fuera de la votacion no hay restriccion por etapa:
 *  - en "ideas" y "evaluacion" es el trabajo normal del equipo;
 *  - en "seguimiento" y "cerrada" la votacion termino y ningun vecino puede
 *    votar, asi que nadie pierde un voto. Que el proyecto mas votado resulte no
 *    factible despues de la votacion es un caso que el reglamento contempla, y
 *    el cambio queda en el historial de la idea.
 */
export function puedeCambiarIdea(
  etapa: Etapa,
  idea: IdeaEnJuego,
  cambio: CambioDeIdea,
): Veredicto {
  if (etapa !== "votacion") return PERMITIDO;

  const antes = seVota(idea);
  const despues = seVota(despuesDe(idea, cambio));
  if (antes === despues) return PERMITIDO;

  const como = comoSeDice(cambio, antes);
  return rechazo(
    antes
      ? `La votación de esta edición está abierta y esta idea se está votando: si ${como}, sale del ranking con sus votos y quienes la votaron no pueden volver a votar. Esperá a que cierre la votación (etapa “Seguimiento de obras”) para hacerlo.`
      : `La votación de esta edición está abierta: si ${como}, esta idea entra a competir con la votación ya empezada, y quienes ya votaron no pueden cambiar su voto. Esperá a que cierre la votación (etapa “Seguimiento de obras”) para hacerlo.`,
  );
}

/**
 * Si se puede proclamar un ganador en una edicion en `etapa`: solo con la
 * votacion terminada, en "seguimiento" o "cerrada". Proclamar con la votacion
 * abierta es coronar un conteo que todavia se mueve; antes de la votacion no
 * hay conteo que mirar.
 */
export function puedeProclamar(etapa: Etapa): Veredicto {
  if (etapa === "seguimiento" || etapa === "cerrada") return PERMITIDO;
  if (etapa === "votacion") {
    return rechazo(
      "La votación de esta edición está abierta: el ganador se proclama cuando termina, con el conteo final. Cerrala desde “Etapa del proceso” (pasala a “Seguimiento de obras”) y después proclamá.",
    );
  }
  return rechazo(
    `Esta edición todavía no votó (está en ${nombre(etapa)}): el ganador se proclama cuando la votación terminó, en “Seguimiento de obras” o “Edición cerrada”.`,
  );
}

// ---------------------------------------------------------------------------
// Activacion de una edicion
// ---------------------------------------------------------------------------

/**
 * Si se puede activar otra edicion, dada la que esta activa ahora (o null si
 * no hay ninguna).
 *
 * No con la activa en votacion. /api/votos solo acepta votos de la edicion
 * activa, asi que activar otra corta esa votacion en el acto y sin aviso al
 * vecino; ademas la bandeja trabaja sobre la edicion activa, y las ideas de la
 * votacion cortada dejan de verse. Primero se cierra la votacion (queda
 * registrado en la bitacora como cambio de etapa) y despues se activa la otra.
 *
 * Las demas etapas no bloquean: activar otra edicion con la saliente en
 * "ideas" tambien cierra el formulario, pero una idea se puede presentar en la
 * edicion siguiente y un voto no se puede emitir despues. La confirmacion del
 * panel dice igual en que etapa queda la saliente.
 */
export function puedeActivarOtraEdicion(
  activa: { anio: number; etapa: Etapa } | null,
): Veredicto {
  if (!activa || activa.etapa !== "votacion") return PERMITIDO;
  return rechazo(
    `La edición ${activa.anio} tiene la votación abierta: si activás otra, esa votación se corta en el acto (el sitio solo acepta votos de la edición activa) y sus propuestas dejan de verse en el panel. Cerrá primero la votación de la ${activa.anio} (pasala a “Seguimiento de obras”) y después activá esta.`,
  );
}
