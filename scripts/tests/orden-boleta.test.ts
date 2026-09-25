/**
 * El orden de la boleta, probado contra una base de verdad.
 *
 * La boleta de /votar salia ordenada por votos: en cada distrito el que iba
 * ganando aparecia primero —el primer lugar de una boleta suma votos por estar
 * ahi— y el orden mismo le mostraba el ranking en vivo a quien votaba. Ahora
 * /votar pide `orden: "alfabetico"` a listarIdeas, y /proyectos y
 * /distritos/[numero] lo piden mientras la etapa es "votacion".
 *
 * Lo que se prueba es que ese orden no mire los votos, que sea el de un
 * diccionario en castellano (tildes, ñ, numeros) y que el orden de siempre no
 * haya cambiado para nadie que no lo pida.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cargarMinimo, crearBaseDePrueba, crearIdea, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("orden-boleta");
  const minimo = await cargarMinimo(base, { etapa: "votacion" });
  edicionId = minimo.edicionId;
  // Se importa DESPUES de crear la base: src/db elige el driver al importarse.
  consultas = await import("../../src/db/queries");

  // Los votos van al reves del alfabeto a proposito: si el orden los mirara,
  // la prueba lo veria enseguida.
  const ideas: Array<[titulo: string, slug: string, votos: number]> = [
    ["Zanja a cielo abierto", "zanja", 900],
    ["Ñandú de la plaza", "nandu", 800],
    ["Nueva vereda", "vereda", 700],
    ["Plaza 10 de Julio", "plaza-10", 600],
    ["Plaza 2 de Abril", "plaza-2", 500],
    ["Árbol para la escuela", "arbol", 400],
    ['"Club" del barrio', "club", 300],
    ["alumbrado público", "alumbrado", 200],
  ];
  for (const [titulo, slug, votos] of ideas) {
    await crearIdea(base, { edicionId, distrito: 1, titulo, slug, votos });
  }
  // Una de otro distrito, para que el filtro no se mezcle con el orden.
  await crearIdea(base, { edicionId, distrito: 2, titulo: "Aaa otro distrito", slug: "otro", votos: 1 });
});

test.after(async () => {
  await base.cerrar();
});

test("la boleta sale en orden alfabetico en castellano, sin mirar los votos", async () => {
  const boleta = await consultas.listarIdeas({
    edicionId,
    distrito: 1,
    estado: "factible",
    orden: "alfabetico",
  });
  assert.deepEqual(
    boleta.map((idea) => idea.slug),
    [
      // Sin distinguir mayusculas ni tildes: "alumbrado" y "Árbol" van con la A.
      "alumbrado",
      "arbol",
      // Las comillas del principio no cuentan: "Club" va con la C.
      "club",
      // La ñ es una letra aparte, despues de la n.
      "vereda",
      "nandu",
      // Los numeros se comparan como numeros: 2 antes que 10.
      "plaza-2",
      "plaza-10",
      "zanja",
    ],
  );
});

test("el orden por defecto no cambio: el mas votado primero", async () => {
  const lista = await consultas.listarIdeas({ edicionId, distrito: 1 });
  assert.equal(lista[0].slug, "zanja");
  assert.equal(lista.at(-1)?.slug, "alumbrado");
});

test("en alfabetico el tope se aplica despues de ordenar", async () => {
  // Con el LIMIT en SQL saldrian las primeras por id (las mas votadas, por
  // como se cargaron), no las primeras por titulo.
  const primeras = await consultas.listarIdeas({
    edicionId,
    distrito: 1,
    orden: "alfabetico",
    limite: 2,
  });
  assert.deepEqual(
    primeras.map((idea) => idea.slug),
    ["alumbrado", "arbol"],
  );
});

test("las listas publicas van en alfabetico solo mientras se vota", () => {
  assert.equal(consultas.ordenDeIdeasPara("votacion"), "alfabetico");
  for (const etapa of ["ideas", "evaluacion", "seguimiento", "cerrada"] as const) {
    assert.equal(consultas.ordenDeIdeasPara(etapa), "votos", etapa);
  }
});

test("la pagina del distrito respeta el orden que se le pide", async () => {
  const distrito = await consultas.getDistrito(1, edicionId, { orden: "alfabetico" });
  assert.equal(distrito?.ideas[0].slug, "alumbrado");
  const porVotos = await consultas.getDistrito(1, edicionId);
  assert.equal(porVotos?.ideas[0].slug, "zanja");
});
