import { redirect } from "next/navigation";
import { getEdiciones, getHitos } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelEdiciones from "./panel";

/**
 * Pantalla de ediciones del backoffice: alta del anio nuevo, fechas y
 * presupuesto de cada edicion, activacion (una sola a la vez) y cronograma.
 *
 * Los datos salen de src/db/queries.ts: getEdiciones() trae los conteos y
 * getHitos() el cronograma de cada una (son pocas ediciones, una consulta por
 * edicion no es un problema).
 */
export default async function AdminEdiciones() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const listado = await getEdiciones();
  const cronogramas = await Promise.all(listado.map((edicion) => getHitos(edicion.id)));

  return (
    <PanelEdiciones
      rol={sesion.rol}
      ediciones={listado.map((edicion, indice) => ({
        ...edicion,
        hitos: (cronogramas[indice] ?? []).map((hito) => ({
          id: hito.id,
          orden: hito.orden,
          titulo: hito.titulo,
          detalle: hito.detalle,
          desde: hito.desde,
          hasta: hito.hasta,
          etapa: hito.etapa,
        })),
      }))}
    />
  );
}
