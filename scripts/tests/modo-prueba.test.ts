/**
 * Quien puede cargar una idea con la etapa de ideas cerrada (src/lib/
 * modo-prueba.ts), y con que nombre queda.
 *
 * Antes alcanzaba con cualquier sesion valida del panel, y una cuenta lectora
 * (la que el panel describe como "solo mira") podia meter ideas en la edicion
 * activa en evaluacion o en votacion, por el formulario publico, con canal web,
 * el nombre que escribiera y sin rastro de que cuenta las habia cargado.
 *
 * Lo que se fija:
 *  - la sesion abre la puerta desde moderador, el mismo minimo que la carga del
 *    panel; un lector no, y sin sesion tampoco;
 *  - MODO_PRUEBA_IDEAS=1 la abre para cualquiera, como antes;
 *  - cuando hay una sesion del equipo, su nombre viaja para `cargado_por`.
 *
 * Se prueba `permisoFueraDeEtapa`, que recibe la sesion: `cargaFueraDeEtapa` es
 * la misma regla leyendo la cookie del pedido, y sin un pedido de Next no hay
 * cookie que leer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

type SesionAdmin = import("../../src/lib/sesion").SesionAdmin;

let base: BaseDePrueba;
let modoPrueba: typeof import("../../src/lib/modo-prueba");

test.before(async () => {
  // El modulo no consulta la base en esta regla, pero importa src/db (a traves
  // de la sesion): sin una base descartable abriria la de desarrollo.
  base = await crearBaseDePrueba("modo-prueba");
  modoPrueba = await import("../../src/lib/modo-prueba");
});

test.after(async () => {
  await base.cerrar();
});

function sesion(rol: SesionAdmin["rol"]): SesionAdmin {
  return {
    tipo: "admin",
    adminId: 7,
    email: "equipo@smt.gob.ar",
    nombre: `Cuenta ${rol}`,
    rol,
    version: 0,
    debeCambiarPassword: false,
  };
}

test("con la sesion del equipo, carga desde moderador y queda su nombre", () => {
  const { permisoFueraDeEtapa } = modoPrueba;
  assert.deepEqual(permisoFueraDeEtapa(sesion("admin"), false), { cargadoPor: "Cuenta admin" });
  assert.deepEqual(permisoFueraDeEtapa(sesion("moderador"), false), {
    cargadoPor: "Cuenta moderador",
  });
});

test("una cuenta lectora no abre la carga fuera de etapa", () => {
  // Es el caso del hallazgo: el panel le promete al lector que "solo mira" y
  // /admin/ideas/nueva no lo deja cargar; esta puerta no puede ser mas ancha.
  assert.equal(modoPrueba.permisoFueraDeEtapa(sesion("lector"), false), null);
});

test("sin sesion y sin la variable, la puerta queda cerrada", () => {
  assert.equal(modoPrueba.permisoFueraDeEtapa(null, false), null);
});

test("con MODO_PRUEBA_IDEAS=1 carga cualquiera, y si hay sesion queda anotada", () => {
  const { permisoFueraDeEtapa } = modoPrueba;
  assert.deepEqual(permisoFueraDeEtapa(null, true), { cargadoPor: null });
  // Con la variable el lector puede cargar como cualquiera; que quede su
  // nombre es lo que lo distingue de un vecino en la bandeja.
  assert.deepEqual(permisoFueraDeEtapa(sesion("lector"), true), { cargadoPor: "Cuenta lector" });
  assert.deepEqual(permisoFueraDeEtapa(sesion("moderador"), true), {
    cargadoPor: "Cuenta moderador",
  });
});
