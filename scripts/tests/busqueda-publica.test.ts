/**
 * La busqueda de los vecinos (/proyectos?q=) y la del chat, que pasan por
 * `listarIdeas`, contra una base de verdad.
 *
 * Buscaba con un ILIKE pelado: "iluminacion", como se escribe desde el
 * celular, no encontraba "Iluminación de la plaza", ni "guemes" el barrio
 * "Güemes". Y `%` y `_` entraban como comodines: buscar "_" devolvia la
 * edicion entera.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cargarMinimo, crearBaseDePrueba, crearIdea, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("busqueda-publica");
  const minimo = await cargarMinimo(base, { etapa: "ideas" });
  edicionId = minimo.edicionId;
  // Se importa DESPUES de crear la base: src/db elige el driver al importarse.
  consultas = await import("../../src/db/queries");

  const { db, schema, sql } = base;
  const iluminacion = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "ILUMINACIÓN de la plaza Belgrano",
    slug: "iluminacion-plaza",
  });
  // El barrio como lo guardan las altas: el texto y su forma sin tildes.
  await db
    .update(schema.ideas)
    .set({ barrio: "Güemes", barrioNormalizado: "guemes", problema: "No hay césped." })
    .where(sql`${schema.ideas.id} = ${iluminacion}`);

  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Educación vial en la escuela",
    slug: "educacion-vial",
  });
  // Sin publicar: la busqueda no la ve, se escriba como se escriba.
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Iluminación sin publicar",
    slug: "iluminacion-sin-publicar",
    publicada: false,
  });
});

test.after(async () => {
  await base.cerrar();
});

async function slugs(texto: string): Promise<string[]> {
  const lista = await consultas.listarIdeas({ edicionId, texto });
  return lista.map((idea) => idea.slug).sort();
}

test("encuentra sin tildes lo que esta escrito con tildes, y al reves", async () => {
  assert.deepEqual(await slugs("iluminacion"), ["iluminacion-plaza"]);
  assert.deepEqual(await slugs("Iluminación"), ["iluminacion-plaza"]);
  assert.deepEqual(await slugs("ILUMINACION"), ["iluminacion-plaza"]);
  assert.deepEqual(await slugs("educacion"), ["educacion-vial"]);
  // En el problema, no solo en el titulo.
  assert.deepEqual(await slugs("cesped"), ["iluminacion-plaza"]);
});

test("el barrio se busca sin tildes contra barrio_normalizado", async () => {
  assert.deepEqual(await slugs("guemes"), ["iluminacion-plaza"]);
  assert.deepEqual(await slugs("Güemes"), ["iluminacion-plaza"]);
});

test("% y _ son letras, no comodines", async () => {
  assert.deepEqual(await slugs("_"), []);
  assert.deepEqual(await slugs("%"), []);
  assert.deepEqual(await slugs("plaza%belgrano"), []);
  // Lo que si esta escrito sigue apareciendo.
  assert.deepEqual(await slugs("plaza belgrano"), ["iluminacion-plaza"]);
});
