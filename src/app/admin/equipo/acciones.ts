"use server";

/**
 * Acciones de la pantalla de equipo (/admin/equipo): alta de cuentas, cambio de
 * rol, baja y restablecimiento de la contrasena. Solo para el rol admin.
 *
 * Aca queda lo que es del pedido: la sesion (`exigirAdmin`), leer el
 * formulario, generar y hashear la provisoria, y avisarle a la pantalla. Lo que
 * decide (las reglas, los bloqueos, la version de sesion y la fila de
 * `bitacora_equipo`) vive en ./cuentas.ts, dentro de cada transaccion.
 */
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { RolAdmin } from "@/db/queries";
import { hashearPassword } from "@/lib/password";
import { esViolacionDeUnico, exigirAdmin, sinPermiso, type Resultado } from "../comun";
import { cambiarActivo, cambiarRol, darDeAlta, restablecerPassword } from "./cuentas";

const ROLES = ["admin", "moderador", "lector"] as const;

const esquemaAdmin = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nombre: z.string().trim().min(3).max(120),
  rol: z.enum(ROLES),
});

/**
 * Contrasena provisoria: 12 bytes al azar en base64url, 16 caracteres sin nada
 * que adivinar. La genera el servidor (nadie elige la contrasena de otra
 * persona) y se devuelve UNA sola vez: en la base queda solo el hash.
 */
function generarProvisoria(): string {
  return randomBytes(12).toString("base64url");
}

/** El id de la cuenta que manda el formulario, o null si no es un entero valido. */
function idDeCuenta(formulario: FormData): number | null {
  const id = Number(formulario.get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Despues de intentar escribir se revalida aunque la regla haya dicho que no:
 * "la cuenta ya estaba desactivada" o "ya no existe" quieren decir que la
 * pantalla quedo vieja (otra persona la cambio mientras estaba abierta), y asi
 * se vuelve a dibujar con lo que hay.
 */
function refrescarEquipo() {
  revalidatePath("/admin/equipo");
}

/**
 * Alta de una cuenta del backoffice. La cuenta queda marcada con
 * `debe_cambiar_password`: quien la recibe elige la suya en el primer ingreso.
 */
export async function crearAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  let datos: z.infer<typeof esquemaAdmin>;
  try {
    datos = esquemaAdmin.parse({
      email: formulario.get("email"),
      nombre: formulario.get("nombre"),
      rol: formulario.get("rol"),
    });
  } catch {
    return { ok: false, error: "Revisá el correo, el nombre y el rol." };
  }

  const provisoria = generarProvisoria();
  const hash = await hashearPassword(provisoria);

  let resultado: Resultado;
  try {
    resultado = await darDeAlta(sesion, datos, hash);
  } catch (causa) {
    console.error("[admin] crearAdmin fallo", causa);
    if (esViolacionDeUnico(causa)) {
      return { ok: false, error: `Ya hay una cuenta con ${datos.email}.` };
    }
    return { ok: false, error: "No se pudo crear la cuenta." };
  }

  refrescarEquipo();
  if (!resultado.ok) return resultado;
  // El formulario se vacia solo despues de la accion: el mensaje dice para que
  // cuenta es la provisoria, que si no quedaria suelta en la pantalla.
  return {
    ok: true,
    passwordProvisoria: provisoria,
    mensaje: `Cuenta creada para ${datos.email}.`,
  };
}

export async function cambiarRolAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDeCuenta(formulario);
  const rol = String(formulario.get("rol") ?? "");
  if (id === null) return { ok: false, error: "Cuenta inválida." };
  if (!ROLES.includes(rol as RolAdmin)) return { ok: false, error: "Rol inválido." };

  const resultado = await cambiarRol(sesion, id, rol as RolAdmin);
  refrescarEquipo();
  return resultado;
}

/** Activa o desactiva una cuenta. El campo `activo` llega como "true" o "false". */
export async function activarAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDeCuenta(formulario);
  const valor = String(formulario.get("activo") ?? "");
  if (id === null) return { ok: false, error: "Cuenta inválida." };
  if (valor !== "true" && valor !== "false") {
    return { ok: false, error: "Falta indicar si la cuenta queda activa." };
  }

  const resultado = await cambiarActivo(sesion, id, valor === "true");
  refrescarEquipo();
  return resultado;
}

/**
 * Restablece la contrasena de otra persona del equipo, que no tiene como
 * recuperarla sola (no hay recuperacion por correo). Genera una provisoria como
 * el alta, se muestra una sola vez, y la cuenta queda obligada a cambiarla.
 */
export async function restablecerPasswordAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDeCuenta(formulario);
  if (id === null) return { ok: false, error: "Cuenta inválida." };

  const provisoria = generarProvisoria();
  const hash = await hashearPassword(provisoria);

  const resultado = await restablecerPassword(sesion, id, hash);
  refrescarEquipo();
  if (!resultado.ok) return resultado;
  return { ...resultado, passwordProvisoria: provisoria };
}
