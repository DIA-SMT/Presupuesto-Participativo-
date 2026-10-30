import { redirect } from "next/navigation";
import { listarObras } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelObras from "./panel";

export const metadata = { title: "Obras" };

/**
 * El estado de la obra de cada proyecto ganador: lo que el vecino ve en las
 * tarjetas de /transparencia y en la ficha de cada proyecto.
 *
 * Muestra los ganadores de todas las votaciones, los mas nuevos primero: el
 * panel no separa por ediciones. Cada actualizacion es un avance
 * (`crearAvance` en ../acciones.ts): la etapa, la fecha, una aclaracion y el
 * link que la respalda. Los avances no se editan: si algo cambio se informa
 * otro, y uno mal cargado se borra (queda en la bitacora).
 *
 * Todos los roles la ven; informar y borrar es de moderador para arriba, y lo
 * decide la accion releyendo el rol de la base.
 */
export default async function AdminObras() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  return (
    <PanelObras
      obras={await listarObras()}
      puedeEscribir={sesion.rol !== "lector"}
      hoy={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Tucuman" }).format(
        new Date(),
      )}
    />
  );
}
