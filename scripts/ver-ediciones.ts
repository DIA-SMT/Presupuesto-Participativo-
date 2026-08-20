import "./cargar-env";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const ediciones = await sql`SELECT anio, etapa, activa FROM ediciones ORDER BY anio`;
  const [ideas] = await sql`SELECT count(*)::int AS n FROM ideas`;
  console.log("ediciones:", JSON.stringify(ediciones));
  console.log("ideas:", ideas.n);
  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
