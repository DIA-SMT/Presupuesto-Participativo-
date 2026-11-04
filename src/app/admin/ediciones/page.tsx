import { redirect } from "next/navigation";
import { getEdicionActiva } from "@/db/queries";
import { estadoDeInterruptores } from "@/lib/etapas";
import { getSesionAdmin } from "@/lib/sesion";
import PanelInterruptores from "./panel";

export const metadata = { title: "Presentación y votación" };

/**
 * Proceso del panel: abrir o cerrar la presentacion de propuestas y la
 * votacion. Desde octubre de 2026 el programa no se maneja por ediciones
 * anuales, y esta pantalla reemplaza a la de ediciones (alta por año,
 * activacion, selector de etapa, fechas y cronograma). La ruta sigue siendo
 * /admin/ediciones para no romper enlaces guardados.
 *
 * Por dentro cada interruptor cambia la etapa de la edicion activa
 * (\`usarInterruptor\` en ../acciones.ts, \`planDeInterruptor\` en
 * src/lib/etapas.ts). Todos los roles ven el estado; solo un administrador lo
 * cambia, y eso lo decide la accion releyendo el rol de la base.
 */
export default async function AdminProceso() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const activa = await getEdicionActiva();

  return (
    <PanelInterruptores
      estado={activa ? estadoDeInterruptores(activa.etapa) : null}
      etapa={activa?.etapa ?? null}
      puedeCambiar={sesion.rol === "admin"}
    />
  );
}
