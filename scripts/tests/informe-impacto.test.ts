/**
 * El informe de impacto (src/lib/informe-impacto.ts) mirado desde lo que
 * cuesta: si la respuesta llega pero no es un informe (JSON envuelto en cercos
 * de codigo, cortado en el tope de tokens, fuera de los topes del zod), el
 * error que sale lleva el modelo y lo que el proveedor cobro. Con eso la accion
 * del panel (`generarInformeImpacto`) anota la falla en `chat_consultas` con
 * sus tokens, y CHAT_TOPE_TOKENS_DIA, el unico freno de gasto, no cuenta de
 * menos. Antes el consumo se calculaba despues de validar y se perdia.
 *
 * La accion no se prueba entera porque lee la cookie de sesion (ver
 * ideas-panel.test.ts); lo que decide que haya algo que anotar es esto. El
 * proveedor se reemplaza en `globalThis.fetch`, que es lo que usa el SDK de
 * OpenAI, como en asistente-carga.test.ts. Ninguna prueba sale a la red ni
 * abre una base.
 */
import assert from "node:assert/strict";
import test from "node:test";

let informe: typeof import("../../src/lib/informe-impacto");

const MODELO = "proveedor/modelo-de-prueba";

test.before(async () => {
  process.env.OPENROUTER_API_KEY = "clave-de-prueba";
  process.env.OPENROUTER_MODELO = MODELO;
  delete process.env.OPENROUTER_MODELO_INFORME;
  informe = await import("../../src/lib/informe-impacto");
});

test.after(() => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODELO;
});

const IDEA = {
  titulo: "Luminarias en la plaza",
  barrio: "Centro",
  distrito: 1,
  categoria: "Urbana",
  problema: "La plaza del barrio está muy oscura de noche y nadie la usa después de las ocho.",
  solucion: "Poner luminarias LED en todo el perímetro de la plaza y en los senderos internos.",
  beneficios: null,
};

const VALIDO = {
  resumen: "Iluminar la plaza.",
  impacto_positivo: ["Más uso nocturno.", "Más seguridad."],
  riesgos: ["Mantenimiento de las luminarias.", "Consumo eléctrico."],
  preguntas: ["¿Cuántas luminarias?", "¿Quién las mantiene?"],
  encuadre: "Corresponde a la categoría.",
  borrador_devolucion: "Gracias por tu propuesta.",
};

/** Una respuesta no-stream del proveedor, con este contenido y este consumo. */
function completado(contenido: string, salida: number, motivo = "stop"): Response {
  return new Response(
    JSON.stringify({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: MODELO,
      choices: [{ index: 0, message: { role: "assistant", content: contenido }, finish_reason: motivo }],
      usage: { prompt_tokens: 1200, completion_tokens: salida },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** Reemplaza al proveedor mientras corre `trabajo`. */
async function conProveedor<T>(respuesta: () => Response, trabajo: () => Promise<T>): Promise<T> {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => respuesta()) as typeof fetch;
  try {
    return await trabajo();
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

/** Predicado para `assert.rejects`: un InformeInvalido con este consumo y este corte. */
function invalidoCon(salida: number, motivoDeCorte: string) {
  return (error: unknown) => {
    assert.ok(error instanceof informe.InformeInvalido, `se esperaba InformeInvalido, llegó ${String(error)}`);
    assert.equal(error.modelo, MODELO);
    assert.deepEqual(error.consumo, { tokensEntrada: 1200, tokensSalida: salida, cacheLectura: 0 });
    assert.equal(error.motivoDeCorte, motivoDeCorte);
    // La causa original queda para el log del servidor.
    assert.ok(error.cause instanceof Error);
    return true;
  };
}

test("un JSON entre cercos de codigo tira con lo que se cobro", async () => {
  const cercado = "```json\n" + JSON.stringify(VALIDO) + "\n```";
  await conProveedor(
    () => completado(cercado, 900),
    () => assert.rejects(informe.generarInforme(IDEA), invalidoCon(900, "stop")),
  );
});

test("una salida cortada en el tope de tokens tira con lo que se cobro", async () => {
  await conProveedor(
    () => completado('{"resumen": "Iluminar la plaza", "impacto_positivo": ["Más', 2000, "length"),
    () => assert.rejects(informe.generarInforme(IDEA), invalidoCon(2000, "length")),
  );
});

test("una salida que pasa el esquema JSON pero no los topes del zod tira con lo que se cobro", async () => {
  // El esquema que se le manda al modelo no puede expresar "como mucho 6": el
  // zod si, y la llamada ya esta pagada cuando lo descubre.
  const largo = { ...VALIDO, riesgos: Array.from({ length: 7 }, (_, i) => `Riesgo ${i + 1}.`) };
  await conProveedor(
    () => completado(JSON.stringify(largo), 1500),
    () => assert.rejects(informe.generarInforme(IDEA), invalidoCon(1500, "stop")),
  );
});

test("con una salida valida devuelve el informe y el mismo consumo", async () => {
  const generado = await conProveedor(
    () => completado(JSON.stringify(VALIDO), 700),
    () => informe.generarInforme(IDEA),
  );
  assert.equal(generado.modelo, MODELO);
  assert.deepEqual(generado.consumo, { tokensEntrada: 1200, tokensSalida: 700, cacheLectura: 0 });
  assert.equal(generado.datos.resumen, "Iluminar la plaza.");
});

test("si el proveedor rechaza el pedido, el error es el suyo y no un InformeInvalido", async () => {
  // Sin respuesta no hay consumo que anotar: la accion registra la falla en
  // cero, con el motivo del proveedor (un 402 es credito que cargar).
  await conProveedor(
    () =>
      new Response(JSON.stringify({ error: { message: "Sin crédito", code: 402 } }), {
        status: 402,
        headers: { "content-type": "application/json" },
      }),
    () =>
      assert.rejects(informe.generarInforme(IDEA), (error: unknown) => {
        assert.ok(!(error instanceof informe.InformeInvalido));
        return true;
      }),
  );
});
