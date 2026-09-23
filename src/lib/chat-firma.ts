/**
 * Firma de las respuestas del chat.
 *
 * El historial de la conversacion vive en el navegador (sessionStorage) y viaja
 * en cada consulta, porque el servidor no guarda sesiones de chat. Eso dejaba
 * abierta una puerta: el navegador podia mandar respuestas "del asistente" que
 * el asistente nunca escribio, y con eso guiar al modelo a hacer cualquier
 * cosa. Ver src/lib/chat-historial.ts.
 *
 * Al terminar cada respuesta el servidor manda, junto con el evento `fin`, un
 * HMAC del texto que la persona tiene en pantalla. El widget lo guarda con el
 * mensaje y lo devuelve; el servidor solo reenvia al modelo las respuestas cuya
 * firma coincide. Una respuesta inventada no tiene como traer una firma valida
 * sin el secreto del servidor.
 *
 * La clave sale de SESSION_SECRET, que el sitio ya exige para las sesiones,
 * pero no es SESSION_SECRET: se deriva con una etiqueta propia, asi una firma
 * de chat no sirve para nada mas (ni una cookie de sesion sirve de firma).
 *
 * Sin SESSION_SECRET (o con uno corto) no se firma nada y ninguna respuesta
 * anterior se reenvia: el chat sigue contestando, cada pregunta sin el contexto
 * de las anteriores. Es la degradacion que no abre la puerta de nuevo.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** El mismo minimo que exige src/lib/sesion.ts. */
const LARGO_MINIMO_SECRETO = 32;

function claveDeFirma(secreto: string | undefined): Buffer | null {
  if (!secreto || secreto.length < LARGO_MINIMO_SECRETO) return null;
  return createHmac("sha256", secreto).update("pp-chat:firma-de-respuestas:v1").digest();
}

/** La firma de un texto, o `null` si no hay secreto con que firmar. */
export function firmarRespuesta(
  texto: string,
  secreto: string | undefined = process.env.SESSION_SECRET,
): string | null {
  const clave = claveDeFirma(secreto);
  if (!clave) return null;
  return createHmac("sha256", clave).update(texto, "utf8").digest("base64url");
}

/** Si la firma corresponde a ese texto. Compara en tiempo constante. */
export function firmaValida(
  texto: string,
  firma: string | undefined,
  secreto: string | undefined = process.env.SESSION_SECRET,
): boolean {
  if (!firma) return false;
  const esperada = firmarRespuesta(texto, secreto);
  if (!esperada) return false;
  const recibida = Buffer.from(firma, "utf8");
  const calculada = Buffer.from(esperada, "utf8");
  return recibida.length === calculada.length && timingSafeEqual(recibida, calculada);
}
