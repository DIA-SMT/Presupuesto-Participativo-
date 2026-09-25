/**
 * Las ideas de ejemplo de scripts/escenario.ts respetan las reglas de la base:
 * un ganador por distrito (indice ideas_un_ganador_por_distrito_idx) y ganadores
 * solo cuando la votacion ya paso. Es logica pura: no toca ninguna base.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ideasDeEjemplo } from "../escenario";

const plantillas = Array.from({ length: 40 }, (_, i) => ({
  titulo: `Idea ${i}`,
  slug: `idea-${i}`,
  distrito: (i % 12) + 1,
  categoria: null,
  barrio: null,
  problema: null,
  solucion: null,
  beneficios: null,
  lat: null,
  lon: null,
}));

test("antes de votar no hay ganadores ni votos", () => {
  for (const etapa of ["ideas", "evaluacion", "votacion"] as const) {
    const filas = ideasDeEjemplo(etapa, plantillas);
    assert.ok(filas.length > 0);
    assert.ok(filas.every((f) => !f.ganador && f.votos === 0), etapa);
  }
});

test("en seguimiento hay exactamente un ganador por distrito, y es el mas votado", () => {
  const filas = ideasDeEjemplo("seguimiento", plantillas);
  const porDistrito = new Map<number, typeof filas>();
  for (const f of filas) porDistrito.set(f.plantilla.distrito, [...(porDistrito.get(f.plantilla.distrito) ?? []), f]);
  for (const [distrito, lista] of porDistrito) {
    const ganadores = lista.filter((f) => f.ganador);
    assert.equal(ganadores.length, 1, `distrito ${distrito}`);
    assert.equal(Math.max(...lista.map((f) => f.votos)), ganadores[0].votos, `distrito ${distrito}`);
  }
});

test("la votacion lleva solo factibles publicadas, dos por distrito como mucho", () => {
  const filas = ideasDeEjemplo("votacion", plantillas);
  assert.ok(filas.every((f) => f.estado === "factible" && f.publicada));
  const cuenta = new Map<number, number>();
  for (const f of filas) cuenta.set(f.plantilla.distrito, (cuenta.get(f.plantilla.distrito) ?? 0) + 1);
  assert.ok([...cuenta.values()].every((n) => n <= 2));
});
