-- Fase 2: lo que necesitan las pantallas de equipo, contenido y la carga y
-- correccion de ideas desde el panel. Solo agrega: ocho valores de enum y dos
-- columnas con valor por defecto. No toca ni reescribe ninguna fila.
--
--   admins.version_sesion   va dentro del JWT del panel: subirla corta todas
--                           las sesiones abiertas de la cuenta (baja, cambio de
--                           rol, cambio de contrasena).
--   ideas.canal_detalle     de que asamblea o por que via llego una idea que
--                           cargo el equipo. No es publico.
--   estado_idea             + descartado (prueba, spam, carga repetida).
--   accion_revision         + alta, correccion, descarte.
--   accion_sistema          + novedad_editada, faq_guardada, faq_borrada.
--   entidad_sistema         + faq.
--
-- Sobre los ADD VALUE: el runner aplica todas las migraciones pendientes en una
-- sola transaccion (ver 0011). Desde Postgres 12, ALTER TYPE ... ADD VALUE se
-- puede correr dentro de una transaccion, con una condicion: el valor nuevo no
-- se puede USAR en esa misma transaccion. Nada de esta migracion ni de las
-- anteriores lo usa, asi que se aplica bien junto con otras. Supabase corre
-- Postgres 15 o posterior, y PGlite tambien es 15+.

ALTER TYPE "public"."accion_revision" ADD VALUE 'alta';--> statement-breakpoint
ALTER TYPE "public"."accion_revision" ADD VALUE 'correccion';--> statement-breakpoint
ALTER TYPE "public"."accion_revision" ADD VALUE 'descarte';--> statement-breakpoint
ALTER TYPE "public"."accion_sistema" ADD VALUE 'novedad_editada';--> statement-breakpoint
ALTER TYPE "public"."accion_sistema" ADD VALUE 'faq_guardada';--> statement-breakpoint
ALTER TYPE "public"."accion_sistema" ADD VALUE 'faq_borrada';--> statement-breakpoint
ALTER TYPE "public"."entidad_sistema" ADD VALUE 'faq';--> statement-breakpoint
ALTER TYPE "public"."estado_idea" ADD VALUE 'descartado';--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "version_sesion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ideas" ADD COLUMN "canal_detalle" text;