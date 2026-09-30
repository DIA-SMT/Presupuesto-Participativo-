/**
 * Pruebas del reporte al dashboard de la Direccion de IA (src/lib/migue-reporte.ts).
 * Se corren con `npm test` y no tocan la base ni la red: el envio usa un fetch falso.
 */
import assert from "node:assert/strict";
import test from "node:test";

const modulo = () => import("../../src/lib/migue-reporte");

const AHORA = Date.parse("2026-09-30T15:00:00.000Z");
const CONSUMO = { tokensEntrada: 1200, tokensSalida: 300, cacheLectura: 0 };
const CON_PREGUNTAS = { enviarPreguntas: true };
const CONFIG = { clave: "migue_x", url: "http://localhost:3001", enviarPreguntas: false };
const base = {
  pregunta: "¿Cuándo se vota?",
  tema: "votar" as const,
  resuelta: true,
  ok: true,
  consumo: CONSUMO,
  ms: 1500,
};

/** Silencia console.warn durante la prueba y devuelve lo que se aviso. */
async function conAvisos(prueba: () => Promise<void>) {
  const avisos: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => avisos.push(args.map(String).join(" "));
  try {
    await prueba();
  } finally {
    console.warn = original;
  }
  return avisos;
}

test("sin clave o sin direccion del dashboard, el reporte queda apagado", async () => {
  const { reporteConfigurado } = await modulo();
  assert.equal(reporteConfigurado({}), null);
  assert.equal(reporteConfigurado({ MIGUE_API_KEY: "migue_x" }), null);
  assert.equal(reporteConfigurado({ MIGUE_DASHBOARD_URL: "http://localhost:3001" }), null);
  assert.equal(reporteConfigurado({ MIGUE_API_KEY: " ", MIGUE_DASHBOARD_URL: "http://localhost:3001" }), null);
  assert.deepEqual(reporteConfigurado({ MIGUE_API_KEY: "migue_x", MIGUE_DASHBOARD_URL: "http://localhost:3001/" }), CONFIG);
  assert.equal(
    reporteConfigurado({ MIGUE_API_KEY: "migue_x", MIGUE_DASHBOARD_URL: "http://x", MIGUE_ENVIAR_PREGUNTAS: "1" })?.enviarPreguntas,
    true,
  );
});

test("una consulta resuelta viaja con tema, tiempo y tokens, sin la pregunta", async () => {
  const { armarReporte } = await modulo();
  const reporte = armarReporte(base, "abc", AHORA, CON_PREGUNTAS);
  assert.equal(reporte.conversation_id, "pp-web:abc");
  assert.equal(reporte.outcome, "resuelta");
  assert.equal(reporte.topic, "Votación y empadronamiento");
  assert.equal(reporte.started_at, "2026-09-30T14:59:58.500Z");
  assert.equal(reporte.ended_at, "2026-09-30T15:00:00.000Z");
  assert.equal(reporte.avg_response_ms, 1500);
  assert.equal(reporte.tokens_in, 1200);
  assert.equal(reporte.tokens_out, 300);
  assert.equal(reporte.messages, 2);
  assert.equal(reporte.unanswered_question, undefined);
});

test("por defecto la pregunta sin respuesta no se envia", async () => {
  const { armarReporte } = await modulo();
  const reporte = armarReporte({ ...base, resuelta: false }, "abc", AHORA);
  assert.equal(reporte.outcome, "sin_respuesta");
  assert.equal(reporte.unanswered_question, undefined);
});

test("con MIGUE_ENVIAR_PREGUNTAS la pregunta viaja con los datos personales tapados", async () => {
  const { armarReporte } = await modulo();
  const reporte = armarReporte(
    { ...base, resuelta: false, pregunta: "Soy María González, mi DNI es 30. 123. 456 y mi mail vecino@correo.com" },
    "abc",
    AHORA,
    CON_PREGUNTAS,
  );
  assert.equal(reporte.unanswered_question, "Soy [nombre], mi DNI es [número] y mi mail [correo]");
});

test("el filtro tapa telefonos, alturas de calle y nombres presentados", async () => {
  const { taparDatosPersonales } = await modulo();
  assert.equal(taparDatosPersonales("vivo en Lavalle 1234, barrio Ciudadela"), "vivo en Lavalle [número], barrio Ciudadela");
  assert.equal(taparDatosPersonales("mi cel es 381 555-1234"), "mi cel es [número]");
  assert.equal(taparDatosPersonales("me llamo Juan Pérez y quiero votar"), "me llamo [nombre] y quiero votar");
  // "soy de" no es un nombre: el barrio se conserva.
  assert.equal(taparDatosPersonales("soy de Villa Urquiza, donde voto?"), "soy de Villa Urquiza, donde voto?");
});

test("el filtro deja montos, fechas y anios, que son lo que se pregunta aca", async () => {
  const { taparDatosPersonales } = await modulo();
  for (const texto of [
    "hay $ 1.500.000 por distrito?",
    "cuanto es $15.000.000",
    "son 2.000.000 pesos?",
    "la edicion 2024-2025",
    "se vota el 30-09-2026?",
    "que paso en la edicion 2025",
    "proyectos del distrito 12",
    "cuando se vota en 2025?",
    "el Presupuesto Participativo 2025",
    "que se voto en septiembre 2024",
    "proyectos entre 2023 y 2025",
  ]) {
    assert.equal(taparDatosPersonales(texto), texto, texto);
  }
});

test("una altura de calle que parece un anio igual se tapa", async () => {
  const { taparDatosPersonales } = await modulo();
  assert.equal(taparDatosPersonales("Vivo en San Martín 2025"), "Vivo en San Martín [número]");
  assert.equal(taparDatosPersonales("vivo en lavalle al 1990, que proyectos hay?"), "vivo en lavalle al [número], que proyectos hay?");
  assert.equal(taparDatosPersonales("mi casa es en Av. Mate de Luna 2010"), "mi casa es en Av. Mate de Luna [número]");
  // Calle con nombre de fecha: el mes en mayuscula no cuenta como anio.
  assert.equal(taparDatosPersonales("vivo en 24 de Septiembre 2025"), "vivo en 24 de Septiembre [número]");
});

test("la pregunta se recorta a 300 caracteres sin partir un emoji", async () => {
  const { armarReporte } = await modulo();
  const largo = armarReporte({ ...base, resuelta: false, pregunta: "a".repeat(900) }, "abc", AHORA, CON_PREGUNTAS);
  assert.equal(largo.unanswered_question?.length, 300);
  const conEmoji = armarReporte({ ...base, resuelta: false, pregunta: `${"a".repeat(299)}🙂 fin` }, "abc", AHORA, CON_PREGUNTAS);
  assert.equal(conEmoji.unanswered_question, "a".repeat(299));
});

test("una falla del sistema no manda la pregunta ni tokens en cero", async () => {
  const { armarReporte } = await modulo();
  const reporte = armarReporte(
    { ...base, resuelta: false, ok: false, consumo: { tokensEntrada: 0, tokensSalida: 0, cacheLectura: 0 } },
    "abc",
    AHORA,
    CON_PREGUNTAS,
  );
  assert.equal(reporte.outcome, "sin_respuesta");
  assert.equal(reporte.unanswered_question, undefined);
  assert.equal(reporte.tokens_in, undefined);
  assert.equal(reporte.tokens_out, undefined);
});

test("un tiempo fuera del tope del dashboard se omite sin perder la conversacion", async () => {
  const { armarReporte } = await modulo();
  const lento = armarReporte({ ...base, ms: 800_000 }, "abc", AHORA);
  assert.equal(lento.avg_response_ms, undefined);
  assert.equal(lento.outcome, "resuelta");
  // Un reloj que va para atras no deja el inicio despues del fin.
  const negativo = armarReporte({ ...base, ms: -50 }, "abc", AHORA);
  assert.equal(negativo.started_at, negativo.ended_at);
  assert.equal(negativo.avg_response_ms, 0);
});

test("envia a /api/migue/conversaciones con la clave y el formato del dashboard", async () => {
  const { armarReporte, enviarReporte } = await modulo();
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  const fetchFalso = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify({ stored: 1, rejected: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  const reporte = armarReporte(base, "abc", AHORA);
  const avisos = await conAvisos(() => enviarReporte(reporte, CONFIG, fetchFalso));

  assert.deepEqual(avisos, []);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, "http://localhost:3001/api/migue/conversaciones");
  assert.equal(llamadas[0].init.method, "POST");
  assert.equal((llamadas[0].init.headers as Record<string, string>).Authorization, "Bearer migue_x");
  assert.deepEqual(JSON.parse(String(llamadas[0].init.body)), { conversations: [reporte] });
  assert.ok(llamadas[0].init.signal, "tiene que tener tiempo maximo");
});

test("si el dashboard descarta la fila, queda anotado en el log", async () => {
  const { armarReporte, enviarReporte } = await modulo();
  const descarta = (async () =>
    new Response(JSON.stringify({ stored: 0, rejected: [{ index: 0, error: "outcome invalido" }] }), {
      status: 200,
    })) as unknown as typeof fetch;
  const avisos = await conAvisos(() => enviarReporte(armarReporte(base, "abc", AHORA), CONFIG, descarta));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /outcome invalido/);
});

test("si el dashboard falla, rechaza o no responde a tiempo, no tira", async () => {
  const { armarReporte, enviarReporte } = await modulo();
  const reporte = armarReporte(base, "abc", AHORA);
  const caido = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const rechaza = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
  // Nunca contesta: solo termina cuando se corta por el tiempo maximo.
  const colgado = ((_url: string, init: RequestInit) =>
    new Promise((_, rechazar) => init.signal?.addEventListener("abort", () => rechazar(init.signal?.reason)))) as unknown as typeof fetch;

  const avisos = await conAvisos(async () => {
    await enviarReporte(reporte, CONFIG, caido);
    await enviarReporte(reporte, CONFIG, rechaza);
    await enviarReporte(reporte, CONFIG, colgado, 50);
  });
  assert.equal(avisos.length, 3);
});
