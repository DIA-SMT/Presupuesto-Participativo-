/**
 * Pruebas de resumenDeError (src/lib/errores-base.ts): lo que las rutas que
 * escriben datos de personas registran cuando la base falla. No toca la base:
 * arma el mismo error que drizzle-orm tira cuando falla una consulta.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DrizzleQueryError } from "drizzle-orm";
import { resumenDeError } from "../../src/lib/errores-base";

test("de un DrizzleQueryError quedan la clase, el codigo y el constraint, no los params", () => {
  const dePostgres = Object.assign(
    new Error('duplicate key value violates unique constraint "votos_una_persona_un_voto"'),
    { name: "DatabaseError", code: "23505", constraint: "votos_una_persona_un_voto" },
  );
  const causa = new DrizzleQueryError(
    'insert into "ideas" ("autor_nombre", "votante_id") values ($1, $2)',
    ["Juan Pérez", 4821],
    dePostgres,
  );
  // El mensaje de drizzle si lleva los valores: es lo que no tiene que llegar al log.
  assert.match(causa.message, /Juan Pérez/);

  const resumen = resumenDeError(causa);
  assert.equal(
    resumen,
    "DrizzleQueryError > DatabaseError (codigo 23505, constraint votos_una_persona_un_voto)",
  );
  assert.doesNotMatch(resumen, /Juan|4821|insert/);
});

test("un corte de la conexion conserva su codigo, y algo que no es Error no rompe", () => {
  const corte = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  assert.equal(resumenDeError(corte), "Error (codigo ECONNRESET)");
  assert.equal(resumenDeError("texto"), "error no estandar (string)");
});
