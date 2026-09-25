/**
 * La conversacion que viaja del navegador al chat, y lo que de ella llega al
 * modelo.
 *
 * Funciones puras y sin dependencias de Node: las usa el servidor
 * (src/app/api/chat/route.ts) para recortar lo que recibe, y el widget
 * (src/components/Chat.tsx) para no mandar lo que el servidor va a tirar. Asi
 * los topes estan escritos una sola vez.
 *
 * Por que hay topes
 * -----------------
 * El servidor aceptaba 16 mensajes de hasta 4000 caracteres, se los pasaba
 * enteros al modelo y los reenviaba en cada vuelta del bucle de herramientas.
 * Y aceptaba turnos de "asistente" escritos por el navegador: cualquiera podia
 * mandar una conversacion inventada, con respuestas "del asistente" que dijeran
 * lo que quisiera, y usar el chat como un acceso gratis a un modelo pago.
 *
 * Ahora al modelo llega poco y verificado:
 *  - Los ultimos `turnos` mensajes, con la pregunta nueva siempre incluida.
 *  - Cada pregunta recortada al largo del campo del widget, cada respuesta
 *    anterior al suyo, y todo junto a `largoTotal`.
 *  - Una respuesta anterior entra solo si la firmo el servidor
 *    (src/lib/chat-firma.ts). La que no trae firma, o la trae y no coincide con
 *    el texto, no se reenvia: no la escribio el sitio.
 *
 * Lo vacio se descarta en lugar de rechazar el pedido entero. Antes un globo de
 * respuesta vacio que quedaba guardado en el navegador (una pestaña que se
 * cerro a mitad de la respuesta) hacia que TODAS las consultas siguientes
 * contestaran "Consulta mal formada." hasta que la persona apretara Limpiar.
 */

export type RolMensaje = "usuario" | "asistente";

/** Un mensaje tal como lo manda el navegador. */
export type MensajeRecibido = {
  rol: RolMensaje;
  texto: string;
  /** Solo las respuestas: la firma que les puso el servidor al mandarlas. */
  firma?: string;
};

/** Un turno tal como se le pasa al modelo, ya recortado. */
export type TurnoModelo = { rol: RolMensaje; texto: string };

export const TOPES_HISTORIAL = {
  /**
   * Mensajes que llegan al modelo, contando la pregunta nueva. Seis son tres
   * idas y vueltas: alcanza para "¿y el del distrito 5?" despues de una
   * respuesta, que es para lo que sirve el historial aca.
   */
  turnos: 6,
  /** Una pregunta: el mismo `maxLength` del campo del widget. */
  largoPregunta: 800,
  /**
   * Una respuesta anterior. Las respuestas son de dos o tres parrafos (lo pide
   * el prompt), asi que casi nunca se recorta; cuando pasa, lo que se pierde es
   * la cola de una lista que el modelo puede volver a pedir a las herramientas.
   */
  largoRespuesta: 1500,
  /** Todo junto. La pregunta nueva entra siempre: es de a lo sumo 800. */
  largoTotal: 5000,
} as const;

export type TopesHistorial = { [K in keyof typeof TOPES_HISTORIAL]: number };

/** Recorta con puntos suspensivos, para que el modelo sepa que hubo mas. */
export function recortarTexto(texto: string, tope: number): string {
  return texto.length > tope ? `${texto.slice(0, tope - 1).trimEnd()}…` : texto;
}

/**
 * Lo que el servidor le pasa al modelo, o `null` si no hay pregunta.
 *
 * `esAutentica` decide si una respuesta anterior la escribio el sitio. Se
 * recibe en lugar de importarse porque verificar la firma necesita node:crypto
 * y este modulo tambien lo usa el navegador.
 *
 * El orden importa:
 *  1. Se sacan los mensajes vacios.
 *  2. El ultimo que queda tiene que ser de la persona. Se mira ANTES de sacar
 *     las respuestas sin firma: si el ultimo mensaje es una respuesta inventada,
 *     la "pregunta" no es la anterior a ella, que ya fue contestada.
 *  3. Se sacan las respuestas sin firma valida.
 *  4. Se toma desde el final hasta llenar los topes.
 *  5. Si la ventana arranca con una respuesta, se saca: una conversacion no
 *     empieza con el asistente, y algunos proveedores lo rechazan.
 */
export function recortarHistorial(
  mensajes: readonly MensajeRecibido[],
  esAutentica: (mensaje: MensajeRecibido) => boolean,
  topes: TopesHistorial = TOPES_HISTORIAL,
): { pregunta: string; turnos: TurnoModelo[] } | null {
  const conTexto = mensajes.filter((m) => m.texto.trim().length > 0);

  const ultima = conTexto.at(-1);
  if (!ultima || ultima.rol !== "usuario") return null;

  const anteriores = conTexto
    .slice(0, -1)
    .filter((m) => m.rol === "usuario" || esAutentica(m));

  const pregunta = recortarTexto(ultima.texto.trim(), topes.largoPregunta);
  const turnos: TurnoModelo[] = [{ rol: "usuario", texto: pregunta }];
  let total = pregunta.length;

  for (let i = anteriores.length - 1; i >= 0 && turnos.length < topes.turnos; i -= 1) {
    const mensaje = anteriores[i];
    const texto = recortarTexto(
      mensaje.texto.trim(),
      mensaje.rol === "usuario" ? topes.largoPregunta : topes.largoRespuesta,
    );
    // Se corta en el primero que no entra, no se saltea: saltearlo dejaria una
    // conversacion con un agujero en el medio, peor que una mas corta.
    if (total + texto.length > topes.largoTotal) break;
    total += texto.length;
    turnos.unshift({ rol: mensaje.rol, texto });
  }

  while (turnos.length > 1 && turnos[0].rol === "asistente") turnos.shift();

  return { pregunta, turnos };
}

/** Lo que el widget guarda de cada mensaje y necesita para decidir que manda. */
export type MensajeDelWidget = {
  rol: RolMensaje;
  texto: string;
  error?: boolean;
  firma?: string;
};

/**
 * Lo que el widget manda al servidor: el mismo criterio que va a aplicar el
 * servidor, para no viajar de gusto.
 *
 * Quedan afuera los mensajes vacios (el globo de una respuesta que no llego),
 * los avisos de error (no son parte de la conversacion: son el sitio diciendo
 * que fallo) y las respuestas sin firma (el servidor las tiraria igual). El
 * texto va entero: la firma es sobre el texto completo, y recortar es trabajo
 * del servidor.
 */
export function historialParaEnviar(
  mensajes: readonly MensajeDelWidget[],
  turnos: number = TOPES_HISTORIAL.turnos,
): MensajeRecibido[] {
  return mensajes
    .filter((m) => m.texto.trim().length > 0 && !m.error)
    .filter((m) => m.rol === "usuario" || Boolean(m.firma))
    .slice(-turnos)
    .map(({ rol, texto, firma }) => (firma ? { rol, texto, firma } : { rol, texto }));
}
