/**
 * Capa de consultas del sitio.
 *
 * Todas las paginas y tambien las herramientas del chatbot leen los datos desde
 * aca. Es intencional: el chatbot no tiene otra via de acceso a la informacion,
 * asi que no puede responder con datos que el sitio no muestre.
 */
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { consultar, db } from "./index";
import { distritoDePunto } from "@/lib/geo-servidor";
import {
  avances,
  categorias,
  distritos,
  ediciones,
  faq,
  hitos,
  ideas,
  novedades,
  textos,
} from "./schema";

export type EstadoIdea =
  | "borrador"
  | "pendiente"
  | "factible"
  | "no_factible"
  | "integrado"
  | "ganador";

export type IdeaVista = {
  id: number;
  slug: string;
  numero: number | null;
  titulo: string;
  barrio: string | null;
  distrito: number;
  categoriaSlug: string | null;
  categoriaNombre: string | null;
  categoriaColor: string | null;
  estado: EstadoIdea;
  ganador: boolean;
  votos: number;
  lat: number | null;
  lon: number | null;
  ubicacionAproximada: boolean;
  estadoPresupuesto: string;
  presupuestoTotal: number | null;
  problema: string | null;
  solucion: string | null;
  beneficios: string | null;
  motivoEstado: string | null;
  fecha: string | null;
  anio: number;
  publicada: boolean;
};

const camposIdea = {
  id: ideas.id,
  slug: ideas.slug,
  numero: ideas.numero,
  titulo: ideas.titulo,
  barrio: ideas.barrio,
  distrito: distritos.numero,
  categoriaSlug: categorias.slug,
  categoriaNombre: categorias.nombre,
  categoriaColor: categorias.color,
  estado: ideas.estado,
  ganador: ideas.ganador,
  votos: ideas.votos,
  lat: ideas.lat,
  lon: ideas.lon,
  ubicacionAproximada: ideas.ubicacionAproximada,
  estadoPresupuesto: ideas.estadoPresupuesto,
  presupuestoTotal: ideas.presupuestoTotal,
  problema: ideas.problema,
  solucion: ideas.solucion,
  beneficios: ideas.beneficios,
  motivoEstado: ideas.motivoEstado,
  fecha: ideas.fecha,
  anio: ediciones.anio,
  publicada: ideas.publicada,
};

type FilaIdea = {
  [K in keyof typeof camposIdea]: unknown;
};

function aVista(fila: Record<string, unknown>): IdeaVista {
  const numero = (valor: unknown) =>
    valor === null || valor === undefined ? null : Number(valor);
  return {
    id: Number(fila.id),
    slug: String(fila.slug),
    numero: numero(fila.numero),
    titulo: String(fila.titulo),
    barrio: (fila.barrio as string | null) ?? null,
    distrito: Number(fila.distrito),
    categoriaSlug: (fila.categoriaSlug as string | null) ?? null,
    categoriaNombre: (fila.categoriaNombre as string | null) ?? null,
    categoriaColor: (fila.categoriaColor as string | null) ?? null,
    estado: fila.estado as EstadoIdea,
    ganador: Boolean(fila.ganador),
    votos: Number(fila.votos ?? 0),
    lat: numero(fila.lat),
    lon: numero(fila.lon),
    ubicacionAproximada: Boolean(fila.ubicacionAproximada),
    estadoPresupuesto: String(fila.estadoPresupuesto),
    presupuestoTotal: numero(fila.presupuestoTotal),
    problema: (fila.problema as string | null) ?? null,
    solucion: (fila.solucion as string | null) ?? null,
    beneficios: (fila.beneficios as string | null) ?? null,
    motivoEstado: (fila.motivoEstado as string | null) ?? null,
    fecha: (fila.fecha as string | null) ?? null,
    anio: Number(fila.anio),
    publicada: Boolean(fila.publicada),
  };
}

// ---------------------------------------------------------------------------
// Edicion
// ---------------------------------------------------------------------------

export type Edicion = {
  id: number;
  anio: number;
  etapa: "ideas" | "evaluacion" | "votacion" | "seguimiento" | "cerrada";
  votacionDesde: string | null;
  votacionHasta: string | null;
  ideasDesde: string | null;
  ideasHasta: string | null;
};

export async function getEdicionActiva(): Promise<Edicion | null> {
  const [fila] = await db
    .select({
      id: ediciones.id,
      anio: ediciones.anio,
      etapa: ediciones.etapa,
      votacionDesde: ediciones.votacionDesde,
      votacionHasta: ediciones.votacionHasta,
      ideasDesde: ediciones.ideasDesde,
      ideasHasta: ediciones.ideasHasta,
    })
    .from(ediciones)
    .where(eq(ediciones.activa, true))
    .orderBy(desc(ediciones.anio))
    .limit(1);
  return fila ?? null;
}

export async function getEdiciones() {
  return db
    .select({ id: ediciones.id, anio: ediciones.anio, etapa: ediciones.etapa })
    .from(ediciones)
    .orderBy(desc(ediciones.anio));
}

// ---------------------------------------------------------------------------
// Distritos
// ---------------------------------------------------------------------------

export type DistritoVista = {
  numero: number;
  nombre: string;
  referencia: string | null;
  centroide: { lat: number; lon: number };
  ideas: number;
  ganador: {
    slug: string;
    titulo: string;
    votos: number;
    categoriaSlug: string | null;
    categoriaColor: string | null;
    estadoPresupuesto: string;
  } | null;
};

export async function getDistritos(edicionId: number): Promise<DistritoVista[]> {
  const filas = await consultar<{
    numero: number;
    nombre: string;
    referencia: string | null;
    centroide_lat: string;
    centroide_lon: string;
    ideas: number;
    g_slug: string | null;
    g_titulo: string | null;
    g_votos: number | null;
    g_cat_slug: string | null;
    g_cat_color: string | null;
    g_presupuesto: string | null;
  }>(sql`
    SELECT d.numero,
           d.nombre,
           d.referencia,
           d.centroide_lat,
           d.centroide_lon,
           count(i.id) FILTER (WHERE i.publicada)::int AS ideas,
           g.slug        AS g_slug,
           g.titulo      AS g_titulo,
           g.votos       AS g_votos,
           c.slug        AS g_cat_slug,
           c.color       AS g_cat_color,
           g.estado_presupuesto AS g_presupuesto
      FROM distritos d
      LEFT JOIN ideas i
             ON i.distrito_id = d.id AND i.edicion_id = ${edicionId}
      LEFT JOIN ideas g
             ON g.distrito_id = d.id AND g.edicion_id = ${edicionId}
            AND g.ganador AND g.publicada
      LEFT JOIN categorias c ON c.id = g.categoria_id
     GROUP BY d.numero, d.nombre, d.referencia, d.centroide_lat, d.centroide_lon,
              g.slug, g.titulo, g.votos, c.slug, c.color, g.estado_presupuesto
     ORDER BY d.numero
  `);

  return filas.map((f) => ({
    numero: Number(f.numero),
    nombre: f.nombre,
    referencia: f.referencia,
    centroide: { lat: Number(f.centroide_lat), lon: Number(f.centroide_lon) },
    ideas: Number(f.ideas),
    ganador: f.g_slug
      ? {
          slug: f.g_slug,
          titulo: f.g_titulo!,
          votos: Number(f.g_votos ?? 0),
          categoriaSlug: f.g_cat_slug,
          categoriaColor: f.g_cat_color,
          estadoPresupuesto: f.g_presupuesto ?? "sin_asignar",
        }
      : null,
  }));
}

export async function getDistrito(numero: number, edicionId: number) {
  const [distrito] = await db
    .select({
      numero: distritos.numero,
      nombre: distritos.nombre,
      referencia: distritos.referencia,
      centroideLat: distritos.centroideLat,
      centroideLon: distritos.centroideLon,
    })
    .from(distritos)
    .where(eq(distritos.numero, numero))
    .limit(1);
  if (!distrito) return null;

  const lista = await listarIdeas({ edicionId, distrito: numero });
  return {
    numero: distrito.numero,
    nombre: distrito.nombre,
    referencia: distrito.referencia,
    centroide: {
      lat: Number(distrito.centroideLat),
      lon: Number(distrito.centroideLon),
    },
    ideas: lista,
    ganador: lista.find((i) => i.ganador) ?? null,
  };
}

/**
 * Resuelve el distrito de un punto contra la geometria oficial. Corre en la
 * aplicacion (src/lib/geo.ts), asi que funciona igual con PGlite o Postgres.
 */
export async function distritoDeCoordenada(
  lat: number,
  lon: number,
): Promise<number | null> {
  return distritoDePunto({ lat, lon });
}

// ---------------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------------

export type FiltroIdeas = {
  edicionId: number;
  distrito?: number;
  categoria?: string;
  estado?: EstadoIdea | EstadoIdea[];
  texto?: string;
  soloGanadores?: boolean;
  limite?: number;
  incluirNoPublicadas?: boolean;
};

export async function listarIdeas(filtro: FiltroIdeas): Promise<IdeaVista[]> {
  const condiciones = [eq(ideas.edicionId, filtro.edicionId)];

  if (!filtro.incluirNoPublicadas) condiciones.push(eq(ideas.publicada, true));
  if (filtro.distrito) condiciones.push(eq(distritos.numero, filtro.distrito));
  if (filtro.categoria) condiciones.push(eq(categorias.slug, filtro.categoria));
  if (filtro.soloGanadores) condiciones.push(eq(ideas.ganador, true));
  if (filtro.estado) {
    const estados = Array.isArray(filtro.estado) ? filtro.estado : [filtro.estado];
    condiciones.push(inArray(ideas.estado, estados));
  }
  if (filtro.texto?.trim()) {
    const patron = `%${filtro.texto.trim()}%`;
    const busqueda = or(
      ilike(ideas.titulo, patron),
      ilike(ideas.barrio, patron),
      ilike(ideas.problema, patron),
      ilike(ideas.solucion, patron),
    );
    if (busqueda) condiciones.push(busqueda);
  }

  const consulta = db
    .select(camposIdea)
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .leftJoin(categorias, eq(categorias.id, ideas.categoriaId))
    .innerJoin(ediciones, eq(ediciones.id, ideas.edicionId))
    .where(and(...condiciones))
    .orderBy(desc(ideas.ganador), desc(ideas.votos), asc(distritos.numero), asc(ideas.titulo));

  const filas = await (filtro.limite ? consulta.limit(filtro.limite) : consulta);
  return filas.map((f) => aVista(f as Record<string, unknown>));
}

export async function getIdea(slug: string, edicionId?: number) {
  const condiciones = [eq(ideas.slug, slug)];
  if (edicionId) condiciones.push(eq(ideas.edicionId, edicionId));

  const [fila] = await db
    .select({ ...camposIdea, notasMigracion: ideas.notasMigracion })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .leftJoin(categorias, eq(categorias.id, ideas.categoriaId))
    .innerJoin(ediciones, eq(ediciones.id, ideas.edicionId))
    .where(and(...condiciones))
    .limit(1);

  if (!fila) return null;
  return {
    ...aVista(fila as Record<string, unknown>),
    notasMigracion: (fila.notasMigracion as string[] | null) ?? [],
  };
}

export async function getAvances(ideaId: number) {
  return db
    .select({
      id: avances.id,
      fecha: avances.fecha,
      etapa: avances.etapa,
      titulo: avances.titulo,
      descripcion: avances.descripcion,
      monto: avances.monto,
      porcentaje: avances.porcentaje,
      fotoUrl: avances.fotoUrl,
    })
    .from(avances)
    .where(and(eq(avances.ideaId, ideaId), eq(avances.publicado, true)))
    .orderBy(desc(avances.fecha));
}

// ---------------------------------------------------------------------------
// Estadisticas
// ---------------------------------------------------------------------------

export type Estadisticas = {
  anio: number;
  ideas: number;
  ganadores: number;
  votos: number;
  distritos: number;
  distritosSinGanador: number[];
  porEstado: Record<string, number>;
  porCategoria: Array<{
    slug: string;
    nombre: string;
    color: string;
    ideas: number;
    ganadores: number;
  }>;
  porEtapaPresupuesto: Record<string, number>;
  presupuestoPublicado: number;
};

export async function getEstadisticas(edicion: Edicion): Promise<Estadisticas> {
  const [totales] = await consultar<{
    ideas: number;
    ganadores: number;
    votos: number;
    presupuesto: string | null;
  }>(sql`
    SELECT count(*)::int AS ideas,
           count(*) FILTER (WHERE ganador)::int AS ganadores,
           coalesce(sum(votos) FILTER (WHERE ganador), 0)::int AS votos,
           sum(presupuesto_total) FILTER (WHERE ganador) AS presupuesto
      FROM ideas
     WHERE edicion_id = ${edicion.id} AND publicada
  `);

  const estados = await consultar<{ estado: string; cantidad: number }>(sql`
    SELECT estado, count(*)::int AS cantidad
      FROM ideas
     WHERE edicion_id = ${edicion.id} AND publicada
     GROUP BY estado
  `);

  const cats = await consultar<{ slug: string; nombre: string; color: string; ideas: number; ganadores: number }>(sql`
    SELECT c.slug, c.nombre, c.color,
           count(i.id)::int AS ideas,
           count(i.id) FILTER (WHERE i.ganador)::int AS ganadores
      FROM categorias c
      LEFT JOIN ideas i
             ON i.categoria_id = c.id AND i.edicion_id = ${edicion.id} AND i.publicada
     GROUP BY c.slug, c.nombre, c.color, c.orden
     ORDER BY c.orden
  `);

  const etapas = await consultar<{ etapa: string; cantidad: number }>(sql`
    SELECT estado_presupuesto AS etapa, count(*)::int AS cantidad
      FROM ideas
     WHERE edicion_id = ${edicion.id} AND ganador AND publicada
     GROUP BY estado_presupuesto
  `);

  const sinGanador = await consultar<{ numero: number }>(sql`
    SELECT d.numero
      FROM distritos d
     WHERE NOT EXISTS (
       SELECT 1 FROM ideas i
        WHERE i.distrito_id = d.id AND i.edicion_id = ${edicion.id}
          AND i.ganador AND i.publicada
     )
     ORDER BY d.numero
  `);

  return {
    anio: edicion.anio,
    ideas: Number(totales.ideas),
    ganadores: Number(totales.ganadores),
    votos: Number(totales.votos),
    distritos: 20,
    distritosSinGanador: sinGanador.map((f) => Number(f.numero)),
    porEstado: Object.fromEntries(estados.map((e) => [e.estado, Number(e.cantidad)])),
    porCategoria: cats.map((c) => ({ ...c, ideas: Number(c.ideas), ganadores: Number(c.ganadores) })),
    porEtapaPresupuesto: Object.fromEntries(etapas.map((e) => [e.etapa, Number(e.cantidad)])),
    presupuestoPublicado: Number(totales.presupuesto ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Contenido editable
// ---------------------------------------------------------------------------

export async function getTextos(): Promise<Record<string, string>> {
  const filas = await db.select().from(textos);
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}

export async function getFaq() {
  return db
    .select({ id: faq.id, pregunta: faq.pregunta, respuesta: faq.respuesta })
    .from(faq)
    .where(eq(faq.publicada, true))
    .orderBy(asc(faq.orden));
}

export async function getHitos(edicionId: number) {
  return db
    .select({
      id: hitos.id,
      titulo: hitos.titulo,
      detalle: hitos.detalle,
      desde: hitos.desde,
      hasta: hitos.hasta,
      etapa: hitos.etapa,
    })
    .from(hitos)
    .where(eq(hitos.edicionId, edicionId))
    .orderBy(asc(hitos.orden));
}

export async function getNovedades(limite = 4) {
  return db
    .select({
      id: novedades.id,
      slug: novedades.slug,
      titulo: novedades.titulo,
      copete: novedades.copete,
      fecha: novedades.fecha,
      distritoId: novedades.distritoId,
      imagenUrl: novedades.imagenUrl,
    })
    .from(novedades)
    .where(eq(novedades.publicada, true))
    .orderBy(desc(novedades.fecha))
    .limit(limite);
}

export async function getCategorias() {
  return db
    .select({
      slug: categorias.slug,
      nombre: categorias.nombre,
      descripcion: categorias.descripcion,
      color: categorias.color,
    })
    .from(categorias)
    .orderBy(asc(categorias.orden));
}

/** Cuenta de votos reales registrados por el sitio nuevo, para la etapa de votacion. */
export async function getVotosRegistrados(edicionId: number) {
  const [fila] = await consultar<{ total: number }>(sql`
    SELECT count(*)::int AS total FROM votos WHERE edicion_id = ${edicionId}
  `);
  return Number(fila?.total ?? 0);
}

