/**
 * Lo que Migue (el chat) sabe del sitio, fuera de los datos de cada idea: lo
 * mismo que muestran las paginas, leido de las mismas fuentes.
 *
 * - En que momento esta el proceso y que se puede hacer hoy: lo decide
 *   `portadaSegunEtapa`, igual que la portada.
 * - Las fechas de la edicion, el cronograma, las novedades, las preguntas
 *   frecuentes, el aviso urgente, el reglamento y los textos de "Cómo
 *   funciona": lo que el equipo carga en el panel.
 * - Las reglas confirmadas, los pasos para votar y por que no hay montos: el
 *   texto fijo de src/lib/contenido-del-programa.ts, el mismo que dibujan
 *   /reglamento y /acerca-de.
 *
 * El chat no tiene ninguna otra fuente, ni texto propio sobre el programa: si
 * algo no esta cargado aca, no lo sabe, y lo dice. Por eso todos los textos que
 * lee estan en este archivo, con su clave literal (asi los encuentra el
 * catalogo del panel, src/app/admin/contenido/catalogo.ts, y el equipo sabe que
 * cambiar uno cambia tambien lo que contesta Migue).
 *
 * Lo usan las instrucciones del modelo (src/app/api/chat/route.ts), la
 * herramienta `consultar_reglamento` y el buscador sin IA (chat-sin-ia.ts).
 */
import { parrafosDelReglamento } from "@/app/reglamento/cuerpo";
import { getFaq, getHitos, getNovedades, getTextos, type Edicion } from "@/db/queries";
import {
  PASOS_PARA_VOTAR,
  POR_QUE_NO_HAY_MONTOS,
  REGLAS_CONFIRMADAS,
  buscarEnParrafos,
  type Explicacion,
} from "./contenido-del-programa";
import { formatearFecha, formatearRango, hoyEnTucuman } from "./formato";
import { portadaSegunEtapa, type AccionPortada } from "./portada";

/** Cuantas novedades lee el chat: las ultimas, como la portada. */
const NOVEDADES = 5;

export type ReglamentoDelSitio =
  | { publicado: true; parrafos: string[] }
  | {
      publicado: false;
      /** Lo que muestra /reglamento en su lugar (clave `reglamento-aviso`). */
      aviso: string;
      reglasConfirmadas: Explicacion[];
    };

export type ContextoDelSitio = {
  /** La oracion del hero de la portada: que esta pasando y hasta cuando. */
  momento: string;
  /** Los dos botones de la portada: lo que se puede hacer hoy. */
  acciones: AccionPortada[];
  /** "1 de octubre de 2026 — 15 de noviembre de 2026", o null sin fechas. */
  fechasIdeas: string | null;
  fechasVotacion: string | null;
  /** El aviso urgente publicado en todo el sitio, si hay uno. */
  aviso: string | null;
  /** Los tres bloques de "Cómo funciona" de la portada. */
  comoFunciona: Explicacion[];
  /** La bajada de /ideas/nueva: como se presenta una idea. */
  comoPresentar: string | null;
  /** La bajada de /votar. */
  comoVotar: string | null;
  pasosParaVotar: Explicacion[];
  porQueNoHayMontos: string;
  reglamento: ReglamentoDelSitio;
  cronograma: Array<{ titulo: string; fechas: string; detalle: string | null }>;
  novedades: Array<{ fecha: string; titulo: string; copete: string | null }>;
  preguntas: Array<{ pregunta: string; respuesta: string }>;
  contacto: { organismo: string; direccion: string | null; telefono: string | null };
};

/** Un texto cargado, o null si esta vacio o no esta. */
function cargado(valor: string | undefined): string | null {
  const limpio = valor?.trim();
  return limpio ? limpio : null;
}

function reglamentoDe(textos: Record<string, string>): ReglamentoDelSitio {
  const parrafos = parrafosDelReglamento(textos["reglamento-cuerpo"]);
  if (parrafos.length) return { publicado: true, parrafos };
  return {
    publicado: false,
    aviso:
      cargado(textos["reglamento-aviso"]) ??
      "El reglamento general todavía no está publicado en este sitio.",
    reglasConfirmadas: REGLAS_CONFIRMADAS,
  };
}

export async function contextoDelSitio(edicion: Edicion): Promise<ContextoDelSitio> {
  const [textos, faq, hitos, novedades] = await Promise.all([
    getTextos(),
    getFaq(),
    getHitos(edicion.id),
    getNovedades(NOVEDADES),
  ]);
  const portada = portadaSegunEtapa(edicion, hoyEnTucuman());

  const bloques: Array<[string | undefined, string | undefined]> = [
    [textos["home-bloque1-titulo"], textos["home-bloque1-texto"]],
    [textos["home-bloque2-titulo"], textos["home-bloque2-texto"]],
    [textos["home-bloque3-titulo"], textos["home-bloque3-texto"]],
  ];

  return {
    momento: portada.momento,
    acciones: [portada.principal, portada.secundaria],
    fechasIdeas: formatearRango(edicion.ideasDesde, edicion.ideasHasta) || null,
    fechasVotacion: formatearRango(edicion.votacionDesde, edicion.votacionHasta) || null,
    aviso: cargado(textos["aviso-urgente"]),
    comoFunciona: bloques
      .map(([titulo, texto]) => ({ titulo: cargado(titulo) ?? "", texto: cargado(texto) ?? "" }))
      .filter((bloque) => bloque.texto),
    comoPresentar: cargado(textos["ideas-nueva-subtitulo"]),
    comoVotar: cargado(textos["votacion-subtitulo"]),
    pasosParaVotar: PASOS_PARA_VOTAR,
    porQueNoHayMontos: POR_QUE_NO_HAY_MONTOS,
    reglamento: reglamentoDe(textos),
    cronograma: hitos.map((h) => ({
      titulo: h.titulo,
      fechas: formatearRango(h.desde, h.hasta) || "sin fecha",
      detalle: h.detalle,
    })),
    novedades: novedades.map((n) => ({
      fecha: formatearFecha(n.fecha),
      titulo: n.titulo,
      copete: n.copete,
    })),
    preguntas: faq.map((f) => ({ pregunta: f.pregunta, respuesta: f.respuesta })),
    contacto: {
      organismo:
        cargado(textos["contacto-organismo"]) ?? "Municipalidad de San Miguel de Tucumán",
      direccion: cargado(textos["contacto-direccion"]),
      telefono: cargado(textos["contacto-telefono"]),
    },
  };
}

// ---------------------------------------------------------------------------
// El reglamento, para la herramienta y el buscador
// ---------------------------------------------------------------------------

/** Hasta este largo el reglamento se devuelve entero: sale mas barato que errarle. */
const REGLAMENTO_ENTERO = 6000;

export type RespuestaDelReglamento =
  | { publicado: false; aviso: string; reglasConfirmadas: Explicacion[] }
  | {
      publicado: true;
      totalParrafos: number;
      /** Todo el reglamento (si es corto) o los parrafos que coinciden. */
      parrafos: Array<{ numero: number; texto: string }>;
      entero: boolean;
    };

export async function consultarReglamento(consulta: string): Promise<RespuestaDelReglamento> {
  const reglamento = reglamentoDe(await getTextos());
  if (!reglamento.publicado) return reglamento;

  const { parrafos } = reglamento;
  const largo = parrafos.reduce((total, p) => total + p.length, 0);
  if (largo <= REGLAMENTO_ENTERO) {
    return {
      publicado: true,
      totalParrafos: parrafos.length,
      parrafos: parrafos.map((texto, i) => ({ numero: i + 1, texto })),
      entero: true,
    };
  }
  return {
    publicado: true,
    totalParrafos: parrafos.length,
    parrafos: buscarEnParrafos(parrafos, consulta, 8),
    entero: false,
  };
}

// ---------------------------------------------------------------------------
// Para las instrucciones del modelo
// ---------------------------------------------------------------------------

function lista(items: Explicacion[]): string {
  return items.map((item) => `- ${item.titulo}: ${item.texto}`).join("\n");
}

/**
 * La parte de las instrucciones que describe el sitio. Va entera en cada
 * consulta (unas pocas decenas de renglones); el reglamento no, porque puede
 * tener cincuenta paginas: para eso esta `consultar_reglamento`.
 */
export function contextoParaElModelo(contexto: ContextoDelSitio): string {
  const secciones: string[] = [];

  secciones.push(
    [
      `Lo que dice hoy la portada: "${contexto.momento}"`,
      `Lo que se puede hacer hoy en el sitio: ${contexto.acciones
        .map((a) => `${a.texto} (${a.href})`)
        .join("; ")}.`,
      `Fechas de la edición: presentación de ideas ${contexto.fechasIdeas ?? "sin fechas cargadas"}; votación ${contexto.fechasVotacion ?? "sin fechas cargadas"}.`,
      contexto.aviso
        ? `Aviso urgente publicado arriba de todo el sitio: "${contexto.aviso}". Si la consulta tiene que ver, decilo primero.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  secciones.push(
    [
      "# Cómo funciona el programa (lo que explica el sitio)",
      "",
      lista(contexto.comoFunciona),
      "",
      `Presentar una idea: ${contexto.comoPresentar ?? "el sitio no tiene cargada una explicación."} Se presenta en /ideas/nueva, solo mientras está abierta la etapa de presentación de ideas. Quien ya presentó una la sigue en /ideas/seguimiento, con el número de la idea y el código de seguimiento que recibió al presentarla.`,
      "",
      "Cómo se vota (los pasos que publica /acerca-de):",
      ...contexto.pasosParaVotar.map((paso, i) => `${i + 1}. ${paso.titulo}: ${paso.texto}`),
      contexto.comoVotar ? `En /votar el sitio dice: "${contexto.comoVotar}"` : "",
    ]
      .filter((renglon) => renglon !== "")
      .join("\n"),
  );

  secciones.push(
    contexto.reglamento.publicado
      ? [
          "# Reglamento",
          "",
          "El reglamento oficial está publicado en /reglamento. Ante cualquier pregunta sobre reglas (quién puede votar o presentar, requisitos, plazos, desempates, reclamos), usá consultar_reglamento antes de contestar y respondé con lo que dice. Si no lo dice, decí que el reglamento no lo menciona.",
        ].join("\n")
      : [
          "# Reglamento",
          "",
          `El reglamento oficial todavía no está publicado. En /reglamento el sitio dice: "${contexto.reglamento.aviso}". Mientras tanto publica estas reglas confirmadas:`,
          lista(contexto.reglamento.reglasConfirmadas),
          "",
          "Si preguntan por una regla que no está en esta lista (por ejemplo la edad para votar, los requisitos de residencia, los desempates o los reclamos), decí que el reglamento oficial todavía no se publicó y que el sitio no la tiene definida. No la deduzcas.",
        ].join("\n"),
  );

  secciones.push(`# Montos de los proyectos\n\n${contexto.porQueNoHayMontos}`);

  secciones.push(
    [
      "# Cronograma de la edición",
      "",
      contexto.cronograma.length
        ? contexto.cronograma
            .map((h) => `- ${h.titulo}: ${h.fechas}.${h.detalle ? ` ${h.detalle}` : ""}`)
            .join("\n")
        : "No hay cronograma cargado para esta edición.",
    ].join("\n"),
  );

  secciones.push(
    [
      "# Novedades publicadas (las últimas, de la más nueva a la más vieja)",
      "",
      contexto.novedades.length
        ? contexto.novedades
            .map((n) => `- ${n.fecha}: ${n.titulo}${n.copete ? `. ${n.copete}` : ""}`)
            .join("\n")
        : "No hay novedades publicadas. Si preguntan por reuniones o asambleas, decí que no hay ninguna anunciada en el sitio.",
    ].join("\n"),
  );

  secciones.push(
    [
      "# Preguntas frecuentes del sitio (/acerca-de)",
      "",
      contexto.preguntas.length
        ? contexto.preguntas.map((f) => `P: ${f.pregunta}\nR: ${f.respuesta}`).join("\n\n")
        : "No hay preguntas frecuentes cargadas.",
    ].join("\n"),
  );

  secciones.push(
    [
      "# Contacto del programa",
      "",
      [contexto.contacto.organismo, contexto.contacto.direccion, contexto.contacto.telefono]
        .filter(Boolean)
        .join(" · "),
    ].join("\n"),
  );

  return secciones.join("\n\n");
}
