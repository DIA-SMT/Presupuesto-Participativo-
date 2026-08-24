-- Suma el valor 'presupuesto' al enum accion_revision, para poder auditar en
-- `revisiones` los cambios del presupuesto asignado a un proyecto
-- (`ideas.presupuesto_total`): es plata publica y el monto anterior y el nuevo
-- tienen que quedar por escrito, igual que un cambio de estado.
--
-- OJO con Postgres: un valor de enum agregado con ALTER TYPE ... ADD VALUE no
-- se puede USAR en la misma transaccion que lo agrega (el catalogo recien esta
-- visible para las demas transacciones al commitear). Esta migracion solo
-- agrega el valor y no inserta ni compara nada contra el, asi que corre sin
-- problema dentro de la transaccion del runner; la aplicacion empieza a
-- escribir 'presupuesto' despues, en otra transaccion.
--
-- Sin IF NOT EXISTS a proposito: si el valor ya estuviera, la migracion tiene
-- que fallar y avisar, no seguir en silencio. Probada contra una PGlite
-- descartable (DATABASE_URL="pglite:./data/pg-prueba0003") antes de aplicarla.

ALTER TYPE "public"."accion_revision" ADD VALUE 'presupuesto';
