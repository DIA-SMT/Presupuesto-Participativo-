/**
 * Telefono o correo, al menos uno, para presentar una idea por la web
 * (`altaIdea` en src/lib/idea-esquema.ts). Desde noviembre de 2026 el equipo
 * contacta a cada autor para la nota de recepcion presencial, y con los dos
 * opcionales quedaron ideas sin forma de ubicar a quien las presento.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { altaIdea, MENSAJE_FALTA_CONTACTO } from "../../src/lib/idea-esquema";

const BASE = {
  titulo: "Plaza nueva para el barrio",
  problema: "La plaza del barrio esta abandonada y sin luz desde hace anos.",
  solucion: "Poner luminarias, juegos y bancos nuevos en toda la plaza del barrio.",
  lat: -26.83,
  lon: -65.2,
};

test("sin telefono ni correo no se puede presentar", () => {
  for (const contacto of [{}, { autorTelefono: "", autorEmail: "" }, { autorTelefono: null, autorEmail: null }]) {
    const r = altaIdea.safeParse({ ...BASE, ...contacto });
    assert.equal(r.success, false);
    assert.ok(r.error?.issues.some((i) => i.message === MENSAJE_FALTA_CONTACTO));
  }
});

test("alcanza con uno de los dos", () => {
  assert.equal(altaIdea.safeParse({ ...BASE, autorTelefono: "381 555-1234" }).success, true);
  assert.equal(altaIdea.safeParse({ ...BASE, autorEmail: "juana@ejemplo.test", autorTelefono: "" }).success, true);
});

test("un telefono mal escrito no cuenta como contacto valido", () => {
  assert.equal(altaIdea.safeParse({ ...BASE, autorTelefono: "abc" }).success, false);
});
