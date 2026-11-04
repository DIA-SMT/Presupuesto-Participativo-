/**
 * Los dos interruptores del panel (presentacion de propuestas y votacion), que
 * reemplazan al selector de etapa y a las ediciones por año. Se prueba la
 * traduccion a etapas (`planDeInterruptor`, src/lib/etapas.ts); las reglas de
 * cada cambio de etapa siguen probadas en etapas.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ETAPAS, estadoDeInterruptores, planDeInterruptor } from "../../src/lib/etapas";

test("abrir la presentacion: de evaluacion vuelve a ideas; despues de votar, ronda nueva", () => {
  assert.deepEqual(planDeInterruptor("evaluacion", "abrir-presentacion"), { tipo: "etapa", destino: "ideas" });
  assert.equal(planDeInterruptor("seguimiento", "abrir-presentacion").tipo, "nuevo-ciclo");
  assert.equal(planDeInterruptor("cerrada", "abrir-presentacion").tipo, "nuevo-ciclo");
  assert.equal(planDeInterruptor("ideas", "abrir-presentacion").tipo, "sin-cambio");
});

test("con la votacion abierta no se abre la presentacion", () => {
  assert.equal(planDeInterruptor("votacion", "abrir-presentacion").tipo, "rechazo");
});

test("cerrar la presentacion pasa a evaluacion; si no estaba abierta, no cambia nada", () => {
  assert.deepEqual(planDeInterruptor("ideas", "cerrar-presentacion"), { tipo: "etapa", destino: "evaluacion" });
  for (const etapa of ETAPAS.filter((e) => e !== "ideas")) {
    assert.equal(planDeInterruptor(etapa, "cerrar-presentacion").tipo, "sin-cambio", etapa);
  }
});

test("abrir la votacion va a votacion desde cualquier etapa; cerrarla, a seguimiento", () => {
  for (const etapa of ETAPAS.filter((e) => e !== "votacion")) {
    assert.deepEqual(planDeInterruptor(etapa, "abrir-votacion"), { tipo: "etapa", destino: "votacion" }, etapa);
  }
  assert.equal(planDeInterruptor("votacion", "abrir-votacion").tipo, "sin-cambio");
  assert.deepEqual(planDeInterruptor("votacion", "cerrar-votacion"), { tipo: "etapa", destino: "seguimiento" });
  assert.equal(planDeInterruptor("ideas", "cerrar-votacion").tipo, "sin-cambio");
});

test("nunca estan las dos abiertas", () => {
  for (const etapa of ETAPAS) {
    const { presentacionAbierta, votacionAbierta } = estadoDeInterruptores(etapa);
    assert.ok(!(presentacionAbierta && votacionAbierta), etapa);
  }
  assert.deepEqual(estadoDeInterruptores("ideas"), { presentacionAbierta: true, votacionAbierta: false });
  assert.deepEqual(estadoDeInterruptores("votacion"), { presentacionAbierta: false, votacionAbierta: true });
});
