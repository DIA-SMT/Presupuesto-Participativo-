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
  creada?: Date;
  votanteId?: number;
}) {
  const [fila] = await base.db
    .insert(base.schema.ideas)
    .values({
      edicionId,
      distritoId: 1,
      votanteId: datos.votanteId ?? null,
      titulo: `Idea ${datos.slug}`,
      slug: datos.slug,
      estado: "factible",
      publicada: true,
      canal: datos.canal,
      votos: datos.votos ?? 0,
      ...(datos.creada ? { createdAt: datos.creada } : {}),
      // Lo que el ETL le deja a toda idea migrada, y lo que la distingue.
      tituloOriginal: datos.migrada ? `Original ${datos.slug}` : null,
      notasMigracion: datos.migrada ? ["migrada del sitio anterior"] : null,
    })
    .returning({ id: base.schema.ideas.id });
  return fila.id;
}

async function votante(datos: { hash: string; proveedor: "dev" | "cidituc"; verificado: boolean; creado?: Date }) {
  const [fila] = await base.db
    .insert(base.schema.votantes)
    .values({
      dniHash: datos.hash,
      proveedor: datos.proveedor,
      proveedorSub: datos.proveedor === "cidituc" ? `sub-${datos.hash}` : null,
      verificado: datos.verificado,
      distritoId: 1,
      ...(datos.creado ? { createdAt: datos.creado } : {}),
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

test("con CIDITUC, el corte vale tambien para el padron: el vecino que entro despues queda", async () => {
  // Se abre el 15. Alguien del equipo probo el ingreso real la vispera a las
  // 22:30 (en UTC ya es el 15: el corte va en hora de Tucuman), y un vecino
  // entro a la medianoche y media, presento una idea y la voto. Sin el corte en
  // el padron, el flag se llevaba al vecino, su voto y la autoria de su idea.
  const equipo = await votante({
    hash: "equipo",
    proveedor: "cidituc",
    verificado: true,
    creado: new Date("2026-10-14T22:30:00-03:00"),
  });
  const vecino = await votante({
    hash: "vecino",
    proveedor: "cidituc",
    verificado: true,
    creado: new Date("2026-10-15T00:30:00-03:00"),
  });
  const suya = await idea({
    slug: "del-vecino",
    canal: "web",
    migrada: false,
    votanteId: vecino,
    creada: new Date("2026-10-15T00:40:00-03:00"),
  });
  await votar(equipo, suya);
  await votar(vecino, suya);

  // Sin fecha no hay "antes de la apertura": se niega en vez de llevarse a todos.
  await assert.rejects(armarPlan(base.consultar, { hasta: null, incluirCidituc: true }), /fecha de corte/);

  const plan = await armarPlan(base.consultar, { hasta: "2026-10-14", incluirCidituc: true });
  assert.deepEqual(plan.votantes.map((v) => v.id), [equipo], "ni el vecino ni la persona real de la primera prueba");
  assert.equal(plan.ideas.length, 0, "la idea del vecino es de despues del corte");
  assert.equal(plan.votos, 1);

  const hecho = await aplicarPlan(base, plan);
  assert.equal(hecho.votantes, 1);
  const [queda] = await base.consultar<{ autor: number | null; votos: number; padron: number }>(base.sql`
    SELECT i.votante_id AS autor, i.votos,
           (SELECT count(*) FROM votantes WHERE id = ${vecino})::int AS padron
      FROM ideas i WHERE i.id = ${suya}
  `);
  assert.deepEqual(
    { autor: queda.autor, votos: Number(queda.votos), padron: queda.padron },
    { autor: vecino, votos: 1, padron: 1 },
    "el vecino sigue en el padron, su idea lo tiene de autor y le queda su voto",
  );

  // Se deja la base como estaba para lo que venga despues.
  await base.consultar(base.sql`DELETE FROM votos WHERE votante_id = ${vecino}`);
  await base.consultar(base.sql`DELETE FROM ideas WHERE id = ${suya}`);
  await base.consultar(base.sql`DELETE FROM votantes WHERE id = ${vecino}`);
});

test("las fechas de la lista van en hora de Tucuman, igual que el corte", async () => {
  // El caso de la vispera: lo cargado a las 22:30 del dia de corte entra, y la
  // lista lo tiene que mostrar en ese dia. En UTC (la zona de la sesion en
  // Supabase) son las 01:30 del dia siguiente, el de la apertura. La PGlite
  // toma la zona de la maquina, asi que en una con hora argentina la prueba
  // pasaba igual con el `to_char` pelado: se fija UTC para que no dependa de
  // donde se corre. La PGlite es una sola conexion, el SET vale para lo que sigue.
  await base.consultar(base.sql`SET TIME ZONE 'UTC'`);
  const tarde = new Date("2026-10-14T22:30:00-03:00");
  const vispera = await idea({ slug: "vispera", canal: "web", migrada: false, creada: tarde });
  const apertura = await idea({
    slug: "apertura",
    canal: "web",
    migrada: false,
    creada: new Date("2026-10-15T00:30:00-03:00"),
  });
  const dev = await votante({ hash: "vispera", proveedor: "dev", verificado: false, creado: tarde });

  const plan = await armarPlan(base.consultar, { hasta: "2026-10-14", incluirCidituc: false });
  assert.deepEqual(plan.ideas.map((i) => i.id), [vispera], "la de la apertura no entra");
  assert.equal(plan.ideas[0].creada, "2026-10-14 22:30");
  assert.deepEqual(plan.votantes.map((v) => [v.id, v.creado]), [[dev, "2026-10-14 22:30"]]);

  // Se deja la base como estaba para lo que venga despues.
  await base.consultar(base.sql`DELETE FROM ideas WHERE id IN (${vispera}, ${apertura})`);
  await base.consultar(base.sql`DELETE FROM votantes WHERE id = ${dev}`);
  await base.consultar(base.sql`RESET TIME ZONE`);
});
