/** Ultimas consultas al modelo, con su origen y su costo en tokens. */
import "./cargar-env";
import { abrirPostgres } from "./conexion-directa";

async function main() {
  const pool = abrirPostgres();

  const { rows: ultimas } = await pool.query(`
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
  `);
  console.log("Últimas consultas:");
  console.table(ultimas);

  const { rows: porOrigen } = await pool.query(`
    SELECT origen,
           count(*)::int AS consultas,
           coalesce(sum(tokens_entrada), 0)::int AS tokens_entrada,
           coalesce(sum(tokens_salida), 0)::int AS tokens_salida
      FROM chat_consultas
     GROUP BY origen
     ORDER BY 2 DESC
  `);
  console.log("\nPor origen:");
  console.table(porOrigen);

  // Que pregunta la gente, agrupado. Solo `origen = 'chat'`: en las otras dos
  // funciones `pregunta` no es la pregunta de una persona, y mezclarlas fue
  // justamente lo que volvio ilegible al listado que tenia el panel.
  //
  // Se agrupa por `pregunta_normalizada`, que ya viene en minusculas, sin
  // tildes y sin signos: "¿Cómo voto?" y "como voto" cuentan como una sola. Las
  // filas anteriores a la migracion 0008 la tienen en NULL y quedan fuera; el
  // conteo de abajo dice cuantas son, para que el total no parezca perdido.
  const { rows: repetidas } = await pool.query(`
    SELECT pregunta_normalizada AS pregunta,
           count(*)::int AS veces,
           max(created_at)::date AS ultima
      FROM chat_consultas
     WHERE origen = 'chat'
       AND pregunta_normalizada IS NOT NULL
     GROUP BY pregunta_normalizada
     ORDER BY veces DESC, ultima DESC
     LIMIT 15
  `);
  const {
    rows: [{ sin_clave: sinClave }],
  } = await pool.query<{ sin_clave: number }>(`
    SELECT count(*)::int AS sin_clave
      FROM chat_consultas
     WHERE origen = 'chat'
       AND pregunta_normalizada IS NULL
  `);
  console.log("\nQué pregunta la gente (chat, agrupado sin tildes ni signos):");
  if (repetidas.length) console.table(repetidas);
  else console.log("  todavía no hay ninguna consulta con la clave cargada.");
  if (sinClave > 0) {
    console.log(
      `  (${sinClave} consulta${sinClave === 1 ? "" : "s"} anterior${
        sinClave === 1 ? "" : "es"
      } a la migración 0008 no tiene${sinClave === 1 ? "" : "n"} clave y no entra${
        sinClave === 1 ? "" : "n"
      } en el agrupado.)`,
    );
  }

  await pool.end();
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
