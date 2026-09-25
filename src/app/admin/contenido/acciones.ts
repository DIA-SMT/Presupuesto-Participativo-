"use server";

/**
 * Acciones de la pantalla de contenido (/admin/contenido): los textos del sitio
 * y las novedades. Cada una deja fila en `bitacora_sistema`.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bitacoraSistema, novedades, textos } from "@/db/schema";
import { slugificar } from "@/lib/texto";
import { exigirAdmin, filaSistema, sinPermiso, type Resultado } from "../comun";

// ---------------------------------------------------------------------------
// Contenido editable
// ---------------------------------------------------------------------------

/**
 * Guarda un texto del sitio (la tabla `textos`, lo que el sitio anterior servia
 * por /api/text sin autenticacion).
 *
 * El valor anterior se lee antes del upsert: la tabla no tiene historial, asi
 * que despues de escribir la version vieja no existe mas en ningun lado. En la
 * bitacora el ANTES y el DESPUES van recortados (`MAXIMO_VALOR_BITACORA`): un
 * texto puede ser un parrafo entero y esto audita que cambio, no guarda
 * versiones.
 */
export async function guardarTexto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const clave = String(formulario.get("clave") ?? "").trim();
  const valor = String(formulario.get("valor") ?? "").trim();
  if (!clave || clave.length > 100) return { ok: false, error: "Clave inválida." };

  const [anterior] = await db
    .select({ valor: textos.valor })
    .from(textos)
    .where(eq(textos.clave, clave))
    .limit(1);

  // Guardar dos veces el mismo texto no es un cambio: no deja fila.
  if (anterior && anterior.valor === valor) {
    return { ok: true, mensaje: "El texto ya estaba así: no se registró ningún cambio." };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(textos)
      .values({ clave, valor })
      .onConflictDoUpdate({ target: textos.clave, set: { valor, updatedAt: new Date() } });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "texto_guardado",
        entidad: "texto",
        // Un texto se identifica por su clave, no por un id: va en la etiqueta.
        entidadId: null,
        etiqueta: clave,
        antes: anterior ? anterior.valor || "(vacío)" : null,
        despues: valor || "(vacío)",
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Publica una novedad en la portada del sitio. */
export async function crearNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const titulo = String(formulario.get("titulo") ?? "").trim();
  const cuerpo = String(formulario.get("cuerpo") ?? "").trim();
  const fecha = String(formulario.get("fecha") ?? "").trim();
  const copete = String(formulario.get("copete") ?? "").trim();
  if (titulo.length < 3 || !cuerpo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Completá título, fecha y cuerpo." };
  }

  const slug = `${slugificar(titulo)}-${Date.now().toString(36)}`;

  await db.transaction(async (tx) => {
    const [creada] = await tx
      .insert(novedades)
      .values({ titulo, slug, copete: copete || null, cuerpo, fecha })
      .returning({ id: novedades.id });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "novedad_creada",
        entidad: "novedad",
        entidadId: creada.id,
        etiqueta: titulo,
        // No hay ANTES: la novedad no existia.
        despues: `Fecha ${fecha} · publicada · ${slug} · ${copete || cuerpo}`,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
