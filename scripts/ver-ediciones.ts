import "./cargar-env";
import { abrirPostgres } from "./conexion-directa";

async function main() {
  const pool = abrirPostgres();
  const { rows: ediciones } = await pool.query(
    "SELECT anio, etapa, activa FROM ediciones ORDER BY anio",
  );
  const {
    rows: [ideas],
  } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM ideas");
  console.log("ediciones:", JSON.stringify(ediciones));
  console.log("ideas:", ideas.n);
  await pool.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
