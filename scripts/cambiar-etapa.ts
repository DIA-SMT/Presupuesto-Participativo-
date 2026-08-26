/**
 * Cambia la etapa de la edicion activa desde la terminal.
 *
 * El camino normal es /admin/ediciones, que ademas deja rastro en la bitacora.
 * Esto es para pruebas locales: `npx tsx scripts/cambiar-etapa.ts votacion`.
 */
import "./cargar-env";
import postgres from "postgres";

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"];

async function main() {
  const etapa = process.argv[2];
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  if (!etapa) {
    const filas = await sql`SELECT anio, etapa FROM ediciones WHERE activa`;
    console.log(`edición activa: ${filas[0]?.anio} en etapa "${filas[0]?.etapa}"`);
    console.log(`etapas posibles: ${ETAPAS.join(", ")}`);
    await sql.end();
    return;
  }

  if (!ETAPAS.includes(etapa)) {
    console.error(`Etapa desconocida: ${etapa}. Posibles: ${ETAPAS.join(", ")}`);
    await sql.end();
    process.exitCode = 1;
    return;
  }

  await sql`UPDATE ediciones SET etapa = ${etapa}::etapa_edicion WHERE activa`;
  const filas = await sql`SELECT anio, etapa FROM ediciones WHERE activa`;
  console.log(`edición ${filas[0]?.anio} → etapa "${filas[0]?.etapa}"`);
  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exitCode = 1;
});
