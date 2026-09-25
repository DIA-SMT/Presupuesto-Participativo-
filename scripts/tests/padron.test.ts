/**
 * El padron, probado contra las migraciones reales.
 *
 *  1. Una cuenta del proveedor, un votante (migracion 0011): el unique de
 *     `dni_hash` no alcanza si el hash del mismo DNI cambia.
 *  2. `empadronar` no hereda nada de una fila sin verificar (antes un distrito
 *     elegido en el login "dev" pasaba a una fila verificada por CIDITUC), ni
 *     deja que un ingreso sin verificar pise una fila verificada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cargarMinimo, crearBaseDePrueba, violacionDe, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let empadronar: typeof import("../../src/lib/empadronamiento").empadronar;

test.before(async () => {
  base = await crearBaseDePrueba("padron");
  await cargarMinimo(base, { etapa: "votacion" });
  // Import dinamico DESPUES de crear la base: src/db elige la carpeta de PGlite
  // al importarse (ver apoyo-base.ts).
  ({ empadronar } = await import("../../src/lib/empadronamiento"));
});

test.after(async () => {
  await base.cerrar();
});

// --- Una cuenta, un votante ---------------------------------------------------

test("dos documentos no pueden compartir la misma cuenta de CIDITUC", async () => {
  await base.db.insert(base.schema.votantes).values({
    dniHash: "d".repeat(64),
    proveedor: "cidituc",
    proveedorSub: "cuenta-repetida",
    verificado: true,
  });
  await assert.rejects(
    () =>
      base.db.insert(base.schema.votantes).values({
        dniHash: "e".repeat(64),
        proveedor: "cidituc",
        proveedorSub: "cuenta-repetida",
        verificado: true,
      }),
    violacionDe(/votantes_proveedor_sub_idx/),
  );
});

test("las filas sin cuenta (login dev) no entran en la regla", async () => {
  await base.db.insert(base.schema.votantes).values([
    { dniHash: "f".repeat(64), proveedor: "dev" },
    { dniHash: "0".repeat(64), proveedor: "dev" },
  ]);
});

// --- empadronar ---------------------------------------------------------------

async function filaDe(votanteId: number) {
  const [fila] = await base.consultar<{
    distrito_id: number | null;
    nombre: string | null;
    proveedor: string;
    proveedor_sub: string | null;
    verificado: boolean;
  }>(base.sql`
    SELECT distrito_id, nombre, proveedor, proveedor_sub, verificado
    FROM votantes WHERE id = ${votanteId}
  `);
  return fila;
}

test("entrar con CIDITUC no hereda el distrito de un login dev sin verificar", async () => {
  const dev = await empadronar({
    dni: "20111222",
    nombre: "Nombre inventado",
    distrito: 2,
    proveedor: "dev",
    proveedorSub: null,
    verificado: false,
  });
  const cidituc = await empadronar({
    dni: "20111222",
    nombre: "Nombre de CIDITUC",
    distrito: null,
    proveedor: "cidituc",
    proveedorSub: "cuenta-20111222",
    verificado: true,
  });

  assert.equal(cidituc.votanteId, dev.votanteId, "es la misma persona: la misma fila");
  assert.equal(cidituc.distrito, null, "el distrito elegido sin verificar no pasa");
  assert.deepEqual(await filaDe(cidituc.votanteId), {
    distrito_id: null,
    nombre: "Nombre de CIDITUC",
    proveedor: "cidituc",
    proveedor_sub: "cuenta-20111222",
    verificado: true,
  });
});

test("volver a entrar con CIDITUC conserva el distrito que ya tenia", async () => {
  const primero = await empadronar({
    dni: "20333444",
    nombre: "Persona",
    distrito: 1,
    proveedor: "cidituc",
    proveedorSub: "cuenta-20333444",
    verificado: true,
  });
  const otraVez = await empadronar({
    dni: "20333444",
    nombre: null,
    distrito: null,
    proveedor: "cidituc",
    proveedorSub: "cuenta-20333444",
    verificado: true,
  });
  assert.equal(otraVez.votanteId, primero.votanteId);
  assert.equal(otraVez.distrito, 1);
  assert.equal(otraVez.nombre, "Persona");
});

test("un login dev no desmarca ni cambia de distrito a una fila verificada", async () => {
  const verificada = await empadronar({
    dni: "20555666",
    nombre: "Persona verificada",
    distrito: 1,
    proveedor: "cidituc",
    proveedorSub: "cuenta-20555666",
    verificado: true,
  });
  const dev = await empadronar({
    dni: "20555666",
    nombre: "Otro nombre",
    distrito: 2,
    proveedor: "dev",
    proveedorSub: null,
    verificado: false,
  });
  assert.equal(dev.votanteId, verificada.votanteId);
  assert.deepEqual(await filaDe(dev.votanteId), {
    distrito_id: 1,
    nombre: "Persona verificada",
    proveedor: "cidituc",
    proveedor_sub: "cuenta-20555666",
    verificado: true,
  });
});

test("entre dos logins dev, manda el ultimo", async () => {
  const uno = await empadronar({
    dni: "20777888",
    nombre: null,
    distrito: 1,
    proveedor: "dev",
    proveedorSub: null,
    verificado: false,
  });
  const dos = await empadronar({
    dni: "20777888",
    nombre: null,
    distrito: 2,
    proveedor: "dev",
    proveedorSub: null,
    verificado: false,
  });
  assert.equal(dos.votanteId, uno.votanteId);
  assert.equal(dos.distrito, 2);
});

test("la misma cuenta con otro documento rebota, sin datos personales en el mensaje", async () => {
  await empadronar({
    dni: "21000111",
    nombre: "Titular de la cuenta",
    distrito: null,
    proveedor: "cidituc",
    proveedorSub: "cuenta-compartida",
    verificado: true,
  });
  await assert.rejects(
    () =>
      empadronar({
        dni: "21999888",
        nombre: "Nombre que no tiene que aparecer",
        distrito: null,
        proveedor: "cidituc",
        proveedorSub: "cuenta-compartida",
        verificado: true,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /votantes_proveedor_sub_idx/);
      // El callback de CIDITUC registra `message` en los logs del hosting.
      assert.doesNotMatch(error.message, /21999888|888|Nombre que no|cuenta-compartida/);
      return true;
    },
  );
  const [cuenta] = await base.consultar<{ n: number }>(
    base.sql`SELECT count(*)::int AS n FROM votantes WHERE proveedor_sub = 'cuenta-compartida'`,
  );
  assert.equal(cuenta.n, 1, "no se abrio un segundo lugar en el padron");
});
