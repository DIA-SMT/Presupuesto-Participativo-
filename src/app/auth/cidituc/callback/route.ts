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
import { COOKIE_DESTINO, COOKIE_ESTADO, consultarPerfil, mismoEstado } from "@/lib/cidituc";
import { borradoCookie } from "@/lib/cookies";
import { sugerenciaDeDistrito } from "@/lib/barrios";
import { CuentaYaEmpadronada, empadronar } from "@/lib/empadronamiento";
import { crearSesionVotante } from "@/lib/sesion";
import { getEdicionActiva, type Edicion } from "@/db/queries";
import {
  PANTALLA_DEL_DESTINO,
  destinoDelIngreso,
  esDestinoDeIngreso,
  etapaDejaIngresar,
  puertaDeIngreso,
  type DestinoIngreso,
} from "@/lib/ingreso-vecino";
import { puedeCargarFueraDeEtapa } from "@/lib/modo-prueba";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Siempre se vuelve por redireccion y a una URL limpia: el token no puede
 * quedar en la barra de direcciones ni en el historial de la persona.
 *
 * Si sale bien se va a la pantalla del destino (/votar, o /ideas/nueva si se
 * entro para presentar una idea); si no, a /ingresar, con el destino y el
 * motivo como codigo, y /ingresar lo traduce. Un unico "error al ingresar" manda a todos a insistir
 * contra una puerta cerrada: "no pudimos consultar tus datos" se arregla
 * reintentando y "la votacion no esta abierta" no.
 */
function volver(request: Request, destino: DestinoIngreso, motivo?: string): NextResponse {
  // La vuelta se arma sobre la URL con la que LLEGO el pedido, no sobre
  // SITE_URL: asi la persona termina en el mismo sitio del que salio. Con
  // SITE_URL, un `npm run dev` en un puerto que no sea el 3000 la mandaba al
  // 3000, y un despliegue de vista previa la sacaba a produccion.
  const vuelta = new URL(
    motivo ? puertaDeIngreso(destino) : PANTALLA_DEL_DESTINO[destino],
    request.url,
  );
  if (motivo) vuelta.searchParams.set("error", motivo);
  const respuesta = NextResponse.redirect(vuelta);
  // El estado es de un solo uso: se borra pase lo que pase, asi un reintento
  // arranca limpio en vez de chocar con el sobrante del intento anterior. Con
  // los mismos atributos con que se escribio: un `delete(nombre)` a secas sale
  // sin Secure, y el navegador descarta ese borrado de una cookie __Host-.
  respuesta.cookies.delete(borradoCookie(COOKIE_ESTADO));
  respuesta.cookies.delete(borradoCookie(COOKIE_DESTINO));
  return respuesta;
}

/**
 * La sugerencia de distrito, sin que un error la vuelva un problema. Es
 * opcional: si no se puede calcular (la capa de barrios no se pudo leer, un
 * barrio con un nombre raro), la persona elige su distrito sin sugerencia. Sin
 * esto, cualquier falla aca caia en el catch del empadronamiento y la dejaba
 * afuera con "No pudimos guardar tu empadronamiento", con el alta ya hecha.
 */
function sugerenciaSinCortar(barrio: string | null) {
  try {
    return sugerenciaDeDistrito(barrio);
  } catch (causa) {
    console.error(
      "[cidituc] no se pudo sugerir el distrito:",
      causa instanceof Error ? causa.message : causa,
    );
    return null;
  }
}

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  // Para que entro la persona: lo dejo /auth/cidituc/ingresar. Se valida contra
  // la lista blanca otra vez: es una cookie, la escribe el navegador.
  const pedido = (await cookies()).get(COOKIE_DESTINO)?.value;
  /*
   * Sin la cookie (vencio, o la vuelta se abrio en otro navegador) el destino
   * sale de la etapa: si no, en la etapa de ideas el error de abajo mandaba a
   * la puerta de votar, cerrada y sin boton (ver `destinoDelIngreso`). Solo se
   * consulta en ese caso, y una base que no contesta no cambia el error que se
   * muestra: solo la puerta, que vuelve a ser la de votar.
   */
  const destino = esDestinoDeIngreso(pedido)
    ? pedido
    : destinoDelIngreso(null, (await getEdicionActiva().catch(() => null))?.etapa);
  const token = parametros.get("auth");
  if (!token) return volver(request, destino, "sin-token");

  /*
   * La vuelta tiene que corresponder a una salida de ESTE navegador. Sin esta
   * comparacion, alguien puede pedir un token con su cuenta y mandarle a otra
   * persona el link del callback con ese token: el token es legitimo, asi que
   * la persona quedaria con la sesion del otro sin enterarse. El numero de la
   * cookie lo pone /auth/cidituc/ingresar y el Derivador lo devuelve tal cual.
   */
  const estadoGuardado = (await cookies()).get(COOKIE_ESTADO)?.value;
  if (!mismoEstado(estadoGuardado, parametros.get("state"))) {
    return volver(request, destino, "estado");
  }

  /*
   * El limite de intentos y la etapa son las primeras consultas a la base, y
   * estaban fuera del try de abajo: con la base caida o el pooler saturado la
   * excepcion salia de la ruta, Next respondia un 500 pelado (error.tsx no
   * cubre rutas), la persona veia la pantalla de error del navegador con el
   * token en la barra y en el historial, y las cookies de estado y destino
   * quedaban vivas. Ahora vuelve a /ingresar como cualquier otra falla, con un
   * motivo propio: no es el empadronamiento ni la credencial.
   */
  let edicion: Edicion | null;
  try {
    /*
     * Aca todavia no hay persona (eso lo dice consultarPerfil), asi que el
     * tope solo puede ser por IP, y la IP la comparten una asamblea, un CIC o
     * el CGNAT de una operadora: con 20 cada 10 minutos, el ingreso 21 de una
     * mesa de votacion volvia con "demasiados-intentos". Es un tope grueso,
     * contra una inundacion que le pegue a CIDITUC con tokens inventados (el
     * `state` lo pasa cualquiera que mande cookie y parametro iguales), no
     * contra una persona: cada ingreso de verdad es un viaje a CIDITUC y
     * vuelta, y 120 cada 10 minutos son 12 por minuto desde una sola conexion.
     */
    const limite = await consumir(`cidituc:${hashearIp(ipDe(request))}`, 120, 600);
    if (!limite.permitido) return volver(request, destino, "demasiados-intentos");

    /*
     * Autenticar no es autorizar. El token prueba que la persona es quien dice
     * ser ante el municipio, no que pueda votar aca. La "lista propia" de este
     * sitio es la etapa del proceso: se abre sesion (y se suma la persona al
     * padron) para votar en la votacion y para presentar una idea en la etapa
     * de ideas, y en ningun otro momento (ver etapaDejaIngresar).
     */
    edicion = await getEdicionActiva();
  } catch (causa) {
    // Como en el catch del empadronamiento: el resumen, nunca el token.
    console.error(
      "[cidituc] la base no respondio en la vuelta:",
      causa instanceof Error ? causa.message : causa,
    );
    return volver(request, destino, "sin-servicio");
  }
  const fueraDeEtapa =
    destino === "ideas" && edicion?.etapa !== "ideas" && (await puedeCargarFueraDeEtapa());
  if (!edicion || !etapaDejaIngresar(destino, edicion.etapa, fueraDeEtapa)) {
    return volver(request, destino, "fuera-de-etapa");
  }

  const resultado = await consultarPerfil(token);
  if (!resultado.ok) return volver(request, destino, resultado.motivo);

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
       * Si el padron ya tenia un distrito para la persona, se conserva solo si
       * esa fila estaba verificada: `empadronar` ignora el null al actualizar,
       * pero no hereda el distrito de una fila sin verificar, que pudo haberlo
       * elegido quien la cargo (el login de prueba lo pide a mano). Si no queda
       * un distrito que conservar, /votar le pide que declare el suyo, con
       * el barrio de la cuenta como sugerencia si queda en un solo distrito.
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
      // Solo si todavia no tiene distrito: a quien ya lo declaro no se le
      // propone otro.
      sugerido: empadronado.distrito ? null : sugerenciaSinCortar(resultado.persona.barrio),
    });
  } catch (causa) {
    // Resumen siempre: sin esto, una base caida se ve igual que un token
    // rechazado. El token no entra aca ni en ningun otro registro.
    console.error(
      "[cidituc] no se pudo empadronar:",
      causa instanceof Error ? causa.message : causa,
    );
    // La cuenta ya ocupa otro lugar en el padron: cada reintento rebota igual,
    // asi que no puede compartir el "proba de nuevo en un rato" de una base
    // caida. Lo tiene que revisar el equipo (ver `CuentaYaEmpadronada`).
    return volver(
      request,
      destino,
      causa instanceof CuentaYaEmpadronada ? "cuenta-duplicada" : "sin-padron",
    );
  }

  // El token de CIDITUC ya cumplio su funcion y no se guarda: conservarlo solo
  // amplia lo que se pierde si algo se filtra.
  return volver(request, destino);
}
