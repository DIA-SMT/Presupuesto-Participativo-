/**
 * Para que entra el vecino con CIDITUC, y a donde vuelve.
 *
 * El mismo ingreso sirve para dos cosas: votar (en la etapa de votacion) y
 * presentar una idea (en la etapa de ideas). Lo que cambia es cuando se deja
 * entrar y a que pantalla se vuelve. El destino viaja en el querystring de
 * /ingresar y de /auth/cidituc/ingresar (`?para=ideas`), y de ahi a una cookie
 * que lee el callback: el Derivador de CIDITUC no devuelve nada propio de este
 * sitio salvo el `state`.
 *
 * Es una LISTA BLANCA de destinos y no una URL de vuelta: con una URL libre en
 * el querystring, un link armado por otro podia mandar a la persona, recien
 * autenticada, a cualquier lado. En /ingresar lo que no esta en la lista es
 * votar, que es como funcionaba el ingreso antes de que existiera el destino.
 * En la salida y en la vuelta de CIDITUC, en cambio, lo que no viene sale de la
 * etapa (ver `destinoDelIngreso`).
 *
 * Sin dependencias de Node: lo usan rutas, paginas y pruebas.
 */
import type { Etapa } from "@/lib/etapas";

export type DestinoIngreso = "votar" | "ideas";

/** El destino pedido, validado. Cualquier otro valor es "votar". */
export function destinoDeIngreso(valor: string | null | undefined): DestinoIngreso {
  return valor === "ideas" ? "ideas" : "votar";
}

/** Si el valor es uno de los destinos de la lista, tal cual. */
export function esDestinoDeIngreso(valor: string | null | undefined): valor is DestinoIngreso {
  return valor === "ideas" || valor === "votar";
}

/**
 * El destino de un ingreso que puede llegar sin destino: el pedido, si es uno
 * de la lista; si no, el de la etapa.
 *
 * Lo usan la salida a CIDITUC (sin `?para`) y la vuelta (sin la cookie). La
 * cookie falta mas de lo que parece: vence (dura una hora, ver
 * `DURACION_ESTADO`; con los 10 minutos de antes la perdia quien creaba su
 * cuenta de CIDITUC en el camino), y quien abrio el sitio desde el navegador
 * de WhatsApp o Instagram vuelve en otro navegador. Con "votar" fijo, en la
 * etapa de ideas esa persona terminaba en la puerta de votar, cerrada y sin
 * boton, leyendo "entra de nuevo desde el boton". Las dos ventanas no se
 * superponen, asi que la etapa alcanza para saber a que venia: en la de ideas
 * solo se entra a presentar una idea, y en cualquier otra a votar.
 */
export function destinoDelIngreso(
  pedido: string | null | undefined,
  etapa: Etapa | null | undefined,
): DestinoIngreso {
  if (esDestinoDeIngreso(pedido)) return pedido;
  return etapa === "ideas" ? "ideas" : "votar";
}

/** La otra puerta: la de ideas para quien llego a la de votar, y al reves. */
export function otroDestino(destino: DestinoIngreso): DestinoIngreso {
  return destino === "votar" ? "ideas" : "votar";
}

/** La pantalla a la que se vuelve cuando el ingreso sale bien. */
export const PANTALLA_DEL_DESTINO: Record<DestinoIngreso, string> = {
  votar: "/votar",
  ideas: "/ideas/nueva",
};

/**
 * La puerta de cada destino: /ingresar, con el destino si no es votar. La
 * usan la pantalla de la idea (para mandar a quien no entro) y las vueltas
 * con error del callback.
 */
export function puertaDeIngreso(destino: DestinoIngreso): string {
  return destino === "votar" ? "/ingresar" : `/ingresar?para=${destino}`;
}

/**
 * Si la etapa deja entrar para ese destino. Autenticar no es autorizar: el
 * token de CIDITUC prueba quien es la persona, y esto decide si hoy tiene algo
 * que hacer aca. Fuera de la etapa no se abre sesion ni se suma a nadie al
 * padron, y la pantalla de ingreso ni ofrece el boton.
 *
 * `fueraDeEtapa` es la excepcion de las ideas: el equipo (o
 * MODO_PRUEBA_IDEAS=1) puede recorrer la carga con la etapa cerrada, ver
 * src/lib/modo-prueba.ts. Para votar no hay excepcion.
 */
export function etapaDejaIngresar(
  destino: DestinoIngreso,
  etapa: Etapa | null | undefined,
  fueraDeEtapa = false,
): boolean {
  if (destino === "ideas") return etapa === "ideas" || fueraDeEtapa;
  return etapa === "votacion";
}
