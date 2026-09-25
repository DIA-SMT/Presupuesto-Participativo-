/**
 * Respuesta del chat cuando no hay OPENROUTER_API_KEY configurada.
 *
 * No es un modelo de lenguaje: es un buscador que interpreta la consulta por
 * palabras clave y responde con los datos reales de la base. Existe para que el
 * sitio nunca quede con un chat roto, y para que se pueda usar en un entorno
 * donde no se quiera depender de un servicio externo.
 *
 * Acompaña a las herramientas del modelo (src/lib/chat-herramientas.ts) en lo
 * que importa con dos ediciones cargadas: un año en la pregunta ("ganadores
 * 2025") la cambia de edicion; si la vigente todavia no voto, ofrece los
 * ganadores de la ultima que si; y un barrio se ubica con la capa oficial.
 */
import {
  buscarBarriosEnIdeas,
  getArchivoDeEdiciones,
  getDistrito,
  getEdicionParaVer,
  getEstadisticas,
  getUltimaEdicionTerminadaConGanadores,
  listarIdeas,
  type Edicion,
  type EdicionDelArchivo,
} from "@/db/queries";
import { ideasDelBarrio, ubicarBarriosEnFrase, type BarrioUbicado } from "./barrios";
import { conEdicion, votacionTerminada } from "./ediciones";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_ETAPA,
  ETIQUETA_PRESUPUESTO,
  formatearNumero,
} from "./formato";
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

/** "1", "1 y 2", "1, 2 y 3". */
function enumerar(numeros: number[]): string {
  if (numeros.length <= 1) return numeros.join("");
  return `${numeros.slice(0, -1).join(", ")} y ${numeros.at(-1)}`;
}

function cantidad(numero: number, singular: string, plural: string): string {
  return `${formatearNumero(numero)} ${numero === 1 ? singular : plural}`;
}

function etiquetaEtapa(edicion: Edicion): string {
  return ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa;
}

export async function responderSinIA(
  pregunta: string,
  vigente: Edicion,
): Promise<Respuesta> {
  const q = normalizar(pregunta);

  // --- Distrito mencionado por numero --------------------------------------
  const porNumero = q.match(/\b(?:distrito|dist\.?|d)\s*n?°?\s*(\d{1,2})\b/);
  const numeroSuelto = !porNumero ? q.match(/\b(\d{1,2})\b/) : null;
  const numero = Number(porNumero?.[1] ?? numeroSuelto?.[1] ?? NaN);
  const distritoValido = Number.isInteger(numero) && numero >= 1 && numero <= 20;

  // "obra" cuenta como pedir ganadores: las obras son los proyectos que ganaron.
  const pideGanador = /\bgan|mas votad|ganador|elegid|\bobras?\b/.test(q);
  const pideTotales = /\bcuant|total|estadistic|resumen|cuanta|votos en total/.test(q);
  // "presentar" y "votar" van como palabra entera. Como prefijo agarraban
  // "presentaron" y "votaron": "¿Cuántas ideas se presentaron?", que es una de
  // las sugerencias del propio widget, se contestaba con "Hay dos formas de
  // participar" en lugar de con los totales. Y "presento" no estaba, asi que
  // otra de las sugerencias, "¿Cómo presento una idea?", no encontraba nada.
  const pideParticipar = /\bcomo (puedo )?(participo|participar)|\bpresent(o|ar|arla|arlo)\b|cargar (mi |una )?idea|\bvotar\b|empadron|cidituc/.test(
    q,
  );

  // --- Como participar -----------------------------------------------------
  // Siempre sobre la vigente: como se participa es una pregunta sobre hoy.
  if (pideParticipar) {
    return {
      texto: [
        "Hay dos formas de participar:",
        "",
        "**Presentando una idea.** Contás qué problema querés resolver en tu barrio y cómo lo resolverías. Marcás el lugar en el mapa y el distrito se completa solo.",
        "",
        "**Votando.** Tenés un voto y lo usás en un proyecto del distrito donde vivís. Para votar necesitás estar empadronado como ciudadano digital (CIDITUC), de manera virtual desde la página de la Municipalidad o presencial en las asambleas participativas.",
        "",
        // Bug: imprimia el valor crudo del enum ("**seguimiento**", "**cerrada**")
        // en lugar de la etiqueta que usa el resto del sitio.
        `Hoy la edición ${vigente.anio} está en la etapa **${etiquetaEtapa(vigente)}**.`,
      ].join("\n"),
      referencias: [
        { titulo: "Presentá tu idea", url: "/ideas/nueva" },
        { titulo: "Preguntas frecuentes", url: "/acerca-de" },
      ],
    };
  }

  // --- Edicion pedida por año ----------------------------------------------
  // "ganadores 2025" es la forma de pedir otra edicion. Un año que no esta
  // cargado se dice, en lugar de contestar con la vigente como si fuera esa.
  // Solo años 20xx: el programa es de este siglo, y cualquier otro numero de
  // cuatro cifras ("1500 votos") es una cantidad, no una edicion.
  const anioPedido = Number(q.match(/\b(20\d{2})\b/)?.[1] ?? NaN);
  let edicion: Edicion = vigente;
  let esVigente = true;
  if (Number.isInteger(anioPedido) && anioPedido !== vigente.anio) {
    const pedida = await getEdicionParaVer(anioPedido);
    if (!pedida) {
      const conDatos = (await getArchivoDeEdiciones())
        .filter((e) => e.activa || e.ideas > 0)
        .map((e) => e.anio);
      return {
        texto:
          `No hay datos de una edición ${anioPedido} en el sitio.` +
          (conDatos.length ? ` Hay datos de las ediciones ${enumerar(conDatos)}.` : ""),
        referencias: [{ titulo: "Archivo de ediciones", url: "/archivo" }],
      };
    }
    edicion = pedida;
    esVigente = pedida.activa;
  }
  const anioEnEnlaces = esVigente ? null : edicion.anio;
  const enlace = (ruta: string) => conEdicion(ruta, anioEnEnlaces);

  // --- Barrio de la capa oficial -------------------------------------------
  // Antes que el numero de distrito: en "¿en qué distrito queda Villa 9 de
  // Julio?" el 9 es parte del barrio, y se contestaba con el distrito 9. Solo
  // con una señal de que se pregunta por un lugar, o con una consulta corta
  // ("villa urquiza"): en una frase cualquiera, algun nombre de barrio aparece
  // por casualidad.
  const pideUbicacion =
    /\bbarrio\b|\bb[°º]|\bqueda\b|\bpertenec|\bvivo\b|\bsoy de\b|\b(que|cual) distrito\b|\bmi distrito\b|\bdonde\b/.test(
      q,
    );
  const corta = q.split(/\s+/).filter(Boolean).length <= 4;
  if (!porNumero && (pideUbicacion || corta)) {
    const barrios = ubicarBarriosEnFrase(pregunta);
    if (barrios.length) return responderBarrios(barrios, edicion, enlace);
  }

  // --- Totales -------------------------------------------------------------
  if (pideTotales && !distritoValido) {
    const stats = await getEstadisticas(edicion);
    const yaVoto = votacionTerminada(edicion.etapa);
    const items = [
      ...(yaVoto
        ? [
            `- Proyectos ganadores: **${stats.ganadores}**`,
            `- Votos registrados en los ganadores: **${formatearNumero(stats.votos)}**`,
          ]
        : []),
      ...Object.entries(stats.porEstado).map(
        ([estado, total]) => `- ${ETIQUETA_ESTADO[estado] ?? estado}: ${total}`,
      ),
    ];
    const lineas = [
      stats.ideas
        ? `**Edición ${stats.anio}** — ${cantidad(stats.ideas, "idea presentada", "ideas presentadas")} en los 20 distritos.`
        : `**Edición ${stats.anio}** — todavía no hay ideas presentadas.`,
      ...(items.length ? ["", ...items] : []),
    ];
    const referencias = [
      { titulo: "Transparencia", url: enlace("/transparencia") },
      { titulo: "Todos los proyectos", url: enlace("/proyectos") },
    ];
    if (yaVoto && stats.distritosSinGanador.length) {
      lineas.push(
        "",
        `Sin proyecto ganador: distrito ${stats.distritosSinGanador.join(", ")}.`,
      );
    }
    if (!yaVoto) {
      // Antes de votar, "0 ganadores" y "sin ganador: distritos 1 a 20" se
      // leian como un resultado.
      lineas.push(
        "",
        `La edición está en la etapa **${etiquetaEtapa(edicion)}**: los ganadores salen de la votación.`,
      );
      const anterior = await getUltimaEdicionTerminadaConGanadores();
      if (anterior && anterior.id !== edicion.id) {
        lineas.push(
          `Los últimos ganadores son los de la edición ${anterior.anio}: preguntá por *ganadores ${anterior.anio}*.`,
        );
        referencias.unshift({
          titulo: `Ganadores de la edición ${anterior.anio}`,
          url: conEdicion("/transparencia", anterior.activa ? null : anterior.anio),
        });
      }
    }
    return { texto: lineas.join("\n"), referencias };
  }

  // --- Un distrito concreto ------------------------------------------------
  if (distritoValido) {
    const distrito = await getDistrito(numero, edicion.id);
    if (distrito) {
      const lineas = [
        `**Distrito ${numero}** — ${cantidad(distrito.ideas.length, "idea presentada", "ideas presentadas")} en la edición ${edicion.anio}.`,
      ];
      const referencias = [{ titulo: `Distrito ${numero}`, url: enlace(`/distritos/${numero}`) }];
      if (distrito.referencia) {
        lineas.push("", `Barrios: ${distrito.referencia}.`);
      }
      if (distrito.ganador) {
        lineas.push(
          "",
          // Terminaba en "Obra en preparación.", con el default del ETL. Sin
          // avances informados no hay nada que decir de la obra.
          `**Proyecto ganador:** ${distrito.ganador.titulo} — ${formatearNumero(
            distrito.ganador.votos,
          )} votos.`,
        );
        referencias.push({
          titulo: distrito.ganador.titulo,
          url: enlace(`/proyectos/${distrito.ganador.slug}`),
        });
      } else if (votacionTerminada(edicion.etapa)) {
        lineas.push("", "Este distrito no tiene proyecto ganador en esta edición.");
      } else {
        lineas.push(
          "",
          `Todavía no hay ganador: la edición está en la etapa **${etiquetaEtapa(edicion)}** y el ganador sale de la votación.`,
        );
        const anterior = await getUltimaEdicionTerminadaConGanadores();
        const ganadorAnterior =
          anterior && anterior.id !== edicion.id
            ? anterior.ganadores.find((g) => g.distrito === numero)
            : undefined;
        if (anterior && ganadorAnterior) {
          lineas.push(
            `En la edición ${anterior.anio} ganó **${ganadorAnterior.titulo}** (${formatearNumero(
              ganadorAnterior.votos,
            )} votos).`,
          );
          referencias.push({
            titulo: ganadorAnterior.titulo,
            url: conEdicion(
              `/proyectos/${ganadorAnterior.slug}`,
              anterior.activa ? null : anterior.anio,
            ),
          });
        }
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
      return { texto: lineas.join("\n"), referencias };
    }
  }

  // --- Ganadores -----------------------------------------------------------
  if (pideGanador) {
    const lista = await listarIdeas({
      edicionId: edicion.id,
      soloGanadores: true,
      limite: 20,
    });
    if (lista.length) {
      return {
        texto: [
          `**Proyectos ganadores ${edicion.anio}** (${lista.length}), ordenados por votos:`,
          "",
          ...lista.map(
            (i) => `- **D${i.distrito}** · ${i.titulo} — ${formatearNumero(i.votos)} votos`,
          ),
        ].join("\n"),
        referencias: [{ titulo: "Todos los proyectos", url: enlace("/proyectos?ganadores=1") }],
      };
    }
    if (votacionTerminada(edicion.etapa)) {
      return {
        texto: `La edición ${edicion.anio} no tiene proyectos ganadores publicados.`,
        referencias: [{ titulo: "Transparencia", url: enlace("/transparencia") }],
      };
    }
    // La vigente todavia no voto: lo que hay para seguir son las obras de la
    // ultima edicion que si voto. Se dice de que edicion son.
    const anterior = await getUltimaEdicionTerminadaConGanadores();
    const lineas = [
      `La edición ${edicion.anio} todavía no tiene proyectos ganadores: está en la etapa **${etiquetaEtapa(
        edicion,
      )}** y el ganador de cada distrito sale de la votación.`,
    ];
    if (!anterior || anterior.id === edicion.id) {
      return { texto: lineas.join("\n"), referencias: [] };
    }
    const anioAnterior = anterior.activa ? null : anterior.anio;
    lineas.push(
      "",
      `Los últimos ganadores son los de la edición ${anterior.anio} (${anterior.ganadores.length}), por distrito:`,
      "",
      ...anterior.ganadores.map(
        (g) =>
          `- **D${g.distrito}** · ${g.titulo} — ${formatearNumero(g.votos)} votos` +
          (g.estadoObra ? ` · obra ${(ETIQUETA_PRESUPUESTO[g.estadoObra] ?? g.estadoObra).toLowerCase()}` : ""),
      ),
    );
    return {
      texto: lineas.join("\n"),
      referencias: [
        {
          titulo: `Ganadores de la edición ${anterior.anio}`,
          url: conEdicion("/transparencia", anioAnterior),
        },
      ],
    };
  }

  // --- Barrio escrito en las ideas -----------------------------------------
  // Respaldo de la capa oficial, para nombres que la capa no tiene. Es la
  // busqueda de siempre: las palabras largas del final de la consulta contra el
  // barrio que escribieron quienes presentaron ideas (sin tildes, sin
  // extensiones de Postgres). Ahora mira las ideas publicadas de todas las
  // ediciones: en que distrito queda un barrio no depende de la edicion.
  const palabras = normalizar(
    pregunta
      .replace(/[¿?¡!.,;:]/g, " ")
      .split(/\s+/)
      .filter((palabra) => palabra.length > 3)
      .slice(-4)
      .join(" "),
  )
    .split(/\s+/)
    .filter((palabra) => palabra.length > 3);

  const declarados = await buscarBarriosEnIdeas(palabras, 6);
  if (declarados.length) {
    return {
      texto: [
        "Encontré estas coincidencias por barrio:",
        "",
        ...declarados.map((f) => `- **${f.barrio}** está en el distrito ${f.distrito}`),
      ].join("\n"),
      referencias: [
        ...new Map(
          declarados.map((f) => [
            f.distrito,
            { titulo: `Distrito ${f.distrito}`, url: enlace(`/distritos/${f.distrito}`) },
          ]),
        ).values(),
      ].slice(0, 3),
    };
  }

  // --- Categoria o texto libre --------------------------------------------
  const categoria = CATEGORIAS.find((c) => c.claves.some((clave) => q.includes(clave)));
  const filtro = {
    categoria: categoria?.slug,
    texto: categoria ? undefined : pregunta.replace(/[¿?¡!]/g, "").trim().slice(0, 60),
    limite: 8,
  };
  let lista = await listarIdeas({ edicionId: edicion.id, ...filtro });

  // Nada en la vigente (la 2026 recien abierta no tiene ideas): se prueba en
  // las otras ediciones, de la mas nueva a la mas vieja, y se dice de cual es.
  let deOtra: EdicionDelArchivo | null = null;
  if (!lista.length && esVigente) {
    const otras = (await getArchivoDeEdiciones()).filter(
      (e) => e.id !== edicion.id && e.ideas > 0,
    );
    for (const otra of otras) {
      const encontradas = await listarIdeas({ edicionId: otra.id, ...filtro });
      if (encontradas.length) {
        lista = encontradas;
        deOtra = otra;
        break;
      }
    }
  }

  if (lista.length) {
    const anioLista = deOtra ? (deOtra.activa ? null : deOtra.anio) : anioEnEnlaces;
    return {
      texto: [
        ...(deOtra
          ? [`En la edición ${edicion.anio} no encontré nada con eso. En la edición ${deOtra.anio}:`, ""]
          : []),
        categoria
          ? `Ideas de la categoría **${lista[0].categoriaNombre}** (${lista.length} de las que encontré):`
          : lista.length === 1
            ? "Encontré 1 proyecto que coincide:"
            : `Encontré ${lista.length} proyectos que coinciden:`,
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
        .map((i) => ({ titulo: i.titulo, url: conEdicion(`/proyectos/${i.slug}`, anioLista) })),
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
    // Con un año en la pregunta, las vistas de esa edicion.
    referencias: [
      { titulo: "Mapa de distritos", url: enlace("/distritos") },
      { titulo: "Todos los proyectos", url: enlace("/proyectos") },
    ],
  };
}

/**
 * En que distrito queda cada barrio y cuantas ideas hay ahi en la edicion. Un
 * barrio repartido entre distritos no se asigna a uno: se dicen todos y se
 * manda al mapa, porque el distrito de cada vecino depende de su cuadra.
 */
async function responderBarrios(
  barrios: BarrioUbicado[],
  edicion: Edicion,
  enlace: (ruta: string) => string,
): Promise<Respuesta> {
  const ideas = await listarIdeas({ edicionId: edicion.id });
  const lineas: string[] = [];

  for (const barrio of barrios) {
    const numeros = barrio.distritos.map((parte) => parte.distrito);
    const enElBarrio = ideasDelBarrio(barrio.feature, ideas).length;
    if (lineas.length) lineas.push("");

    if (numeros.length === 1) {
      const enElDistrito = ideas.filter((idea) => idea.distrito === numeros[0]).length;
      lineas.push(`**${barrio.nombre}** queda en el distrito ${numeros[0]}.`);
      lineas.push(
        enElDistrito
          ? `En la edición ${edicion.anio} hay ${cantidad(enElDistrito, "idea", "ideas")} en el distrito${
              enElBarrio ? `, ${formatearNumero(enElBarrio)} en el barrio` : ""
            }.`
          : `En la edición ${edicion.anio} todavía no hay ideas publicadas en ese distrito.`,
      );
    } else {
      lineas.push(
        `**${barrio.nombre}** está repartido entre los distritos ${enumerar(numeros)}: el tuyo depende de tu cuadra. Fijate en el mapa de distritos.`,
      );
      if (barrio.sectores > 1) {
        lineas.push(
          "En la capa oficial ese nombre tiene sectores separados: pueden ser barrios distintos que se llaman igual.",
        );
      }
      lineas.push(
        enElBarrio
          ? `En la edición ${edicion.anio} hay ${cantidad(enElBarrio, "idea", "ideas")} en el barrio.`
          : `En la edición ${edicion.anio} todavía no hay ideas en el barrio.`,
      );
    }
  }

  const distritos = [...new Set(barrios.flatMap((b) => b.distritos.map((p) => p.distrito)))];
  return {
    texto: lineas.join("\n"),
    referencias: [
      ...distritos
        .slice(0, 2)
        .map((numero) => ({ titulo: `Distrito ${numero}`, url: enlace(`/distritos/${numero}`) })),
      { titulo: "Mapa de distritos", url: enlace("/distritos") },
    ],
  };
}
