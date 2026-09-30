/**
 * Lo que Migue contesta sobre el sitio sin IA (src/lib/chat-sin-ia-sitio.ts),
 * las sugerencias por etapa y la busqueda en el reglamento. Sin base: el
 * contexto del sitio se arma a mano, igual que lo devuelve chat-contexto.ts.
 *
 * Antes el buscador contestaba "cómo participar" con un texto propio que no
 * sabia la etapa ni las fechas, y lo demas caia en la busqueda de proyectos:
 * "¿qué pasa con las ideas que no ganan?" devolvia la lista de ganadores.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ContextoDelSitio } from "../../src/lib/chat-contexto";
import { responderSobreElSitio, temaDelSitio } from "../../src/lib/chat-sin-ia-sitio";
import { sugerenciasDelChat } from "../../src/lib/chat-sugerencias";
import {
  PASOS_PARA_VOTAR,
  POR_QUE_NO_HAY_MONTOS,
  REGLAS_CONFIRMADAS,
  buscarEnParrafos,
  mismaPregunta,
} from "../../src/lib/contenido-del-programa";

const HOY = "2026-10-20";
type Etapa = "ideas" | "evaluacion" | "votacion" | "seguimiento" | "cerrada";

function edicion(etapa: Etapa, fechas: Partial<Record<"ideasDesde" | "ideasHasta" | "votacionDesde" | "votacionHasta", string | null>> = {}) {
  return {
    id: 1,
    anio: 2026,
    etapa,
    ideasDesde: "2026-10-01",
    ideasHasta: "2026-11-15",
    votacionDesde: "2026-12-02",
    votacionHasta: "2026-12-04",
    ...fechas,
  };
}

function contexto(cambios: Partial<ContextoDelSitio> = {}): ContextoDelSitio {
  return {
    momento: "Edición 2026: la presentación de ideas está abierta hasta el 15 de noviembre de 2026.",
    acciones: [
      { href: "/ideas/nueva", texto: "Presentá tu idea" },
      { href: "/proyectos", texto: "Ver las ideas presentadas" },
    ],
    fechasIdeas: "1 de octubre de 2026 — 15 de noviembre de 2026",
    fechasVotacion: "2 de diciembre de 2026 — 4 de diciembre de 2026",
    aviso: null,
    comoFunciona: [
      { titulo: "¿Qué es?", texto: "Una herramienta de participación." },
      { titulo: "¿Cómo puedo participar?", texto: "Presentá tu idea y después votá." },
    ],
    comoPresentar: "Contanos qué problema querés resolver en tu barrio.",
    comoVotar: "Tenés 1 voto disponible.",
    pasosParaVotar: PASOS_PARA_VOTAR,
    porQueNoHayMontos: POR_QUE_NO_HAY_MONTOS,
    reglamento: {
      publicado: false,
      aviso: "El reglamento general todavía no está publicado en este sitio.",
      reglasConfirmadas: REGLAS_CONFIRMADAS,
    },
    cronograma: [{ titulo: "Presentación de ideas", fechas: "1 de octubre — 15 de noviembre", detalle: null }],
    novedades: [],
    preguntas: [
      {
        pregunta: "¿Qué pasa con las ideas que no ganan?",
        respuesta: "Quedan publicadas en el sitio con su evaluación técnica.",
      },
      { pregunta: "¿Cuántas veces puedo votar?", respuesta: "Tenés un solo voto." },
    ],
    contacto: { organismo: "Municipalidad de San Miguel de Tucumán", direccion: null, telefono: "381 451 6500" },
    ...cambios,
  };
}

function responder(pregunta: string, etapa: Etapa = "ideas", ctx = contexto(), fechas = {}) {
  return responderSobreElSitio(pregunta, edicion(etapa, fechas), ctx, HOY);
}

// ---------------------------------------------------------------------------

test("las preguntas por datos de ideas no son del sitio: sigue el buscador de datos", () => {
  for (const pregunta of [
    "¿Cuántas ideas se presentaron?",
    "¿Qué ganó en el distrito 5?",
    "¿Cuántos votos tuvo el ganador?",
    "distrito 7",
    "Proyectos de plazas y espacios verdes",
    "¿Quién ganó la votación en el distrito 3?",
  ]) {
    assert.equal(responder(pregunta), null, pregunta);
  }
});

test("una pregunta frecuente con otras palabras contesta la del sitio, aunque diga 'ganan'", () => {
  const respuesta = responder("¿qué pasa con las ideas que no ganan?");
  assert.ok(respuesta);
  assert.match(respuesta.texto, /Quedan publicadas en el sitio/);
  assert.ok(respuesta.referencias.some((r) => r.url === "/acerca-de"));
});

test("como votar dice si la votacion esta abierta, hasta cuando, y los pasos", () => {
  const abierta = responder("¿Cómo voto?", "votacion");
  assert.ok(abierta);
  assert.match(abierta.texto, /está abierta hasta el 4 de diciembre de 2026/);
  assert.match(abierta.texto, /Ingresá con CIDITUC/);
  assert.equal(abierta.referencias[0].url, "/votar");

  const antes = responder("¿Hasta cuándo puedo votar?", "ideas");
  assert.ok(antes);
  assert.match(antes.texto, /todavía no empezó \(está prevista: 2 de diciembre de 2026/);
  assert.ok(!antes.referencias.some((r) => r.url === "/votar"), "sin votacion no se manda a votar");

  const despues = responder("¿Cuándo es la votación?", "seguimiento");
  assert.ok(despues);
  assert.match(despues.texto, /ya terminó/);
  assert.ok(despues.referencias.some((r) => r.url === "/transparencia"));
});

test("una fecha de cierre que ya paso no se promete", () => {
  const respuesta = responder("¿Cómo voto?", "votacion", contexto(), { votacionHasta: "2026-10-10" });
  assert.ok(respuesta);
  assert.match(respuesta.texto, /está abierta\./);
  assert.doesNotMatch(respuesta.texto, /hasta el/);
});

test("presentar una idea: abierta en la etapa de ideas, cerrada en las demas", () => {
  const abierta = responder("¿Cómo presento una idea?", "ideas");
  assert.ok(abierta);
  assert.match(abierta.texto, /está abierta hasta el 15 de noviembre de 2026/);
  assert.match(abierta.texto, /Contanos qué problema/);
  assert.equal(abierta.referencias[0].url, "/ideas/nueva");

  const cerrada = responder("¿Puedo presentar mi idea?", "votacion");
  assert.ok(cerrada);
  assert.match(cerrada.texto, /está cerrada/);
  assert.ok(!cerrada.referencias.some((r) => r.url === "/ideas/nueva"));
});

test("el aviso urgente va primero cuando la consulta es sobre votar, presentar o fechas", () => {
  const ctx = contexto({ aviso: "La votación se extiende hasta el viernes." });
  for (const pregunta of ["¿Cómo voto?", "¿Cómo presento una idea?", "¿Cuándo termina la etapa?"]) {
    const respuesta = responder(pregunta, "votacion", ctx);
    assert.ok(respuesta, pregunta);
    assert.match(respuesta.texto, /^\*\*Aviso:\*\* La votación se extiende hasta el viernes\./, pregunta);
  }
});

test("sin reglamento publicado: las reglas confirmadas, y que lo demas no esta definido", () => {
  const respuesta = responder("¿Quién puede votar?");
  assert.ok(respuesta);
  assert.match(respuesta.texto, /todavía no está publicado/);
  assert.match(respuesta.texto, /Un voto por persona/);
  assert.match(respuesta.texto, /no está definido en el sitio/);
});

test("con reglamento publicado: los parrafos que hablan de eso", () => {
  const ctx = contexto({
    reglamento: {
      publicado: true,
      parrafos: [
        "Artículo 1. El programa se organiza en 20 distritos.",
        "Artículo 2. Pueden votar las personas mayores de 16 años que vivan en el distrito.",
        "Artículo 3. Las ideas se presentan durante la etapa de ideas.",
      ],
    },
  });
  const respuesta = responder("¿Desde qué edad se puede votar?", "ideas", ctx);
  assert.ok(respuesta);
  assert.match(respuesta.texto, /mayores de 16 años/);
  assert.doesNotMatch(respuesta.texto, /Artículo 3/);
});

test("los montos, las fechas, el seguimiento y como participar salen del contexto", () => {
  assert.equal(responder("¿Cuánto cuesta el proyecto de mi barrio?")?.texto, POR_QUE_NO_HAY_MONTOS);

  const fechas = responder("¿Cuándo termina la etapa de ideas?");
  assert.match(fechas?.texto ?? "", /Presentación de ideas: 1 de octubre de 2026/);
  assert.match(fechas?.texto ?? "", /Cronograma/);

  const seguimiento = responder("¿Cómo sigo mi idea?");
  assert.match(seguimiento?.texto ?? "", /código de seguimiento/);
  assert.match(seguimiento?.texto ?? "", /381 451 6500/);
  assert.equal(seguimiento?.referencias[0].url, "/ideas/seguimiento");

  const participar = responder("¿Cómo funciona esto?");
  assert.match(participar?.texto ?? "", /Una herramienta de participación/);
  assert.deepEqual(
    participar?.referencias.map((r) => r.url),
    ["/ideas/nueva", "/proyectos"],
    "los botones de la portada",
  );
});

test("las sugerencias de cada etapa ofrecen lo que se puede hacer en ella", () => {
  assert.ok(sugerenciasDelChat("votacion").includes("¿Cómo voto?"));
  assert.ok(sugerenciasDelChat("ideas").includes("¿Cómo presento una idea?"));
  for (const etapa of ["evaluacion", "votacion", "seguimiento", "cerrada"] as const) {
    assert.ok(
      !sugerenciasDelChat(etapa).some((s) => /present(o|ar)\b/.test(s) && !/se pueden|presentaron/.test(s)),
      `${etapa} no ofrece presentar una idea`,
    );
  }
  for (const etapa of ["ideas", "evaluacion", "seguimiento", "cerrada"] as const) {
    assert.ok(!sugerenciasDelChat(etapa).includes("¿Cómo voto?"), `${etapa} no ofrece votar`);
  }
  // Sin edicion activa, las de siempre.
  assert.equal(sugerenciasDelChat(undefined).length, 4);
});

test("el tema de una pregunta sale en orden: reglas antes que votar, presentar antes que fechas", () => {
  assert.equal(temaDelSitio("¿Quién puede votar?"), "reglamento");
  assert.equal(temaDelSitio("¿Hasta cuándo puedo presentar?"), "presentar");
  assert.equal(temaDelSitio("¿Cuándo es la votación?"), "votar");
  assert.equal(temaDelSitio("¿Cuántas ideas se presentaron?"), null);
  assert.equal(temaDelSitio("el presupuesto participativo de 2025"), null, "el nombre no es plata");
});

test("buscar en el reglamento encuentra formas distintas de la misma palabra", () => {
  const parrafos = ["Pueden votar los vecinos.", "Cada votante tiene un voto.", "Las ideas se presentan."];
  assert.deepEqual(
    buscarEnParrafos(parrafos, "¿quién vota?").map((p) => p.numero),
    [1, 2],
  );
  assert.deepEqual(buscarEnParrafos(parrafos, "¿qué dice el reglamento?"), [], "sin palabras que sirvan");
});

test("misma pregunta pide dos palabras en comun y el 60% de la frecuente", () => {
  const frecuentes = [{ pregunta: "¿Cómo me empadrono para votar?" }, { pregunta: "¿Cuántas veces puedo votar?" }];
  assert.equal(mismaPregunta("cuantas veces puedo votar", frecuentes)?.pregunta, "¿Cuántas veces puedo votar?");
  assert.equal(mismaPregunta("¿Cómo me empadrono?", frecuentes), null, "una sola palabra en comun");
  assert.equal(mismaPregunta("¿Qué ganó en mi distrito?", frecuentes), null);
});
