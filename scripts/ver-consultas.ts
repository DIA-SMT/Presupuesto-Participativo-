/** Ultimas consultas al modelo, con su origen y su costo en tokens. */
import "./cargar-env";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  const ultimas = await sql`
    SELECT origen,
           coalesce(modelo, '(sin modelo)') AS modelo,
           tokens_entrada,
           tokens_salida,
           ms,
           ok,
           left(pregunta, 38) AS pregunta
      FROM chat_consultas
     ORDER BY created_at DESC
     LIMIT 5
  `;
  console.log("Últimas consultas:");
  console.table(ultimas);

  const porOrigen = await sql`
    SELECT origen,
           count(*)::int AS consultas,
           coalesce(sum(tokens_entrada), 0)::int AS tokens_entrada,
           coalesce(sum(tokens_salida), 0)::int AS tokens_salida
      FROM chat_consultas
     GROUP BY origen
     ORDER BY 2 DESC
  `;
  console.log("\nPor origen:");
  console.table(porOrigen);

  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
