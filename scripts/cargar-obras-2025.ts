/**
 * Carga el estado de las obras de los ganadores 2025, tal como lo informo el
 * municipio en octubre de 2026, y el ganador del distrito 10 que faltaba.
 *
 *   npm run cargar-obras-2025                  muestra lo que haria, no escribe
 *   npm run cargar-obras-2025 -- --confirmar   escribe en la base local
 *
 * Contra una base remota pasa por el candado de scripts/produccion.ts: hace
 * falta ademas `--produccion`, y no se corre sin un pedido explicito.
 *
 * QUE CARGA
 *
 *  - El ganador del distrito 10, "Revalorización y renovación de la Plaza
 *    Urquiza". No estaba en el sistema anterior: surgio de una consulta
 *    ciudadana y despues se sumo al Presupuesto Participativo. Va SIN VOTOS
 *    (votos = 0): no hay un numero de votos registrado, y uno inventado se
 *    publicaria en /transparencia y en los datos abiertos como si fuera real.
 *    Si aparece el numero, se corrige en la base. Lleva una nota en
 *    `notas_migracion` que dice de donde salio.
 *  - Un avance por obra informada, con la nota de prensa del municipio como
 *    link: nueve en licitacion (con la fecha de la nota, el presupuesto
 *    oficial y el plazo) y la Plaza Urquiza en obra. Las otras diez quedan sin
 *    avances, y su tarjeta dice "Sin información todavía".
 *
 * Es idempotente: el ganador del distrito 10 se crea solo si el distrito no
 * tiene uno, y un avance no se carga dos veces (mismo proyecto y mismo link).
 * Los datos salen de las notas que paso el equipo el 29/10/2026; ninguna
 * confirma una adjudicacion, asi que ninguna obra se carga como adjudicada.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { avances, bitacoraSistema, categorias, distritos, ediciones, ideas } from "../src/db/schema";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

const AUTOR = "Script cargar-obras-2025";
const NOTAS = "https://comunicacionsmt.gob.ar/contenido";

const URQUIZA = {
  slug: "revalorizacion-y-renovacion-de-la-plaza-urquiza",
  titulo: "Revalorización y renovación de la Plaza Urquiza",
  distrito: 10,
  categoriaSlug: "socio-ambiental",
  solucion:
    "Renovación integral de la Plaza Urquiza: nuevas caminerías, pérgolas, sistemas de riego, drenaje e iluminación, un sector canil, un espacio para skate, juegos infantiles y la restauración de sus esculturas.",
  nota:
    "Cargado en octubre de 2026: no estaba en el sistema anterior. El proyecto surgió de una consulta ciudadana y se incorporó al Presupuesto Participativo; no tiene votos registrados en este sistema.",
};

type AvanceACargar = {
  slug: string;
  etapa: "licitacion" | "ejecucion";
  fecha: string;
  descripcion: string;
  enlace: string;
};

const AVANCES: AvanceACargar[] = [
  {
    slug: "puesta-en-valor-de-la-gruta-de-la-virgen-del-rosario-de-san-nicolas",
    etapa: "licitacion",
    fecha: "2026-10-16",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $237.780.853,33. Plazo de obra: tres meses.",
    enlace: `${NOTAS}/17359/presupuesto-participativo-licitan-el-proyecto-de-puesta-en-valor-de-la-gruta-de-`,
  },
  {
    slug: "puesta-en-valor-plaza-democracia-barrio-casino-zenon-santillan",
    etapa: "licitacion",
    fecha: "2026-10-20",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $263.239.466,60. Plazo de obra: tres meses.",
    enlace: `${NOTAS}/17433/presupuesto-participativo-licitan-el-proyecto-de-puesta-en-valor-de-la-plaza-dem`,
  },
  {
    slug: "playon-deportivo-para-plaza-lozano-munoz-en-b-echeverria",
    etapa: "licitacion",
    fecha: "2026-10-22",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $260.402.522,16. Plazo de obra: tres meses.",
    enlace: `${NOTAS}/17473/presupuesto-participativo-licitan-el-proyecto-de-construccion-de-un-playon-depor`,
  },
  {
    slug: "puesta-en-valor-plaza-curva-barrio-juan-pablo-ii",
    etapa: "licitacion",
    fecha: "2026-10-16",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $111.872.656,40. Plazo de obra: tres meses.",
    enlace: `${NOTAS}/17362/presupuesto-participativo-licitan-obras-de-puesta-en-valor-de-la-plaza-curva-del`,
  },
  {
    slug: "recuperacion-integral-del-complejo-general-munoz-villa-9-de-julio",
    etapa: "licitacion",
    fecha: "2026-10-26",
    descripcion:
      "Se abrieron los sobres de la licitación de la primera etapa. Presupuesto oficial: $238.720.890,80. Plazo de obra: 90 días.",
    enlace: `${NOTAS}/17533/presupuesto-participativo-licitan-la-primera-etapa-de-obras-de-recuperacion-inte`,
  },
  {
    slug: "plaza-activa-b-sitravi",
    etapa: "licitacion",
    fecha: "2026-10-20",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $264.615.099,56. Plazo de obra: tres meses.",
    enlace: `${NOTAS}/17429/presupuesto-participativo-licitan-las-obras-de-puesta-en-valor-de-la-plaza-activ`,
  },
  {
    slug: "playon-deportivo-comunitario-plaza-viluco",
    etapa: "licitacion",
    fecha: "2026-10-28",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $261.922.047,31. Plazo de obra: tres meses.",
    enlace: `${NOTAS}/17580/presupuesto-participativo-licitan-el-proyecto-de-creacion-de-un-playon-deportivo`,
  },
  {
    slug: "centro-cultural-y-comunitario-diza",
    etapa: "licitacion",
    fecha: "2026-10-22",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $259.457.528,63. Plazo de obra: seis meses.",
    enlace: `${NOTAS}/17472/presupuesto-participativo-licitan-obras-de-construccion-de-un-centro-cultural-y-`,
  },
  {
    slug: "espacio-deportivo-comunitario-en-plaza-de-chanaritos",
    etapa: "licitacion",
    fecha: "2026-10-26",
    descripcion:
      "Se abrieron los sobres de la licitación. Presupuesto oficial: $103.467.181,61. Plazo de obra: dos meses.",
    enlace: `${NOTAS}/17532/presupuesto-participativo-licitan-la-creacion-de-un-espacio-deportivo-comunitari`,
  },
  {
    slug: URQUIZA.slug,
    etapa: "ejecucion",
    fecha: "2026-10-28",
    descripcion:
      "La obra empezó el 19 de agosto de 2026 y lleva cerca de un 20% de avance, con demoras por las lluvias. Se prevé terminarla en marzo de 2027.",
    enlace: `${NOTAS}/17581/la-intendente-chahla-superviso-las-obras-de-renovacion-de-plaza-urquiza-donde-av`,
  },
];

const ETIQUETA: Record<AvanceACargar["etapa"], string> = {
  licitacion: "En licitación",
  ejecucion: "En obra",
};

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));
  const confirmar = argumentos.includes("--confirmar");
  const destino = confirmar
    ? (await exigirPermisoDeEscritura("npm run cargar-obras-2025 -- --confirmar")).destino
    : destinoDeLaBase(process.env.DATABASE_URL);
  console.log(`Base: ${destino.descripcion}${confirmar ? "" : " (sin --confirmar: no escribe)"}\n`);

  const [edicion] = await db
    .select({ id: ediciones.id })
    .from(ediciones)
    .where(eq(ediciones.anio, 2025))
    .limit(1);
  if (!edicion) throw new Error("No hay edición 2025 en la base.");

  await db.transaction(async (tx) => {
    // --- El ganador del distrito 10 ------------------------------------------
    const [distrito] = await tx
      .select({ id: distritos.id })
      .from(distritos)
      .where(eq(distritos.numero, URQUIZA.distrito))
      .limit(1);
    if (!distrito) throw new Error("No existe el distrito 10.");

    const [ganadorDel10] = await tx
      .select({ id: ideas.id, slug: ideas.slug })
      .from(ideas)
      .where(
        and(eq(ideas.edicionId, edicion.id), eq(ideas.distritoId, distrito.id), eq(ideas.ganador, true)),
      )
      .limit(1);

    if (ganadorDel10 && ganadorDel10.slug !== URQUIZA.slug) {
      throw new Error(
        `El distrito 10 ya tiene otro ganador en 2025 (${ganadorDel10.slug}). No se toca nada: revisalo a mano.`,
      );
    }
    if (ganadorDel10) {
      console.log(`Distrito 10: ya está cargado (${URQUIZA.titulo}).`);
    } else {
      console.log(`Distrito 10: se crea "${URQUIZA.titulo}", ganador, publicado, sin votos.`);
      if (confirmar) {
        const [categoria] = await tx
          .select({ id: categorias.id })
          .from(categorias)
          .where(eq(categorias.slug, URQUIZA.categoriaSlug))
          .limit(1);
        const [{ siguiente }] = await tx
          .select({ siguiente: sql<number>`coalesce(max(${ideas.numero}), 0) + 1` })
          .from(ideas)
          .where(eq(ideas.edicionId, edicion.id));
        await tx.insert(ideas).values({
          edicionId: edicion.id,
          distritoId: distrito.id,
          categoriaId: categoria?.id ?? null,
          numero: Number(siguiente),
          titulo: URQUIZA.titulo,
          slug: URQUIZA.slug,
          solucion: URQUIZA.solucion,
          estado: "ganador",
          ganador: true,
          votos: 0,
          canal: "municipio",
          canalDetalle: "Consulta ciudadana incorporada al Presupuesto Participativo",
          cargadoPor: AUTOR,
          notasMigracion: [URQUIZA.nota],
          publicada: true,
        });
      }
    }

    // --- Los avances ------------------------------------------------------------
    for (const avance of AVANCES) {
      const [idea] = await tx
        .select({ id: ideas.id, titulo: ideas.titulo, ganador: ideas.ganador })
        .from(ideas)
        .where(and(eq(ideas.edicionId, edicion.id), eq(ideas.slug, avance.slug)))
        .limit(1);
      if (!idea) {
        // Solo pasa con el del distrito 10 sin --confirmar: todavia no existe.
        console.log(`  ${ETIQUETA[avance.etapa]} · ${avance.slug}: se carga junto con el proyecto.`);
        continue;
      }
      if (!idea.ganador) throw new Error(`${avance.slug} no es ganador.`);

      const [repetido] = await tx
        .select({ id: avances.id })
        .from(avances)
        .where(and(eq(avances.ideaId, idea.id), eq(avances.enlace, avance.enlace)))
        .limit(1);
      if (repetido) {
        console.log(`  ya estaba · ${idea.titulo}`);
        continue;
      }
      console.log(`  ${ETIQUETA[avance.etapa]} desde ${avance.fecha} · ${idea.titulo}`);
      if (!confirmar) continue;

      const [creado] = await tx
        .insert(avances)
        .values({
          ideaId: idea.id,
          fecha: avance.fecha,
          etapa: avance.etapa,
          titulo: ETIQUETA[avance.etapa],
          descripcion: avance.descripcion,
          enlace: avance.enlace,
        })
        .returning({ id: avances.id });
      await tx
        .update(ideas)
        .set({ estadoPresupuesto: avance.etapa, updatedAt: new Date() })
        .where(eq(ideas.id, idea.id));
      await tx.insert(bitacoraSistema).values({
        adminId: null,
        adminNombre: AUTOR,
        accion: "avance_creado",
        entidad: "avance",
        entidadId: creado.id,
        entidadEtiqueta: `${ETIQUETA[avance.etapa]} — ${idea.titulo}`,
        valorAnterior: null,
        valorNuevo: `${ETIQUETA[avance.etapa]} desde ${avance.fecha} · ${avance.descripcion} · ${avance.enlace}`,
      });
    }
  });

  console.log(confirmar ? "\nListo." : "\nNo se escribió nada. Para cargarlo: --confirmar.");
  process.exit(0);
}

main().catch((causa) => {
  console.error(causa instanceof Error ? causa.message : causa);
  process.exit(1);
});
