/**
 * Tope de intentos del cambio de la propia contrasena (`cambiarMiPassword`,
 * src/app/admin/acciones.ts).
 *
 * Esa accion compara la contrasena actual antes de cambiarla y contesta "La
 * contraseña actual no es correcta" cuando no coincide: es una segunda puerta
 * para probar contrasenas, ademas del login. Sin tope, quien tuviera una sesion
 * abierta (una computadora municipal con el panel sin cerrar, una cookie
 * robada, tambien la de un lector) recorria un diccionario sin limite ni
 * rastro, por fuera de los topes de `ingresarAdmin` que sostienen el minimo de
 * 6 caracteres (src/lib/politica-password.ts). Si acertaba, cambiaba la
 * contrasena: dejaba afuera a la persona y se quedaba con un acceso que
 * sobrevive al vencimiento de la cookie.
 *
 * Va por cuenta y no por IP: sin sesion no se llega a la accion, y la cuenta de
 * la sesion es lo unico que el atacante no puede rotar. Cinco cada diez minutos
 * le sobran a quien se equivoca al tipear la suya, y dejan un diccionario en
 * 30 intentos por hora. Agotarlo solo frena a esa misma cuenta, y quien lo
 * agota ya tiene su sesion: no sirve para dejar afuera a otra persona.
 *
 * Cuando salta queda un aviso en el log del servidor, como en el login.
 */
import { consumir } from "@/lib/rate-limit";

export const TOPE_PASSWORD_PROPIA = { maximo: 5, ventanaSegundos: 600 } as const;

/**
 * Cuenta un intento de verificar la contrasena actual de `adminId`. Devuelve el
 * mensaje para la persona si ya se paso el tope, o null si puede seguir.
 */
export async function topeDePasswordPropia(adminId: number): Promise<string | null> {
  const limite = await consumir(
    `password-propia:${adminId}`,
    TOPE_PASSWORD_PROPIA.maximo,
    TOPE_PASSWORD_PROPIA.ventanaSegundos,
  );
  if (limite.permitido) return null;

  // El id de la cuenta es interno y alcanza para saber a cual le estan
  // probando la contrasena.
  console.warn(`[password-propia] tope de intentos alcanzado (cuenta ${adminId}).`);
  const minutos = Math.max(1, Math.ceil(limite.reiniciaEn / 60));
  return `Demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}
