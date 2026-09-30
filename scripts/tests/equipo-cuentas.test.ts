/**
 * Las reglas del equipo del panel (src/app/admin/equipo/cuentas.ts), probadas
 * contra una base de verdad.
 *
 * Lo que importa aca es lo que pasa ADENTRO de la transaccion: que cada cambio
 * suba la version de sesiones (eso es lo que corta las sesiones abiertas), que
 * deje su fila en la bitacora, y que quien firma tenga que seguir siendo un
 * administrador activo al momento de escribir. El caso central es el de dos
 * administradores que se degradan el uno al otro: la sesion del segundo quedo
 * vieja y la transaccion lo tiene que frenar, aunque al entrar a la accion
 * todavia era administrador.
 *
 * Lo que no se prueba aca es la espera entre dos transacciones a la vez: PGlite
 * atiende de a una, asi que nunca se solapan. Se arma el mundo que dejo la
 * primera y se verifica que la segunda lo vea. La espera la garantiza el
 * `FOR NO KEY UPDATE` sobre los administradores, explicado en cuentas.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

type Rol = "admin" | "moderador" | "lector";
type Autorizacion = import("../../src/app/admin/comun").Autorizacion;

let base: BaseDePrueba;
let cuentas: typeof import("../../src/app/admin/equipo/cuentas");

test.before(async () => {
  base = await crearBaseDePrueba("equipo-cuentas");
  // Despues de crear la base: src/db elige el driver al importarse.
  cuentas = await import("../../src/app/admin/equipo/cuentas");
});

test.after(async () => {
  await base.cerrar();
});

let secuencia = 0;

/** Una cuenta con lo justo. El hash no importa: aca nadie ingresa. */
async function crearCuenta(
  datos: { rol: Rol; activo?: boolean; debeCambiarPassword?: boolean; nombre?: string },
) {
  secuencia += 1;
  const [fila] = await base.db
    .insert(base.schema.admins)
    .values({
      email: `cuenta${secuencia}@smt.gob.ar`,
      nombre: datos.nombre ?? `Cuenta ${secuencia}`,
      passwordHash: `hash-${secuencia}`,
      rol: datos.rol,
      activo: datos.activo ?? true,
      debeCambiarPassword: datos.debeCambiarPassword ?? false,
    })
    .returning({ id: base.schema.admins.id });
  return fila.id;
}

/** Lo que `exigirAdmin` le habria devuelto a esa cuenta, leido ahora. */
async function autorizacionDe(id: number): Promise<Autorizacion> {
  const fila = await leerCuenta(id);
  return {
    adminId: fila.id,
    email: fila.email,
    nombre: fila.nombre,
    rol: fila.rol,
    version: fila.versionSesion,
  };
}

async function leerCuenta(id: number) {
  const { eq } = await import("drizzle-orm");
  const [fila] = await base.db
    .select()
    .from(base.schema.admins)
    .where(eq(base.schema.admins.id, id));
  assert.ok(fila, `la cuenta ${id} existe`);
  return fila;
}

/** Filas de la bitacora del equipo sobre una cuenta, de la mas vieja a la mas nueva. */
async function bitacoraDe(objetivoId: number) {
  return base.consultar<{
    accion: string;
    admin_id: number | null;
    admin_nombre: string;
    rol_anterior: string | null;
    rol_nuevo: string | null;
  }>(base.sql`
    SELECT accion, admin_id, admin_nombre, rol_anterior, rol_nuevo
      FROM bitacora_equipo
     WHERE objetivo_id = ${objetivoId}
     ORDER BY id
  `);
}

/** Cuantos administradores activos hay: nunca tiene que llegar a cero. */
async function administradoresActivos() {
  const [fila] = await base.consultar<{ total: number }>(base.sql`
    SELECT count(*)::int AS total FROM admins WHERE rol = 'admin' AND activo
  `);
  return Number(fila.total);
}

// ---------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------

test("el firmante vale si esta entre los administradores activos y con la misma version", () => {
  const lista = [
    { id: 1, version: 3 },
    { id: 2, version: 0 },
  ];
  assert.equal(cuentas.firmanteVigente(lista, { adminId: 1, version: 3 }), true);
  // Misma cuenta, sesion vieja: la version subio despues de que entro.
  assert.equal(cuentas.firmanteVigente(lista, { adminId: 1, version: 2 }), false);
  // Ya no es administrador activo (no esta en la lista bloqueada).
  assert.equal(cuentas.firmanteVigente(lista, { adminId: 7, version: 0 }), false);
});

test("sin otro administrador activo, la cuenta es la ultima", () => {
  assert.equal(cuentas.quedaOtroAdministrador([{ id: 1, version: 0 }], 1), false);
  assert.equal(
    cuentas.quedaOtroAdministrador(
      [
        { id: 1, version: 0 },
        { id: 2, version: 0 },
      ],
      1,
    ),
    true,
  );
  // Una cuenta que no es administradora no cambia la cuenta.
  assert.equal(cuentas.quedaOtroAdministrador([{ id: 1, version: 0 }], 9), true);
  assert.equal(cuentas.quedaOtroAdministrador([], 1), false);
});

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

test("el alta nace con la provisoria marcada y deja fila en la bitacora", async () => {
  const jefa = await crearCuenta({ rol: "admin", nombre: "Jefa" });
  const firmante = await autorizacionDe(jefa);

  const resultado = await cuentas.darDeAlta(
    firmante,
    { email: "evaluador.nuevo@smt.gob.ar", nombre: "Evaluador Nuevo", rol: "moderador" },
    "hash-provisoria",
  );
  assert.deepEqual(resultado, { ok: true });

  const [creada] = await base.consultar<{
    id: number;
    rol: string;
    activo: boolean;
    debe_cambiar_password: boolean;
    version_sesion: number;
    password_hash: string;
  }>(base.sql`
    SELECT id, rol, activo, debe_cambiar_password, version_sesion, password_hash
      FROM admins WHERE email = 'evaluador.nuevo@smt.gob.ar'
  `);
  assert.equal(creada.rol, "moderador");
  assert.equal(creada.activo, true);
  assert.equal(creada.debe_cambiar_password, true);
  assert.equal(Number(creada.version_sesion), 0);
  assert.equal(creada.password_hash, "hash-provisoria");

  const bitacora = await bitacoraDe(Number(creada.id));
  assert.equal(bitacora.length, 1);
  assert.equal(bitacora[0].accion, "alta");
  assert.equal(Number(bitacora[0].admin_id), jefa);
  assert.equal(bitacora[0].admin_nombre, "Jefa");
  assert.equal(bitacora[0].rol_nuevo, "moderador");
});

test("un correo que ya existe no se da de alta dos veces", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const firmante = await autorizacionDe(jefa);
  const datos = { email: "repetida@smt.gob.ar", nombre: "Repetida", rol: "lector" as const };

  assert.deepEqual(await cuentas.darDeAlta(firmante, datos, "h1"), { ok: true });
  const segunda = await cuentas.darDeAlta(firmante, datos, "h2");
  assert.equal(segunda.ok, false);
  assert.match(segunda.ok ? "" : segunda.error, /Ya hay una cuenta con repetida@smt\.gob\.ar/);
});

// ---------------------------------------------------------------------------
// Rol, baja y contrasena: cada una sube la version
// ---------------------------------------------------------------------------

test("cambiar el rol sube la version y deja el antes y el despues en la bitacora", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const evaluadora = await crearCuenta({ rol: "lector" });

  const resultado = await cuentas.cambiarRol(await autorizacionDe(jefa), evaluadora, "moderador");
  assert.equal(resultado.ok, true);

  const cuenta = await leerCuenta(evaluadora);
  assert.equal(cuenta.rol, "moderador");
  assert.equal(cuenta.versionSesion, 1);

  const [fila] = await bitacoraDe(evaluadora);
  assert.equal(fila.accion, "cambio_rol");
  assert.equal(fila.rol_anterior, "lector");
  assert.equal(fila.rol_nuevo, "moderador");

  // El mismo rol otra vez no escribe nada ni vuelve a subir la version.
  const repetido = await cuentas.cambiarRol(await autorizacionDe(jefa), evaluadora, "moderador");
  assert.equal(repetido.ok, false);
  assert.equal((await leerCuenta(evaluadora)).versionSesion, 1);
  assert.equal((await bitacoraDe(evaluadora)).length, 1);
});

test("nadie se cambia el rol, se desactiva ni se restablece la contrasena a si mismo", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  await crearCuenta({ rol: "admin" }); // hay otro: no es por ser la ultima
  const firmante = await autorizacionDe(jefa);

  const rol = await cuentas.cambiarRol(firmante, jefa, "lector");
  const baja = await cuentas.cambiarActivo(firmante, jefa, false);
  const clave = await cuentas.restablecerPassword(firmante, jefa, "hash-nuevo");
  for (const resultado of [rol, baja, clave]) assert.equal(resultado.ok, false);

  const cuenta = await leerCuenta(jefa);
  assert.equal(cuenta.rol, "admin");
  assert.equal(cuenta.activo, true);
  assert.equal(cuenta.versionSesion, 0);
  assert.notEqual(cuenta.passwordHash, "hash-nuevo");
  assert.equal((await bitacoraDe(jefa)).length, 0);
});

test("desactivar y reactivar suben la version las dos veces", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const evaluador = await crearCuenta({ rol: "moderador" });

  assert.equal((await cuentas.cambiarActivo(await autorizacionDe(jefa), evaluador, false)).ok, true);
  let cuenta = await leerCuenta(evaluador);
  assert.equal(cuenta.activo, false);
  assert.equal(cuenta.versionSesion, 1);

  const otraVez = await cuentas.cambiarActivo(await autorizacionDe(jefa), evaluador, false);
  assert.equal(otraVez.ok, false);

  // Al reactivar tambien sube: una baja hecha a mano en la base no subio la
  // version, y sin esto sus cookies viejas volverian a valer.
  assert.equal((await cuentas.cambiarActivo(await autorizacionDe(jefa), evaluador, true)).ok, true);
  cuenta = await leerCuenta(evaluador);
  assert.equal(cuenta.activo, true);
  assert.equal(cuenta.versionSesion, 2);

  const acciones = (await bitacoraDe(evaluador)).map((fila) => fila.accion);
  assert.deepEqual(acciones, ["desactivacion", "reactivacion"]);
});

test("restablecer la contrasena de otra persona la obliga a cambiarla y corta sus sesiones", async () => {
  const jefa = await crearCuenta({ rol: "admin", nombre: "Jefa" });
  const olvidadiza = await crearCuenta({ rol: "moderador" });

  const resultado = await cuentas.restablecerPassword(
    await autorizacionDe(jefa),
    olvidadiza,
    "hash-provisoria-nueva",
  );
  assert.equal(resultado.ok, true);

  const cuenta = await leerCuenta(olvidadiza);
  assert.equal(cuenta.passwordHash, "hash-provisoria-nueva");
  assert.equal(cuenta.debeCambiarPassword, true);
  assert.equal(cuenta.versionSesion, 1);

  const [fila] = await bitacoraDe(olvidadiza);
  assert.equal(fila.accion, "cambio_password");
  // Lo firmo otra persona: asi la pantalla dice "restablecio" y no "cambio su".
  assert.equal(Number(fila.admin_id), jefa);
});

test("una cuenta desactivada tambien se puede restablecer, y sigue desactivada", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const deBaja = await crearCuenta({ rol: "lector", activo: false });

  const resultado = await cuentas.restablecerPassword(await autorizacionDe(jefa), deBaja, "h");
  assert.equal(resultado.ok, true);
  assert.match(resultado.ok ? (resultado.mensaje ?? "") : "", /sigue desactivada/);
  assert.equal((await leerCuenta(deBaja)).activo, false);
});

// ---------------------------------------------------------------------------
// El firmante, releido adentro de la transaccion
// ---------------------------------------------------------------------------

test("dos administradores que se degradan el uno al otro: el segundo ya no puede", async () => {
  const ana = await crearCuenta({ rol: "admin", nombre: "Ana" });
  const beto = await crearCuenta({ rol: "admin", nombre: "Beto" });

  // Los dos entraron a la accion a la vez: exigirAdmin los dejo pasar a ambos.
  const firmaAna = await autorizacionDe(ana);
  const firmaBeto = await autorizacionDe(beto);
  const antes = await administradoresActivos();

  // Primero termina la de Ana.
  assert.equal((await cuentas.cambiarRol(firmaAna, beto, "moderador")).ok, true);

  // La de Beto llega con la autorizacion de antes: ya no es administrador (y su
  // version subio). Se frena adentro de la transaccion y Ana sigue siendo admin.
  const deBeto = await cuentas.cambiarRol(firmaBeto, ana, "lector");
  assert.equal(deBeto.ok, false);
  assert.match(deBeto.ok ? "" : deBeto.error, /ya no está vigente/);

  const cuentaAna = await leerCuenta(ana);
  assert.equal(cuentaAna.rol, "admin");
  assert.equal(cuentaAna.versionSesion, 0);
  assert.equal(await administradoresActivos(), antes - 1);
  assert.ok((await administradoresActivos()) >= 1);

  // Tampoco puede desactivarla, dar de alta ni restablecer nada.
  assert.equal((await cuentas.cambiarActivo(firmaBeto, ana, false)).ok, false);
  assert.equal(
    (
      await cuentas.darDeAlta(
        firmaBeto,
        { email: "colada@smt.gob.ar", nombre: "Colada", rol: "admin" },
        "h",
      )
    ).ok,
    false,
  );
  assert.equal((await cuentas.restablecerPassword(firmaBeto, ana, "h")).ok, false);
  assert.equal((await leerCuenta(ana)).activo, true);
});

test("un administrador cuya sesion se corto (cambio su contrasena en otro lado) no firma cambios", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const evaluador = await crearCuenta({ rol: "lector" });

  const firmaVieja = await autorizacionDe(jefa);
  // La jefa cambia su contrasena desde el telefono: sube su version.
  const nueva = await cuentas.cambiarPasswordPropia(firmaVieja, "hash-del-telefono");
  assert.equal(nueva, 1);

  // La pestana de la computadora sigue con la sesion vieja.
  const conLaVieja = await cuentas.cambiarRol(firmaVieja, evaluador, "admin");
  assert.equal(conLaVieja.ok, false);
  assert.equal((await leerCuenta(evaluador)).rol, "lector");

  // Con la sesion reemitida (la version nueva) si puede.
  const conLaNueva = await cuentas.cambiarRol(await autorizacionDe(jefa), evaluador, "admin");
  assert.equal(conLaNueva.ok, true);
});

// ---------------------------------------------------------------------------
// La contrasena propia
// ---------------------------------------------------------------------------

test("cambiar la propia contrasena apaga la provisoria, sube la version y la devuelve", async () => {
  const nueva = await crearCuenta({ rol: "moderador", debeCambiarPassword: true });

  const version = await cuentas.cambiarPasswordPropia(await autorizacionDe(nueva), "hash-elegido");
  assert.equal(version, 1);

  const cuenta = await leerCuenta(nueva);
  assert.equal(cuenta.passwordHash, "hash-elegido");
  assert.equal(cuenta.debeCambiarPassword, false);
  assert.equal(cuenta.versionSesion, 1);

  const [fila] = await bitacoraDe(nueva);
  assert.equal(fila.accion, "cambio_password");
  assert.equal(Number(fila.admin_id), nueva);
});

test("si la sesion se corto en el medio, la contrasena propia no pisa lo que hizo otra persona", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const evaluador = await crearCuenta({ rol: "moderador" });

  // El evaluador abre /admin/password; mientras escribe, la jefa le restablece
  // la contrasena (sube la version y marca la provisoria).
  const firmaEvaluador = await autorizacionDe(evaluador);
  assert.equal(
    (await cuentas.restablecerPassword(await autorizacionDe(jefa), evaluador, "hash-de-la-jefa"))
      .ok,
    true,
  );

  const version = await cuentas.cambiarPasswordPropia(firmaEvaluador, "hash-del-evaluador");
  assert.equal(version, null);

  const cuenta = await leerCuenta(evaluador);
  assert.equal(cuenta.passwordHash, "hash-de-la-jefa");
  assert.equal(cuenta.debeCambiarPassword, true);
  assert.equal(cuenta.versionSesion, 1);
  // Solo quedo la fila del restablecimiento.
  assert.deepEqual(
    (await bitacoraDe(evaluador)).map((fila) => fila.accion),
    ["cambio_password"],
  );
});

test("una cuenta desactivada no puede cambiar su contrasena con una sesion vieja", async () => {
  const jefa = await crearCuenta({ rol: "admin" });
  const evaluador = await crearCuenta({ rol: "moderador" });
  const firmaEvaluador = await autorizacionDe(evaluador);

  assert.equal((await cuentas.cambiarActivo(await autorizacionDe(jefa), evaluador, false)).ok, true);
  assert.equal(await cuentas.cambiarPasswordPropia(firmaEvaluador, "hash"), null);
  assert.notEqual((await leerCuenta(evaluador)).passwordHash, "hash");
});
