/**
 * Conexion a la base de datos, con dos drivers segun el entorno:
 *
 *  - Sin DATABASE_URL (o con "pglite:..."): PGlite, un Postgres embebido que
 *    corre dentro de Node. No requiere Docker, servicios ni instalacion:
 *    la base vive en la carpeta ./data/pg. Es el modo de desarrollo y sirve
 *    tambien para un despliegue chico en un unico servidor.
 *
 *  - Con DATABASE_URL=postgres://...: un Postgres real via node-postgres, para
 *    produccion con base gestionada. El resto del codigo no cambia. Si el host
 *    no es local, la conexion va SIEMPRE con TLS (ver `opcionesDePool`).
 *
 * Nota de PGlite: es de proceso unico. No correr `npm run seed` mientras
 * `npm run dev` esta levantado (la carpeta de datos queda bloqueada).
 */
import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolConfig } from "pg";
import type { ConnectionOptions } from "node:tls";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import * as schema from "./schema";

const url = process.env.DATABASE_URL?.trim() ?? "";
const usaPostgres = esUrlPostgres(url);

function esUrlPostgres(valor: string): boolean {
  return valor.startsWith("postgres://") || valor.startsWith("postgresql://");
}

// ---------------------------------------------------------------------------
// Base local o remota, y TLS
// ---------------------------------------------------------------------------

/** Hosts donde la base esta en la misma maquina: no hay red de por medio. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Si DATABASE_URL apunta a una base que no esta en esta maquina.
 *
 * Es la pregunta de la que cuelgan tres candados: TLS obligatorio (aca), la
 * pimienta del DNI obligatoria y el login "dev" bloqueado
 * (src/lib/empadronamiento.ts). Los tres miran la BASE, no solo NODE_ENV,
 * porque el riesgo es la base: un `npm run dev` en una notebook con la URL de
 * Supabase en el .env.local escribe en el padron de verdad, aunque NODE_ENV
 * diga "development".
 *
 * PGlite (sin URL o "pglite:...") y los sockets unix son locales. Una URL que
 * no se puede leer cuenta como remota: ante la duda, el lado seguro es exigir.
 * Se lee process.env en cada llamada, no la constante del modulo, para que las
 * pruebas puedan cambiar la variable.
 */
export function esBaseRemota(valor = process.env.DATABASE_URL?.trim() ?? ""): boolean {
  if (!esUrlPostgres(valor)) return false;
  let host: string;
  try {
    const leida = new URL(valor);
    // node-postgres acepta el host tambien como parametro (?host=...), y ese
    // parametro gana sobre el de la URL: hay que mirar el mismo que va a usar.
    // Con `||` y no `??`: un `?host=` vacio no gana (pg-connection-string
    // pregunta `!config.host`) y se usa el de la URL. Si tampoco hay, pg cae a
    // PGHOST antes que a localhost (`val` en pg/lib/connection-parameters.js).
    host =
      leida.searchParams.get("host") ||
      decodeURIComponent(leida.hostname) ||
      (process.env.PGHOST ?? "");
  } catch {
    return true;
  }
  host = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "" || host.startsWith("/")) return false; // socket unix
  return !HOSTS_LOCALES.has(host);
}

/**
 * Parametros de la URL que node-postgres traduce a su opcion `ssl`.
 *
 * Hay que sacarlos antes de pasarle la URL, porque node-postgres PISA la opcion
 * `ssl` explicita con lo que lea de la URL: en pg/lib/connection-parameters.js
 * hace `Object.assign({}, config, parse(config.connectionString))`, y
 * pg-connection-string convierte `sslmode=...` en `ssl: {}` (o en `false` con
 * `sslmode=disable`). Sin este paso, un `?sslmode=require` pegado desde el
 * panel de Supabase borraba en silencio el certificado de DATABASE_CA_PEM, y
 * un `?sslmode=disable` mandaba todo en claro aunque el codigo pidiera TLS.
 * `sslnegotiation=direct` tambien: sin `ssl` en la URL, lo convierte en
 * `ssl: true` y pisa igual.
 */
const PARAMETROS_TLS = [
  "ssl",
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslnegotiation",
  "uselibpqcompat",
];

export type OpcionesDeConexion = {
  connectionString: string;
  ssl?: ConnectionOptions;
  /** Lo que conviene avisar por consola. `opcionesDePool` lo imprime una vez. */
  avisos: string[];
};

/**
 * Como conectarse a un Postgres, sin efectos: la parte que se puede probar.
 *
 *  - Host local: la URL tal cual, sin tocar nada (sus parametros ssl valen).
 *  - Host remoto: TLS siempre, decida lo que decida la URL.
 *      * con DATABASE_CA_PEM: se verifica la cadena contra ESE certificado y
 *        el nombre del host (node-postgres pasa el host como `servername`, y
 *        Node compara el certificado contra el).
 *      * sin DATABASE_CA_PEM: se cifra igual, pero sin verificar quien atiende
 *        del otro lado, y se avisa.
 *
 * Por que no alcanzan las CA del sistema: el pooler de Supabase presenta
 * `*.pooler.supabase.com` firmado por "Supabase Intermediate 2021 CA", que
 * cuelga de "Supabase Root 2021 CA", una raiz PROPIA de Supabase que no esta en
 * ningun almacen publico (se midio con `openssl s_client -starttls postgres`
 * contra aws-0-sa-east-1.pooler.supabase.com:6543, el 23/09/2026). Con las CA
 * de Node la conexion muere con SELF_SIGNED_CERT_IN_CHAIN. Con esa raiz como
 * `ca` la verificacion pasa, y conectando por IP en lugar de por nombre falla
 * con ERR_TLS_CERT_ALTNAME_INVALID: se verifica tambien el host. El panel de
 * Supabase la ofrece como "Download certificate" (prod-ca-2021.crt); la huella
 * para confirmar que es la misma esta en .env.example.
 *
 * El PEM va SOLO en `ca`, sin sumarle las raices de Node (al reves que
 * CIDITUC_CA_PEM en src/lib/cidituc.ts): la opcion `ca` reemplaza el almacen, y
 * aca eso es lo que se quiere. Solo se acepta un certificado emitido por la CA
 * de Supabase; uno de una CA publica para el mismo nombre, no.
 */
export function opcionesDeConexion(
  valor: string,
  caPem = process.env.DATABASE_CA_PEM,
): OpcionesDeConexion {
  if (!esBaseRemota(valor)) return { connectionString: valor, avisos: [] };

  const avisos: string[] = [];
  let connectionString = valor;
  let leida: URL;
  try {
    leida = new URL(valor);
  } catch {
    // El TypeError de URL trae la entrada completa en `input`, clave incluida:
    // no se propaga. pg-connection-string hace lo mismo con el suyo.
    throw new Error("DATABASE_URL no se puede leer como URL. Revisar el formato.");
  }
  const quitados = PARAMETROS_TLS.filter((nombre) => leida.searchParams.has(nombre));
  if (quitados.length > 0) {
    // Solo se reescribe la URL si hay algo que sacar: la de produccion no trae
    // ninguno y pasa intacta, sin riesgo de que la ida y vuelta por URL cambie
    // como se lee una clave con caracteres raros.
    for (const nombre of quitados) leida.searchParams.delete(nombre);
    connectionString = leida.toString();
    avisos.push(
      `[db] DATABASE_URL trae ${quitados.join(", ")}: se ignora. Con una base ` +
        "remota la conexion va siempre con TLS, y el certificado se configura " +
        "con DATABASE_CA_PEM.",
    );
  }

  const pem = caPem?.trim();
  if (pem) {
    // Pegado en una sola linea de .env, el PEM viene con los saltos escapados.
    const cadena = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
    if (!cadena.includes("-----BEGIN CERTIFICATE-----")) {
      // Mejor un error claro aca que uno de OpenSSL en la primera consulta.
      throw new Error(
        "DATABASE_CA_PEM no parece un certificado PEM (falta " +
          "-----BEGIN CERTIFICATE-----). Tiene que ir el CONTENIDO del " +
          "certificado raiz de Supabase, no la ruta al archivo.",
      );
    }
    return { connectionString, ssl: { ca: cadena, rejectUnauthorized: true }, avisos };
  }

  avisos.push(
    `[db] La conexion a ${new URL(connectionString).hostname} va cifrada con ` +
      "TLS pero SIN verificar el certificado, porque falta DATABASE_CA_PEM. " +
      "Cifrar protege de quien escucha la red; verificar protege de quien se " +
      "hace pasar por la base. Configurar DATABASE_CA_PEM con el certificado " +
      "raiz de Supabase (ver .env.example).",
  );
  return { connectionString, ssl: { rejectUnauthorized: false }, avisos };
}

/** Los avisos ya impresos, para no repetirlos en cada pool que se cree. */
const avisosDados = new Set<string>();

/**
 * Lo que va en `new Pool({...})` para hablar con DATABASE_URL: la URL (sin sus
 * parametros ssl, si es remota) y la opcion `ssl`. Cualquier script que abra
 * su propio Pool contra la base deberia usar esto en lugar de la URL cruda.
 */
export function opcionesDePool(valor: string): Pick<PoolConfig, "connectionString" | "ssl"> {
  const { connectionString, ssl, avisos } = opcionesDeConexion(valor);
  for (const aviso of avisos) {
    if (avisosDados.has(aviso)) continue;
    avisosDados.add(aviso);
    console.warn(aviso);
  }
  return ssl ? { connectionString, ssl } : { connectionString };
}

/** Ruta de la carpeta de datos de PGlite. */
export const RUTA_PGLITE = url.startsWith("pglite:")
  ? url.slice("pglite:".length)
  : "./data/pg";

/**
 * Tipo comun a ambos drivers: la API de consultas es identica, solo cambia el
 * transporte. Asi las firmas de insert/update/select no se bifurcan.
 */
type BaseDatos = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * En desarrollo Next recarga los modulos en cada cambio, asi que la conexion
 * se guarda en globalThis para no abrir una instancia nueva por recarga.
 */
const globalParaDb = globalThis as unknown as { ppDb?: BaseDatos };

function crear(): BaseDatos {
  if (usaPostgres) {
    // Driver: node-postgres (pg). Con el pooler de Supabase en modo
    // transaccion (pgbouncer, puerto 6543), postgres.js entuberaba varias
    // consultas por conexion y pgbouncer cruzaba los parametros entre ellas
    // ("invalid input syntax for type integer: f"). pg envia una consulta por
    // vez por conexion y no usa prepared statements con nombre: es la
    // combinacion segura para este pooler.
    const pool = new Pool({
      ...opcionesDePool(url),
      // Cada pagina dispara varias consultas en paralelo: un pool chico forma
      // cola cuando la base esta lejos (Supabase en sa-east-1).
      max: 10,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 20_000,
    });
    return drizzleNodePg(pool, { schema });
  }
  // PGlite escribe en ./data/pg: solo sirve en una maquina local. En Vercel
  // sin DATABASE_URL conviene fallar con un mensaje claro antes que con un
  // error criptico del filesystem de solo lectura.
  if (process.env.VERCEL) {
    throw new Error(
      "Falta DATABASE_URL en las variables de entorno del despliegue. " +
        "Configurar la connection string del Transaction pooler de Supabase " +
        "(puerto 6543) y volver a desplegar.",
    );
  }
  return drizzlePglite(new PGlite(RUTA_PGLITE), { schema });
}

function obtener(): BaseDatos {
  if (!globalParaDb.ppDb) globalParaDb.ppDb = crear();
  return globalParaDb.ppDb;
}

/**
 * La conexion se abre en la PRIMERA consulta, no al importar el modulo.
 * Es importante con PGlite: el build de Next evalua los modulos en varios
 * workers a la vez, y si cada import abriera la carpeta de datos, dos procesos
 * simultaneos la corromperian. Con paginas dinamicas el build no consulta
 * nada, asi que con la apertura perezosa nunca llega a tocar la base.
 */
export const db: BaseDatos = new Proxy({} as BaseDatos, {
  get(_objetivo, propiedad) {
    const valor = Reflect.get(
      obtener() as object,
      propiedad,
      obtener(),
    ) as unknown;
    return typeof valor === "function"
      ? (valor as (...argumentos: unknown[]) => unknown).bind(obtener())
      : valor;
  },
});

/**
 * Ejecuta SQL crudo (template `sql` de drizzle-orm) y devuelve siempre un
 * arreglo de filas, sea cual sea el driver. Usar para consultas que la API
 * tipada de Drizzle no expresa bien (agregaciones con FILTER, upserts con
 * CASE, etc.).
 */
export async function consultar<T extends Record<string, unknown>>(
  consulta: SQL,
): Promise<T[]> {
  const resultado = (await db.execute(consulta)) as unknown;
  if (Array.isArray(resultado)) return resultado as T[];
  if (
    resultado &&
    typeof resultado === "object" &&
    Array.isArray((resultado as { rows?: unknown }).rows)
  ) {
    return (resultado as { rows: T[] }).rows;
  }
  return [];
}

export { schema };
