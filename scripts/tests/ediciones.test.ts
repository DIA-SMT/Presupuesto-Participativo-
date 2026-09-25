/**
 * Como se pide una edicion por URL y como se arman los enlaces que la
 * conservan (src/lib/ediciones.ts). Logica pura: sin base.
 *
 * Es la regla que comparten las cinco paginas publicas, los datos abiertos y
 * el mapa, asi que un caso que se escape aca se escapa en todas.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  conEdicion,
  estadoDeEdicionNoActiva,
  leerAnioPedido,
  votacionTerminada,
} from "../../src/lib/ediciones";

test("sin parametro, o vacio, es la edicion activa", () => {
  assert.deepEqual(leerAnioPedido(undefined), { tipo: "ninguno" });
  assert.deepEqual(leerAnioPedido(null), { tipo: "ninguno" });
  // `?edicion=` sin valor: lo deja un enlace armado a mano, no pide nada.
  assert.deepEqual(leerAnioPedido(""), { tipo: "ninguno" });
});

test("un año de cuatro cifras se pide tal cual", () => {
  assert.deepEqual(leerAnioPedido("2025"), { tipo: "anio", anio: 2025 });
  // Que exista lo decide la base, no el parseo: 1999 es un año bien escrito.
  assert.deepEqual(leerAnioPedido("1999"), { tipo: "anio", anio: 1999 });
});

test("lo que no es un año es invalido, no la edicion activa", () => {
  // Si se ignorara, `?edicion=abc` mostraria la activa bajo una URL que pide
  // otra cosa, sin decirlo.
  for (const valor of ["abc", "25", "20255", " 2025", "2025 ", "2025.0", "+2025", "-2025", "2O25"]) {
    assert.deepEqual(leerAnioPedido(valor), { tipo: "invalido" }, JSON.stringify(valor));
  }
  // Repetido: no hay forma honesta de elegir uno.
  assert.deepEqual(leerAnioPedido(["2025", "2026"]), { tipo: "invalido" });
  assert.deepEqual(leerAnioPedido(["2025"]), { tipo: "invalido" });
});

test("conEdicion agrega el parametro solo si hay año", () => {
  assert.equal(conEdicion("/proyectos", null), "/proyectos");
  assert.equal(conEdicion("/proyectos", undefined), "/proyectos");
  assert.equal(conEdicion("/proyectos", 2025), "/proyectos?edicion=2025");
  assert.equal(conEdicion("/distritos/7", 2025), "/distritos/7?edicion=2025");
  // Sobre una ruta que ya tiene parametros, se suma con &.
  assert.equal(
    conEdicion("/api/proyectos?formato=csv", 2025),
    "/api/proyectos?formato=csv&edicion=2025",
  );
});

test("la votacion termino recien en seguimiento o cerrada", () => {
  assert.equal(votacionTerminada("ideas"), false);
  assert.equal(votacionTerminada("evaluacion"), false);
  assert.equal(votacionTerminada("votacion"), false);
  assert.equal(votacionTerminada("seguimiento"), true);
  assert.equal(votacionTerminada("cerrada"), true);
});

test("una edicion que no es la activa es 'terminada' solo si voto", () => {
  assert.equal(estadoDeEdicionNoActiva("seguimiento"), "terminada");
  assert.equal(estadoDeEdicionNoActiva("cerrada"), "terminada");
  // Se activo otra antes de que esta votara: decir "terminada" seria falso.
  assert.equal(estadoDeEdicionNoActiva("ideas"), "no está en curso");
  assert.equal(estadoDeEdicionNoActiva("evaluacion"), "no está en curso");
});
