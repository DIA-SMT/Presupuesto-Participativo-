/** Prueba rapida de conexion a la base configurada en DATABASE_URL. */
import "./cargar-env";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL vacia");
  const sql = postgres(url, { max: 1, connect_timeout: 15 });
  const r = await sql`SELECT version() AS v, current_database() AS db`;
  console.log("CONECTADO:", String(r[0].v).slice(0, 55), "| base:", r[0].db);
  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
