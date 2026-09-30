/**
 * Salida del votante: cierra la sesion y vuelve a /ingresar.
 *
 * La sesion dura 4 horas y la cookie sobrevive a cerrar el navegador, asi que
 * en una tablet de asamblea la persona que sigue en la fila votaba con la
 * identidad de la anterior. El boton "Salir" del panel de votacion
 * (src/components/PanelVotacion.tsx) postea aca.
 *
 * Es POST y no GET a proposito: un GET que cierra la sesion lo dispara
 * cualquier <img> o link de otra pagina, y el navegador los precarga. Y es un
 * formulario comun, no un fetch: anda aunque el JavaScript de la pagina no
 * haya terminado de cargar, y la redireccion la sigue el navegador solo.
 *
 * Tambien por eso el chequeo de origen va sin exigir JSON: un formulario HTML
 * no puede mandar application/json. Sacar a alguien de su sesion desde otra
 * pagina seria una molestia y no un robo, pero no cuesta nada impedirlo.
 */
import { NextResponse } from "next/server";
import { exigirMismoOrigen } from "@/lib/origen";
import { cerrarSesionVotante } from "@/lib/sesion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rechazo = exigirMismoOrigen(request, { json: false });
  if (rechazo) return rechazo;

  await cerrarSesionVotante();

  // Sobre la URL con la que llego el pedido, como la vuelta de CIDITUC: asi la
  // persona sigue en el mismo sitio (desarrollo, vista previa o produccion).
  const destino = new URL("/ingresar", request.url);
  destino.searchParams.set("salida", "1");
  // 303: la respuesta a un POST se sigue con un GET. Con el 307 que Next usa
  // por defecto, el navegador repetiria el POST contra /ingresar.
  return NextResponse.redirect(destino, 303);
}
