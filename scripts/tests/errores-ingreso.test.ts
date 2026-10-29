/**
 * El cartel de /ingresar sale del `?error=` de la URL, que escribe cualquiera.
 * Indexar el diccionario directo con `?error=constructor` devolvia la funcion
 * `Object` y la pagina de ingreso entera caia en la de error.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mensajeDeErrorIngreso } from "../../src/lib/errores-ingreso";

test("los motivos que devuelve el ingreso tienen su texto", () => {
  for (const motivo of [
    "sin-token",
    "estado",
    "token-invalido",
    "sin-perfil",
    "sin-documento",
    "sin-padron",
    "cuenta-duplicada",
    "sin-servicio",
    "demasiados-intentos",
    "ingreso-cerrado",
  ]) {
    const texto = mensajeDeErrorIngreso(motivo);
    assert.equal(typeof texto, "string", motivo);
    assert.ok(texto!.length > 0, motivo);
  }
});

test("la cuenta que ya esta en el padron con otro documento no manda a reintentar", () => {
  // Cada reintento rebota igual contra votantes_proveedor_sub_idx: el cartel de
  // una base caida ("Probá de nuevo en un rato") la dejaba insistiendo.
  const texto = mensajeDeErrorIngreso("cuenta-duplicada");
  assert.ok(texto);
  assert.doesNotMatch(texto, /prob[aá] de nuevo/i);
  assert.match(texto, /Escribinos/);
});

test("el estado que no coincide no culpa solo al navegador", () => {
  // La causa mas comun es que la cookie vencio mientras la persona sacaba su
  // cuenta de CIDITUC, en el mismo navegador: decirle "otro navegador" era falso.
  const texto = mensajeDeErrorIngreso("estado");
  assert.ok(texto);
  assert.match(texto, /tardó demasiado/);
  assert.match(texto, /Entrá de nuevo desde el botón/);
});

test("lo heredado de Object.prototype no es un motivo", () => {
  for (const motivo of [
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "__proto__",
    "isPrototypeOf",
    "toLocaleString",
  ]) {
    assert.equal(mensajeDeErrorIngreso(motivo), undefined, motivo);
  }
});

test("un motivo desconocido, vacio o repetido no muestra cartel", () => {
  assert.equal(mensajeDeErrorIngreso("cualquier-cosa"), undefined);
  assert.equal(mensajeDeErrorIngreso(""), undefined);
  assert.equal(mensajeDeErrorIngreso(undefined), undefined);
  assert.equal(mensajeDeErrorIngreso(null), undefined);
  assert.equal(mensajeDeErrorIngreso(["sin-token", "estado"]), undefined);
  // Lo arma la pagina con el texto del destino: el diccionario no tiene uno.
  assert.equal(mensajeDeErrorIngreso("fuera-de-etapa"), undefined);
});
