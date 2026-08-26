import { redirect } from "next/navigation";
import {
  direccionBandeja,
  getDistritos,
  getEdicionActiva,
  getIdeaAdmin,
  getResumenBandeja,
  getInformeImpacto,
  getRevisiones,
  getVotosRegistrados,
  listarIdeasBandeja,
  ordenBandeja,
  type EstadoIdea,
  type PaginaBandeja,
} from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelBandeja from "./bandeja/panel";

/**
 * Pantalla principal del panel: la bandeja de revision, el listado de trabajo
 * del equipo tecnico. Antes vivia en /admin/bandeja, que hoy es un redirect
 * permanente a esta ruta; la tabla vieja de edicion en linea (sin historial) se
 * borro: todo cambio de estado pasa por las acciones que escriben en
 * `revisiones`.
 *
 * Todo lo que se ve sale de src/db/queries.ts. Los filtros, el orden, la pagina
 * y la idea abierta viajan en el querystring (no en estado del cliente) por dos
 * razones: el enlace de una busqueda se puede compartir dentro del equipo, y
 * despues de cada accion la ficha y el historial se releen de la base.
 *
 * El selector de etapa no se renderiza aca a proposito: es la accion mas
 * peligrosa del panel (cambia lo que ve todo el sitio) y vive en
 * /admin/ediciones.
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

/** Filas por pagina. Una edicion trae ~100 ideas: 25 entran sin scroll eterno. */
const POR_PAGINA = 25;

type Props = {
  searchParams: Promise<{
    estado?: string;
    distrito?: string;
    q?: string;
    sindevolucion?: string;
    orden?: string;
    dir?: string;
    pagina?: string;
    idea?: string;
  }>;
};

export default async function AdminIdeas({ searchParams }: Props) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const parametros = await searchParams;
  const edicion = await getEdicionActiva();
  if (!edicion) {
    return <p>No hay una edición activa. Activá una edición antes de revisar ideas.</p>;
  }

  const estado = ESTADOS.includes(parametros.estado as EstadoIdea)
    ? (parametros.estado as EstadoIdea)
    : undefined;
  const pedido = Number(parametros.distrito);
  const distrito = Number.isInteger(pedido) && pedido >= 1 && pedido <= 20 ? pedido : undefined;
  const texto = parametros.q?.trim() ? parametros.q.trim() : undefined;
  const sinDevolucion = parametros.sindevolucion === "1";
  // Las dos funciones validan contra la lista blanca de queries.ts: lo que no
  // esta en la lista cae al orden de trabajo y a su direccion natural.
  const orden = ordenBandeja(parametros.orden);
  const dir = direccionBandeja(parametros.dir);

  const paginaPedida = Number(parametros.pagina);
  const primera = Number.isInteger(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;

  const consultarPagina = (pagina: number): Promise<PaginaBandeja> =>
    listarIdeasBandeja({
      edicionId: edicion.id,
      estado,
      distrito,
      texto,
      sinDevolucion,
      orden,
      dir,
      limite: POR_PAGINA,
      desplazamiento: (pagina - 1) * POR_PAGINA,
    });

  const [resumen, votosRegistrados, distritosEdicion] = await Promise.all([
    getResumenBandeja(edicion.id),
    getVotosRegistrados(edicion.id),
    getDistritos(edicion.id),
  ]);

  // Una pagina fuera de rango (un marcador viejo, o un filtro que se achico)
  // se corrige mostrando la ultima que existe, no una tabla vacia.
  let pagina = primera;
  let resultado = await consultarPagina(pagina);
  const paginas = Math.max(1, Math.ceil(resultado.total / POR_PAGINA));
  if (pagina > paginas) {
    pagina = paginas;
    resultado = await consultarPagina(pagina);
  }

  // La ficha se pide por id y se descarta si es de otra edicion: la bandeja
  // trabaja siempre sobre la edicion activa.
  const idPedido = Number(parametros.idea);
  const candidata =
    Number.isInteger(idPedido) && idPedido > 0 ? await getIdeaAdmin(idPedido) : null;
  const ficha = candidata && candidata.anio === edicion.anio ? candidata : null;
  const historial = ficha ? await getRevisiones(ficha.id) : [];
  const informe = ficha ? await getInformeImpacto(ficha.id) : null;

  return (
    <PanelBandeja
      anio={edicion.anio}
      resumen={resumen}
      filas={resultado.filas}
      total={resultado.total}
      porPagina={POR_PAGINA}
      votosRegistrados={votosRegistrados}
      distritos={distritosEdicion.map((d) => ({ numero: d.numero, nombre: d.nombre }))}
      vista={{
        estado: estado ?? "",
        distrito: distrito ? String(distrito) : "",
        q: texto ?? "",
        sinDevolucion,
        orden,
        dir: dir ?? null,
        pagina,
        idea: ficha ? String(ficha.id) : "",
      }}
      ficha={ficha}
      historial={historial}
      informe={informe}
      rol={sesion.rol}
      ahora={Date.now()}
    />
  );
}
