/**
 * Endpoint del chatbot.
 *
 * La clave de la API vive solo en el servidor: el navegador nunca la ve.
 * El modelo no recibe la base de datos: recibe herramientas (ver
 * src/lib/chat-herramientas.ts) que consultan las mismas funciones que usan
 * las paginas. Por eso no puede responder con datos que el sitio no tenga.
 *
 * Si no hay ANTHROPIC_API_KEY configurada, el endpoint responde igual usando el
 * buscador determinístico de src/lib/chat-sin-ia.ts.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/db";
import { chatConsultas } from "@/db/schema";
import { getEdicionActiva, getEstadisticas, getFaq, getHitos } from "@/db/queries";
import { HERRAMIENTAS, ejecutarHerramienta } from "@/lib/chat-herramientas";
import { responderSinIA } from "@/lib/chat-sin-ia";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import { ETIQUETA_ETAPA, formatearRango } from "@/lib/formato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MENSAJES = 16;
const MAX_LARGO = 800;
/** Tope de vueltas del bucle de herramientas, por si el modelo se cicla. */
const MAX_VUELTAS = 6;

const esquema = z.object({
  mensajes: z
    .array(
      z.object({
        rol: z.enum(["usuario", "asistente"]),
        texto: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(MAX_MENSAJES),
});

type Evento =
  | { tipo: "texto"; delta: string }
  | { tipo: "herramienta"; nombre: string }
  | { tipo: "referencias"; items: Array<{ titulo: string; url: string }> }
  | { tipo: "fin"; modo: "ia" | "buscador" }
  | { tipo: "error"; mensaje: string };

function sse(evento: Evento): string {
  return `data: ${JSON.stringify(evento)}\n\n`;
}

// ---------------------------------------------------------------------------
// Instrucciones del asistente
// ---------------------------------------------------------------------------

async function construirSistema(): Promise<string> {
  const edicion = await getEdicionActiva();
  if (!edicion) return "";

  const [stats, faq, hitos] = await Promise.all([
    getEstadisticas(edicion),
    getFaq(),
    getHitos(edicion.id),
  ]);

  return `Sos el asistente del sitio del Presupuesto Participativo de la Municipalidad de San Miguel de Tucumán, Argentina. Ayudás a vecinos y vecinas a entender el programa y a encontrar los proyectos de su barrio.

# Cómo respondés

- En español de Argentina, con voseo ("podés", "tenés", "fijate"). Trato cordial y directo, sin solemnidad.
- Breve: dos o tres párrafos como máximo, o una lista corta. La gente entra desde el celular.
- Markdown simple: negritas y listas. Sin encabezados ni tablas.
- Nunca uses lenguaje partidario ni opines sobre gestiones o funcionarios. Si te preguntan algo político, decí amablemente que solo podés informar sobre el programa.

# De dónde salen los datos

TODA la información concreta sale de las herramientas. No tenés memoria de proyectos: si te preguntan por uno, buscalo.

- Nunca inventes ni estimes un número, un monto, una fecha o un nombre de proyecto. Si la herramienta dice que un dato "no está cargado" o "no publicado todavía", decilo con esas palabras. Es información pública en construcción y decir la verdad sobre lo que falta es parte del trabajo.
- Si la búsqueda no devuelve nada, decí que no encontraste y ofrecé otra forma de buscar. No completes con algo parecido.
- Cuando nombres un proyecto, mencioná su distrito. Cuando la herramienta devuelva una url, enlazala en markdown con el título del proyecto.
- Si alguien pregunta por su barrio y no sabés a qué distrito pertenece, usá ubicar_barrio. Si no aparece, mandalo al mapa en /distritos en lugar de adivinar.
- Si la ubicación de una idea es "aproximada", aclaralo: significa que la idea se cargó sin coordenada y el punto es el centro del distrito.

# Estado del programa (contexto fijo)

Edición vigente: ${stats.anio}. Etapa actual: ${ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}.
Ideas presentadas: ${stats.ideas}. Proyectos ganadores: ${stats.ganadores}. Votos registrados en los ganadores: ${stats.votos}.
La ciudad tiene 20 distritos y cada uno elige su propio proyecto.${
    stats.distritosSinGanador.length
      ? ` Sin proyecto ganador en esta edición: distrito ${stats.distritosSinGanador.join(", ")}.`
      : ""
  }

Categorías: ${stats.porCategoria.map((c) => `${c.nombre} (${c.ideas} ideas)`).join("; ")}.

Reglas de votación: 1 voto por persona, únicamente en un proyecto del distrito donde vive. El empadronamiento es con ciudadanía digital CIDITUC, virtual desde la web municipal o presencial en las asambleas participativas.

Cronograma:
${hitos.map((h) => `- ${h.titulo}: ${formatearRango(h.desde, h.hasta) || "sin fecha"}. ${h.detalle ?? ""}`).join("\n")}

Preguntas frecuentes del sitio:
${faq.map((f) => `P: ${f.pregunta}\nR: ${f.respuesta}`).join("\n\n")}

# Páginas a las que podés derivar

- /distritos — mapa de los 20 distritos
- /proyectos — listado con filtros por distrito, categoría y estado
- /transparencia — etapa y avance de obra de cada proyecto ganador
- /ideas/nueva — formulario para presentar una idea
- /acerca-de — preguntas frecuentes`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const inicio = Date.now();
  const ipHash = hashearIp(ipDe(request));

  let entrada: z.infer<typeof esquema>;
  try {
    entrada = esquema.parse(await request.json());
  } catch {
    return Response.json({ error: "Consulta mal formada." }, { status: 400 });
  }

  const ultima = entrada.mensajes.at(-1);
  if (!ultima || ultima.rol !== "usuario") {
    return Response.json({ error: "Falta la consulta." }, { status: 400 });
  }
  const pregunta = ultima.texto.slice(0, MAX_LARGO);

  const tope = Number(process.env.CHAT_RATE_LIMIT ?? 30);
  const limite = await consumir(`chat:${ipHash}`, tope, 3600);
  if (!limite.permitido) {
    return Response.json(
      {
        error: `Alcanzaste el máximo de ${tope} consultas por hora. Probá de nuevo en ${Math.ceil(
          limite.reiniciaEn / 60,
        )} minutos.`,
      },
      { status: 429 },
    );
  }

  const edicion = await getEdicionActiva();
  if (!edicion) {
    return Response.json(
      { error: "Todavía no hay una edición activa cargada." },
      { status: 503 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  // -------------------------------------------------------------------------
  // Sin clave: buscador determinístico. Misma forma de respuesta (SSE).
  // -------------------------------------------------------------------------
  if (!apiKey) {
    const { texto, referencias } = await responderSinIA(pregunta, edicion);
    await registrar({
      pregunta,
      respuesta: texto,
      herramientas: ["buscador-local"],
      modelo: null,
      ms: Date.now() - inicio,
      ipHash,
      ok: true,
    });

    const cuerpo = new ReadableStream({
      start(controlador) {
        const codificador = new TextEncoder();
        // Se envía en trozos para que la interfaz muestre el mismo efecto.
        for (const trozo of texto.match(/[\s\S]{1,24}/g) ?? []) {
          controlador.enqueue(codificador.encode(sse({ tipo: "texto", delta: trozo })));
        }
        if (referencias.length) {
          controlador.enqueue(
            codificador.encode(sse({ tipo: "referencias", items: referencias })),
          );
        }
        controlador.enqueue(codificador.encode(sse({ tipo: "fin", modo: "buscador" })));
        controlador.close();
      },
    });
    return new Response(cuerpo, { headers: cabecerasSse });
  }

  // -------------------------------------------------------------------------
  // Con clave: Claude con herramientas, en streaming.
  // -------------------------------------------------------------------------
  const cliente = new Anthropic({ apiKey });
  const modelo = process.env.CHAT_MODEL?.trim() || "claude-opus-5";
  const esfuerzo = (process.env.CHAT_EFFORT?.trim() || "low") as
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";

  const sistema = await construirSistema();
  const mensajes: Anthropic.MessageParam[] = entrada.mensajes.map((m) => ({
    role: m.rol === "usuario" ? "user" : "assistant",
    content: m.texto,
  }));

  const usadas: string[] = [];
  const referencias: Array<{ titulo: string; url: string }> = [];
  let respuesta = "";

  const cuerpo = new ReadableStream({
    async start(controlador) {
      const codificador = new TextEncoder();
      const enviar = (evento: Evento) =>
        controlador.enqueue(codificador.encode(sse(evento)));

      try {
        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
          const stream = cliente.messages.stream({
            model: modelo,
            max_tokens: 2048,
            // El prompt de sistema y las herramientas son estables: se cachean
            // para que cada consulta pague solo el mensaje del usuario.
            system: [
              { type: "text", text: sistema, cache_control: { type: "ephemeral" } },
            ],
            output_config: { effort: esfuerzo },
            tools: HERRAMIENTAS,
            messages: mensajes,
          });

          stream.on("text", (delta) => {
            respuesta += delta;
            enviar({ tipo: "texto", delta });
          });

          const mensaje = await stream.finalMessage();

          if (mensaje.stop_reason === "refusal") {
            enviar({
              tipo: "error",
              mensaje: "No puedo responder esa consulta. Probá con otra pregunta sobre el programa.",
            });
            break;
          }

          const llamadas = mensaje.content.filter(
            (bloque): bloque is Anthropic.ToolUseBlock => bloque.type === "tool_use",
          );

          if (!llamadas.length) break;

          mensajes.push({ role: "assistant", content: mensaje.content });

          const resultados: Anthropic.ToolResultBlockParam[] = [];
          for (const llamada of llamadas) {
            usadas.push(llamada.name);
            enviar({ tipo: "herramienta", nombre: llamada.name });
            try {
              const salida = await ejecutarHerramienta(llamada.name, llamada.input, edicion);
              referencias.push(...salida.referencias);
              resultados.push({
                type: "tool_result",
                tool_use_id: llamada.id,
                content: salida.contenido,
              });
            } catch (causa) {
              resultados.push({
                type: "tool_result",
                tool_use_id: llamada.id,
                is_error: true,
                content:
                  causa instanceof Error
                    ? `La consulta falló: ${causa.message}`
                    : "La consulta falló.",
              });
            }
          }

          mensajes.push({ role: "user", content: resultados });
        }

        const unicas = [
          ...new Map(referencias.map((r) => [r.url, r])).values(),
        ].slice(0, 4);
        if (unicas.length) enviar({ tipo: "referencias", items: unicas });
        enviar({ tipo: "fin", modo: "ia" });

        await registrar({
          pregunta,
          respuesta,
          herramientas: usadas,
          modelo,
          ms: Date.now() - inicio,
          ipHash,
          ok: true,
        });
      } catch (causa) {
        const mensaje =
          causa instanceof Anthropic.RateLimitError
            ? "El asistente está recibiendo muchas consultas. Probá de nuevo en un minuto."
            : causa instanceof Anthropic.AuthenticationError
              ? "El asistente no está configurado correctamente en el servidor."
              : "Hubo un problema al responder. Podés buscar el proyecto en /proyectos.";
        console.error("[chat]", causa);
        enviar({ tipo: "error", mensaje });
        await registrar({
          pregunta,
          respuesta: respuesta || null,
          herramientas: usadas,
          modelo,
          ms: Date.now() - inicio,
          ipHash,
          ok: false,
        });
      } finally {
        controlador.close();
      }
    },
  });

  return new Response(cuerpo, { headers: cabecerasSse });
}

const cabecerasSse = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

async function registrar(datos: {
  pregunta: string;
  respuesta: string | null;
  herramientas: string[];
  modelo: string | null;
  ms: number;
  ipHash: string;
  ok: boolean;
}) {
  try {
    await db.insert(chatConsultas).values({
      pregunta: datos.pregunta,
      respuesta: datos.respuesta,
      herramientas: datos.herramientas,
      modelo: datos.modelo,
      ms: datos.ms,
      ipHash: datos.ipHash,
      ok: datos.ok,
    });
  } catch (causa) {
    // El registro es para estadistica interna: si falla, no rompe la respuesta.
    console.error("[chat] no se pudo registrar la consulta", causa);
  }
}
