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
  type AnyPgColumn,
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

/**
 * Que se hizo sobre una idea en la bandeja de revision (tabla `revisiones`).
 *
 * `presupuesto` audita el monto asignado al proyecto (`ideas.presupuesto_total`):
 * es plata publica, asi que el cambio deja fila con el monto anterior y el
 * nuevo, igual que un cambio de estado. Valor agregado en la migracion 0003.
 */
export const accionRevision = pgEnum("accion_revision", [
  "evaluacion",
  "publicacion",
  "despublicacion",
  "proclamacion",
  "reapertura",
  "presupuesto",
]);

/** Cambios sobre las cuentas del backoffice (tabla `bitacora_equipo`). */
export const accionEquipo = pgEnum("accion_equipo", [
  "alta",
  "cambio_rol",
  "desactivacion",
  "reactivacion",
  "cambio_password",
]);

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

export const ediciones = pgTable(
  "ediciones",
  {
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
  },
  // Invariante del sitio: hay como maximo una edicion activa. El indice
  // parcial lo garantiza en la base y no solo en el codigo que la activa.
  (t) => [uniqueIndex("ediciones_una_activa_idx").on(t.activa).where(sql`${t.activa}`)],
);

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
    integradaEnId: integer("integrada_en_id").references((): AnyPgColumn => ideas.id, {
      onDelete: "set null",
    }),
    /** Cuando cambio el estado por ultima vez, y quien lo cambio. */
    estadoActualizadoEn: timestamp("estado_actualizado_en", { withTimezone: true }),
    revisadoPorId: integer("revisado_por_id").references(() => admins.id, {
      onDelete: "set null",
    }),

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
    /**
     * Contacto del autor. Se guarda SOLO si la persona marco la casilla de
     * avisos, con la finalidad declarada de contarle como sigue su idea. No es
     * un dato publico: ninguna consulta del sitio ni del chatbot lo devuelve.
     * `autorTelefono` se elimino: se pedia y no lo leia nadie.
     */
    autorEmail: text("autor_email"),
    /** Consentimiento explicito para recibir avisos, y cuando se dio. */
    autorAvisos: boolean("autor_avisos").notNull().default(false),
    autorAvisosEn: timestamp("autor_avisos_en", { withTimezone: true }),
    /** Version del texto de consentimiento que la persona acepto. */
    autorAvisosVersion: varchar("autor_avisos_version", { length: 20 }),
    /** Cuando se borro el contacto (al cerrar la edicion). */
    contactoPurgadoEn: timestamp("contacto_purgado_en", { withTimezone: true }),
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
    // Orden de la bandeja de revision: por edicion, estado y antiguedad.
    index("ideas_bandeja_idx").on(t.edicionId, t.estado, t.createdAt),
    // El numero es el identificador que el vecino ve: no puede repetirse
    // dentro de una edicion. Verificado: las 100 ideas de 2025 ya lo cumplen.
    uniqueIndex("ideas_edicion_numero_idx").on(t.edicionId, t.numero),
  ],
);

/**
 * Historial de la revision de cada idea. Es append-only: no se edita ni se
 * borra. Existe para poder responder quien cambio un estado, cuando y con que
 * devolucion, que es lo que hace defendible el proceso frente al vecino.
 */
export const revisiones = pgTable(
  "revisiones",
  {
    id: serial("id").primaryKey(),
    ideaId: integer("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    /** Queda en null si despues se borra la cuenta: el registro no se pierde. */
    adminId: integer("admin_id").references(() => admins.id, { onDelete: "set null" }),
    /** Copia del nombre de quien reviso, para que el historial se lea solo. */
    adminNombre: text("admin_nombre").notNull(),
    accion: accionRevision("accion").notNull(),
    estadoAnterior: estadoIdea("estado_anterior"),
    estadoNuevo: estadoIdea("estado_nuevo"),
    /** La devolucion tal como quedo, o el motivo de publicar/despublicar. */
    nota: text("nota"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("revisiones_idea_idx").on(t.ideaId, t.createdAt)],
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
    // Series y participacion del tablero: por fecha y por distrito.
    index("votos_edicion_fecha_idx").on(t.edicionId, t.createdAt),
    index("votos_edicion_distrito_idx").on(t.edicionId, t.distritoId),
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
  /**
   * true cuando la contrasena la eligio otra persona al crear la cuenta: el
   * panel obliga a cambiarla antes de dejar hacer cualquier otra cosa.
   */
  debeCambiarPassword: boolean("debe_cambiar_password").notNull().default(false),
  ultimoIngreso: timestamp("ultimo_ingreso", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Bitacora de las cuentas del backoffice: quien dio de alta, cambio de rol o
 * desactivo a quien. Separada de `revisiones` porque audita otra cosa y tiene
 * otra retencion. Tambien append-only.
 */
export const bitacoraEquipo = pgTable(
  "bitacora_equipo",
  {
    id: serial("id").primaryKey(),
    /** Quien hizo el cambio. */
    adminId: integer("admin_id").references(() => admins.id, { onDelete: "set null" }),
    adminNombre: text("admin_nombre").notNull(),
    /** Sobre que cuenta. Se guarda el mail para que el registro sobreviva. */
    objetivoId: integer("objetivo_id").references(() => admins.id, { onDelete: "set null" }),
    objetivoEmail: varchar("objetivo_email", { length: 200 }).notNull(),
    accion: accionEquipo("accion").notNull(),
    rolAnterior: rolAdmin("rol_anterior"),
    rolNuevo: rolAdmin("rol_nuevo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bitacora_equipo_fecha_idx").on(t.createdAt)],
);

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
