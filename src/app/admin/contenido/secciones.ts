/**
 * Las solapas de /admin/contenido. Viajan en el querystring (`?seccion=`) y no
 * en estado del cliente, igual que los filtros de la bandeja: el enlace a una
 * solapa se puede pasar dentro del equipo ("cargá el reglamento aca") y la
 * pagina trae de la base solo lo de la solapa abierta.
 *
 * Esta en un archivo propio, sin "use client", porque la usan la pagina (que
 * valida el parametro) y la navegacion: un valor exportado desde un modulo de
 * cliente no llega como dato a un componente de servidor.
 */
export const SECCIONES = [
  { valor: "textos", titulo: "Textos del sitio" },
  { valor: "reglamento", titulo: "Reglamento" },
  { valor: "preguntas", titulo: "Preguntas frecuentes" },
  { valor: "novedades", titulo: "Novedades" },
  { valor: "aviso", titulo: "Aviso urgente" },
] as const;

export type SeccionContenido = (typeof SECCIONES)[number]["valor"];

/** Lista blanca: lo que no es una solapa conocida cae en la primera. */
export function seccionValida(valor: string | undefined): SeccionContenido {
  return SECCIONES.some((seccion) => seccion.valor === valor)
    ? (valor as SeccionContenido)
    : "textos";
}

export function enlaceSeccion(seccion: SeccionContenido): string {
  return seccion === "textos" ? "/admin/contenido" : `/admin/contenido?seccion=${seccion}`;
}
