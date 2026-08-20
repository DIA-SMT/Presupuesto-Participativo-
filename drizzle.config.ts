import { config } from "dotenv";

// Los scripts corren fuera de Next: cargar .env.local (y .env como respaldo).
config({ path: [".env.local", ".env"] });
import type { Config } from "drizzle-kit";

const url = process.env.DATABASE_URL?.trim() ?? "";
const usaPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

/**
 * Sin DATABASE_URL se usa PGlite (Postgres embebido) sobre ./data/pg:
 * no requiere Docker ni ningun servicio instalado.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(usaPostgres
    ? { dbCredentials: { url } }
    : {
        driver: "pglite",
        dbCredentials: {
          url: url.startsWith("pglite:") ? url.slice("pglite:".length) : "./data/pg",
        },
      }),
} satisfies Config;
