-- Row Level Security encendido en las 18 tablas de `public`, SIN politicas.
--
-- Por que: Supabase publica el esquema `public` por su Data API (PostgREST).
-- Las peticiones entran con los roles `anon` o `authenticated`, que por los
-- permisos por defecto de Supabase tienen SELECT, INSERT, UPDATE y DELETE sobre
-- cada tabla que se crea ahi. La anon key es publica por diseno (viaja en el
-- navegador de cualquier app de Supabase), asi que con la Data API activa y sin
-- RLS cualquiera podia leer `admins.password_hash`, el padron entero y los
-- votos, y escribir en ellos, sin pasar por este sitio. Este sitio no usa la
-- Data API para nada: todo va por el servidor con la connection string.
--
-- Con RLS encendido y ninguna politica, `anon` y `authenticated` no ven ni una
-- fila y no pueden insertar ninguna. No se escriben politicas a proposito: una
-- politica es una puerta, y aca no hay nadie a quien abrirsela.
--
-- A la aplicacion NO la afecta, porque entra con el rol dueno de las tablas y el
-- dueno se saltea RLS salvo que la tabla tenga FORCE ROW LEVEL SECURITY, que no
-- se usa. `service_role` tampoco se ve afectado: tiene BYPASSRLS. Lo prueba
-- scripts/tests/base-segura.test.ts, contra las migraciones reales: el dueno
-- lee y escribe como siempre, y un rol con permisos pero sin ser dueno no ve
-- nada.
--
-- ANTES DE APLICARLA EN SUPABASE conviene confirmar que el usuario de la
-- DATABASE_URL es el dueno de todas las tablas (o tiene BYPASSRLS). Si alguna
-- tabla la creo otro rol, esa tabla dejaria de responderle a la aplicacion.
-- Consulta de solo lectura, desde el SQL Editor:
--
--   SELECT c.relname, pg_get_userbyid(c.relowner) AS dueno, c.relrowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;
--
-- Todas tienen que decir el mismo dueno que `SELECT current_user` desde la
-- aplicacion (en el pooler, `postgres`). Si una tabla no es del mismo dueno,
-- ALTER TABLE falla con "must be owner of table", que es preferible a seguir.
--
-- ENABLE ROW LEVEL SECURITY es idempotente: si alguna tabla ya lo tenia (el
-- panel de Supabase ofrece encenderlo con un boton), la sentencia no hace nada.
-- Por eso no lleva guardas: no hay nada que pueda existir y hacerla fallar.
--
-- Generada con `npm run db:generate` desde `.enableRLS()` en src/db/schema.ts;
-- el SQL de abajo es el que escribio drizzle-kit, sin tocar. Probada desde cero
-- (todas las migraciones seguidas) contra PGlite descartables; NO se aplico
-- contra la base compartida.

ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "avances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bitacora_equipo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bitacora_sistema" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "categorias" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_consultas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "distritos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ediciones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faq" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hitos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ideas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "informes_impacto" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "novedades" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revisiones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "textos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "votantes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "votos" ENABLE ROW LEVEL SECURITY;
