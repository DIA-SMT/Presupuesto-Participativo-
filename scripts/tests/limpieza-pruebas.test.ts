/**
 * La limpieza previa al lanzamiento (scripts/limpieza-pruebas.ts) contra una
 * PGlite descartable: que se lleve lo de prueba y NADA de lo real.
 *
 * El caso que importa es el de las ideas migradas: tienen canal "asamblea" o
 * "municipio" igual que una cargada desde el panel, y lo unico que las
 * distingue es el rastro de la migracion. Y el de los contadores: un voto de
 * prueba sobre una idea real tiene que restarse de `ideas.votos`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cargarMinimo, crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";
import { aplicarPlan, armarPlan, fechaDeCorte } from "../limpieza-pruebas";

let base: BaseDePrueba;
let edicionId: number;

const hoy = new Date().toISOString().slice(0, 10);

test.before(async () => {
  base = await crearBaseDePrueba("limpieza");
  ({ edicionId } = await cargarMinimo(base, { etapa: "votacion" }));
});

test.after(async () => {
  await base.cerrar();
});

async function idea(datos: {
  slug: string;
  canal: "web" | "asamblea" | "municipio" | "migracion";
  migrada: boolean;
  votos?: number;
}) {
  const [fila] = await base.db
    .insert(base.schema.ideas)
    .values({
      edicionId,
      distritoId: 1,
      titulo: `Idea ${datos.slug}`,
      slug: datos.slug,
      estado: "factible",
      publicada: true,
      canal: datos.canal,
      votos: datos.votos ?? 0,
      // Lo que el ETL le deja a toda idea migrada, y lo que la distingue.
      tituloOriginal: datos.migrada ? `Original ${datos.slug}` : null,
      notasMigracion: datos.migrada ? ["migrada del sitio anterior"] : null,
    })
    .returning({ id: base.schema.ideas.id });
  return fila.id;
}

async function votante(datos: { hash: string; proveedor: "dev" | "cidituc"; verificado: boolean }) {
  const [fila] = await base.db
    .insert(base.schema.votantes)
    .values({
      dniHash: datos.hash,
      proveedor: datos.proveedor,
      proveedorSub: datos.proveedor === "cidituc" ? `sub-${datos.hash}` : null,
      verificado: datos.verificado,
      distritoId: 1,
    })
    .returning({ id: base.schema.votantes.id });
  return fila.id;
}

async function votar(votanteId: number, ideaId: number) {
  await base.db.insert(base.schema.votos).values({ edicionId, votanteId, ideaId, distritoId: 1 });
  await base.consultar(base.sql`UPDATE ideas SET votos = votos + 1 WHERE id = ${ideaId}`);
}

test("la fecha de corte solo acepta AAAA-MM-DD que existan", () => {
  assert.equal(fechaDeCorte("2026-10-31"), "2026-10-31");
  assert.equal(fechaDeCorte("2026-02-30"), null);
  assert.equal(fechaDeCorte("31/10/2026"), null);
  assert.equal(fechaDeCorte(""), null);
  assert.equal(fechaDeCorte(null), null);
});

test("se lleva lo de prueba, deja lo real y corrige los contadores", async () => {
  // Real: una idea 2025 migrada "de asamblea" con sus 5 votos, y una persona
  // que entro con su CIDITUC.
  const migrada = await idea({ slug: "migrada", canal: "asamblea", migrada: true, votos: 5 });
  const cidituc = await votante({ hash: "real", proveedor: "cidituc", verificado: true });
  // De prueba: una idea del formulario, otra cargada "de asamblea" desde el
  // panel (mismo canal que la migrada), y un votante del login de prueba.
  const web = await idea({ slug: "web", canal: "web", migrada: false });
  const panel = await idea({ slug: "panel", canal: "asamblea", migrada: false });
  const dev = await votante({ hash: "prueba", proveedor: "dev", verificado: false });

  await votar(dev, migrada); // un voto de prueba sobre una idea real: 5 -> 6
  await votar(cidituc, web); // un voto real sobre una idea de prueba

  await base.db.insert(base.schema.chatConsultas).values({ pregunta: "¿Cómo voto?" });
  await base.db.insert(base.schema.rateLimit).values({ clave: "chat:x", contador: 3 });

  // Sin fecha de corte: solo el votante de prueba y su voto.
  const sinFecha = await armarPlan(base.consultar, { hasta: null, incluirCidituc: false });
  assert.deepEqual(sinFecha.votantes.map((v) => v.id), [dev]);
  assert.equal(sinFecha.ideas.length, 0);
  assert.equal(sinFecha.votos, 1);
  assert.equal(sinFecha.chat, 0);

  const plan = await armarPlan(base.consultar, { hasta: hoy, incluirCidituc: false });
  assert.deepEqual(plan.votantes.map((v) => v.id), [dev]);
  assert.deepEqual(plan.ideas.map((i) => i.id).sort(), [web, panel].sort(), "la migrada no entra");
  assert.equal(plan.votos, 2);
  assert.equal(plan.chat, 1);
  assert.equal(plan.limites, 1);

  const hecho = await aplicarPlan(base, plan);
  assert.deepEqual(
    { votos: hecho.votos, contadores: hecho.contadoresCorregidos, ideas: hecho.ideas, votantes: hecho.votantes },
    { votos: 2, contadores: 1, ideas: 2, votantes: 1 },
  );

  const [quedan] = await base.consultar<{ ideas: string; votantes: string; votos: number; contador: number }>(base.sql`
    SELECT (SELECT string_agg(slug, ',' ORDER BY slug) FROM ideas) AS ideas,
           (SELECT string_agg(proveedor, ',' ORDER BY id) FROM votantes) AS votantes,
           (SELECT count(*) FROM votos)::int AS votos,
           (SELECT votos FROM ideas WHERE id = ${migrada}) AS contador
  `);
  assert.equal(quedan.ideas, "migrada");
  assert.equal(quedan.votantes, "cidituc", "la persona real queda en el padron");
  assert.equal(quedan.votos, 0);
  assert.equal(Number(quedan.contador), 5, "el voto de prueba se le resta a la idea real");

  const [resto] = await base.consultar<{ chat: number; limites: number }>(base.sql`
    SELECT (SELECT count(*) FROM chat_consultas)::int AS chat, (SELECT count(*) FROM rate_limit)::int AS limites
  `);
  assert.deepEqual(resto, { chat: 0, limites: 0 });
});

test("los votantes de CIDITUC entran solo si se pide", async () => {
  const sin = await armarPlan(base.consultar, { hasta: hoy, incluirCidituc: false });
  assert.equal(sin.votantes.length, 0);
  const con = await armarPlan(base.consultar, { hasta: hoy, incluirCidituc: true });
  assert.deepEqual(con.votantes.map((v) => v.proveedor), ["cidituc"]);
});
