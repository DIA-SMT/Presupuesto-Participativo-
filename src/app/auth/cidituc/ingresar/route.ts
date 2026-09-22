/**
 * Salida hacia CIDITUC.
 *
 * El boton de /votar apunta aca y no directo al Derivador porque hay que dejar
 * una cookie antes de irse: el estado que ata la vuelta a esta salida (ver
 * `COOKIE_ESTADO` en src/lib/cidituc.ts). Una pagina no puede escribir cookies
 * mientras se renderiza; una ruta si.
 */
import { NextResponse } from "next/server";
import {
  COOKIE_ESTADO,
  DURACION_ESTADO,
  ingresoHabilitado,
  nuevoEstado,
  urlDeIngreso,
} from "@/lib/cidituc";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // El interruptor se mira tambien aca, no solo en la pagina: el boton se puede
  // esconder, pero la URL igual se puede escribir a mano.
  if (!ingresoHabilitado()) {
    const destino = new URL("/votar", request.url);
    destino.searchParams.set("error", "ingreso-cerrado");
    return NextResponse.redirect(destino);
  }

  const estado = nuevoEstado();
  const respuesta = NextResponse.redirect(urlDeIngreso(estado));
  respuesta.cookies.set(COOKIE_ESTADO, estado, {
    httpOnly: true,
    // "lax" y no "strict": la vuelta desde CIDITUC es una navegacion que viene
    // de otro sitio, y con "strict" el navegador no mandaria la cookie y el
    // ingreso fallaria siempre.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACION_ESTADO,
    path: "/",
  });
  return respuesta;
}
