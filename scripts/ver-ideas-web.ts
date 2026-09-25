/**
 * Ideas cargadas por el formulario del sitio (canal "web").
 *
 * Sirve para separar las de vecinos reales de las de prueba: durante una
 * demostracion se cargan ideas (ver src/lib/modo-prueba.ts) y conviene poder
 * verlas y limpiarlas.
 *
 *   npx tsx scripts/ver-ideas-web.ts                                 -> lista
 *   npx tsx scripts/ver-ideas-web.ts --borrar <numero>               -> muestra cual borraria
 *   npx tsx scripts/ver-ideas-web.ts --borrar <numero> --confirmar   -> la borra
 *   (con --anio <anio> si la idea no es de la edicion activa)
 *
 * Por que el numero y no el id: el numero es lo que ve la persona (la pantalla
 * de "idea recibida" dice "#12", el panel tambien), y el mensaje de
 * modo-prueba.ts ya decia `--borrar <numero>`. La version anterior esperaba el
 * id de la fila: quien le pasaba el numero que tenia a la vista borraba la idea
 * cuyo id coincidiera con ese numero, que es de otra persona. El numero solo es
 * unico dentro de una edicion (indice `ideas_edicion_numero_idx`), asi que se
 * busca en la activa salvo que se diga otra con --anio.
 *
 * Y por que en dos pasos: sin --confirmar muestra la idea (edicion, numero,
 * titulo, fecha) y no toca nada. Ver el titulo antes de borrar es lo que evita
 * llevarse puesta la idea de un vecino real, que en la etapa de ideas es tan
 * "web y sin publicar" como una de prueba. Borrar con --confirmar contra una
 * base remota exige ademas --produccion (scripts/produccion.ts).
 *
 * Solo borra ideas del canal web que no estan publicadas: una publicada ya la
 * vio el publico y se despublica desde el panel, no se borra.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { sql } from "drizzle-orm";
import { consultar } from "../src/db";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

type IdeaWeb = {
  id: number;
  anio: number;
  numero: number | null;
  titulo: string;
  estado: string;
  canal: string;
  publicada: boolean;
  distrito: number | null;
  cargada: string;
  revisiones: number;
};

function salirConUso(mensaje: string): never {
  console.error(`\n${mensaje}`);
  console.error(
    "\nUso: npx tsx scripts/ver-ideas-web.ts --borrar <numero> [--anio <anio>] [--confirmar]" +
      "\nEl numero es el que muestra el listado (y la pantalla de idea recibida), no el id.\n",
  );
  process.exit(1);
}

/** El valor que sigue a un flag, como entero positivo, o null si el flag no esta. */
function enteroDe(argumentos: string[], flag: string): number | null {
  const indice = argumentos.indexOf(flag);
  if (indice === -1) return null;
  const valor = Number(argumentos[indice + 1]);
  if (!Number.isInteger(valor) || valor <= 0) {
    salirConUso(`Falta el valor de ${flag} o no es un numero entero.`);
  }
  return valor;
}

async function listar() {
  const filas = await consultar(sql`
    SELECT e.anio,
           i.numero,
           left(i.titulo, 46) AS titulo,
           i.estado,
           i.publicada,
           to_char(i.created_at, 'YYYY-MM-DD HH24:MI') AS cargada
      FROM ideas i
      JOIN ediciones e ON e.id = i.edicion_id
     WHERE i.canal = 'web'
     ORDER BY e.anio, i.numero
  `);
  if (!filas.length) console.log("no hay ideas cargadas por el formulario del sitio.");
  else console.table(filas);
}

async function borrar(argumentos: string[]) {
  const numero = enteroDe(argumentos, "--borrar");
  const anio = enteroDe(argumentos, "--anio");
  const confirmar = argumentos.includes("--confirmar");
  if (numero === null) salirConUso("Falta el numero: --borrar 12");

  // El candado va antes de la primera consulta, y solo cuando se va a escribir.
  // La vista previa dice contra que base mira, como el listado: el numero que
  // se ve en PGlite no es la idea de produccion con el mismo numero.
  const { destino } = confirmar
    ? await exigirPermisoDeEscritura(`npx tsx scripts/ver-ideas-web.ts ${argumentos.join(" ")}`)
    : { destino: destinoDeLaBase(process.env.DATABASE_URL) };
  console.log(`Base: ${destino.descripcion}`);

  const edicion = anio === null ? sql`e.activa` : sql`e.anio = ${anio}`;
  const [idea] = await consultar<IdeaWeb>(sql`
    SELECT i.id,
           e.anio,
           i.numero,
           i.titulo,
           i.estado,
           i.canal,
           i.publicada,
           d.numero AS distrito,
           to_char(i.created_at, 'YYYY-MM-DD HH24:MI') AS cargada,
           (SELECT count(*) FROM revisiones r WHERE r.idea_id = i.id)::int AS revisiones
      FROM ideas i
      JOIN ediciones e ON e.id = i.edicion_id
      LEFT JOIN distritos d ON d.id = i.distrito_id
     WHERE ${edicion}
       AND i.numero = ${numero}
     LIMIT 1
  `);

  const donde = anio === null ? "la edicion activa" : `la edicion ${anio}`;
  if (!idea) {
    console.error(`\nNo hay ninguna idea #${numero} en ${donde}. No se borro nada.\n`);
    process.exit(1);
  }

  console.log(
    `\nEdicion ${idea.anio}, idea #${idea.numero}: ${idea.titulo}` +
      `\n  distrito ${idea.distrito ?? "sin asignar"} · ${idea.estado} · ` +
      `${idea.publicada ? "publicada" : "sin publicar"} · canal ${idea.canal} · cargada ${idea.cargada}`,
  );

  if (idea.canal !== "web" || idea.publicada) {
    console.error(
      `\nNo se borra: ${idea.canal !== "web" ? `es del canal "${idea.canal}", no del formulario del sitio` : "ya esta publicada (se despublica desde el panel)"}.\n`,
    );
    process.exit(1);
  }

  if (!confirmar) {
    console.log(
      (Number(idea.revisiones) > 0
        ? `\nTiene ${idea.revisiones} revisiones del equipo: se borran con ella.`
        : "") +
        "\nNo se borro nada. Si es la idea que buscabas, volve a correrlo con --confirmar.\n",
    );
    return;
  }

  // Se borra por id (el que se acaba de mostrar) y se repiten las condiciones:
  // si entre la lectura y el DELETE alguien la publico, no se borra.
  const borradas = await consultar<{ numero: number; titulo: string }>(sql`
    DELETE FROM ideas
     WHERE id = ${idea.id} AND canal = 'web' AND NOT publicada
    RETURNING numero, titulo
  `);
  console.log(
    borradas.length
      ? `\nBorrada la idea #${borradas[0].numero} de ${idea.anio}: ${borradas[0].titulo}\n`
      : "\nNo se borro nada: la idea cambio mientras tanto (se publico o ya no existe).\n",
  );
}

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));

  if (argumentos.includes("--borrar")) {
    await borrar(argumentos);
    return;
  }

  // Solo lectura: no hace falta el flag, pero se dice contra que base es.
  console.log(`Base: ${destinoDeLaBase(process.env.DATABASE_URL).descripcion}`);
  await listar();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exit(1);
  });
