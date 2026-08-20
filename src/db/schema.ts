/**
 * Esquema de la base de datos del Presupuesto Participativo de SMT.
 *
 * Decisiones de diseno que corrigen los problemas del sitio anterior:
 *  - `lat`/`lon` son numericos y no texto libre; `distritoId` se deriva por
 *    point-in-polygon contra la geometria oficial (ver src/lib/geo.ts).
 *  - el presupuesto tiene monto total y monto por etapa, con historial propio
 *    en la tabla `avances`, para que el seguimiento de obra sea publicable.
 *  - `problema`, `solucion` y `beneficios` son campos separados y validados.
 *  - el DNI del padron se guarda hasheado; nunca en claro.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const etapaEdicion = pgEnum("etapa_edicion", [
  "ideas",
  "evaluacion",
  "votacion",
  "seguimiento",
  "cerrada",
]);

export const estadoIdea = pgEnum("estado_idea", [
  "borrador",
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
]);

export const estadoPresupuesto = pgEnum("estado_presupuesto", [
  "sin_asignar",
  "preparacion",
  "contratacion",
  "ejecucion",
  "finalizado",
]);

export const canalCarga = pgEnum("canal_carga", [
  "web",
  "asamblea",
  "municipio",
  "migracion",
]);

export const rolAdmin = pgEnum("rol_admin", ["admin", "moderador", "lector"]);

// ---------------------------------------------------------------------------
// Geografia y taxonomia
// ---------------------------------------------------------------------------

export const distritos = pgTable("distritos", {
  id: integer("id").primaryKey(),
  numero: smallint("numero").notNull().unique(),
  nombre: text("nombre").notNull(),
  /**
   * Geometria oficial del distrito como GeoJSON (MultiPolygon, EPSG:4326).
   * El point-in-polygon se resuelve en la aplicacion (src/lib/geo.ts); la
   * misma geometria se sirve estatica en /geo/distritos.geojson.
   */
  geojson: jsonb("geojson").notNull(),
  centroideLat: numeric("centroide_lat", { precision: 10, scale: 7 }).notNull(),
  centroideLon: numeric("centroide_lon", { precision: 10, scale: 7 }).notNull(),
  /** Barrios de referencia, para que el vecino se ubique sin mirar el mapa. */
  referencia: text("referencia"),
});

export const categorias = pgTable("categorias", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull(),
  /** Color de la categoria en mapas y tarjetas (hex). */
  color: varchar("color", { length: 7 }).notNull(),
  orden: smallint("orden").notNull().default(0),
});

export const ediciones = pgTable("ediciones", {
  id: serial("id").primaryKey(),
  anio: smallint("anio").notNull().unique(),
  etapa: etapaEdicion("etapa").notNull().default("ideas"),
  /** Monto total del programa para esa edicion, en pesos. */
  presupuestoTotal: numeric("presupuesto_total", { precision: 14, scale: 2 }),
  ideasDesde: date("ideas_desde"),
  ideasHasta: date("ideas_hasta"),
  votacionDesde: date("votacion_desde"),
  votacionHasta: date("votacion_hasta"),
  activa: boolean("activa").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Ideas y proyectos
// ---------------------------------------------------------------------------

export const ideas = pgTable(
  "ideas",
  {
    id: serial("id").primaryKey(),
    edicionId: integer("edicion_id")
      .notNull()
      .references(() => ediciones.id, { onDelete: "restrict" }),
    distritoId: integer("distrito_id").references(() => distritos.id, {
      onDelete: "restrict",
    }),
    categoriaId: integer("categoria_id").references(() => categorias.id, {
      onDelete: "restrict",
    }),

    /** Numero identificador municipal de la idea dentro de la edicion. */
    numero: integer("numero"),
    titulo: text("titulo").notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    barrio: text("barrio"),
    /** Barrio en minusculas y sin tildes, para buscar sin extension unaccent. */
    barrioNormalizado: text("barrio_normalizado"),

    problema: text("problema"),
    solucion: text("solucion"),
    beneficios: text("beneficios"),

    lat: numeric("lat", { precision: 10, scale: 7 }),
    lon: numeric("lon", { precision: 10, scale: 7 }),
    /** true cuando el punto es el centroide del distrito y no la ubicacion real. */
    ubicacionAproximada: boolean("ubicacion_aproximada")
      .notNull()
      .default(false),

    estado: estadoIdea("estado").notNull().default("pendiente"),
    /** Devolucion tecnica publica: por que es factible o no. */
    motivoEstado: text("motivo_estado"),
    /** Cuando la idea se fusiono con otra, apunta a la idea final. */
    integradaEnId: integer("integrada_en_id"),

    votos: integer("votos").notNull().default(0),
    ganador: boolean("ganador").notNull().default(false),

    presupuestoTotal: numeric("presupuesto_total", {
      precision: 14,
      scale: 2,
    }),
    estadoPresupuesto: estadoPresupuesto("estado_presupuesto")
      .notNull()
      .default("sin_asignar"),
    montoPreparacion: numeric("monto_preparacion", { precision: 14, scale: 2 }),
    montoContratacion: numeric("monto_contratacion", {
      precision: 14,
      scale: 2,
    }),
    montoEjecucion: numeric("monto_ejecucion", { precision: 14, scale: 2 }),
    montoFinalizado: numeric("monto_finalizado", { precision: 14, scale: 2 }),

    canal: canalCarga("canal").notNull().default("web"),
    autorNombre: text("autor_nombre"),
    autorTelefono: text("autor_telefono"),
    autorEmail: text("autor_email"),
    /** Usuario del sistema anterior o del backoffice que cargo la idea. */
    cargadoPor: text("cargado_por"),

    /** Titulo tal como vino del sitio anterior, para auditar la limpieza. */
    tituloOriginal: text("titulo_original"),
    /** Coordenada tal como estaba cargada en el sitio anterior. */
    coordenadasOriginales: text("coordenadas_originales"),
    /** Notas de la migracion: duplicados, campos corridos, datos faltantes. */
    notasMigracion: jsonb("notas_migracion").$type<string[]>(),

    publicada: boolean("publicada").notNull().default(true),
    fecha: date("fecha"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("ideas_edicion_slug_idx").on(t.edicionId, t.slug),
    index("ideas_distrito_idx").on(t.distritoId),
    index("ideas_estado_idx").on(t.estado),
    index("ideas_edicion_idx").on(t.edicionId),
  ],
);

/** Historial publico de ejecucion de un proyecto ganador. */
export const avances = pgTable(
  "avances",
  {
    id: serial("id").primaryKey(),
    ideaId: integer("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    fecha: date("fecha").notNull(),
    etapa: estadoPresupuesto("etapa").notNull(),
    titulo: text("titulo").notNull(),
    descripcion: text("descripcion"),
    monto: numeric("monto", { precision: 14, scale: 2 }),
    porcentaje: smallint("porcentaje"),
    fotoUrl: text("foto_url"),
    publicado: boolean("publicado").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("avances_idea_idx").on(t.ideaId)],
);

// ---------------------------------------------------------------------------
// Padron y votacion
// ---------------------------------------------------------------------------

export const votantes = pgTable(
  "votantes",
  {
    id: serial("id").primaryKey(),
    /** sha256(dni + pepper). El DNI en claro no se guarda nunca. */
    dniHash: varchar("dni_hash", { length: 64 }).notNull().unique(),
    /** Ultimos 3 digitos, solo para que la mesa de ayuda pueda identificar. */
    dniCola: varchar("dni_cola", { length: 3 }),
    nombre: text("nombre"),
    distritoId: integer("distrito_id").references(() => distritos.id),
    /** "cidituc" o "dev". */
    proveedor: varchar("proveedor", { length: 30 }).notNull(),
    proveedorSub: text("proveedor_sub"),
    verificado: boolean("verificado").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("votantes_distrito_idx").on(t.distritoId)],
);

export const votos = pgTable(
  "votos",
  {
    id: serial("id").primaryKey(),
    edicionId: integer("edicion_id")
      .notNull()
      .references(() => ediciones.id, { onDelete: "restrict" }),
    votanteId: integer("votante_id")
      .notNull()
      .references(() => votantes.id, { onDelete: "restrict" }),
    ideaId: integer("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "restrict" }),
    distritoId: integer("distrito_id")
      .notNull()
      .references(() => distritos.id, { onDelete: "restrict" }),
    ipHash: varchar("ip_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Regla del reglamento: 1 voto por persona por edicion.
    unique("votos_una_persona_un_voto").on(t.edicionId, t.votanteId),
    index("votos_idea_idx").on(t.ideaId),
  ],
);

// ---------------------------------------------------------------------------
// Backoffice y contenido editable
// ---------------------------------------------------------------------------

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  nombre: text("nombre").notNull(),
  /** scrypt: sal:hash en hexadecimal (ver src/lib/password.ts). */
  passwordHash: text("password_hash").notNull(),
  rol: rolAdmin("rol").notNull().default("moderador"),
  activo: boolean("activo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Textos editables del sitio, equivalente al /api/text del sitio anterior. */
export const textos = pgTable("textos", {
  clave: varchar("clave", { length: 100 }).primaryKey(),
  valor: text("valor").notNull(),
  descripcion: text("descripcion"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const faq = pgTable("faq", {
  id: serial("id").primaryKey(),
  orden: smallint("orden").notNull().default(0),
  pregunta: text("pregunta").notNull(),
  respuesta: text("respuesta").notNull(),
  publicada: boolean("publicada").notNull().default(true),
});

export const novedades = pgTable("novedades", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  copete: text("copete"),
  cuerpo: text("cuerpo").notNull(),
  fecha: date("fecha").notNull(),
  distritoId: integer("distrito_id").references(() => distritos.id),
  imagenUrl: text("imagen_url"),
  publicada: boolean("publicada").notNull().default(true),
});

/** Cronograma de la edicion, para la home y el chatbot. */
export const hitos = pgTable("hitos", {
  id: serial("id").primaryKey(),
  edicionId: integer("edicion_id")
    .notNull()
    .references(() => ediciones.id, { onDelete: "cascade" }),
  orden: smallint("orden").notNull().default(0),
  titulo: text("titulo").notNull(),
  detalle: text("detalle"),
  desde: date("desde"),
  hasta: date("hasta"),
  etapa: etapaEdicion("etapa"),
});

/**
 * Registro de consultas al chatbot. Sirve para dos cosas: medir que pregunta
 * la gente (insumo real para el municipio) y auditar el costo en tokens.
 * No guarda datos personales ni la IP en claro.
 */
export const chatConsultas = pgTable("chat_consultas", {
  id: serial("id").primaryKey(),
  pregunta: text("pregunta").notNull(),
  respuesta: text("respuesta"),
  herramientas: jsonb("herramientas").$type<string[]>(),
  modelo: varchar("modelo", { length: 60 }),
  tokensEntrada: integer("tokens_entrada"),
  tokensSalida: integer("tokens_salida"),
  cacheLectura: integer("cache_lectura"),
  ms: integer("ms"),
  ipHash: varchar("ip_hash", { length: 64 }),
  ok: boolean("ok").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Contador simple para limitar abuso por IP sin depender de Redis. */
export const rateLimit = pgTable("rate_limit", {
  clave: varchar("clave", { length: 120 }).primaryKey(),
  contador: integer("contador").notNull().default(0),
  ventanaDesde: timestamp("ventana_desde", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
