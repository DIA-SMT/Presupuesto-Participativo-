/**
 * Que una edicion anterior siga navegable con otra activa.
 *
 * Antes de esto todo el sitio leia solo la edicion activa: al activarse la 2026,
 * la 2025 (con sus ganadores, que son las obras que se estan ejecutando)
 * quedaba fuera de la navegacion y del sitemap, y si una idea 2026 repetia el
 * slug de una 2025, una de las dos no se podia abrir.
 *
 * Se prueban las consultas (src/db/queries.ts, seccion "Ediciones anteriores"),
 * lo que usan las paginas (src/lib/edicion-en-vista.ts), el sitemap y los datos
 * abiertos, sobre el escenario de apoyo-ediciones.ts. Lo del chat esta en
 * chat-ediciones.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";
import { cargarDosEdiciones } from "./apoyo-ediciones";

let base: BaseDePrueba;
let id2026: number;
let id2025: number;
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("ediciones-anteriores");
  ({ id2025, id2026 } = await cargarDosEdiciones(base));
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

// ---------------------------------------------------------------------------
// La edicion pedida
// ---------------------------------------------------------------------------

test("sin año es la activa; con año, esa edicion aunque no este activa", async () => {
  const activa = await consultas.getEdicionParaVer(null);
  assert.equal(activa?.anio, 2026);
  assert.equal(activa?.activa, true);

  const anterior = await consultas.getEdicionParaVer(2025);
  assert.equal(anterior?.anio, 2025);
  assert.equal(anterior?.activa, false);
  assert.equal(anterior?.etapa, "seguimiento");
  assert.equal(anterior?.anioActiva, 2026, "el aviso necesita saber cual es la actual");

  assert.equal(await consultas.getEdicionParaVer(1999), null);
});

test("las paginas: un año que no existe o algo que no es un año es 404", async () => {
  const { edicionDeLaPagina, resolverEdicion } = await import("../../src/lib/edicion-en-vista");

  const activa = await resolverEdicion(undefined);
  assert.equal(activa.tipo, "vista");
  assert.equal(activa.tipo === "vista" && activa.vista.anioEnEnlaces, null);

  const anterior = await resolverEdicion("2025");
  assert.equal(anterior.tipo === "vista" && anterior.vista.anioEnEnlaces, 2025);

  // La activa pedida por su año es la activa: sus enlaces van sin parametro.
  const activaPorAnio = await resolverEdicion("2026");
  assert.equal(activaPorAnio.tipo === "vista" && activaPorAnio.vista.anioEnEnlaces, null);

  for (const valor of ["abc", "1999", ["2025", "2026"]]) {
    assert.equal((await resolverEdicion(valor)).tipo, "no-existe", JSON.stringify(valor));
    await assert.rejects(
      () => edicionDeLaPagina(valor),
      (error: unknown) => String((error as { digest?: string }).digest).includes("404"),
      `${JSON.stringify(valor)} tiene que dar 404`,
    );
  }
});

// ---------------------------------------------------------------------------
// La ficha
// ---------------------------------------------------------------------------

test("un slug repetido entre ediciones abre las dos fichas", async () => {
  const deLaActiva = await consultas.getIdea("plaza-del-barrio");
  assert.equal(deLaActiva?.anio, 2026, "sin edicion, la activa primero");

  const de2025 = await consultas.getIdea("plaza-del-barrio", id2025);
  assert.equal(de2025?.anio, 2025);
  assert.equal(de2025?.ganador, true);

  const de2026 = await consultas.getIdea("plaza-del-barrio", id2026);
  assert.equal(de2026?.anio, 2026);
});

test("un enlace viejo sin edicion sigue abriendo la ficha de 2025", async () => {
  // La 2026 tiene el mismo slug SIN publicar: no tapa a la publicada de 2025.
  const ficha = await consultas.getIdea("solo-en-2025");
  assert.equal(ficha?.anio, 2025);
  assert.equal(ficha?.publicada, true);

  // Con la edicion pedida, esa y ninguna otra.
  assert.equal(await consultas.getIdea("solo-en-2025", id2026), null);
  assert.equal(await consultas.getIdea("no-existe"), null);
  // Lo que no esta publicado no existe para el sitio, en ninguna edicion.
  assert.equal(await consultas.getIdea("sin-publicar-2025"), null);
});

// ---------------------------------------------------------------------------
// Archivo, sitemap y la ultima edicion que voto
// ---------------------------------------------------------------------------

test("el archivo cuenta lo que se ve: ideas y ganadores publicados", async () => {
  const archivo = await consultas.getArchivoDeEdiciones();
  assert.deepEqual(
    archivo.map((e) => [e.anio, e.activa, e.ideas, e.ganadores]),
    [
      [2027, false, 0, 0],
      [2026, true, 2, 0],
      [2025, false, 3, 2],
    ],
  );
});

test("la ultima edicion que voto trae sus ganadores y el estado de obra informado", async () => {
  const ultima = await consultas.getUltimaEdicionTerminadaConGanadores();
  assert.equal(ultima?.anio, 2025, "la 2026 esta en ideas: todavia no voto");
  assert.equal(ultima?.activa, false);
  assert.deepEqual(
    ultima?.ganadores.map((g) => [g.distrito, g.slug, g.estadoObra, g.avancesPublicados]),
    [
      [1, "plaza-del-barrio", "ejecucion", 1],
      // Sin avances, el estado de la columna no se da por informado.
      [2, "solo-en-2025", null, 0],
    ],
  );
  assert.equal(ultima?.ganadores[0].ultimoAvance, "2026-08-01");
});

test("el sitemap tiene las fichas de las dos ediciones, cada una con su URL", async () => {
  const { default: sitemap } = await import("../../src/app/sitemap");
  const urls = (await sitemap()).map((entrada) => entrada.url.replace(/^https?:\/\/[^/]+/, ""));

  assert.ok(urls.includes("/proyectos/plaza-del-barrio"), "la de la activa, sin parametro");
  assert.ok(urls.includes("/proyectos/plaza-del-barrio?edicion=2025"));
  assert.ok(urls.includes("/proyectos/solo-en-2025?edicion=2025"));
  assert.ok(!urls.some((url) => url.includes("sin-publicar")), "nada sin publicar");
  assert.ok(!urls.includes("/proyectos/solo-en-2025"), "la de 2026 no esta publicada");
});

// ---------------------------------------------------------------------------
// Datos abiertos
// ---------------------------------------------------------------------------

test("/api/proyectos acepta ?edicion y rechaza lo que no es una edicion", async () => {
  const { GET } = await import("../../src/app/api/proyectos/route");
  const pedir = (consulta: string) => GET(new Request(`http://localhost/api/proyectos${consulta}`));

  const vigenteJson = await (await pedir("")).json();
  assert.equal(vigenteJson.edicion, 2026);
  assert.equal(vigenteJson.vigente, true);

  const respuesta = await pedir("?edicion=2025");
  assert.equal(respuesta.status, 200);
  const json = await respuesta.json();
  assert.equal(json.edicion, 2025);
  assert.equal(json.vigente, false);
  assert.ok(
    json.proyectos.every((p: { url: string }) => p.url.endsWith("?edicion=2025")),
    "las url de otra edicion llevan su año",
  );

  assert.equal((await pedir("?edicion=1999")).status, 404);
  assert.equal((await pedir("?edicion=abc")).status, 400);
  assert.equal((await pedir("?edicion=2025&edicion=2026")).status, 400);
});

test("/api/proyectos: los errores tambien llevan CORS, para que se lea el motivo", async () => {
  const { GET } = await import("../../src/app/api/proyectos/route");
  const pedir = (consulta: string) => GET(new Request(`http://localhost/api/proyectos${consulta}`));

  // Un sistema de otro dominio que pide un año que no hay recibe el 404, pero
  // sin la cabecera el navegador le esconde el cuerpo y no sabe por que fallo.
  for (const consulta of ["?edicion=1999", "?edicion=abc", "?edicion=2025&formato=csv"]) {
    const respuesta = await pedir(consulta);
    assert.equal(respuesta.headers.get("access-control-allow-origin"), "*", consulta);
  }
  assert.match((await (await pedir("?edicion=1999")).json()).error, /No hay una edición 1999/);
});
