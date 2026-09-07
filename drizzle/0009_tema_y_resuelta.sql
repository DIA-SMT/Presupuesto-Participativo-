-- El tema de cada consulta al chat y si Migue la pudo resolver.
--
-- Por que: /admin/migue reparte las consultas por tema, muestra cual es el mas
-- demandado, como se usa el chat en el tiempo y -- lo que de verdad sirve -- que
-- quedo SIN resolver, porque cada pregunta que Migue no supo contestar es
-- contenido que le falta al sitio.
--
-- Las dos columnas se escriben en el momento de registrar la consulta y no se
-- calculan despues sobre la tabla: la senal que decide si quedo resuelta es cual
-- herramienta trajo datos y cual volvio vacia, y esa senal solo existe mientras
-- la consulta esta corriendo (ver `clasificarConsulta` en src/lib/chat-temas.ts).
--
-- `tema` es un enum y no texto libre por lo mismo que `entidad_sistema`: el panel
-- reparte el total entre esos valores y ninguno puede aparecer de la nada. Los
-- valores salen de TEMAS en el clasificador, asi que la base y el codigo que la
-- escribe no pueden discrepar.
--
-- Tres indices, uno por lectura del panel: `fecha` para el listado y la serie
-- por dia, `(tema, fecha)` para el reparto por tema dentro de una ventana, y uno
-- PARCIAL sobre las sin resolver, que son pocas sobre el total y son las que el
-- equipo mira todos los dias.
--
-- Ningun dato personal nuevo: no se agrega nada que identifique a quien
-- pregunto. `ip_hash` sigue hasheada, y `modelo` y los tokens siguen en la tabla
-- para auditar el costo, sin que ninguna pantalla los dibuje.
--
-- POR QUE VA TODA CON GUARDAS, si desde la 0003 las migraciones no se editan a
-- mano: estos seis objetos YA existen en la base compartida del equipo. Los creo
-- la migracion 0006 de la rama Agustin el 25/08, antes de que esa rama y main
-- divergieran; despues main sumo su propia 0005 y 0006, que son otras, y quedo
-- mas adelante en el registro. Hay tres bases que atender a la vez:
--
--   * la compartida (Supabase) ya los tiene   -> aca es un no-op;
--   * una base nueva y las PGlite de pruebas  -> los crea;
--   * una PGlite local que seguia a main      -> los crea.
--
-- CREATE TYPE no admite IF NOT EXISTS, asi que el enum va en un bloque DO, igual
-- que en las migraciones 0000 a 0002 y por el mismo motivo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tema_consulta') THEN
    CREATE TYPE "public"."tema_consulta" AS ENUM('proyectos', 'distrito', 'presentar_idea', 'votar', 'cronograma', 'presupuesto', 'otro');
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "chat_consultas" ADD COLUMN IF NOT EXISTS "tema" "tema_consulta" DEFAULT 'otro' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_consultas" ADD COLUMN IF NOT EXISTS "resuelta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_consultas_fecha_idx" ON "chat_consultas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_consultas_tema_fecha_idx" ON "chat_consultas" USING btree ("tema","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_consultas_sin_resolver_idx" ON "chat_consultas" USING btree ("created_at") WHERE NOT "chat_consultas"."resuelta";
