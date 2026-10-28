/**
 * La descripcion de un estado segun la etapa (`descripcionEstado` en
 * src/lib/formato.ts). La de "factible" era fija y en pasado ("pudo ser
 * votada"), escrita para la edicion 2025 ya votada: en evaluacion o en votacion
 * daba a entender que la votacion ya habia pasado, en la ficha publica, en las
 * pastillas de /distritos/N y en el seguimiento de quien presento la idea.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { descripcionEstado } from "../../src/lib/formato";

test("factible no se dice en pasado antes ni durante la votacion", () => {
  for (const etapa of ["ideas", "evaluacion", "votacion"]) {
    const texto = descripcionEstado("factible", etapa);
    assert.ok(texto, etapa);
    assert.doesNotMatch(texto, /pudo ser votada/, etapa);
  }
  assert.match(descripcionEstado("factible", "evaluacion") ?? "", /va a poder votarse/);
  assert.match(descripcionEstado("factible", "votacion") ?? "", /está en la boleta/);
});

test("con la votacion terminada, factible y publicada pudo ser votada", () => {
  for (const etapa of ["seguimiento", "cerrada"]) {
    assert.match(descripcionEstado("factible", etapa) ?? "", /pudo ser votada/, etapa);
  }
});

test("una factible sin publicar no se da por votada ni por estar en la boleta", () => {
  // Lo que se vota es factible Y publicada (`seVota`): el seguimiento del autor
  // puede mostrar una que no lo esta.
  const enVotacion = descripcionEstado("factible", "votacion", false) ?? "";
  assert.match(enVotacion, /no entra en la boleta/);
  for (const etapa of ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"]) {
    const texto = descripcionEstado("factible", etapa, false) ?? "";
    assert.doesNotMatch(texto, /pudo ser votada|está en la boleta/, etapa);
  }
});

test("una etapa desconocida cae en la frase sin tiempo", () => {
  assert.equal(
    descripcionEstado("factible", null),
    "Pasó la evaluación técnica y presupuestaria.",
  );
});

test("los demas estados no dependen de la etapa, y uno desconocido no tiene descripcion", () => {
  for (const estado of ["pendiente", "no_factible", "integrado", "ganador", "descartado"]) {
    const enIdeas = descripcionEstado(estado, "ideas");
    assert.ok(enIdeas, estado);
    assert.equal(descripcionEstado(estado, "seguimiento"), enIdeas, estado);
  }
  assert.equal(descripcionEstado("borrador", "ideas"), undefined);
});
