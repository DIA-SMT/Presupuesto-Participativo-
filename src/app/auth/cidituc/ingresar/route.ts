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
 * src/lib/ingreso-vecino.ts). Sin el parametro, el destino sale de la etapa: en
 * la de ideas es presentar una idea, en cualquier otra es votar.
 */
import { NextResponse } from "next/server";
import { getEdicionActiva, type Edicion } from "@/db/queries";
import {
  COOKIE_DESTINO,
  COOKIE_ESTADO,
  DURACION_ESTADO,
  ingresoHabilitado,
  nuevoEstado,
  urlDeIngreso,
} from "@/lib/cidituc";
import { atributosCookie } from "@/lib/cookies";
import {
  destinoDelIngreso,
  etapaDejaIngresar,
  puertaDeIngreso,
  type DestinoIngreso,
} from "@/lib/ingreso-vecino";
import { puedeCargarFueraDeEtapa } from "@/lib/modo-prueba";

export const runtime = "nodejs";

/** Vuelta a la puerta del destino, con el motivo para que /ingresar lo explique. */
function volverALaPuerta(request: Request, destino: DestinoIngreso, motivo: string) {
  const vuelta = new URL(puertaDeIngreso(destino), request.url);
  vuelta.searchParams.set("error", motivo);
  return NextResponse.redirect(vuelta);
}

export async function GET(request: Request) {
  const para = new URL(request.url).searchParams.get("para");

  /*
   * La edicion es la unica consulta a la base de esta salida, y va en un try
   * por lo mismo que las del callback: una excepcion que sale de una ruta es un
   * 500 pelado (error.tsx no cubre rutas), y quien tocaba "Ingresar con
   * CIDITUC" con el pooler saturado veia la pantalla de error del navegador,
   * sin mensaje ni boton. Sin la etapa, el destino sale solo de `?para`, que el
   * boton de /ingresar manda siempre. Y con el interruptor apagado el motivo
   * sigue siendo "ingreso-cerrado", como cuando esta ruta no leia la base:
   * decirle "proba en un rato" no le sirve de nada.
   */
  let edicion: Edicion | null;
  try {
    edicion = await getEdicionActiva();
  } catch (causa) {
    console.error(
      "[cidituc] la base no respondio en la salida:",
      causa instanceof Error ? causa.message : causa,
    );
    return volverALaPuerta(
      request,
      destinoDelIngreso(para, null),
      ingresoHabilitado() ? "sin-servicio" : "ingreso-cerrado",
    );
  }
  const destino = destinoDelIngreso(para, edicion?.etapa);

  // El interruptor se mira tambien aca, no solo en la pagina: el boton se puede
  // esconder, pero la URL igual se puede escribir a mano.
  if (!ingresoHabilitado()) return volverALaPuerta(request, destino, "ingreso-cerrado");

  /*
   * La etapa, por lo mismo: /ingresar no ofrece el boton fuera de la etapa del
   * destino, pero un enlace a esta ruta lo puede escribir cualquiera (el equipo
   * en un aviso, por ejemplo). Sin esto la persona se autenticaba en CIDITUC
   * para leer a la vuelta "no hace falta ingresar". Es la misma regla que
   * aplica el callback, con la misma excepcion del modo prueba.
   */
  const fueraDeEtapa =
    destino === "ideas" && edicion?.etapa !== "ideas" && (await puedeCargarFueraDeEtapa());
  if (!etapaDejaIngresar(destino, edicion?.etapa, fueraDeEtapa)) {
    return volverALaPuerta(request, destino, "fuera-de-etapa");
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
