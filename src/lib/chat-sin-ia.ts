/**
 * Respuesta del chat cuando no hay OPENROUTER_API_KEY configurada.
 *
 * No es un modelo de lenguaje: es un buscador que interpreta la consulta por
 * palabras clave y responde con los datos reales de la base. Existe para que el
 * sitio nunca quede con un chat roto, y para que se pueda usar en un entorno
 * donde no se quiera depender de un servicio externo.
 */
import {
  getDistrito,
  getEstadisticas,
  listarIdeas,
  type Edicion,
  type EstadoIdea,
} from "@/db/queries";
import { consultar } from "@/db";
import { sql } from "drizzle-orm";
import { ETIQUETA_ESTADO, ETIQUETA_PRESUPUESTO, formatearNumero } from "./formato";
import { normalizar } from "./texto";

type Respuesta = {
  texto: string;
  referencias: Array<{ titulo: string; url: string }>;
};

const CATEGORIAS: Array<{ slug: string; claves: string[] }> = [
  {
    slug: "socio-ambiental",
    claves: ["plaza", "verde", "ambiental", "arbol", "parque", "socio ambiental"],
  },
  {
    slug: "cultural-deportivo",
    claves: [
      "deport", "playon", "cancha", "club", "cultural", "biblioteca",
      "futbol", "basquet", "voley", "hockey", "gimnasio",
    ],
  },
  {
    slug: "innovacion-urbana",
    claves: ["sum", "vereda", "corredor", "urbana", "innovacion", "camineria", "pavimento"],
  },
];

export async function responderSinIA(
  pregunta: string,
  edicion: Edicion,
): Promise<Respuesta> {
  const q = normalizar(pregunta);

  // --- Distrito mencionado por numero --------------------------------------
  const porNumero = q.match(/\b(?:distrito|dist\.?|d)\s*n?°?\s*(\d{1,2})\b/);
  const numeroSuelto = !porNumero ? q.match(/\b(\d{1,2})\b/) : null;
  const numero = Number(porNumero?.[1] ?? numeroSuelto?.[1] ?? NaN);
  const distritoValido = Number.isInteger(numero) && numero >= 1 && numero <= 20;

  const pideGanador = /\bgan|mas votad|ganador|elegid/.test(q);
  const pideTotales = /\bcuant|total|estadistic|resumen|cuanta|votos en total/.test(q);
  const pideParticipar = /\bcomo (puedo )?(participo|participar)|presentar|cargar (mi )?idea|votar|empadron|cidituc/.test(
    q,
  );

  // --- Como participar -----------------------------------------------------
  if (pideParticipar) {
    return {
      texto: [
        "Hay dos formas de participar:",
        "",
        "**Presentando una idea.** Contás qué problema querés resolver en tu barrio y cómo lo resolverías. Marcás el lugar en el mapa y el distrito se completa solo.",
        "",
        "**Votando.** Tenés un voto y lo usás en un proyecto del distrito donde vivís. Para votar necesitás estar empadronado como ciudadano digital (CIDITUC), de manera virtual desde la página de la Municipalidad o presencial en las asambleas participativas.",
        "",
        `Hoy la edición ${edicion.anio} está en la etapa **${edicion.etapa}**.`,
      ].join("\n"),
      referencias: [
        { titulo: "Presentá tu idea", url: "/ideas/nueva" },
        { titulo: "Preguntas frecuentes", url: "/acerca-de" },
      ],
    };
  }

  // --- Totales -------------------------------------------------------------
  if (pideTotales && !distritoValido) {
    const stats = await getEstadisticas(edicion);
    const lineas = [
      `**Edición ${stats.anio}** — ${formatearNumero(stats.ideas)} ideas presentadas en los 20 distritos.`,
      "",
      `- Proyectos ganadores: **${stats.ganadores}**`,
      `- Votos registrados en los ganadores: **${formatearNumero(stats.votos)}**`,
      ...Object.entries(stats.porEstado).map(
        ([estado, cantidad]) => `- ${ETIQUETA_ESTADO[estado] ?? estado}: ${cantidad}`,
      ),
    ];
    if (stats.distritosSinGanador.length) {
      lineas.push(
        "",
        `Sin proyecto ganador: distrito ${stats.distritosSinGanador.join(", ")}.`,
      );
    }
    return {
      texto: lineas.join("\n"),
      referencias: [
        { titulo: "Transparencia y ejecución", url: "/transparencia" },
        { titulo: "Todos los proyectos", url: "/proyectos" },
      ],
    };
  }

  // --- Un distrito concreto ------------------------------------------------
  if (distritoValido) {
    const distrito = await getDistrito(numero, edicion.id);
    if (distrito) {
      const lineas = [`**Distrito ${numero}** — ${distrito.ideas.length} ideas presentadas.`];
      if (distrito.referencia) {
        lineas.push("", `Barrios: ${distrito.referencia}.`);
      }
      if (distrito.ganador) {
        lineas.push(
          "",
          `**Proyecto ganador:** ${distrito.ganador.titulo} — ${formatearNumero(
            distrito.ganador.votos,
          )} votos. Obra ${(
            ETIQUETA_PRESUPUESTO[distrito.ganador.estadoPresupuesto] ?? ""
          ).toLowerCase()}.`,
        );
      } else {
        lineas.push("", "Este distrito no tiene proyecto ganador en esta edición.");
      }
      const otras = distrito.ideas.filter((i) => !i.ganador).slice(0, 6);
      if (otras.length) {
        lineas.push("", "**Otras ideas del distrito:**");
        lineas.push(
          ...otras.map(
            (i) => `- ${i.titulo} — ${ETIQUETA_ESTADO[i.estado] ?? i.estado}`,
          ),
        );
      }
      return {
        texto: lineas.join("\n"),
        referencias: [
          { titulo: `Distrito ${numero}`, url: `/distritos/${numero}` },
          ...(distrito.ganador
            ? [{ titulo: distrito.ganador.titulo, url: `/proyectos/${distrito.ganador.slug}` }]
            : []),
        ],
      };
    }
  }

  // --- Ganadores -----------------------------------------------------------
  if (pideGanador) {
    const lista = await listarIdeas({
      edicionId: edicion.id,
      soloGanadores: true,
      limite: 20,
    });
    return {
      texto: [
        `**Proyectos ganadores ${edicion.anio}** (${lista.length}), ordenados por votos:`,
        "",
        ...lista.map(
          (i) => `- **D${i.distrito}** · ${i.titulo} — ${formatearNumero(i.votos)} votos`,
        ),
      ].join("\n"),
      referencias: [{ titulo: "Todos los proyectos", url: "/proyectos?ganadores=1" }],
    };
  }

  // --- Barrio --------------------------------------------------------------
  const posibleBarrio = pregunta
    .replace(/[¿?¡!.,;:]/g, " ")
    .split(/\s+/)
    .filter((palabra) => palabra.length > 3)
    .slice(-4)
    .join(" ");

  if (posibleBarrio) {
    // Se buscan las palabras largas de la consulta dentro del barrio
    // normalizado (minusculas y sin tildes), sin extensiones de Postgres.
    const palabras = normalizar(posibleBarrio)
      .split(/\s+/)
      .filter((palabra) => palabra.length > 3);

    const coincidencias = palabras.map(
      (palabra) => sql`i.barrio_normalizado LIKE ${`%${palabra}%`}`,
    );

    const filas = palabras.length
      ? await consultar<{ numero: number; barrio: string }>(sql`
          SELECT d.numero, i.barrio
            FROM ideas i
            JOIN distritos d ON d.id = i.distrito_id
           WHERE i.edicion_id = ${edicion.id}
             AND i.barrio IS NOT NULL
             AND (${sql.join(coincidencias, sql` OR `)})
           GROUP BY d.numero, i.barrio
           ORDER BY d.numero
           LIMIT 6
        `)
      : [];
    if (filas.length) {
      return {
        texto: [
          "Encontré estas coincidencias por barrio:",
          "",
          ...filas.map((f) => `- **${f.barrio}** está en el distrito ${f.numero}`),
        ].join("\n"),
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
  }

  // --- Categoria o texto libre --------------------------------------------
  const categoria = CATEGORIAS.find((c) => c.claves.some((clave) => q.includes(clave)));
  const lista = await listarIdeas({
    edicionId: edicion.id,
    categoria: categoria?.slug,
    texto: categoria ? undefined : pregunta.replace(/[¿?¡!]/g, "").trim().slice(0, 60),
    limite: 8,
  });

  if (lista.length) {
    return {
      texto: [
        categoria
          ? `Ideas de la categoría **${lista[0].categoriaNombre}** (${lista.length} de las que encontré):`
          : `Encontré ${lista.length} proyecto${lista.length === 1 ? "" : "s"} que coinciden:`,
        "",
        ...lista.map(
          (i) =>
            `- **D${i.distrito}** · ${i.titulo} — ${ETIQUETA_ESTADO[i.estado] ?? i.estado}${
              i.votos > 1 ? ` (${formatearNumero(i.votos)} votos)` : ""
            }`,
        ),
      ].join("\n"),
      referencias: lista
        .slice(0, 3)
        .map((i) => ({ titulo: i.titulo, url: `/proyectos/${i.slug}` })),
    };
  }

  return {
    texto: [
      "No encontré nada con esa consulta. Probá con:",
      "",
      "- un número de distrito: *distrito 7*",
      "- el nombre de tu barrio: *Villa Urquiza*",
      "- *proyectos ganadores*",
      "- *cuántas ideas se presentaron*",
      "- *cómo participo*",
    ].join("\n"),
    referencias: [
      { titulo: "Mapa de distritos", url: "/distritos" },
      { titulo: "Todos los proyectos", url: "/proyectos" },
    ],
  };
}
