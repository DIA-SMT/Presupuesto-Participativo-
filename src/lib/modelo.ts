/**
 * Acceso al modelo de lenguaje, en un solo lugar.
 *
 * El sitio habla con **OpenRouter**, que expone una API compatible con la de
 * OpenAI (`/chat/completions`) y enruta a distintos proveedores segun el modelo
 * que se pida. Por eso se usa el SDK de OpenAI apuntado a su URL, y no el de
 * Anthropic: OpenRouter no expone un endpoint compatible con Anthropic.
 *
 * Tres funciones del sitio pasan por aca y ninguna instancia su propio cliente:
 *   - el chat publico            (src/app/api/chat/route.ts)
 *   - el asistente de carga      (src/app/api/ideas/asistente/route.ts)
 *   - el informe de impacto      (src/app/admin/acciones.ts)
 *
 * Sin OPENROUTER_API_KEY ninguna rompe: cada una degrada como pueda. Esa es la
 * regla del proyecto desde que existe el chat. Lo mismo vale cuando la clave
 * esta pero el proveedor no contesta (sin credito, modelo inexistente, caido) o
 * cuando se paso el tope diario de gasto (CHAT_TOPE_TOKENS_DIA, mas abajo).
 */
import OpenAI from "openai";

/** Punto de entrada de OpenRouter, compatible con el SDK de OpenAI. */
const URL_BASE = "https://openrouter.ai/api/v1";

/**
 * Modelo por defecto. Los identificadores de OpenRouter tienen la forma
 * `proveedor/modelo`. Se puede cambiar por entorno sin tocar codigo, y cada uso
 * puede pedir uno distinto: el chat responde preguntas cortas y conviene que
 * sea barato, mientras que el informe de impacto analiza un texto largo y
 * puede justificar uno mas caro.
 */
const MODELO_POR_DEFECTO = "anthropic/claude-sonnet-5";

/** Para que un modelo colgado no consuma la funcion de Vercel hasta el tope. */
const TIMEOUT_MS = 60_000;

export type UsoDelModelo = "chat" | "asistente" | "informe";

/** Variable de entorno propia de cada uso, si el equipo quiere afinar. */
const VARIABLE_POR_USO: Record<UsoDelModelo, string> = {
  chat: "OPENROUTER_MODELO_CHAT",
  asistente: "OPENROUTER_MODELO_ASISTENTE",
  informe: "OPENROUTER_MODELO_INFORME",
};

export function hayClave(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function modeloPara(uso: UsoDelModelo): string {
  return (
    process.env[VARIABLE_POR_USO[uso]]?.trim() ||
    process.env.OPENROUTER_MODELO?.trim() ||
    MODELO_POR_DEFECTO
  );
}

/**
 * Cliente listo para usar. Tira si no hay clave: quien llama tiene que haber
 * consultado `hayClave()` antes y haber resuelto su propia degradacion.
 */
export function crearCliente(): OpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta OPENROUTER_API_KEY. Quien llama tiene que consultar hayClave() antes.",
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: URL_BASE,
    timeout: TIMEOUT_MS,
    defaultHeaders: {
      // OpenRouter las usa para atribuir el uso al sitio en su ranking.
      "HTTP-Referer": process.env.SITE_URL?.trim() || "http://localhost:3001",
      "X-OpenRouter-Title": "Presupuesto Participativo SMT",
    },
  });
}

// ---------------------------------------------------------------------------
// Consumo
// ---------------------------------------------------------------------------

/**
 * Tokens gastados. Se acumula a lo largo de un pedido (el chat da varias
 * vueltas por el bucle de herramientas) y termina en la tabla `chat_consultas`,
 * que tiene las columnas para esto desde la migracion inicial.
 */
export type Consumo = {
  tokensEntrada: number;
  tokensSalida: number;
  cacheLectura: number;
};

export const CONSUMO_VACIO: Consumo = {
  tokensEntrada: 0,
  tokensSalida: 0,
  cacheLectura: 0,
};

type UsoCrudo = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
} | null | undefined;

export function sumarConsumo(previo: Consumo, uso: UsoCrudo): Consumo {
  if (!uso) return previo;
  return {
    tokensEntrada: previo.tokensEntrada + (uso.prompt_tokens ?? 0),
    tokensSalida: previo.tokensSalida + (uso.completion_tokens ?? 0),
    cacheLectura:
      previo.cacheLectura + (uso.prompt_tokens_details?.cached_tokens ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

/**
 * Traduce una falla del proveedor a algo que se le pueda mostrar a una persona.
 * Nunca expone el detalle tecnico: eso va al log del servidor.
 */
export function mensajeDeError(causa: unknown, alternativa: string): string {
  if (causa instanceof OpenAI.RateLimitError) {
    return "El asistente está recibiendo muchas consultas. Probá de nuevo en un minuto.";
  }
  if (causa instanceof OpenAI.AuthenticationError) {
    return "El asistente no está configurado correctamente en el servidor.";
  }
  if (causa instanceof OpenAI.APIConnectionTimeoutError) {
    return "El asistente tardó demasiado en responder. Probá de nuevo.";
  }
  return alternativa;
}

/**
 * Que fallo, en una etiqueta corta para el registro (`chat_consultas`) y el
 * log. No es un texto para la persona: para eso esta `mensajeDeError`.
 *
 * Se distingue lo que el equipo resuelve de maneras distintas: `proveedor-402`
 * es cargar credito en OpenRouter, `proveedor-404` es un nombre de modelo mal
 * escrito en el entorno, `proveedor-5xx` y `timeout` son el proveedor caido y
 * se arreglan solos. El codigo sale de `status` cuando la falla llega como
 * respuesta HTTP, y de `code` cuando llega a mitad del stream: OpenRouter manda
 * ahi un trozo `{"error": {"code": 402, ...}}` con el HTTP ya en 200, y el SDK
 * lo tira como APIError sin status.
 */
export function motivoDeFalla(causa: unknown): string {
  // El orden importa: las tres primeras son subclases de APIError.
  if (causa instanceof OpenAI.APIConnectionTimeoutError) return "timeout";
  if (causa instanceof OpenAI.APIUserAbortError) return "cancelada";
  if (causa instanceof OpenAI.APIConnectionError) return "conexion";
  if (causa instanceof OpenAI.APIError) {
    const codigo = String(causa.status ?? causa.code ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 40);
    return codigo ? `proveedor-${codigo}` : "proveedor";
  }
  return "interno";
}

// ---------------------------------------------------------------------------
// Tope diario de gasto
// ---------------------------------------------------------------------------

/**
 * El tope que fija CHAT_TOPE_TOKENS_DIA: tokens por dia calendario de Tucuman,
 * sumando entrada y salida de las tres funciones (chat, asistente e informe),
 * que registran su consumo en la misma tabla. `null` es "sin tope", que es lo
 * que pasa sin la variable: el comportamiento de siempre.
 *
 * Acepta los separadores de miles que se escriben a mano ("2.000.000",
 * "2_000_000"): en Argentina el punto es separador de miles, y leer "2.000.000"
 * como 2 apagaria la IA a la primera consulta.
 *
 * Un valor que no se entiende ("2M", "-5", "mucho") NO se toma como "sin tope".
 * Quien puso la variable queria un tope, y el error seguro es el que no gasta:
 * queda en cero, la IA se apaga y el chat sigue con el buscador. `invalido`
 * existe para poder decirlo en el log, porque un tope en cero a proposito
 * (CHAT_TOPE_TOKENS_DIA=0 apaga la IA sin sacar la clave) es valido.
 */
export type TopeDiario = { tokens: number; invalido: boolean } | null;

export function leerTopeDiario(valor: string | undefined): TopeDiario {
  const texto = valor?.trim();
  if (!texto) return null;
  const digitos = /^\d{1,3}([._ ]\d{3})+$/.test(texto) ? texto.replace(/[._ ]/g, "") : texto;
  if (!/^\d+$/.test(digitos)) return { tokens: 0, invalido: true };
  const tokens = Number(digitos);
  return Number.isSafeInteger(tokens)
    ? { tokens, invalido: false }
    : { tokens: 0, invalido: true };
}

/** Con el tope justo alcanzado ya no se llama: la proxima consulta lo pasaria. */
export function topeAlcanzado(usados: number, tope: number): boolean {
  return usados >= tope;
}

let avisoTopeInvalido = false;

/**
 * Si hoy ya no hay que llamar al modelo. Quien llama pasa la lectura del gasto
 * (`getTokensUsadosHoy` de src/db/queries.ts) en lugar de importarla aca: este
 * modulo no toca la base, asi se puede probar sin una.
 *
 * Es un tope blando, y a proposito: el consumo de una consulta se registra
 * cuando termina, asi que las que estan en curso al cruzar el tope todavia
 * suman. Se pasa por lo que gasten esas, no por un dia entero.
 *
 * Si la lectura falla, cuenta como agotado. El tope es un freno de gasto y los
 * frenos fallan cerrados: el costo de equivocarse es que la persona recibe la
 * respuesta del buscador.
 */
export async function gastoDelDiaAgotado(
  leerUsadosHoy: () => Promise<number>,
  valor: string | undefined = process.env.CHAT_TOPE_TOKENS_DIA,
): Promise<boolean> {
  const tope = leerTopeDiario(valor);
  if (!tope) return false;
  if (tope.invalido && !avisoTopeInvalido) {
    avisoTopeInvalido = true;
    console.error(
      `[modelo] CHAT_TOPE_TOKENS_DIA="${valor}" no es un entero: la IA queda apagada hasta corregirlo.`,
    );
  }
  if (tope.tokens === 0) return true;
  try {
    return topeAlcanzado(await leerUsadosHoy(), tope.tokens);
  } catch (causa) {
    console.error("[modelo] no se pudo leer el gasto del dia; se toma como agotado", causa);
    return true;
  }
}

export { OpenAI };
