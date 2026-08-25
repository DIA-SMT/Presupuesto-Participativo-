-- Tercera bitacora del backoffice: `bitacora_sistema`, mas los dos enums que
-- necesita (`accion_sistema` y `entidad_sistema`).
--
-- Por que: hasta ahora se auditaba lo que se le hace a UNA idea (`revisiones`) y
-- lo que se le hace a UNA cuenta (`bitacora_equipo`). Las diez acciones del panel
-- que cambian el sistema o el contenido publico no dejaban ningun rastro, y ahi
-- estan las mas consecuentes de todas: el cambio de etapa de la edicion activa
-- (define lo que ve el sitio y abre o cierra la votacion publica), las fechas y
-- el presupuesto de una edicion, la activacion de una edicion, el cronograma,
-- los textos del sitio, las novedades y los avances de obra que ve el vecino.
-- Cualquiera de esos cambios se podia hacer sin que quedara quien, cuando ni
-- desde que valor.
--
-- La tabla es append-only y se lee sin cruzar tablas: guarda copia del nombre de
-- quien hizo el cambio, la entidad, su id y una etiqueta legible, mas el ANTES y
-- el DESPUES ya en texto. Detalle de cada columna en src/db/schema.ts.
--
-- `entidad_id` NO lleva clave foranea a proposito: apunta a una fila que puede
-- desaparecer (un hito o un avance borrado) y el registro tiene que quedar
-- igual. La unica FK es `admin_id`, con ON DELETE SET NULL: si se borra la
-- cuenta, se pierde el vinculo pero no el registro, porque el nombre esta
-- copiado en `admin_nombre`.
--
-- El indice es por `created_at`: el listado del panel sale siempre por fecha
-- descendente y los filtros por accion y entidad se aplican sobre esa lectura.
--
-- Migracion nueva, sin IF NOT EXISTS: si algo de esto ya existiera en la base
-- tiene que fallar y avisar, no seguir en silencio. Probada desde cero (las 5
-- migraciones seguidas) contra una PGlite descartable
-- (DATABASE_URL="pglite:./data/pg-prueba0004"); NO se aplico contra la base
-- compartida del equipo, eso lo hace quien la despliegue con "npm run db:migrate".

CREATE TYPE "public"."accion_sistema" AS ENUM('cambio_etapa', 'edicion_creada', 'edicion_editada', 'edicion_activada', 'hito_guardado', 'hito_borrado', 'texto_guardado', 'novedad_creada', 'avance_creado', 'avance_borrado');--> statement-breakpoint
CREATE TYPE "public"."entidad_sistema" AS ENUM('edicion', 'hito', 'texto', 'novedad', 'avance');--> statement-breakpoint
CREATE TABLE "bitacora_sistema" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer,
	"admin_nombre" text NOT NULL,
	"accion" "accion_sistema" NOT NULL,
	"entidad" "entidad_sistema" NOT NULL,
	"entidad_id" integer,
	"entidad_etiqueta" text NOT NULL,
	"valor_anterior" text,
	"valor_nuevo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bitacora_sistema" ADD CONSTRAINT "bitacora_sistema_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bitacora_sistema_fecha_idx" ON "bitacora_sistema" USING btree ("created_at");