/**
 * Topes de intentos del login del panel (`ingresarAdmin`, src/app/admin/acciones.ts).
 *
 * Son dos, y hacen falta los dos:
 *  - Por IP: 10 cada 10 minutos, el mismo criterio que el resto del sitio.
 *    Frena a quien prueba desde una sola maquina.
 *  - Por cuenta: 50 por hora contra el mismo correo, vengan de donde vengan.
 *    El tope por IP solo no acota los intentos contra UNA cuenta: con un pool
 *    de proxies, 1.000 IP son unos 1.440 intentos por minuto contra
 *    admin@smt.gob.ar, y un diccionario de 100 mil contraseñas se recorria en
 *    algo mas de una hora sin que nada lo frenara. Con este tope son meses.
 *
 * El de la cuenta se cuenta para cualquier correo, exista o no, y responde lo
 * mismo que el de la IP: si se contara solo para las cuentas que existen, el
 * aviso de "demasiados intentos" diria cuales correos estan registrados.
 *
 * El precio es que quien conozca un correo del equipo puede dejar a esa persona
 * sin entrar hasta que vence la ventana, mandando fallos a proposito. Por eso
 * el tope es holgado y no un bloqueo: se destraba solo en una hora, y una sola
 * IP, al ritmo maximo que le deja su propio tope, tarda casi una hora en
 * agotarlo. Va en este orden por lo mismo: la IP que ya esta frenada no gasta
 * intentos de la cuenta.
 *
 * Cuando salta cualquiera de los dos queda un aviso en el log del servidor:
 * hasta ahora los fallos no dejaban rastro mas que un contador anonimo.
 */
import { consumir, hashearIp, hashearParaLimite, type Resultado } from "@/lib/rate-limit";

export const TOPE_POR_IP = { maximo: 10, ventanaSegundos: 600 } as const;
export const TOPE_POR_CUENTA = { maximo: 50, ventanaSegundos: 3600 } as const;

/**
 * Cuenta un intento de ingreso. Devuelve el mensaje para la persona si alguno
 * de los dos topes ya se paso, o null si el intento puede seguir.
 *
 * `email` llega normalizado (sin espacios y en minusculas), igual que se busca
 * en la tabla: "Admin@" y "admin@" son la misma cuenta y el mismo contador.
 */
export async function topeDeIngresoAdmin(ip: string, email: string): Promise<string | null> {
  const claveIp = hashearIp(ip);
  const porIp = await consumir(
    `login-admin:${claveIp}`,
    TOPE_POR_IP.maximo,
    TOPE_POR_IP.ventanaSegundos,
  );
  if (!porIp.permitido) return rechazo("IP", claveIp, porIp);

  const claveCuenta = hashearParaLimite(email);
  const porCuenta = await consumir(
    `login-admin-cuenta:${claveCuenta}`,
    TOPE_POR_CUENTA.maximo,
    TOPE_POR_CUENTA.ventanaSegundos,
  );
  if (!porCuenta.permitido) return rechazo("cuenta", claveCuenta, porCuenta);

  return null;
}

function rechazo(que: "IP" | "cuenta", clave: string, limite: Resultado): string {
  // Sin la IP ni el correo: el comienzo del hash alcanza para ver si es
  // siempre la misma cuenta o la misma maquina.
  console.warn(
    `[login-admin] tope de intentos por ${que} alcanzado (clave ${clave.slice(0, 12)}…).`,
  );
  const minutos = Math.max(1, Math.ceil(limite.reiniciaEn / 60));
  return `Demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}
