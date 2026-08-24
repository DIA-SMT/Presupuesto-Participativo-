/**
 * Borra los datos de contacto del autor de las ideas de una edicion cerrada.
 *
 * Por que existe: /privacidad le promete al vecino que el correo se usa solo
 * para contarle como sigue su idea y que se borra cuando cierra la edicion. Sin
 * este script esa promesa no se cumple, y el art. 4 inc. 7 de la ley 25.326
 * obliga a destruir los datos cuando dejan de ser necesarios para la finalidad
 * con la que se recogieron.
 *
 * Que borra: `autor_email` y `autor_nombre`. Deja `autor_avisos` en false y
 * escribe `contacto_purgado_en`, que es la constancia de que la purga se hizo
 * (la fila de la idea no se toca en nada mas: el contenido de la propuesta es
 * publico y se conserva).
 *
 * Uso:
 *   npm run purgar-contactos                    -> muestra que haria, no escribe
 *   npm run purgar-contactos -- --confirmar      -> purga las ediciones cerradas
 *   npm run purgar-contactos -- --anio 2025 --confirmar
 *
 * Sin --confirmar no escribe nada: es un borrado definitivo y conviene mirarlo
 * antes de correrlo.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { sql } from "drizzle-orm";
import { consultar, db } from "../src/db";

type Pendiente = {
  anio: number;
  etapa: string;
  con_contacto: number;
};

async function main() {
  const argumentos = process.argv.slice(2);
  const confirmar = argumentos.includes("--confirmar");
  const indiceAnio = argumentos.indexOf("--anio");
  const anio = indiceAnio >= 0 ? Number(argumentos[indiceAnio + 1]) : null;

  if (anio !== null && !Number.isInteger(anio)) {
    console.error("El valor de --anio tiene que ser un año, por ejemplo: --anio 2025");
    process.exit(1);
  }

  // Universo: por defecto las ediciones cerradas; con --anio, esa edicion sin
  // importar la etapa (sirve para cumplir un pedido de supresion puntual).
  const condicion = anio === null ? sql`e.etapa = 'cerrada'` : sql`e.anio = ${anio}`;

  const pendientes = await consultar<Pendiente>(sql`
    SELECT e.anio,
           e.etapa,
           count(*) FILTER (
             WHERE i.contacto_purgado_en IS NULL
               AND (i.autor_email IS NOT NULL OR i.autor_nombre IS NOT NULL)
           )::int AS con_contacto
      FROM ediciones e
      JOIN ideas i ON i.edicion_id = e.id
     WHERE ${condicion}
     GROUP BY e.anio, e.etapa
     ORDER BY e.anio
  `);

  if (!pendientes.length) {
    console.log(
      anio === null
        ? "No hay ediciones cerradas con ideas cargadas: nada que purgar."
        : `La edicion ${anio} no existe o no tiene ideas.`,
    );
    return;
  }

  const total = pendientes.reduce((suma, fila) => suma + Number(fila.con_contacto), 0);
  console.log("Ediciones alcanzadas:");
  for (const fila of pendientes) {
    console.log(
      `  ${fila.anio} (${fila.etapa}): ${fila.con_contacto} ideas con contacto sin purgar`,
    );
  }

  if (total === 0) {
    console.log("\nNo queda ningun contacto por borrar.");
    return;
  }

  if (!confirmar) {
    console.log(
      `\nSe borrarian los datos de contacto de ${total} ideas.` +
        "\nEsto no se puede deshacer. Para hacerlo de verdad, volve a correrlo con --confirmar.",
    );
    return;
  }

  const borradas = await consultar<{ id: number }>(sql`
    UPDATE ideas i
       SET autor_email = NULL,
           autor_nombre = NULL,
           autor_avisos = false,
           contacto_purgado_en = now(),
           updated_at = now()
      FROM ediciones e
     WHERE e.id = i.edicion_id
       AND ${condicion}
       AND i.contacto_purgado_en IS NULL
       AND (i.autor_email IS NOT NULL OR i.autor_nombre IS NOT NULL)
    RETURNING i.id
  `);

  console.log(`\nPurgadas ${borradas.length} ideas. La constancia quedo en contacto_purgado_en.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO la purga:", e?.message ?? e);
    process.exit(1);
  });
