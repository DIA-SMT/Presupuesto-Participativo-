/**
 * El panorama de la bandeja (`getPanoramaBandeja`) y los filtros nuevos del
 * listado (categoria, sin publicar, con contacto), contra una base de verdad.
 *
 * Lo que se fija:
 *  - cada bloque se cuenta SIN su propia dimension y CON las demas, asi que el
 *    numero de la tarjeta elegida es siempre el total del listado;
 *  - las tres cuentas de trabajo son interruptores independientes;
 *  - las descartadas quedan afuera de todo salvo de su propia clave;
 *  - los filtros nuevos listan lo que dicen, y el mail del autor sigue sin
 *    salir de la base.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cargarMinimo,
  crearBaseDePrueba,
  crearIdea,
  type BaseDePrueba,
} from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let consultas: typeof import("../../src/db/queries");

/** Los ids de las ocho ideas, por su letra en el cuadro de abajo. */
const idea: Record<string, number> = {};

/**
 * El universo, chico para que entre en la cabeza:
 *
 *   letra  distrito  estado        categoria   publicada  mail  devolucion
 *   a      1         pendiente     urbana      no         si    -
 *   b      1         factible      urbana      si         -     -
 *   c      1         factible      ambiental   si         -     -
 *   d      1         no_factible   ambiental   si         si    FALTA
 *   e      2         pendiente     ambiental   no         -     -
 *   f      2         no_factible   urbana      si         -     escrita
 *   g      2         integrado     (ninguna)   si         -     FALTA
 *   h      2         descartado    urbana      no         -     "spam"
 */
test.before(async () => {
  base = await crearBaseDePrueba("bandeja-panorama");
  const minimo = await cargarMinimo(base, { etapa: "evaluacion" });
  edicionId = minimo.edicionId;
  const urbana = minimo.categoriaId;
  const [ambiental] = await base.db
    .insert(base.schema.categorias)
    .values({
      slug: "socio-ambiental",
      nombre: "Socio-ambiental",
      descripcion: "Plazas y espacios verdes",
      color: "#2f9e5f",
      orden: 2,
    })
    .returning({ id: base.schema.categorias.id });
  // Despues de crear la base: src/db elige el driver al importarse.
  consultas = await import("../../src/db/queries");

  const { eq } = await import("drizzle-orm");
  const alta = async (
    letra: string,
    datos: {
      distrito: number;
      estado: "pendiente" | "factible" | "no_factible" | "integrado";
      titulo: string;
      categoriaId: number | null;
      publicada?: boolean;
      autorEmail?: string;
      motivoEstado?: string;
      descartada?: boolean;
    },
  ) => {
    const id = await crearIdea(base, {
      edicionId,
      distrito: datos.distrito,
      titulo: datos.titulo,
      slug: `idea-${letra}`,
      estado: datos.estado,
      publicada: datos.publicada ?? true,
    });
    await base.db
      .update(base.schema.ideas)
      .set({
        categoriaId: datos.categoriaId,
        autorEmail: datos.autorEmail ?? null,
        motivoEstado: datos.motivoEstado ?? null,
        ...(datos.descartada ? { estado: "descartado" as const } : {}),
      })
      .where(eq(base.schema.ideas.id, id));
    idea[letra] = id;
  };

  await alta("a", {
    distrito: 1,
    estado: "pendiente",
    titulo: "Luminarias en la esquina",
    categoriaId: urbana,
    publicada: false,
    autorEmail: "a@ejemplo.test",
  });
  await alta("b", { distrito: 1, estado: "factible", titulo: "Bicisenda del parque", categoriaId: urbana });
  await alta("c", { distrito: 1, estado: "factible", titulo: "Plaza con árboles", categoriaId: ambiental.id });
  await alta("d", {
    distrito: 1,
    estado: "no_factible",
    titulo: "Plazoleta del barrio",
    categoriaId: ambiental.id,
    autorEmail: "d@ejemplo.test",
  });
  await alta("e", {
    distrito: 2,
    estado: "pendiente",
    titulo: "Rampas en la vereda",
    categoriaId: ambiental.id,
    publicada: false,
  });
  await alta("f", {
    distrito: 2,
    estado: "no_factible",
    titulo: "Pavimento en el pasaje",
    categoriaId: urbana,
    motivoEstado: "El pasaje es un terreno privado.",
  });
  await alta("g", { distrito: 2, estado: "integrado", titulo: "Cancha integrada", categoriaId: null });
  await alta("h", {
    distrito: 2,
    estado: "pendiente",
    titulo: "asdf prueba",
    categoriaId: urbana,
    publicada: false,
    motivoEstado: "Spam.",
    descartada: true,
  });
});

test.after(async () => {
  await base.cerrar();
});

test("sin filtro, el panorama es la foto de la edicion: descartadas afuera salvo en su clave", async () => {
  const foto = await consultas.getPanoramaBandeja({ edicionId });
  assert.equal(foto.total, 7);
  assert.deepEqual(foto.porEstado, {
    borrador: 0,
    pendiente: 2,
    factible: 2,
    no_factible: 2,
    integrado: 1,
    ganador: 0,
    descartado: 1,
  });
  assert.deepEqual(
    foto.porDistrito.map((distrito) => [distrito.numero, distrito.total]),
    [
      [1, 4],
      [2, 3],
    ],
  );
  assert.equal(foto.porDistrito[0].porEstado.factible, 2);
  assert.equal(foto.porDistrito[1].porEstado.descartado, 0, "la descartada no se dibuja en su distrito");
  assert.equal(foto.sinDistrito, 0);
  assert.deepEqual(
    foto.porCategoria.map((categoria) => [categoria.slug, categoria.cantidad]),
    [
      ["urbana", 3],
      ["socio-ambiental", 3],
    ],
  );
  assert.equal(foto.sinCategoria, 1);
  assert.deepEqual(foto.trabajo, { sinDevolucion: 2, sinPublicar: 2, conContacto: 2 });

  const resumen = await consultas.getResumenBandeja(edicionId);
  assert.equal(resumen.total, foto.total, "la misma cuenta que la de la edicion");
  assert.deepEqual(resumen.porEstado, foto.porEstado);
});

test("cada bloque se cuenta sin su propia dimension y con las demas", async () => {
  const porEstado = await consultas.getPanoramaBandeja({ edicionId, estado: "factible" });
  assert.equal(porEstado.total, 7, "las tarjetas por estado ignoran el estado elegido");
  assert.equal(porEstado.porEstado.factible, 2);
  assert.deepEqual(
    porEstado.porDistrito.map((distrito) => distrito.total),
    [2, 0],
    "las columnas si siguen al estado",
  );
  assert.deepEqual(
    porEstado.porCategoria.map((categoria) => categoria.cantidad),
    [1, 1],
  );
  assert.equal(porEstado.sinCategoria, 0);
  assert.deepEqual(porEstado.trabajo, { sinDevolucion: 0, sinPublicar: 0, conContacto: 0 });

  const porDistrito = await consultas.getPanoramaBandeja({ edicionId, distrito: 1 });
  assert.equal(porDistrito.total, 4);
  assert.deepEqual(porDistrito.porEstado, {
    borrador: 0,
    pendiente: 1,
    factible: 2,
    no_factible: 1,
    integrado: 0,
    ganador: 0,
    descartado: 0,
  });
  assert.deepEqual(
    porDistrito.porDistrito.map((distrito) => distrito.total),
    [4, 3],
    "las columnas ignoran el distrito elegido",
  );
  assert.deepEqual(
    porDistrito.porCategoria.map((categoria) => categoria.cantidad),
    [2, 2],
  );
  assert.deepEqual(porDistrito.trabajo, { sinDevolucion: 1, sinPublicar: 1, conContacto: 2 });

  const porTexto = await consultas.getPanoramaBandeja({ edicionId, texto: "plaz" });
  assert.equal(porTexto.total, 2, "la busqueda acota todos los bloques");
  assert.equal(porTexto.porEstado.factible, 1);
  assert.equal(porTexto.porEstado.no_factible, 1);
});

test("la tarjeta elegida muestra el mismo numero que el total del listado", async () => {
  const foto = await consultas.getPanoramaBandeja({ edicionId });
  const listados = await Promise.all([
    consultas.listarIdeasBandeja({ edicionId, estado: "factible" }),
    consultas.listarIdeasBandeja({ edicionId, distrito: 2 }),
    consultas.listarIdeasBandeja({ edicionId, categoria: "urbana" }),
    consultas.listarIdeasBandeja({ edicionId, sinDevolucion: true }),
    consultas.listarIdeasBandeja({ edicionId, sinPublicar: true }),
    consultas.listarIdeasBandeja({ edicionId, conContacto: true }),
  ]);
  assert.deepEqual(
    listados.map((listado) => listado.total),
    [
      foto.porEstado.factible,
      foto.porDistrito[1].total,
      foto.porCategoria[0].cantidad,
      foto.trabajo.sinDevolucion,
      foto.trabajo.sinPublicar,
      foto.trabajo.conContacto,
    ],
  );

  // Con un filtro puesto, lo que dicen las otras tarjetas es el listado combinado.
  const enDistrito1 = await consultas.getPanoramaBandeja({ edicionId, distrito: 1 });
  const factibles = await consultas.listarIdeasBandeja({ edicionId, distrito: 1, estado: "factible" });
  assert.equal(factibles.total, enDistrito1.porEstado.factible);
  const ambientales = await consultas.listarIdeasBandeja({
    edicionId,
    distrito: 1,
    categoria: "socio-ambiental",
  });
  assert.equal(ambientales.total, enDistrito1.porCategoria[1].cantidad);
});

test("las cuentas de trabajo son interruptores independientes", async () => {
  const conDeuda = await consultas.getPanoramaBandeja({ edicionId, sinDevolucion: true });
  assert.equal(conDeuda.trabajo.sinDevolucion, 2, "la propia se cuenta sin su filtro");
  assert.equal(conDeuda.trabajo.sinPublicar, 0, "ninguna sin devolucion esta sin publicar");
  assert.equal(conDeuda.trabajo.conContacto, 1, "entre las sin devolucion, solo la d tiene mail");
  assert.deepEqual(conDeuda.porEstado, {
    borrador: 0,
    pendiente: 0,
    factible: 0,
    no_factible: 1,
    integrado: 1,
    ganador: 0,
    descartado: 0,
  });
  assert.equal(conDeuda.total, 2);

  const dos = await consultas.getPanoramaBandeja({ edicionId, sinDevolucion: true, conContacto: true });
  assert.equal(dos.trabajo.sinDevolucion, 1);
  assert.equal(dos.trabajo.conContacto, 1);
  assert.equal(dos.trabajo.sinPublicar, 0);
  const listado = await consultas.listarIdeasBandeja({ edicionId, sinDevolucion: true, conContacto: true });
  assert.deepEqual(
    listado.filas.map((fila) => fila.id),
    [idea.d],
  );
});

test("los filtros nuevos listan lo que dicen, y el mail no sale", async () => {
  const urbanas = await consultas.listarIdeasBandeja({ edicionId, categoria: "urbana" });
  assert.deepEqual(
    urbanas.filas.map((fila) => fila.id).sort((a, b) => a - b),
    [idea.a, idea.b, idea.f].sort((a, b) => a - b),
    "la descartada urbana no viene",
  );
  const sinPublicar = await consultas.listarIdeasBandeja({ edicionId, categoria: "urbana", sinPublicar: true });
  assert.deepEqual(
    sinPublicar.filas.map((fila) => fila.id),
    [idea.a],
  );
  const conContacto = await consultas.listarIdeasBandeja({ edicionId, conContacto: true });
  assert.deepEqual(
    conContacto.filas.map((fila) => fila.id).sort((a, b) => a - b),
    [idea.a, idea.d].sort((a, b) => a - b),
  );
  for (const fila of conContacto.filas) {
    assert.equal(fila.tieneContacto, true);
    assert.ok(!("autorEmail" in fila), "el mail no viaja en la fila");
    assert.ok(!Object.values(fila).some((valor) => String(valor).includes("@ejemplo.test")));
  }
  const inexistente = await consultas.listarIdeasBandeja({ edicionId, categoria: "no-existe" });
  assert.equal(inexistente.total, 0);
});

test("las descartadas solo aparecen al pedirlas, tambien en el panorama", async () => {
  const descartadas = await consultas.getPanoramaBandeja({ edicionId, estado: "descartado" });
  assert.deepEqual(
    descartadas.porDistrito.map((distrito) => distrito.total),
    [0, 1],
  );
  assert.equal(descartadas.porDistrito[1].porEstado.descartado, 1);
  assert.deepEqual(
    descartadas.porCategoria.map((categoria) => categoria.cantidad),
    [1, 0],
  );
  assert.equal(descartadas.trabajo.sinPublicar, 1, "la descartada esta sin publicar");
  assert.equal(descartadas.trabajo.sinDevolucion, 0);
});
