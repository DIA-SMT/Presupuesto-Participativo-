/** Prueba rapida de conexion a la base configurada en DATABASE_URL. */
import "./cargar-env";
import { abrirPostgres } from "./conexion-directa";

async function main() {
  const pool = abrirPostgres({ segundosDeEspera: 15 });
  const { rows } = await pool.query<{ v: string; db: string }>(
    "SELECT version() AS v, current_database() AS db",
  );
  console.log("CONECTADO:", String(rows[0].v).slice(0, 55), "| base:", rows[0].db);
  await pool.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
