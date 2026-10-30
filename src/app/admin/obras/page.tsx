import { redirect } from "next/navigation";
import { getUltimaEdicionTerminadaConGanadores, listarObras } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelObras from "./panel";

export const metadata = { title: "Obras" };

/**
 * El estado de la obra de cada proyecto ganador: lo que el vecino ve en las
 * tarjetas de /transparencia y en la ficha de cada proyecto.
 *
 * Muestra los ganadores de la ultima edicion que termino de votar (hoy, los de
 * 2025): son los que se estan licitando y construyendo. Cada actualizacion es
 * un avance (`crearAvance` en ../acciones.ts): la etapa, la fecha, una
 * aclaracion y el link que la respalda. Los avances no se editan: si algo
 * cambio se informa otro, y uno mal cargado se borra (queda en la bitacora).
 *
 * Todos los roles la ven; informar y borrar es de moderador para arriba, y lo
 * decide la accion releyendo el rol de la base.
 */
export default async function AdminObras() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const edicion = await getUltimaEdicionTerminadaConGanadores();
  const obras = edicion ? await listarObras(edicion.id) : [];

  return (
    <PanelObras
      anio={edicion?.anio ?? null}
      anioEnEnlaces={edicion && !edicion.activa ? edicion.anio : null}
      obras={obras}
      puedeEscribir={sesion.rol !== "lector"}
      hoy={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Tucuman" }).format(
        new Date(),
      )}
    />
  );
}
