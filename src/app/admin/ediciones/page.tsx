import { redirect } from "next/navigation";
import { getEdiciones, getHitos, getResumenAdmin } from "@/db/queries";
import { votosDeLaEdicion, type ContextoEdicion } from "@/lib/etapas";
import { getSesionAdmin } from "@/lib/sesion";
import PanelEdiciones from "./panel";

/**
 * Pantalla de ediciones del backoffice: alta del anio nuevo, fechas y
 * presupuesto de cada edicion, activacion (una sola a la vez) y cronograma.
 *
 * Los datos salen de src/db/queries.ts: getEdiciones() trae los conteos y
 * getHitos() el cronograma de cada una (son pocas ediciones, una consulta por
 * edicion no es un problema).
 *
 * De la edicion activa se piden ademas sus votos y sus ganadores
 * (getResumenAdmin), que son lo que decide a que etapas se puede volver (ver
 * `puedeCambiarEtapa` en src/lib/etapas.ts). Con eso el selector deshabilita
 * las que no, y dice por que. Son los mismos dos numeros que cuenta
 * `cambiarEtapa` antes de escribir: la pantalla avisa, la accion decide.
 */
export default async function AdminEdiciones() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const listado = await getEdiciones();
  const activa = listado.find((edicion) => edicion.activa) ?? null;
  const [cronogramas, resumenActiva] = await Promise.all([
    Promise.all(listado.map((edicion) => getHitos(edicion.id))),
    activa ? getResumenAdmin(activa.id) : Promise.resolve(null),
  ]);

  const contextoActiva: ContextoEdicion | null = resumenActiva
    ? {
        votos: votosDeLaEdicion(resumenActiva.votosRegistrados, resumenActiva.votosEnIdeas),
        ganadores: resumenActiva.ganadores,
      }
    : null;

  return (
    <PanelEdiciones
      rol={sesion.rol}
      contextoActiva={contextoActiva}
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
