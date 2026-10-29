/**
 * Lo que `npm run crear-admin` escribe (scripts/cuenta-de-consola.ts), contra
 * una PGlite descartable.
 *
 * Tres cosas: que la cuenta quede SIEMPRE obligada a cambiar la contrasena (el
 * script ya no toma ADMIN_PASSWORD, que es la del seed y vive en .env.local),
 * que la bitacora del equipo registre cada cosa que cambio (antes una sola fila
 * decia "cambio de contrasena" aunque la cuenta volviera de una baja, o "cambio
 * de rol" aunque tambien se le hubiera restablecido la clave), y que el rol no
 * cambie sin pedirlo ni deje el panel sin administrador. Antes, sin rol, valia
 * "moderador" tambien para una cuenta existente: restablecerle la clave a la
 * unica administradora la degradaba.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { and, asc, eq, ne } from "drizzle-orm";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

type Rol = "admin" | "moderador" | "lector";

let base: BaseDePrueba;
let consola: typeof import("../cuenta-de-consola");

test.before(async () => {
  base = await crearBaseDePrueba("crear-admin");
  consola = await import("../cuenta-de-consola");
});

test.after(async () => {
  await base.cerrar();
});

let secuencia = 0;

/** Una cuenta que ya estaba, con su contrasena elegida y sin cambio pendiente. */
async function cuentaExistente(datos: { rol: Rol; activo: boolean }) {
  secuencia += 1;
  const email = `existente${secuencia}@smt.gob.ar`;
  const [fila] = await base.db
    .insert(base.schema.admins)
    .values({
      email,
      nombre: `Existente ${secuencia}`,
      passwordHash: "hash-viejo",
      rol: datos.rol,
      activo: datos.activo,
      debeCambiarPassword: false,
    })
    .returning({ id: base.schema.admins.id, version: base.schema.admins.versionSesion });
  return { email, ...fila };
}

/**
 * Da de baja a cualquier otro administrador activo que hayan dejado las pruebas
 * anteriores (la base es una sola para todo el archivo): `id` queda como el
 * unico, que es el caso de la recuperacion de emergencia.
 */
async function dejarComoUnicoAdministrador(id: number) {
  const t = base.schema.admins;
  await base.db
    .update(t)
    .set({ activo: false })
    .where(and(eq(t.rol, "admin"), eq(t.activo, true), ne(t.id, id)));
}

async function cuenta(id: number) {
  const [fila] = await base.db
    .select()
    .from(base.schema.admins)
    .where(eq(base.schema.admins.id, id));
  return fila;
}

async function bitacoraDe(email: string) {
  const t = base.schema.bitacoraEquipo;
  return base.db
    .select({
      accion: t.accion,
      rolAnterior: t.rolAnterior,
      rolNuevo: t.rolNuevo,
      adminId: t.adminId,
      adminNombre: t.adminNombre,
    })
    .from(t)
    .where(eq(t.objetivoEmail, email))
    .orderBy(asc(t.id));
}

test("una cuenta nueva nace con la provisoria marcada para cambiar, y con su alta", async () => {
  const email = "nueva@smt.gob.ar";
  const resultado = await consola.guardarCuentaDesdeConsola(base.db, {
    email,
    nombre: "Cuenta Nueva",
    rol: "admin",
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(resultado, { creada: true, rol: "admin", acciones: ["alta"] });

  const [{ id }] = await base.db
    .select({ id: base.schema.admins.id })
    .from(base.schema.admins)
    .where(eq(base.schema.admins.email, email));
  const fila = await cuenta(id);
  assert.equal(fila.debeCambiarPassword, true);
  assert.equal(fila.activo, true);

  const bitacora = await bitacoraDe(email);
  assert.deepEqual(
    bitacora.map((f) => f.accion),
    ["alta"],
  );
  assert.equal(bitacora[0].adminId, null);
  assert.equal(bitacora[0].adminNombre, consola.AUTOR_CONSOLA);
});

test("restablecer con el mismo rol: contrasena nueva para cambiar y una sola fila", async () => {
  const existente = await cuentaExistente({ rol: "moderador", activo: true });
  const resultado = await consola.guardarCuentaDesdeConsola(base.db, {
    email: existente.email,
    nombre: "Mismo Rol",
    rol: "moderador",
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(resultado, { creada: false, rol: "moderador", acciones: ["cambio_password"] });

  const fila = await cuenta(existente.id);
  assert.equal(fila.passwordHash, "hash-provisoria");
  // Antes, con ADMIN_PASSWORD en el entorno, quedaba en false para siempre.
  assert.equal(fila.debeCambiarPassword, true);
  assert.equal(fila.versionSesion, existente.version + 1, "corta las sesiones abiertas");

  const bitacora = await bitacoraDe(existente.email);
  assert.deepEqual(
    bitacora.map((f) => [f.accion, f.rolAnterior, f.rolNuevo]),
    [["cambio_password", "moderador", "moderador"]],
  );
});

test("una cuenta dada de baja que vuelve deja su reactivacion en la bitacora", async () => {
  const existente = await cuentaExistente({ rol: "lector", activo: false });
  const resultado = await consola.guardarCuentaDesdeConsola(base.db, {
    email: existente.email,
    nombre: "Vuelve",
    rol: "lector",
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(resultado.acciones, ["reactivacion", "cambio_password"]);
  assert.equal((await cuenta(existente.id)).activo, true);

  const bitacora = await bitacoraDe(existente.email);
  assert.deepEqual(
    bitacora.map((f) => f.accion),
    ["reactivacion", "cambio_password"],
  );
});

test("un cambio de rol no esconde el restablecimiento de la clave", async () => {
  const existente = await cuentaExistente({ rol: "lector", activo: false });
  const resultado = await consola.guardarCuentaDesdeConsola(base.db, {
    email: existente.email,
    nombre: "Asciende",
    rol: "admin",
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(resultado.acciones, ["reactivacion", "cambio_rol", "cambio_password"]);

  const fila = await cuenta(existente.id);
  assert.equal(fila.rol, "admin");
  assert.equal(fila.activo, true);

  const bitacora = await bitacoraDe(existente.email);
  assert.deepEqual(
    bitacora.map((f) => [f.accion, f.rolAnterior, f.rolNuevo]),
    [
      ["reactivacion", null, null],
      ["cambio_rol", "lector", "admin"],
      ["cambio_password", "admin", "admin"],
    ],
  );
});

test("sin rol, restablecer a la unica administradora la deja administradora", async () => {
  // El caso del hallazgo: `npm run crear-admin -- jefa@... "Jefa"` sin el rol,
  // para recuperar el acceso. Antes quedaba moderadora y el panel sin admin.
  const existente = await cuentaExistente({ rol: "admin", activo: true });
  await dejarComoUnicoAdministrador(existente.id);

  const resultado = await consola.guardarCuentaDesdeConsola(base.db, {
    email: existente.email,
    nombre: "Unica Admin",
    rol: null,
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(resultado, { creada: false, rol: "admin", acciones: ["cambio_password"] });

  const fila = await cuenta(existente.id);
  assert.equal(fila.rol, "admin");
  assert.equal(fila.passwordHash, "hash-provisoria");
  assert.equal(fila.debeCambiarPassword, true);

  const bitacora = await bitacoraDe(existente.email);
  assert.deepEqual(
    bitacora.map((f) => [f.accion, f.rolAnterior, f.rolNuevo]),
    [["cambio_password", "admin", "admin"]],
  );
});

test("sin rol, un lector sigue siendo lector y una cuenta nueva nace moderadora", async () => {
  // Al reves del caso anterior: el valor por defecto tambien ascendia.
  const lector = await cuentaExistente({ rol: "lector", activo: true });
  const restablecido = await consola.guardarCuentaDesdeConsola(base.db, {
    email: lector.email,
    nombre: "Sigue Lector",
    rol: null,
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(restablecido, { creada: false, rol: "lector", acciones: ["cambio_password"] });
  assert.equal((await cuenta(lector.id)).rol, "lector");

  const email = "nueva-sin-rol@smt.gob.ar";
  const creada = await consola.guardarCuentaDesdeConsola(base.db, {
    email,
    nombre: "Nueva Sin Rol",
    rol: null,
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(creada, { creada: true, rol: consola.ROL_DE_CUENTA_NUEVA, acciones: ["alta"] });
  assert.equal(consola.ROL_DE_CUENTA_NUEVA, "moderador");
  const bitacora = await bitacoraDe(email);
  assert.deepEqual(
    bitacora.map((f) => [f.accion, f.rolNuevo]),
    [["alta", "moderador"]],
  );
});

test("no degrada al ultimo administrador activo, y no escribe nada", async () => {
  const existente = await cuentaExistente({ rol: "admin", activo: true });
  await dejarComoUnicoAdministrador(existente.id);

  await assert.rejects(
    consola.guardarCuentaDesdeConsola(base.db, {
      email: existente.email,
      nombre: "Unica Admin",
      rol: "moderador",
      passwordHash: "hash-provisoria",
    }),
    (error: unknown) => {
      assert.ok(error instanceof consola.CuentaDeConsolaRechazada);
      assert.match(error.message, /ultimo administrador activo/);
      return true;
    },
  );

  // Ni el rol, ni la clave, ni las sesiones: la regla se mira antes de escribir.
  const fila = await cuenta(existente.id);
  assert.equal(fila.rol, "admin");
  assert.equal(fila.passwordHash, "hash-viejo");
  assert.equal(fila.debeCambiarPassword, false);
  assert.equal(fila.versionSesion, existente.version);
  assert.deepEqual(await bitacoraDe(existente.email), []);
});

test("con otro administrador activo, si se puede degradar", async () => {
  const otro = await cuentaExistente({ rol: "admin", activo: true });
  await dejarComoUnicoAdministrador(otro.id);
  const existente = await cuentaExistente({ rol: "admin", activo: true });

  const resultado = await consola.guardarCuentaDesdeConsola(base.db, {
    email: existente.email,
    nombre: "Deja De Ser Admin",
    rol: "lector",
    passwordHash: "hash-provisoria",
  });
  assert.deepEqual(resultado, {
    creada: false,
    rol: "lector",
    acciones: ["cambio_rol", "cambio_password"],
  });
  assert.equal((await cuenta(existente.id)).rol, "lector");
  assert.equal((await cuenta(otro.id)).rol, "admin");
});
