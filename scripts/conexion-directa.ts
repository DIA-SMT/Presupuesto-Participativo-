/**
 * Un Pool de node-postgres contra el Postgres de DATABASE_URL, para los scripts
 * que hablan con la base sin pasar por src/db: los de diagnostico (ver-*.ts,
 * probar-db.ts) y aplicar-geografia.ts.
 *
 * Antes cada uno abria `postgres(process.env.DATABASE_URL!)` con postgres.js, y
 * eso tenia dos problemas:
 *
 *  - postgres.js arranca con `ssl: false`, y la URL de produccion no trae
 *    sslmode: consultas y resultados viajaban en claro, y si del otro lado
 *    alguien pedia la clave en texto plano, postgres.js se la daba. Es lo mismo
 *    que ya se habia corregido en scripts/migrar.ts. Aca la URL y el TLS salen
 *    de `opcionesDePool`, como en la aplicacion.
 *  - Sin DATABASE_URL, postgres.js caia a PGHOST/PGUSER/PGPASSWORD o a
 *    localhost, mientras el candado (scripts/produccion.ts) evaluaba "PGlite en
 *    ./data/pg" y dejaba pasar: el candado miraba una base y el script escribia
 *    en otra. Sin una URL de Postgres, aca no se conecta a nada.
 *
 * node-postgres y no postgres.js por lo mismo que src/db: sobre el pooler de
 * Supabase en modo transaccion, postgres.js entubaba consultas y el pooler
 * cruzaba los parametros.
 */
import { Pool } from "pg";
import { opcionesDePool } from "../src/db";

/**
 * El Pool, de una sola conexion. Si DATABASE_URL no es una URL de Postgres
 * (vacia, o `pglite:`), avisa y termina el proceso sin abrir nada. Cerrarlo
 * con `pool.end()` al terminar.
 */
export function abrirPostgres(opciones: { segundosDeEspera?: number } = {}): Pool {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    console.error(
      "\nNO SE ABRIO NINGUNA CONEXION: este script habla con un Postgres por" +
        "\nDATABASE_URL (postgresql://...), y DATABASE_URL no tiene una. Con PGlite" +
        "\n(sin DATABASE_URL, o con pglite:) no corre.\n",
    );
    process.exit(1);
  }
  return new Pool({
    ...opcionesDePool(url),
    max: 1,
    connectionTimeoutMillis: (opciones.segundosDeEspera ?? 20) * 1000,
  });
}
