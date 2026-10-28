/**
 * Los topes de intentos del login del panel (src/lib/tope-ingreso-admin.ts),
 * contra una PGlite descartable: la tabla `rate_limit` es la de verdad.
 *
 * El caso que motivo el tope por cuenta es el ataque repartido: muchas IP, cada
 * una dentro de su tope, todas contra el mismo correo. Con el tope por IP solo,
 * eso no tenia techo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let tope: typeof import("../../src/lib/tope-ingreso-admin");

test.before(async () => {
  base = await crearBaseDePrueba("tope-ingreso-admin");
  tope = await import("../../src/lib/tope-ingreso-admin");
});

test.after(async () => {
  await base.cerrar();
});

const AVISO = /^Demasiados intentos\. Probá de nuevo en \d+ minutos?\.$/;

/** Corre `hacer` con console.warn capturado: el aviso del tope va al log. */
async function conLog<T>(hacer: () => Promise<T>): Promise<{ resultado: T; log: string[] }> {
  const log: string[] = [];
  const original = console.warn;
  console.warn = (...partes: unknown[]) => {
    log.push(partes.map(String).join(" "));
  };
  try {
    return { resultado: await hacer(), log };
  } finally {
    console.warn = original;
  }
}

test("desde una IP, el intento once se frena aunque cambie el correo", async () => {
  const ip = "10.0.0.1";
  for (let i = 0; i < tope.TOPE_POR_IP.maximo; i += 1) {
    assert.equal(await tope.topeDeIngresoAdmin(ip, `persona${i}@smt.gob.ar`), null, `intento ${i + 1}`);
  }
  const { resultado, log } = await conLog(() =>
    tope.topeDeIngresoAdmin(ip, "otra@smt.gob.ar"),
  );
  assert.match(resultado ?? "", AVISO);
  assert.ok(log.some((linea) => linea.includes("por IP")), "queda rastro en el log");
  assert.ok(!log.some((linea) => linea.includes(ip)), "sin la IP en claro");
});

test("con IP distintas, el intento 51 contra la misma cuenta se frena", async () => {
  const email = "admin@smt.gob.ar";
  for (let i = 0; i < tope.TOPE_POR_CUENTA.maximo; i += 1) {
    assert.equal(await tope.topeDeIngresoAdmin(`10.1.${i}.1`, email), null, `intento ${i + 1}`);
  }
  const { resultado, log } = await conLog(() => tope.topeDeIngresoAdmin("10.2.0.1", email));
  // El mismo mensaje que el tope por IP: no dice si el correo existe.
  assert.match(resultado ?? "", AVISO);
  assert.ok(log.some((linea) => linea.includes("por cuenta")), "queda rastro en el log");
  assert.ok(!log.some((linea) => linea.includes(email)), "sin el correo en claro");

  // Otra cuenta, desde una IP nueva, sigue entrando.
  assert.equal(await tope.topeDeIngresoAdmin("10.2.0.2", "otra-cuenta@smt.gob.ar"), null);
});

test("los intentos de una IP ya frenada no gastan los de la cuenta", async () => {
  const email = "moderacion@smt.gob.ar";
  const ip = "10.3.0.1";
  // Diez que pasan y veinte frenados por la IP: cuentan diez para la cuenta.
  for (let i = 0; i < 30; i += 1) {
    await conLog(() => tope.topeDeIngresoAdmin(ip, email));
  }
  const quedan = tope.TOPE_POR_CUENTA.maximo - tope.TOPE_POR_IP.maximo;
  for (let i = 0; i < quedan; i += 1) {
    assert.equal(await tope.topeDeIngresoAdmin(`10.4.${i}.1`, email), null, `intento ${i + 1}`);
  }
  const { resultado } = await conLog(() => tope.topeDeIngresoAdmin("10.5.0.1", email));
  assert.match(resultado ?? "", AVISO);
});

test("en rate_limit no queda ni la IP ni el correo en claro", async () => {
  const filas = await base.consultar<{ clave: string }>(base.sql`SELECT clave FROM rate_limit`);
  assert.ok(filas.length > 0);
  for (const { clave } of filas) {
    assert.match(clave, /^login-admin(-cuenta)?:[0-9a-f]{64}$/, clave);
  }
});
