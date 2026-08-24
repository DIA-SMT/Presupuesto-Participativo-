import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  LIMITE_BITACORA_SISTEMA,
  accionSistemaValida,
  entidadSistemaValida,
  listarBitacoraSistema,
  type PaginaBitacoraSistema,
} from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelBitacora from "./panel";

/**
 * Bitacora del sistema: quien cambio la etapa del proceso, las ediciones, el
 * cronograma, los textos, las novedades y los avances de obra, cuando, y de que
 * valor a que valor.
 *
 * Los datos salen enteros de `listarBitacoraSistema()` en src/db/queries.ts.
 * Aca no hay ninguna escritura: la tabla `bitacora_sistema` es append-only y el
 * panel no tiene forma de editarla ni de borrarla.
 *
 * El filtro y la pagina viajan en el querystring (no en estado del cliente) por
 * la misma razon que en la bandeja: el enlace de una busqueda se puede pasar
 * dentro del equipo. Lo que llega por la URL NO se le pasa a la consulta tal
 * cual: `accionSistemaValida` y `entidadSistemaValida` lo mapean contra las
 * listas blancas de queries.ts, y lo que no esta en la lista se trata como "sin
 * filtro".
 *
 * No hay chequeo de rol a proposito (mas alla de tener sesion): la bitacora la
 * puede leer cualquier rol del backoffice, incluido `lector`. Auditar sin poder
 * escribir es exactamente para lo que sirve ese rol.
 */

export const metadata: Metadata = {
  title: "Bitácora del sistema",
  robots: { index: false, follow: false },
};

type Props = {
  searchParams: Promise<{
    accion?: string;
    entidad?: string;
    pagina?: string;
  }>;
};

export default async function AdminBitacora({ searchParams }: Props) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const parametros = await searchParams;

  // Lo unico que puede llegar a la consulta es un valor de las listas blancas.
  const accion = accionSistemaValida(parametros.accion);
  const entidad = entidadSistemaValida(parametros.entidad);

  const paginaPedida = Number(parametros.pagina);
  const primera = Number.isInteger(paginaPedida) && paginaPedida > 0 ? paginaPedida : 1;

  const consultarPagina = (pagina: number): Promise<PaginaBitacoraSistema> =>
    listarBitacoraSistema({
      accion,
      entidad,
      limite: LIMITE_BITACORA_SISTEMA,
      desplazamiento: (pagina - 1) * LIMITE_BITACORA_SISTEMA,
    });

  // Una pagina fuera de rango (un enlace viejo, o un filtro que dejo menos
  // filas de las que habia) se corrige mostrando la ultima que existe, no una
  // lista vacia. Mismo criterio que la bandeja.
  let pagina = primera;
  let resultado = await consultarPagina(pagina);
  const paginas = Math.max(1, Math.ceil(resultado.total / LIMITE_BITACORA_SISTEMA));
  if (pagina > paginas) {
    pagina = paginas;
    resultado = await consultarPagina(pagina);
  }

  return (
    <PanelBitacora
      filas={resultado.filas}
      total={resultado.total}
      porPagina={LIMITE_BITACORA_SISTEMA}
      vista={{
        accion: accion ?? "",
        entidad: entidad ?? "",
        pagina,
      }}
    />
  );
}
