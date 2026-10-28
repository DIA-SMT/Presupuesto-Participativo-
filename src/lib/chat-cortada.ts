/**
 * Una respuesta del chat que no termino de llegar, y como la deja el widget
 * (src/components/Chat.tsx).
 *
 * El servidor cierra toda respuesta con el evento `fin` (que trae el `modo`) o
 * con el de `error` (src/app/api/chat/route.ts). Una respuesta con texto que no
 * trae ninguno de los dos se corto en el camino: la persona toco un enlace de la
 * misma respuesta mientras llegaba (son `<a href>` comunes y recargan la
 * pagina), recargo, se corto la red a mitad de la lectura o el stream se cerro
 * sin `fin`.
 *
 * Antes el widget guardaba en sessionStorage cada trozo tal cual y, al volver,
 * la respuesta a medias aparecia como un globo normal: media lista de
 * proyectos que parecia la respuesta entera. Y si la red se cortaba con la
 * pagina abierta, quedaba el texto con el borde rojo y sin decir que habia
 * pasado. Ahora se cierra como aviso de error: lo que alcanzo a llegar, con la
 * aclaracion de que se corto. Como aviso de error no viaja como contexto de la
 * pregunta siguiente (`historialParaEnviar`, src/lib/chat-historial.ts), que
 * es lo que ya le pasaba por no tener firma.
 *
 * Funciones puras, sin dependencias del navegador, para poder probarlas.
 */

export const AVISO_CORTADA = "(La respuesta se cortó antes de terminar. Probá de nuevo.)";

/** Lo que hace falta mirar de un mensaje del widget para saber si quedo a medias. */
type MensajeCerrable = {
  rol: "usuario" | "asistente";
  texto: string;
  error?: boolean;
  modo?: string;
};

/** Una respuesta con texto que no llego a cerrarse: sin `fin` (sin `modo`) ni `error`. */
export function quedoCortada(mensaje: MensajeCerrable): boolean {
  return (
    mensaje.rol === "asistente" &&
    !mensaje.modo &&
    !mensaje.error &&
    mensaje.texto.trim().length > 0
  );
}

/**
 * La respuesta a medias, cerrada como aviso de error con lo que alcanzo a
 * llegar. Cualquier otro mensaje vuelve igual, asi que se puede aplicar mas de
 * una vez (al guardar y al leer lo guardado) sin repetir el aviso.
 */
export function cerrarCortada<M extends MensajeCerrable>(mensaje: M): M {
  if (!quedoCortada(mensaje)) return mensaje;
  return { ...mensaje, texto: `${mensaje.texto.trimEnd()}\n\n${AVISO_CORTADA}`, error: true };
}
