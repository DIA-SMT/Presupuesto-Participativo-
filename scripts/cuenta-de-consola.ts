/**
 * Lo que `npm run crear-admin` escribe en la base: la cuenta y su rastro en la
 * bitacora del equipo.
 *
 * La logica vive aca y la consola en scripts/crear-admin.ts, para poder
 * probarla contra una PGlite descartable (scripts/tests/crear-admin.test.ts).
 * Por eso no importa src/db: recibe la base, y la prueba le pasa la suya.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { db as BaseDeLaApp } from "../src/db";
import type { AccionEquipo, RolAdmin } from "../src/db/queries";
import { admins, bitacoraEquipo } from "../src/db/schema";

/** Quien figura en la bitacora: el cambio no salio del panel sino de la consola. */
export const AUTOR_CONSOLA = "consola (scripts/crear-admin)";

/** El rol de una cuenta que nace por consola sin que se lo pidan. */
export const ROL_DE_CUENTA_NUEVA: RolAdmin = "moderador";

export type CuentaDeConsola = {
  email: string;
  nombre: string;
  /**
   * El rol pedido, o null si no se paso: una cuenta que ya existe conserva el
   * suyo y una nueva nace con ROL_DE_CUENTA_NUEVA.
   */
  rol: RolAdmin | null;
  /** El hash de la provisoria que genero el script. */
  passwordHash: string;
};

export type ResultadoCuentaDeConsola = {
  creada: boolean;
  /** El rol con que quedo la cuenta, para que la consola lo muestre. */
  rol: RolAdmin;
  /** Las filas que quedaron en `bitacora_equipo`, en el orden en que se escribieron. */
  acciones: AccionEquipo[];
};

/**
 * Lo que el script se niega a hacer. Se lanza dentro de la transaccion, antes de
 * escribir nada, y la consola lo muestra como un rechazo y no como una falla.
 */
export class CuentaDeConsolaRechazada extends Error {}

/**
 * Crea la cuenta, o si ya existe la restablece: contrasena nueva que hay que
 * cambiar en el primer ingreso, el rol pedido (o el que tenia, si no se pidio
 * ninguno), activa, y las sesiones abiertas cortadas.
 *
 * Que sin rol se conserve el que tenia es lo que hace de esto un
 * restablecimiento, como `restablecerPassword` en el panel, que no toca el rol.
 * Antes el rol valia "moderador" por defecto tambien para una cuenta existente:
 * restablecerle la clave a la unica administradora sin escribir "admin" la
 * degradaba, y el panel quedaba sin nadie que pudiera cambiar la etapa o
 * gestionar el equipo; a un lector, en cambio, lo ascendia.
 *
 * Y vale la misma regla que en src/app/admin/equipo/cuentas.ts: el panel nunca
 * queda sin un administrador activo. Degradar al ultimo se rechaza; primero se
 * le da el rol a otra persona. La consola es la salida de emergencia, pero
 * justamente por eso no tiene que poder dejar el panel sin salida.
 *
 * La contrasena es siempre una provisoria que se cambia al entrar, como en el
 * restablecimiento del panel (`restablecerPassword` en
 * src/app/admin/equipo/cuentas.ts). Antes el script tomaba ADMIN_PASSWORD si
 * estaba, sin exigir el cambio. Pero esa variable es la del seed y vive en
 * .env.local: corrido desde una notebook con `--produccion`, dejaba una cuenta
 * de produccion con la contrasena de desarrollo (quizas de 6 caracteres, y
 * conocida por cualquiera con ese archivo) para siempre.
 *
 * Cada cosa que cambia deja su propia fila en la bitacora, en la misma
 * transaccion, igual que si se hubiera hecho desde el panel: `reactivacion` si
 * la cuenta estaba dada de baja, `cambio_rol` si cambia el rol, y
 * `cambio_password` siempre, porque la clave se reemplaza en cada corrida. Con
 * una sola fila, una cuenta dada de baja volvia a estar activa sin rastro de la
 * reactivacion, y un cambio de rol escondia el restablecimiento.
 */
export async function guardarCuentaDesdeConsola(
  base: typeof BaseDeLaApp,
  cuenta: CuentaDeConsola,
): Promise<ResultadoCuentaDeConsola> {
  return base.transaction(async (tx): Promise<ResultadoCuentaDeConsola> => {
    // Los administradores activos primero, en orden de id, y despues la cuenta:
    // el mismo orden que toman las transacciones de cuentas.ts, para que una
    // corrida del script y una accion del panel a la vez hagan fila y no se
    // trabe ninguna. El conteo del ultimo administrador se hace sobre esta
    // lista ya bloqueada, por lo mismo que alla. `no key update` tambien por lo
    // mismo: no frena los INSERT que apuntan a la cuenta.
    const administradores = await tx
      .select({ id: admins.id })
      .from(admins)
      .where(and(eq(admins.rol, "admin"), eq(admins.activo, true)))
      .orderBy(asc(admins.id))
      .for("no key update");

    // Leida y bloqueada dentro de la transaccion, para que lo que registra la
    // bitacora sea lo que habia al escribir.
    const [existente] = await tx
      .select({ id: admins.id, rol: admins.rol, activo: admins.activo })
      .from(admins)
      .where(eq(admins.email, cuenta.email))
      .for("no key update");

    if (!existente) {
      const rol = cuenta.rol ?? ROL_DE_CUENTA_NUEVA;
      const [creada] = await tx
        .insert(admins)
        .values({
          email: cuenta.email,
          nombre: cuenta.nombre,
          passwordHash: cuenta.passwordHash,
          rol,
          activo: true,
          debeCambiarPassword: true,
        })
        .returning({ id: admins.id });

      await tx.insert(bitacoraEquipo).values({
        adminId: null,
        adminNombre: AUTOR_CONSOLA,
        objetivoId: creada.id,
        objetivoEmail: cuenta.email,
        accion: "alta",
        rolNuevo: rol,
      });
      return { creada: true, rol, acciones: ["alta"] };
    }

    const rol = cuenta.rol ?? existente.rol;

    // Un administrador activo que pasa a otro rol deja de contar: tiene que
    // quedar otro. Uno desactivado ya no contaba, y el script nunca desactiva.
    if (
      existente.activo &&
      existente.rol === "admin" &&
      rol !== "admin" &&
      !administradores.some((fila) => fila.id !== existente.id)
    ) {
      throw new CuentaDeConsolaRechazada(
        `${cuenta.email} es el ultimo administrador activo: pasarlo a ${rol} dejaria el` +
          "\npanel sin nadie que pueda administrarlo. Dale el rol de administrador a otra" +
          "\npersona primero. Para restablecerle la contrasena sin tocar el rol, corre el" +
          "\nscript sin rol o con admin.",
      );
    }

    await tx
      .update(admins)
      .set({
        nombre: cuenta.nombre,
        rol,
        passwordHash: cuenta.passwordHash,
        activo: true,
        debeCambiarPassword: true,
        // Como en el panel (src/app/admin/equipo/cuentas.ts): la contrasena
        // cambia, y quizas el rol y el estado, asi que las sesiones abiertas
        // de la cuenta se cortan (ver `sesionVigente` en src/lib/sesion.ts).
        // Sin esto, restablecer desde aca la contrasena de una cuenta
        // comprometida dejaba adentro a quien ya tenia la cookie, y con la
        // provisoria marcada esa cookie podia elegir una contrasena nueva sin
        // saber la actual. Tambien evita que `activo: true` reviva las cookies
        // de una cuenta dada de baja a mano en la base.
        versionSesion: sql`${admins.versionSesion} + 1`,
      })
      .where(eq(admins.id, existente.id));

    const filas: (typeof bitacoraEquipo.$inferInsert)[] = [];
    const fila = (accion: AccionEquipo, roles: { rolAnterior: RolAdmin; rolNuevo: RolAdmin } | null) => {
      filas.push({
        adminId: null,
        adminNombre: AUTOR_CONSOLA,
        objetivoId: existente.id,
        objetivoEmail: cuenta.email,
        accion,
        ...(roles ?? {}),
      });
    };
    if (!existente.activo) fila("reactivacion", null);
    if (existente.rol !== rol) {
      fila("cambio_rol", { rolAnterior: existente.rol, rolNuevo: rol });
    }
    // Con el rol que queda en las dos columnas, como lo escribia antes el
    // script: la pantalla del equipo lo muestra sin flecha (panel.tsx).
    fila("cambio_password", { rolAnterior: rol, rolNuevo: rol });
    await tx.insert(bitacoraEquipo).values(filas);

    return { creada: false, rol, acciones: filas.map((f) => f.accion) };
  });
}
