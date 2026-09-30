/**
 * Que edicion muestra una pagina publica, segun `?edicion=AAAA`.
 *
 * Lo usan /proyectos, /proyectos/[slug], /distritos, /distritos/[numero] y
 * /transparencia, para que el parametro se lea y se valide en un solo lugar:
 * con cinco copias del parseo, alguna iba a terminar aceptando "abc" o
 * ignorando el parametro, que es exactamente lo que pasaba (todas leian la
 * activa y `?edicion=2026` no hacia nada).
 *
 * Solo del servidor: va a la base y usa `notFound()`.
 */
import { cache } from "react";
import { notFound } from "next/navigation";
import { getEdicionParaVer, type EdicionEnVista } from "@/db/queries";
import { leerAnioPedido } from "./ediciones";

export type VistaDeEdicion = {
  edicion: EdicionEnVista;
  /**
   * El año que llevan los enlaces internos de la pagina (`conEdicion` en
   * src/lib/ediciones.ts). null mientras se ve la activa: sus enlaces van sin
   * parametro, que es su URL de siempre.
   */
  anioEnEnlaces: number | null;
};

export type EdicionResuelta =
  | { tipo: "vista"; vista: VistaDeEdicion }
  /** No se pidio ninguna y no hay edicion activa: la pagina muestra su vacio. */
  | { tipo: "sin-edicion" }
  /** Se pidio algo que no es un año, o un año sin edicion: 404. */
  | { tipo: "no-existe" };

export function vistaDe(edicion: EdicionEnVista): VistaDeEdicion {
  return { edicion, anioEnEnlaces: edicion.activa ? null : edicion.anio };
}

/**
 * Resuelve el parametro sin cortar el render. Es lo que usa `generateMetadata`:
 * ahi un `notFound()` adentro de un try/catch se pierde (el catch se lo traga),
 * asi que el 404 lo decide el cuerpo de la pagina con `edicionDeLaPagina`.
 *
 * `cache` hace que el titulo y el cuerpo de la misma pagina compartan una sola
 * consulta por pedido.
 */
export const resolverEdicion = cache(
  async (valor: string | string[] | undefined): Promise<EdicionResuelta> => {
    const pedido = leerAnioPedido(valor);
    if (pedido.tipo === "invalido") return { tipo: "no-existe" };

    const edicion = await getEdicionParaVer(pedido.tipo === "anio" ? pedido.anio : null);
    if (edicion) return { tipo: "vista", vista: vistaDe(edicion) };
    return pedido.tipo === "anio" ? { tipo: "no-existe" } : { tipo: "sin-edicion" };
  },
);

/**
 * La edicion para el cuerpo de la pagina: 404 si se pidio una que no existe (o
 * algo que no es un año); null si no se pidio ninguna y no hay edicion activa,
 * que cada pagina muestra como hasta ahora ("Todavía no hay una edición
 * cargada").
 */
export async function edicionDeLaPagina(
  valor: string | string[] | undefined,
): Promise<VistaDeEdicion | null> {
  const resuelta = await resolverEdicion(valor);
  if (resuelta.tipo === "no-existe") notFound();
  return resuelta.tipo === "vista" ? resuelta.vista : null;
}

/**
 * El titulo de la pestaña, con la edicion cuando no es la activa: con la 2025 y
 * la 2026 abiertas en dos pestañas, "Distritos" y "Distritos" no se distinguen.
 */
export function tituloConEdicion(
  titulo: string,
  resuelta: EdicionResuelta | null | undefined,
): string {
  if (resuelta?.tipo !== "vista" || resuelta.vista.edicion.activa) return titulo;
  return `${titulo} · Edición ${resuelta.vista.edicion.anio}`;
}
