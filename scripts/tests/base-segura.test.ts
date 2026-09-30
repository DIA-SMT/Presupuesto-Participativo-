/**
 * RLS en la base, probado contra las migraciones reales (migracion 0010).
 *
 * Todas las tablas de `public` lo tienen encendido y eso NO le cambia nada a la
 * aplicacion, que entra como duena de las tablas. Lo que si cambia es para
 * cualquier otro rol con permisos, que es lo que son `anon` y `authenticated`
 * en la Data API de Supabase: no ven nada y no escriben nada.
 *
 * PGlite corre como superusuario, y el superusuario se saltea RLS siempre: una
 * prueba que solo consultara con la conexion de la aplicacion pasaria aunque
 * RLS no hiciera nada. Por eso se prueba con dos roles sin privilegios creados
 * aca, uno dueno de la tabla y otro no, dentro de una transaccion que se
 * deshace al final.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is, type SQL } from "drizzle-orm";
import { crearBaseDePrueba, violacionDe, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;

test.before(async () => {
  base = await crearBaseDePrueba("segura");
});

test.after(async () => {
  await base.cerrar();
});

/** Filas de un `execute`, sea cual sea la forma que devuelva el driver. */
function filasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  return ((resultado as { rows?: T[] }).rows ?? []) as T[];
}

/** Para deshacer la transaccion de prueba a proposito, sin confundirlo con un fallo. */
class Deshacer extends Error {}

test("todas las tablas del esquema declaran .enableRLS()", () => {
  // Atrapa la tabla nueva antes de generar la migracion: si falta aca, la
  // migracion generada tampoco va a encenderlo.
  const tablas = Object.values(base.schema).filter((valor) => is(valor, PgTable)) as PgTable[];
  assert.ok(tablas.length >= 18, `se esperaban al menos 18 tablas, hay ${tablas.length}`);
  const sinRls = tablas.map(getTableConfig).filter((t) => !t.enableRLS).map((t) => t.name);
  assert.deepEqual(sinRls, [], `tablas sin .enableRLS(): ${sinRls.join(", ")}`);
});

test("en la base, todas las tablas de public tienen RLS y ninguna FORCE", async () => {
  const filas = await base.consultar<{ tabla: string; rls: boolean; forzado: boolean }>(base.sql`
    SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS forzado
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    ORDER BY 1
  `);
  assert.ok(filas.some((f) => f.tabla === "votantes"), "la consulta tiene que ver el esquema");
  assert.deepEqual(
    filas.filter((f) => !f.rls).map((f) => f.tabla),
    [],
    "tablas de public sin RLS",
  );
  // FORCE haria que RLS tambien aplique al dueno, y la aplicacion (que no tiene
  // politicas) dejaria de ver sus propias tablas.
  assert.deepEqual(
    filas.filter((f) => f.forzado).map((f) => f.tabla),
    [],
    "tablas con FORCE ROW LEVEL SECURITY",
  );
});

test("la duena de la tabla lee y escribe; otro rol con permisos no ve nada", async () => {
  await base.db.insert(base.schema.votantes).values({ dniHash: "a".repeat(64), proveedor: "dev" });

  await assert.rejects(
    base.db.transaction(async (tx) => {
      const ejecutar = async <T>(consulta: SQL) =>
        filasDe<T>(await tx.execute(consulta));

      // Como en Supabase: la aplicacion entra con el rol dueno de las tablas,
      // que NO es superusuario. `anon` es un rol con permisos y sin ser dueno.
      await ejecutar(base.sql`CREATE ROLE prueba_duena NOLOGIN`);
      await ejecutar(base.sql`CREATE ROLE prueba_anon NOLOGIN`);
      await ejecutar(base.sql`ALTER TABLE votantes OWNER TO prueba_duena`);
      await ejecutar(base.sql`GRANT SELECT, INSERT ON votantes TO prueba_anon`);
      await ejecutar(base.sql`GRANT USAGE ON SEQUENCE votantes_id_seq TO prueba_anon`);

      await ejecutar(base.sql`SET LOCAL ROLE prueba_duena`);
      const [comoDuena] = await ejecutar<{ n: number }>(
        base.sql`SELECT count(*)::int AS n FROM votantes`,
      );
      assert.ok(comoDuena.n >= 1, "la duena tiene que ver las filas");
      await ejecutar(
        base.sql`INSERT INTO votantes (dni_hash, proveedor) VALUES (${"b".repeat(64)}, 'dev')`,
      );

      await ejecutar(base.sql`SET LOCAL ROLE prueba_anon`);
      // Con permisos de SELECT y sin politicas, RLS devuelve CERO filas (no un
      // error de permisos): el 0 prueba que filtro RLS y no la falta de GRANT.
      const [comoAnon] = await ejecutar<{ n: number }>(
        base.sql`SELECT count(*)::int AS n FROM votantes`,
      );
      assert.equal(comoAnon.n, 0, "un rol que no es dueno no tiene que ver ninguna fila");
      await assert.rejects(
        () =>
          ejecutar(
            base.sql`INSERT INTO votantes (dni_hash, proveedor) VALUES (${"c".repeat(64)}, 'dev')`,
          ),
        violacionDe(/row-level security/i),
        "un rol que no es dueno no tiene que poder insertar",
      );

      throw new Deshacer();
    }),
    (error) => {
      // Cualquier otro error es una afirmacion que fallo adentro: que se vea.
      if (error instanceof Deshacer) return true;
      throw error;
    },
  );

  // La transaccion se deshizo: roles, dueno y la fila de prueba no quedaron.
  const [roles] = await base.consultar<{ n: number }>(
    base.sql`SELECT count(*)::int AS n FROM pg_roles WHERE rolname IN ('prueba_duena', 'prueba_anon')`,
  );
  assert.equal(roles.n, 0);
});
