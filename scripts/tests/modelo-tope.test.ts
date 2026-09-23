/**
 * Pruebas de las piezas puras de src/lib/modelo.ts: el tope diario de gasto
 * (CHAT_TOPE_TOKENS_DIA) y la etiqueta con la que se registra una falla del
 * proveedor. No tocan la base ni la red: la lectura del gasto se inyecta.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
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
