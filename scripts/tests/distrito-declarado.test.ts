/**
 * El distrito que declara la persona (declararDistrito, en
 * src/lib/empadronamiento.ts) y el voto que lo relee (registrarVoto), contra una
 * base de verdad.
 *
 * CIDITUC no informa el domicilio: quien entra con su cuenta declara en /votar
 * en que distrito vive, y lo puede cambiar hasta votar. La ruta
 * (/api/votos/distrito) lee la sesion con cookies() y no se puede invocar aca;
 * lo que importa esta en estas dos funciones.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cargarMinimo,
  crearBaseDePrueba,
  crearIdea,
  crearVotante,
  type BaseDePrueba,
} from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let empadronamiento: typeof import("../../src/lib/empadronamiento");
let registrar: typeof import("../../src/app/api/votos/registrar");

test.before(async () => {
  base = await crearBaseDePrueba("distrito-declarado");
  ({ edicionId } = await cargarMinimo(base, { etapa: "votacion" }));
  empadronamiento = await import("../../src/lib/empadronamiento");
  registrar = await import("../../src/app/api/votos/registrar");
});

test.after(async () => {
  await base.cerrar();
});

async function filaDe(votanteId: number) {
  const { db, schema, sql } = base;
  const [fila] = await db
    .select({
      distritoId: schema.votantes.distritoId,
      declaradoEn: schema.votantes.distritoDeclaradoEn,
    })
    .from(schema.votantes)
    .where(sql`${schema.votantes.id} = ${votanteId}`);
  return fila;
}

async function votosDe(votanteId: number): Promise<number> {
  const { db, schema, sql } = base;
  const filas = await db
    .select({ id: schema.votos.id })
    .from(schema.votos)
    .where(sql`${schema.votos.votanteId} = ${votanteId}`);
  return filas.length;
}

function votar(votanteId: number, ideaId: number, distritoDeLaIdea: number) {
  return registrar.registrarVoto({
    edicionId,
    votanteId,
    ideaId,
    distritoId: distritoDeLaIdea,
    ipHash: "ip-de-prueba",
  });
}

test("sin distrito, lo declara: queda el distrito y cuando lo declaro", async () => {
  const votanteId = await crearVotante(base, { dni: "30111222", distrito: null });
  assert.deepEqual(await empadronamiento.declararDistrito(votanteId, 2), { ok: true, distrito: 2 });

  const fila = await filaDe(votanteId);
  assert.equal(fila.distritoId, 2);
  assert.ok(fila.declaradoEn instanceof Date, "queda registrado que lo declaro la persona");
});

test("lo puede cambiar mientras no voto, y vale la ultima declaracion", async () => {
  const votanteId = await crearVotante(base, { dni: "30111333", distrito: null });
  await empadronamiento.declararDistrito(votanteId, 1);
  const primera = (await filaDe(votanteId)).declaradoEn;

  assert.deepEqual(await empadronamiento.declararDistrito(votanteId, 2), { ok: true, distrito: 2 });
  const fila = await filaDe(votanteId);
  assert.equal(fila.distritoId, 2);
  assert.ok(fila.declaradoEn && primera && fila.declaradoEn >= primera);
});

test("despues de votar, el distrito queda fijo", async () => {
  const votanteId = await crearVotante(base, { dni: "30111444", distrito: null });
  await empadronamiento.declararDistrito(votanteId, 1);
  const ideaId = await crearIdea(base, { edicionId, distrito: 1, titulo: "Plaza", slug: "plaza-fija" });
  assert.deepEqual(await votar(votanteId, ideaId, 1), { ok: true });

  const cambio = await empadronamiento.declararDistrito(votanteId, 2);
  assert.equal(cambio.ok, false);
  assert.equal(!cambio.ok && cambio.motivo, "ya-voto");
  assert.equal((await filaDe(votanteId)).distritoId, 1, "el padron sigue diciendo el del voto");
});

test("el voto relee el distrito del padron, no el que traia la cookie", async () => {
  // La boleta del distrito 1 abierta en otra pestaña, y en esta la persona
  // cambio al 2: la cookie vieja decia 1, y con ella votaba en el distrito 1.
  const votanteId = await crearVotante(base, { dni: "30111555", distrito: 1 });
  await empadronamiento.declararDistrito(votanteId, 2);
  const ideaId = await crearIdea(base, { edicionId, distrito: 1, titulo: "Playón", slug: "playon-otra-pestana" });

  assert.deepEqual(await votar(votanteId, ideaId, 1), { ok: false, motivo: "distrito-distinto" });
  assert.equal(await votosDe(votanteId), 0);
});

test("un distrito que no existe no se guarda", async () => {
  // La base de prueba tiene los distritos 1 y 2.
  const votanteId = await crearVotante(base, { dni: "30111666", distrito: null });
  const resultado = await empadronamiento.declararDistrito(votanteId, 7);
  assert.equal(!resultado.ok && resultado.motivo, "distrito-invalido");
  assert.equal((await filaDe(votanteId)).distritoId, null);
});

test("fuera de la votacion no se declara, y sin votante tampoco", async () => {
  const { db, schema, sql } = base;
  const votanteId = await crearVotante(base, { dni: "30111777", distrito: null });

  await db
    .update(schema.ediciones)
    .set({ etapa: "seguimiento" })
    .where(sql`${schema.ediciones.id} = ${edicionId}`);
  try {
    const resultado = await empadronamiento.declararDistrito(votanteId, 1);
    assert.equal(!resultado.ok && resultado.motivo, "fuera-de-etapa");
    assert.equal((await filaDe(votanteId)).distritoId, null);
  } finally {
    await db
      .update(schema.ediciones)
      .set({ etapa: "votacion" })
      .where(sql`${schema.ediciones.id} = ${edicionId}`);
  }

  const inexistente = await empadronamiento.declararDistrito(999_999, 1);
  assert.equal(!inexistente.ok && inexistente.motivo, "sin-votante");
});
