/** Que migraciones estan aplicadas en la base a la que apunta DATABASE_URL. */
import "./cargar-env";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  const aplicadas = await sql<{ hash: string; created_at: string }[]>`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
  `;
  console.log(`migraciones aplicadas: ${aplicadas.length}`);

  const columnas = await sql`
    SELECT column_name, data_type, column_default
      FROM information_schema.columns
     WHERE table_name = 'chat_consultas'
       AND column_name IN ('origen', 'tokens_entrada', 'tokens_salida', 'cache_lectura')
     ORDER BY column_name
  `;
  console.log("columnas de costo y origen en chat_consultas:");
  console.table(columnas);

  const tablas = await sql<{ table_name: string }[]>`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name
  `;
  console.log(`\ntablas (${tablas.length}): ${tablas.map((t) => t.table_name).join(", ")}`);

  const acciones = await sql<{ enumlabel: string }[]>`
    SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = enumtypid
     WHERE typname = 'accion_revision'
     ORDER BY enumsortorder
  `;
  console.log(`accion_revision: ${acciones.map((a) => a.enumlabel).join(", ")}`);

  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
