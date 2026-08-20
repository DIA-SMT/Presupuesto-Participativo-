"use server";

/**
 * Server actions del backoffice. Toda accion valida la sesion de admin y su
 * rol antes de tocar la base ("lector" no puede escribir).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, avances, ediciones, ideas, novedades, textos } from "@/db/schema";
import { verificarPassword } from "@/lib/password";
import {
  cerrarSesionAdmin,
  crearSesionAdmin,
  getSesionAdmin,
  type SesionAdmin,
} from "@/lib/sesion";
import { slugificar } from "@/lib/texto";

type Resultado = { ok: true } | { ok: false; error: string };

async function exigirEscritura(): Promise<SesionAdmin | null> {
  const sesion = await getSesionAdmin();
  if (!sesion || sesion.rol === "lector") return null;
  return sesion;
}

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export async function ingresarAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const email = String(formulario.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formulario.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Completá el correo y la contraseña." };

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  // La verificacion corre aunque el usuario no exista, para no revelar
  // por tiempo de respuesta cuales correos estan registrados.
  const hashFalso =
    "scrypt$64$0000000000000000000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
  const valido = await verificarPassword(password, admin?.passwordHash ?? hashFalso);

  if (!admin || !admin.activo || !valido) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  await crearSesionAdmin({ adminId: admin.id, email: admin.email, rol: admin.rol });
  redirect("/admin");
}

export async function salirAdmin(): Promise<void> {
  await cerrarSesionAdmin();
  redirect("/admin/ingresar");
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

const esquemaIdea = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.enum(["pendiente", "factible", "no_factible", "integrado", "ganador"]),
  motivoEstado: z.string().trim().max(5000).optional(),
  publicada: z.coerce.boolean(),
  ganador: z.coerce.boolean(),
  votosManual: z.coerce.number().int().min(0).optional(),
  presupuestoTotal: z
    .union([z.coerce.number().min(0), z.literal(""), z.null()])
    .optional(),
  estadoPresupuesto: z.enum([
    "sin_asignar",
    "preparacion",
    "contratacion",
    "ejecucion",
    "finalizado",
  ]),
});

export async function actualizarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirEscritura())) return { ok: false, error: "Sesión sin permisos." };

  let datos: z.infer<typeof esquemaIdea>;
  try {
    datos = esquemaIdea.parse({
      id: formulario.get("id"),
      estado: formulario.get("estado"),
      motivoEstado: formulario.get("motivoEstado") ?? undefined,
      publicada: formulario.get("publicada") === "on",
      ganador: formulario.get("ganador") === "on",
      votosManual: formulario.get("votos") || undefined,
      presupuestoTotal: formulario.get("presupuestoTotal") || null,
      estadoPresupuesto: formulario.get("estadoPresupuesto"),
    });
  } catch {
    return { ok: false, error: "Datos inválidos." };
  }

  await db
    .update(ideas)
    .set({
      estado: datos.ganador ? "ganador" : datos.estado,
      motivoEstado: datos.motivoEstado || null,
      publicada: datos.publicada,
      ganador: datos.ganador,
      ...(datos.votosManual !== undefined ? { votos: datos.votosManual } : {}),
      presupuestoTotal:
        datos.presupuestoTotal === null || datos.presupuestoTotal === ""
          ? null
          : String(datos.presupuestoTotal),
      estadoPresupuesto: datos.estadoPresupuesto,
      updatedAt: new Date(),
    })
    .where(eq(ideas.id, datos.id));

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Avances de obra
// ---------------------------------------------------------------------------

const esquemaAvance = z.object({
  ideaId: z.coerce.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  etapa: z.enum(["preparacion", "contratacion", "ejecucion", "finalizado"]),
  titulo: z.string().trim().min(3).max(200),
  descripcion: z.string().trim().max(3000).optional(),
  monto: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  porcentaje: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).optional(),
});

export async function crearAvance(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirEscritura())) return { ok: false, error: "Sesión sin permisos." };

  let datos: z.infer<typeof esquemaAvance>;
  try {
    datos = esquemaAvance.parse({
      ideaId: formulario.get("ideaId"),
      fecha: formulario.get("fecha"),
      etapa: formulario.get("etapa"),
      titulo: formulario.get("titulo"),
      descripcion: formulario.get("descripcion") ?? undefined,
      monto: formulario.get("monto") ?? "",
      porcentaje: formulario.get("porcentaje") ?? "",
    });
  } catch {
    return { ok: false, error: "Revisá los campos del avance." };
  }

  await db.insert(avances).values({
    ideaId: datos.ideaId,
    fecha: datos.fecha,
    etapa: datos.etapa,
    titulo: datos.titulo,
    descripcion: datos.descripcion || null,
    monto: datos.monto === "" || datos.monto === undefined ? null : String(datos.monto),
    porcentaje:
      datos.porcentaje === "" || datos.porcentaje === undefined ? null : datos.porcentaje,
  });

  // El estado del presupuesto acompaña al ultimo avance publicado.
  await db
    .update(ideas)
    .set({ estadoPresupuesto: datos.etapa, updatedAt: new Date() })
    .where(eq(ideas.id, datos.ideaId));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function borrarAvance(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirEscritura())) return { ok: false, error: "Sesión sin permisos." };
  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "Avance inválido." };
  await db.delete(avances).where(eq(avances.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Edicion y textos
// ---------------------------------------------------------------------------

export async function cambiarEtapa(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await getSesionAdmin();
  if (!sesion || sesion.rol !== "admin") {
    return { ok: false, error: "Solo un admin puede cambiar la etapa." };
  }

  const id = Number(formulario.get("edicionId"));
  const etapa = String(formulario.get("etapa"));
  const etapas = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;
  if (!Number.isInteger(id) || !etapas.includes(etapa as (typeof etapas)[number])) {
    return { ok: false, error: "Etapa inválida." };
  }

  await db
    .update(ediciones)
    .set({ etapa: etapa as (typeof etapas)[number] })
    .where(eq(ediciones.id, id));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function guardarTexto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirEscritura())) return { ok: false, error: "Sesión sin permisos." };

  const clave = String(formulario.get("clave") ?? "").trim();
  const valor = String(formulario.get("valor") ?? "").trim();
  if (!clave || clave.length > 100) return { ok: false, error: "Clave inválida." };

  await db
    .insert(textos)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: textos.clave, set: { valor, updatedAt: new Date() } });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function crearNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirEscritura())) return { ok: false, error: "Sesión sin permisos." };

  const titulo = String(formulario.get("titulo") ?? "").trim();
  const cuerpo = String(formulario.get("cuerpo") ?? "").trim();
  const fecha = String(formulario.get("fecha") ?? "").trim();
  const copete = String(formulario.get("copete") ?? "").trim();
  if (titulo.length < 3 || !cuerpo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Completá título, fecha y cuerpo." };
  }

  await db.insert(novedades).values({
    titulo,
    slug: `${slugificar(titulo)}-${Date.now().toString(36)}`,
    copete: copete || null,
    cuerpo,
    fecha,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
