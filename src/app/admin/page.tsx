import { redirect } from "next/navigation";
import { getEdicionActiva, listarIdeas } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import { getVotosRegistrados } from "@/db/queries";
import TablaIdeas from "./tabla-ideas";
import SelectorEtapa from "./selector-etapa";

export default async function AdminIdeas() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const edicion = await getEdicionActiva();
  if (!edicion) {
    return <p>No hay una edición activa. Corré el seed.</p>;
  }

  const [lista, votosNuevos] = await Promise.all([
    listarIdeas({ edicionId: edicion.id, incluirNoPublicadas: true }),
    getVotosRegistrados(edicion.id),
  ]);

  const pendientes = lista.filter((i) => i.estado === "pendiente").length;
  const ocultas = lista.filter((i) => !i.publicada).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ideas · Edición {edicion.anio}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            {lista.length} ideas en total · {pendientes} pendientes de evaluación · {ocultas} sin
            publicar · {votosNuevos} votos registrados por este sitio
          </p>
        </div>
        <SelectorEtapa edicionId={edicion.id} etapa={edicion.etapa} rol={sesion.rol} />
      </div>

      <TablaIdeas
        ideas={lista.map((idea) => ({
          id: idea.id,
          slug: idea.slug,
          titulo: idea.titulo,
          distrito: idea.distrito,
          barrio: idea.barrio,
          categoria: idea.categoriaNombre,
          estado: idea.estado,
          ganador: idea.ganador,
          votos: idea.votos,
          publicada: idea.publicada,
          presupuestoTotal: idea.presupuestoTotal,
          estadoPresupuesto: idea.estadoPresupuesto,
          motivoEstado: idea.motivoEstado,
        }))}
        soloLectura={sesion.rol === "lector"}
      />
    </div>
  );
}
