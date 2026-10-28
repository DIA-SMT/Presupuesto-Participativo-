/**
 * El formulario de propuesta 2026 y el presupuesto estimado (migracion 0016),
 * probados contra una base de verdad.
 *
 * Lo que se fija aca:
 *  - la carga del papel guarda lo minimo que se decidio: el nombre, la
 *    organizacion (solo si se marco "Sí"), un telefono y el DNI SOLO hasheado;
 *  - el DNI de un papel ata la idea al padron, ya sea porque la persona estaba
 *    empadronada o porque entra despues con CIDITUC;
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
let operaciones: typeof import("../../src/app/admin/ideas/operaciones");
let consultas: typeof import("../../src/db/queries");
let empadronamiento: typeof import("../../src/lib/empadronamiento");
let purga: typeof import("../purga-contactos");
let sesion: import("../../src/app/admin/comun").Autorizacion;

const HOY = "2026-09-25";
/** Un punto del distrito 1 sobre la geometria oficial. */
const D1 = { lat: "-26.7965902", lon: "-65.2515113" };

test.before(async () => {
  base = await crearBaseDePrueba("formulario-2026");
  const minimo = await cargarMinimo(base, { etapa: "ideas" });
  edicionId = minimo.edicionId;

  const [cuenta] = await base.db
    .insert(base.schema.admins)
    .values({
      email: "equipo@smt.gob.ar",
      nombre: "Equipo de prueba",
      passwordHash: "no-se-usa",
      rol: "moderador",
    })
    .returning({ id: base.schema.admins.id });
  sesion = {
    adminId: cuenta.id,
    email: "equipo@smt.gob.ar",
    nombre: "Equipo de prueba",
    rol: "moderador",
    version: 0,
  };

  operaciones = await import("../../src/app/admin/ideas/operaciones");
  consultas = await import("../../src/db/queries");
  empadronamiento = await import("../../src/lib/empadronamiento");
  purga = await import("../purga-contactos");
});

test.after(async () => {
  await base.cerrar();
});

/** Lo que manda la pantalla de carga, copiado de un papel en regla. */
function papel(cambios: Record<string, string> = {}): Record<string, string> {
  return {
    canal: "asamblea",
    canalDetalle: "Asamblea del distrito 1, 12/09/2026",
    fecha: "2026-09-12",
    autorNombre: "Juana Pérez",
    dni: "30.123.456",
    autorTelefono: "381 555-1234",
    conOrganizacion: "1",
    organizacion: "Centro Vecinal Villa Luján",
    problema: "La plaza queda a oscuras de noche y los vecinos dejaron de usarla.",
    referenciasUbicacion: "Frente a la escuela, en la esquina de la canchita.",
    solucion: "Poner luminarias LED en todo el perímetro de la plaza y en los senderos.",
    beneficios: "",
    titulo: "Luz para la plaza del barrio",
    ...D1,
    ...cambios,
  };
}

async function cargar(cambios: Record<string, string> = {}) {
  const resultado = await operaciones.registrarAlta(papel(cambios), sesion, HOY);
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.error);
  return resultado.idea;
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

test("el papel guarda lo minimo: el DNI solo hasheado, nunca en claro", async () => {
  const idea = await cargar();
  const fila = await filaDe(idea.id);

  assert.equal(fila.organizacion, "Centro Vecinal Villa Luján");
  assert.equal(fila.autorTelefono, "381 555-1234", "el telefono se guarda como lo escribio");
  assert.equal(fila.referenciasUbicacion, "Frente a la escuela, en la esquina de la canchita.");
  assert.equal(fila.categoriaId, null, "la categoria la asigna quien evalua");
  assert.equal(fila.autorDniHash, empadronamiento.hashearDni("30123456"));
  // Ninguna columna de la fila tiene el numero en claro.
  assert.ok(!JSON.stringify(fila).includes("30123456"), "el DNI no queda en claro");
  assert.ok(!JSON.stringify(fila).includes("30.123.456"), "ni con puntos");
});

test("sin marcar la organizacion, el nombre escrito no se guarda", async () => {
  const idea = await cargar({ conOrganizacion: "0", titulo: "Una idea sin organización" });
  assert.equal((await filaDe(idea.id)).organizacion, null);
});

test("el DNI de un papel ata la idea al padron, antes o despues de empadronarse", async () => {
  // Ya empadronada: la idea queda atada al cargarla.
  const { votanteId: yaEstaba } = await empadronamiento.empadronar({
    dni: "27111222",
    nombre: "Ana Gómez",
    distrito: 1,
    proveedor: "cidituc",
    proveedorSub: "sub-ana",
    verificado: true,
  });
  const primera = await cargar({ dni: "27.111.222", titulo: "Una idea de Ana en papel" });
  assert.equal((await filaDe(primera.id)).votanteId, yaEstaba);

  // Todavia no: queda el hash, y empadronarse la ata.
  const segunda = await cargar({ dni: "28333444", titulo: "Una idea de Luis en papel" });
  assert.equal((await filaDe(segunda.id)).votanteId, null);
  const { votanteId: luis } = await empadronamiento.empadronar({
    dni: "28333444",
    nombre: "Luis Díaz",
    distrito: 1,
    proveedor: "cidituc",
    proveedorSub: "sub-luis",
    verificado: true,
  });
  assert.equal((await filaDe(segunda.id)).votanteId, luis);
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

test("la bandeja encuentra por el codigo del papel y ordena por presupuesto estimado", async () => {
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
