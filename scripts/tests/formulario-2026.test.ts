/**
 * El formulario de propuesta 2026 y el presupuesto estimado (migracion 0016),
 * probados contra una base de verdad.
 *
 * Lo que se fija aca:
 *  - la idea guarda lo minimo que se decidio: la organizacion, un telefono y
 *    las referencias escritas del lugar, sin categoria;
 *  - la purga de contactos borra el telefono con el nombre y el mail;
 *  - el telefono nunca sale por una consulta publica;
 *  - la bandeja encuentra una idea por el codigo del papel (D05-P012) y ordena
 *    por el presupuesto estimado con las que no lo tienen al final;
 *  - el codigo de la propuesta se arma igual en todos lados.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { codigoDePropuesta } from "../../src/lib/formato";
import { cargarMinimo, crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let alta: typeof import("../../src/lib/alta-idea");
let consultas: typeof import("../../src/db/queries");
let purga: typeof import("../purga-contactos");

const HOY = "2026-09-25";
/** Un punto del distrito 1 sobre la geometria oficial. */
const D1 = { lat: -26.7965902, lon: -65.2515113 };

test.before(async () => {
  base = await crearBaseDePrueba("formulario-2026");
  const minimo = await cargarMinimo(base, { etapa: "ideas" });
  edicionId = minimo.edicionId;

  alta = await import("../../src/lib/alta-idea");
  consultas = await import("../../src/db/queries");
  purga = await import("../purga-contactos");
});

test.after(async () => {
  await base.cerrar();
});

/**
 * Una idea con todo lo que pide el formulario 2026, creada por la misma puerta
 * que el sitio (crearIdea de src/lib/alta-idea.ts).
 */
async function cargar(cambios: { titulo?: string; organizacion?: string | null } = {}) {
  const resultado = await alta.crearIdea(
    {
      edicionId,
      titulo: cambios.titulo ?? "Luz para la plaza del barrio",
      barrio: "Villa Luján",
      referenciasUbicacion: "Frente a la escuela, en la esquina de la canchita.",
      problema: "La plaza queda a oscuras de noche y los vecinos dejaron de usarla.",
      solucion: "Poner luminarias LED en todo el perímetro de la plaza y en los senderos.",
      organizacion: cambios.organizacion === undefined ? "Centro Vecinal Villa Luján" : cambios.organizacion,
      autorNombre: "Juana Pérez",
      autorTelefono: "381 555-1234",
      lat: D1.lat,
      lon: D1.lon,
      canal: "web",
      fecha: HOY,
    },
    { etapaPermitida: () => null },
  );
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.mensaje);
  return resultado;
}

async function filaDe(id: number) {
  const { eq } = await import("drizzle-orm");
  const [fila] = await base.db
    .select()
    .from(base.schema.ideas)
    .where(eq(base.schema.ideas.id, id));
  return fila;
}

test("el codigo de la propuesta es D + distrito y P + numero, con ceros", () => {
  assert.equal(codigoDePropuesta(5, 12), "D05-P012");
  assert.equal(codigoDePropuesta(14, 7), "D14-P007");
  assert.equal(codigoDePropuesta(null, 3), "D---P003", "sin distrito, guiones");
  assert.equal(codigoDePropuesta(2, 1234), "D02-P1234");
});

test("guarda lo minimo: la organizacion, un telefono y las referencias, sin categoria", async () => {
  const idea = await cargar();
  const fila = await filaDe(idea.id);
  assert.equal(fila.organizacion, "Centro Vecinal Villa Luján");
  assert.equal(fila.autorTelefono, "381 555-1234", "el telefono se guarda como lo escribio");
  assert.equal(fila.referenciasUbicacion, "Frente a la escuela, en la esquina de la canchita.");
  assert.equal(fila.categoriaId, null, "la categoria la asigna quien evalua");
  assert.equal(fila.autorDniHash, null, "la columna del papel ya no se escribe");
});

test("la purga de contactos borra el telefono con el nombre", async () => {
  const idea = await cargar({ titulo: "Una idea con teléfono para purgar" });
  const anio = (await consultas.getEdicionActiva())!.anio;
  const consultar = <T extends Record<string, unknown>>(consulta: import("drizzle-orm").SQL) =>
    base.consultar<T>(consulta);
  await purga.aplicarPurga(consultar, { anio, idea: idea.numero, edicionEntera: false });
  const fila = await filaDe(idea.id);
  assert.equal(fila.autorTelefono, null);
  assert.equal(fila.autorNombre, null);
  assert.ok(fila.contactoPurgadoEn);
});

test("ninguna consulta publica devuelve el telefono ni la organizacion", async () => {
  const idea = await cargar({ titulo: "Una idea publicada con teléfono" });
  const { eq } = await import("drizzle-orm");
  await base.db
    .update(base.schema.ideas)
    .set({ publicada: true, estado: "factible" })
    .where(eq(base.schema.ideas.id, idea.id));
  const publica = await consultas.getIdea((await filaDe(idea.id)).slug);
  const texto = JSON.stringify(publica);
  assert.ok(!texto.includes("555-1234"), "el telefono no sale");
  assert.ok(!texto.includes("Centro Vecinal"), "la organizacion no sale");
  assert.ok(texto.includes("Frente a la escuela"), "las referencias del lugar si");
});

test("la bandeja encuentra por el codigo de la propuesta y ordena por presupuesto estimado", async () => {
  const cara = await cargar({ titulo: "Una obra cara para ordenar" });
  const barata = await cargar({ titulo: "Una obra barata para ordenar" });
  const sinEstimar = await cargar({ titulo: "Una obra que nadie estimó" });
  const { eq } = await import("drizzle-orm");
  await base.db
    .update(base.schema.ideas)
    .set({ presupuestoEstimado: "90000000.00" })
    .where(eq(base.schema.ideas.id, cara.id));
  await base.db
    .update(base.schema.ideas)
    .set({ presupuestoEstimado: "1500000.00" })
    .where(eq(base.schema.ideas.id, barata.id));

  for (const texto of [`D01-P${String(barata.numero).padStart(3, "0")}`, `p${barata.numero}`, `#${barata.numero}`]) {
    const { filas } = await consultas.listarIdeasBandeja({ edicionId, texto });
    assert.ok(filas.some((fila) => fila.id === barata.id), texto);
  }

  const ids = [cara.id, barata.id, sinEstimar.id];
  const enOrden = async (dir: "asc" | "desc") =>
    (await consultas.listarIdeasBandeja({ edicionId, orden: "presupuesto", dir })).filas
      .map((fila) => fila.id)
      .filter((id) => ids.includes(id));
  assert.deepEqual(await enOrden("desc"), [cara.id, barata.id, sinEstimar.id]);
  assert.deepEqual(
    await enOrden("asc"),
    [barata.id, cara.id, sinEstimar.id],
    "sin estimacion va al final tambien de menor a mayor",
  );
});
