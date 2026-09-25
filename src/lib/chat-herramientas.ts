/**
 * Herramientas del chatbot.
 *
 * El asistente no tiene ningun conocimiento propio sobre el programa: todo lo
 * que responde sale de estas funciones, que consultan la misma base que el
 * resto del sitio. Si un dato no esta cargado, la herramienta devuelve
 * explicitamente que no esta, para que la respuesta lo diga en lugar de
 * completarlo.
 *
 * Todas trabajan sobre la edicion vigente salvo que el modelo pase `edicion`
 * con un año. Con la 2026 recien abierta, la vigente no tiene ganadores ni
 * obras, y lo que la gente quiere seguir son las de 2025: cuando en la vigente
 * no hay nada, las herramientas lo dicen y traen lo de otra edicion, marcado
 * como de esa edicion. Nunca lo completa el modelo: son datos que devuelve la
 * base.
 */
import type OpenAI from "openai";
import { z } from "zod";
import {
  buscarBarriosEnIdeas,
  getArchivoDeEdiciones,
  getAvances,
  getDistrito,
  getDistritos,
  getEdicionParaVer,
  getEstadisticas,
  getIdea,
  getUltimaEdicionTerminadaConGanadores,
  listarIdeas,
  type Edicion,
  type EstadoIdea,
  type FiltroIdeas,
  type GanadorEnObra,
  type IdeaVista,
} from "@/db/queries";
import { ideasDelBarrio, ubicarBarrio } from "./barrios";
import { conEdicion, votacionTerminada } from "./ediciones";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_ETAPA,
  ETIQUETA_PRESUPUESTO,
  formatearPesos,
} from "./formato";
import { normalizarBarrio } from "./texto";

const ESTADOS = [
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
] as const;

const CATEGORIAS = [
  "socio-ambiental",
  "cultural-deportivo",
  "innovacion-urbana",
] as const;

// ---------------------------------------------------------------------------
// Esquemas de entrada
// ---------------------------------------------------------------------------

/**
 * El año de la edicion, opcional en todas las herramientas. Cualquier año de
 * cuatro cifras, como en `?edicion=` de las paginas: que la edicion exista lo
 * dice la base, y asi el modelo recibe "no hay una edicion 1999, las que hay
 * son..." en lugar de un error de validacion que no sabe explicar.
 */
const edicionOpcional = z.number().int().min(1000).max(9999).optional();

const esquemaBuscar = z.object({
  distrito: z.number().int().min(1).max(20).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  estado: z.enum(ESTADOS).optional(),
  texto: z.string().max(120).optional(),
  solo_ganadores: z.boolean().optional(),
  limite: z.number().int().min(1).max(25).optional(),
  edicion: edicionOpcional,
});

const esquemaDetalle = z.object({ slug: z.string().min(1).max(200), edicion: edicionOpcional });
const esquemaDistrito = z.object({
  numero: z.number().int().min(1).max(20),
  edicion: edicionOpcional,
});
const esquemaUbicar = z.object({ barrio: z.string().min(2).max(120), edicion: edicionOpcional });
const esquemaEstadisticas = z.object({ edicion: edicionOpcional });

// ---------------------------------------------------------------------------
// Definiciones que ve el modelo
// ---------------------------------------------------------------------------

/** El parametro `edicion`, igual en las cinco herramientas. */
const PROPIEDAD_EDICION = {
  type: "integer",
  minimum: 1000,
  maximum: 9999,
  description:
    "Año de la edicion a consultar, por ejemplo 2025. Sin este parametro, la edicion vigente.",
} as const;

/**
 * Formato de OpenRouter (compatible con OpenAI): `type: "function"` con el
 * esquema en `parameters`.
 *
 * No se usa `strict: true` a proposito. En el modo estricto de OpenAI toda
 * propiedad declarada tiene que estar tambien en `required`, y `buscar_proyectos`
 * tiene todos sus parametros opcionales: declararlos obligatorios obligaria al
 * modelo a inventar filtros que la persona no pidio. Ademas OpenRouter enruta a
 * proveedores distintos y no todos garantizan el modo estricto. La validacion
 * real esta abajo, en `ejecutarHerramienta`, donde cada entrada pasa por su
 * esquema de zod antes de tocar la base.
 */
export const HERRAMIENTAS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_proyectos",
      description:
        "Busca ideas y proyectos del Presupuesto Participativo. Devuelve titulo, distrito, barrio, categoria, estado y votos de cada uno. Usar siempre que la persona pregunte que se presento, que gano, que obras hay, o pida una lista. Si en la edicion vigente no hay nada (por ejemplo ganadores de una edicion que todavia no voto), devuelve lo de otra edicion y dice de cual.",
      parameters: {
        type: "object",
        properties: {
          distrito: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            description: "Numero de distrito, del 1 al 20.",
          },
          categoria: {
            type: "string",
            enum: [...CATEGORIAS],
            description:
              "socio-ambiental (plazas y espacios verdes), cultural-deportivo (playones, clubes, centros culturales) o innovacion-urbana (SUM, corredores, veredas).",
          },
          estado: {
            type: "string",
            enum: [...ESTADOS],
            description: "Estado de la idea tras la evaluacion tecnica.",
          },
          texto: {
            type: "string",
            description:
              "Palabras a buscar en el titulo, el barrio o el texto del proyecto. Por ejemplo un nombre de plaza o de club.",
          },
          solo_ganadores: {
            type: "boolean",
            description: "Si es true, devuelve unicamente los proyectos ganadores.",
          },
          limite: { type: "integer", minimum: 1, maximum: 25 },
          edicion: PROPIEDAD_EDICION,
        },
        additionalProperties: false,
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detalle_proyecto",
      description:
        "Devuelve el contenido completo de un proyecto: problema, solucion, beneficios, votos, presupuesto y, si el municipio informo alguno, los avances de la obra. Requiere el slug que devuelve buscar_proyectos; si buscar_proyectos lo trajo de otra edicion, pasar tambien esa edicion.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Identificador del proyecto, tal como lo devuelve buscar_proyectos.",
          },
          edicion: PROPIEDAD_EDICION,
        },
        additionalProperties: false,
        required: ["slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumen_distrito",
      description:
        "Resumen de un distrito en una edicion: cuantas ideas se presentaron, cual gano con cuantos votos y que barrios abarca. Si la edicion todavia no voto, trae tambien el ganador del distrito en la ultima edicion que si voto.",
      parameters: {
        type: "object",
        properties: {
          numero: { type: "integer", minimum: 1, maximum: 20 },
          edicion: PROPIEDAD_EDICION,
        },
        additionalProperties: false,
        required: ["numero"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ubicar_barrio",
      description:
        "Dice en que distrito queda un barrio, segun la capa oficial de barrios del municipio, y cuantas ideas hay en ese barrio y en su distrito en la edicion. Usar cuando la persona nombra su barrio en lugar de un numero de distrito.",
      parameters: {
        type: "object",
        properties: {
          barrio: {
            type: "string",
            description: "Nombre del barrio, tal como lo dijo la persona.",
          },
          edicion: PROPIEDAD_EDICION,
        },
        additionalProperties: false,
        required: ["barrio"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estadisticas",
      description:
        "Totales de una edicion: ideas presentadas, ganadores, votos, y el reparto por categoria y por estado de evaluacion. Si la edicion todavia no voto, trae tambien los ganadores de la ultima edicion que si voto.",
      parameters: {
        type: "object",
        properties: { edicion: PROPIEDAD_EDICION },
        additionalProperties: false,
        required: [],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Ejecucion
// ---------------------------------------------------------------------------

function resumirIdea(idea: IdeaVista, anioEnEnlaces: number | null) {
  return {
    slug: idea.slug,
    // El slug se repite entre ediciones: para abrir este proyecto con
    // detalle_proyecto hay que pasarle tambien su edicion.
    edicion: idea.anio,
    titulo: idea.titulo,
    distrito: idea.distrito,
    barrio: idea.barrio ?? "no cargado",
    categoria: idea.categoriaNombre ?? "sin categoria",
    estado: ETIQUETA_ESTADO[idea.estado] ?? idea.estado,
    votos: idea.votos,
    ganador: idea.ganador,
    url: conEdicion(`/proyectos/${idea.slug}`, anioEnEnlaces),
  };
}

/**
 * La etapa de una obra como la puede decir el chat: la informada por el
 * municipio, o que no hay informacion. Mismo criterio que `detalle_proyecto` y
 * la ficha: `estadoObra` viene null cuando no hay avances publicados.
 */
function etapaDeObra(ganador: GanadorEnObra): string {
  return ganador.estadoObra
    ? (ETIQUETA_PRESUPUESTO[ganador.estadoObra] ?? ganador.estadoObra)
    : "no informada todavia: el municipio no publico ningun avance de esta obra";
}

function etiquetaEtapa(edicion: Edicion): string {
  return ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa;
}

export type ResultadoHerramienta = {
  contenido: string;
  /** Enlaces que la interfaz muestra como tarjetas debajo de la respuesta. */
  referencias: Array<{ titulo: string; url: string }>;
  /**
   * true cuando la herramienta contesto que NO hay datos para eso: la busqueda
   * volvio vacia, el slug no existe, el barrio no figura. Es lo mismo que dice
   * el `aviso` del contenido, pero como bandera, para que quien llama no tenga
   * que leer el texto.
   *
   * La usa el clasificador (src/lib/chat-temas.ts) para decidir si la consulta
   * quedo resuelta: si TODAS las herramientas de una consulta vuelven con esto
   * en true, al vecino le falto informacion, y eso es contenido que le falta al
   * sitio. Es la senal que alimenta la pantalla de /admin/migue.
   *
   * Cuando la herramienta no encontro nada en la edicion pedida pero trajo lo de
   * otra, NO va en true: la persona se fue con datos, marcados como de otra
   * edicion.
   */
  sinDatos?: boolean;
};

/** La edicion sobre la que trabaja una llamada, y como se arman sus enlaces. */
type EdicionDeLaLlamada = {
  ok: true;
  edicion: Edicion;
  esVigente: boolean;
  /** `?edicion=` en las url que devuelve la herramienta; null en la vigente. */
  anioEnEnlaces: number | null;
};

/**
 * La edicion que pidio el modelo, o la vigente si no pidio ninguna. Un año sin
 * edicion vuelve como resultado de la herramienta, con los años que si hay:
 * asi el modelo puede corregirse o decirlo, en lugar de contestar con la
 * vigente como si fuera la pedida.
 */
async function edicionDeLaLlamada(
  anio: number | undefined,
  vigente: Edicion,
): Promise<EdicionDeLaLlamada | { ok: false; resultado: ResultadoHerramienta }> {
  if (anio === undefined || anio === vigente.anio) {
    return { ok: true, edicion: vigente, esVigente: true, anioEnEnlaces: null };
  }
  const edicion = await getEdicionParaVer(anio);
  if (edicion) {
    return {
      ok: true,
      edicion,
      esVigente: edicion.activa,
      anioEnEnlaces: edicion.activa ? null : edicion.anio,
    };
  }

  const conDatos = (await getArchivoDeEdiciones())
    .filter((e) => e.activa || e.ideas > 0)
    .map((e) => e.anio);
  return {
    ok: false,
    resultado: {
      contenido: JSON.stringify({
        encontrado: false,
        aviso:
          `No hay una edicion ${anio} cargada en el sitio. ` +
          (conDatos.length
            ? `Las ediciones con datos son: ${conDatos.join(", ")}. `
            : "") +
          "No inventar datos de esa edicion.",
      }),
      referencias: [{ titulo: "Archivo de ediciones", url: "/archivo" }],
      sinDatos: true,
    },
  };
}

export async function ejecutarHerramienta(
  nombre: string,
  entrada: unknown,
  edicionVigente: Edicion,
): Promise<ResultadoHerramienta> {
  switch (nombre) {
    case "buscar_proyectos": {
      const args = esquemaBuscar.parse(entrada);
      const llamada = await edicionDeLaLlamada(args.edicion, edicionVigente);
      if (!llamada.ok) return llamada.resultado;
      const { edicion, esVigente, anioEnEnlaces } = llamada;

      const filtro: Omit<FiltroIdeas, "edicionId"> = {
        distrito: args.distrito,
        categoria: args.categoria,
        estado: args.estado as EstadoIdea | undefined,
        texto: args.texto,
        soloGanadores: args.solo_ganadores,
        limite: args.limite ?? 12,
      };
      const lista = await listarIdeas({ edicionId: edicion.id, ...filtro });
      if (lista.length) {
        return {
          contenido: JSON.stringify({
            edicion: edicion.anio,
            encontrados: lista.length,
            proyectos: lista.map((idea) => resumirIdea(idea, anioEnEnlaces)),
          }),
          referencias: lista.slice(0, 4).map((idea) => ({
            titulo: idea.titulo,
            url: conEdicion(`/proyectos/${idea.slug}`, anioEnEnlaces),
          })),
        };
      }

      const pideGanadores = Boolean(args.solo_ganadores) || args.estado === "ganador";
      const motivo =
        pideGanadores && !votacionTerminada(edicion.etapa)
          ? `La edicion ${edicion.anio} todavia no tiene proyectos ganadores: esta en la etapa "${etiquetaEtapa(edicion)}" y el ganador de cada distrito sale de la votacion.`
          : `No hay ideas que cumplan ese filtro en la edicion ${edicion.anio}.`;

      const otras = (await getArchivoDeEdiciones()).filter(
        (otra) => otra.id !== edicion.id && otra.ideas > 0,
      );

      // En la vigente no hubo nada: se prueba el mismo filtro en las otras
      // ediciones, de la mas nueva a la mas vieja, y se devuelve la primera que
      // tenga algo. Para ganadores es la ultima que ya voto, que es la que tiene
      // las obras en ejecucion. Con una edicion pedida a proposito no se
      // cambia de edicion: se dice que no hay y cuales hay.
      if (esVigente) {
        for (const otra of otras) {
          if (pideGanadores && otra.ganadores === 0) continue;
          const deOtra = await listarIdeas({ edicionId: otra.id, ...filtro });
          if (!deOtra.length) continue;
          const anioOtra = otra.activa ? null : otra.anio;
          return {
            contenido: JSON.stringify({
              edicion: edicion.anio,
              encontrados: 0,
              aviso: `${motivo} Los resultados de abajo son de la edicion ${otra.anio}: al responder, decir que son de la edicion ${otra.anio} y no de la ${edicion.anio}.`,
              resultados_de_otra_edicion: {
                edicion: otra.anio,
                etapa: ETIQUETA_ETAPA[otra.etapa] ?? otra.etapa,
                encontrados: deOtra.length,
                proyectos: deOtra.map((idea) => resumirIdea(idea, anioOtra)),
              },
            }),
            referencias: deOtra.slice(0, 4).map((idea) => ({
              titulo: idea.titulo,
              url: conEdicion(`/proyectos/${idea.slug}`, anioOtra),
            })),
          };
        }
      }

      return {
        contenido: JSON.stringify({
          edicion: edicion.anio,
          encontrados: 0,
          aviso:
            `${motivo} No inventar resultados: decir que no se encontro nada y ofrecer ampliar la busqueda.` +
            (otras.length
              ? ` Hay datos de otras ediciones (${otras.map((o) => o.anio).join(", ")}): se puede repetir la busqueda con el parametro edicion.`
              : ""),
        }),
        referencias: [],
        sinDatos: true,
      };
    }

    case "detalle_proyecto": {
      const { slug, edicion: anio } = esquemaDetalle.parse(entrada);
      let edicionId: number | null = null;
      if (anio !== undefined) {
        const llamada = await edicionDeLaLlamada(anio, edicionVigente);
        if (!llamada.ok) return llamada.resultado;
        edicionId = llamada.edicion.id;
      }
      // Sin edicion, la misma regla que la ficha: la vigente y, si el slug no
      // esta ahi, la edicion mas reciente que lo tenga.
      const idea = await getIdea(slug, edicionId);
      if (!idea) {
        return {
          contenido: JSON.stringify({
            encontrado: false,
            aviso:
              `No existe un proyecto con ese identificador${anio ? ` en la edicion ${anio}` : ""}. ` +
              "Usar buscar_proyectos primero.",
          }),
          referencias: [],
          sinDatos: true,
        };
      }
      const esVigente = idea.anio === edicionVigente.anio;
      const anioEnEnlaces = esVigente ? null : idea.anio;
      const avances = idea.ganador ? await getAvances(idea.id) : [];
      return {
        contenido: JSON.stringify({
          ...resumirIdea(idea, anioEnEnlaces),
          anio: idea.anio,
          es_de_la_edicion_vigente: esVigente,
          problema: idea.problema ?? "no cargado en el sistema",
          solucion: idea.solucion ?? "no cargado en el sistema",
          beneficios: idea.beneficios ?? "no cargado en el sistema",
          devolucion_tecnica: idea.motivoEstado ?? "no cargada",
          ubicacion:
            idea.lat === null
              ? "sin ubicacion"
              : idea.ubicacionAproximada
                ? `aproximada (centro del distrito ${idea.distrito}): la idea no tenia coordenada cargada`
                : `${idea.lat}, ${idea.lon}`,
          presupuesto_total:
            idea.presupuestoTotal === null
              ? "no publicado todavia"
              : formatearPesos(idea.presupuestoTotal),
          /*
             `etapa_obra` sale de los avances informados, no de
             `estadoPresupuesto`. Ese campo lo escribia el ETL por defecto
             ("preparacion" en todo ganador) y esta herramienta se lo daba al
             modelo como un dato del municipio, asi que el chat le decia al
             vecino que su obra estaba en preparacion sin que nadie lo hubiera
             informado. Se degrada igual que `presupuesto_total`, dos lineas
             arriba: si no hay avance, se dice que no hay. */
          etapa_obra: avances.length
            ? (ETIQUETA_PRESUPUESTO[idea.estadoPresupuesto] ?? idea.estadoPresupuesto)
            : "no informada todavia: el municipio no publico ningun avance de esta obra",
          avances: avances.length
            ? avances.map((a) => ({
                fecha: a.fecha,
                etapa: ETIQUETA_PRESUPUESTO[a.etapa] ?? a.etapa,
                titulo: a.titulo,
                descripcion: a.descripcion,
                monto: a.monto === null ? null : formatearPesos(Number(a.monto)),
              }))
            : "todavia no hay avances de obra publicados para este proyecto",
        }),
        referencias: [
          { titulo: idea.titulo, url: conEdicion(`/proyectos/${idea.slug}`, anioEnEnlaces) },
        ],
      };
    }

    case "resumen_distrito": {
      const { numero, edicion: anio } = esquemaDistrito.parse(entrada);
      const llamada = await edicionDeLaLlamada(anio, edicionVigente);
      if (!llamada.ok) return llamada.resultado;
      const { edicion, anioEnEnlaces } = llamada;

      const distrito = await getDistrito(numero, edicion.id);
      if (!distrito) {
        return {
          contenido: JSON.stringify({ encontrado: false }),
          referencias: [],
          sinDatos: true,
        };
      }
      const porEstado: Record<string, number> = {};
      for (const idea of distrito.ideas) {
        const clave = ETIQUETA_ESTADO[idea.estado] ?? idea.estado;
        porEstado[clave] = (porEstado[clave] ?? 0) + 1;
      }

      // Una edicion que todavia no voto no tiene ganador en ningun distrito.
      // Lo que hay para seguir es la obra de la ultima edicion que si voto.
      const yaVoto = votacionTerminada(edicion.etapa);
      const anterior =
        !distrito.ganador && !yaVoto ? await getUltimaEdicionTerminadaConGanadores() : null;
      const ganadorAnterior =
        anterior && anterior.id !== edicion.id
          ? anterior.ganadores.find((g) => g.distrito === numero)
          : undefined;
      const anioAnterior = anterior && !anterior.activa ? anterior.anio : null;
      const urlDistrito = conEdicion(`/distritos/${numero}`, anioEnEnlaces);

      return {
        contenido: JSON.stringify({
          distrito: numero,
          edicion: edicion.anio,
          etapa_de_la_edicion: etiquetaEtapa(edicion),
          barrios_de_referencia: distrito.referencia ?? "no cargados",
          ideas_presentadas: distrito.ideas.length,
          ideas_por_estado: porEstado,
          ganador: distrito.ganador
            ? {
                titulo: distrito.ganador.titulo,
                votos: distrito.ganador.votos,
                categoria: distrito.ganador.categoriaNombre,
                // Sin `etapa_obra`: era el default del ETL, no un dato. Si el
                // vecino pregunta por el avance, `detalle_proyecto` responde con
                // los avances informados o dice que no hay.
                url: conEdicion(`/proyectos/${distrito.ganador.slug}`, anioEnEnlaces),
              }
            : yaVoto
              ? `este distrito no tiene proyecto ganador en la edicion ${edicion.anio}`
              : `la edicion ${edicion.anio} todavia no tiene ganador: esta en la etapa "${etiquetaEtapa(edicion)}" y el ganador sale de la votacion`,
          ...(anterior && ganadorAnterior
            ? {
                ganador_en_la_ultima_edicion_que_voto: {
                  edicion: anterior.anio,
                  titulo: ganadorAnterior.titulo,
                  votos: ganadorAnterior.votos,
                  categoria: ganadorAnterior.categoriaNombre,
                  etapa_obra: etapaDeObra(ganadorAnterior),
                  url: conEdicion(`/proyectos/${ganadorAnterior.slug}`, anioAnterior),
                },
              }
            : {}),
          url: urlDistrito,
        }),
        referencias: [
          { titulo: `Distrito ${numero}`, url: urlDistrito },
          ...(distrito.ganador
            ? [
                {
                  titulo: distrito.ganador.titulo,
                  url: conEdicion(`/proyectos/${distrito.ganador.slug}`, anioEnEnlaces),
                },
              ]
            : []),
          ...(ganadorAnterior
            ? [
                {
                  titulo: ganadorAnterior.titulo,
                  url: conEdicion(`/proyectos/${ganadorAnterior.slug}`, anioAnterior),
                },
              ]
            : []),
        ],
      };
    }

    case "ubicar_barrio": {
      const { barrio, edicion: anio } = esquemaUbicar.parse(entrada);
      const llamada = await edicionDeLaLlamada(anio, edicionVigente);
      if (!llamada.ok) return llamada.resultado;
      const { edicion, anioEnEnlaces } = llamada;

      // Primero la capa oficial: en que distrito queda un barrio no depende de
      // que alguien haya presentado una idea ahi. Antes solo se miraban los
      // barrios escritos en las ideas de la edicion activa, y con una edicion
      // recien abierta cualquier barrio daba "no figura".
      const oficiales = ubicarBarrio(barrio);
      if (oficiales.length) {
        const ideas = await listarIdeas({ edicionId: edicion.id });
        const porDistrito = new Map<number, number>();
        for (const idea of ideas) {
          porDistrito.set(idea.distrito, (porDistrito.get(idea.distrito) ?? 0) + 1);
        }
        const repartidos = oficiales.some((b) => b.distritos.length > 1);

        return {
          contenido: JSON.stringify({
            busqueda: barrio,
            edicion: edicion.anio,
            fuente: "capa oficial de barrios del municipio",
            barrios: oficiales.map((b) => ({
              barrio: b.nombre,
              distrito: b.distritos[0].distrito,
              ...(b.distritos.length > 1
                ? {
                    repartido_entre_distritos: b.distritos.map((p) => ({
                      distrito: p.distrito,
                      porcentaje_aproximado_del_barrio: p.porcentaje,
                    })),
                  }
                : {}),
              ...(b.sectores > 1
                ? {
                    aviso_del_nombre:
                      "en la capa oficial este nombre tiene sectores separados: pueden ser barrios distintos que se llaman igual",
                  }
                : {}),
              ideas_en_el_barrio: ideasDelBarrio(b.feature, ideas).length,
              ideas_en_el_distrito: b.distritos.map((p) => ({
                distrito: p.distrito,
                ideas: porDistrito.get(p.distrito) ?? 0,
              })),
              url: conEdicion(`/distritos/${b.distritos[0].distrito}`, anioEnEnlaces),
            })),
            ...(repartidos
              ? {
                  aviso:
                    "Un barrio repartido entre distritos no tiene un solo distrito: el de cada vecino depende de su cuadra. No elegir uno: decir cuales son y sugerir el mapa de /distritos para ubicar la cuadra.",
                }
              : {}),
          }),
          referencias: [
            ...new Map(
              oficiales
                .flatMap((b) => b.distritos.map((p) => p.distrito))
                .map((numero) => [
                  numero,
                  { titulo: `Distrito ${numero}`, url: conEdicion(`/distritos/${numero}`, anioEnEnlaces) },
                ]),
            ).values(),
          ].slice(0, 3),
        };
      }

      // Respaldo: los barrios escritos en las ideas, para los nombres que la
      // capa no tiene ("Parque 9 de Julio", "Casino"). De todas las ediciones.
      const declarados = await buscarBarriosEnIdeas([normalizarBarrio(barrio) ?? barrio]);
      if (declarados.length) {
        return {
          contenido: JSON.stringify({
            busqueda: barrio,
            fuente:
              "barrio escrito por quienes presentaron ideas (no esta en la capa oficial de barrios): es orientativo",
            coincidencias: declarados.map((d) => ({
              barrio: d.barrio,
              distrito: d.distrito,
              ideas_que_lo_nombran: d.ideas,
              url: conEdicion(`/distritos/${d.distrito}`, anioEnEnlaces),
            })),
          }),
          referencias: [
            ...new Map(
              declarados.map((d) => [
                d.distrito,
                { titulo: `Distrito ${d.distrito}`, url: conEdicion(`/distritos/${d.distrito}`, anioEnEnlaces) },
              ]),
            ).values(),
          ].slice(0, 3),
        };
      }

      return {
        contenido: JSON.stringify({
          encontrado: false,
          aviso:
            "Ese barrio no figura en la capa oficial de barrios ni en las ideas cargadas. No adivinar el distrito: sugerir que la persona lo busque en el mapa de /distritos, donde puede tocar su ubicacion.",
        }),
        referencias: [{ titulo: "Mapa de distritos", url: "/distritos" }],
        sinDatos: true,
      };
    }

    case "estadisticas": {
      const { edicion: anio } = esquemaEstadisticas.parse(entrada ?? {});
      const llamada = await edicionDeLaLlamada(anio, edicionVigente);
      if (!llamada.ok) return llamada.resultado;
      const { edicion, anioEnEnlaces } = llamada;

      const stats = await getEstadisticas(edicion);
      const distritos = await getDistritos(edicion.id);
      const yaVoto = votacionTerminada(edicion.etapa);
      const anterior =
        stats.ganadores === 0 && !yaVoto ? await getUltimaEdicionTerminadaConGanadores() : null;
      const conAnterior = anterior && anterior.id !== edicion.id ? anterior : null;
      const anioAnterior = conAnterior && !conAnterior.activa ? conAnterior.anio : null;

      return {
        contenido: JSON.stringify({
          edicion: stats.anio,
          etapa_del_proceso: edicion.etapa,
          ideas_presentadas: stats.ideas,
          proyectos_ganadores: stats.ganadores,
          votos_totales: stats.votos,
          distritos: stats.distritos,
          // Antes de votar, los 20 distritos figuraban "sin ganador", y el
          // modelo lo contaba como un resultado.
          distritos_sin_ganador: yaVoto
            ? stats.distritosSinGanador
            : "la edicion todavia no voto: los ganadores salen de la votacion",
          por_estado: stats.porEstado,
          por_categoria: stats.porCategoria.map((c) => ({
            categoria: c.nombre,
            ideas: c.ideas,
            ganadores: c.ganadores,
          })),
          // Sin `obras_por_etapa`: era el mismo {preparacion: 19} que se saco de
          // la pagina de Transparencia, y lo ponia el ETL.
          presupuesto_publicado:
            stats.presupuestoPublicado > 0
              ? formatearPesos(stats.presupuestoPublicado)
              : "todavia no se publicaron montos de los proyectos ganadores",
          ranking_ganadores: distritos
            .filter((d) => d.ganador)
            .sort((a, b) => (b.ganador?.votos ?? 0) - (a.ganador?.votos ?? 0))
            .map((d) => ({
              distrito: d.numero,
              titulo: d.ganador!.titulo,
              votos: d.ganador!.votos,
            })),
          ...(conAnterior
            ? {
                ganadores_de_la_ultima_edicion_que_voto: {
                  edicion: conAnterior.anio,
                  cantidad: conAnterior.ganadores.length,
                  proyectos: conAnterior.ganadores.map((g) => ({
                    distrito: g.distrito,
                    titulo: g.titulo,
                    votos: g.votos,
                    url: conEdicion(`/proyectos/${g.slug}`, anioAnterior),
                  })),
                },
              }
            : {}),
        }),
        referencias: [
          { titulo: "Transparencia", url: conEdicion("/transparencia", anioEnEnlaces) },
          ...(conAnterior
            ? [
                {
                  titulo: `Ganadores de la edición ${conAnterior.anio}`,
                  url: conEdicion("/transparencia", anioAnterior),
                },
              ]
            : []),
        ],
      };
    }

    default:
      return {
        contenido: JSON.stringify({ error: `Herramienta desconocida: ${nombre}` }),
        referencias: [],
      };
  }
}
