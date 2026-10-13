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
 * autenticada, a cualquier lado. Lo que no esta en la lista vuelve a votar,
 * que es como funcionaba el ingreso antes de que existiera el destino.
 *
 * Sin dependencias de Node: lo usan rutas, paginas y pruebas.
 */
import type { Etapa } from "@/lib/etapas";

export type DestinoIngreso = "votar" | "ideas";

/** El destino pedido, validado. Cualquier otro valor es "votar". */
export function destinoDeIngreso(valor: string | null | undefined): DestinoIngreso {
  return valor === "ideas" ? "ideas" : "votar";
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
