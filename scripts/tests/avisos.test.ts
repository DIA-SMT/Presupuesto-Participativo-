/**
 * Pruebas del codigo de seguimiento de una idea (src/lib/avisos.ts).
 * Se corren con `npm test` y no tocan la base de datos.
 *
 * El modulo exige SESSION_SECRET, asi que se setea aca. Se importa con
 * `import()` DENTRO de cada prueba y no arriba: los imports estaticos se
 * resuelven antes que cualquier linea del cuerpo del archivo, asi que un
 * `process.env.SESSION_SECRET = ...` en el cuerpo llegaria tarde.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.SESSION_SECRET = "secreto-de-prueba-para-los-tests-0123456789";

/** Sin ambiguedad visual: no van I, L, O, U, 0 ni 1 (igual que el modulo). */
const ALFABETO = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

const avisos = () => import("../../src/lib/avisos");

test("codigoSeguimiento es estable para el mismo id", async () => {
  const { codigoSeguimiento } = await avisos();
  const codigo = codigoSeguimiento(42);
  assert.equal(codigo, codigoSeguimiento(42));
  assert.equal(codigo, codigoSeguimiento(42));
});

test("codigoSeguimiento da codigos distintos para ids distintos", async () => {
  const { codigoSeguimiento } = await avisos();
  const ids = Array.from({ length: 300 }, (_, i) => i + 1);
  const codigos = new Set(ids.map((id) => codigoSeguimiento(id)));
  assert.equal(codigos.size, ids.length);
});

test("el codigo tiene 8 caracteres del alfabeto sin ambiguedad", async () => {
  const { codigoSeguimiento } = await avisos();
  for (const id of [1, 7, 99, 100, 12345]) {
    const codigo = codigoSeguimiento(id);
    assert.equal(codigo.length, 8);
    assert.match(codigo, ALFABETO);
  }
});

test("codigoValido tolera minusculas, espacios y guiones", async () => {
  const { codigoSeguimiento, codigoValido } = await avisos();
  const codigo = codigoSeguimiento(77);

  assert.ok(codigoValido(77, codigo));
  assert.ok(codigoValido(77, codigo.toLowerCase()));
  assert.ok(codigoValido(77, `  ${codigo.toLowerCase()}  `));
  // Asi llega copiado de un mensaje o leido de un papel.
  assert.ok(codigoValido(77, `${codigo.slice(0, 4)}-${codigo.slice(4)}`));
  assert.ok(codigoValido(77, `${codigo.slice(0, 4)} ${codigo.slice(4)}`.toLowerCase()));
});

test("codigoValido rechaza el codigo de otra idea y los mal formados", async () => {
  const { codigoSeguimiento, codigoValido } = await avisos();

  assert.equal(codigoValido(1, codigoSeguimiento(2)), false);
  assert.equal(codigoValido(2, codigoSeguimiento(1)), false);
  assert.equal(codigoValido(1, ""), false);
  assert.equal(codigoValido(1, "ABC"), false);
  assert.equal(codigoValido(1, `${codigoSeguimiento(1)}X`), false);
});

test("la version del consentimiento tiene forma de periodo", async () => {
  const { VERSION_CONSENTIMIENTO } = await avisos();
  assert.match(VERSION_CONSENTIMIENTO, /^\d{4}-\d{2}$/);
});

test("la version del aviso legal tiene forma de periodo", async () => {
  const { VERSION_AVISO_LEGAL } = await avisos();
  assert.match(VERSION_AVISO_LEGAL, /^\d{4}-\d{2}$/);
});
