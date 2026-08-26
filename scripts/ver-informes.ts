/**
 * Informes de impacto generados, con su costo y su rastro.
 *
 * Sirve para comprobar la regla que sostiene toda la funcion: el informe NO
 * cambia el estado de la idea ni escribe la devolucion que lee el vecino.
 */
import "./cargar-env";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  const informes = await sql`
    SELECT i.idea_id,
           left(d.titulo, 34)        AS idea,
           d.estado                  AS estado_de_la_idea,
           (d.motivo_estado IS NOT NULL) AS tiene_devolucion_publicada,
           i.modelo,
           i.tokens_entrada,
           i.tokens_salida,
           i.ms,
           i.pedido_por_nombre
      FROM informes_impacto i
      JOIN ideas d ON d.id = i.idea_id
     ORDER BY i.created_at DESC
  `;
  if (!informes.length) {
    console.log("todavía no se generó ningún informe.");
    await sql.end();
    return;
  }
  console.log("Informes generados:");
  console.table(informes);

  const rastro = await sql`
    SELECT idea_id, admin_nombre, left(nota, 52) AS nota, created_at
      FROM revisiones
     WHERE accion = 'informe'
     ORDER BY created_at DESC
     LIMIT 5
  `;
  console.log("\nRastro en el historial de la idea:");
  console.table(rastro);

  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exitCode = 1;
});
