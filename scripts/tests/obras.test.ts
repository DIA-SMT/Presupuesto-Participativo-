/**
 * Las tarjetas de obra de /transparencia y /admin/obras.
 *
 *  - La etapa sale del ULTIMO avance publicado, no de
 *    `ideas.estado_presupuesto`: en los ganadores migrados esa columna dice
 *    "preparacion" porque la puso el ETL, y una obra sin avances tiene que
 *    decir que no hay informacion.
 *  - El link de un avance es solo https: la tarjeta lo dibuja como enlace.
 *
 * Sobre el escenario de apoyo-ediciones.ts: la 2025 tiene dos ganadores, uno
 * con un avance ("Plaza del barrio", en obra) y otro sin ninguno.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { enlaceValido } from "../../src/lib/enlace";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";
import { cargarDosEdiciones } from "./apoyo-ediciones";

let base: BaseDePrueba;
let id2025: number;
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("obras");
  ({ id2025 } = await cargarDosEdiciones(base));
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

test("la etapa es la del ultimo avance; sin avances, null", async () => {
  const obras = await consultas.listarObras(id2025);
  const plaza = obras.find((obra) => obra.slug === "plaza-del-barrio");
  const otra = obras.find((obra) => obra.slug === "solo-en-2025");

  assert.equal(plaza?.etapa, "ejecucion");
  assert.equal(plaza?.fecha, "2026-08-01");
  assert.equal(plaza?.avances.length, 1);

  // La columna del ETL no cuenta: sin avances no hay etapa.
  assert.equal(otra?.etapa, null);
  assert.equal(otra?.avances.length, 0);
});

test("manda el avance mas nuevo, y entre dos del mismo dia el ultimo cargado", async () => {
  const { db, schema } = base;
  const [plaza] = (await consultas.listarObras(id2025)).filter((o) => o.slug === "plaza-del-barrio");
  assert.ok(plaza);

  // Uno mas viejo no cambia la etapa.
  await db.insert(schema.avances).values({
    ideaId: plaza.id,
    fecha: "2026-05-01",
    etapa: "licitacion",
    titulo: "Se licito",
    enlace: "https://comunicacionsmt.gob.ar/contenido/1/licitan",
  });
  // Dos del mismo dia: gana el ultimo.
  await db.insert(schema.avances).values({
    ideaId: plaza.id,
    fecha: "2026-09-01",
    etapa: "ejecucion",
    titulo: "Avanza",
  });
  await db.insert(schema.avances).values({
    ideaId: plaza.id,
    fecha: "2026-09-01",
    etapa: "finalizado",
    titulo: "Se termino",
    descripcion: "Se inauguro el 1 de septiembre.",
  });

  const [actual] = (await consultas.listarObras(id2025)).filter((o) => o.slug === "plaza-del-barrio");
  assert.equal(actual?.etapa, "finalizado");
  assert.equal(actual?.aclaracion, "Se inauguro el 1 de septiembre.");
  assert.equal(actual?.avances.length, 4);
  assert.equal(actual?.avances.at(-1)?.etapa, "licitacion", "el historial va del mas nuevo al mas viejo");
});

test("un avance sin publicar no cuenta", async () => {
  const { db, schema } = base;
  const [otra] = (await consultas.listarObras(id2025)).filter((o) => o.slug === "solo-en-2025");
  assert.ok(otra);
  await db.insert(schema.avances).values({
    ideaId: otra.id,
    fecha: "2026-10-01",
    etapa: "adjudicada",
    titulo: "Borrador",
    publicado: false,
  });
  const [despues] = (await consultas.listarObras(id2025)).filter((o) => o.slug === "solo-en-2025");
  assert.equal(despues?.etapa, null);
});

test("el link de un avance: solo https y sin credenciales", () => {
  assert.ok(enlaceValido("https://comunicacionsmt.gob.ar/contenido/17580/licitan"));
  assert.ok(!enlaceValido("http://comunicacionsmt.gob.ar/contenido/17580"));
  assert.ok(!enlaceValido("javascript:alert(1)"));
  assert.ok(!enlaceValido("https://usuario:clave@ejemplo.com/"));
  assert.ok(!enlaceValido("https://localhost/x"));
  assert.ok(!enlaceValido("no es un link"));
  assert.ok(!enlaceValido(`https://ejemplo.com/${"a".repeat(500)}`));
});
