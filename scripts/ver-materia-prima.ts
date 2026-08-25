/**
 * Cuanto texto real hay por idea. Es la materia prima de cualquier analisis
 * automatico: una idea sin problema ni solucion cargados no se puede analizar.
 */
import "./cargar-env";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  const [totales] = await sql`
    SELECT count(*)::int                                                        AS ideas,
           count(*) FILTER (WHERE problema IS NOT NULL)::int                    AS con_problema,
           count(*) FILTER (WHERE solucion IS NOT NULL)::int                    AS con_solucion,
           count(*) FILTER (WHERE problema IS NOT NULL AND solucion IS NOT NULL)::int AS con_ambos,
           count(*) FILTER (WHERE motivo_estado IS NOT NULL)::int               AS con_devolucion,
           count(*) FILTER (WHERE estado = 'no_factible' AND motivo_estado IS NULL)::int AS no_sin_devolucion,
           round(avg(length(coalesce(problema, '') || coalesce(solucion, ''))))::int AS largo_promedio
      FROM ideas
     WHERE publicada
  `;

  console.log("Sobre las ideas publicadas:");
  console.table(totales);

  const porEstado = await sql`
    SELECT estado,
           count(*)::int AS ideas,
           count(*) FILTER (WHERE problema IS NOT NULL AND solucion IS NOT NULL)::int AS analizables
      FROM ideas
     WHERE publicada
     GROUP BY estado
     ORDER BY 2 DESC
  `;
  console.log("\nPor estado:");
  console.table(porEstado);

  // La bandeja del admin muestra un contador de "no factibles sin devolucion":
  // aca se ve si cuenta tambien las despublicadas (los duplicados de 2025).
  const [deuda] = await sql`
    SELECT count(*) FILTER (WHERE estado = 'no_factible' AND motivo_estado IS NULL)::int AS todas,
           count(*) FILTER (WHERE estado = 'no_factible' AND motivo_estado IS NULL AND publicada)::int AS publicadas
      FROM ideas
  `;
  console.log(
    `\nno factibles sin devolucion -> total: ${deuda.todas} | publicadas: ${deuda.publicadas}`,
  );

  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
