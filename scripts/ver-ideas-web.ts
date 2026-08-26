/**
 * Ideas cargadas por el formulario del sitio (canal "web").
 *
 * Sirve para separar las de vecinos reales de las de prueba: durante el
 * desarrollo se cargan ideas contra la base compartida y conviene poder verlas
 * y limpiarlas. Con `--borrar <id>` elimina una, si todavia no esta publicada.
 */
import "./cargar-env";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });

  const borrar = process.argv.indexOf("--borrar");
  if (borrar !== -1) {
    const id = Number(process.argv[borrar + 1]);
    if (!Number.isInteger(id)) {
      console.error("Falta el id: --borrar 123");
      await sql.end();
      process.exitCode = 1;
      return;
    }
    const filas = await sql`
      DELETE FROM ideas
       WHERE id = ${id} AND canal = 'web' AND NOT publicada
      RETURNING numero, titulo
    `;
    console.log(
      filas.length
        ? `borrada #${filas[0].numero}: ${filas[0].titulo}`
        : `no se borro nada (id ${id} no existe, no es del canal web, o ya esta publicada)`,
    );
    await sql.end();
    return;
  }

  const filas = await sql`
    SELECT id, numero, left(titulo, 46) AS titulo, estado, publicada, created_at
      FROM ideas
     WHERE canal = 'web'
     ORDER BY id
  `;
  if (!filas.length) console.log("no hay ideas cargadas por el formulario del sitio.");
  else console.table(filas);

  await sql.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exitCode = 1;
});
