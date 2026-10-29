/**
 * El tope de intentos del cambio de la propia contrasena
 * (src/lib/tope-password-propia.ts), contra una PGlite descartable: la tabla
 * `rate_limit` es la de verdad.
 *
 * `cambiarMiPassword` contestaba "La contraseña actual no es correcta" sin
 * contar nada: con una sesion abierta se podia recorrer un diccionario contra
 * la contrasena de la cuenta, por fuera de los topes del login.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let tope: typeof import("../../src/lib/tope-password-propia");

test.before(async () => {
  base = await crearBaseDePrueba("tope-password-propia");
  tope = await import("../../src/lib/tope-password-propia");
});

test.after(async () => {
  await base.cerrar();
});

const AVISO = /^Demasiados intentos\. Probá de nuevo en \d+ minutos?\.$/;

/** Un intento, con console.warn capturado: el aviso del tope va al log. */
async function intentar(adminId: number): Promise<{ resultado: string | null; log: string[] }> {
  const log: string[] = [];
  const original = console.warn;
  console.warn = (...partes: unknown[]) => {
    log.push(partes.map(String).join(" "));
  };
  try {
    return { resultado: await tope.topeDePasswordPropia(adminId), log };
  } finally {
    console.warn = original;
  }
}

test("el intento que pasa el tope se frena, deja rastro y no frena a otra cuenta", async () => {
  const adminId = 7;
  for (let i = 0; i < tope.TOPE_PASSWORD_PROPIA.maximo; i += 1) {
    assert.equal((await intentar(adminId)).resultado, null, `intento ${i + 1}`);
  }

  const { resultado, log } = await intentar(adminId);
  assert.match(resultado ?? "", AVISO);
  assert.ok(log.some((linea) => linea.includes("password-propia")), "queda rastro en el log");

  // El contador es de la cuenta: la sesion de otra persona sigue pudiendo.
  assert.equal((await intentar(8)).resultado, null);
});

test("la ventana vencida vuelve a dejar probar", async () => {
  const adminId = 9;
  for (let i = 0; i <= tope.TOPE_PASSWORD_PROPIA.maximo; i += 1) {
    await intentar(adminId);
  }
  assert.match((await intentar(adminId)).resultado ?? "", AVISO);

  // Se corre el inicio de la ventana para atras en lugar de esperar diez minutos.
  await base.consultar(base.sql`
    UPDATE rate_limit
    SET ventana_desde = now() - make_interval(secs => ${tope.TOPE_PASSWORD_PROPIA.ventanaSegundos + 1})
    WHERE clave = ${`password-propia:${adminId}`}
  `);
  assert.equal((await intentar(adminId)).resultado, null);
});
