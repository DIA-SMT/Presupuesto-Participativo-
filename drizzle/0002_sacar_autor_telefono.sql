-- DROP deliberado, no un accidente del generador.
--
-- `ideas.autor_telefono` se pedia en el formulario publico y NINGUNA consulta
-- lo leia: era un dato personal sin finalidad ni lector, es decir puro pasivo.
-- Verificado antes de borrar: de las 100 ideas de la edicion 2025, cero tenian
-- telefono cargado (el ETL del sitio anterior no trajo datos de contacto), asi
-- que la columna estaba vacia y el DROP no perdio nada.
--
-- El campo ya salio del formulario y de /api/ideas en el mismo cambio.
--
-- El IF EXISTS es porque el esquema de Supabase se aplico una vez por fuera del
-- runner (con drizzle-kit push) y la columna ya no esta: asi la migracion se
-- puede correr igual y dejar el registro al dia. De la 0003 en adelante las
-- migraciones se aplican SIEMPRE con "npm run db:migrate" y no se editan a mano.

ALTER TABLE "ideas" DROP COLUMN IF EXISTS "autor_telefono";
