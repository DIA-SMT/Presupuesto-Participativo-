-- Reaplicable a proposito (igual que la 0000).
--
-- Cuando se escribio esta migracion la base de Supabase ya tenia el esquema
-- aplicado por fuera del runner (con drizzle-kit push), asi que el registro de
-- drizzle.__drizzle_migrations estaba vacio y correr el runner habria fallado en
-- la primera sentencia. Con IF NOT EXISTS / IF EXISTS y los bloques DO, aplicarla
-- sobre esa base no cambia nada y solo deja el registro al dia; sobre una base
-- vacia crea todo.
--
-- Esto NO es la norma: de la 0003 en adelante las migraciones se aplican SIEMPRE
-- con "npm run db:migrate" y no se editan a mano. "drizzle-kit push" no se usa.

DO $$ BEGIN
	CREATE TYPE "public"."accion_equipo" AS ENUM('alta', 'cambio_rol', 'desactivacion', 'reactivacion', 'cambio_password');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."accion_revision" AS ENUM('evaluacion', 'publicacion', 'despublicacion', 'proclamacion', 'reapertura');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bitacora_equipo" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"admin_nombre" text NOT NULL,
	"objetivo_id" integer,
	"objetivo_email" varchar(200) NOT NULL,
	"accion" "accion_equipo" NOT NULL,
	"rol_anterior" "rol_admin",
	"rol_nuevo" "rol_admin",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revisiones" (
	"id" serial PRIMARY KEY NOT NULL,
	"idea_id" integer NOT NULL,
	"admin_id" integer,
	"admin_nombre" text NOT NULL,
	"accion" "accion_revision" NOT NULL,
	"estado_anterior" "estado_idea",
	"estado_nuevo" "estado_idea",
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "debe_cambiar_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "ultimo_ingreso" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "estado_actualizado_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "revisado_por_id" integer;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "autor_avisos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "autor_avisos_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "autor_avisos_version" varchar(20);--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN IF NOT EXISTS "contacto_purgado_en" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bitacora_equipo" ADD CONSTRAINT "bitacora_equipo_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bitacora_equipo" ADD CONSTRAINT "bitacora_equipo_objetivo_id_admins_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "revisiones" ADD CONSTRAINT "revisiones_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bitacora_equipo_fecha_idx" ON "bitacora_equipo" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revisiones_idea_idx" ON "revisiones" USING btree ("idea_id","created_at");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ideas" ADD CONSTRAINT "ideas_integrada_en_id_ideas_id_fk" FOREIGN KEY ("integrada_en_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "ideas" ADD CONSTRAINT "ideas_revisado_por_id_admins_id_fk" FOREIGN KEY ("revisado_por_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ediciones_una_activa_idx" ON "ediciones" USING btree ("activa") WHERE "ediciones"."activa";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_bandeja_idx" ON "ideas" USING btree ("edicion_id","estado","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ideas_edicion_numero_idx" ON "ideas" USING btree ("edicion_id","numero");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "votos_edicion_fecha_idx" ON "votos" USING btree ("edicion_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "votos_edicion_distrito_idx" ON "votos" USING btree ("edicion_id","distrito_id");