import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { avances } from "@/db/schema";
import { getEdicionActiva, listarIdeas } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelObras from "./panel";

/**
 * Pantalla de obras del backoffice: los proyectos ganadores de la edicion
 * activa con su presupuesto asignado y sus avances.
 *
 * El listado de ganadores y los datos de cada idea salen de src/db/queries.ts;
 * el historial de avances es la unica consulta armada aca (no hay todavia una
 * funcion de queries.ts que traiga los avances de varias ideas de una vez).
 */
export default async function AdminObras() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const edicion = await getEdicionActiva();
  if (!edicion) return <p>No hay una edición activa.</p>;

  const ganadores = await listarIdeas({
    edicionId: edicion.id,
    soloGanadores: true,
    incluirNoPublicadas: true,
  });

  const historial = ganadores.length
    ? await db
        .select()
        .from(avances)
        .where(inArray(avances.ideaId, ganadores.map((g) => g.id)))
        .orderBy(desc(avances.fecha))
    : [];

  return (
    <PanelObras
      // El rol completo, no un booleano: el monto del presupuesto lo edita solo
      // un admin (guardarPresupuestoIdea), mientras los avances los carga
      // cualquier moderador.
      rol={sesion.rol}
      proyectos={ganadores.map((idea) => ({
        id: idea.id,
        titulo: idea.titulo,
        distrito: idea.distrito,
        estadoPresupuesto: idea.estadoPresupuesto,
        presupuestoTotal: idea.presupuestoTotal,
        avances: historial
          .filter((avance) => avance.ideaId === idea.id)
          .map((avance) => ({
            id: avance.id,
            fecha: avance.fecha,
            etapa: avance.etapa,
            titulo: avance.titulo,
            descripcion: avance.descripcion,
            monto: avance.monto === null ? null : Number(avance.monto),
            porcentaje: avance.porcentaje,
          })),
      }))}
    />
  );
}
