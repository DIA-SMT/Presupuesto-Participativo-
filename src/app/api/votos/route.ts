/**
 * Emision del voto. Las reglas del programa, aplicadas en orden:
 *   1. Hay una edicion activa y esta en etapa de votacion.
 *   2. La persona tiene sesion de votante (empadronada).
 *   3. El proyecto existe, esta publicado y es factible.
 *   4. El proyecto pertenece al distrito de la persona.
 *   5. Un voto por persona por edicion: lo garantiza ademas una restriccion
 *      UNIQUE en la base, asi que ni una condicion de carrera lo rompe.
 */
import { z } from "zod";
import { and, eq, sql as incremento } from "drizzle-orm";
import { db } from "@/db";
import { distritos, ideas, votos } from "@/db/schema";
import { getEdicionActiva } from "@/db/queries";
import { getSesionVotante } from "@/lib/sesion";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

const esquema = z.object({ slug: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const ipHash = hashearIp(ipDe(request));
  const limite = await consumir(`votos:${ipHash}`, 20, 600);
  if (!limite.permitido) {
    return Response.json({ error: "Demasiados intentos." }, { status: 429 });
  }

  const edicion = await getEdicionActiva();
  if (!edicion) {
    return Response.json({ error: "No hay una edición activa." }, { status: 503 });
  }
  if (edicion.etapa !== "votacion") {
    return Response.json(
      { error: "La votación no está abierta en este momento." },
      { status: 409 },
    );
  }

  const sesion = await getSesionVotante();
  if (!sesion) {
    return Response.json(
      { error: "Para votar primero tenés que empadronarte." },
      { status: 401 },
    );
  }
  if (!sesion.distrito) {
    return Response.json(
      {
        error:
          "Tu empadronamiento no tiene un distrito asignado. Acercate a una asamblea participativa para completarlo.",
      },
      { status: 403 },
    );
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(await request.json());
  } catch {
    return Response.json({ error: "Falta el proyecto a votar." }, { status: 400 });
  }

  const [idea] = await db
    .select({
      id: ideas.id,
      estado: ideas.estado,
      publicada: ideas.publicada,
      distritoNumero: distritos.numero,
      distritoId: ideas.distritoId,
      titulo: ideas.titulo,
    })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .where(and(eq(ideas.slug, datos.slug), eq(ideas.edicionId, edicion.id)))
    .limit(1);

  if (!idea || !idea.publicada) {
    return Response.json({ error: "Ese proyecto no existe." }, { status: 404 });
  }
  if (idea.estado !== "factible") {
    return Response.json(
      { error: "Solo se pueden votar los proyectos declarados factibles." },
      { status: 409 },
    );
  }
  if (idea.distritoNumero !== sesion.distrito) {
    return Response.json(
      {
        error: `Podés votar únicamente un proyecto de tu distrito (Distrito ${sesion.distrito}).`,
      },
      { status: 403 },
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(votos).values({
        edicionId: edicion.id,
        votanteId: sesion.votanteId,
        ideaId: idea.id,
        distritoId: idea.distritoId!,
        ipHash,
      });
      await tx
        .update(ideas)
        .set({ votos: incremento`${ideas.votos} + 1` })
        .where(eq(ideas.id, idea.id));
    });
  } catch (causa) {
    // La restriccion UNIQUE (edicion, votante) dispara aca si ya voto. Drizzle
    // envuelve el error original, asi que se recorre la cadena de causas.
    let mensaje = "";
    for (let error: unknown = causa; error instanceof Error; error = error.cause) {
      mensaje += ` ${error.message}`;
    }
    if (mensaje.includes("votos_una_persona_un_voto")) {
      return Response.json(
        { error: "Ya usaste tu voto en esta edición. Es un voto por persona." },
        { status: 409 },
      );
    }
    console.error("[votos] fallo", causa);
    return Response.json({ error: "No se pudo registrar el voto." }, { status: 500 });
  }

  return Response.json({ ok: true, proyecto: idea.titulo }, { status: 201 });
}
