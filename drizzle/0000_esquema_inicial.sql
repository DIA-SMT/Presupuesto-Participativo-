-- Migracion base del esquema del Presupuesto Participativo.
--
-- Es idempotente a proposito: cuando se adopto el flujo de migraciones
-- versionadas la base de Supabase ya tenia las 14 tablas cargadas (la edicion
-- 2025 completa). Aplicarla ahi no recrea nada, solo deja registrado el punto
-- de partida en drizzle.__drizzle_migrations; sobre una base vacia (PGlite en
-- desarrollo) crea el esquema entero.
--
-- De la 0001 en adelante las migraciones son las que genera drizzle-kit, sin
-- editar a mano.

DO $$ BEGIN
	CREATE TYPE "public"."canal_carga" AS ENUM('web', 'asamblea', 'municipio', 'migracion');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."estado_idea" AS ENUM('borrador', 'pendiente', 'factible', 'no_factible', 'integrado', 'ganador');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."estado_presupuesto" AS ENUM('sin_asignar', 'preparacion', 'contratacion', 'ejecucion', 'finalizado');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."etapa_edicion" AS ENUM('ideas', 'evaluacion', 'votacion', 'seguimiento', 'cerrada');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."rol_admin" AS ENUM('admin', 'moderador', 'lector');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(200) NOT NULL,
	"nombre" text NOT NULL,
	"password_hash" text NOT NULL,
	"rol" "rol_admin" DEFAULT 'moderador' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "avances" (
	"id" serial PRIMARY KEY NOT NULL,
	"idea_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"etapa" "estado_presupuesto" NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"monto" numeric(14, 2),
	"porcentaje" smallint,
	"foto_url" text,
	"publicado" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text NOT NULL,
	"color" varchar(7) NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "categorias_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_consultas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pregunta" text NOT NULL,
	"respuesta" text,
	"herramientas" jsonb,
	"modelo" varchar(60),
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"cache_lectura" integer,
	"ms" integer,
	"ip_hash" varchar(64),
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "distritos" (
	"id" integer PRIMARY KEY NOT NULL,
	"numero" smallint NOT NULL,
	"nombre" text NOT NULL,
	"geojson" jsonb NOT NULL,
	"centroide_lat" numeric(10, 7) NOT NULL,
	"centroide_lon" numeric(10, 7) NOT NULL,
	"referencia" text,
	CONSTRAINT "distritos_numero_unique" UNIQUE("numero")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ediciones" (
	"id" serial PRIMARY KEY NOT NULL,
	"anio" smallint NOT NULL,
	"etapa" "etapa_edicion" DEFAULT 'ideas' NOT NULL,
	"presupuesto_total" numeric(14, 2),
	"ideas_desde" date,
	"ideas_hasta" date,
	"votacion_desde" date,
	"votacion_hasta" date,
	"activa" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ediciones_anio_unique" UNIQUE("anio")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faq" (
	"id" serial PRIMARY KEY NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"pregunta" text NOT NULL,
	"respuesta" text NOT NULL,
	"publicada" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hitos" (
	"id" serial PRIMARY KEY NOT NULL,
	"edicion_id" integer NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	"titulo" text NOT NULL,
	"detalle" text,
	"desde" date,
	"hasta" date,
	"etapa" "etapa_edicion"
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ideas" (
	"id" serial PRIMARY KEY NOT NULL,
	"edicion_id" integer NOT NULL,
	"distrito_id" integer,
	"categoria_id" integer,
	"numero" integer,
	"titulo" text NOT NULL,
	"slug" varchar(180) NOT NULL,
	"barrio" text,
	"barrio_normalizado" text,
	"problema" text,
	"solucion" text,
	"beneficios" text,
	"lat" numeric(10, 7),
	"lon" numeric(10, 7),
	"ubicacion_aproximada" boolean DEFAULT false NOT NULL,
	"estado" "estado_idea" DEFAULT 'pendiente' NOT NULL,
	"motivo_estado" text,
	"integrada_en_id" integer,
	"votos" integer DEFAULT 0 NOT NULL,
	"ganador" boolean DEFAULT false NOT NULL,
	"presupuesto_total" numeric(14, 2),
	"estado_presupuesto" "estado_presupuesto" DEFAULT 'sin_asignar' NOT NULL,
	"monto_preparacion" numeric(14, 2),
	"monto_contratacion" numeric(14, 2),
	"monto_ejecucion" numeric(14, 2),
	"monto_finalizado" numeric(14, 2),
	"canal" "canal_carga" DEFAULT 'web' NOT NULL,
	"autor_nombre" text,
	"autor_telefono" text,
	"autor_email" text,
	"cargado_por" text,
	"titulo_original" text,
	"coordenadas_originales" text,
	"notas_migracion" jsonb,
	"publicada" boolean DEFAULT true NOT NULL,
	"fecha" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "novedades" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"slug" varchar(180) NOT NULL,
	"copete" text,
	"cuerpo" text NOT NULL,
	"fecha" date NOT NULL,
	"distrito_id" integer,
	"imagen_url" text,
	"publicada" boolean DEFAULT true NOT NULL,
	CONSTRAINT "novedades_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit" (
	"clave" varchar(120) PRIMARY KEY NOT NULL,
	"contador" integer DEFAULT 0 NOT NULL,
	"ventana_desde" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "textos" (
	"clave" varchar(100) PRIMARY KEY NOT NULL,
	"valor" text NOT NULL,
	"descripcion" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "votantes" (
	"id" serial PRIMARY KEY NOT NULL,
	"dni_hash" varchar(64) NOT NULL,
	"dni_cola" varchar(3),
	"nombre" text,
	"distrito_id" integer,
	"proveedor" varchar(30) NOT NULL,
	"proveedor_sub" text,
	"verificado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votantes_dni_hash_unique" UNIQUE("dni_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "votos" (
	"id" serial PRIMARY KEY NOT NULL,
	"edicion_id" integer NOT NULL,
	"votante_id" integer NOT NULL,
	"idea_id" integer NOT NULL,
	"distrito_id" integer NOT NULL,
	"ip_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votos_una_persona_un_voto" UNIQUE("edicion_id","votante_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "avances" ADD CONSTRAINT "avances_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "hitos" ADD CONSTRAINT "hitos_edicion_id_ediciones_id_fk" FOREIGN KEY ("edicion_id") REFERENCES "public"."ediciones"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ideas" ADD CONSTRAINT "ideas_edicion_id_ediciones_id_fk" FOREIGN KEY ("edicion_id") REFERENCES "public"."ediciones"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ideas" ADD CONSTRAINT "ideas_distrito_id_distritos_id_fk" FOREIGN KEY ("distrito_id") REFERENCES "public"."distritos"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ideas" ADD CONSTRAINT "ideas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "novedades" ADD CONSTRAINT "novedades_distrito_id_distritos_id_fk" FOREIGN KEY ("distrito_id") REFERENCES "public"."distritos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "votantes" ADD CONSTRAINT "votantes_distrito_id_distritos_id_fk" FOREIGN KEY ("distrito_id") REFERENCES "public"."distritos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "votos" ADD CONSTRAINT "votos_edicion_id_ediciones_id_fk" FOREIGN KEY ("edicion_id") REFERENCES "public"."ediciones"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "votos" ADD CONSTRAINT "votos_votante_id_votantes_id_fk" FOREIGN KEY ("votante_id") REFERENCES "public"."votantes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "votos" ADD CONSTRAINT "votos_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "votos" ADD CONSTRAINT "votos_distrito_id_distritos_id_fk" FOREIGN KEY ("distrito_id") REFERENCES "public"."distritos"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "avances_idea_idx" ON "avances" USING btree ("idea_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ideas_edicion_slug_idx" ON "ideas" USING btree ("edicion_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_distrito_idx" ON "ideas" USING btree ("distrito_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_estado_idx" ON "ideas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_edicion_idx" ON "ideas" USING btree ("edicion_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "votantes_distrito_idx" ON "votantes" USING btree ("distrito_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "votos_idea_idx" ON "votos" USING btree ("idea_id");