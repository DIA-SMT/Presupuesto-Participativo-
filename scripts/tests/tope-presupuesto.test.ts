/**
 * `MAXIMO_PRESUPUESTO` (src/lib/formato.ts) tiene que ser exactamente lo que
 * entra en las dos columnas de presupuesto, numeric(14, 2). Es el tope con el
 * que validan `guardarEdicion` y `guardarPresupuestoIdea`: si quedara por
 * encima, un monto que la accion acepta haria fallar el UPDATE ("numeric field
 * overflow"); antes de tenerlo, un cero de mas en "Presupuesto total" de
 * /admin/ediciones tiraba la pantalla entera del panel.
 *
 * Contra una PGlite descartable con las migraciones reales: si alguien cambia
 * la precision de una columna, esta prueba lo dice.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { MAXIMO_PRESUPUESTO } from "../../src/lib/formato";
import {
  cargarMinimo,
  crearBaseDePrueba,
  crearIdea,
  violacionDe,
  type BaseDePrueba,
} from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let ideaId: number;

test.before(async () => {
  base = await crearBaseDePrueba("tope-presupuesto");
  ({ edicionId } = await cargarMinimo(base, { etapa: "ideas" }));
  ideaId = await crearIdea(base, { edicionId, distrito: 1, titulo: "Plaza", slug: "plaza" });
});

test.after(async () => {
  await base.cerrar();
});

// Como lo manda `guardarEdicion`: el numero ya validado, pasado a texto.
const TOPE = String(MAXIMO_PRESUPUESTO);
const UN_CENTAVO_MAS = "1000000000000.00";

test("el tope entra justo en ediciones.presupuesto_total", async () => {
  const { db, schema } = base;
  assert.equal(TOPE, "999999999999.99");
  await db
    .update(schema.ediciones)
    .set({ presupuestoTotal: TOPE })
    .where(eq(schema.ediciones.id, edicionId));
  const [fila] = await db
    .select({ monto: schema.ediciones.presupuestoTotal })
    .from(schema.ediciones)
    .where(eq(schema.ediciones.id, edicionId));
  assert.equal(fila.monto, TOPE);

  await assert.rejects(
    db
      .update(schema.ediciones)
      .set({ presupuestoTotal: UN_CENTAVO_MAS })
      .where(eq(schema.ediciones.id, edicionId)),
    violacionDe(/numeric field overflow/),
  );
});

test("el tope entra justo en ideas.presupuesto_total", async () => {
  const { db, schema } = base;
  await db.update(schema.ideas).set({ presupuestoTotal: TOPE }).where(eq(schema.ideas.id, ideaId));
  await assert.rejects(
    db
      .update(schema.ideas)
      .set({ presupuestoTotal: UN_CENTAVO_MAS })
      .where(eq(schema.ideas.id, ideaId)),
    violacionDe(/numeric field overflow/),
  );
});
