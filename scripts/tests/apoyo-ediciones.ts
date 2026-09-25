/**
 * El escenario de las pruebas de ediciones anteriores (ediciones-anteriores y
 * chat-ediciones): el que viene cuando se active la 2026.
 *
 *  - 2026 ACTIVA y recien abierta: etapa "ideas", sin ganadores.
 *  - 2025 terminada ("seguimiento"), con dos ganadores: son las obras que se
 *    estan ejecutando. Uno tiene un avance de obra informado; el otro, ninguno.
 *  - 2027 preparada de antemano, sin ninguna idea: no tiene nada para ver.
 *
 * Y los casos dificiles: un slug que se repite entre la 2025 y la 2026, y otro
 * que en la 2026 esta sin publicar mientras en la 2025 esta publicado.
 *
 * Cada archivo de prueba lo carga en su propia PGlite (ver apoyo-base.ts).
 */
import { cargarMinimo, crearIdea, type BaseDePrueba } from "./apoyo-base";

export async function cargarDosEdiciones(base: BaseDePrueba) {
  const { db, schema, sql } = base;
  const { edicionId: id2026 } = await cargarMinimo(base, { etapa: "ideas" });

  // El distrito 5, para las ideas de Villa Urquiza (cargarMinimo trae el 1 y el 2).
  await db.insert(schema.distritos).values({
    id: 5,
    numero: 5,
    nombre: "Distrito 5",
    geojson: { type: "MultiPolygon", coordinates: [] },
    centroideLat: "-26.8",
    centroideLon: "-65.2",
  });

  const [edicion2025] = await db
    .insert(schema.ediciones)
    .values({ anio: 2025, etapa: "seguimiento", activa: false })
    .returning({ id: schema.ediciones.id });
  const id2025 = edicion2025.id;
  await db.insert(schema.ediciones).values({ anio: 2027, etapa: "ideas", activa: false });

  // --- 2025: terminada, con dos ganadores ----------------------------------
  const plaza2025 = await crearIdea(base, {
    edicionId: id2025,
    distrito: 1,
    titulo: "Plaza del barrio",
    slug: "plaza-del-barrio",
    estado: "ganador",
    ganador: true,
    votos: 300,
  });
  await crearIdea(base, {
    edicionId: id2025,
    distrito: 2,
    titulo: "Solo en la 2025",
    slug: "solo-en-2025",
    estado: "ganador",
    ganador: true,
    votos: 120,
  });
  await crearIdea(base, {
    edicionId: id2025,
    distrito: 2,
    titulo: "Sin publicar en la 2025",
    slug: "sin-publicar-2025",
    estado: "factible",
    publicada: false,
  });
  const urquiza2025 = await crearIdea(base, {
    edicionId: id2025,
    distrito: 5,
    titulo: "Club de Villa Urquiza",
    slug: "club-villa-urquiza",
    estado: "factible",
  });

  // La obra de la plaza tiene un avance informado; la otra, ninguno.
  await db
    .update(schema.ideas)
    .set({ estadoPresupuesto: "ejecucion" })
    .where(sql`${schema.ideas.id} = ${plaza2025}`);
  await db.insert(schema.avances).values({
    ideaId: plaza2025,
    fecha: "2026-08-01",
    etapa: "ejecucion",
    titulo: "Empezo la obra",
  });

  // --- 2026: recien abierta ------------------------------------------------
  // Mismo slug que un ganador de 2025: el slug es unico por edicion, no global.
  await crearIdea(base, {
    edicionId: id2026,
    distrito: 1,
    titulo: "Plaza del barrio",
    slug: "plaza-del-barrio",
    estado: "pendiente",
  });
  // Sin publicar en la activa, con el slug de un ganador 2025.
  await crearIdea(base, {
    edicionId: id2026,
    distrito: 2,
    titulo: "Solo en la 2025, pero en moderacion en la 2026",
    slug: "solo-en-2025",
    estado: "pendiente",
    publicada: false,
  });
  const urquiza2026 = await crearIdea(base, {
    edicionId: id2026,
    distrito: 5,
    titulo: "Veredas en Villa Urquiza",
    slug: "veredas-villa-urquiza",
    estado: "pendiente",
  });

  return { id2025, id2026, ideas: { plaza2025, urquiza2025, urquiza2026 } };
}
