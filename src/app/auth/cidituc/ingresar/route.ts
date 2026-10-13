/**
 * Salida hacia CIDITUC.
 *
 * El boton de /ingresar apunta aca y no directo al Derivador porque hay que dejar
 * una cookie antes de irse: el estado que ata la vuelta a esta salida (ver
 * `COOKIE_ESTADO` en src/lib/cidituc.ts). Una pagina no puede escribir cookies
 * mientras se renderiza; una ruta si.
 *
 * `?para=ideas` es el ingreso para presentar una idea: deja ese destino en otra
 * cookie y el callback vuelve al formulario en lugar de a /votar (ver
 * src/lib/ingreso-vecino.ts). Sin el parametro, es el ingreso para votar.
 */
import { NextResponse } from "next/server";
import {
  COOKIE_DESTINO,
  COOKIE_ESTADO,
  DURACION_ESTADO,
  ingresoHabilitado,
  nuevoEstado,
  urlDeIngreso,
} from "@/lib/cidituc";
import { atributosCookie } from "@/lib/cookies";
import { destinoDeIngreso, puertaDeIngreso } from "@/lib/ingreso-vecino";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const destino = destinoDeIngreso(new URL(request.url).searchParams.get("para"));

  // El interruptor se mira tambien aca, no solo en la pagina: el boton se puede
  // esconder, pero la URL igual se puede escribir a mano.
  if (!ingresoHabilitado()) {
    const vuelta = new URL(puertaDeIngreso(destino), request.url);
    vuelta.searchParams.set("error", "ingreso-cerrado");
    return NextResponse.redirect(vuelta);
  }

  const estado = nuevoEstado();
  const respuesta = NextResponse.redirect(urlDeIngreso(estado));
  // httpOnly, "lax" (y no "strict": la vuelta desde CIDITUC es una navegacion
  // que viene de otro sitio, y con "strict" el navegador no mandaria la cookie
  // y el ingreso fallaria siempre), Secure y Path=/ que pide el prefijo
  // __Host- en produccion. Son los mismos atributos con los que las borra el
  // callback: si no coincidieran, el borrado no valdria.
  respuesta.cookies.set(COOKIE_ESTADO, estado, {
    ...atributosCookie(),
    maxAge: DURACION_ESTADO,
  });
  // El destino se escribe SIEMPRE, tambien el de votar: si quedara el de un
  // ingreso anterior a medias, esta vuelta terminaria en la pantalla de aquel.
  respuesta.cookies.set(COOKIE_DESTINO, destino, {
    ...atributosCookie(),
    maxAge: DURACION_ESTADO,
  });
  return respuesta;
}
