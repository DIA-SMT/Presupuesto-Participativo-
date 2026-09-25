/**
 * Sesiones firmadas con JWT (cookie httpOnly). Dos tipos independientes:
 *  - votante: vecino empadronado via CIDITUC (o el login "dev" en desarrollo)
 *  - admin: usuario del backoffice
 *
 * La del votante vale lo que dice el token. La del panel NO: el token dice
 * quien es y con que version de sus sesiones entro, y en cada pedido esa
 * version se compara con la de la base (ver `validarTokenAdmin`). Asi una baja,
 * un cambio de rol o de contrasena cortan las sesiones abiertas en el momento,
 * y no cuando vence la cookie.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCuentaDeSesion, type CuentaDeSesion, type RolAdmin } from "@/db/queries";
import { atributosCookie, borradoCookie, nombreCookie } from "@/lib/cookies";

// En produccion llevan el prefijo __Host- (ver src/lib/cookies.ts): otro
// sistema bajo *.smt.gob.ar no las puede plantar ni pisar. Escritura, lectura
// y borrado usan estas dos constantes y nada mas.
const COOKIE_VOTANTE = nombreCookie("pp_votante");
const COOKIE_ADMIN = nombreCookie("pp_admin");
const DURACION_VOTANTE = 60 * 60 * 4; // 4 horas: alcanza para votar
const DURACION_ADMIN = 60 * 60 * 12;

function clave(): Uint8Array {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error("SESSION_SECRET faltante o demasiado corto (minimo 32 caracteres).");
  }
  return new TextEncoder().encode(secreto);
}

export type SesionVotante = {
  tipo: "votante";
  votanteId: number;
  distrito: number | null;
  nombre: string | null;
};

async function firmar(datos: object, duracion: number): Promise<string> {
  return new SignJWT({ ...datos })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${duracion}s`)
    .sign(clave());
}

async function leer<T>(token: string | undefined, tipo: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave());
    if (payload.tipo !== tipo) return null;
    return payload as T;
  } catch {
    return null;
  }
}

// --- Votante ----------------------------------------------------------------

export async function crearSesionVotante(datos: Omit<SesionVotante, "tipo">) {
  const token = await firmar({ tipo: "votante", ...datos }, DURACION_VOTANTE);
  (await cookies()).set(COOKIE_VOTANTE, token, {
    ...atributosCookie(),
    maxAge: DURACION_VOTANTE,
  });
}

export async function getSesionVotante(): Promise<SesionVotante | null> {
  const token = (await cookies()).get(COOKIE_VOTANTE)?.value;
  return leer<SesionVotante>(token, "votante");
}

/**
 * Cierra la sesion del votante. La llaman el boton "Salir" del panel de
 * votacion (POST /api/auth/salir) y la emision del voto: una vez registrado, la
 * sesion ya no sirve para nada, y en una tablet de asamblea quedaria abierta
 * para la persona que sigue en la fila.
 *
 * Solo cierra NUESTRA sesion. Si CIDITUC mantiene la suya en ese navegador,
 * eso es de CIDITUC y desde aca no se puede cerrar.
 */
export async function cerrarSesionVotante() {
  (await cookies()).delete(borradoCookie(COOKIE_VOTANTE));
}

// --- Admin --------------------------------------------------------------------

/**
 * Lo que va firmado en la cookie del panel: quien es y la version de sus
 * sesiones con la que entro. Nada mas. El rol, el nombre y el correo NO viajan
 * en el token (antes viajaban): salen de la base en cada pedido, asi que una
 * cookie vieja no puede traer un rol viejo.
 */
export type DatosTokenAdmin = { adminId: number; version: number };

/**
 * La sesion del panel YA validada contra la base: todo lo que trae salio de la
 * fila de `admins` en este pedido, no de la cookie.
 */
export type SesionAdmin = {
  tipo: "admin";
  adminId: number;
  email: string;
  nombre: string;
  rol: RolAdmin;
  /** La version de las sesiones de la cuenta; coincide con la del token. */
  version: number;
  /** Entro con una contrasena provisoria y todavia no eligio la suya. */
  debeCambiarPassword: boolean;
};

/**
 * La unica pantalla del panel que atiende a una cuenta con la contrasena
 * provisoria sin cambiar (ademas de Salir, que es una accion y no una pagina).
 */
export const RUTA_PASSWORD_ADMIN = "/admin/password";

/** El token del panel, firmado. Lo usan `crearSesionAdmin` y las pruebas. */
export async function firmarTokenAdmin(datos: DatosTokenAdmin): Promise<string> {
  return firmar(
    { tipo: "admin", adminId: datos.adminId, version: datos.version },
    DURACION_ADMIN,
  );
}

/**
 * Abre (o reemite) la sesion del panel en este navegador. La llaman el ingreso
 * y el cambio de la propia contrasena: ese cambio sube la version, y reemitir la
 * cookie con la nueva es lo que deja adentro a quien la cambio mientras se
 * cierran sus OTRAS sesiones.
 */
export async function crearSesionAdmin(datos: DatosTokenAdmin) {
  const token = await firmarTokenAdmin(datos);
  (await cookies()).set(COOKIE_ADMIN, token, {
    ...atributosCookie(),
    maxAge: DURACION_ADMIN,
  });
}

/**
 * Firma buena, sin vencer, de tipo admin, y con id y version enteros. Un token
 * de antes de que existiera la version (sin `version`) NO pasa: al desplegar
 * esto, las sesiones abiertas del panel se cierran una vez y hay que volver a
 * ingresar. Tomar la version ausente como 0 las habria dejado vivas, pero
 * tambien habria dejado un camino permanente para tokens sin version.
 */
async function leerTokenAdmin(token: string | undefined): Promise<DatosTokenAdmin | null> {
  const datos = await leer<Record<string, unknown>>(token, "admin");
  if (!datos) return null;
  const { adminId, version } = datos;
  if (typeof adminId !== "number" || !Number.isSafeInteger(adminId)) return null;
  if (typeof version !== "number" || !Number.isSafeInteger(version)) return null;
  return { adminId, version };
}

/**
 * Si la fila de la base todavia respalda al token: la cuenta existe, esta
 * activa y tiene la MISMA version de sesiones con la que se firmo. Cualquier
 * baja, cambio de rol o de contrasena sube esa version (src/app/admin/equipo/
 * cuentas.ts), y desde ese momento todos los tokens anteriores dejan de valer.
 */
export function sesionVigente(token: DatosTokenAdmin, cuenta: CuentaDeSesion | null): boolean {
  return (
    cuenta !== null &&
    cuenta.id === token.adminId &&
    cuenta.activo &&
    cuenta.versionSesion === token.version
  );
}

/**
 * El token del panel, validado contra la base: la sesion con los datos de la
 * base, o null si no hay token, si no vale o si la base ya no lo respalda. Es
 * "como no tener sesion": nadie distingue entre una cookie vencida y una
 * cortada.
 *
 * Una consulta (`getCuentaDeSesion`, una fila por clave primaria). Recibe el
 * token y no lo busca en la cookie para poder probarse sin un pedido de Next
 * (scripts/tests/sesion-panel.test.ts); el resto del codigo pasa por
 * `getSesionAdmin`.
 */
export async function validarTokenAdmin(token: string | undefined): Promise<SesionAdmin | null> {
  const datos = await leerTokenAdmin(token);
  if (!datos) return null;
  const cuenta = await getCuentaDeSesion(datos.adminId);
  if (!cuenta || !sesionVigente(datos, cuenta)) return null;
  return {
    tipo: "admin",
    adminId: cuenta.id,
    email: cuenta.email,
    nombre: cuenta.nombre,
    rol: cuenta.rol,
    version: cuenta.versionSesion,
    debeCambiarPassword: cuenta.debeCambiarPassword,
  };
}

/**
 * Una sola validacion por render. En un mismo pedido la piden el layout raiz
 * (el atajo al panel del encabezado), el layout del panel y la pagina: con
 * `cache` de React la consulta corre una vez. `cache` memoiza solo durante un
 * render de server components; en una server action o en una ruta cada llamada
 * consulta de nuevo, y eso esta bien: `exigirAdmin` la llama una vez por accion,
 * y el render que sigue a una accion arranca de cero y ve la cookie que la
 * accion haya reemitido.
 */
const sesionAdminDelPedido = cache(async (): Promise<SesionAdmin | null> =>
  validarTokenAdmin((await cookies()).get(COOKIE_ADMIN)?.value),
);

/**
 * LA sesion del panel. La usan el layout, cada pagina del panel y, a traves de
 * `exigirAdmin` (src/app/admin/comun.ts), cada accion: es la unica validacion
 * de sesion + base que hay, y no se repite en ningun otro lado.
 *
 * Con la contrasena provisoria sin cambiar, redirige a /admin/password: asi
 * TODO el panel (cada pagina, y cada accion que escribe) manda a cambiarla sin
 * que cada pantalla tenga que acordarse. `redirect` funciona igual en una
 * pagina y en una server action (en la accion es una navegacion del cliente, y
 * no se escribe nada). Solo pasan `permitirPasswordProvisoria` la pantalla de
 * la contrasena, su accion y el layout, que envuelve tambien a esa pantalla.
 *
 * Quien la llama con `.catch(() => null)` (el layout raiz, src/lib/
 * modo-prueba.ts) se traga esa redireccion y ve "sin sesion", que es lo que
 * corresponde: con la provisoria no se usa el atajo al panel ni la carga fuera
 * de etapa.
 */
export async function getSesionAdmin(
  opciones: { permitirPasswordProvisoria?: boolean } = {},
): Promise<SesionAdmin | null> {
  const sesion = await sesionAdminDelPedido();
  if (sesion?.debeCambiarPassword && !opciones.permitirPasswordProvisoria) {
    redirect(RUTA_PASSWORD_ADMIN);
  }
  return sesion;
}

export async function cerrarSesionAdmin() {
  (await cookies()).delete(borradoCookie(COOKIE_ADMIN));
}
