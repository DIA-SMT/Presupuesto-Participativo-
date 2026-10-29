/**
 * Pruebas del control de SESSION_SECRET (src/lib/secreto-sesion.ts).
 * Se corren con `npm test` y no tocan la base de datos.
 *
 * Lo que se cuida: que el texto de relleno que traia .env.example (publico, y
 * con mas de 32 caracteres) no sirva para firmar sesiones, codigos de
 * seguimiento ni respuestas del chat.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { codigoSeguimiento } from "../../src/lib/avisos";
import { firmarRespuesta } from "../../src/lib/chat-firma";
import { exigirSecretoDeSesion, secretoDeSesionValido } from "../../src/lib/secreto-sesion";

const PLANTILLA = "cambiar-por-un-secreto-de-64-caracteres-hexadecimales-aleatorio";
const BUENO = "a".repeat(64);

function conSecreto<T>(valor: string | undefined, fn: () => T): T {
  const antes = process.env.SESSION_SECRET;
  if (valor === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = valor;
  try {
    return fn();
  } finally {
    if (antes === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = antes;
  }
}

test("el valor de relleno de la plantilla no vale aunque tenga el largo", () => {
  assert.ok(PLANTILLA.length >= 32);
  assert.equal(secretoDeSesionValido(PLANTILLA), false);
  assert.equal(secretoDeSesionValido(` ${PLANTILLA} `), false);
  assert.throws(() => conSecreto(PLANTILLA, exigirSecretoDeSesion), /SESSION_SECRET/);
});

test("faltante o corto tampoco vale; uno generado si", () => {
  assert.equal(secretoDeSesionValido(undefined), false);
  assert.equal(secretoDeSesionValido(""), false);
  assert.equal(secretoDeSesionValido("x".repeat(31)), false);
  assert.equal(secretoDeSesionValido(BUENO), true);
  assert.equal(conSecreto(BUENO, exigirSecretoDeSesion), BUENO);
});

test("con el valor de la plantilla no hay codigo de seguimiento ni firma de chat", () => {
  assert.throws(() => conSecreto(PLANTILLA, () => codigoSeguimiento(1)), /SESSION_SECRET/);
  assert.equal(firmarRespuesta("hola", PLANTILLA), null);
  assert.notEqual(firmarRespuesta("hola", BUENO), null);
});

test(".env.example deja SESSION_SECRET vacio", () => {
  const plantilla = readFileSync(path.join(__dirname, "..", "..", ".env.example"), "utf8");
  const linea = plantilla.split(/\r?\n/).find((l) => l.startsWith("SESSION_SECRET="));
  assert.equal(linea, "SESSION_SECRET=");
});
