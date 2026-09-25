"use server";

/**
 * Acciones de la pantalla de equipo (/admin/equipo): alta de cuentas, cambio de
 * rol y baja. Solo para el rol admin. Cada una deja fila en `bitacora_equipo`.
 */
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, bitacoraEquipo } from "@/db/schema";
import type { RolAdmin } from "@/db/queries";
import { hashearPassword } from "@/lib/password";
import { esViolacionDeUnico, exigirAdmin, sinPermiso, type Resultado } from "../comun";

// ---------------------------------------------------------------------------
// Equipo del backoffice
// ---------------------------------------------------------------------------

const ROLES = ["admin", "moderador", "lector"] as const;

const esquemaAdmin = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nombre: z.string().trim().min(3).max(120),
  rol: z.enum(ROLES),
});

/**
 * Alta de una cuenta del backoffice.
 *
 * La contrasena provisoria la genera el servidor (nadie la elige por la otra
 * persona) y se devuelve UNA sola vez, para que la pantalla la muestre y quien
 * la recibe la cambie en el primer ingreso: la cuenta queda marcada con
 * `debeCambiarPassword`.
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

  const [existente] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, datos.email))
    .limit(1);
  if (existente) return { ok: false, error: `Ya hay una cuenta con ${datos.email}.` };

  // 12 bytes al azar en base64url: 16 caracteres, sin nada que adivinar.
  const provisoria = randomBytes(12).toString("base64url");
  const hash = await hashearPassword(provisoria);

  try {
    await db.transaction(async (tx) => {
      const [creado] = await tx
        .insert(admins)
        .values({
          email: datos.email,
          nombre: datos.nombre,
          passwordHash: hash,
          rol: datos.rol,
          activo: true,
          debeCambiarPassword: true,
        })
        .returning({ id: admins.id });

      await tx.insert(bitacoraEquipo).values({
        adminId: sesion.adminId,
        adminNombre: sesion.nombre,
        objetivoId: creado.id,
        objetivoEmail: datos.email,
        accion: "alta",
        rolNuevo: datos.rol,
      });
    });
  } catch (causa) {
    console.error("[admin] crearAdmin fallo", causa);
    if (esViolacionDeUnico(causa)) {
      return { ok: false, error: `Ya hay una cuenta con ${datos.email}.` };
    }
    return { ok: false, error: "No se pudo crear la cuenta." };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    passwordProvisoria: provisoria,
    mensaje:
      "Contraseña provisoria generada. Se muestra una sola vez: copiala y entregala en mano. Quien la reciba tiene que cambiarla al ingresar.",
  };
}

export async function cambiarRolAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  const rol = String(formulario.get("rol"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Cuenta inválida." };
  if (!ROLES.includes(rol as RolAdmin)) return { ok: false, error: "Rol inválido." };

  // Nadie se cambia el rol a si mismo: es lo que evita que el ultimo admin se
  // degrade y deje el backoffice sin nadie que pueda administrarlo.
  if (id === sesion.adminId) {
    return { ok: false, error: "No podés cambiarte el rol a vos mismo. Pedíselo a otro administrador." };
  }

  const [cuenta] = await db
    .select({ id: admins.id, email: admins.email, rol: admins.rol })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!cuenta) return { ok: false, error: "La cuenta no existe." };
  if (cuenta.rol === rol) return { ok: false, error: "La cuenta ya tiene ese rol." };

  await db.transaction(async (tx) => {
    await tx
      .update(admins)
      .set({ rol: rol as RolAdmin })
      .where(eq(admins.id, id));
    await tx.insert(bitacoraEquipo).values({
      adminId: sesion.adminId,
      adminNombre: sesion.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: "cambio_rol",
      rolAnterior: cuenta.rol,
      rolNuevo: rol as RolAdmin,
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Activa o desactiva una cuenta. El campo `activo` llega como "true" o "false". */
export async function activarAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  const valor = String(formulario.get("activo") ?? "");
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Cuenta inválida." };
  if (valor !== "true" && valor !== "false") {
    return { ok: false, error: "Falta indicar si la cuenta queda activa." };
  }
  const activo = valor === "true";

  if (id === sesion.adminId && !activo) {
    return { ok: false, error: "No podés desactivar tu propia cuenta." };
  }

  const [cuenta] = await db
    .select({ id: admins.id, email: admins.email, activo: admins.activo })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!cuenta) return { ok: false, error: "La cuenta no existe." };
  if (cuenta.activo === activo) {
    return {
      ok: false,
      error: activo ? "La cuenta ya está activa." : "La cuenta ya estaba desactivada.",
    };
  }

  await db.transaction(async (tx) => {
    await tx.update(admins).set({ activo }).where(eq(admins.id, id));
    await tx.insert(bitacoraEquipo).values({
      adminId: sesion.adminId,
      adminNombre: sesion.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: activo ? "reactivacion" : "desactivacion",
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
