/**
 * Pruebas del filtro de enlaces del chat (src/lib/chat-enlaces.ts): que solo
 * las rutas internas del sitio se dibujen como enlace. No tocan la base.
 *
 * El caso que lo motivo: el patron del widget aceptaba cualquier cosa que
 * empezara con "/", y "//otro.com" empieza con "/".
 */
import assert from "node:assert/strict";
import test from "node:test";
import { rutaInterna } from "../../src/lib/chat-enlaces";

test("las rutas del sitio pasan tal cual", () => {
  for (const ruta of [
    "/",
    "/proyectos",
    "/proyectos/plaza-del-barrio-norte",
    "/proyectos?ganadores=1",
    "/distritos/7",
    "/acerca-de#preguntas",
    "/ideas/nueva",
  ]) {
    assert.equal(rutaInterna(ruta), ruta, ruta);
  }
});

test("una url relativa al protocolo no es interna", () => {
  assert.equal(rutaInterna("//ejemplo.com"), null);
  assert.equal(rutaInterna("//ejemplo.com/proyectos"), null);
  assert.equal(rutaInterna("///ejemplo.com"), null);
});

test("la barra invertida, que el navegador toma como barra, tampoco", () => {
  assert.equal(rutaInterna("/\\ejemplo.com"), null);
  assert.equal(rutaInterna("/\\/ejemplo.com"), null);
  assert.equal(rutaInterna("/proyectos\\algo"), null);
});

test("espacios y caracteres de control que el parser se come, tampoco", () => {
  // El parser de urls saca tabs y saltos: "/\t/ejemplo.com" termina en "//ejemplo.com".
  assert.equal(rutaInterna("/\t/ejemplo.com"), null);
  assert.equal(rutaInterna("/\n/ejemplo.com"), null);
  assert.equal(rutaInterna("/ /ejemplo.com"), null);
  assert.equal(rutaInterna("/\u0000proyectos"), null);
});

test("lo que no empieza con / no es una ruta interna", () => {
  for (const url of [
    "https://ejemplo.com",
    "http://ejemplo.com/proyectos",
    "javascript:alert(1)",
    "proyectos",
    "mailto:alguien@ejemplo.com",
    "",
  ]) {
    assert.equal(rutaInterna(url), null, url);
  }
});
