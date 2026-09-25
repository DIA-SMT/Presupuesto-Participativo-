/**
 * Pruebas de la politica de etapas (src/lib/etapas.ts): que deja hacer el panel
 * segun la etapa de la edicion. No tocan la base: el modulo es puro.
 *
 * Lo que se fija aca es lo que protege la votacion. Las server actions de
 * src/app/admin/acciones.ts no se pueden invocar sin contexto de request (leen
 * la cookie de sesion), pero deciden TODO con estas funciones: le pasan la etapa
 * y los conteos releidos de la base y devuelven el motivo tal cual. Si una regla
 * de aca se afloja, se afloja en el panel entero.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  esEtapa,
  ETAPAS,
  puedeActivarOtraEdicion,
  puedeCambiarDeDistrito,
  puedeCambiarEtapa,
  puedeCambiarIdea,
  puedeCargarIdea,
  puedeProclamar,
  seVota,
  votosDeLaEdicion,
  type CambioDeIdea,
  type Etapa,
  type IdeaEnJuego,
  type Veredicto,
} from "../../src/lib/etapas";

const SIN_NADA = { votos: 0, ganadores: 0 };

/** Afirma que se rechaza y devuelve el motivo, para mirar el texto. */
function rechazado(veredicto: Veredicto, mensaje = "se esperaba un rechazo"): string {
  assert.equal(veredicto.permitido, false, mensaje);
  return veredicto.permitido ? "" : veredicto.motivo;
}

function permitido(veredicto: Veredicto, mensaje = "se esperaba que lo permita") {
  assert.deepEqual(veredicto, { permitido: true }, mensaje);
}

// ---------------------------------------------------------------------------
// Las etapas
// ---------------------------------------------------------------------------

test("las etapas van en el orden del proceso", () => {
  assert.deepEqual([...ETAPAS], ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"]);
});

test("esEtapa valida lo que llega de un formulario", () => {
  for (const etapa of ETAPAS) assert.ok(esEtapa(etapa));
  for (const basura of ["", "Votacion", "votación", "abierta", null, undefined, 3]) {
    assert.equal(esEtapa(basura), false, `${String(basura)} no es una etapa`);
  }
});

// ---------------------------------------------------------------------------
// Cambio de etapa
// ---------------------------------------------------------------------------

test("avanzar siempre se puede, aunque haya votos y ganadores", () => {
  const cargada = { votos: 1500, ganadores: 3 };
  for (const [i, desde] of ETAPAS.entries()) {
    for (const hasta of ETAPAS.slice(i + 1)) {
      permitido(puedeCambiarEtapa(desde, hasta, cargada), `${desde} -> ${hasta}`);
    }
  }
});

test("quedarse en la misma etapa no es un cambio y no se rechaza", () => {
  for (const etapa of ETAPAS) {
    permitido(puedeCambiarEtapa(etapa, etapa, { votos: 10, ganadores: 2 }));
  }
});

test("una votacion abierta por error se puede deshacer mientras nadie voto", () => {
  permitido(puedeCambiarEtapa("votacion", "evaluacion", SIN_NADA));
  permitido(puedeCambiarEtapa("votacion", "ideas", SIN_NADA));
});

test("con un solo voto la votacion ya no vuelve a una etapa anterior", () => {
  const motivo = rechazado(puedeCambiarEtapa("votacion", "evaluacion", { votos: 1, ganadores: 0 }));
  // Dice el numero en singular y que hacer en lugar de volver.
  assert.match(motivo, /ya tiene 1 voto:/);
  assert.match(motivo, /Seguimiento de obras/);
  rechazado(puedeCambiarEtapa("votacion", "ideas", { votos: 1, ganadores: 0 }));
});

test("una edicion que ya voto no vuelve a ideas ni a evaluacion", () => {
  for (const desde of ["seguimiento", "cerrada"] as const) {
    for (const hasta of ["ideas", "evaluacion"] as const) {
      const motivo = rechazado(
        puedeCambiarEtapa(desde, hasta, { votos: 250, ganadores: 0 }),
        `${desde} -> ${hasta} con votos`,
      );
      assert.match(motivo, /250 votos/);
    }
  }
});

test("adelantada por error y sin votos, una edicion puede volver antes de la votacion", () => {
  permitido(puedeCambiarEtapa("seguimiento", "evaluacion", SIN_NADA));
  permitido(puedeCambiarEtapa("cerrada", "ideas", SIN_NADA));
  permitido(puedeCambiarEtapa("evaluacion", "ideas", SIN_NADA));
});

test("con ganadores proclamados tampoco se vuelve antes de la votacion, aunque no haya votos", () => {
  const motivo = rechazado(puedeCambiarEtapa("seguimiento", "evaluacion", { votos: 0, ganadores: 1 }));
  assert.match(motivo, /1 proyecto ganador proclamado/);
});

test("la votacion se reabre si se cerro antes de tiempo y no hay ganadores", () => {
  // Los votos que ya entraron siguen: reabrir solo deja votar a quien no llego.
  permitido(puedeCambiarEtapa("seguimiento", "votacion", { votos: 800, ganadores: 0 }));
  permitido(puedeCambiarEtapa("cerrada", "votacion", { votos: 800, ganadores: 0 }));
});

test("nunca se vuelve a votacion con un ganador proclamado", () => {
  for (const desde of ["seguimiento", "cerrada"] as const) {
    const motivo = rechazado(
      puedeCambiarEtapa(desde, "votacion", { votos: 800, ganadores: 2 }),
      `${desde} -> votacion con ganadores`,
    );
    assert.match(motivo, /2 proyectos ganadores proclamados/);
    assert.match(motivo, /reabrir esa revisión/);
  }
});

test("de cerrada a seguimiento siempre se puede: no abre la votacion", () => {
  permitido(puedeCambiarEtapa("cerrada", "seguimiento", { votos: 800, ganadores: 5 }));
});

test("ninguna marcha atras que termine en votacion o antes pasa con ganadores", () => {
  // Barrido completo: la regla no depende de por que camino se llegue.
  const conGanadores = { votos: 0, ganadores: 1 };
  for (const desde of ETAPAS) {
    for (const hasta of ETAPAS) {
      const atras = ETAPAS.indexOf(hasta) < ETAPAS.indexOf(desde);
      const hastaVotacionOAntes = ETAPAS.indexOf(hasta) <= ETAPAS.indexOf("votacion");
      if (atras && hastaVotacionOAntes) {
        rechazado(puedeCambiarEtapa(desde, hasta, conGanadores), `${desde} -> ${hasta}`);
      }
    }
  }
});

test("los votos de una edicion migrada cuentan aunque no tengan fila en votos", () => {
  // La 2025 llego con los votos en el contador de cada idea y cero filas.
  assert.equal(votosDeLaEdicion(0, 2069), 2069);
  // En una edicion corrida aca los dos numeros coinciden.
  assert.equal(votosDeLaEdicion(37, 37), 37);
  assert.equal(votosDeLaEdicion(0, 0), 0);
});

// ---------------------------------------------------------------------------
// Acciones sobre una idea
// ---------------------------------------------------------------------------

const VOTABLE: IdeaEnJuego = { estado: "factible", publicada: true };
const PENDIENTE_PUBLICADA: IdeaEnJuego = { estado: "pendiente", publicada: true };
const FACTIBLE_SIN_PUBLICAR: IdeaEnJuego = { estado: "factible", publicada: false };
const NO_FACTIBLE: IdeaEnJuego = { estado: "no_factible", publicada: true };

const TODOS_LOS_CAMBIOS: CambioDeIdea[] = [
  { accion: "evaluar", estado: "pendiente" },
  { accion: "evaluar", estado: "factible" },
  { accion: "evaluar", estado: "no_factible" },
  { accion: "evaluar", estado: "integrado" },
  { accion: "publicar" },
  { accion: "despublicar" },
  { accion: "reabrir" },
];

test("se vota lo mismo que acepta /api/votos: factible y publicada", () => {
  assert.equal(seVota(VOTABLE), true);
  assert.equal(seVota(FACTIBLE_SIN_PUBLICAR), false);
  assert.equal(seVota(PENDIENTE_PUBLICADA), false);
  assert.equal(seVota({ estado: "ganador", publicada: true }), false);
});

test("fuera de la votacion la etapa no le pone limites al trabajo sobre las ideas", () => {
  const otras: Etapa[] = ["ideas", "evaluacion", "seguimiento", "cerrada"];
  for (const etapa of otras) {
    for (const idea of [VOTABLE, PENDIENTE_PUBLICADA, FACTIBLE_SIN_PUBLICAR, NO_FACTIBLE]) {
      for (const cambio of TODOS_LOS_CAMBIOS) {
        permitido(
          puedeCambiarIdea(etapa, idea, cambio),
          `${etapa}: ${JSON.stringify(idea)} ${JSON.stringify(cambio)}`,
        );
      }
    }
  }
});

test("en votacion una idea que se vota no sale: ni evaluandola, ni despublicandola, ni reabriendola", () => {
  for (const estado of ["pendiente", "no_factible", "integrado"] as const) {
    const motivo = rechazado(puedeCambiarIdea("votacion", VOTABLE, { accion: "evaluar", estado }));
    assert.match(motivo, /^La votación de esta edición está abierta/);
    assert.match(motivo, /le cambiás el estado/);
  }
  assert.match(
    rechazado(puedeCambiarIdea("votacion", VOTABLE, { accion: "despublicar" })),
    /la despublicás, sale del ranking/,
  );
  assert.match(
    rechazado(puedeCambiarIdea("votacion", VOTABLE, { accion: "reabrir" })),
    /reabrís la revisión, sale del ranking/,
  );
});

test("en votacion se puede corregir la devolucion de un proyecto sin cambiarle el estado", () => {
  permitido(puedeCambiarIdea("votacion", VOTABLE, { accion: "evaluar", estado: "factible" }));
});

test("en votacion una idea que no se vota no entra", () => {
  const motivo = rechazado(
    puedeCambiarIdea("votacion", PENDIENTE_PUBLICADA, { accion: "evaluar", estado: "factible" }),
  );
  assert.match(motivo, /la declarás factible, esta idea entra a competir/);
  assert.match(
    rechazado(puedeCambiarIdea("votacion", FACTIBLE_SIN_PUBLICAR, { accion: "publicar" })),
    /la publicás, esta idea entra a competir/,
  );
});

test("en votacion sigue el trabajo que no mueve la votacion", () => {
  // Escribir el "no" de una idea pendiente: la deuda con el vecino no espera.
  permitido(
    puedeCambiarIdea("votacion", PENDIENTE_PUBLICADA, { accion: "evaluar", estado: "no_factible" }),
  );
  permitido(
    puedeCambiarIdea("votacion", PENDIENTE_PUBLICADA, { accion: "evaluar", estado: "integrado" }),
  );
  // Reabrir un "no" o despublicarlo no toca lo que se vota.
  permitido(puedeCambiarIdea("votacion", NO_FACTIBLE, { accion: "reabrir" }));
  permitido(puedeCambiarIdea("votacion", NO_FACTIBLE, { accion: "despublicar" }));
  // Una factible sin publicar se puede evaluar distinto: no estaba en la votacion.
  permitido(
    puedeCambiarIdea("votacion", FACTIBLE_SIN_PUBLICAR, { accion: "evaluar", estado: "no_factible" }),
  );
  // Y una idea sin publicar se puede declarar factible: sigue sin votarse.
  permitido(
    puedeCambiarIdea(
      "votacion",
      { estado: "pendiente", publicada: false },
      { accion: "evaluar", estado: "factible" },
    ),
  );
});

test("en votacion el conjunto que se vota nunca cambia, pruebe lo que se pruebe", () => {
  // Barrido de todas las combinaciones: si la politica deja pasar un cambio,
  // ese cambio no puede mover la idea de adentro hacia afuera de la votacion ni
  // al reves.
  const estados = ["borrador", "pendiente", "factible", "no_factible", "integrado", "ganador"] as const;
  for (const estado of estados) {
    for (const publicada of [true, false]) {
      const idea = { estado, publicada };
      for (const cambio of TODOS_LOS_CAMBIOS) {
        const veredicto = puedeCambiarIdea("votacion", idea, cambio);
        if (!veredicto.permitido) continue;
        const despues: IdeaEnJuego =
          cambio.accion === "evaluar"
            ? { estado: cambio.estado, publicada }
            : cambio.accion === "publicar"
              ? { estado, publicada: true }
              : cambio.accion === "despublicar"
                ? { estado, publicada: false }
                : { estado: "pendiente", publicada };
        assert.equal(
          seVota(despues),
          seVota(idea),
          `${JSON.stringify(idea)} ${JSON.stringify(cambio)} cambio la votacion`,
        );
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Correccion, descarte y su marcha atras (Fase 2)
// ---------------------------------------------------------------------------

const DESCARTADA: IdeaEnJuego = { estado: "descartado", publicada: false };
const PENDIENTE_SIN_PUBLICAR: IdeaEnJuego = { estado: "pendiente", publicada: false };

/** Los cambios de la Fase 2, aparte: los de arriba se prueban sin ellos. */
const CAMBIOS_DEL_PANEL: CambioDeIdea[] = [
  { accion: "corregir" },
  { accion: "descartar" },
  { accion: "restaurar" },
];

test("en votacion una idea que se vota no se corrige: el vecino la voto leyendo ese texto", () => {
  const motivo = rechazado(puedeCambiarIdea("votacion", VOTABLE, { accion: "corregir" }));
  assert.match(motivo, /^La votación de esta edición está abierta y esta idea se está votando/);
  assert.match(motivo, /leyendo este título, este texto y en este distrito/);
  assert.match(motivo, /Seguimiento de obras/);
});

test("en votacion se corrige lo que no se vota, y fuera de la votacion se corrige todo", () => {
  for (const idea of [PENDIENTE_PUBLICADA, FACTIBLE_SIN_PUBLICAR, NO_FACTIBLE]) {
    permitido(puedeCambiarIdea("votacion", idea, { accion: "corregir" }), JSON.stringify(idea));
  }
  // Despues de la votacion se puede corregir hasta un ganador: un error de
  // tipeo o los campos corridos de 2025. Queda en el historial.
  const ganador: IdeaEnJuego = { estado: "ganador", publicada: true };
  for (const etapa of ["ideas", "evaluacion", "seguimiento", "cerrada"] as const) {
    permitido(puedeCambiarIdea(etapa, VOTABLE, { accion: "corregir" }), etapa);
    permitido(puedeCambiarIdea(etapa, ganador, { accion: "corregir" }), etapa);
  }
});

test("solo se descarta lo que nadie evaluo: borrador o pendiente, en cualquier etapa", () => {
  for (const etapa of ETAPAS) {
    permitido(puedeCambiarIdea(etapa, PENDIENTE_PUBLICADA, { accion: "descartar" }), etapa);
    permitido(puedeCambiarIdea(etapa, PENDIENTE_SIN_PUBLICAR, { accion: "descartar" }), etapa);
    permitido(
      puedeCambiarIdea(etapa, { estado: "borrador", publicada: false }, { accion: "descartar" }),
      etapa,
    );
    for (const estado of ["factible", "no_factible", "integrado", "ganador"] as const) {
      const motivo = rechazado(
        puedeCambiarIdea(etapa, { estado, publicada: true }, { accion: "descartar" }),
        `${etapa}: ${estado}`,
      );
      assert.match(motivo, /Solo se descarta una idea que nadie evaluó todavía/);
      assert.match(motivo, /reabrí la revisión primero/);
    }
  }
});

test("una descartada no se evalua, no se publica, no se reabre ni se corrige, en ninguna etapa", () => {
  const todos = [...TODOS_LOS_CAMBIOS, { accion: "corregir" } as const, { accion: "descartar" } as const];
  for (const etapa of ETAPAS) {
    for (const cambio of todos) {
      const motivo = rechazado(
        puedeCambiarIdea(etapa, DESCARTADA, cambio),
        `${etapa}: ${JSON.stringify(cambio)}`,
      );
      assert.match(motivo, /^Esta idea está descartada/);
      assert.match(motivo, /deshacé el descarte/);
    }
  }
});

test("deshacer el descarte se puede siempre, y solo sobre una descartada", () => {
  // Incluso con la votacion abierta: vuelve a pendiente y sin publicar, asi
  // que no entra a ninguna boleta.
  for (const etapa of ETAPAS) {
    permitido(puedeCambiarIdea(etapa, DESCARTADA, { accion: "restaurar" }), etapa);
    for (const idea of [VOTABLE, PENDIENTE_PUBLICADA, NO_FACTIBLE]) {
      assert.match(
        rechazado(puedeCambiarIdea(etapa, idea, { accion: "restaurar" })),
        /Solo se puede deshacer el descarte de una idea descartada/,
      );
    }
  }
});

test("con los cambios del panel, en votacion el conjunto que se vota tampoco cambia", () => {
  // El mismo barrido de arriba, sumando la correccion, el descarte, su marcha
  // atras y el estado descartado. Corregir no mueve el estado, pero si lo que
  // se lee de una idea en la boleta: si la politica lo deja pasar, la idea no
  // se estaba votando.
  const estados = [
    "borrador",
    "pendiente",
    "factible",
    "no_factible",
    "integrado",
    "ganador",
    "descartado",
  ] as const;
  for (const estado of estados) {
    for (const publicada of [true, false]) {
      const idea = { estado, publicada };
      for (const cambio of [...TODOS_LOS_CAMBIOS, ...CAMBIOS_DEL_PANEL]) {
        const veredicto = puedeCambiarIdea("votacion", idea, cambio);
        if (!veredicto.permitido) continue;
        if (cambio.accion === "corregir") {
          assert.equal(seVota(idea), false, `se corrigio una idea que se vota: ${JSON.stringify(idea)}`);
          continue;
        }
        const despues: IdeaEnJuego =
          cambio.accion === "evaluar"
            ? { estado: cambio.estado, publicada }
            : cambio.accion === "publicar"
              ? { estado, publicada: true }
              : cambio.accion === "despublicar"
                ? { estado, publicada: false }
                : cambio.accion === "descartar"
                  ? { estado: "descartado", publicada: false }
                  : { estado: "pendiente", publicada };
        assert.equal(
          seVota(despues),
          seVota(idea),
          `${JSON.stringify(idea)} ${JSON.stringify(cambio)} cambio la votacion`,
        );
      }
    }
  }
});

test("una idea con votos no se muda de distrito, en ninguna etapa", () => {
  const motivo = rechazado(puedeCambiarDeDistrito({ votos: 12, ganador: false }, 5, 1));
  assert.match(motivo, /tiene 12 votos de vecinos del Distrito 5/);
  assert.match(motivo, /contarían en el ranking de otro distrito/);
  assert.match(rechazado(puedeCambiarDeDistrito({ votos: 1, ganador: false }, 5, 1)), /tiene 1 voto de/);

  // Un ganador tampoco, aunque el contador estuviera en cero.
  assert.match(
    rechazado(puedeCambiarDeDistrito({ votos: 0, ganador: true }, 3, 4)),
    /es el proyecto ganador del Distrito 3/,
  );
});

test("sin votos una idea se muda de distrito; quedarse en el mismo no es mudarse", () => {
  permitido(puedeCambiarDeDistrito({ votos: 0, ganador: false }, 5, 1));
  permitido(puedeCambiarDeDistrito({ votos: 300, ganador: true }, 7, 7));
  // Sin distrito asignado no hay votos de ningun distrito que proteger.
  permitido(puedeCambiarDeDistrito({ votos: 0, ganador: false }, null, 2));
});

// ---------------------------------------------------------------------------
// Carga desde el panel (Fase 2)
// ---------------------------------------------------------------------------

test("el equipo carga ideas en presentacion y en evaluacion", () => {
  permitido(puedeCargarIdea("ideas"));
  // Una asamblea tardia, o lo que llego por papel y se tipea despues.
  permitido(puedeCargarIdea("evaluacion"));
});

test("desde la votacion no se cargan ideas: la boleta ya quedo fija", () => {
  const votacion = rechazado(puedeCargarIdea("votacion"));
  assert.match(votacion, /La votación de esta edición está abierta: la boleta quedó fija/);
  assert.match(votacion, /edición siguiente/);

  for (const etapa of ["seguimiento", "cerrada"] as const) {
    const motivo = rechazado(puedeCargarIdea(etapa), etapa);
    assert.match(motivo, /Esta edición ya votó/);
    assert.match(motivo, /edición siguiente/);
  }
  assert.match(rechazado(puedeCargarIdea("seguimiento")), /Seguimiento de obras/);
});

// ---------------------------------------------------------------------------
// Proclamacion y activacion
// ---------------------------------------------------------------------------

test("se proclama solo con la votacion terminada", () => {
  permitido(puedeProclamar("seguimiento"));
  permitido(puedeProclamar("cerrada"));

  const abierta = rechazado(puedeProclamar("votacion"));
  assert.match(abierta, /La votación de esta edición está abierta/);
  assert.match(abierta, /Seguimiento de obras/);

  // Antes de votar, el motivo dice en que etapa esta.
  assert.match(rechazado(puedeProclamar("ideas")), /Presentación de ideas/);
  assert.match(rechazado(puedeProclamar("evaluacion")), /Evaluación técnica/);
});

test("no se activa otra edicion con la activa en votacion", () => {
  const motivo = rechazado(puedeActivarOtraEdicion({ anio: 2026, etapa: "votacion" }));
  assert.match(motivo, /La edición 2026 tiene la votación abierta/);
  assert.match(motivo, /Cerrá primero la votación de la 2026/);
});

test("con la activa en cualquier otra etapa, o sin activa, se puede activar otra", () => {
  permitido(puedeActivarOtraEdicion(null));
  for (const etapa of ["ideas", "evaluacion", "seguimiento", "cerrada"] as const) {
    permitido(puedeActivarOtraEdicion({ anio: 2025, etapa }), etapa);
  }
});
