/**
 * Conexion a la base de datos, con dos drivers segun el entorno:
 *
 *  - Sin DATABASE_URL (o con "pglite:..."): PGlite, un Postgres embebido que
 *    corre dentro de Node. No requiere Docker, servicios ni instalacion:
 *    la base vive en la carpeta ./data/pg. Es el modo de desarrollo y sirve
 *    tambien para un despliegue chico en un unico servidor.
 *
 *  - Con DATABASE_URL=postgres://...: un Postgres real via postgres.js, para
 *    produccion con base gestionada. El resto del codigo no cambia.
 *
 * Nota de PGlite: es de proceso unico. No correr `npm run seed` mientras
 * `npm run dev` esta levantado (la carpeta de datos queda bloqueada).
 */
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.DATABASE_URL?.trim() ?? "";
const usaPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

/** Ruta de la carpeta de datos de PGlite. */
export const RUTA_PGLITE = url.startsWith("pglite:")
  ? url.slice("pglite:".length)
  : "./data/pg";

/**
 * Tipo comun a ambos drivers: la API de consultas es identica, solo cambia el
 * transporte. Asi las firmas de insert/update/select no se bifurcan.
 */
type BaseDatos = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * En desarrollo Next recarga los modulos en cada cambio, asi que la conexion
 * se guarda en globalThis para no abrir una instancia nueva por recarga.
 */
const globalParaDb = globalThis as unknown as { ppDb?: BaseDatos };

function crear(): BaseDatos {
  if (usaPostgres) {
    const cliente = postgres(url, {
      // Cada pagina dispara varias consultas en paralelo: un pool chico forma
      // cola cuando la base esta lejos (Supabase en sa-east-1).
      max: 10,
      idle_timeout: 20,
      connect_timeout: 20,
      // El pooler de Supabase (puerto 6543, modo transaccion) no soporta
      // prepared statements: hay que desactivarlos.
      prepare: !/pooler\.supabase\.|:6543\//.test(url),
    });
    return drizzlePostgres(cliente, { schema });
  }
  return drizzlePglite(new PGlite(RUTA_PGLITE), { schema });
}

function obtener(): BaseDatos {
  if (!globalParaDb.ppDb) globalParaDb.ppDb = crear();
  return globalParaDb.ppDb;
}

/**
 * La conexion se abre en la PRIMERA consulta, no al importar el modulo.
 * Es importante con PGlite: el build de Next evalua los modulos en varios
 * workers a la vez, y si cada import abriera la carpeta de datos, dos procesos
 * simultaneos la corromperian. Con paginas dinamicas el build no consulta
 * nada, asi que con la apertura perezosa nunca llega a tocar la base.
 */
export const db: BaseDatos = new Proxy({} as BaseDatos, {
  get(_objetivo, propiedad) {
    const valor = Reflect.get(
      obtener() as object,
      propiedad,
      obtener(),
    ) as unknown;
    return typeof valor === "function"
      ? (valor as (...argumentos: unknown[]) => unknown).bind(obtener())
      : valor;
  },
});

/**
 * Ejecuta SQL crudo (template `sql` de drizzle-orm) y devuelve siempre un
 * arreglo de filas, sea cual sea el driver. Usar para consultas que la API
 * tipada de Drizzle no expresa bien (agregaciones con FILTER, upserts con
 * CASE, etc.).
 */
export async function consultar<T extends Record<string, unknown>>(
  consulta: SQL,
): Promise<T[]> {
  const resultado = (await db.execute(consulta)) as unknown;
  if (Array.isArray(resultado)) return resultado as T[];
  if (
    resultado &&
    typeof resultado === "object" &&
    Array.isArray((resultado as { rows?: unknown }).rows)
  ) {
    return (resultado as { rows: T[] }).rows;
  }
  return [];
}

export { schema };
