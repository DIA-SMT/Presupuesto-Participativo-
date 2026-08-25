/**
 * Aplica las migraciones versionadas de ./drizzle sobre la base configurada.
 *
 * Reemplaza a `drizzle-kit push`, que comparaba el esquema contra la base y
 * proponia el DDL en el momento: sin SQL revisable, sin registro de lo que se
 * aplico y con DROPs sugeridos para cualquier columna que estuviera en la base
 * y no en schema.ts (lo que pasa siempre que dos ramas tocan el esquema).
 *
 * Funciona con los dos drivers, igual que src/db/index.ts: PGlite embebido en
 * desarrollo y Postgres (Supabase) cuando hay DATABASE_URL.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrarNodePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migrarPglite } from "drizzle-orm/pglite/migrator";
import { RUTA_PGLITE } from "../src/db";

const CARPETA = "./drizzle";

async function main() {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  const usaPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

  if (usaPostgres) {
    const { host, port } = new URL(url);
    console.log(`Migrando Postgres en ${host}${port ? "" : " (puerto por defecto)"}`);
    // Una sola conexion: el DDL es secuencial y no hay que ocupar el pooler.
    const pool = new Pool({
      connectionString: url,
      max: 1,
      connectionTimeoutMillis: 20_000,
    });
    try {
      await migrarNodePg(drizzleNodePg(pool), { migrationsFolder: CARPETA });
    } finally {
      await pool.end();
    }
  } else {
    console.log(`Migrando PGlite en ${RUTA_PGLITE}`);
    const cliente = new PGlite(RUTA_PGLITE);
    try {
      await migrarPglite(drizzlePglite(cliente), { migrationsFolder: CARPETA });
    } finally {
      await cliente.close();
    }
  }

  console.log("Migraciones al dia.");
}

main().catch((e) => {
  console.error("FALLO la migracion:", e?.message ?? e);
  console.error(
    "\nSi el error es de conexion contra el pooler de Supabase (puerto 6543),\n" +
      "probar con el Session pooler en el puerto 5432: el modo transaccion del\n" +
      "pooler no siempre admite DDL.",
  );
  process.exit(1);
});
