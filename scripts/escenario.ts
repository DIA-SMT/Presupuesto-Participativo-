/**
 * Pone la base LOCAL en un momento del proceso, para ver como se ve el sitio en
 * cada etapa (y para mostrarlo en una demo) sin tocar produccion.
 *
 *   npx tsx scripts/escenario.ts              -> muestra las ediciones y su etapa
 *   npx tsx scripts/escenario.ts <etapa>      -> la 2026 activa en <etapa>, con ideas de ejemplo
 *   npx tsx scripts/escenario.ts 2025         -> vuelve a como deja el seed: la 2025 activa
 *
 * Etapas: ideas, evaluacion, votacion, seguimiento, cerrada. En todas, la 2025
 * queda terminada ("seguimiento") y sin activar: es el caso real del
 * lanzamiento, con los 19 ganadores 2025 en obra y una edicion nueva abierta.
 *
 * Las ideas de ejemplo son copias de ideas 2025 (titulos, textos y ubicaciones
 * reales, asi las pantallas se ven con contenido de verdad) en la edicion 2026,
 * con un estado acorde a la etapa:
 *   ideas        12, sin evaluar (8 publicadas, 4 todavia sin publicar)
 *   evaluacion   16: factibles, no factibles con su devolucion, y sin evaluar
 *   votacion     20 factibles publicadas, dos por distrito, sin votos
 *   seguimiento  las mismas 20 con votos y un ganador por distrito
 *   cerrada      igual que seguimiento
 * Se reconocen por el slug (terminan en "--ejemplo") y por cargado_por, y cada
 * corrida borra las de la anterior antes de cargar las suyas.
 *
 * SOLO BASE LOCAL, sin excepcion y sin flag que lo habilite: reactiva y
 * desactiva ediciones, y en una base real eso cambia lo que ve todo el sitio.
 * No deja fila en las bitacoras: es un andamio de desarrollo, no una accion
 * del equipo. En produccion la etapa se cambia desde /admin/ediciones.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { sql } from "drizzle-orm";
import { consultar } from "../src/db";
import { normalizar } from "../src/lib/texto";
import { destinoDeLaBase } from "./produccion";

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;
type Etapa = (typeof ETAPAS)[number];

const MARCA_SLUG = "--ejemplo";
const CARGADO_POR = "escenario de ejemplo (scripts/escenario.ts)";

/** Las fechas de la 2026 de ejemplo: plausibles, no oficiales. */
const FECHAS_2026 = {
  ideasDesde: "2026-10-01",
  ideasHasta: "2026-11-15",
  votacionDesde: "2026-12-02",
  votacionHasta: "2026-12-04",
};

type Plantilla = {
  titulo: string;
  slug: string;
  distrito: number;
  categoria: number | null;
  barrio: string | null;
  problema: string | null;
  solucion: string | null;
  beneficios: string | null;
  lat: string | null;
  lon: string | null;
};

type Estado = "pendiente" | "factible" | "no_factible";
type Fila = { plantilla: Plantilla; estado: Estado; publicada: boolean; votos: number; ganador: boolean };

/**
 * Que ideas de ejemplo lleva cada etapa. Determinista a proposito: la misma
 * etapa da siempre las mismas ideas y los mismos votos, asi dos capturas de la
 * misma pantalla se pueden comparar.
 */
export function ideasDeEjemplo(etapa: Etapa, plantillas: Plantilla[]): Fila[] {
  // Dos por distrito, en el orden en que llegan (las ganadoras 2025 primero,
  // que son las que tienen el texto completo).
  const porDistrito = new Map<number, Plantilla[]>();
  for (const p of plantillas) {
    const lista = porDistrito.get(p.distrito) ?? [];
    if (lista.length < 2) porDistrito.set(p.distrito, [...lista, p]);
  }
  const pares = [...porDistrito.values()].flat();

  if (etapa === "ideas") {
    return pares.slice(0, 12).map((plantilla, i) => ({
      plantilla, estado: "pendiente", publicada: i < 8, votos: 0, ganador: false,
    }));
  }
  if (etapa === "evaluacion") {
    return pares.slice(0, 16).map((plantilla, i) => ({
      plantilla,
      estado: i % 3 === 0 ? "factible" : i % 3 === 1 ? "pendiente" : "no_factible",
      publicada: true,
      votos: 0,
      ganador: false,
    }));
  }
  const votables = pares.slice(0, 20);
  if (etapa === "votacion") {
    return votables.map((plantilla) => ({ plantilla, estado: "factible", publicada: true, votos: 0, ganador: false }));
  }
  // seguimiento y cerrada: votos y el primero de cada distrito gana.
  const vistos = new Set<number>();
  return votables.map((plantilla, i) => {
    const gana = !vistos.has(plantilla.distrito);
    vistos.add(plantilla.distrito);
    return { plantilla, estado: "factible", publicada: true, votos: gana ? 140 + i * 7 : 60 + i * 3, ganador: gana };
  });
}

async function mostrar() {
  const ediciones = await consultar<{ anio: number; etapa: string; activa: boolean; ideas: number; ejemplo: number }>(sql`
    SELECT e.anio, e.etapa, e.activa,
           (SELECT count(*) FROM ideas i WHERE i.edicion_id = e.id)::int AS ideas,
           (SELECT count(*) FROM ideas i WHERE i.edicion_id = e.id AND i.slug LIKE ${`%${MARCA_SLUG}`})::int AS ejemplo
      FROM ediciones e ORDER BY e.anio`);
  for (const e of ediciones) {
    console.log(`  ${e.anio}  ${e.etapa.padEnd(12)} ${e.activa ? "ACTIVA" : "      "}  ${e.ideas} idea(s)` +
      (e.ejemplo ? `, ${e.ejemplo} de ejemplo` : ""));
  }
}

async function borrarEjemplos() {
  await consultar(sql`DELETE FROM votos WHERE idea_id IN (SELECT id FROM ideas WHERE slug LIKE ${`%${MARCA_SLUG}`})`);
  await consultar(sql`DELETE FROM ideas WHERE slug LIKE ${`%${MARCA_SLUG}`}`);
}

async function activar(anio: number) {
  // Primero se desactivan todas: el indice parcial no admite dos activas.
  await consultar(sql`UPDATE ediciones SET activa = false WHERE activa AND anio <> ${anio}`);
  await consultar(sql`UPDATE ediciones SET activa = true WHERE anio = ${anio}`);
}

async function escenario2026(etapa: Etapa) {
  await borrarEjemplos();
  await consultar(sql`
    INSERT INTO ediciones (anio, etapa, activa, ideas_desde, ideas_hasta, votacion_desde, votacion_hasta)
    VALUES (2026, ${etapa}, false, ${FECHAS_2026.ideasDesde}, ${FECHAS_2026.ideasHasta},
            ${FECHAS_2026.votacionDesde}, ${FECHAS_2026.votacionHasta})
    ON CONFLICT (anio) DO UPDATE SET etapa = EXCLUDED.etapa`);
  await consultar(sql`UPDATE ediciones SET etapa = 'seguimiento' WHERE anio = 2025`);
  await activar(2026);

  const [edicion] = await consultar<{ id: number }>(sql`SELECT id FROM ediciones WHERE anio = 2026`);
  const plantillas = await consultar<Plantilla>(sql`
    SELECT i.titulo, i.slug, i.distrito_id AS distrito, i.categoria_id AS categoria, i.barrio,
           i.problema, i.solucion, i.beneficios, i.lat::text AS lat, i.lon::text AS lon
      FROM ideas i JOIN ediciones e ON e.id = i.edicion_id
     WHERE e.anio = 2025 AND i.publicada AND i.distrito_id IS NOT NULL AND i.integrada_en_id IS NULL
     ORDER BY i.ganador DESC, (i.solucion IS NOT NULL) DESC, i.distrito_id, i.numero`);

  const filas = ideasDeEjemplo(etapa, plantillas);
  let numero = 0;
  for (const { plantilla: p, estado, publicada, votos, ganador } of filas) {
    numero += 1;
    await consultar(sql`
      INSERT INTO ideas (edicion_id, distrito_id, categoria_id, numero, titulo, slug, barrio, barrio_normalizado,
                         problema, solucion, beneficios, lat, lon, estado, motivo_estado, votos, ganador,
                         publicada, canal, cargado_por, fecha)
      VALUES (${edicion.id}, ${p.distrito}, ${p.categoria}, ${numero}, ${p.titulo},
              ${`${p.slug.slice(0, 160)}${MARCA_SLUG}`}, ${p.barrio}, ${p.barrio ? normalizar(p.barrio) : null},
              ${p.problema}, ${p.solucion}, ${p.beneficios}, ${p.lat}::numeric, ${p.lon}::numeric,
              ${estado},
              ${estado === "no_factible"
                ? "Idea de ejemplo: la evaluación técnica determinó que no puede ejecutarse como está presentada."
                : null},
              ${votos}, ${ganador}, ${publicada}, 'web', ${CARGADO_POR}, ${FECHAS_2026.ideasDesde})`);
  }
  console.log(`Edicion 2026 activa en "${etapa}", con ${filas.length} idea(s) de ejemplo.`);
}

async function volverA2025() {
  await borrarEjemplos();
  await consultar(sql`UPDATE ediciones SET etapa = 'seguimiento' WHERE anio = 2025`);
  await activar(2025);
  console.log("La 2025 volvio a ser la activa (en seguimiento) y se borraron las ideas de ejemplo.");
}

async function main() {
  const destino = destinoDeLaBase(process.env.DATABASE_URL);
  console.log(`Base: ${destino.descripcion}`);
  const pedido = process.argv[2];
  if (!pedido) {
    await mostrar();
    console.log(`\nUso: npx tsx scripts/escenario.ts <${ETAPAS.join("|")}|2025>`);
    return;
  }
  if (destino.tipo !== "pglite" && destino.tipo !== "postgres-local") {
    console.error("\nNO SE ESCRIBIO NADA: este script es solo para una base local, y esta no lo es.\n" +
      "En produccion la etapa se cambia desde /admin/ediciones.\n");
    process.exit(1);
  }
  if (pedido === "2025") await volverA2025();
  else if ((ETAPAS as readonly string[]).includes(pedido)) await escenario2026(pedido as Etapa);
  else {
    console.error(`\nNo entiendo "${pedido}". Opciones: ${ETAPAS.join(", ")} o 2025.\n`);
    process.exit(1);
  }
  await mostrar();
}

// Solo corre como comando: la prueba importa `ideasDeEjemplo` sin tocar la base.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/escenario.ts")) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("FALLO:", e?.message ?? e);
      process.exit(1);
    });
}
