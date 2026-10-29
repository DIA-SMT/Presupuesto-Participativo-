/**
 * La salida hacia CIDITUC (/auth/cidituc/ingresar) con la base caida.
 *
 * Desde que la salida lee la edicion activa (para deducir el destino y mirar la
 * etapa), una base que no contesta tiraba una excepcion fuera de la ruta y Next
 * respondia un 500 pelado: error.tsx no cubre rutas. Lo que se fija aca es que
 * vuelva a /ingresar con un motivo que la pagina sepa explicar, sin dejar las
 * cookies de una salida que no ocurrio.
 *
 * A diferencia del callback, esta ruta se puede llamar fuera de Next: en la
 * etapa de ideas con `?para=ideas` no lee cookies (la sesion del panel solo se
 * mira fuera de etapa). La base "cae" renombrando la tabla de ediciones: la
 * consulta tira igual que con el pooler saturado.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cargarMinimo, crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let GET: (request: Request) => Promise<Response>;

test.before(async () => {
  base = await crearBaseDePrueba("salida-cidituc");
  await cargarMinimo(base, { etapa: "ideas" });
  ({ GET } = await import("../../src/app/auth/cidituc/ingresar/route"));
});

test.after(async () => {
  await base?.cerrar();
});

const ORIGEN = "http://localhost:3000";

function pedido(para?: string) {
  const url = new URL("/auth/cidituc/ingresar", ORIGEN);
  if (para) url.searchParams.set("para", para);
  return new Request(url);
}

/** Corre `fn` con el interruptor de CIDITUC en el estado pedido y lo restaura. */
async function conInterruptor<T>(habilitado: boolean, fn: () => Promise<T>): Promise<T> {
  const antes = process.env.CIDITUC_INGRESO_HABILITADO;
  process.env.CIDITUC_INGRESO_HABILITADO = habilitado ? "true" : "false";
  try {
    return await fn();
  } finally {
    if (antes === undefined) delete process.env.CIDITUC_INGRESO_HABILITADO;
    else process.env.CIDITUC_INGRESO_HABILITADO = antes;
  }
}

/** La tabla de ediciones fuera de alcance mientras corre `fn`. */
async function conBaseCaida<T>(fn: () => Promise<T>): Promise<T> {
  await base.consultar(base.sql`ALTER TABLE ediciones RENAME TO ediciones_apartada`);
  try {
    return await fn();
  } finally {
    await base.consultar(base.sql`ALTER TABLE ediciones_apartada RENAME TO ediciones`);
  }
}

test("con la base en pie, la salida va a CIDITUC y deja el estado y el destino", async () => {
  const respuesta = await conInterruptor(true, () => GET(pedido("ideas")));
  assert.equal(respuesta.status, 307);
  assert.match(respuesta.headers.get("location") ?? "", /^https:\/\/cidituc\.smt\.gob\.ar\//);
  const cookies = respuesta.headers.getSetCookie().join("\n");
  assert.match(cookies, /pp_cidituc_estado=/);
  assert.match(cookies, /pp_cidituc_destino=ideas/);
});

test("con la base caida vuelve a la puerta con 'sin-servicio', no con un 500", async (t) => {
  // El catch deja su resumen en el registro: aca solo ensucia la salida, pero
  // contarlo prueba que la consulta tiro de verdad y no que la ruta la salteo.
  const registro = t.mock.method(console, "error", () => {});
  await conBaseCaida(async () => {
    const respuesta = await conInterruptor(true, () => GET(pedido("ideas")));
    assert.equal(registro.mock.callCount(), 1, "la base tenia que fallar");
    assert.equal(respuesta.status, 307);
    const vuelta = new URL(respuesta.headers.get("location") ?? "");
    assert.equal(vuelta.origin, ORIGEN, "vuelve al sitio del que salio");
    assert.equal(vuelta.pathname, "/ingresar");
    assert.equal(vuelta.searchParams.get("para"), "ideas", "a la puerta del destino pedido");
    assert.equal(vuelta.searchParams.get("error"), "sin-servicio");
    assert.deepEqual(respuesta.headers.getSetCookie(), [], "sin cookies de una salida que no ocurrio");

    // Sin `?para` y sin etapa que leer, la puerta es la de votar.
    const pelada = await conInterruptor(true, () => GET(pedido()));
    const vueltaPelada = new URL(pelada.headers.get("location") ?? "");
    assert.equal(vueltaPelada.pathname, "/ingresar");
    assert.equal(vueltaPelada.searchParams.get("para"), null);
    assert.equal(vueltaPelada.searchParams.get("error"), "sin-servicio");
  });
});

test("con el interruptor apagado, la base caida no tapa 'ingreso-cerrado'", async (t) => {
  const registro = t.mock.method(console, "error", () => {});
  await conBaseCaida(async () => {
    const respuesta = await conInterruptor(false, () => GET(pedido("ideas")));
    assert.equal(registro.mock.callCount(), 1, "la base tenia que fallar");
    assert.equal(respuesta.status, 307);
    const vuelta = new URL(respuesta.headers.get("location") ?? "");
    assert.equal(vuelta.pathname, "/ingresar");
    assert.equal(vuelta.searchParams.get("error"), "ingreso-cerrado");
  });
});
