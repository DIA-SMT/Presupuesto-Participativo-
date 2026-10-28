/**
 * Entre el pase a "Seguimiento" y la proclamacion.
 *
 * Se proclama recien en seguimiento, a mano y de a un distrito. Las cuentas
 * publicas tomaban la etapa como resultado: todo distrito sin ganador iba a
 * `distritosSinGanador`, y con nada proclamado /transparencia decia que los 20
 * "no eligieron proyecto", la portada contaba "0 proyectos ganadores" y el
 * chat los listaba "sin ganador". Ahora el que tiene ideas factibles y
 * publicadas (lo que entra en el conteo) espera su proclamacion; el que no
 * tiene ninguna, o el que llego asi a una edicion cerrada, quedo sin proyecto.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cargarMinimo, crearBaseDePrueba, crearIdea, type BaseDePrueba } from "./apoyo-base";
import { ganadorPorProclamar } from "../../src/lib/ediciones";

let base: BaseDePrueba;
let edicionId: number;
let factibleD1: number;
let consultas: typeof import("../../src/db/queries");
let herramientas: typeof import("../../src/lib/chat-herramientas");

test.before(async () => {
  base = await crearBaseDePrueba("por-proclamar");
  const minimo = await cargarMinimo(base, { etapa: "seguimiento" });
  edicionId = minimo.edicionId;
  consultas = await import("../../src/db/queries");
  herramientas = await import("../../src/lib/chat-herramientas");

  // Distrito 1: voto, con dos factibles en el conteo y ninguna proclamada.
  factibleD1 = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Plaza nueva",
    slug: "plaza-nueva",
    votos: 40,
  });
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Veredas",
    slug: "veredas",
    votos: 10,
  });
  // Distrito 2: su unica idea fue declarada no factible. No tuvo nada que votar.
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Idea no factible",
    slug: "no-factible",
    estado: "no_factible",
  });
  // Una factible sin publicar no entra en el conteo: no lo vuelve "por proclamar".
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Factible sin publicar",
    slug: "factible-sin-publicar",
    publicada: false,
  });
});

test.after(async () => {
  await base.cerrar();
});

async function edicion() {
  const activa = await consultas.getEdicionActiva();
  assert.ok(activa);
  return activa;
}

async function fijarEtapa(etapa: "seguimiento" | "cerrada") {
  await base.db
    .update(base.schema.ediciones)
    .set({ etapa })
    .where(base.sql`${base.schema.ediciones.id} = ${edicionId}`);
}

test("la regla: solo en seguimiento y con algo que proclamar", () => {
  assert.equal(ganadorPorProclamar("seguimiento", true), true);
  assert.equal(ganadorPorProclamar("seguimiento", false), false);
  assert.equal(ganadorPorProclamar("cerrada", true), false, "cerrada es el final");
  for (const etapa of ["ideas", "evaluacion", "votacion"] as const) {
    assert.equal(ganadorPorProclamar(etapa, true), false, etapa);
  }
});

test("en seguimiento sin proclamar, el distrito con factibles no 'quedo sin ganador'", async () => {
  const stats = await consultas.getEstadisticas(await edicion());
  assert.equal(stats.ganadores, 0);
  assert.deepEqual(stats.distritosPorProclamar, [1]);
  assert.deepEqual(stats.distritosSinGanador, [2]);

  const distritos = await consultas.getDistritos(edicionId);
  assert.equal(distritos.find((d) => d.numero === 1)?.conFactibles, true);
  assert.equal(distritos.find((d) => d.numero === 2)?.conFactibles, false, "la sin publicar no cuenta");

  assert.equal((await consultas.getDistrito(1, edicionId))?.conFactibles, true);
  assert.equal((await consultas.getDistrito(2, edicionId))?.conFactibles, false);
});

test("el chat no lista como 'sin ganador' al que espera su proclamacion", async () => {
  const vigente = await edicion();
  const estadisticas = await herramientas.ejecutarHerramienta("estadisticas", {}, vigente);
  const datos = JSON.parse(estadisticas.contenido);
  assert.deepEqual(datos.distritos_sin_ganador, [2]);
  assert.deepEqual(datos.distritos_por_proclamar.distritos, [1]);

  const d1 = JSON.parse(
    (await herramientas.ejecutarHerramienta("resumen_distrito", { numero: 1 }, vigente)).contenido,
  );
  assert.match(d1.ganador, /todavia no se proclamo/);
  const d2 = JSON.parse(
    (await herramientas.ejecutarHerramienta("resumen_distrito", { numero: 2 }, vigente)).contenido,
  );
  assert.match(d2.ganador, /no tiene proyecto ganador/);
});

test("proclamado, deja de estar por proclamar", async () => {
  await base.db
    .update(base.schema.ideas)
    .set({ estado: "ganador", ganador: true })
    .where(base.sql`${base.schema.ideas.id} = ${factibleD1}`);
  try {
    const stats = await consultas.getEstadisticas(await edicion());
    assert.equal(stats.ganadores, 1);
    assert.deepEqual(stats.distritosPorProclamar, []);
    assert.deepEqual(stats.distritosSinGanador, [2]);
  } finally {
    await base.db
      .update(base.schema.ideas)
      .set({ estado: "factible", ganador: false })
      .where(base.sql`${base.schema.ideas.id} = ${factibleD1}`);
  }
});

test("con la edicion cerrada, el que no se proclamo quedo sin ganador", async () => {
  await fijarEtapa("cerrada");
  try {
    const stats = await consultas.getEstadisticas(await edicion());
    assert.deepEqual(stats.distritosPorProclamar, []);
    assert.deepEqual(stats.distritosSinGanador, [1, 2]);
  } finally {
    await fijarEtapa("seguimiento");
  }
});
