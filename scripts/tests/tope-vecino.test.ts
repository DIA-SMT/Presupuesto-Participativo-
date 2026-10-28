/**
 * El tope de las acciones del vecino (src/lib/rate-limit.ts, consumirDelVecino)
 * contra una PGlite descartable: la tabla `rate_limit` es la de verdad.
 *
 * Antes /api/ideas, /api/votos y /api/votos/distrito contaban solo por IP, y
 * la IP la comparte una asamblea entera: la sexta idea de la hora o la
 * declaracion de distrito numero 31 rebotaban para alguien que no habia hecho
 * nada, y cualquiera en la misma red podia vaciar el cupo sin sesion.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let limite: typeof import("../../src/lib/rate-limit");

test.before(async () => {
  base = await crearBaseDePrueba("tope-vecino");
  limite = await import("../../src/lib/rate-limit");
});

test.after(async () => {
  await base.cerrar();
});

const TOPES = {
  conSesion: { maximo: 3, ventanaSegundos: 3600 },
  sinSesion: { maximo: 3, ventanaSegundos: 3600 },
};

/** Un pedido que sale de la misma IP publica que todos los demas. */
function desdeLaAsamblea(): Request {
  return new Request("http://localhost/api/ideas", {
    method: "POST",
    headers: { "x-forwarded-for": "200.45.10.1" },
  });
}

test("dos vecinos con sesion detras de la misma IP tienen cada uno su cupo", async () => {
  for (let i = 0; i < TOPES.conSesion.maximo; i += 1) {
    const r = await limite.consumirDelVecino("prueba", 1, desdeLaAsamblea(), TOPES);
    assert.equal(r.permitido, true, `vecino 1, intento ${i + 1}`);
  }
  assert.equal(
    (await limite.consumirDelVecino("prueba", 1, desdeLaAsamblea(), TOPES)).permitido,
    false,
    "el que pasa su propio tope se frena",
  );

  // La persona que sigue en la fila, misma conexion: arranca de cero.
  assert.equal(
    (await limite.consumirDelVecino("prueba", 2, desdeLaAsamblea(), TOPES)).permitido,
    true,
  );
});

test("los pedidos sin sesion vacian el cupo anonimo de la IP, no el de los vecinos", async () => {
  for (let i = 0; i <= TOPES.sinSesion.maximo; i += 1) {
    await limite.consumirDelVecino("anonimo", null, desdeLaAsamblea(), TOPES);
  }
  assert.equal(
    (await limite.consumirDelVecino("anonimo", null, desdeLaAsamblea(), TOPES)).permitido,
    false,
    "sin sesion, la IP sigue teniendo tope",
  );

  // Quien entro con su cuenta desde la misma red no se entera.
  assert.equal(
    (await limite.consumirDelVecino("anonimo", 3, desdeLaAsamblea(), TOPES)).permitido,
    true,
  );
});
