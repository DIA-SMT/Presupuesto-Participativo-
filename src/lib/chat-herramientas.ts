/**
 * Herramientas del chatbot.
 *
 * El asistente no tiene ningun conocimiento propio sobre el programa: todo lo
 * que responde sale de estas funciones, que consultan la misma base que el
 * resto del sitio. Si un dato no esta cargado, la herramienta devuelve
 * explicitamente que no esta, para que la respuesta lo diga en lugar de
 * completarlo.
 */
import type OpenAI from "openai";
import { z } from "zod";
import {
  getAvances,
  getDistrito,
  getDistritos,
  getEstadisticas,
  getIdea,
  listarIdeas,
  type Edicion,
  type EstadoIdea,
  type IdeaVista,
} from "@/db/queries";
import { consultar } from "@/db";
import { sql } from "drizzle-orm";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_PRESUPUESTO,
  formatearPesos,
} from "./formato";
import { normalizar } from "./texto";

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

const esquemaBuscar = z.object({
  distrito: z.number().int().min(1).max(20).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  estado: z.enum(ESTADOS).optional(),
  texto: z.string().max(120).optional(),
  solo_ganadores: z.boolean().optional(),
  limite: z.number().int().min(1).max(25).optional(),
});

const esquemaDetalle = z.object({ slug: z.string().min(1).max(200) });
const esquemaDistrito = z.object({ numero: z.number().int().min(1).max(20) });
const esquemaUbicar = z.object({ barrio: z.string().min(2).max(120) });
const esquemaVacio = z.object({});

// ---------------------------------------------------------------------------
// Definiciones que ve el modelo
// ---------------------------------------------------------------------------

/**
 * Formato de OpenRouter (compatible con OpenAI): `type: "function"` con el
 * esquema en `parameters`.
 *
 * No se usa `strict: true` a proposito. En el modo estricto de OpenAI toda
 * propiedad declarada tiene que estar tambien en `required`, y `buscar_proyectos`
 * tiene los seis parametros opcionales: declararlos obligatorios obligaria al
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
        "Busca ideas y proyectos del Presupuesto Participativo. Devuelve titulo, distrito, barrio, categoria, estado y votos de cada uno. Usar siempre que la persona pregunte que se presento, que gano, o pida una lista.",
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
        "Devuelve el contenido completo de un proyecto: problema, solucion, beneficios, votos, presupuesto y, si el municipio informo alguno, los avances de la obra. Requiere el slug que devuelve buscar_proyectos.",
      parameters: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "Identificador del proyecto, tal como lo devuelve buscar_proyectos.",
          },
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
        "Resumen de un distrito: cuantas ideas se presentaron, cual gano con cuantos votos y que barrios abarca.",
      parameters: {
        type: "object",
        properties: {
          numero: { type: "integer", minimum: 1, maximum: 20 },
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
        "Dice a que distrito pertenece un barrio. Usar cuando la persona nombra su barrio en lugar de un numero de distrito.",
      parameters: {
        type: "object",
        properties: {
          barrio: {
            type: "string",
            description: "Nombre del barrio, tal como lo dijo la persona.",
          },
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
        "Totales de la edicion vigente: ideas presentadas, ganadores, votos, y el reparto por categoria y por estado de evaluacion.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
        required: [],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Ejecucion
// ---------------------------------------------------------------------------

function resumirIdea(idea: IdeaVista) {
  return {
    slug: idea.slug,
    titulo: idea.titulo,
    distrito: idea.distrito,
    barrio: idea.barrio ?? "no cargado",
    categoria: idea.categoriaNombre ?? "sin categoria",
    estado: ETIQUETA_ESTADO[idea.estado] ?? idea.estado,
    votos: idea.votos,
    ganador: idea.ganador,
    url: `/proyectos/${idea.slug}`,
  };
}

export type ResultadoHerramienta = {
  contenido: string;
  /** Enlaces que la interfaz muestra como tarjetas debajo de la respuesta. */
  referencias: Array<{ titulo: string; url: string }>;
};

export async function ejecutarHerramienta(
  nombre: string,
  entrada: unknown,
  edicion: Edicion,
): Promise<ResultadoHerramienta> {
  switch (nombre) {
    case "buscar_proyectos": {
      const args = esquemaBuscar.parse(entrada);
      const lista = await listarIdeas({
        edicionId: edicion.id,
        distrito: args.distrito,
        categoria: args.categoria,
        estado: args.estado as EstadoIdea | undefined,
        texto: args.texto,
        soloGanadores: args.solo_ganadores,
        limite: args.limite ?? 12,
      });
      if (!lista.length) {
        return {
          contenido: JSON.stringify({
            encontrados: 0,
            aviso:
              "No hay ideas que cumplan ese filtro en la edicion " +
              edicion.anio +
              ". No inventar resultados: decir que no se encontro nada y ofrecer ampliar la busqueda.",
          }),
          referencias: [],
        };
      }
      return {
        contenido: JSON.stringify({
          edicion: edicion.anio,
          encontrados: lista.length,
          proyectos: lista.map(resumirIdea),
        }),
        referencias: lista
          .slice(0, 4)
          .map((i) => ({ titulo: i.titulo, url: `/proyectos/${i.slug}` })),
      };
    }

    case "detalle_proyecto": {
      const { slug } = esquemaDetalle.parse(entrada);
      const idea = await getIdea(slug);
      if (!idea) {
        return {
          contenido: JSON.stringify({
            encontrado: false,
            aviso: "No existe un proyecto con ese identificador. Usar buscar_proyectos primero.",
          }),
          referencias: [],
        };
      }
      const avances = idea.ganador ? await getAvances(idea.id) : [];
      return {
        contenido: JSON.stringify({
          ...resumirIdea(idea),
          anio: idea.anio,
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
        referencias: [{ titulo: idea.titulo, url: `/proyectos/${idea.slug}` }],
      };
    }

    case "resumen_distrito": {
      const { numero } = esquemaDistrito.parse(entrada);
      const distrito = await getDistrito(numero, edicion.id);
      if (!distrito) {
        return {
          contenido: JSON.stringify({ encontrado: false }),
          referencias: [],
        };
      }
      const porEstado: Record<string, number> = {};
      for (const idea of distrito.ideas) {
        const clave = ETIQUETA_ESTADO[idea.estado] ?? idea.estado;
        porEstado[clave] = (porEstado[clave] ?? 0) + 1;
      }
      return {
        contenido: JSON.stringify({
          distrito: numero,
          edicion: edicion.anio,
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
                url: `/proyectos/${distrito.ganador.slug}`,
              }
            : "este distrito no tiene proyecto ganador en esta edicion",
          url: `/distritos/${numero}`,
        }),
        referencias: [
          { titulo: `Distrito ${numero}`, url: `/distritos/${numero}` },
          ...(distrito.ganador
            ? [{ titulo: distrito.ganador.titulo, url: `/proyectos/${distrito.ganador.slug}` }]
            : []),
        ],
      };
    }

    case "ubicar_barrio": {
      const { barrio } = esquemaUbicar.parse(entrada);
      // La comparacion sin tildes usa la columna barrio_normalizado, que se
      // llena al cargar cada idea (sin depender de la extension unaccent).
      const patron = `%${normalizar(barrio)}%`;
      const filas = await consultar<{ numero: number; coincidencia: string }>(sql`
        SELECT d.numero, i.barrio AS coincidencia
          FROM ideas i
          JOIN distritos d ON d.id = i.distrito_id
         WHERE i.edicion_id = ${edicion.id}
           AND i.publicada
           AND i.barrio IS NOT NULL
           AND i.barrio_normalizado LIKE ${patron}
         GROUP BY d.numero, i.barrio
         ORDER BY d.numero
         LIMIT 8
        `);
      if (!filas.length) {
        return {
          contenido: JSON.stringify({
            encontrado: false,
            aviso:
              "Ese barrio no figura en las ideas cargadas. No adivinar el distrito: sugerir que la persona lo busque en el mapa de /distritos, donde puede tocar su ubicacion.",
          }),
          referencias: [{ titulo: "Mapa de distritos", url: "/distritos" }],
        };
      }
      return {
        contenido: JSON.stringify({
          busqueda: barrio,
          coincidencias: filas.map((f) => ({
            distrito: f.numero,
            barrio: f.coincidencia,
            url: `/distritos/${f.numero}`,
          })),
        }),
        referencias: [
          ...new Map(
            filas.map((f) => [
              f.numero,
              { titulo: `Distrito ${f.numero}`, url: `/distritos/${f.numero}` },
            ]),
          ).values(),
        ].slice(0, 3),
      };
    }

    case "estadisticas": {
      esquemaVacio.parse(entrada ?? {});
      const stats = await getEstadisticas(edicion);
      const distritos = await getDistritos(edicion.id);
      return {
        contenido: JSON.stringify({
          edicion: stats.anio,
          etapa_del_proceso: edicion.etapa,
          ideas_presentadas: stats.ideas,
          proyectos_ganadores: stats.ganadores,
          votos_totales: stats.votos,
          distritos: stats.distritos,
          distritos_sin_ganador: stats.distritosSinGanador,
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
        }),
        referencias: [{ titulo: "Transparencia", url: "/transparencia" }],
      };
    }

    default:
      return {
        contenido: JSON.stringify({ error: `Herramienta desconocida: ${nombre}` }),
        referencias: [],
      };
  }
}
