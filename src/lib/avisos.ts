/**
 * Codigo de seguimiento de una idea.
 *
 * Es la forma en que el vecino se entera de como sigue su propuesta sin
 * depender del correo: con el numero de idea y este codigo entra a
 * /ideas/seguimiento y ve el estado y la devolucion del equipo.
 *
 * Decisiones:
 *  - Se deriva del `id` de la idea (clave primaria, unica garantizada) y no del
 *    campo `numero`, que es nullable y se asigna con un max()+1 sin lock.
 *  - No se guarda en ninguna columna: se recalcula. Asi no hay un secreto mas
 *    que proteger en la base.
 *  - Es corto (8 caracteres) porque la persona lo copia de un papel o de una
 *    captura de pantalla, y va acompanado del numero de idea: adivinarlo a
 *    ciegas requiere acertar los dos.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Sin ambiguedad visual: no van I, L, O, U, 0 ni 1. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LARGO = 8;

function pimienta(): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error("SESSION_SECRET faltante o demasiado corto (minimo 32 caracteres).");
  }
  return secreto;
}

/** Codigo de seguimiento de la idea con ese id. Siempre el mismo. */
export function codigoSeguimiento(ideaId: number): string {
  const digest = createHmac("sha256", pimienta())
    .update(`seguimiento:${ideaId}`)
    .digest();

  let codigo = "";
  for (let i = 0; i < LARGO; i += 1) {
    codigo += ALFABETO[digest[i] % ALFABETO.length];
  }
  return codigo;
}

/**
 * Compara en tiempo constante lo que escribio la persona contra el codigo real.
 * Tolera minusculas y espacios, que es como llega copiado de un mensaje.
 */
export function codigoValido(ideaId: number, ingresado: string): boolean {
  const limpio = ingresado.replace(/[\s-]/g, "").toUpperCase();
  if (limpio.length !== LARGO) return false;

  const esperado = Buffer.from(codigoSeguimiento(ideaId), "utf8");
  const recibido = Buffer.from(limpio, "utf8");
  if (esperado.length !== recibido.length) return false;
  return timingSafeEqual(esperado, recibido);
}

/**
 * Version del texto de consentimiento que la persona acepta al dejar su mail.
 * Se guarda en `ideas.autor_avisos_version`: si el texto cambia, los datos
 * cargados con la version anterior no se pueden usar bajo el texto nuevo.
 */
export const VERSION_CONSENTIMIENTO = "2026-08";

/**
 * Version del aviso legal y las condiciones de uso que se muestran al pie del
 * sitio (src/components/AvisoLegal.tsx). Se numera aparte de
 * VERSION_CONSENTIMIENTO porque son textos distintos y cambian por motivos
 * distintos: este no se guarda con ningun dato, solo se publica.
 */
export const VERSION_AVISO_LEGAL = "2026-08";
