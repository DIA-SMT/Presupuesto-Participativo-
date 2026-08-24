/**
 * Capa de consultas del sitio.
 *
 * Todas las paginas y tambien las herramientas del chatbot leen los datos desde
 * aca. Es intencional: el chatbot no tiene otra via de acceso a la informacion,
 * asi que no puede responder con datos que el sitio no muestre.
 */
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  like,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import { consultar, db } from "./index";
import { distritoDePunto } from "@/lib/geo-servidor";
import { hashearDni } from "@/lib/empadronamiento";
import { normalizar } from "@/lib/texto";
import {
  admins,
  avances,
  bitacoraEquipo,
  categorias,
  distritos,
  ediciones,
  faq,
  hitos,
  ideas,
  novedades,
  revisiones,
  textos,
  votantes,
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

export type EtapaEdicion = Edicion["etapa"];

export type EdicionListada = {
  id: number;
  anio: number;
  etapa: EtapaEdicion;
  activa: boolean;
  presupuestoTotal: number | null;
  ideasDesde: string | null;
  ideasHasta: string | null;
  votacionDesde: string | null;
  votacionHasta: string | null;
  /** Todas las ideas de la edicion, publicadas o no. */
  ideas: number;
  /** Votos emitidos por este sitio (filas de la tabla `votos`). */
  votos: number;
};

export async function getEdiciones(): Promise<EdicionListada[]> {
  const filas = await consultar<{
    id: number;
    anio: number;
    etapa: EtapaEdicion;
    activa: boolean;
    presupuesto_total: string | null;
    ideas_desde: string | null;
    ideas_hasta: string | null;
    votacion_desde: string | null;
    votacion_hasta: string | null;
    ideas: number;
    votos: number;
  }>(sql`
    SELECT e.id,
           e.anio,
           e.etapa,
           e.activa,
           e.presupuesto_total,
           e.ideas_desde::text     AS ideas_desde,
           e.ideas_hasta::text     AS ideas_hasta,
           e.votacion_desde::text  AS votacion_desde,
           e.votacion_hasta::text  AS votacion_hasta,
           (SELECT count(*) FROM ideas i WHERE i.edicion_id = e.id)::int AS ideas,
           (SELECT count(*) FROM votos v WHERE v.edicion_id = e.id)::int AS votos
      FROM ediciones e
     ORDER BY e.anio DESC
  `);

  return filas.map((f) => ({
    id: Number(f.id),
    anio: Number(f.anio),
    etapa: f.etapa,
    activa: Boolean(f.activa),
    presupuestoTotal: f.presupuesto_total === null ? null : Number(f.presupuesto_total),
    ideasDesde: f.ideas_desde,
    ideasHasta: f.ideas_hasta,
    votacionDesde: f.votacion_desde,
    votacionHasta: f.votacion_hasta,
    ideas: Number(f.ideas),
    votos: Number(f.votos),
  }));
}

export type EdicionCompleta = {
  id: number;
  anio: number;
  etapa: EtapaEdicion;
  activa: boolean;
  presupuestoTotal: number | null;
  ideasDesde: string | null;
  ideasHasta: string | null;
  votacionDesde: string | null;
  votacionHasta: string | null;
};

export async function getEdicion(id: number): Promise<EdicionCompleta | null> {
  const [fila] = await db
    .select({
      id: ediciones.id,
      anio: ediciones.anio,
      etapa: ediciones.etapa,
      activa: ediciones.activa,
      presupuestoTotal: ediciones.presupuestoTotal,
      ideasDesde: ediciones.ideasDesde,
      ideasHasta: ediciones.ideasHasta,
      votacionDesde: ediciones.votacionDesde,
      votacionHasta: ediciones.votacionHasta,
    })
    .from(ediciones)
    .where(eq(ediciones.id, id))
    .limit(1);

  if (!fila) return null;
  return {
    ...fila,
    presupuestoTotal: fila.presupuestoTotal === null ? null : Number(fila.presupuestoTotal),
  };
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

export async function getIdea(
  slug: string,
  filtro: { edicionId?: number; incluirNoPublicadas?: boolean } = {},
) {
  const condiciones = [eq(ideas.slug, slug)];
  if (filtro.edicionId) condiciones.push(eq(ideas.edicionId, filtro.edicionId));
  // Mismo criterio que listarIdeas: una idea sin publicar no existe para el
  // sitio ni para el chatbot. Sin este filtro, una idea recien enviada por el
  // formulario publico ya era visible en /proyectos/<slug>. El backoffice pide
  // incluirNoPublicadas de forma explicita.
  if (!filtro.incluirNoPublicadas) condiciones.push(eq(ideas.publicada, true));

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
      orden: hitos.orden,
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

// ---------------------------------------------------------------------------
// Bandeja de revision (backoffice)
//
// Las consultas de esta seccion son las unicas que ven ideas sin publicar. Dos
// reglas que valen para todas: el mail del autor no se devuelve nunca (solo
// `tieneContacto`) y el DNI, el `dni_hash` y el `proveedor_sub` del padron no
// salen de la base.
// ---------------------------------------------------------------------------

/**
 * Ordenes que la bandeja acepta. Es una LISTA BLANCA: el valor que llega por
 * querystring se busca aca (ver `ordenBandeja`) y nunca se interpola dentro del
 * tag `sql`, asi que no hay forma de ordenar por algo que no este en `ORDENES`.
 */
export const ORDENES_BANDEJA = [
  "prioridad",
  "reciente",
  "antigua",
  "votos",
  "distrito",
  "estado",
] as const;

export type OrdenBandeja = (typeof ORDENES_BANDEJA)[number];

export type DireccionOrden = "asc" | "desc";

export type FiltroBandeja = {
  edicionId: number;
  estado?: EstadoIdea | EstadoIdea[];
  distrito?: number;
  texto?: string;
  /**
   * Solo los "no" sin devolucion escrita (`no_factible` o `integrado` con
   * `motivo_estado` vacio): la deuda del equipo con el vecino.
   */
  sinDevolucion?: boolean;
  /** Por defecto "prioridad": primero lo que necesita trabajo del equipo. */
  orden?: OrdenBandeja;
  /** Sin esto, cada orden usa su direccion natural (ver `ORDENES`). */
  dir?: DireccionOrden;
  limite?: number;
  /** Filas a saltear (OFFSET). Va con `limite` para paginar. */
  desplazamiento?: number;
};

/**
 * Valida contra la lista blanca el orden que llega por querystring. Lo que no
 * este en la lista cae al orden de trabajo por defecto.
 */
export function ordenBandeja(valor: string | null | undefined): OrdenBandeja {
  return ORDENES_BANDEJA.includes(valor as OrdenBandeja)
    ? (valor as OrdenBandeja)
    : "prioridad";
}

/** Direccion pedida, o undefined para dejar la propia de cada orden. */
export function direccionBandeja(
  valor: string | null | undefined,
): DireccionOrden | undefined {
  return valor === "asc" || valor === "desc" ? valor : undefined;
}

/**
 * Un "no" sin devolucion escrita. Mismo criterio que `faltaDevolucion` en las
 * acciones del panel: los dos estados que le dicen "no" a una idea exigen
 * explicarle al vecino por que.
 *
 * Nota: `getResumenBandeja.noFactiblesSinDevolucion` cuenta solo `no_factible`
 * (es el numero historico que el equipo viene mirando), asi que el filtro puede
 * traer alguna fila mas si hay integradas sin devolucion. No es un error.
 */
const SIN_DEVOLUCION = sql`(${ideas.estado} IN ('no_factible', 'integrado')
  AND coalesce(btrim(${ideas.motivoEstado}), '') = '')`;

/**
 * Grupo de trabajo de una idea, para el orden "prioridad":
 *  0 pendientes (nadie las miro todavia),
 *  1 los "no" sin devolucion escrita (la deuda con el vecino),
 *  2 el resto.
 */
const GRUPO_PRIORIDAD = sql`CASE
  WHEN ${ideas.estado} = 'pendiente' THEN 0
  WHEN ${SIN_DEVOLUCION} THEN 1
  ELSE 2 END`;

/**
 * Columna (o expresion) de cada orden permitido, con la direccion que tiene
 * sentido por defecto para ese orden. `estado` ordena por el orden del enum
 * `estado_idea`, que ya viene del mas crudo al mas resuelto.
 */
const ORDENES: Record<
  OrdenBandeja,
  { columna: SQLWrapper; porDefecto: DireccionOrden }
> = {
  prioridad: { columna: GRUPO_PRIORIDAD, porDefecto: "asc" },
  reciente: { columna: ideas.createdAt, porDefecto: "desc" },
  antigua: { columna: ideas.createdAt, porDefecto: "asc" },
  votos: { columna: ideas.votos, porDefecto: "desc" },
  distrito: { columna: distritos.numero, porDefecto: "asc" },
  estado: { columna: ideas.estado, porDefecto: "asc" },
};

export type FilaBandeja = {
  id: number;
  numero: number | null;
  titulo: string;
  slug: string;
  distrito: number | null;
  distritoNombre: string | null;
  categoria: string | null;
  barrio: string | null;
  estado: EstadoIdea;
  /** Si ya hay devolucion tecnica escrita. El texto se lee en la ficha. */
  tieneDevolucion: boolean;
  /** Si hay mail del autor para avisarle. El mail NO se expone en listados. */
  tieneContacto: boolean;
  publicada: boolean;
  votos: number;
  createdAt: Date;
  estadoActualizadoEn: Date | null;
  revisadoPor: string | null;
};

/**
 * Una pagina de la bandeja mas el total que matchea el filtro.
 *
 * El total NO es `filas.length`: es la cuenta completa sin `limite` ni
 * `desplazamiento`, que es lo que necesita el paginador para saber cuantas
 * paginas hay y para decir "35 de 100".
 */
export type PaginaBandeja = {
  filas: FilaBandeja[];
  total: number;
};

export async function listarIdeasBandeja(
  filtro: FiltroBandeja,
): Promise<PaginaBandeja> {
  const condiciones = [eq(ideas.edicionId, filtro.edicionId)];

  if (filtro.estado) {
    const estados = Array.isArray(filtro.estado) ? filtro.estado : [filtro.estado];
    if (estados.length) condiciones.push(inArray(ideas.estado, estados));
  }
  if (filtro.distrito) condiciones.push(eq(distritos.numero, filtro.distrito));
  if (filtro.sinDevolucion) condiciones.push(SIN_DEVOLUCION);
  if (filtro.texto?.trim()) {
    const texto = filtro.texto.trim();
    const patron = `%${texto}%`;
    const patronSinTildes = `%${normalizar(texto)}%`;
    // Tres formas de encontrar lo mismo, porque el equipo escribe con y sin
    // tildes y este proyecto no usa la extension unaccent:
    //  - el titulo tal como esta cargado;
    //  - el titulo con las tildes sacadas por `translate` (una vuelta de SQL,
    //    sin extensiones; son ~100 ideas por edicion, no necesita indice);
    //  - el barrio contra `barrio_normalizado`, que ya viene sin tildes.
    const busqueda = or(
      ilike(ideas.titulo, patron),
      sql`translate(${ideas.titulo},
        'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun') ILIKE ${patronSinTildes}`,
      like(ideas.barrioNormalizado, patronSinTildes),
    );
    if (busqueda) condiciones.push(busqueda);
  }

  const { columna, porDefecto } = ORDENES[filtro.orden ?? "prioridad"];
  const ordenar = (filtro.dir ?? porDefecto) === "asc" ? asc : desc;

  const consulta = db
    .select({
      id: ideas.id,
      numero: ideas.numero,
      titulo: ideas.titulo,
      slug: ideas.slug,
      distrito: distritos.numero,
      distritoNombre: distritos.nombre,
      categoria: categorias.nombre,
      barrio: ideas.barrio,
      estado: ideas.estado,
      tieneDevolucion: sql<number>`CASE
        WHEN coalesce(btrim(${ideas.motivoEstado}), '') <> '' THEN 1 ELSE 0 END`,
      tieneContacto: sql<number>`CASE
        WHEN ${ideas.autorEmail} IS NOT NULL THEN 1 ELSE 0 END`,
      publicada: ideas.publicada,
      votos: ideas.votos,
      createdAt: ideas.createdAt,
      estadoActualizadoEn: ideas.estadoActualizadoEn,
      revisadoPor: admins.nombre,
    })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .leftJoin(categorias, eq(categorias.id, ideas.categoriaId))
    .leftJoin(admins, eq(admins.id, ideas.revisadoPorId))
    .where(and(...condiciones))
    // Despues del orden elegido, siempre las mas antiguas arriba y el id como
    // ultimo criterio: sin un desempate estable, dos paginas del mismo filtro
    // pueden repetir o saltear filas (las ideas migradas comparten createdAt).
    .orderBy(ordenar(columna), asc(ideas.createdAt), asc(ideas.id));

  // El total se cuenta aparte, con las MISMAS condiciones y sin limite: es lo
  // que hace posible paginar. Solo necesita el join de distritos, que es el
  // unico que participa de un filtro.
  const consultaTotal = db
    .select({ total: sql<number>`count(*)::int` })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .where(and(...condiciones));

  const desplazamiento = Math.max(0, Math.trunc(filtro.desplazamiento ?? 0));
  const pagina = filtro.limite
    ? consulta.limit(filtro.limite).offset(desplazamiento)
    : desplazamiento
      ? consulta.offset(desplazamiento)
      : consulta;

  const [filas, [conteo]] = await Promise.all([pagina, consultaTotal]);

  return {
    filas: filas.map((f) => ({
      id: Number(f.id),
      numero: f.numero === null ? null : Number(f.numero),
      titulo: f.titulo,
      slug: f.slug,
      distrito: f.distrito === null ? null : Number(f.distrito),
      distritoNombre: f.distritoNombre,
      categoria: f.categoria,
      barrio: f.barrio,
      estado: f.estado,
      tieneDevolucion: Number(f.tieneDevolucion) === 1,
      tieneContacto: Number(f.tieneContacto) === 1,
      publicada: Boolean(f.publicada),
      votos: Number(f.votos ?? 0),
      createdAt: f.createdAt,
      estadoActualizadoEn: f.estadoActualizadoEn,
      revisadoPor: f.revisadoPor,
    })),
    total: Number(conteo?.total ?? 0),
  };
}

export type IdeaAdmin = IdeaVista & {
  distritoNombre: string | null;
  /** Historial de la limpieza del ETL: duplicados, campos corridos, faltantes. */
  notasMigracion: string[];
  tituloOriginal: string | null;
  coordenadasOriginales: string | null;
  canal: "web" | "asamblea" | "municipio" | "migracion";
  cargadoPor: string | null;
  autorNombre: string | null;
  /** Nunca el mail: solo si hay contacto para avisarle al autor. */
  tieneContacto: boolean;
  autorAvisos: boolean;
  autorAvisosVersion: string | null;
  estadoActualizadoEn: Date | null;
  revisadoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Ficha interna de una idea, con todo lo que el equipo necesita para revisar. */
export async function getIdeaAdmin(id: number): Promise<IdeaAdmin | null> {
  const [fila] = await db
    .select({
      ...camposIdea,
      distritoNombre: distritos.nombre,
      notasMigracion: ideas.notasMigracion,
      tituloOriginal: ideas.tituloOriginal,
      coordenadasOriginales: ideas.coordenadasOriginales,
      canal: ideas.canal,
      cargadoPor: ideas.cargadoPor,
      autorNombre: ideas.autorNombre,
      tieneContacto: sql<number>`CASE
        WHEN ${ideas.autorEmail} IS NOT NULL THEN 1 ELSE 0 END`,
      autorAvisos: ideas.autorAvisos,
      autorAvisosVersion: ideas.autorAvisosVersion,
      estadoActualizadoEn: ideas.estadoActualizadoEn,
      revisadoPor: admins.nombre,
      createdAt: ideas.createdAt,
      updatedAt: ideas.updatedAt,
    })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .leftJoin(categorias, eq(categorias.id, ideas.categoriaId))
    .leftJoin(admins, eq(admins.id, ideas.revisadoPorId))
    .innerJoin(ediciones, eq(ediciones.id, ideas.edicionId))
    .where(eq(ideas.id, id))
    .limit(1);

  if (!fila) return null;
  return {
    ...aVista(fila as Record<string, unknown>),
    distritoNombre: fila.distritoNombre,
    notasMigracion: fila.notasMigracion ?? [],
    tituloOriginal: fila.tituloOriginal,
    coordenadasOriginales: fila.coordenadasOriginales,
    canal: fila.canal,
    cargadoPor: fila.cargadoPor,
    autorNombre: fila.autorNombre,
    tieneContacto: Number(fila.tieneContacto) === 1,
    autorAvisos: Boolean(fila.autorAvisos),
    autorAvisosVersion: fila.autorAvisosVersion,
    estadoActualizadoEn: fila.estadoActualizadoEn,
    revisadoPor: fila.revisadoPor,
    createdAt: fila.createdAt,
    updatedAt: fila.updatedAt,
  };
}

export type AccionRevision =
  | "evaluacion"
  | "publicacion"
  | "despublicacion"
  | "proclamacion"
  | "reapertura"
  /** Cambio del presupuesto asignado al proyecto (migracion 0003). */
  | "presupuesto";

export type FilaRevision = {
  id: number;
  accion: AccionRevision;
  adminNombre: string;
  estadoAnterior: EstadoIdea | null;
  estadoNuevo: EstadoIdea | null;
  nota: string | null;
  createdAt: Date;
};

/** Historial completo de una idea, mas nuevo primero. La tabla es append-only. */
export async function getRevisiones(ideaId: number): Promise<FilaRevision[]> {
  return db
    .select({
      id: revisiones.id,
      accion: revisiones.accion,
      adminNombre: revisiones.adminNombre,
      estadoAnterior: revisiones.estadoAnterior,
      estadoNuevo: revisiones.estadoNuevo,
      nota: revisiones.nota,
      createdAt: revisiones.createdAt,
    })
    .from(revisiones)
    .where(eq(revisiones.ideaId, ideaId))
    .orderBy(desc(revisiones.createdAt), desc(revisiones.id));
}

export type ResumenBandeja = {
  total: number;
  porEstado: Record<EstadoIdea, number>;
  /**
   * No factibles sin devolucion escrita. Es la deuda del equipo: cada una es un
   * vecino al que se le dijo "no" sin explicarle por que.
   *
   * Cuenta solo `no_factible`, a proposito: es el numero con el que el equipo
   * viene midiendo la deuda. El filtro `sinDevolucion` de la bandeja es un poco
   * mas amplio (suma las integradas sin devolucion), asi que puede traer alguna
   * fila mas que este contador.
   */
  noFactiblesSinDevolucion: number;
};

export async function getResumenBandeja(edicionId: number): Promise<ResumenBandeja> {
  const filas = await consultar<{ estado: EstadoIdea; cantidad: number }>(sql`
    SELECT estado, count(*)::int AS cantidad
      FROM ideas
     WHERE edicion_id = ${edicionId}
     GROUP BY estado
  `);

  const [deuda] = await consultar<{ cantidad: number }>(sql`
    SELECT count(*)::int AS cantidad
      FROM ideas
     WHERE edicion_id = ${edicionId}
       AND estado = 'no_factible'
       AND coalesce(btrim(motivo_estado), '') = ''
  `);

  const porEstado: Record<EstadoIdea, number> = {
    borrador: 0,
    pendiente: 0,
    factible: 0,
    no_factible: 0,
    integrado: 0,
    ganador: 0,
  };
  let total = 0;
  for (const fila of filas) {
    const cantidad = Number(fila.cantidad);
    porEstado[fila.estado] = cantidad;
    total += cantidad;
  }

  return { total, porEstado, noFactiblesSinDevolucion: Number(deuda?.cantidad ?? 0) };
}

// ---------------------------------------------------------------------------
// Tablero del backoffice
// ---------------------------------------------------------------------------

export type ResumenAdmin = {
  ideas: number;
  publicadas: number;
  sinPublicar: number;
  porEstado: Record<EstadoIdea, number>;
  /** Votos emitidos por este sitio en la edicion (filas de `votos`). */
  votosRegistrados: number;
  /**
   * Suma del contador `ideas.votos`. Incluye los votos importados de ediciones
   * anteriores, que no tienen fila en `votos`: por eso puede ser mayor.
   */
  votosEnIdeas: number;
  /** Padron completo: la tabla `votantes` no se divide por edicion. */
  votantesEmpadronados: number;
  ganadores: number;
  presupuestoEdicion: number | null;
  presupuestoAsignado: number;
};

export async function getResumenAdmin(edicionId: number): Promise<ResumenAdmin> {
  const [totales] = await consultar<{
    ideas: number;
    publicadas: number;
    ganadores: number;
    votos_en_ideas: number;
    asignado: string | null;
  }>(sql`
    SELECT count(*)::int AS ideas,
           count(*) FILTER (WHERE publicada)::int AS publicadas,
           count(*) FILTER (WHERE ganador)::int AS ganadores,
           coalesce(sum(votos), 0)::int AS votos_en_ideas,
           sum(presupuesto_total) FILTER (WHERE ganador) AS asignado
      FROM ideas
     WHERE edicion_id = ${edicionId}
  `);

  const estados = await consultar<{ estado: EstadoIdea; cantidad: number }>(sql`
    SELECT estado, count(*)::int AS cantidad
      FROM ideas
     WHERE edicion_id = ${edicionId}
     GROUP BY estado
  `);

  const [padron] = await consultar<{ votos: number; empadronados: number; presupuesto: string | null }>(sql`
    SELECT (SELECT count(*) FROM votos v WHERE v.edicion_id = ${edicionId})::int AS votos,
           (SELECT count(*) FROM votantes)::int AS empadronados,
           (SELECT e.presupuesto_total FROM ediciones e WHERE e.id = ${edicionId}) AS presupuesto
  `);

  const porEstado: Record<EstadoIdea, number> = {
    borrador: 0,
    pendiente: 0,
    factible: 0,
    no_factible: 0,
    integrado: 0,
    ganador: 0,
  };
  for (const fila of estados) porEstado[fila.estado] = Number(fila.cantidad);

  const ideasTotales = Number(totales?.ideas ?? 0);
  const publicadas = Number(totales?.publicadas ?? 0);

  return {
    ideas: ideasTotales,
    publicadas,
    sinPublicar: ideasTotales - publicadas,
    porEstado,
    votosRegistrados: Number(padron?.votos ?? 0),
    votosEnIdeas: Number(totales?.votos_en_ideas ?? 0),
    votantesEmpadronados: Number(padron?.empadronados ?? 0),
    ganadores: Number(totales?.ganadores ?? 0),
    presupuestoEdicion:
      padron?.presupuesto === null || padron?.presupuesto === undefined
        ? null
        : Number(padron.presupuesto),
    presupuestoAsignado: Number(totales?.asignado ?? 0),
  };
}

export type EstadisticaDistrito = {
  numero: number;
  nombre: string;
  ideas: number;
  factibles: number;
  noFactibles: number;
  pendientes: number;
  /** Suma del contador de votos de las ideas del distrito. */
  votos: number;
  tituloGanador: string | null;
};

export async function getEstadisticasPorDistrito(
  edicionId: number,
): Promise<EstadisticaDistrito[]> {
  const filas = await consultar<{
    numero: number;
    nombre: string;
    ideas: number;
    factibles: number;
    no_factibles: number;
    pendientes: number;
    votos: number;
    titulo_ganador: string | null;
  }>(sql`
    SELECT d.numero,
           d.nombre,
           count(i.id)::int AS ideas,
           count(i.id) FILTER (WHERE i.estado = 'factible')::int AS factibles,
           count(i.id) FILTER (WHERE i.estado = 'no_factible')::int AS no_factibles,
           count(i.id) FILTER (WHERE i.estado = 'pendiente')::int AS pendientes,
           coalesce(sum(i.votos), 0)::int AS votos,
           (SELECT g.titulo
              FROM ideas g
             WHERE g.distrito_id = d.id AND g.edicion_id = ${edicionId} AND g.ganador
             ORDER BY g.votos DESC
             LIMIT 1) AS titulo_ganador
      FROM distritos d
      LEFT JOIN ideas i ON i.distrito_id = d.id AND i.edicion_id = ${edicionId}
     GROUP BY d.id, d.numero, d.nombre
     ORDER BY d.numero
  `);

  return filas.map((f) => ({
    numero: Number(f.numero),
    nombre: f.nombre,
    ideas: Number(f.ideas),
    factibles: Number(f.factibles),
    noFactibles: Number(f.no_factibles),
    pendientes: Number(f.pendientes),
    votos: Number(f.votos),
    tituloGanador: f.titulo_ganador,
  }));
}

export type CeldaDistritoCategoria = {
  distrito: number;
  categoriaSlug: string;
  categoriaNombre: string;
  ideas: number;
};

/** Matriz completa (incluye los ceros): 20 distritos por cada categoria. */
export async function getMatrizDistritoCategoria(
  edicionId: number,
): Promise<CeldaDistritoCategoria[]> {
  const filas = await consultar<{
    distrito: number;
    slug: string;
    nombre: string;
    ideas: number;
  }>(sql`
    SELECT d.numero AS distrito,
           c.slug,
           c.nombre,
           (SELECT count(*)
              FROM ideas i
             WHERE i.edicion_id = ${edicionId}
               AND i.distrito_id = d.id
               AND i.categoria_id = c.id)::int AS ideas
      FROM distritos d
      CROSS JOIN categorias c
     ORDER BY d.numero, c.orden, c.slug
  `);

  return filas.map((f) => ({
    distrito: Number(f.distrito),
    categoriaSlug: f.slug,
    categoriaNombre: f.nombre,
    ideas: Number(f.ideas),
  }));
}

export type PuntoSerie = { dia: string; cantidad: number };

/** Votos por dia. El dia se resuelve en la zona horaria de la sesion de la base. */
export async function getSerieVotos(edicionId: number): Promise<PuntoSerie[]> {
  const filas = await consultar<{ dia: string; cantidad: number }>(sql`
    SELECT (created_at::date)::text AS dia, count(*)::int AS cantidad
      FROM votos
     WHERE edicion_id = ${edicionId}
     GROUP BY 1
     ORDER BY 1
  `);
  return filas.map((f) => ({ dia: f.dia, cantidad: Number(f.cantidad) }));
}

/**
 * Ideas presentadas por dia. Se usa `fecha` (la de presentacion declarada) y
 * solo se cae en `created_at` si falta: en las ediciones migradas `created_at`
 * es el dia en que corrio el seed, no el dia en que el vecino presento la idea.
 */
export async function getSerieIdeas(edicionId: number): Promise<PuntoSerie[]> {
  const filas = await consultar<{ dia: string; cantidad: number }>(sql`
    SELECT (coalesce(fecha, created_at::date))::text AS dia, count(*)::int AS cantidad
      FROM ideas
     WHERE edicion_id = ${edicionId}
     GROUP BY 1
     ORDER BY 1
  `);
  return filas.map((f) => ({ dia: f.dia, cantidad: Number(f.cantidad) }));
}

export type FilaRanking = {
  id: number;
  numero: number | null;
  slug: string;
  titulo: string;
  votos: number;
};

/**
 * Ranking de votos dentro de un distrito.
 *
 * El universo es exactamente el del reglamento: ideas `factible` y publicadas.
 * Es la consulta que valida la proclamacion del ganador, asi que no se le
 * agregan ni se le quitan filtros por conveniencia de una pantalla.
 */
export async function getVotosPorIdea(
  edicionId: number,
  distrito: number,
): Promise<FilaRanking[]> {
  const filas = await consultar<{
    id: number;
    numero: number | null;
    slug: string;
    titulo: string;
    votos: number;
  }>(sql`
    SELECT i.id, i.numero, i.slug, i.titulo, i.votos::int AS votos
      FROM ideas i
      JOIN distritos d ON d.id = i.distrito_id
     WHERE i.edicion_id = ${edicionId}
       AND d.numero = ${distrito}
       AND i.estado = 'factible'
       AND i.publicada
     ORDER BY i.votos DESC, i.numero ASC NULLS LAST, i.id ASC
  `);

  return filas.map((f) => ({
    id: Number(f.id),
    numero: f.numero === null ? null : Number(f.numero),
    slug: f.slug,
    titulo: f.titulo,
    votos: Number(f.votos),
  }));
}

export type FilaEjecucion = {
  id: number;
  slug: string;
  titulo: string;
  distrito: number | null;
  presupuestoTotal: number | null;
  estadoPresupuesto: string;
  /** Monto de la etapa en la que esta hoy el proyecto, si esta cargado. */
  montoEtapaActual: number | null;
};

export async function getEjecucionPresupuestaria(
  edicionId: number,
): Promise<FilaEjecucion[]> {
  const filas = await consultar<{
    id: number;
    slug: string;
    titulo: string;
    distrito: number | null;
    presupuesto_total: string | null;
    estado_presupuesto: string;
    monto_etapa: string | null;
  }>(sql`
    SELECT i.id,
           i.slug,
           i.titulo,
           d.numero AS distrito,
           i.presupuesto_total,
           i.estado_presupuesto,
           CASE i.estado_presupuesto
             WHEN 'preparacion'  THEN i.monto_preparacion
             WHEN 'contratacion' THEN i.monto_contratacion
             WHEN 'ejecucion'    THEN i.monto_ejecucion
             WHEN 'finalizado'   THEN i.monto_finalizado
           END AS monto_etapa
      FROM ideas i
      LEFT JOIN distritos d ON d.id = i.distrito_id
     WHERE i.edicion_id = ${edicionId} AND i.ganador
     ORDER BY d.numero NULLS LAST, i.titulo
  `);

  return filas.map((f) => ({
    id: Number(f.id),
    slug: f.slug,
    titulo: f.titulo,
    distrito: f.distrito === null ? null : Number(f.distrito),
    presupuestoTotal: f.presupuesto_total === null ? null : Number(f.presupuesto_total),
    estadoPresupuesto: f.estado_presupuesto,
    montoEtapaActual: f.monto_etapa === null ? null : Number(f.monto_etapa),
  }));
}

// ---------------------------------------------------------------------------
// Padron y participacion
//
// Supresion de celdas chicas: con un N muy bajo, un agregado por distrito deja
// deducir el voto de una persona concreta (si en un distrito votaron 2 y el
// ranking muestra 2 votos en un proyecto, ya se sabe que votaron esas 2). Por
// eso el umbral se aplica ACA, en el tipo de retorno, y no en la pantalla: una
// pantalla nueva no puede olvidarse de aplicarlo.
// ---------------------------------------------------------------------------

/** Debajo de este N, el agregado vuelve null en lugar del numero real. */
export const UMBRAL_SUPRESION = 5;

function suprimir(valor: number): number | null {
  return valor < UMBRAL_SUPRESION ? null : valor;
}

export type ParticipacionDistrito = {
  distrito: number;
  nombre: string;
  empadronados: number | null;
  votaron: number | null;
};

export async function getParticipacionPorDistrito(
  edicionId: number,
): Promise<ParticipacionDistrito[]> {
  const filas = await consultar<{
    numero: number;
    nombre: string;
    empadronados: number;
    votaron: number;
  }>(sql`
    SELECT d.numero,
           d.nombre,
           (SELECT count(*) FROM votantes va WHERE va.distrito_id = d.id)::int AS empadronados,
           (SELECT count(*)
              FROM votos v
             WHERE v.edicion_id = ${edicionId} AND v.distrito_id = d.id)::int AS votaron
      FROM distritos d
     ORDER BY d.numero
  `);

  return filas.map((f) => ({
    distrito: Number(f.numero),
    nombre: f.nombre,
    empadronados: suprimir(Number(f.empadronados)),
    votaron: suprimir(Number(f.votaron)),
  }));
}

export type FilaPadron = {
  distrito: number;
  nombre: string;
  empadronados: number | null;
  verificados: number | null;
  votaron: number | null;
};

export type ResumenPadron = {
  filas: FilaPadron[];
  /** Empadronados sin distrito: no pueden votar hasta completar el dato. */
  sinDistrito: number | null;
};

/**
 * Agregado del padron por distrito. No existe (ni debe existir) una consulta
 * que liste votantes con nombre y apellido: el padron no es un dato publicable
 * y el backoffice no necesita leerlo persona por persona.
 *
 * Tampoco devuelve el total del padron: con el total, restar las filas visibles
 * reconstruiria la celda suprimida.
 */
export async function getResumenPadron(edicionId: number): Promise<ResumenPadron> {
  const filas = await consultar<{
    numero: number;
    nombre: string;
    empadronados: number;
    verificados: number;
    votaron: number;
  }>(sql`
    SELECT d.numero,
           d.nombre,
           count(va.id)::int AS empadronados,
           count(va.id) FILTER (WHERE va.verificado)::int AS verificados,
           (SELECT count(*)
              FROM votos v
             WHERE v.edicion_id = ${edicionId} AND v.distrito_id = d.id)::int AS votaron
      FROM distritos d
      LEFT JOIN votantes va ON va.distrito_id = d.id
     GROUP BY d.id, d.numero, d.nombre
     ORDER BY d.numero
  `);

  const [sueltos] = await consultar<{ cantidad: number }>(sql`
    SELECT count(*)::int AS cantidad FROM votantes WHERE distrito_id IS NULL
  `);

  return {
    filas: filas.map((f) => ({
      distrito: Number(f.numero),
      nombre: f.nombre,
      empadronados: suprimir(Number(f.empadronados)),
      verificados: suprimir(Number(f.verificados)),
      votaron: suprimir(Number(f.votaron)),
    })),
    sinDistrito: suprimir(Number(sueltos?.cantidad ?? 0)),
  };
}

export type VotanteMesaAyuda = {
  existe: boolean;
  nombre: string | null;
  distrito: number | null;
  verificado: boolean;
  proveedor: string | null;
  alta: Date | null;
};

/**
 * Mesa de ayuda: "estoy empadronado?". Busca por el hash del DNI, con la misma
 * funcion que usa el empadronamiento, asi que el DNI no se guarda en ningun
 * lado por consultarlo.
 *
 * No devuelve el hash, ni el DNI, ni si la persona ya voto: cruzar "voto" con
 * el ranking por idea revela el voto cuando el N del distrito es chico, y esa
 * pregunta no es necesaria para atender a un vecino.
 */
export async function buscarVotantePorDni(dni: string): Promise<VotanteMesaAyuda> {
  const limpio = dni.replace(/\D/g, "");
  const vacio: VotanteMesaAyuda = {
    existe: false,
    nombre: null,
    distrito: null,
    verificado: false,
    proveedor: null,
    alta: null,
  };
  if (limpio.length < 6) return vacio;

  const [fila] = await db
    .select({
      nombre: votantes.nombre,
      distrito: distritos.numero,
      verificado: votantes.verificado,
      proveedor: votantes.proveedor,
      alta: votantes.createdAt,
    })
    .from(votantes)
    .leftJoin(distritos, eq(distritos.id, votantes.distritoId))
    .where(eq(votantes.dniHash, hashearDni(limpio)))
    .limit(1);

  if (!fila) return vacio;
  return {
    existe: true,
    nombre: fila.nombre,
    distrito: fila.distrito === null ? null : Number(fila.distrito),
    verificado: Boolean(fila.verificado),
    proveedor: fila.proveedor,
    alta: fila.alta,
  };
}

// ---------------------------------------------------------------------------
// Equipo del backoffice
// ---------------------------------------------------------------------------

export type RolAdmin = "admin" | "moderador" | "lector";

export type FilaAdmin = {
  id: number;
  email: string;
  nombre: string;
  rol: RolAdmin;
  activo: boolean;
  ultimoIngreso: Date | null;
  createdAt: Date;
};

/** Cuentas del backoffice. El `passwordHash` no sale nunca de la base. */
export async function listarAdmins(): Promise<FilaAdmin[]> {
  return db
    .select({
      id: admins.id,
      email: admins.email,
      nombre: admins.nombre,
      rol: admins.rol,
      activo: admins.activo,
      ultimoIngreso: admins.ultimoIngreso,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(asc(admins.nombre));
}

/**
 * Una sola cuenta por id, para la cabecera del panel.
 *
 * Existe para no traer la tabla entera con `listarAdmins()` en cada render de
 * cada pantalla de /admin solo para mostrar el nombre de quien entro. Nunca
 * devuelve `passwordHash`.
 */
export async function getAdminPorId(id: number): Promise<FilaAdmin | null> {
  const [fila] = await db
    .select({
      id: admins.id,
      email: admins.email,
      nombre: admins.nombre,
      rol: admins.rol,
      activo: admins.activo,
      ultimoIngreso: admins.ultimoIngreso,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  return fila ?? null;
}

export type FilaBitacora = {
  id: number;
  adminNombre: string;
  objetivoEmail: string;
  accion: "alta" | "cambio_rol" | "desactivacion" | "reactivacion" | "cambio_password";
  rolAnterior: RolAdmin | null;
  rolNuevo: RolAdmin | null;
  createdAt: Date;
};

export async function getBitacoraEquipo(limite = 100): Promise<FilaBitacora[]> {
  return db
    .select({
      id: bitacoraEquipo.id,
      adminNombre: bitacoraEquipo.adminNombre,
      objetivoEmail: bitacoraEquipo.objetivoEmail,
      accion: bitacoraEquipo.accion,
      rolAnterior: bitacoraEquipo.rolAnterior,
      rolNuevo: bitacoraEquipo.rolNuevo,
      createdAt: bitacoraEquipo.createdAt,
    })
    .from(bitacoraEquipo)
    .orderBy(desc(bitacoraEquipo.createdAt), desc(bitacoraEquipo.id))
    .limit(limite);
}

// ---------------------------------------------------------------------------
// Seguimiento publico de una idea
// ---------------------------------------------------------------------------

export type SeguimientoIdea = {
  /** Lo necesita quien llama para validar el codigo con codigoValido(). */
  id: number;
  numero: number | null;
  titulo: string;
  slug: string;
  estado: EstadoIdea;
  motivoEstado: string | null;
  distrito: number | null;
  fecha: string | null;
  publicada: boolean;
};

/**
 * Idea por numero dentro de una edicion, para /ideas/seguimiento.
 *
 * Unica consulta publica que NO filtra por `publicada`: el autor tiene derecho
 * a ver el estado de su propia idea aunque el equipo todavia no la haya
 * publicado. El acceso ya esta protegido por el codigo de seguimiento
 * (src/lib/avisos.ts), que quien llama valida con el `id` que devuelve esto.
 */
export async function getSeguimientoIdea(
  edicionId: number,
  numero: number,
): Promise<SeguimientoIdea | null> {
  const [fila] = await db
    .select({
      id: ideas.id,
      numero: ideas.numero,
      titulo: ideas.titulo,
      slug: ideas.slug,
      estado: ideas.estado,
      motivoEstado: ideas.motivoEstado,
      distrito: distritos.numero,
      fecha: ideas.fecha,
      publicada: ideas.publicada,
    })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .where(and(eq(ideas.edicionId, edicionId), eq(ideas.numero, numero)))
    .limit(1);

  if (!fila) return null;
  return {
    ...fila,
    numero: fila.numero === null ? null : Number(fila.numero),
    distrito: fila.distrito === null ? null : Number(fila.distrito),
  };
}

