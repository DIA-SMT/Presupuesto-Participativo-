/**
 * El voto, dentro de su transaccion.
 *
 * La ruta (route.ts) ya controlo la etapa, la idea y el distrito ANTES de
 * llegar aca, con lecturas comunes. Entre ese control y el INSERT pasa un
 * momento, y en ese momento el equipo puede cerrar la votacion o volverla
 * atras desde el panel (cambiarEtapa), o sacar la idea de la boleta. Sin volver
 * a mirar, un voto que habia pasado el control justo antes entraba igual (a lo
 * sumo esperaba a que el panel soltara la fila de la edicion), en una votacion
 * que ya no estaba abierta.
 *
 * Por eso aca se relee lo que importa, con bloqueo y en este orden:
 *
 *  1. La edicion, con `FOR SHARE`. Los votos no se estorban entre si (el
 *     bloqueo compartido es compatible consigo mismo), pero el UPDATE de la
 *     etapa no: espera a que terminen los votos que ya tienen la fila, y un voto
 *     que llega despues del UPDATE espera a que el cambio se confirme y lee la
 *     etapa NUEVA (en READ COMMITTED, el SELECT que bloquea devuelve la ultima
 *     version confirmada de la fila). No queda un hueco en el que un voto entre
 *     con la votacion ya cerrada. Se mira tambien `activa`: activar otra edicion
 *     cierra esta aunque su etapa siga diciendo "votacion".
 *  2. La idea, con `FOR NO KEY UPDATE`, que es el bloqueo que igual iba a tomar
 *     el UPDATE del contador, pedido desde el principio. Con `FOR SHARE` dos
 *     votos a la misma idea se trababan: los dos con el bloqueo compartido y
 *     cada uno esperando al otro para subir el contador, hasta que Postgres
 *     abortaba uno por deadlock. Asi los votos a una misma idea hacen fila (ya
 *     la hacian en el UPDATE) y un cambio de estado desde el panel no se cuela
 *     entre la lectura y el INSERT. Ademas del estado y `publicada` se compara
 *     el distrito: si el equipo mudo la idea de distrito, el control de la ruta
 *     se hizo contra el viejo.
 *
 * Primero la edicion y despues la idea, de padre a hijo: una accion del panel
 * que tome las dos filas en el mismo orden no puede cruzarse con un voto en un
 * deadlock.
 *
 * `of` nombra la tabla aunque la consulta tenga una sola: si algun dia se le
 * suma un join, el bloqueo sigue cayendo sobre esa fila y no sobre todas.
 *
 * Aca no se lee ninguna cookie (la sesion la resuelve la ruta), asi que esto
 * se prueba contra una base de verdad sin contexto de request
 * (scripts/tests/registro-voto.test.ts). Lo que esa prueba no puede mostrar
 * es la espera entre dos transacciones: PGlite atiende de a una.
 */
import { and, eq, sql as incremento } from "drizzle-orm";
import { db } from "@/db";
import { ediciones, ideas, votos } from "@/db/schema";

export type DatosVoto = {
  edicionId: number;
  votanteId: number;
  ideaId: number;
  /** El distrito de la idea que la ruta comparo con el de la persona. */
  distritoId: number;
  ipHash: string;
};

/**
 * Por que la relectura puede no dejar pasar el voto. Que la persona ya haya
 * votado NO esta aca: lo dice la restriccion UNIQUE de la base con un error, y
 * la ruta lo reconoce por el nombre de la restriccion.
 */
export type MotivoRechazo = "votacion-cerrada" | "proyecto-no-disponible";

export type ResultadoVoto = { ok: true } | { ok: false; motivo: MotivoRechazo };

export async function registrarVoto(datos: DatosVoto): Promise<ResultadoVoto> {
  return db.transaction(async (tx): Promise<ResultadoVoto> => {
    const [edicion] = await tx
      .select({ etapa: ediciones.etapa, activa: ediciones.activa })
      .from(ediciones)
      .where(eq(ediciones.id, datos.edicionId))
      .for("share", { of: ediciones });
    if (!edicion || !edicion.activa || edicion.etapa !== "votacion") {
      return { ok: false, motivo: "votacion-cerrada" };
    }

    const [idea] = await tx
      .select({
        estado: ideas.estado,
        publicada: ideas.publicada,
        distritoId: ideas.distritoId,
      })
      .from(ideas)
      .where(and(eq(ideas.id, datos.ideaId), eq(ideas.edicionId, datos.edicionId)))
      .for("no key update", { of: ideas });
    if (
      !idea ||
      !idea.publicada ||
      idea.estado !== "factible" ||
      idea.distritoId !== datos.distritoId
    ) {
      return { ok: false, motivo: "proyecto-no-disponible" };
    }

    await tx.insert(votos).values({
      edicionId: datos.edicionId,
      votanteId: datos.votanteId,
      ideaId: datos.ideaId,
      distritoId: datos.distritoId,
      ipHash: datos.ipHash,
    });
    await tx
      .update(ideas)
      .set({ votos: incremento`${ideas.votos} + 1` })
      .where(eq(ideas.id, datos.ideaId));
    return { ok: true };
  });
}
