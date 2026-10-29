/**
 * Borra los datos de contacto del autor de las ideas: los de las ediciones
 * cerradas, o los de una sola idea cuando llega un pedido de supresion.
 *
 * Por que existe: /privacidad le promete al vecino que el correo se usa solo
 * para contarle como sigue su idea y que se borra cuando cierra la edicion. Sin
 * este script esa promesa no se cumple, y el art. 4 inc. 7 de la ley 25.326
 * obliga a destruir los datos cuando dejan de ser necesarios para la finalidad
 * con la que se recogieron. La misma pagina promete atender un pedido de
 * supresion (art. 16) en 5 dias habiles: eso es --idea, que toca una sola fila.
 *
 * Que borra: `autor_email` y `autor_nombre`. Deja `autor_avisos` en false y
 * escribe `contacto_purgado_en`, que es la constancia de que la purga se hizo
 * (la fila de la idea no se toca en nada mas: el contenido de la propuesta es
 * publico y se conserva).
 *
 * Uso:
 *   npm run purgar-contactos                     -> muestra que haria, no escribe
 *   npm run purgar-contactos -- --confirmar       -> purga las ediciones cerradas
 *   npm run purgar-contactos -- --anio 2025       -> solo esa edicion, si esta cerrada
 *   npm run purgar-contactos -- --anio 2026 --idea 12
 *        -> un pedido de supresion: solo la idea #12 de 2026, en cualquier etapa
 *   --edicion-entera  con --anio, purga toda la edicion aunque no este cerrada
 *                     (deja al equipo sin saber quien presento cada idea)
 *
 * Que es cada cosa, y por que --anio solo no alcanza para un pedido de
 * supresion, esta en scripts/purga-contactos.ts.
 *
 * Sin --confirmar no escribe nada: es un borrado definitivo y conviene mirarlo
 * antes de correrlo. Con --idea, la vista previa muestra el titulo de la idea,
 * para confirmar que es la del pedido.
 *
 * En produccion es donde este script tiene sentido (ahi estan los contactos),
 * asi que se corre contra Supabase a proposito: con la URL en DATABASE_URL solo
 * para esa corrida y `--produccion` junto a `--confirmar`. Sin el flag, la
 * vista previa funciona igual, pero la purga se niega a escribir en una base
 * remota (scripts/produccion.ts).
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { consultar } from "../src/db";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";
import { aplicarPurga, armarPurga, leerOpciones, type PlanPurga } from "./purga-contactos";

function mostrar(plan: PlanPurga) {
  if (plan.idea) {
    const { idea } = plan;
    console.log(`Idea #${idea.numero} de ${plan.opciones.anio} (id ${idea.id}, ${idea.estado}): ${idea.titulo}`);
    if (idea.conVotante) {
      console.log(
        "  Se presento ingresando con CIDITUC: el nombre de la persona tambien esta en el\n" +
          "  padron (votantes.nombre), y esta purga no lo toca.",
      );
    }
    console.log("");
  }
  if (!plan.ediciones.length) return;
  console.log("Ediciones alcanzadas:");
  for (const fila of plan.ediciones) {
    console.log(`  ${fila.anio} (${fila.etapa}): ${fila.conContacto} ideas con contacto sin purgar`);
  }
}

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));
  const lectura = leerOpciones(argumentos);
  if (!lectura.ok) {
    console.error(lectura.error);
    process.exit(1);
  }
  const { opciones, confirmar } = lectura;

  // La vista previa solo lee: corre contra cualquier base y dice cual es, para
  // que nadie confunda los numeros de PGlite con los de produccion. La purga
  // pasa por el candado antes de la primera consulta.
  const destino = confirmar
    ? (await exigirPermisoDeEscritura(`npm run purgar-contactos -- ${argumentos.join(" ")}`))
        .destino
    : destinoDeLaBase(process.env.DATABASE_URL);
  console.log(`Base: ${destino.descripcion}\n`);

  // Con --confirmar el plan se lee despues de la espera del candado: lo que se
  // muestra es lo que hay al momento de escribir.
  const plan = await armarPurga(consultar, opciones);
  mostrar(plan);

  if (plan.negativa) {
    console.error(`\n${plan.negativa}\n\nNo se borro nada.`);
    process.exit(1);
  }

  if (opciones.anio === null && !plan.ediciones.length) {
    console.log("No hay ediciones cerradas con ideas cargadas: nada que purgar.");
    return;
  }

  if (plan.total === 0) {
    console.log("\nNo queda ningun contacto por borrar.");
    return;
  }

  if (!confirmar) {
    console.log(
      `\nSe borrarian los datos de contacto de ${plan.total} ideas.` +
        "\nEsto no se puede deshacer. Para hacerlo de verdad, volvé a correrlo con --confirmar.",
    );
    return;
  }

  const borradas = await aplicarPurga(consultar, opciones);
  console.log(`\nPurgadas ${borradas.length} ideas. La constancia quedo en contacto_purgado_en.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO la purga:", e?.message ?? e);
    process.exit(1);
  });
