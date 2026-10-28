/**
 * Lo que el widget del chat (src/components/Chat.tsx) le hace decir al lector de
 * pantalla cuando Migue termina de contestar.
 *
 * La conversacion no es una region viva: la respuesta llega por streaming, de a
 * trozos, y anunciar cada trozo seria un ruido que no se entiende. Por eso el
 * widget tiene una region aparte (role="status") que dice "Migue está
 * respondiendo…" mientras llega y, al terminar, la respuesta entera de una vez.
 * Sin eso, quien usa NVDA o VoiceOver mandaba la consulta desde el campo y no
 * oia nada: ni la espera, ni la respuesta, ni el aviso del tope por hora.
 *
 * La respuesta viene en el markdown reducido del widget, y leida tal cual el
 * lector dice "asterisco asterisco" y las rutas de los enlaces. Aca queda en
 * llano: negritas sin marcas, enlaces con su titulo, sin viñetas, y cada linea
 * como una oracion, para que la lista de proyectos se lea con pausas.
 */

/** El markdown reducido del widget (negritas, listas, enlaces), en texto llano. */
export function textoEnLlano(texto: string): string {
  return texto
    .split("\n")
    .map((linea) =>
      linea
        // [titulo](/ruta) y [titulo](https://...): se lee el titulo.
        .replace(/\[([^\]]+)\]\([^)\s]*\)/g, "$1")
        // La viñeta de una lista. El numero de un paso ("1. Ingresá...") queda:
        // se lee bien y dice en que paso se esta.
        .replace(/^\s*[-*•]\s+/, "")
        // Negritas, y el asterisco suelto de una cursiva (el widget no la dibuja).
        .replace(/\*/g, "")
        .trim(),
    )
    .filter(Boolean)
    .map((linea) => (/[.:;!?…]$/.test(linea) ? linea : `${linea}.`))
    .join(" ");
}

/**
 * Lo que se anuncia de una respuesta terminada. Un aviso de error (el tope por
 * hora, "No llegó ninguna respuesta") se dice solo: no es algo que Migue respondio.
 */
export function anuncioDeRespuesta(mensaje: { texto: string; error?: boolean }): string {
  const llano = textoEnLlano(mensaje.texto);
  if (!llano) return "";
  return mensaje.error ? llano : `Migue respondió: ${llano}`;
}
