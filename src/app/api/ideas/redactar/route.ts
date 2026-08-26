/**
 * Ayuda de redaccion campo por campo, mientras el vecino escribe.
 *
 * Es distinto del asistente (`/api/ideas/asistente`), que revisa la propuesta
 * ENTERA antes de enviarla y devuelve una reescritura de todo junto. Esto es
 * mas chico y mas util: la persona esta escribiendo un campo, aprieta el boton
 * de ese campo y recibe una sola cosa.
 *
 * La regla que gobierna todo el archivo
 * -------------------------------------
 * En `problema` y `solucion` la IA **no escribe desde cero**. La persona pone
 * el texto y la IA lo formaliza. Es un pedido explicito de Lucas (26/08/2026),
 * y no es capricho: son los dos campos con los que el equipo tecnico evalua la
 * propuesta. Si los escribiera la maquina, el municipio estaria evaluando un
 * texto que no dijo ningun vecino.
 *
 * Por eso el minimo se valida ACA y no solo en el navegador. El boton
 * deshabilitado del formulario es comodidad; la garantia es este 422. Un
 * `fetch` a mano, un formulario viejo en una pestana o un bug de la interfaz no
 * pueden saltearlo.
 *
 * `beneficios` es el unico caso donde si puede redactar con el campo vacio, y
 * tampoco es desde cero: lo deduce del problema y la solucion que la persona ya
 * escribio, del barrio y del distrito. Por eso exige que esos dos campos tengan
 * contenido antes de dejar pedir nada.
 *
 * Lo que el modelo NO recibe: nombre ni correo de quien carga.
 */
import { z } from "zod";
import { db } from "@/db";
import { chatConsultas } from "@/db/schema";
import { getCategorias } from "@/db/queries";
import { LARGOS } from "@/lib/idea-esquema";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
// Los prompts viven aparte para poder correrlos contra el modelo real sin
// levantar el sitio: `npx tsx scripts/probar-redaccion.ts`.
import { SISTEMA_BENEFICIOS, sistemaFormalizar } from "@/lib/redaccion-prompts";
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

/** Pedidos por hora y por IP. Clave propia: no toca el tope del alta. */
const TOPE_POR_HORA = 25;
const MAX_TOKENS = 900;

/**
 * Cuanto tiene que haber escrito la persona para que la IA pueda formalizarlo.
 *
 * No es un numero redondo por gusto: con menos de esto no hay texto que ordenar
 * y el modelo, aunque le pidas que no invente, termina rellenando. Es el piso
 * de "escribio algo", no el minimo para enviar la propuesta (ese vive en
 * MINIMOS de idea-esquema y es mas alto).
 */
const MINIMO_PARA_FORMALIZAR = 15;
/** Para deducir los beneficios hace falta sustancia en los otros dos campos. */
const MINIMO_DE_CONTEXTO = 25;

const CAMPOS = ["problema", "solucion", "beneficios"] as const;
type Campo = (typeof CAMPOS)[number];

export type RespuestaRedactar = {
  campo: Campo;
  /** "formalizado" partio del texto de la persona; "redactado" lo dedujo. */
  modo: "formalizado" | "redactado";
  texto: string;
  /**
   * Aspectos tecnicos que el municipio suele pedir para una obra asi y que la
   * persona no menciono. Van SEPARADOS del texto a proposito: son una oferta,
   * no un agregado. El formulario los muestra como casillas y solo entran al
   * texto si la persona los tilda, y en ese caso vuelven en `agregar`.
   *
   * Es la unica via por la que aparece vocabulario tecnico que la persona no
   * escribio, y existe porque sin eso una propuesta de vecino no llega nunca al
   * nivel de las que ganan (ver el comentario de src/lib/redaccion-prompts.ts).
   * La diferencia con inventar es quien decide: acá decide ella, tildando.
   */
  detalles?: string[];
};

/**
 * El contexto viene flojo a proposito: la persona esta a mitad de cargar y no
 * tiene por que tener todo completo. Los minimos que importan se chequean
 * despues, segun el campo, para poder devolver un mensaje que se entienda.
 */
const esquema = z.object({
  campo: z.enum(CAMPOS),
  titulo: z.string().trim().max(LARGOS.titulo).nullish(),
  categoria: z.string().trim().max(60).nullish(),
  barrio: z.string().trim().max(LARGOS.barrio).nullish(),
  distrito: z.number().int().min(1).max(20).nullish(),
  problema: z.string().trim().max(LARGOS.problema).nullish(),
  solucion: z.string().trim().max(LARGOS.solucion).nullish(),
  beneficios: z.string().trim().max(LARGOS.beneficios).nullish(),
  /**
   * Los aspectos tecnicos que la persona tildo de la lista que se le ofrecio.
   * Se topea en 8: es una lista para elegir, no un canal para meter texto
   * arbitrario en el prompt.
   */
  agregar: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
});

const PROP_TEXTO = {
  texto: {
    type: "string",
    description: "El texto del campo, listo para pegar. Sin titulo ni vinetas.",
  },
} as const;

const ESQUEMA_SALIDA = {
  type: "object",
  properties: PROP_TEXTO,
  required: ["texto"],
  additionalProperties: false,
} as const;

/** Solo para `solucion`: el texto mas la lista de aspectos para ofrecer. */
const ESQUEMA_SALIDA_SOLUCION = {
  type: "object",
  properties: {
    ...PROP_TEXTO,
    detalles: {
      type: "array",
      description:
        "Entre 0 y 6 aspectos tecnicos que la persona NO menciono, como frases cortas. Van aparte del texto.",
      items: { type: "string" },
    },
  },
  required: ["texto", "detalles"],
  additionalProperties: false,
} as const;

const salidaModelo = z.object({
  texto: z.string().min(1).max(5000),
  detalles: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
});

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const inicio = Date.now();
  const ipHash = hashearIp(ipDe(request));

  const cuerpo: unknown = await request.json().catch(() => null);
  const validacion = esquema.safeParse(cuerpo);
  if (!validacion.success) {
    return Response.json({ error: "No se entendió el pedido." }, { status: 400 });
  }
  const entrada = validacion.data;
  const campo = entrada.campo;

  const propio = (entrada[campo] ?? "").trim();
  const problema = (entrada.problema ?? "").trim();
  const solucion = (entrada.solucion ?? "").trim();

  // -------------------------------------------------------------------------
  // La regla: sin texto de la persona, no hay ayuda
  // -------------------------------------------------------------------------
  if (campo !== "beneficios" && propio.length < MINIMO_PARA_FORMALIZAR) {
    return Response.json(
      {
        error:
          campo === "problema"
            ? "Escribí primero con tus palabras cuál es el problema, aunque sea corto y con errores. La IA ordena lo que escribís, no lo escribe por vos."
            : "Escribí primero con tus palabras qué obra propones, aunque sea corto y con errores. La IA ordena lo que escribís, no lo escribe por vos.",
      },
      { status: 422 },
    );
  }

  if (
    campo === "beneficios" &&
    (problema.length < MINIMO_DE_CONTEXTO || solucion.length < MINIMO_DE_CONTEXTO)
  ) {
    return Response.json(
      {
        error:
          "Para escribir los beneficios necesito leer antes el problema y la solución: los beneficios salen de ahí, no de la nada.",
      },
      { status: 422 },
    );
  }

  if (!hayClave()) {
    return Response.json(
      { error: "La ayuda para redactar no está disponible en este momento." },
      { status: 503 },
    );
  }

  const limite = await consumir(`redactar:${ipHash}`, TOPE_POR_HORA, 3600);
  if (!limite.permitido) {
    return Response.json(
      {
        error: `Ya pediste ${TOPE_POR_HORA} ayudas en la última hora. Podés seguir escribiendo tu idea a mano y enviarla igual.`,
      },
      { status: 429 },
    );
  }

  const categorias = await getCategorias();
  const nombreCategoria =
    categorias.find((c) => c.slug === entrada.categoria)?.nombre ?? "sin elegir";

  const modelo = modeloPara("asistente");
  let consumo: Consumo = CONSUMO_VACIO;

  const sistema =
    campo === "beneficios" ? SISTEMA_BENEFICIOS : sistemaFormalizar(campo);

  // Los aspectos tecnicos solo tienen sentido en `solucion`: son detalles de la
  // obra que se propone, no del problema ni de los beneficios.
  const ofreceDetalles = campo === "solucion";
  const elegidos = ofreceDetalles ? (entrada.agregar ?? []) : [];

  try {
    const cliente = crearCliente();
    const respuesta = await cliente.chat.completions.create({
      model: modelo,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: sistema },
        {
          role: "user",
          content: mensaje(campo, entrada, nombreCategoria, elegidos),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "texto_del_campo",
          strict: true,
          schema: ofreceDetalles ? ESQUEMA_SALIDA_SOLUCION : ESQUEMA_SALIDA,
        },
      },
    });

    consumo = sumarConsumo(consumo, respuesta.usage);
    const crudo = respuesta.choices[0]?.message?.content ?? "";
    const salida = salidaModelo.parse(JSON.parse(crudo));
    const texto = salida.texto.trim();

    // El modelo podria devolver algo mas largo que el campo. Se corta acá: el
    // formulario tiene maxLength y un texto recortado a mitad de palabra en el
    // navegador se ve como un error nuestro.
    const tope = LARGOS[campo];
    const final = texto.length > tope ? `${texto.slice(0, tope - 1).trimEnd()}…` : texto;

    await registrar({
      pregunta: `[redactar:${campo}] ${propio.slice(0, 200)}`,
      respuesta: final,
      modelo,
      consumo,
      ms: Date.now() - inicio,
      ipHash,
      ok: true,
    });

    // Se filtran los que la persona ya eligio: volver a ofrecerlos despues de
    // haberlos agregado deja casillas que no hacen nada.
    const detalles = (salida.detalles ?? [])
      .map((d) => d.trim())
      .filter((d) => d && !elegidos.some((e) => e.toLowerCase() === d.toLowerCase()));

    return Response.json({
      campo,
      modo: campo === "beneficios" && !propio ? "redactado" : "formalizado",
      texto: final,
      ...(ofreceDetalles ? { detalles } : {}),
    } satisfies RespuestaRedactar);
  } catch (causa) {
    console.error("[redactar]", causa);
    await registrar({
      pregunta: `[redactar:${campo}] ${propio.slice(0, 200)}`,
      respuesta: null,
      modelo,
      consumo,
      ms: Date.now() - inicio,
      ipHash,
      ok: false,
    });

    return Response.json(
      {
        error: mensajeDeError(
          causa,
          "No se pudo generar el texto. Podés seguir escribiendo a mano y enviar tu idea igual.",
        ),
      },
      { status: 502 },
    );
  }
}

// ---------------------------------------------------------------------------

/**
 * El pedido concreto. Los campos van delimitados con etiquetas para que se lean
 * como datos y no como instrucciones, aunque el vecino escriba cualquier cosa.
 *
 * Para `problema` y `solucion` el contexto va corto: el modelo tiene que
 * trabajar sobre el texto del campo, y darle todo lo demas lo tienta a mezclar
 * informacion de otros campos ahi adentro.
 */
function mensaje(
  campo: Campo,
  entrada: z.infer<typeof esquema>,
  nombreCategoria: string,
  elegidos: string[],
): string {
  const ubicacion = [
    `<barrio>${entrada.barrio ?? "no indicado"}</barrio>`,
    `<distrito>${entrada.distrito ?? "no indicado"}</distrito>`,
    `<categoria>${nombreCategoria}</categoria>`,
  ];

  if (campo === "beneficios") {
    const yaEscrito = (entrada.beneficios ?? "").trim();
    return [
      yaEscrito
        ? "La persona empezó a escribir los beneficios. Partí de su texto y completalo."
        : "La persona dejó los beneficios vacíos. Deducilos del problema y la solución.",
      "",
      `<titulo>${entrada.titulo ?? "sin título"}</titulo>`,
      ...ubicacion,
      `<problema>${entrada.problema ?? ""}</problema>`,
      `<solucion>${entrada.solucion ?? ""}</solucion>`,
      `<beneficios_escritos_por_la_persona>${yaEscrito}</beneficios_escritos_por_la_persona>`,
    ].join("\n");
  }

  // Sin el titulo a propósito: el modelo lo tomaba como material y cerraba el
  // problema repitiendolo ("propongo el arreglo de la calle del barrio"). Para
  // formalizar un campo no aporta nada, y tienta a mezclar campos.
  const etiqueta = campo === "problema" ? "problema" : "solucion";
  const partes = [
    `Formalizá este texto que escribió la persona. Es su ${etiqueta}.`,
    "",
    ...ubicacion,
    `<${etiqueta}_escrito_por_la_persona>${entrada[campo] ?? ""}</${etiqueta}_escrito_por_la_persona>`,
  ];

  // La persona tildo aspectos de la lista que se le ofrecio. Van delimitados
  // igual que el resto: son datos que ELLA eligio, no instrucciones.
  if (elegidos.length) {
    partes.push(
      "",
      "La persona eligió agregar estos aspectos a su propuesta. Incorporalos al texto:",
      ...elegidos.map((d) => `<aspecto_elegido>${d}</aspecto_elegido>`),
    );
  }

  return partes.join("\n");
}

async function registrar(datos: {
  pregunta: string;
  respuesta: string | null;
  modelo: string;
  consumo: Consumo;
  ms: number;
  ipHash: string;
  ok: boolean;
}) {
  try {
    await db.insert(chatConsultas).values({
      origen: "asistente",
      pregunta: datos.pregunta,
      respuesta: datos.respuesta,
      herramientas: [],
      modelo: datos.modelo,
      tokensEntrada: datos.consumo.tokensEntrada,
      tokensSalida: datos.consumo.tokensSalida,
      cacheLectura: datos.consumo.cacheLectura,
      ms: datos.ms,
      ipHash: datos.ipHash,
      ok: datos.ok,
    });
  } catch (causa) {
    console.error("[redactar] no se pudo registrar el pedido", causa);
  }
}
