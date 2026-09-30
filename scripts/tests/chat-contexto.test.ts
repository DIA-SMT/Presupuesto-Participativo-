/**
 * Lo que Migue lee del sitio (src/lib/chat-contexto.ts) y la herramienta
 * `consultar_reglamento`, contra una base de verdad: los textos se cargan como
 * los carga el panel, en la tabla `textos`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cargarMinimo, crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let contexto: typeof import("../../src/lib/chat-contexto");
let herramientas: typeof import("../../src/lib/chat-herramientas");
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("chat-contexto");
  const { edicionId } = await cargarMinimo(base, { etapa: "votacion" });
  const { db, schema, sql } = base;
  await db
    .update(schema.ediciones)
    // Una votacion que termina lejos en el futuro: la fecha no puede haber pasado.
    .set({ votacionDesde: "2030-12-02", votacionHasta: "2030-12-04" })
    .where(sql`${schema.ediciones.id} = ${edicionId}`);
  contexto = await import("../../src/lib/chat-contexto");
  herramientas = await import("../../src/lib/chat-herramientas");
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

async function guardarTexto(clave: string, valor: string) {
  const { db, schema } = base;
  await db
    .insert(schema.textos)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: schema.textos.clave, set: { valor } });
}

async function vigente() {
  const edicion = await consultas.getEdicionActiva();
  assert.ok(edicion);
  return edicion;
}

async function reglamento(consulta: string) {
  const resultado = await herramientas.ejecutarHerramienta(
    "consultar_reglamento",
    { consulta },
    await vigente(),
  );
  return { ...resultado, datos: JSON.parse(resultado.contenido) };
}

test("el contexto dice el momento y las fechas de la edicion, como la portada", async () => {
  const ctx = await contexto.contextoDelSitio(await vigente());
  assert.match(ctx.momento, /la votación está abierta hasta el 4 de diciembre de 2030/);
  assert.equal(ctx.acciones[0].href, "/votar");
  assert.match(ctx.fechasVotacion ?? "", /2 de diciembre de 2030/);
  assert.equal(ctx.fechasIdeas, null, "sin fechas de ideas cargadas");
  assert.equal(ctx.aviso, null);
});

test("el aviso urgente llega al chat, y un aviso vacio es no tener aviso", async () => {
  await guardarTexto("aviso-urgente", "La votación se extiende hasta el viernes.");
  let ctx = await contexto.contextoDelSitio(await vigente());
  assert.equal(ctx.aviso, "La votación se extiende hasta el viernes.");
  assert.match(contexto.contextoParaElModelo(ctx), /Aviso urgente publicado arriba de todo el sitio/);

  await guardarTexto("aviso-urgente", "   ");
  ctx = await contexto.contextoDelSitio(await vigente());
  assert.equal(ctx.aviso, null);
  assert.doesNotMatch(contexto.contextoParaElModelo(ctx), /Aviso urgente/);
});

test("sin reglamento cargado, la herramienta trae las reglas confirmadas y avisa que falta", async () => {
  const { datos, sinDatos, referencias } = await reglamento("edad para votar");
  assert.equal(datos.publicado, false);
  assert.ok(datos.reglas_confirmadas.some((r: { titulo: string }) => r.titulo === "Un voto por persona"));
  assert.match(datos.aviso, /no deducirlo/);
  assert.equal(sinDatos, true, "la regla puntual le falta al sitio: va a /admin/migue");
  assert.deepEqual(referencias, [{ titulo: "Reglamento", url: "/reglamento" }]);
});

test("con un reglamento corto, la herramienta lo devuelve entero", async () => {
  await guardarTexto(
    "reglamento-cuerpo",
    "Artículo 1. Pueden votar las personas mayores de 16 años.\r\n\r\nArtículo 2. Hay un voto por persona.",
  );
  const { datos, sinDatos } = await reglamento("edad para votar");
  assert.equal(datos.publicado, true);
  assert.equal(datos.reglamento_entero, true);
  assert.equal(datos.total_parrafos, 2);
  assert.equal(sinDatos, undefined);

  // Y el modelo deja de recibir las reglas confirmadas: manda el reglamento.
  const ctx = await contexto.contextoDelSitio(await vigente());
  const instrucciones = contexto.contextoParaElModelo(ctx);
  assert.match(instrucciones, /usá consultar_reglamento/);
  assert.doesNotMatch(instrucciones, /reglas confirmadas/);
});

test("con un reglamento largo, solo los parrafos que tienen que ver", async () => {
  const relleno = Array.from(
    { length: 80 },
    (_, i) => `Artículo ${i + 10}. Disposición administrativa número ${i} sobre plazos internos del programa.`,
  );
  await guardarTexto(
    "reglamento-cuerpo",
    ["Artículo 1. Pueden votar las personas mayores de 16 años.", ...relleno].join("\n"),
  );
  const { datos } = await reglamento("¿desde qué edad se puede votar?");
  assert.equal(datos.reglamento_entero, false);
  assert.equal(datos.total_parrafos, 81);
  assert.ok(datos.parrafos.length <= 8);
  assert.equal(datos.parrafos[0].numero, 1);
  assert.match(datos.parrafos[0].texto, /mayores de 16/);

  const nada = await reglamento("mascotas");
  assert.equal(nada.datos.encontrado, false);
  assert.equal(nada.sinDatos, true);
});
