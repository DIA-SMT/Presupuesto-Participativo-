/**
 * Configuracion de drizzle-kit: `npm run db:generate`, que no abre la base, y
 * `npm run db:studio` (o `npx drizzle-kit migrate | pull` a mano), que si.
 *
 * Los que abren la base pasan por el candado de `evaluarDrizzleKit`
 * (scripts/produccion.ts): contra una base remota no corren salvo que se lo
 * pida en la terminal para esa corrida, y `push` no corre nunca contra una
 * remota. Antes este archivo le pasaba a drizzle-kit la DATABASE_URL de
 * .env.local tal cual, y con la de Supabase ahi `db:studio` abria produccion
 * como dueno de las tablas, sin aviso y sin TLS.
 */
import { config } from "dotenv";
import type { Config } from "drizzle-kit";
import { conexionEnCampos } from "./src/db";
import {
  evaluarDrizzleKit,
  SEGUNDOS_PARA_CANCELAR,
  VARIABLE_DRIZZLE_KIT,
} from "./scripts/produccion";

// drizzle-kit corre fuera de Next: cargar .env.local (y .env como respaldo).
// `parsed` trae lo que dicen los archivos aunque no pise lo que ya estaba en el
// entorno: con eso se sabe si la variable del permiso esta escrita en un
// archivo, y en ese caso `evaluarDrizzleKit` no la cuenta.
const { parsed } = config({ path: [".env.local", ".env"], quiet: true });
const permisoEnArchivo = Boolean(parsed && VARIABLE_DRIZZLE_KIT in parsed);

const url = process.env.DATABASE_URL?.trim() ?? "";
const veredicto = evaluarDrizzleKit({
  url,
  argumentos: process.argv.slice(2),
  permiso: process.env[VARIABLE_DRIZZLE_KIT],
  permisoEnArchivo,
});

if (!veredicto.permitido) {
  console.error(`\nNO SE ABRIO LA BASE.\n\n${veredicto.motivo}\n`);
  process.exit(1);
}
const { comando, destino, abreLaBase } = veredicto;

/**
 * Contra la base remota que se pidio: el host a la vista y unos segundos para
 * cancelar, como en `exigirPermisoDeEscritura`. drizzle-kit carga este archivo
 * con `require`, sin `await` posible, asi que la espera bloquea el hilo; Ctrl+C
 * lo corta igual.
 */
function credencialesRemotas() {
  console.log(
    `\n>>> BASE REMOTA: ${destino.descripcion}` +
      `\n>>> drizzle-kit ${comando} se conecta como el usuario de la URL, sin RLS.` +
      ` Ctrl+C en los proximos ${SEGUNDOS_PARA_CANCELAR} segundos para cancelar.\n`,
  );
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SEGUNDOS_PARA_CANCELAR * 1000);

  // En campos sueltos y no `{ url }`: con la URL drizzle-kit no le pasa `ssl` a
  // node-postgres (ver `conexionEnCampos` en src/db/index.ts).
  const { avisos, ...credenciales } = conexionEnCampos(url);
  for (const aviso of avisos) console.warn(aviso);
  return credenciales;
}

const remota = abreLaBase && destino.tipo === "remota";
const usaPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");

/**
 * Sin DATABASE_URL se usa PGlite (Postgres embebido) sobre ./data/pg:
 * no requiere Docker ni ningun servicio instalado.
 */
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(remota
    ? { dbCredentials: credencialesRemotas() }
    : usaPostgres
      ? { dbCredentials: { url } }
      : {
          driver: "pglite",
          dbCredentials: {
            url: url.startsWith("pglite:") ? url.slice("pglite:".length) : "./data/pg",
          },
        }),
} satisfies Config;
