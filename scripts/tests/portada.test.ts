/**
 * Lo que la portada dice y ofrece en cada etapa (src/lib/portada.ts).
 *
 * La portada estaba escrita para una edicion que ya voto: ofrecia presentar
 * ideas y votar en todas las etapas, y con una edicion nueva mostraba "Ver los
 * 0 ganadores". Estas pruebas fijan que cada etapa ofrezca lo que se puede
 * hacer en ella, y que las fechas no prometan un cierre que ya paso.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { portadaSegunEtapa } from "../../src/lib/portada";

const HOY = "2026-10-20";
type Fechas = { ideasHasta: string | null; votacionDesde: string | null; votacionHasta: string | null };

const FECHAS: Fechas = {
  ideasHasta: "2026-11-15",
  votacionDesde: "2026-12-01",
  votacionHasta: "2026-12-10",
};

function portada(
  etapa: "ideas" | "evaluacion" | "votacion" | "seguimiento" | "cerrada",
  fechas: Fechas = FECHAS,
) {
  return portadaSegunEtapa({ anio: 2026, etapa, ...fechas }, HOY);
}

test("en la etapa de ideas se ofrece presentar una, con la fecha de cierre", () => {
  const p = portada("ideas");
  assert.equal(p.principal.href, "/ideas/nueva");
  assert.match(p.momento, /presentación de ideas está abierta hasta el 15 de noviembre de 2026/);
  assert.equal(p.yaVoto, false);
});

test("fuera de la etapa de ideas no se ofrece presentar una", () => {
  for (const etapa of ["evaluacion", "votacion", "seguimiento", "cerrada"] as const) {
    const p = portada(etapa);
    assert.notEqual(p.principal.href, "/ideas/nueva", etapa);
    assert.notEqual(p.secundaria.href, "/ideas/nueva", etapa);
  }
});

test("solo en la votacion se ofrece votar", () => {
  assert.equal(portada("votacion").principal.href, "/votar");
  for (const etapa of ["ideas", "evaluacion", "seguimiento", "cerrada"] as const) {
    const p = portada(etapa);
    assert.notEqual(p.principal.href, "/votar", etapa);
    assert.notEqual(p.secundaria.href, "/votar", etapa);
    assert.doesNotMatch(`${p.principal.texto} ${p.secundaria.texto}`, /vot[aá]/i, etapa);
  }
});

test("hay ganadores propios recien cuando la votacion termino", () => {
  assert.deepEqual(
    (["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const).map(
      (etapa) => portada(etapa).yaVoto,
    ),
    [false, false, false, true, true],
  );
});

test("una fecha de cierre que ya paso no se promete", () => {
  const vencidas = { ideasHasta: "2026-10-01", votacionDesde: "2026-10-05", votacionHasta: "2026-10-10" };
  assert.equal(portada("ideas", vencidas).momento, "Edición 2026: la presentación de ideas está abierta.");
  assert.doesNotMatch(portada("evaluacion", vencidas).momento, /empieza/);
  assert.doesNotMatch(portada("votacion", vencidas).momento, /hasta el/);
});

test("el dia del cierre todavia cuenta", () => {
  const p = portadaSegunEtapa({ anio: 2026, etapa: "ideas", ...FECHAS, ideasHasta: HOY }, HOY);
  assert.match(p.momento, /hasta el 20 de octubre de 2026/);
});

test("sin fechas cargadas, el momento se dice sin fecha", () => {
  const sinFechas = { ideasHasta: null, votacionDesde: null, votacionHasta: null };
  assert.equal(portada("ideas", sinFechas).momento, "Edición 2026: la presentación de ideas está abierta.");
  assert.equal(
    portada("evaluacion", sinFechas).momento,
    "Edición 2026: el equipo técnico está evaluando las ideas presentadas.",
  );
  assert.match(portada("votacion", sinFechas).momento, /^Edición 2026: la votación está abierta\. /);
});
