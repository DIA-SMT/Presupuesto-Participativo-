/**
 * Pruebas de las piezas puras de src/lib/modelo.ts: el tope diario de gasto
 * (CHAT_TOPE_TOKENS_DIA) y la etiqueta con la que se registra una falla del
 * proveedor. No tocan la base ni la red: la lectura del gasto se inyecta.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  cortarSiSeCalla,
  gastoDelDiaAgotado,
  leerTopeDiario,
  motivoDeFalla,
  OpenAI,
  topeAlcanzado,
} from "../../src/lib/modelo";

// ---------------------------------------------------------------------------
// Tope diario
// ---------------------------------------------------------------------------

test("sin la variable no hay tope, que es el comportamiento de siempre", () => {
  assert.equal(leerTopeDiario(undefined), null);
  assert.equal(leerTopeDiario(""), null);
  assert.equal(leerTopeDiario("   "), null);
});

test("el tope se lee como entero, con o sin separadores de miles", () => {
  assert.deepEqual(leerTopeDiario("2000000"), { tokens: 2_000_000, invalido: false });
  assert.deepEqual(leerTopeDiario(" 500000 "), { tokens: 500_000, invalido: false });
  // En Argentina el punto separa miles: "2.000.000" no es 2.
  assert.deepEqual(leerTopeDiario("2.000.000"), { tokens: 2_000_000, invalido: false });
  assert.deepEqual(leerTopeDiario("2_000_000"), { tokens: 2_000_000, invalido: false });
  // Cero es un tope valido: apaga la IA sin sacar la clave.
  assert.deepEqual(leerTopeDiario("0"), { tokens: 0, invalido: false });
});

test("un valor que no se entiende apaga la IA en lugar de dejarla sin tope", () => {
  for (const valor of ["2M", "-5", "1e6", "mucho", "2.5", "1.00", "12.34.567"]) {
    assert.deepEqual(leerTopeDiario(valor), { tokens: 0, invalido: true }, valor);
  }
});

test("con el tope justo alcanzado ya no se llama al modelo", () => {
  assert.equal(topeAlcanzado(999, 1000), false);
  assert.equal(topeAlcanzado(1000, 1000), true);
  assert.equal(topeAlcanzado(1500, 1000), true);
});

test("gastoDelDiaAgotado: sin variable ni siquiera lee el gasto", async () => {
  let lecturas = 0;
  const leer = async () => {
    lecturas += 1;
    return 10_000_000;
  };
  assert.equal(await gastoDelDiaAgotado(leer, undefined), false);
  assert.equal(lecturas, 0);
});

test("gastoDelDiaAgotado compara lo gastado hoy con el tope", async () => {
  assert.equal(await gastoDelDiaAgotado(async () => 999, "1000"), false);
  assert.equal(await gastoDelDiaAgotado(async () => 1000, "1000"), true);
  // Tope cero: agotado sin consultar.
  let lecturas = 0;
  assert.equal(
    await gastoDelDiaAgotado(async () => {
      lecturas += 1;
      return 0;
    }, "0"),
    true,
  );
  assert.equal(lecturas, 0);
});

test("si no se puede leer el gasto, cuenta como agotado", async () => {
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    assert.equal(
      await gastoDelDiaAgotado(async () => {
        throw new Error("la base no contesta");
      }, "1000"),
      true,
    );
  } finally {
    console.error = errorOriginal;
  }
});

// ---------------------------------------------------------------------------
// Motivo de falla
// ---------------------------------------------------------------------------

test("la falla del proveedor se etiqueta por su codigo HTTP", () => {
  const cabeceras = new Headers();
  assert.equal(
    motivoDeFalla(OpenAI.APIError.generate(402, { error: { message: "sin credito" } }, "", cabeceras)),
    "proveedor-402",
  );
  assert.equal(
    motivoDeFalla(OpenAI.APIError.generate(404, { error: { message: "no existe" } }, "", cabeceras)),
    "proveedor-404",
  );
  assert.equal(
    motivoDeFalla(OpenAI.APIError.generate(503, undefined, "caido", cabeceras)),
    "proveedor-503",
  );
});

test("la falla que llega a mitad del stream se etiqueta por su code", () => {
  // Asi la arma el SDK con un trozo {"error": {...}} de OpenRouter: sin status.
  const aMitad = new OpenAI.APIError(undefined, { code: 402, message: "sin credito" }, undefined, undefined);
  assert.equal(motivoDeFalla(aMitad), "proveedor-402");
  assert.equal(motivoDeFalla(new OpenAI.APIError(undefined, undefined, "x", undefined)), "proveedor");
});

test("timeout, conexion y cancelacion tienen etiqueta propia", () => {
  assert.equal(motivoDeFalla(new OpenAI.APIConnectionTimeoutError()), "timeout");
  assert.equal(motivoDeFalla(new OpenAI.APIConnectionError({ message: "fetch failed" })), "conexion");
  assert.equal(motivoDeFalla(new OpenAI.APIUserAbortError()), "cancelada");
});

test("lo que no es del proveedor es interno", () => {
  assert.equal(motivoDeFalla(new Error("bug")), "interno");
  assert.equal(motivoDeFalla("texto"), "interno");
});

// ---------------------------------------------------------------------------
// Proveedor que se queda callado a mitad del stream
// ---------------------------------------------------------------------------

/**
 * Un stream como el del SDK: entrega los trozos con las pausas dadas y, si se
 * aborta su controlador, termina en silencio, que es lo que hace el SDK.
 */
function streamConPausas(pausas: number[]) {
  const controller = new AbortController();
  async function* trozos() {
    for (const [i, pausa] of pausas.entries()) {
      const abortado = await new Promise<boolean>((listo) => {
        const reloj = setTimeout(() => listo(false), pausa);
        controller.signal.addEventListener("abort", () => {
          clearTimeout(reloj);
          listo(true);
        });
      });
      if (abortado) return;
      yield i;
    }
  }
  return { controller, [Symbol.asyncIterator]: trozos };
}

test("un stream que se calla mas de la cuenta se corta como timeout", async () => {
  const recibidos: number[] = [];
  const stream = streamConPausas([0, 5, 10_000]);
  await assert.rejects(
    (async () => {
      for await (const trozo of cortarSiSeCalla(stream, 50)) recibidos.push(trozo);
    })(),
    (causa: unknown) => motivoDeFalla(causa) === "timeout",
  );
  assert.deepEqual(recibidos, [0, 1], "lo que llego antes de callarse se entrego");
  assert.equal(stream.controller.signal.aborted, true, "la llamada al proveedor se corto");
});

test("un stream con pausas cortas llega entero, y el tiempo de quien consume no cuenta", async () => {
  const recibidos: number[] = [];
  const stream = streamConPausas([10, 10, 10]);
  for await (const trozo of cortarSiSeCalla(stream, 50)) {
    recibidos.push(trozo);
    // Procesar un trozo (las herramientas) tarda mas que la pausa permitida.
    await new Promise((listo) => setTimeout(listo, 80));
  }
  assert.deepEqual(recibidos, [0, 1, 2]);
  assert.equal(stream.controller.signal.aborted, false);
});

test("un stream cortado desde afuera (la persona se fue) termina sin error", async () => {
  const stream = streamConPausas([0, 10_000]);
  const recibidos: number[] = [];
  setTimeout(() => stream.controller.abort(), 20);
  for await (const trozo of cortarSiSeCalla(stream, 5_000)) recibidos.push(trozo);
  assert.deepEqual(recibidos, [0]);
});

test("con el SDK de verdad: 200, un trozo y silencio termina en timeout", async () => {
  // El proveedor contesta las cabeceras y un trozo, y despues no manda nada.
  // Asi se ve un modelo colgado detras de OpenRouter: el timeout del SDK ya no
  // corre, porque las cabeceras llegaron.
  const cliente = new OpenAI({
    apiKey: "clave-de-prueba",
    baseURL: "http://proveedor.invalid/v1",
    fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
      const cuerpo = new ReadableStream<Uint8Array>({
        start(controlador) {
          const trozo = {
            id: "x",
            object: "chat.completion.chunk",
            created: 0,
            model: "m",
            choices: [{ index: 0, delta: { content: "Hola" }, finish_reason: null }],
          };
          controlador.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(trozo)}\n\n`));
          init?.signal?.addEventListener("abort", () =>
            controlador.error(new DOMException("cortada", "AbortError")),
          );
        },
      });
      return new Response(cuerpo, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof fetch,
  });

  const stream = await cliente.chat.completions.create({
    model: "m",
    messages: [{ role: "user", content: "hola" }],
    stream: true,
  });
  let texto = "";
  await assert.rejects(
    (async () => {
      for await (const trozo of cortarSiSeCalla(stream, 50)) {
        texto += trozo.choices[0]?.delta?.content ?? "";
      }
    })(),
    (causa: unknown) => motivoDeFalla(causa) === "timeout",
  );
  assert.equal(texto, "Hola");
});
