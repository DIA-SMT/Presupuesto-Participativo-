/**
 * El buscador sin IA, para lo que explica el sitio y no son datos de ideas:
 * como votar, como presentar una idea, fechas, reglamento, montos, seguimiento
 * de una idea, y las preguntas frecuentes.
 *
 * Antes contestaba todo eso con un solo texto escrito aca ("Hay dos formas de
 * participar..."), que no sabia en que etapa estaba el programa ni hasta
 * cuando, y lo demas caia en la busqueda de proyectos: "¿qué pasa con las ideas
 * que no ganan?" tiene "gan" y se contestaba con la lista de ganadores. Ahora
 * contesta con el contexto del sitio (src/lib/chat-contexto.ts): lo mismo que
 * dicen las paginas y que lee el modelo.
 *
 * Es logica pura: recibe el contexto ya leido y la fecha de hoy, asi se prueba
 * sin base (scripts/tests/chat-sin-ia-sitio.test.ts). Devuelve null cuando la
 * consulta no es sobre el sitio, y sigue el buscador de datos.
 */
import type { Edicion } from "@/db/queries";
import type { ContextoDelSitio } from "./chat-contexto";
import { buscarEnParrafos, mismaPregunta } from "./contenido-del-programa";
import { votacionTerminada } from "./ediciones";
import { formatearFecha } from "./formato";
import { normalizar } from "./texto";

type Respuesta = {
  texto: string;
  referencias: Array<{ titulo: string; url: string }>;
};

type Tema =
  | "reglamento"
  | "votar"
  | "presentar"
  | "seguimiento"
  | "montos"
  | "fechas"
  | "participar";

/**
 * Que pregunta la persona, por palabras (sobre el texto normalizado). El orden
 * importa: "¿quién puede votar?" es una pregunta por las reglas antes que por
 * como se vota, y "¿cuándo puedo presentar?" es por presentar, no por fechas.
 * "votos", "votado" y "presentaron" NO estan: "¿cuántos votos tuvo?" y
 * "¿cuántas ideas se presentaron?" preguntan por datos.
 */
const TEMAS: Array<{ tema: Tema; patron: RegExp }> = [
  {
    tema: "reglamento",
    patron: /\breglamento\b|\breglas?\b|\brequisitos?\b|\bquien(es)? pueden?\b|\bedad\b/,
  },
  {
    tema: "votar",
    patron:
      /\bvotar\b|\bvoto\b|\bempadron|\bcidituc\b|\bboleta\b|\bpadron\b|\bvotacion\b.*\b(cuando|como|donde|hasta|empieza|termina|abre|cierra)\b|\b(cuando|como|donde|hasta)\b.*\bvotacion\b/,
  },
  {
    tema: "presentar",
    patron:
      /\bpresent(o|ar|arla|arlo|as)\b|\bcargar (mi |una )?idea\b|\bproponer\b|\bpropongo\b|\bnueva idea\b|\bsubir (mi |una )?idea\b/,
  },
  {
    tema: "seguimiento",
    patron: /\bseguimiento\b|\bseguir mi idea\b|\bsigo mi idea\b|\bcomo va mi idea\b|\bcodigo\b|\bmi idea\b/,
  },
  {
    tema: "montos",
    patron: /\bmontos?\b|\bcuanto (cuesta|sale|salio|costo)\b|\bcuesta\b|\bplata\b|\bdinero\b|\bimporte/,
  },
  {
    tema: "fechas",
    patron: /\bcuando\b|\bfechas?\b|\bcronograma\b|\bplazos?\b|\betapa\b|\bcalendario\b/,
  },
  {
    tema: "participar",
    patron:
      /\bcomo (puedo )?(participo|participar)\b|\bque es el presupuesto\b|\bque es esto\b|\bcomo funciona\b|\bde que se trata\b|\bpara que sirve\b/,
  },
];

export function temaDelSitio(pregunta: string): Tema | null {
  const q = normalizar(pregunta);
  return TEMAS.find(({ patron }) => patron.test(q))?.tema ?? null;
}

/** " hasta el 15 de noviembre de 2026", o nada si no hay fecha o ya paso. */
function hastaEl(fecha: string | null, hoy: string): string {
  return fecha && fecha >= hoy ? ` hasta el ${formatearFecha(fecha)}` : "";
}

function conAviso(contexto: ContextoDelSitio, lineas: string[]): string[] {
  return contexto.aviso ? [`**Aviso:** ${contexto.aviso}`, "", ...lineas] : lineas;
}

const ACERCA_DE = { titulo: "Cómo participar", url: "/acerca-de" };
const SEGUIMIENTO = { titulo: "Seguí tu idea", url: "/ideas/seguimiento" };

/**
 * La respuesta sobre el sitio, o null si la consulta no es sobre el sitio.
 * `hoy` en AAAA-MM-DD (hoyEnTucuman).
 */
export function responderSobreElSitio(
  pregunta: string,
  edicion: Edicion,
  contexto: ContextoDelSitio,
  hoy: string,
): Respuesta | null {
  // Una pregunta frecuente con otras palabras: la respuesta es la del sitio.
  // Va primero porque el umbral es alto (ver `mismaPregunta`).
  const frecuente = mismaPregunta(pregunta, contexto.preguntas);
  if (frecuente) {
    return {
      texto: `**${frecuente.pregunta}**\n\n${frecuente.respuesta}`,
      referencias: [{ titulo: "Preguntas frecuentes", url: "/acerca-de" }],
    };
  }

  const tema = temaDelSitio(pregunta);
  if (!tema) return null;
  const { anio } = edicion;

  switch (tema) {
    case "reglamento": {
      const referencias = [{ titulo: "Reglamento", url: "/reglamento" }];
      if (contexto.reglamento.publicado) {
        const parrafos = buscarEnParrafos(contexto.reglamento.parrafos, pregunta, 4);
        return {
          texto: parrafos.length
            ? ["Esto dice el reglamento:", "", ...parrafos.map((p) => `- ${p.texto}`)].join("\n")
            : "No encontré eso en el reglamento. Lo podés leer completo en la página del reglamento.",
          referencias,
        };
      }
      return {
        texto: [
          contexto.reglamento.aviso,
          "",
          "Mientras tanto, estas son las reglas confirmadas:",
          "",
          ...contexto.reglamento.reglasConfirmadas.map((r) => `- **${r.titulo}.** ${r.texto}`),
          "",
          "Lo que no está en esta lista todavía no está definido en el sitio.",
        ].join("\n"),
        referencias,
      };
    }

    case "votar": {
      const estado =
        edicion.etapa === "votacion"
          ? `La votación de la edición ${anio} está abierta${hastaEl(edicion.votacionHasta, hoy)}.`
          : votacionTerminada(edicion.etapa)
            ? `La votación de la edición ${anio} ya terminó${
                contexto.fechasVotacion ? ` (fue ${contexto.fechasVotacion})` : ""
              }. Los resultados están en Transparencia.`
            : `La votación de la edición ${anio} todavía no empezó${
                contexto.fechasVotacion ? ` (está prevista: ${contexto.fechasVotacion})` : ""
              }.`;
      return {
        texto: conAviso(contexto, [
          estado,
          "",
          "**Cómo se vota:**",
          "",
          ...contexto.pasosParaVotar.map((p, i) => `${i + 1}. **${p.titulo}.** ${p.texto}`),
        ]).join("\n"),
        referencias:
          edicion.etapa === "votacion"
            ? [{ titulo: "Votar", url: "/votar" }, ACERCA_DE]
            : votacionTerminada(edicion.etapa)
              ? [{ titulo: "Transparencia", url: "/transparencia" }, ACERCA_DE]
              : [ACERCA_DE],
      };
    }

    case "presentar": {
      const abierta = edicion.etapa === "ideas";
      const estado = abierta
        ? `La presentación de ideas de la edición ${anio} está abierta${hastaEl(edicion.ideasHasta, hoy)}.`
        : `La etapa de presentación de ideas de la edición ${anio} está cerrada${
            contexto.fechasIdeas ? ` (fue ${contexto.fechasIdeas})` : ""
          }.`;
      return {
        texto: conAviso(contexto, [
          estado,
          ...(contexto.comoPresentar ? ["", contexto.comoPresentar] : []),
          "",
          "Si ya presentaste una, la seguís con su número y el código de seguimiento en **Seguí tu idea**.",
        ]).join("\n"),
        referencias: abierta
          ? [{ titulo: "Presentá tu idea", url: "/ideas/nueva" }, SEGUIMIENTO]
          : [SEGUIMIENTO, ACERCA_DE],
      };
    }

    case "seguimiento": {
      const contacto = [contexto.contacto.organismo, contexto.contacto.telefono]
        .filter(Boolean)
        .join(", ");
      return {
        texto: [
          "Con el número de tu idea y el código de seguimiento que te dieron al presentarla, la consultás en **Seguí tu idea**: ahí ves en qué etapa está y, cuando la haya, la devolución del equipo técnico.",
          "",
          `Si perdiste el código, comunicate con el programa: ${contacto}.`,
        ].join("\n"),
        referencias: [SEGUIMIENTO],
      };
    }

    case "montos":
      return { texto: contexto.porQueNoHayMontos, referencias: [ACERCA_DE] };

    case "fechas": {
      const lineas = [
        contexto.momento,
        "",
        `- Presentación de ideas: ${contexto.fechasIdeas ?? "sin fechas cargadas"}`,
        `- Votación: ${contexto.fechasVotacion ?? "sin fechas cargadas"}`,
      ];
      if (contexto.cronograma.length) {
        lineas.push(
          "",
          "**Cronograma:**",
          "",
          ...contexto.cronograma.map((h) => `- ${h.titulo}: ${h.fechas}`),
        );
      }
      return { texto: conAviso(contexto, lineas).join("\n"), referencias: [ACERCA_DE] };
    }

    case "participar":
      return {
        texto: [
          ...contexto.comoFunciona.flatMap((b) => [`**${b.titulo}** ${b.texto}`, ""]),
          contexto.momento,
        ].join("\n"),
        // Los dos botones de la portada: lo que se puede hacer hoy.
        referencias: contexto.acciones.map((a) => ({ titulo: a.texto, url: a.href })),
      };
  }
}
