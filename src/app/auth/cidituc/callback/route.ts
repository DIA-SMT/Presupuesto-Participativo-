/**
 * Regreso del ingreso con CIDITUC.
 *
 * La ruta es `/auth/cidituc/callback` y no `/api/...` porque es la URL que
 * queda REGISTRADA en el Derivador, en el repo de DITEC: cambiarla despues
 * obliga a un deploy de ellos, no nuestro.
 *
 * Todo lo que sabe de CIDITUC vive en src/lib/cidituc.ts; aca estan las reglas
 * del sitio: quien puede abrir sesion, que se guarda y como se vuelve.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_ESTADO, consultarPerfil, mismoEstado } from "@/lib/cidituc";
import { borradoCookie } from "@/lib/cookies";
import { empadronar } from "@/lib/empadronamiento";
import { crearSesionVotante } from "@/lib/sesion";
import { getEdicionActiva } from "@/db/queries";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Siempre se vuelve por redireccion y a una URL limpia: el token no puede
 * quedar en la barra de direcciones ni en el historial de la persona.
 *
 * Si sale bien se va a /votar; si no, a /ingresar con el motivo como codigo, y
 * /ingresar lo traduce. Un unico "error al ingresar" manda a todos a insistir
 * contra una puerta cerrada: "no pudimos consultar tus datos" se arregla
 * reintentando y "la votacion no esta abierta" no.
 */
function volver(request: Request, motivo?: string): NextResponse {
  // La vuelta se arma sobre la URL con la que LLEGO el pedido, no sobre
  // SITE_URL: asi la persona termina en el mismo sitio del que salio. Con
  // SITE_URL, un `npm run dev` en un puerto que no sea el 3000 la mandaba al
  // 3000, y un despliegue de vista previa la sacaba a produccion.
  const destino = new URL(motivo ? "/ingresar" : "/votar", request.url);
  if (motivo) destino.searchParams.set("error", motivo);
  const respuesta = NextResponse.redirect(destino);
  // El estado es de un solo uso: se borra pase lo que pase, asi un reintento
  // arranca limpio en vez de chocar con el sobrante del intento anterior. Con
  // los mismos atributos con que se escribio: un `delete(nombre)` a secas sale
  // sin Secure, y el navegador descarta ese borrado de una cookie __Host-.
  respuesta.cookies.delete(borradoCookie(COOKIE_ESTADO));
  return respuesta;
}

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const token = parametros.get("auth");
  if (!token) return volver(request, "sin-token");

  /*
   * La vuelta tiene que corresponder a una salida de ESTE navegador. Sin esta
   * comparacion, alguien puede pedir un token con su cuenta y mandarle a otra
   * persona el link del callback con ese token: el token es legitimo, asi que
   * la persona quedaria con la sesion del otro sin enterarse. El numero de la
   * cookie lo pone /auth/cidituc/ingresar y el Derivador lo devuelve tal cual.
   */
  const estadoGuardado = (await cookies()).get(COOKIE_ESTADO)?.value;
  if (!mismoEstado(estadoGuardado, parametros.get("state"))) {
    return volver(request, "estado");
  }

  const limite = await consumir(`cidituc:${hashearIp(ipDe(request))}`, 20, 600);
  if (!limite.permitido) return volver(request, "demasiados-intentos");

  /*
   * Autenticar no es autorizar. El token prueba que la persona es quien dice
   * ser ante el municipio, no que pueda votar aca. La "lista propia" de este
   * sitio es la etapa del proceso: fuera de la votacion no se abre sesion de
   * votante ni se suma a nadie al padron.
   */
  const edicion = await getEdicionActiva();
  if (!edicion || edicion.etapa !== "votacion") return volver(request, "fuera-de-etapa");

  const resultado = await consultarPerfil(token);
  if (!resultado.ok) return volver(request, resultado.motivo);

  try {
    const empadronado = await empadronar({
      dni: resultado.persona.documento,
      nombre: resultado.persona.nombre,
      /*
       * CIDITUC no dice en que distrito vive la persona, y sacarlo de su perfil
       * no es directo: trae `nombre_barrio` e `id_barrio`, pero el
       * `domicilio_persona` vino VACIO en la cuenta con la que se probo, y de
       * los 322 barrios de la capa del sitio hay 100 que tocan mas de un
       * distrito. El barrio sirve para proponer, no para asignar.
       *
       * Si el padron ya tenia un distrito para la persona se conserva
       * (empadronar ignora el null al actualizar); si no, /votar le explica que
       * le falta.
       */
      distrito: null,
      proveedor: "cidituc",
      proveedorSub: resultado.persona.id,
      verificado: true,
    });

    await crearSesionVotante({
      votanteId: empadronado.votanteId,
      distrito: empadronado.distrito,
      nombre: empadronado.nombre,
    });
  } catch (causa) {
    // Resumen siempre: sin esto, una base caida se ve igual que un token
    // rechazado. El token no entra aca ni en ningun otro registro.
    console.error(
      "[cidituc] no se pudo empadronar:",
      causa instanceof Error ? causa.message : causa,
    );
    return volver(request, "sin-padron");
  }

  // El token de CIDITUC ya cumplio su funcion y no se guarda: conservarlo solo
  // amplia lo que se pierde si algo se filtra.
  return volver(request);
}
