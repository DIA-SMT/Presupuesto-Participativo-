/**
 * Limpia los datos de prueba antes del lanzamiento: votantes del login de
 * prueba, ideas cargadas en demos, sus votos, y el registro del chat y los
 * informes de impacto de cuando el equipo probaba. Que cuenta como prueba, y
 * por que, esta en scripts/limpieza-pruebas.ts.
 *
 *   npx tsx scripts/limpiar-pruebas.ts                          -> muestra que hay
 *   npx tsx scripts/limpiar-pruebas.ts --hasta 2026-10-31       -> muestra que se borraria
 *   npx tsx scripts/limpiar-pruebas.ts --hasta 2026-10-31 --confirmar
 *        -> lo borra (contra una base remota, ademas --produccion)
 *   --incluir-cidituc  suma a los votantes verificados por CIDITUC (el equipo
 *                      que probo el ingreso real). Son personas reales: solo
 *                      si se sabe que todos los de antes del lanzamiento fueron
 *                      pruebas.
 *
 * La fecha de corte es obligatoria para borrar ideas, chat e informes, y es
 * inclusive (hasta el fin de ese dia, hora de Tucuman). Se pone el dia ANTERIOR
 * a la apertura: lo de despues ya es de vecinos. Sin --confirmar no escribe
 * nada: primero se mira la lista, despues se borra.
 *
 * No muestra nombres ni DNIs: del padron solo el id, el proveedor, el distrito y
 * la fecha. Para decidir si una fila es de prueba alcanza con eso.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { consultar, db } from "../src/db";
import * as schema from "../src/db/schema";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";
import { aplicarPlan, armarPlan, fechaDeCorte, type PlanLimpieza } from "./limpieza-pruebas";

function valorDe(argumentos: string[], flag: string): string | null {
  const indice = argumentos.indexOf(flag);
  return indice === -1 ? null : (argumentos[indice + 1] ?? "");
}

function mostrar(plan: PlanLimpieza) {
  const { votantes, ideas, opciones } = plan;
  console.log(`\nVotantes de prueba: ${votantes.length}` +
    (opciones.incluirCidituc ? " (incluye los de CIDITUC)" : " (sin los de CIDITUC)"));
  for (const v of votantes) {
    console.log(`  #${v.id}  ${v.proveedor.padEnd(8)} ${v.verificado ? "verificado" : "sin verificar"}  ` +
      `distrito ${v.distrito ?? "-"}  ${v.creado}  ${v.votos} voto(s)`);
  }
  if (!opciones.hasta) {
    console.log("\nIdeas, chat e informes: pasá --hasta AAAA-MM-DD para ver cuáles se borrarían.");
  } else {
    console.log(`\nIdeas creadas en este sitio hasta el ${opciones.hasta}: ${ideas.length}`);
    for (const i of ideas) {
      console.log(`  ${i.anio} #${i.numero ?? "-"}  ${i.titulo}  [${i.canal}, ${i.estado}` +
        `${i.publicada ? ", PUBLICADA" : ""}, ${i.votos} voto(s)]  ${i.creada}`);
    }
    console.log(`\nRegistro del chat hasta el ${opciones.hasta}: ${plan.chat} consulta(s)`);
    console.log(`Informes de impacto hasta el ${opciones.hasta}: ${plan.informes}`);
  }
  console.log(`Votos que se van: ${plan.votos} (se le restan al contador de cada idea que queda)`);
  console.log(`Limites por IP (tabla efimera, entera): ${plan.limites}`);
}

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));
  const textoHasta = valorDe(argumentos, "--hasta");
  const hasta = fechaDeCorte(textoHasta);
  if (textoHasta !== null && !hasta) {
    console.error(`\n--hasta tiene que ser una fecha AAAA-MM-DD valida (llego "${textoHasta}").\n`);
    process.exit(1);
  }
  const opciones = { hasta, incluirCidituc: argumentos.includes("--incluir-cidituc") };
  const confirmar = argumentos.includes("--confirmar");

  console.log(`Base: ${destinoDeLaBase(process.env.DATABASE_URL).descripcion}`);
  const plan = await armarPlan(consultar, opciones);
  mostrar(plan);

  if (!confirmar) {
    console.log("\nNo se borro nada. Para borrar esto, repetí el comando con --confirmar.\n");
    return;
  }
  if (!hasta) {
    console.error("\nPara borrar hace falta --hasta: sin fecha de corte no se sabe que es de antes del lanzamiento.\n");
    process.exit(1);
  }

  await exigirPermisoDeEscritura(`npx tsx scripts/limpiar-pruebas.ts --hasta ${hasta} --confirmar`);
  // Se vuelve a leer el plan despues de la espera del candado: si en esos
  // segundos entro algo, se borra lo que hay ahora, no lo que se mostro antes.
  const vigente = await armarPlan(consultar, opciones);
  const hecho = await aplicarPlan({ db, schema }, vigente);
  console.log(
    `\nListo: ${hecho.votantes} votante(s), ${hecho.ideas} idea(s), ${hecho.votos} voto(s) ` +
      `(${hecho.contadoresCorregidos} contador(es) corregidos), ${hecho.chat} consulta(s) del chat, ` +
      `${hecho.informes} informe(s), ${hecho.limites} limite(s) por IP.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exit(1);
  });
