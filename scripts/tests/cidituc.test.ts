/**
 * Pruebas del ingreso con CIDITUC. Se corren con `npm test` y no tocan la red
 * ni la base: lo que se prueba es la lectura de la respuesta y la URL de
 * ingreso, que es donde estan las trampas conocidas de la integracion.
 *
 * Los casos salen de la guia de integracion de la Direccion de IA: cada uno es
 * un error que ya paso en una integracion real.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ingresoHabilitado,
  personaDeRespuesta,
  texto,
  urlDeIngreso,
} from "../../src/lib/cidituc";

// --- La URL de ingreso -------------------------------------------------------

test("la URL de ingreso lleva el # del HashRouter", () => {
  // Sin el `#` el Derivador cae en su ruta comodin y expulsa a la persona a
  // ciudaddigital.smt.gob.ar.
  const url = urlDeIngreso();
  assert.ok(url.startsWith("https://cidituc.smt.gob.ar/#/login?next="), url);
});

test("la clave de la app se puede cambiar por entorno", () => {
  const antes = process.env.CIDITUC_APP;
  try {
    delete process.env.CIDITUC_APP;
    assert.equal(urlDeIngreso(), "https://cidituc.smt.gob.ar/#/login?next=presupuesto-participativo");
    process.env.CIDITUC_APP = "otra-clave";
    assert.equal(urlDeIngreso(), "https://cidituc.smt.gob.ar/#/login?next=otra-clave");
  } finally {
    if (antes === undefined) delete process.env.CIDITUC_APP;
    else process.env.CIDITUC_APP = antes;
  }
});

test("el boton esta apagado salvo que se lo encienda explicitamente", () => {
  const antes = process.env.CIDITUC_INGRESO_HABILITADO;
  try {
    delete process.env.CIDITUC_INGRESO_HABILITADO;
    assert.equal(ingresoHabilitado(), false);
    process.env.CIDITUC_INGRESO_HABILITADO = "false";
    assert.equal(ingresoHabilitado(), false);
    // Un "1" no alcanza: el interruptor decide si una persona queda varada en
    // una pantalla ajena, asi que se pide la palabra.
    process.env.CIDITUC_INGRESO_HABILITADO = "1";
    assert.equal(ingresoHabilitado(), false);
    process.env.CIDITUC_INGRESO_HABILITADO = "TRUE";
    assert.equal(ingresoHabilitado(), true);
  } finally {
    if (antes === undefined) delete process.env.CIDITUC_INGRESO_HABILITADO;
    else process.env.CIDITUC_INGRESO_HABILITADO = antes;
  }
});

// --- Los campos que llegan como numero ---------------------------------------

test("texto acepta numeros, porque el backend hace SELECT p.* sobre MySQL", () => {
  assert.equal(texto(12345678), "12345678");
  assert.equal(texto("  12345678 "), "12345678");
  assert.equal(texto(""), null);
  assert.equal(texto("   "), null);
  assert.equal(texto(null), null);
  assert.equal(texto(undefined), null);
  assert.equal(texto({}), null);
  assert.equal(texto(Number.NaN), null);
});

// --- La envoltura de la respuesta --------------------------------------------

const PERSONA = {
  id_persona: 4321,
  documento_persona: 12345678,
  nombre_persona: "Ana",
  apellido_persona: "Pérez",
  email_persona: "ana@example.com",
  telefono_persona: "3815550000",
};

test("desenvuelve usuarioSinContraseña, user y la forma plana", () => {
  const esperado = { id: "4321", documento: "12345678", nombre: "Ana Pérez" };
  assert.deepEqual(personaDeRespuesta({ usuarioSinContraseña: PERSONA }), esperado);
  assert.deepEqual(personaDeRespuesta({ user: PERSONA }), esperado);
  assert.deepEqual(personaDeRespuesta(PERSONA), esperado);
});

test("no se lleva el contacto: solo documento, nombre e id", () => {
  const persona = personaDeRespuesta({ usuarioSinContraseña: PERSONA });
  assert.deepEqual(Object.keys(persona ?? {}).sort(), ["documento", "id", "nombre"]);
});

test("el documento se limpia de puntos y espacios", () => {
  const persona = personaDeRespuesta({ ...PERSONA, documento_persona: "12.345.678" });
  assert.equal(persona?.documento, "12345678");
});

test("sin documento usable no hay persona", () => {
  assert.equal(personaDeRespuesta({ ...PERSONA, documento_persona: null }), null);
  assert.equal(personaDeRespuesta({ ...PERSONA, documento_persona: "sin datos" }), null);
  assert.equal(personaDeRespuesta({ ...PERSONA, documento_persona: "123" }), null);
  assert.equal(personaDeRespuesta({}), null);
  assert.equal(personaDeRespuesta(null), null);
  assert.equal(personaDeRespuesta("cualquier cosa"), null);
});

test("el nombre se arma con lo que haya", () => {
  assert.equal(personaDeRespuesta({ ...PERSONA, apellido_persona: null })?.nombre, "Ana");
  assert.equal(personaDeRespuesta({ ...PERSONA, nombre_persona: null })?.nombre, "Pérez");
  assert.equal(
    personaDeRespuesta({ ...PERSONA, nombre_persona: null, apellido_persona: "" })?.nombre,
    null,
  );
});

test("el id de CIDITUC puede faltar sin romper el ingreso", () => {
  const persona = personaDeRespuesta({ ...PERSONA, id_persona: null });
  assert.equal(persona?.id, null);
  assert.equal(persona?.documento, "12345678");
});
