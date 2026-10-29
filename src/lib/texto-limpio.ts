/**
 * Saca los caracteres de control de un texto libre que va a una columna `text`.
 *
 * El que importa es U+0000: Postgres no lo acepta en `text` ("invalid byte
 * sequence for encoding UTF8: 0x00"), y el INSERT entero falla. En el chat y
 * en el asistente de carga ese INSERT es la fila de `chat_consultas`, y esas
 * filas son lo que suma el tope de gasto del dia (getTokensUsadosHoy): una
 * pregunta con un NUL se cobraba en el proveedor y no contaba para el tope, ni
 * aparecia en /admin/migue. Un NUL no lo escribe nadie con el teclado; llega
 * solo en un pedido armado a mano.
 *
 * De paso se van los demas de C0 y DEL, salvo el tabulador y los saltos de
 * linea, que son parte de lo que la persona escribio. Ninguno sirve en una
 * pregunta y algunos (el retroceso, el escape) desordenan el log.
 */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sinCaracteresDeControl(texto: string): string {
  return texto.replace(CONTROL, "");
}
