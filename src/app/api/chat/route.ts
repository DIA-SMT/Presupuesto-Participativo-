/**
 * Endpoint del chatbot.
 *
 * La clave de la API vive solo en el servidor: el navegador nunca la ve.
 * El modelo no recibe la base de datos: recibe herramientas (ver
 * src/lib/chat-herramientas.ts) que consultan las mismas funciones que usan
 * las paginas. Por eso no puede responder con datos que el sitio no tenga.
 *
 * El proveedor es OpenRouter, con la API compatible con OpenAI (ver
 * src/lib/modelo.ts). Si no hay OPENROUTER_API_KEY configurada, el endpoint
 * responde igual usando el buscador determinístico de src/lib/chat-sin-ia.ts.
 */
import type OpenAI from "openai";
import { z } from "zod";
import { db } from "@/db";
import { chatConsultas } from "@/db/schema";
import { getEdicionActiva, getEstadisticas, getFaq, getHitos } from "@/db/queries";
import { HERRAMIENTAS, ejecutarHerramienta } from "@/lib/chat-herramientas";
import { responderSinIA } from "@/lib/chat-sin-ia";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import { ETIQUETA_ETAPA, formatearRango } from "@/lib/formato";
import {
  CONSUMO_VACIO,
  crearCliente,
  hayClave,
  mensajeDeError,
  modeloPara,
  sumarConsumo,
  type Consumo,
} from "@/lib/modelo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MENSAJES = 16;
const MAX_LARGO = 800;
/** Tope de vueltas del bucle de herramientas, por si el modelo se cicla. */
const MAX_VUELTAS = 6;
const MAX_TOKENS = 2048;

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
- /transparencia — qué proyecto ganó en cada distrito y con cuántos votos
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

  // Un CHAT_RATE_LIMIT vacio o invalido en el entorno no debe apagar el chat.
  const topeConfigurado = Number(process.env.CHAT_RATE_LIMIT);
  const tope =
    Number.isFinite(topeConfigurado) && topeConfigurado > 0 ? topeConfigurado : 30;
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

  // -------------------------------------------------------------------------
  // Sin clave: buscador determinístico. Misma forma de respuesta (SSE).
  // -------------------------------------------------------------------------
  if (!hayClave()) {
    const { texto, referencias } = await responderSinIA(pregunta, edicion);
    await registrar({
      pregunta,
      respuesta: texto,
      herramientas: ["buscador-local"],
      modelo: null,
      consumo: CONSUMO_VACIO,
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
  // Con clave: el modelo con herramientas, en streaming.
  // -------------------------------------------------------------------------
  const cliente = crearCliente();
  const modelo = modeloPara("chat");

  const sistema = await construirSistema();
  const mensajes: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: sistema },
    ...entrada.mensajes.map((m) => ({
      role: (m.rol === "usuario" ? "user" : "assistant") as "user" | "assistant",
      content: m.texto,
    })),
  ];

  const usadas: string[] = [];
  const referencias: Array<{ titulo: string; url: string }> = [];
  let respuesta = "";
  let consumo: Consumo = CONSUMO_VACIO;

  const cuerpo = new ReadableStream({
    async start(controlador) {
      const codificador = new TextEncoder();
      const enviar = (evento: Evento) =>
        controlador.enqueue(codificador.encode(sse(evento)));

      try {
        let cerroSolo = false;

        for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta += 1) {
          const stream = await cliente.chat.completions.create({
            model: modelo,
            messages: mensajes,
            tools: HERRAMIENTAS,
            max_tokens: MAX_TOKENS,
            stream: true,
            // Sin esto el ultimo trozo no trae el consumo y no se puede auditar.
            stream_options: { include_usage: true },
          });

          let texto = "";
          let motivo: string | null = null;
          // Las llamadas a herramientas llegan partidas en varios trozos: cada
          // delta trae un pedazo del JSON de argumentos. Se rearman por indice.
          const parciales = new Map<number, LlamadaParcial>();

          for await (const trozo of stream) {
            if (trozo.usage) consumo = sumarConsumo(consumo, trozo.usage);

            const eleccion = trozo.choices?.[0];
            if (!eleccion) continue;
            if (eleccion.finish_reason) motivo = eleccion.finish_reason;

            const contenido = eleccion.delta?.content;
            if (contenido) {
              texto += contenido;
              respuesta += contenido;
              enviar({ tipo: "texto", delta: contenido });
            }

            for (const parcial of eleccion.delta?.tool_calls ?? []) {
              const previo = parciales.get(parcial.index) ?? {
                id: "",
                nombre: "",
                argumentos: "",
              };
              parciales.set(parcial.index, {
                id: parcial.id ?? previo.id,
                nombre: parcial.function?.name ?? previo.nombre,
                argumentos: previo.argumentos + (parcial.function?.arguments ?? ""),
              });
            }
          }

          const llamadas = [...parciales.values()].filter((l) => l.nombre && l.id);

          if (!llamadas.length) {
            // Respuesta final. Si se corto por tope de tokens conviene decirlo:
            // antes quedaba truncada en seco y parecia un error del sitio.
            if (motivo === "length") {
              enviar({
                tipo: "texto",
                delta: "\n\n(La respuesta quedó cortada. Probá con una pregunta más acotada.)",
              });
            }
            cerroSolo = true;
            break;
          }

          mensajes.push({
            role: "assistant",
            content: texto || null,
            tool_calls: llamadas.map((l) => ({
              id: l.id,
              type: "function" as const,
              function: { name: l.nombre, arguments: l.argumentos || "{}" },
            })),
          });

          for (const llamada of llamadas) {
            usadas.push(llamada.nombre);
            enviar({ tipo: "herramienta", nombre: llamada.nombre });

            let contenido: string;
            try {
              const argumentos = llamada.argumentos.trim()
                ? (JSON.parse(llamada.argumentos) as unknown)
                : {};
              const salida = await ejecutarHerramienta(llamada.nombre, argumentos, edicion);
              referencias.push(...salida.referencias);
              contenido = salida.contenido;
            } catch (causa) {
              // El error vuelve al modelo como resultado, no corta la respuesta:
              // puede explicarle a la persona que esa consulta no se pudo hacer.
              contenido = JSON.stringify({
                error:
                  causa instanceof Error
                    ? `La consulta falló: ${causa.message}`
                    : "La consulta falló.",
              });
            }

            mensajes.push({
              role: "tool",
              tool_call_id: llamada.id,
              content: contenido,
            });
          }
        }

        // Se agotaron las vueltas sin respuesta final: antes terminaba en
        // silencio y la persona se quedaba mirando una respuesta a medias.
        if (!cerroSolo) {
          enviar({
            tipo: "error",
            mensaje:
              "No pude terminar de armar la respuesta. Probá preguntando de otra manera.",
          });
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
          consumo,
          ms: Date.now() - inicio,
          ipHash,
          ok: cerroSolo,
        });
      } catch (causa) {
        console.error("[chat]", causa);
        enviar({
          tipo: "error",
          mensaje: mensajeDeError(
            causa,
            "Hubo un problema al responder. Podés buscar el proyecto en /proyectos.",
          ),
        });
        await registrar({
          pregunta,
          respuesta: respuesta || null,
          herramientas: usadas,
          modelo,
          consumo,
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

/** Una llamada a herramienta mientras se rearma desde los trozos del stream. */
type LlamadaParcial = { id: string; nombre: string; argumentos: string };

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
  consumo: Consumo;
  ms: number;
  ipHash: string;
  ok: boolean;
}) {
  try {
    await db.insert(chatConsultas).values({
      origen: "chat",
      pregunta: datos.pregunta,
      respuesta: datos.respuesta,
      herramientas: datos.herramientas,
      modelo: datos.modelo,
      tokensEntrada: datos.consumo.tokensEntrada,
      tokensSalida: datos.consumo.tokensSalida,
      cacheLectura: datos.consumo.cacheLectura,
      ms: datos.ms,
      ipHash: datos.ipHash,
      ok: datos.ok,
    });
  } catch (causa) {
    // El registro es para estadistica interna: si falla, no rompe la respuesta.
    console.error("[chat] no se pudo registrar la consulta", causa);
  }
}
