/**
 * Reporte de cada consulta del chat al dashboard de la Direccion de IA
 * (seccion "Migue" de Organizacion DIA), para ver su uso y efectividad.
 *
 * Reglas, porque esto corre al lado de la respuesta al vecino:
 * - Apagado si falta MIGUE_API_KEY o MIGUE_DASHBOARD_URL: sin esas variables
 *   no se arma ni se envia nada.
 * - Nunca tira errores ni demora la respuesta: el envio tiene tiempo maximo y
 *   cualquier falla se anota en el log y se descarta.
 * - No manda datos de personas: ni IP ni DNI. Por defecto tampoco manda el texto
 *   de la pregunta. Solo con MIGUE_ENVIAR_PREGUNTAS=1 viaja la pregunta que Migue
 *   no pudo responder, con correos, numeros de documento o telefono, alturas de
 *   calle y nombres presentados ("soy ...") tapados. Un filtro por texto no
 *   atrapa todos los nombres: por eso es opcional.
 *
 * El formato es el que documenta el dashboard (docs/migue-conexion.md en el
 * repo de Organizacion DIA). Cada pregunta cuenta como una conversacion.
 */
import { ETIQUETA_TEMA, type TemaConsulta } from "./chat-temas";
import type { Consumo } from "./modelo";

/** Tiempo maximo del envio: el dashboard caido no puede colgar nada. */
const TIEMPO_MAXIMO_MS = 3000;
const LARGO_MAXIMO_PREGUNTA = 300;
/** Tope del dashboard para el tiempo de respuesta: mas que eso no se informa. */
const MAXIMO_RESPUESTA_MS = 600_000;

export type ConfigReporte = { clave: string; url: string; enviarPreguntas: boolean };

export type DatosDelReporte = {
  pregunta: string;
  tema: TemaConsulta;
  resuelta: boolean;
  /** false cuando fallo el sistema (no es una pregunta sin respuesta). */
  ok: boolean;
  consumo: Consumo;
  ms: number;
};

/** Conversacion en el formato de POST /api/migue/conversaciones. */
export type ReporteMigue = {
  conversation_id: string;
  started_at: string;
  ended_at: string;
  channel: string;
  messages: number;
  outcome: "resuelta" | "sin_respuesta";
  avg_response_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  topic: string;
  unanswered_question?: string;
};

/** null = reporte apagado. */
export function reporteConfigurado(entorno: Record<string, string | undefined> = process.env): ConfigReporte | null {
  const clave = entorno.MIGUE_API_KEY?.trim();
  const url = entorno.MIGUE_DASHBOARD_URL?.trim().replace(/\/+$/, "");
  if (!clave || !url) return null;
  return { clave, url, enviarPreguntas: entorno.MIGUE_ENVIAR_PREGUNTAS?.trim() === "1" };
}

const FECHA = /^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$/;
const PAR_DE_ANIOS = /^(?:19|20)\d{2}[\s-]+(?:19|20)\d{2}$/;
/**
 * Palabras tras las que un 19xx/20xx es un anio ("edicion 2025", "en 2025", "mayo 2025").
 * Tras cualquier otra es una altura de calle: "San Martin 2025", "Lavalle al 2025".
 */
const ANTES_DE_UN_ANIO = /^(?:a|año|años|anio|anios|ciclo|de|del|desde|durante|edicion|edición|el|en|entre|hasta|hacia|para|participativo|periodo|período|pp|presupuesto|y)$/;
/** Un mes en mayuscula puede ser una calle ("24 de Septiembre 2025"): solo cuenta en minuscula. */
const MES = /^(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)$/;

function esAnio(palabra: string, numero: string): boolean {
  return /^(?:19|20)\d{2}$/.test(numero) && (ANTES_DE_UN_ANIO.test(palabra.toLowerCase()) || MES.test(palabra));
}

/**
 * Tapa correos, numeros de 7 cifras o mas (DNI, telefonos), alturas de calle y
 * nombres despues de "soy", "me llamo" o "mi nombre es". Deja montos, fechas y
 * anios, que son justo lo que se pregunta en este sitio.
 */
export function taparDatosPersonales(texto: string): string {
  return texto
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[correo]")
    // Sin la bandera i: con ella \p{Lu} tambien acepta minusculas y "soy de Villa..." perderia el barrio.
    .replace(/\b([Ss]oy|[Mm]e llamo|[Mm]i nombre es)\s+((?:\p{Lu}[\p{L}'-]*\s*){1,3})/gu, (_, presentacion: string) => `${presentacion} [nombre] `)
    .replace(/\+?\d(?:[\s.-]{0,2}\d){6,}/g, (numero: string, posicion: number, completo: string) => {
      const antes = completo.slice(0, posicion);
      const despues = completo.slice(posicion + numero.length);
      const esMonto = /\$\s*$/.test(antes) || /^\s*(?:pesos|millones|mil)\b/i.test(despues);
      if (esMonto || FECHA.test(numero.trim()) || PAR_DE_ANIOS.test(numero.trim())) return numero;
      return "[número]";
    })
    // Altura de calle ("Lavalle 1234"): una palabra seguida de 3 a 5 cifras que no son un anio.
    .replace(/(\p{L}+)(\.?\s+)(\d{3,5})\b/gu, (todo: string, palabra: string, separador: string, numero: string) =>
      esAnio(palabra, numero) ? todo : `${palabra}${separador}[número]`,
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Recorta sin dejar un emoji partido a la mitad (Postgres rechaza el pedazo suelto). */
function recortar(texto: string, largo: number): string {
  return texto.slice(0, largo).replace(/[\uD800-\uDBFF]$/, "");
}

export function armarReporte(
  datos: DatosDelReporte,
  id: string,
  ahora: number,
  opciones: { enviarPreguntas: boolean } = { enviarPreguntas: false },
): ReporteMigue {
  const duracion = Math.max(0, Math.round(datos.ms));
  const reporte: ReporteMigue = {
    conversation_id: `pp-web:${id}`,
    started_at: new Date(ahora - duracion).toISOString(),
    ended_at: new Date(ahora).toISOString(),
    channel: "Web",
    // La pregunta del vecino y la respuesta de Migue.
    messages: 2,
    outcome: datos.resuelta ? "resuelta" : "sin_respuesta",
    topic: ETIQUETA_TEMA[datos.tema],
  };
  // Mas alla del tope del dashboard se omite: la conversacion cuenta igual, sin tiempo.
  if (duracion <= MAXIMO_RESPUESTA_MS) reporte.avg_response_ms = duracion;
  // Sin clave de OpenRouter (buscador local) no hay consumo: no se mandan ceros.
  if (datos.consumo.tokensEntrada > 0) reporte.tokens_in = datos.consumo.tokensEntrada;
  if (datos.consumo.tokensSalida > 0) reporte.tokens_out = datos.consumo.tokensSalida;
  // Una falla del sistema no es una pregunta que Migue no sepa: no se manda el texto.
  if (opciones.enviarPreguntas && !datos.resuelta && datos.ok) {
    const pregunta = recortar(taparDatosPersonales(datos.pregunta), LARGO_MAXIMO_PREGUNTA);
    if (pregunta) reporte.unanswered_question = pregunta;
  }
  return reporte;
}

/** Envia el reporte. Nunca tira: si algo falla, lo anota en el log y sigue. */
export async function enviarReporte(
  reporte: ReporteMigue,
  config: ConfigReporte,
  enviar: typeof fetch = fetch,
  tiempoMaximoMs: number = TIEMPO_MAXIMO_MS,
): Promise<void> {
  try {
    const respuesta = await enviar(`${config.url}/api/migue/conversaciones`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.clave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ conversations: [reporte] }),
      signal: AbortSignal.timeout(tiempoMaximoMs),
    });
    if (!respuesta.ok) {
      console.warn(`[migue] el dashboard rechazo el reporte (${respuesta.status})`);
      return;
    }
    // El dashboard responde 200 aunque descarte la fila: el motivo viene en "rejected".
    const cuerpo = (await respuesta.json().catch(() => null)) as { rejected?: Array<{ error?: string }> } | null;
    if (Array.isArray(cuerpo?.rejected) && cuerpo.rejected.length > 0) {
      console.warn(`[migue] el dashboard descarto el reporte: ${cuerpo.rejected[0]?.error ?? "sin motivo"}`);
    }
  } catch (causa) {
    console.warn("[migue] no se pudo enviar el reporte al dashboard", causa instanceof Error ? causa.message : causa);
  }
}
