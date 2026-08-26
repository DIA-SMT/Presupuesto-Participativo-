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
 * regla del proyecto desde que existe el chat.
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

export { OpenAI };
