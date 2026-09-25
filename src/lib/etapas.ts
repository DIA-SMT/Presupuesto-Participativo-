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
 *
 * Desde la Fase 2 viven aca tambien dos reglas sobre una idea que NO dependen
 * de la etapa y valen en todas (ver `puedeCambiarIdea` y
 * `puedeCambiarDeDistrito`): una idea descartada no se toca salvo para deshacer
 * el descarte, y una idea con votos no se muda de distrito. Estan aca y no en
 * cada accion porque este es el lugar al que todas las acciones le preguntan,
 * dentro de su transaccion y con la fila de la idea bloqueada (`bloqueoPorEtapa`
 * en src/app/admin/comun.ts). Puestas en una accion suelta, la regla valdria en
 * esa y no en las otras.
 */
import type { EstadoIdea, EtapaEdicion } from "@/db/queries";
import { ETIQUETA_ESTADO, ETIQUETA_ETAPA, formatearNumero } from "@/lib/formato";

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

/**
 * Lo que el panel le puede hacer a una idea: lo que mueve su estado o su
 * publicacion, y la correccion de lo que dice, que no mueve ninguna de las dos
 * cosas pero cambia lo que el vecino lee (y, si cambia el punto, en que
 * distrito se vota).
 */
export type CambioDeIdea =
  | { accion: "evaluar"; estado: EstadoIdea }
  | { accion: "publicar" }
  | { accion: "despublicar" }
  | { accion: "reabrir" }
  /** Titulo, textos, categoria, barrio, punto o integracion en otra idea. */
  | { accion: "corregir" }
  /** Prueba, spam o carga repetida: pasa a "descartado" y queda sin publicar. */
  | { accion: "descartar" }
  /** Deshace un descarte: vuelve a "pendiente", sin publicar. */
  | { accion: "restaurar" };

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
    case "corregir":
      // No toca ni el estado ni la publicacion: su regla va aparte, arriba de
      // la comparacion del antes y el despues (ver puedeCambiarIdea).
      return idea;
    case "descartar":
      return { estado: "descartado", publicada: false };
    case "restaurar":
      // La publicacion se deja como esta: una descartada quedo sin publicar,
      // y deshacer el descarte no la publica. Eso lo decide el equipo despues.
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
    // Los tres de abajo nunca llegan a armar este motivo: corregir tiene su
    // propia regla, y descartar y restaurar solo se aplican a ideas que no se
    // votan ni antes ni despues. Estan para que el switch cubra todo.
    case "corregir":
      return "la corregís";
    case "descartar":
      return "la descartás";
    case "restaurar":
      return "deshacés el descarte";
  }
}

/**
 * Las reglas de ESTADO: valen en cualquier etapa, y por eso se miran antes que
 * la votacion. Devuelve el rechazo, o null si el estado no tiene nada que decir.
 *
 *  - Una descartada (prueba, spam, carga repetida) no es una propuesta: no se
 *    evalua, no se publica, no se reabre ni se corrige. Su unica salida es
 *    deshacer el descarte, que la devuelve a "pendiente" con su fila en el
 *    historial. Si pudiera publicarse, un spam apareceria en el sitio con el
 *    estado "Descartada" y entraria en las cuentas publicas, que solo miran
 *    `publicada`.
 *  - Solo se descarta lo que nadie evaluo todavia (borrador o pendiente). Una
 *    idea evaluada ya tiene una decision que el vecino puede estar leyendo: si
 *    igual hay que descartarla, primero se reabre su revision, con su motivo.
 *  - Solo se deshace el descarte de una descartada.
 */
function porEstado(idea: IdeaEnJuego, cambio: CambioDeIdea): Veredicto | null {
  if (cambio.accion === "restaurar") {
    return idea.estado === "descartado"
      ? null
      : rechazo("Solo se puede deshacer el descarte de una idea descartada.");
  }
  if (idea.estado === "descartado") {
    return rechazo(
      "Esta idea está descartada: no se evalúa, no se publica ni se corrige. Si se descartó por error, deshacé el descarte y vuelve a “En evaluación”, sin publicar.",
    );
  }
  if (cambio.accion === "descartar" && idea.estado !== "borrador" && idea.estado !== "pendiente") {
    return rechazo(
      `Solo se descarta una idea que nadie evaluó todavía, y esta ya está “${
        ETIQUETA_ESTADO[idea.estado] ?? idea.estado
      }”. Si igual hay que descartarla, reabrí la revisión primero (queda en el historial) y después descartala.`,
    );
  }
  return null;
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
 * Corregir una idea que se vota tampoco se puede en votacion, aunque no la saca
 * ni la mete: el vecino la voto leyendo ese titulo y ese texto, y un cambio de
 * punto puede mudarla de distrito, o sea de boleta. El conjunto que se vota
 * queda fijo tambien en lo que dice. Una idea que no se vota si se corrige: no
 * esta en ninguna boleta.
 *
 * Fuera de la votacion no hay restriccion por etapa:
 *  - en "ideas" y "evaluacion" es el trabajo normal del equipo;
 *  - en "seguimiento" y "cerrada" la votacion termino y ningun vecino puede
 *    votar, asi que nadie pierde un voto. Que el proyecto mas votado resulte no
 *    factible despues de la votacion es un caso que el reglamento contempla, y
 *    el cambio queda en el historial de la idea. Corregir un error de tipeo en
 *    un ganador, o los campos corridos de 2025, tambien: la fila de
 *    `revisiones` guarda el antes y el despues. Lo que no se hace en ninguna
 *    etapa es mudar de distrito una idea con votos (`puedeCambiarDeDistrito`).
 *
 * Antes que la etapa se miran las reglas de estado (`porEstado`), que valen
 * siempre: una descartada no se toca salvo para deshacer el descarte.
 */
export function puedeCambiarIdea(
  etapa: Etapa,
  idea: IdeaEnJuego,
  cambio: CambioDeIdea,
): Veredicto {
  const segunEstado = porEstado(idea, cambio);
  if (segunEstado) return segunEstado;

  if (etapa !== "votacion") return PERMITIDO;

  if (cambio.accion === "corregir") {
    return seVota(idea)
      ? rechazo(
          "La votación de esta edición está abierta y esta idea se está votando: quienes ya la votaron lo hicieron leyendo este título, este texto y en este distrito, así que no se corrige hasta que cierre la votación (etapa “Seguimiento de obras”). Queda como estaba cuando empezó.",
        )
      : PERMITIDO;
  }

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
 * Si una correccion puede mudar una idea del distrito `desde` al `hasta`.
 *
 * No depende de la etapa: vale en todas, incluso despues de la votacion. La
 * votacion es por distrito (cada vecino vota un proyecto del suyo, ver
 * /api/votos) y el ranking tambien (getVotosPorIdea filtra por distrito). Si una
 * idea con votos se muda, sus votos se mudan con ella y pasan a competir en el
 * ranking de un distrito cuyos vecinos no los emitieron: en votacion le cambia
 * la cuenta a dos distritos a la vez, y despues cambia quien gano. Un ganador
 * menos todavia: es EL proyecto de su distrito, y el indice unico de la base no
 * deja dos ganadores en el mismo.
 *
 * Una idea sin votos se muda libremente (con la confirmacion de la pantalla):
 * es el arreglo normal de un punto mal marcado.
 *
 * `votos` es el mayor entre el contador de la idea y sus filas en `votos`, por
 * lo mismo que `votosDeLaEdicion`: las ideas migradas de 2025 tienen sus votos
 * solo en el contador, y tambien cuentan.
 */
export function puedeCambiarDeDistrito(
  idea: { votos: number; ganador: boolean },
  desde: number | null,
  hasta: number,
): Veredicto {
  if (desde === null || desde === hasta) return PERMITIDO;
  if (idea.ganador) {
    return rechazo(
      `Esta idea es el proyecto ganador del Distrito ${desde}: no puede pasar al Distrito ${hasta}. Si el punto está mal, marcá uno dentro del Distrito ${desde}.`,
    );
  }
  if (idea.votos > 0) {
    return rechazo(
      `Esta idea tiene ${cantidad(idea.votos, "voto", "votos")} de vecinos del Distrito ${desde}: si pasa al Distrito ${hasta}, esos votos contarían en el ranking de otro distrito. Si el punto está mal, marcá uno dentro del Distrito ${desde}, o dejá la ubicación como está.`,
    );
  }
  return PERMITIDO;
}

/**
 * Si una idea se puede descartar por lo que tiene, mas alla de su estado y de la
 * etapa (eso lo dice `puedeCambiarIdea`: solo borrador o pendiente). Vale en
 * todas las etapas, y la usan la accion (con la fila bloqueada) y la ficha (para
 * decirlo antes de que alguien escriba el motivo).
 *
 *  - Con votos, no. Una pendiente puede tenerlos: es una idea votada cuya
 *    revision se reabrio despues de la votacion. No es una prueba ni un spam, y
 *    descartarla sacaria sus votos de todas las cuentas (las descartadas no
 *    cuentan en ninguna) mientras sus filas siguen en `votos`. Si no tiene que
 *    seguir, se evalua, con su devolucion.
 *  - Integrada en otra, no: quedaria contada entre las integradas de la final,
 *    que asi no se podria descartar ni integrar en otra, y una descartada no se
 *    corrige, asi que la integracion no se le podria sacar sin deshacer antes el
 *    descarte.
 *  - Con otras integradas en ella, tampoco: quedarian apuntando a una idea que
 *    no existe para nadie.
 *
 * `votos` es el mayor entre el contador y las filas de `votos`, como en
 * `puedeCambiarDeDistrito`.
 */
export function puedeDescartarse(idea: {
  votos: number;
  /** La idea final en la que esta integrada, si lo esta. */
  integradaEn: { numero: number | null } | null;
  /** Cuantas ideas se integraron en esta. */
  integradas: number;
}): Veredicto {
  if (idea.votos > 0) {
    return rechazo(
      `Esta idea tiene ${cantidad(idea.votos, "voto", "votos")}: no es una prueba ni un spam, la votaron vecinos, y descartada sus votos dejarían de contar. Si no tiene que seguir, evaluala con su devolución.`,
    );
  }
  if (idea.integradaEn) {
    const numero = idea.integradaEn.numero === null ? "" : ` #${idea.integradaEn.numero}`;
    return rechazo(
      `Esta idea está integrada en la idea${numero}: antes de descartarla, sacale la integración desde “Corregir la idea”.`,
    );
  }
  if (idea.integradas > 0) {
    return rechazo(
      `${idea.integradas === 1 ? "Hay una idea integrada" : `Hay ${formatearNumero(idea.integradas)} ideas integradas`} en esta: antes de descartarla, sacales la integración desde su ficha.`,
    );
  }
  return PERMITIDO;
}

// ---------------------------------------------------------------------------
// Ideas que carga el equipo desde el panel
// ---------------------------------------------------------------------------

/**
 * Si el equipo puede cargar una idea (de una asamblea, de mesa de entradas, de
 * un mail) en una edicion que esta en `etapa`.
 *
 *  - En "ideas", si: es la etapa de presentacion.
 *  - En "evaluacion", tambien: una asamblea puede hacerse despues de que cierre
 *    el formulario del sitio, y lo que llega por papel o mail tarda en pasar a
 *    la carga. Esas ideas todavia se pueden evaluar y, si son factibles, entrar
 *    a la votacion junto con las demas: nadie voto todavia.
 *  - Desde "votacion", no. La boleta queda fija cuando empieza la votacion (ver
 *    `puedeCambiarIdea`): una idea cargada en plena votacion no podria
 *    publicarse como factible, asi que quedaria en la bandeja como una
 *    propuesta sin ningun proceso por delante. En "seguimiento" y "cerrada" la
 *    edicion ya voto. Lo que llega tarde se carga en la edicion siguiente.
 *
 * Es mas amplio que el formulario publico, que se cierra al terminar la etapa
 * "ideas" (lo dice el reglamento para la presentacion del vecino): la carga del
 * equipo es el camino de lo que se presento por otra via dentro de los plazos.
 */
export function puedeCargarIdea(etapa: Etapa): Veredicto {
  if (etapa === "ideas" || etapa === "evaluacion") return PERMITIDO;
  if (etapa === "votacion") {
    return rechazo(
      "La votación de esta edición está abierta: la boleta quedó fija cuando empezó, así que una idea nueva ya no puede entrar a competir. Lo que llegó tarde se carga en la edición siguiente.",
    );
  }
  return rechazo(
    `Esta edición ya votó (está en ${nombre(etapa)}): una idea nueva no tiene evaluación ni votación en la que entrar. Se carga en la edición siguiente, cuando esté activa (se activa desde “Etapa del proceso”).`,
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
