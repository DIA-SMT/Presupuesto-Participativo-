/**
 * Control unico de SESSION_SECRET, que usan las sesiones (src/lib/sesion.ts),
 * los codigos de seguimiento (src/lib/avisos.ts), la firma del chat
 * (src/lib/chat-firma.ts) y el ultimo recurso de la pimienta de la IP
 * (src/lib/rate-limit.ts).
 *
 * Ademas del largo minimo rechaza el texto de relleno que traia .env.example:
 * tiene mas de 32 caracteres, asi que pasaba el control, y es publico (esta en
 * el repo). Un entorno armado copiando la plantilla y completando solo lo que
 * daba error quedaba firmando con el: cualquiera podia fabricar una cookie de
 * votante o del panel y calcular el codigo de seguimiento de cualquier idea.
 * Es el mismo criterio que DNI_PEPPER (src/lib/empadronamiento.ts): un secreto
 * que esta en el repo no es secreto. Aca no hay excepcion para desarrollo,
 * porque generar uno cuesta una linea (ver .env.example).
 *
 * No se exige la forma "64 hexadecimales" que pide la plantilla: el secreto que
 * ya esta en produccion puede no tenerla, y rechazarlo dejaria al sitio sin
 * sesiones y cambiaria los codigos de seguimiento que tienen los vecinos.
 */

export const LARGO_MINIMO_SECRETO_SESION = 32;

/** Valores publicados que nunca valen como secreto. */
const SECRETOS_DE_PLANTILLA = new Set([
  "cambiar-por-un-secreto-de-64-caracteres-hexadecimales-aleatorio",
]);

/** Si el valor sirve como SESSION_SECRET. */
export function secretoDeSesionValido(secreto: string | undefined): secreto is string {
  return (
    !!secreto &&
    secreto.length >= LARGO_MINIMO_SECRETO_SESION &&
    !SECRETOS_DE_PLANTILLA.has(secreto.trim())
  );
}

/** SESSION_SECRET, o un error que dice como generarlo. */
export function exigirSecretoDeSesion(): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secretoDeSesionValido(secreto)) {
    throw new Error(
      "SESSION_SECRET faltante, demasiado corto (minimo 32 caracteres) o con el valor " +
        "de la plantilla. Generar uno con: " +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return secreto;
}
