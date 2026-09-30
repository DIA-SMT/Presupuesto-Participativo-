/**
 * Como se pide una edicion en el sitio publico y como se arman los enlaces que
 * la conservan.
 *
 * Todo el sitio lee la edicion activa, y la base admite una sola. Cuando se
 * activa una edicion nueva, la anterior no desaparece: sus ganadores son justo
 * las obras que se estan ejecutando. Para verla hay UNA forma, que es la misma
 * en todas las paginas publicas y en los datos abiertos: `?edicion=AAAA`. Sin el
 * parametro, la activa, como siempre.
 *
 * Es logica pura, sin base ni Next, porque la usan lados que no comparten nada
 * mas: las paginas (en el servidor), el mapa (en el navegador), /api/proyectos y
 * las herramientas del chat. Lo que va a la base esta en `getEdicionParaVer`
 * (src/db/queries.ts) y lo que es de las paginas en src/lib/edicion-en-vista.ts.
 */
import type { EtapaEdicion } from "@/db/queries";

/** El nombre del parametro. Uno solo para todo el sitio. */
export const PARAMETRO_EDICION = "edicion";

/**
 * Lo que dice la URL sobre la edicion.
 *
 *  - "ninguno": no se pidio ninguna (o vino vacio): la activa.
 *  - "anio": se pidio ese año. Que exista lo decide la base.
 *  - "invalido": vino algo que no es un año ("abc", "25", dos valores). Las
 *    paginas lo tratan como un año que no existe: 404. No se ignora a
 *    proposito: mostrar la activa bajo una URL que pide otra cosa haria que
 *    `?edicion=abc` y `?edicion=2O25` (con una letra O) parezcan andar y
 *    muestren datos de otra edicion sin decirlo.
 */
export type AnioPedido =
  | { tipo: "ninguno" }
  | { tipo: "anio"; anio: number }
  | { tipo: "invalido" };

/**
 * Lee el parametro tal como lo entregan `searchParams` (string, string[] si se
 * repite, undefined si no esta) o `URLSearchParams.get` (null).
 *
 * El año tiene que ser exactamente cuatro cifras: sin espacios, signos ni
 * decimales. "2025.0" o " 2025" no son una forma de pedir la 2025, son un enlace
 * mal armado, y aceptarlos multiplica las URLs de una misma pagina.
 */
export function leerAnioPedido(valor: string | string[] | null | undefined): AnioPedido {
  if (valor === undefined || valor === null) return { tipo: "ninguno" };
  // `?edicion=2025&edicion=2026`: no hay forma honesta de elegir una.
  if (Array.isArray(valor)) return { tipo: "invalido" };
  if (valor === "") return { tipo: "ninguno" };
  if (!/^\d{4}$/.test(valor)) return { tipo: "invalido" };
  return { tipo: "anio", anio: Number(valor) };
}

/**
 * La ruta con `?edicion=AAAA`, o la ruta tal cual si `anio` es null.
 *
 * Quien llama pasa null mientras se ve la edicion activa: sus enlaces van sin
 * el parametro, que es la URL canonica de esa pagina. El parametro solo viaja
 * mientras se recorre una edicion que no es la activa, para que un clic en una
 * tarjeta, un filtro o el distrito vecino no la saque de esa edicion.
 */
export function conEdicion(ruta: string, anio: number | null | undefined): string {
  if (anio === null || anio === undefined) return ruta;
  return `${ruta}${ruta.includes("?") ? "&" : "?"}${PARAMETRO_EDICION}=${anio}`;
}

/**
 * Si la votacion de la edicion ya termino. Desde "seguimiento" una edicion tiene
 * ganadores o no los tiene; antes, que no tenga es lo esperable, y decir "este
 * distrito no tiene proyecto ganador" se lee como que el distrito se quedo sin
 * nada cuando en realidad todavia no voto.
 *
 * Es el mismo corte que `puedeProclamar` (src/lib/etapas.ts): se proclama
 * recien en "seguimiento" o "cerrada".
 */
export function votacionTerminada(etapa: EtapaEdicion): boolean {
  return etapa === "seguimiento" || etapa === "cerrada";
}

/**
 * Como se nombra el estado de una edicion que NO es la activa, en el aviso de
 * arriba de cada pagina ("Estás viendo la edición 2025 (terminada)").
 *
 * Una edicion que no es la activa ya no recibe ideas ni votos: el sitio solo
 * los acepta en la activa. Si voto, termino (sus obras siguen en seguimiento,
 * pero el proceso participativo termino). Si no llego a votar —se activo otra
 * con esta en ideas o en evaluacion, o es una edicion preparada de antemano—,
 * decir "terminada" seria falso: no esta en curso, y es lo que se dice.
 */
export function estadoDeEdicionNoActiva(etapa: EtapaEdicion): string {
  return votacionTerminada(etapa) ? "terminada" : "no está en curso";
}
