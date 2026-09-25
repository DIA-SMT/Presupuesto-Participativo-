/**
 * Emision del voto. Las reglas del programa, aplicadas en orden:
 *   1. Hay una edicion activa y esta en etapa de votacion.
 *   2. La persona tiene sesion de votante (empadronada).
 *   3. El proyecto existe, esta publicado y es factible.
 *   4. El proyecto pertenece al distrito de la persona.
 *   5. Un voto por persona por edicion: lo garantiza ademas una restriccion
 *      UNIQUE en la base, asi que ni una condicion de carrera lo rompe.
 *
 * Las reglas 1, 3 y 4 se vuelven a mirar dentro de la transaccion del voto,
 * con bloqueo (registrar.ts): el control de aca abajo es una lectura comun, y
 * el equipo puede cerrar la votacion o sacar la idea de la boleta en el
 * instante que va del control al INSERT.
 *
 * Antes que todo eso, el pedido tiene que haber salido de este sitio
 * (src/lib/origen.ts): la cookie Lax viaja tambien desde cualquier
 * *.smt.gob.ar, y un formulario text/plain puede armar un JSON valido.
 *
 * Con el voto registrado, la sesion se cierra en la misma respuesta. La
 * pantalla de "Gracias" queda en el navegador (la dibuja el panel), pero la
 * cookie ya no sirve: en una tablet de asamblea, la persona que sigue no
 * hereda la identidad de la anterior. Si alguien vuelve a /votar, pasa por
 * /ingresar, entra de nuevo con CIDITUC y a la vuelta ve "ya usaste tu voto".
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { distritos, ideas } from "@/db/schema";
import { getEdicionActiva } from "@/db/queries";
import { cerrarSesionVotante, getSesionVotante } from "@/lib/sesion";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import { exigirMismoOrigen } from "@/lib/origen";
import { registrarVoto, type MotivoRechazo, type ResultadoVoto } from "./registrar";

export const runtime = "nodejs";

const esquema = z.object({ slug: z.string().min(1).max(200) });

/**
 * Cuando la relectura de la transaccion no coincide con el control de la
 * ruta. Dicen "justo cuando": si el cambio hubiera sido antes, lo habria
 * frenado el control, con su propio mensaje.
 */
const MENSAJE_RECHAZO: Record<MotivoRechazo, string> = {
  "votacion-cerrada":
    "La votación se cerró justo cuando enviabas tu voto, así que no se registró.",
  "proyecto-no-disponible":
    "Ese proyecto salió de la boleta justo cuando enviabas tu voto, así que no se registró. Recargá la página para ver los proyectos que se pueden votar.",
};

export async function POST(request: Request) {
  // Primero, antes del rate limit: un pedido ajeno no tiene que gastarle los
  // intentos a la conexion de la persona.
  const rechazo = exigirMismoOrigen(request);
  if (rechazo) return rechazo;

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
    // Ahora la sesion tambien se cierra al votar y con "Salir", asi que esto
    // lo ve sobre todo quien voto en otra pestaña: "empadronate" lo mandaba a
    // buscar un tramite que ya hizo.
    return Response.json(
      { error: "Tu sesión se cerró o venció. Ingresá de nuevo para votar." },
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

  let resultado: ResultadoVoto;
  try {
    resultado = await registrarVoto({
      edicionId: edicion.id,
      votanteId: sesion.votanteId,
      ideaId: idea.id,
      distritoId: idea.distritoId!,
      ipHash,
    });
  } catch (causa) {
    // La restriccion UNIQUE (edicion, votante) dispara aca si ya voto. Drizzle
    // envuelve el error original, asi que se recorre la cadena de causas.
    let mensaje = "";
    for (let error: unknown = causa; error instanceof Error; error = error.cause) {
      mensaje += ` ${error.message}`;
    }
    if (mensaje.includes("votos_una_persona_un_voto")) {
      // Ya habia votado (otra pestaña, otro dispositivo): la sesion tampoco le
      // sirve para nada mas, y se cierra igual que con un voto nuevo.
      // `yaVoto` le dice al panel que pase a la pantalla de "ya votaste" en
      // vez de dejar la boleta con un error.
      await cerrarSesionVotante();
      return Response.json(
        { error: "Ya usaste tu voto en esta edición. Es un voto por persona.", yaVoto: true },
        { status: 409 },
      );
    }
    console.error("[votos] fallo", causa);
    return Response.json({ error: "No se pudo registrar el voto." }, { status: 500 });
  }

  // La sesion NO se cierra aca: si fue la idea la que salio de la boleta, la
  // persona todavia puede votar otra.
  if (!resultado.ok) {
    return Response.json({ error: MENSAJE_RECHAZO[resultado.motivo] }, { status: 409 });
  }

  // Recien aca, con la transaccion confirmada: si el insert fallo, la persona
  // sigue con su sesion y puede reintentar.
  await cerrarSesionVotante();
  return Response.json({ ok: true, proyecto: idea.titulo }, { status: 201 });
}
