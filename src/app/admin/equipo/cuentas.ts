/**
 * Las escrituras sobre las cuentas del panel, cada una dentro de su
 * transaccion y con las reglas que la gobiernan.
 *
 * NO es "use server", por lo mismo que ../comun.ts: lo que exporta son piezas de
 * las acciones (./acciones.ts y el cambio de la propia contrasena en
 * ../acciones.ts), no puertas que el navegador pueda llamar. Y asi se prueba
 * contra una base de verdad sin contexto de pedido
 * (scripts/tests/equipo-cuentas.test.ts), igual que src/app/api/votos/
 * registrar.ts. Aca no se leen cookies ni se hashea nada: la sesion la resolvio
 * `exigirAdmin` y el hash llega hecho, para no tener filas bloqueadas mientras
 * corre scrypt.
 *
 * Reglas:
 *  - Nadie se cambia el rol, se desactiva ni se restablece la contrasena a si
 *    mismo: la propia se cambia desde /admin/password, pidiendo la actual.
 *  - El panel nunca queda sin un administrador activo. Se cuenta ADENTRO de la
 *    transaccion, con las filas bloqueadas: dos administradores que se
 *    degradan el uno al otro a la vez hacen fila, y el segundo ve que ya no
 *    queda nadie.
 *  - Quien firma el cambio tiene que seguir siendo un administrador activo, con
 *    la MISMA version de sesion, al momento de escribir. `exigirAdmin` lo
 *    comprobo al entrar, pero entre ese chequeo y la escritura otra persona
 *    pudo haberle sacado el rol o cortado la sesion. Con esta regla, y como
 *    nadie se cambia a si mismo, el que firma queda siempre como administrador:
 *    el conteo de arriba es la red de seguridad por si algun dia se permite
 *    degradarse a uno mismo.
 *  - Desactivar, reactivar, cambiar el rol y cambiar o restablecer la
 *    contrasena suben `version_sesion`: todas las sesiones abiertas de esa
 *    cuenta dejan de valer en el pedido siguiente (ver `sesionVigente` en
 *    src/lib/sesion.ts).
 *  - Cada cambio deja su fila en `bitacora_equipo` en la misma transaccion.
 *
 * Bloqueos: primero TODOS los administradores activos, en orden de id, y
 * despues la cuenta que se toca. Todas las transacciones de este archivo toman
 * las filas en ese mismo orden, asi que no pueden cruzarse en un deadlock. Es
 * `FOR NO KEY UPDATE` y no `FOR UPDATE`: choca con otro igual (las acciones de
 * equipo hacen fila entre si) pero no con el `FOR KEY SHARE` que toma cualquier
 * INSERT que apunta a una cuenta (una revision, una fila de bitacora), que asi
 * no espera por esto. Es el mismo criterio que el voto (registrar.ts).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { admins, bitacoraEquipo } from "@/db/schema";
import type { RolAdmin } from "@/db/queries";
import type { Autorizacion, Resultado, Transaccion } from "../comun";

/** Un administrador activo, tal como quedo bloqueado en la transaccion. */
export type AdministradorActivo = { id: number; version: number };

const SESION_NO_VIGENTE: Resultado = {
  ok: false,
  error:
    "Tu sesión de administrador ya no está vigente: se cerró o te cambiaron el rol. Volvé a ingresar.",
};

const NO_EXISTE: Resultado = { ok: false, error: "La cuenta no existe." };

const ULTIMO_ADMINISTRADOR: Resultado = {
  ok: false,
  error:
    "Es el último administrador activo: sin él no queda nadie que pueda administrar el panel. Dale el rol de administrador a otra persona primero.",
};

/** `version_sesion + 1`, calculado por la base: dos subidas a la vez no se pisan. */
function versionSiguiente() {
  return sql<number>`${admins.versionSesion} + 1`;
}

/** Los administradores activos, bloqueados hasta el final de la transaccion. */
async function bloquearAdministradores(tx: Transaccion): Promise<AdministradorActivo[]> {
  return tx
    .select({ id: admins.id, version: admins.versionSesion })
    .from(admins)
    .where(and(eq(admins.rol, "admin"), eq(admins.activo, true)))
    .orderBy(asc(admins.id))
    .for("no key update");
}

/** La cuenta que se va a tocar, bloqueada, o null si no existe. */
async function bloquearCuenta(tx: Transaccion, id: number) {
  const [cuenta] = await tx
    .select({
      id: admins.id,
      email: admins.email,
      nombre: admins.nombre,
      rol: admins.rol,
      activo: admins.activo,
    })
    .from(admins)
    .where(eq(admins.id, id))
    .for("no key update");
  return cuenta ?? null;
}

/**
 * Quien firma sigue siendo un administrador activo y con la misma sesion con la
 * que entro a la accion. Se decide sobre la lista ya bloqueada.
 */
export function firmanteVigente(
  administradores: AdministradorActivo[],
  firmante: Pick<Autorizacion, "adminId" | "version">,
): boolean {
  return administradores.some(
    (fila) => fila.id === firmante.adminId && fila.version === firmante.version,
  );
}

/** Si queda algun administrador activo ademas de la cuenta `cuentaId`. */
export function quedaOtroAdministrador(
  administradores: AdministradorActivo[],
  cuentaId: number,
): boolean {
  return administradores.some((fila) => fila.id !== cuentaId);
}

/**
 * Alta de una cuenta. Nace con `debe_cambiar_password`: la contrasena la genero
 * el servidor y la recibe otra persona, que tiene que elegir la suya al entrar.
 * El correo repetido se mira aca para dar un mensaje claro; si dos altas del
 * mismo correo se cruzan, la segunda la frena el UNIQUE y la accion lo traduce.
 */
export async function darDeAlta(
  firmante: Autorizacion,
  datos: { email: string; nombre: string; rol: RolAdmin },
  passwordHash: string,
): Promise<Resultado> {
  return db.transaction(async (tx): Promise<Resultado> => {
    const administradores = await bloquearAdministradores(tx);
    if (!firmanteVigente(administradores, firmante)) return SESION_NO_VIGENTE;

    const [existente] = await tx
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.email, datos.email))
      .limit(1);
    if (existente) return { ok: false, error: `Ya hay una cuenta con ${datos.email}.` };

    const [creada] = await tx
      .insert(admins)
      .values({
        email: datos.email,
        nombre: datos.nombre,
        passwordHash,
        rol: datos.rol,
        activo: true,
        debeCambiarPassword: true,
      })
      .returning({ id: admins.id });

    await tx.insert(bitacoraEquipo).values({
      adminId: firmante.adminId,
      adminNombre: firmante.nombre,
      objetivoId: creada.id,
      objetivoEmail: datos.email,
      accion: "alta",
      rolNuevo: datos.rol,
    });
    return { ok: true };
  });
}

export async function cambiarRol(
  firmante: Autorizacion,
  cuentaId: number,
  rolNuevo: RolAdmin,
): Promise<Resultado> {
  if (cuentaId === firmante.adminId) {
    return {
      ok: false,
      error: "No podés cambiarte el rol a vos mismo. Pedíselo a otro administrador.",
    };
  }

  return db.transaction(async (tx): Promise<Resultado> => {
    const administradores = await bloquearAdministradores(tx);
    if (!firmanteVigente(administradores, firmante)) return SESION_NO_VIGENTE;

    const cuenta = await bloquearCuenta(tx, cuentaId);
    if (!cuenta) return NO_EXISTE;
    if (cuenta.rol === rolNuevo) return { ok: false, error: "La cuenta ya tiene ese rol." };

    // Un administrador activo que pasa a otro rol deja de contar: tiene que
    // quedar otro. Uno desactivado ya no contaba.
    if (cuenta.activo && cuenta.rol === "admin" && !quedaOtroAdministrador(administradores, cuenta.id)) {
      return ULTIMO_ADMINISTRADOR;
    }

    await tx
      .update(admins)
      .set({ rol: rolNuevo, versionSesion: versionSiguiente() })
      .where(eq(admins.id, cuenta.id));
    await tx.insert(bitacoraEquipo).values({
      adminId: firmante.adminId,
      adminNombre: firmante.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: "cambio_rol",
      rolAnterior: cuenta.rol,
      rolNuevo,
    });
    return {
      ok: true,
      mensaje: `Rol cambiado. Si ${cuenta.nombre} tenía el panel abierto, tiene que volver a ingresar.`,
    };
  });
}

/**
 * Activa o desactiva una cuenta.
 *
 * La version sube en las dos direcciones. Al desactivar es lo que corta las
 * sesiones abiertas. Al reactivar no haria falta si la baja se hizo desde aca
 * (ya las habia cortado), pero una cuenta desactivada a mano en la base o por
 * consola conserva su version, y sus cookies viejas volverian a valer apenas se
 * reactivara: con la subida, quien vuelve entra de nuevo con su contrasena.
 */
export async function cambiarActivo(
  firmante: Autorizacion,
  cuentaId: number,
  activo: boolean,
): Promise<Resultado> {
  if (cuentaId === firmante.adminId && !activo) {
    return { ok: false, error: "No podés desactivar tu propia cuenta." };
  }

  return db.transaction(async (tx): Promise<Resultado> => {
    const administradores = await bloquearAdministradores(tx);
    if (!firmanteVigente(administradores, firmante)) return SESION_NO_VIGENTE;

    const cuenta = await bloquearCuenta(tx, cuentaId);
    if (!cuenta) return NO_EXISTE;
    if (cuenta.activo === activo) {
      return {
        ok: false,
        error: activo ? "La cuenta ya está activa." : "La cuenta ya estaba desactivada.",
      };
    }

    if (!activo && cuenta.rol === "admin" && !quedaOtroAdministrador(administradores, cuenta.id)) {
      return ULTIMO_ADMINISTRADOR;
    }

    await tx
      .update(admins)
      .set({ activo, versionSesion: versionSiguiente() })
      .where(eq(admins.id, cuenta.id));
    await tx.insert(bitacoraEquipo).values({
      adminId: firmante.adminId,
      adminNombre: firmante.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: activo ? "reactivacion" : "desactivacion",
    });
    return {
      ok: true,
      mensaje: activo
        ? "Cuenta reactivada: ya puede volver a ingresar con su contraseña."
        : "Cuenta desactivada: sus sesiones abiertas se cerraron y no puede volver a ingresar.",
    };
  });
}

/**
 * Restablece la contrasena de OTRA cuenta (no hay recuperacion por correo): la
 * provisoria nueva la genero la accion, y la cuenta queda obligada a cambiarla.
 * La vieja deja de andar y las sesiones abiertas se cortan.
 *
 * Vale tambien para una cuenta desactivada, que es el caso de quien vuelve
 * despues de un tiempo y no se acuerda de la suya: se restablece, se reactiva,
 * y el orden da igual.
 */
export async function restablecerPassword(
  firmante: Autorizacion,
  cuentaId: number,
  passwordHash: string,
): Promise<Resultado> {
  if (cuentaId === firmante.adminId) {
    return {
      ok: false,
      error:
        "Tu contraseña la cambiás desde “Mi contraseña”: te pide la actual y no te cierra esta sesión.",
    };
  }

  return db.transaction(async (tx): Promise<Resultado> => {
    const administradores = await bloquearAdministradores(tx);
    if (!firmanteVigente(administradores, firmante)) return SESION_NO_VIGENTE;

    const cuenta = await bloquearCuenta(tx, cuentaId);
    if (!cuenta) return NO_EXISTE;

    await tx
      .update(admins)
      .set({ passwordHash, debeCambiarPassword: true, versionSesion: versionSiguiente() })
      .where(eq(admins.id, cuenta.id));
    await tx.insert(bitacoraEquipo).values({
      adminId: firmante.adminId,
      adminNombre: firmante.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: "cambio_password",
    });
    return {
      ok: true,
      mensaje: cuenta.activo
        ? `Contraseña provisoria generada para ${cuenta.nombre}. La anterior dejó de andar y sus sesiones abiertas se cerraron.`
        : `Contraseña provisoria generada para ${cuenta.nombre}. La cuenta sigue desactivada: reactivala para que pueda ingresar.`,
    };
  });
}

/**
 * La contrasena propia (/admin/password): la cambia, apaga
 * `debe_cambiar_password` y sube la version, en una sola escritura que solo
 * prospera si la cuenta sigue activa y con la version de la sesion que lo
 * pidio. Si en el medio alguien la desactivo o le restablecio la contrasena,
 * no se pisa lo que hizo esa persona.
 *
 * Devuelve la version nueva, que la accion pone en la cookie de quien la
 * cambio (asi se cierran solo las OTRAS sesiones), o null si la sesion ya no
 * valia.
 */
export async function cambiarPasswordPropia(
  firmante: Autorizacion,
  passwordHash: string,
): Promise<number | null> {
  return db.transaction(async (tx): Promise<number | null> => {
    const [fila] = await tx
      .update(admins)
      .set({ passwordHash, debeCambiarPassword: false, versionSesion: versionSiguiente() })
      .where(
        and(
          eq(admins.id, firmante.adminId),
          eq(admins.activo, true),
          eq(admins.versionSesion, firmante.version),
        ),
      )
      .returning({ version: admins.versionSesion });
    if (!fila) return null;

    await tx.insert(bitacoraEquipo).values({
      adminId: firmante.adminId,
      adminNombre: firmante.nombre,
      objetivoId: firmante.adminId,
      objetivoEmail: firmante.email,
      accion: "cambio_password",
    });
    return fila.version;
  });
}
