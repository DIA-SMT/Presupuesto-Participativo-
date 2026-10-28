/**
 * Los motivos con los que puede volver el ingreso de CIDITUC
 * (src/app/auth/cidituc/callback/route.ts y .../ingresar/route.ts) y el texto
 * con que /ingresar los muestra. Cada uno dice algo distinto a proposito:
 * reintentar arregla "no pudimos consultar tus datos" y no arregla "la votacion
 * no esta abierta", asi que no pueden compartir el mismo cartel.
 *
 * Estaba adentro de src/app/ingresar/page.tsx. Vive aparte para poder probar la
 * busqueda (scripts/tests/errores-ingreso.test.ts): una pagina de Next no puede
 * exportar nada fuera de lo suyo.
 */
const MENSAJE_ERROR_INGRESO: Record<string, string> = {
  "sin-token": "El ingreso volvió sin credencial. Probá de nuevo desde el botón.",
  // Las causas reales son dos y no hay forma de distinguirlas desde aca: la
  // cookie del estado vencio (el ingreso tardo mas que DURACION_ESTADO,
  // src/lib/cidituc.ts) o la vuelta se abrio en otro navegador. Culpar solo al
  // navegador le mentia a quien hizo todo en el mismo pero se demoro sacando su
  // cuenta de CIDITUC.
  estado:
    "No pudimos confirmar el ingreso: tardó demasiado, o terminó en un navegador distinto del que lo empezó (pasa si abriste el sitio desde WhatsApp o Instagram). Entrá de nuevo desde el botón; si recién creaste tu cuenta de CIDITUC, ya la tenés y ahora es más rápido.",
  "token-invalido":
    "Tu credencial de CIDITUC no es válida o ya venció. Volvé a ingresar para obtener una nueva.",
  "sin-perfil":
    "No pudimos consultar tus datos en CIDITUC en este momento. Probá de nuevo en un rato; si sigue igual, avisanos.",
  "sin-documento":
    "CIDITUC no nos devolvió tu número de documento, así que no podemos empadronarte. Escribinos para que lo revisemos.",
  "sin-padron": "No pudimos guardar tu empadronamiento. Probá de nuevo en un rato.",
  // La cuenta de CIDITUC ya ocupa un lugar en el padron con otro documento (ver
  // `CuentaYaEmpadronada`, src/lib/empadronamiento.ts). Cada reintento rebota
  // igual, asi que este no puede decir "proba de nuevo": lo revisa el equipo.
  "cuenta-duplicada":
    "Tu cuenta de CIDITUC no coincide con los datos que tenemos en el padrón, así que no pudimos empadronarte. Escribinos para que lo revisemos: volver a intentarlo no lo resuelve.",
  // La base no contesto antes de llegar a CIDITUC (el limite de intentos o la
  // etapa): no es el empadronamiento ni la credencial, y reintentar en un rato
  // es justo lo que lo arregla.
  "sin-servicio":
    "No pudimos completar el ingreso por un problema nuestro. Probá de nuevo en un rato.",
  // Este depende del destino: lo arma la pagina con el texto de la etapa cerrada.
  "fuera-de-etapa": "",
  "demasiados-intentos": "Hubo demasiados intentos desde tu conexión. Esperá unos minutos.",
  "ingreso-cerrado":
    "El ingreso con ciudadanía digital todavía no está habilitado. Cuando lo esté, vas a poder entrar desde acá.",
};

/**
 * El texto de un motivo, o undefined si no es uno de los de arriba.
 *
 * El motivo llega en `?error=` y lo puede escribir cualquiera. Indexar el
 * diccionario directo con `?error=constructor` (o toString, valueOf,
 * __proto__...) devolvia lo heredado de Object.prototype: una funcion, que
 * React no puede dibujar como hijo del aviso, y /ingresar entera caia en la
 * pagina de error. Por eso solo cuentan las claves propias. Un `error`
 * repetido en la URL llega como lista: tampoco es un motivo.
 */
export function mensajeDeErrorIngreso(
  motivo: string | string[] | null | undefined,
): string | undefined {
  if (typeof motivo !== "string" || !Object.hasOwn(MENSAJE_ERROR_INGRESO, motivo)) {
    return undefined;
  }
  return MENSAJE_ERROR_INGRESO[motivo] || undefined;
}
