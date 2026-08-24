import { redirect } from "next/navigation";
import {
  getDistritos,
  getEdicionActiva,
  getIdeaAdmin,
  getResumenBandeja,
  getRevisiones,
  listarIdeasBandeja,
  type EstadoIdea,
} from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelBandeja from "./panel";

/**
 * Bandeja de revision: el listado de trabajo del equipo tecnico.
 *
 * Todo lo que se ve sale de src/db/queries.ts. Los filtros y la idea abierta
 * viajan en el querystring (no en estado del cliente) por dos razones: el
 * enlace de una busqueda se puede compartir dentro del equipo, y despues de
 * cada accion la ficha y el historial se releen de la base.
 */

/** Estados que se pueden pedir por querystring. Se valida contra esta lista. */
const ESTADOS: EstadoIdea[] = [
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
  "borrador",
];

/** Techo de filas por pantalla: una edicion trae ~100 ideas, esto es un tope. */
const TOPE = 500;

type Props = {
  searchParams: Promise<{
    estado?: string;
    distrito?: string;
    q?: string;
    idea?: string;
  }>;
};

export default async function BandejaRevision({ searchParams }: Props) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const filtros = await searchParams;
  const edicion = await getEdicionActiva();
  if (!edicion) {
    return <p>No hay una edición activa. Activá una edición antes de revisar ideas.</p>;
  }

  const estado = ESTADOS.includes(filtros.estado as EstadoIdea)
    ? (filtros.estado as EstadoIdea)
    : undefined;
  const pedido = Number(filtros.distrito);
  const distrito =
    Number.isInteger(pedido) && pedido >= 1 && pedido <= 20 ? pedido : undefined;
  const texto = filtros.q?.trim() ? filtros.q.trim() : undefined;

  const [resumen, filas, distritosEdicion] = await Promise.all([
    getResumenBandeja(edicion.id),
    listarIdeasBandeja({ edicionId: edicion.id, estado, distrito, texto, limite: TOPE }),
    getDistritos(edicion.id),
  ]);

  // La ficha se pide por id y se descarta si es de otra edicion: la bandeja
  // trabaja siempre sobre la edicion activa.
  const idPedido = Number(filtros.idea);
  const candidata =
    Number.isInteger(idPedido) && idPedido > 0 ? await getIdeaAdmin(idPedido) : null;
  const ficha = candidata && candidata.anio === edicion.anio ? candidata : null;
  const historial = ficha ? await getRevisiones(ficha.id) : [];

  return (
    <PanelBandeja
      anio={edicion.anio}
      resumen={resumen}
      filas={filas}
      tope={TOPE}
      distritos={distritosEdicion.map((d) => ({ numero: d.numero, nombre: d.nombre }))}
      filtros={{
        estado: estado ?? "",
        distrito: distrito ? String(distrito) : "",
        q: texto ?? "",
      }}
      ficha={ficha}
      historial={historial}
      rol={sesion.rol}
      ahora={Date.now()}
    />
  );
}
