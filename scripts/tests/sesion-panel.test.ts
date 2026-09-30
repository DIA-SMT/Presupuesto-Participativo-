/**
 * La sesion del panel se valida contra la base (src/lib/sesion.ts), no solo
 * contra la firma del JWT.
 *
 * Antes, una cuenta desactivada seguia LEYENDO el panel hasta que vencia la
 * cookie (12 horas), y cambiar la contrasena no cerraba las otras sesiones.
 * Ahora el token lleva la version de sesiones de la cuenta, y cada pedido la
 * compara con la de la base: estas pruebas firman tokens de verdad y los
 * validan despues de cada cosa que tiene que cortarlos.
 *
 * Se prueba `validarTokenAdmin`, que recibe el token: `getSesionAdmin` es la
 * misma funcion leyendo la cookie del pedido, y sin un pedido de Next no hay
 * cookie que leer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

type Autorizacion = import("../../src/app/admin/comun").Autorizacion;

let base: BaseDePrueba;
let sesion: typeof import("../../src/lib/sesion");
let cuentas: typeof import("../../src/app/admin/equipo/cuentas");

test.before(async () => {
  base = await crearBaseDePrueba("sesion-panel");
  // Despues de crear la base: src/db elige el driver al importarse.
  sesion = await import("../../src/lib/sesion");
  cuentas = await import("../../src/app/admin/equipo/cuentas");
});

test.after(async () => {
  await base.cerrar();
});

let secuencia = 0;

async function crearCuenta(datos: {
  rol: "admin" | "moderador" | "lector";
  nombre?: string;
  activo?: boolean;
  debeCambiarPassword?: boolean;
}) {
  secuencia += 1;
  const [fila] = await base.db
    .insert(base.schema.admins)
    .values({
      email: `persona${secuencia}@smt.gob.ar`,
      nombre: datos.nombre ?? `Persona ${secuencia}`,
      passwordHash: "no-se-usa",
      rol: datos.rol,
      activo: datos.activo ?? true,
      debeCambiarPassword: datos.debeCambiarPassword ?? false,
    })
    .returning({ id: base.schema.admins.id, version: base.schema.admins.versionSesion });
  return fila;
}

async function autorizacionDe(id: number): Promise<Autorizacion> {
  const { eq } = await import("drizzle-orm");
  const [fila] = await base.db
    .select()
    .from(base.schema.admins)
    .where(eq(base.schema.admins.id, id));
  return {
    adminId: fila.id,
    email: fila.email,
    nombre: fila.nombre,
    rol: fila.rol,
    version: fila.versionSesion,
  };
}

/** Un token del panel como los de antes de la version: correo y rol, sin `version`. */
async function tokenViejo(datos: { adminId: number; email: string; rol: string }) {
  return new SignJWT({ tipo: "admin", ...datos })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
}

test("un token con la version de la base vale, y los datos salen de la base", async () => {
  const cuenta = await crearCuenta({ rol: "moderador", nombre: "Marta Evaluadora" });
  const token = await sesion.firmarTokenAdmin({ adminId: cuenta.id, version: cuenta.version });

  const validada = await sesion.validarTokenAdmin(token);
  assert.ok(validada);
  assert.equal(validada.adminId, cuenta.id);
  assert.equal(validada.nombre, "Marta Evaluadora");
  assert.equal(validada.rol, "moderador");
  assert.equal(validada.version, 0);
  assert.equal(validada.debeCambiarPassword, false);
});

test("sin token, con un token roto o de votante, no hay sesion", async () => {
  const cuenta = await crearCuenta({ rol: "admin" });
  assert.equal(await sesion.validarTokenAdmin(undefined), null);
  assert.equal(await sesion.validarTokenAdmin("no-es-un-jwt"), null);

  const deVotante = await new SignJWT({ tipo: "votante", votanteId: cuenta.id, version: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
  assert.equal(await sesion.validarTokenAdmin(deVotante), null);

  const deOtraClave = await new SignJWT({ tipo: "admin", adminId: cuenta.id, version: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("otra-clave-que-tambien-tiene-mas-de-32-caracteres"));
  assert.equal(await sesion.validarTokenAdmin(deOtraClave), null);
});

test("un token de antes del cambio (sin version) ya no vale: es la sesion que se cierra al desplegar", async () => {
  const cuenta = await crearCuenta({ rol: "admin" });
  const token = await tokenViejo({ adminId: cuenta.id, email: "x@smt.gob.ar", rol: "admin" });
  assert.equal(await sesion.validarTokenAdmin(token), null);
});

test("una cuenta que no existe o esta desactivada no tiene sesion aunque el token sea bueno", async () => {
  const inexistente = await sesion.firmarTokenAdmin({ adminId: 999_999, version: 0 });
  assert.equal(await sesion.validarTokenAdmin(inexistente), null);

  // Desactivada por fuera de la pantalla (sin subir la version): igual se corta.
  const cuenta = await crearCuenta({ rol: "lector", activo: false });
  const token = await sesion.firmarTokenAdmin({ adminId: cuenta.id, version: cuenta.version });
  assert.equal(await sesion.validarTokenAdmin(token), null);
});

test("desactivar la cuenta corta la sesion abierta en el pedido siguiente", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const evaluador = await crearCuenta({ rol: "moderador" });
  const token = await sesion.firmarTokenAdmin({ adminId: evaluador.id, version: evaluador.version });
  assert.ok(await sesion.validarTokenAdmin(token));

  assert.equal((await cuentas.cambiarActivo(await autorizacionDe(jefa.id), evaluador.id, false)).ok, true);
  assert.equal(await sesion.validarTokenAdmin(token), null);

  // Y reactivarla no la revive: hay que volver a ingresar.
  assert.equal((await cuentas.cambiarActivo(await autorizacionDe(jefa.id), evaluador.id, true)).ok, true);
  assert.equal(await sesion.validarTokenAdmin(token), null);
});

test("cambiar el rol corta la sesion, y la nueva trae el rol nuevo", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const persona = await crearCuenta({ rol: "moderador" });
  const token = await sesion.firmarTokenAdmin({ adminId: persona.id, version: persona.version });

  assert.equal((await cuentas.cambiarRol(await autorizacionDe(jefa.id), persona.id, "lector")).ok, true);
  assert.equal(await sesion.validarTokenAdmin(token), null);

  const nuevo = await sesion.firmarTokenAdmin({ adminId: persona.id, version: 1 });
  assert.equal((await sesion.validarTokenAdmin(nuevo))?.rol, "lector");
});

test("cambiar la propia contrasena cierra las otras sesiones y deja viva la reemitida", async () => {
  const persona = await crearCuenta({ rol: "moderador" });
  const enLaCompu = await sesion.firmarTokenAdmin({ adminId: persona.id, version: persona.version });
  const enElTelefono = await sesion.firmarTokenAdmin({ adminId: persona.id, version: persona.version });

  // La cambia desde el telefono: la accion reemite ESA cookie con la version nueva.
  const version = await cuentas.cambiarPasswordPropia(await autorizacionDe(persona.id), "hash-nuevo");
  assert.equal(version, 1);
  const reemitida = await sesion.firmarTokenAdmin({ adminId: persona.id, version: version! });

  assert.equal(await sesion.validarTokenAdmin(enLaCompu), null);
  assert.equal(await sesion.validarTokenAdmin(enElTelefono), null);
  assert.ok(await sesion.validarTokenAdmin(reemitida));
});

test("restablecer la contrasena corta la sesion y la proxima queda marcada como provisoria", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const persona = await crearCuenta({ rol: "lector" });
  const token = await sesion.firmarTokenAdmin({ adminId: persona.id, version: persona.version });

  assert.equal(
    (await cuentas.restablecerPassword(await autorizacionDe(jefa.id), persona.id, "hash-provisoria"))
      .ok,
    true,
  );
  assert.equal(await sesion.validarTokenAdmin(token), null);

  // Cuando vuelve a ingresar con la provisoria, la sesion vale pero avisa que
  // tiene que cambiarla: getSesionAdmin con eso manda a /admin/password.
  const alIngresar = await sesion.firmarTokenAdmin({ adminId: persona.id, version: 1 });
  const validada = await sesion.validarTokenAdmin(alIngresar);
  assert.ok(validada);
  assert.equal(validada.debeCambiarPassword, true);
});

test("sesionVigente compara id, estado y version", () => {
  const cuenta = {
    id: 5,
    email: "a@smt.gob.ar",
    nombre: "A",
    rol: "admin" as const,
    activo: true,
    versionSesion: 2,
    debeCambiarPassword: false,
  };
  assert.equal(sesion.sesionVigente({ adminId: 5, version: 2 }, cuenta), true);
  assert.equal(sesion.sesionVigente({ adminId: 5, version: 1 }, cuenta), false);
  assert.equal(sesion.sesionVigente({ adminId: 6, version: 2 }, cuenta), false);
  assert.equal(sesion.sesionVigente({ adminId: 5, version: 2 }, { ...cuenta, activo: false }), false);
  assert.equal(sesion.sesionVigente({ adminId: 5, version: 2 }, null), false);
});
