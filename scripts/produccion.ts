/**
 * Candado de los scripts que escriben en la base: contra una base remota no
 * corren salvo que se lo pida con `--produccion`.
 *
 * Por que existe: durante meses `.env.local` tuvo la URL de Supabase, y el
 * README mandaba correr `npm run setup` con ella. El seed reactiva la 2025 y
 * desactiva cualquier otra edicion, reescribe las ideas 2025 con lo que diga el
 * JSON del ETL, borra las preguntas frecuentes y el cronograma, y le pisa la
 * contrasena al admin. Ninguna de esas cosas avisa. Sacar la URL de `.env.local`
 * arreglo el caso de hoy; esto es para que el proximo descuido (una variable
 * que quedo exportada en la terminal, un `.env.local` copiado de otra maquina)
 * no dependa de que alguien se acuerde.
 *
 * La regla, en una linea: escribir en una base que no esta en esta maquina es
 * algo que se pide explicitamente o no pasa. Y al reves: si se pide
 * `--produccion` y la base resulta ser local, tampoco se escribe, porque quien
 * pidio produccion cree que esta tocando produccion (una purga de contactos que
 * "se hizo" en PGlite es peor que una que fallo).
 *
 * Este modulo NO importa src/db: se evalua antes de que haya ninguna conexion y
 * las pruebas lo ejercitan sin base (scripts/tests/produccion.test.ts).
 */

/** El flag que habilita escribir en una base remota. Uno solo, siempre igual. */
export const FLAG_PRODUCCION = "--produccion";

/**
 * Hosts que se consideran esta maquina. Lista cerrada a proposito: cualquier
 * otra cosa, incluido un host vacio, se trata como remota (y una URL que no se
 * pudo leer, como desconocida: peor todavia). Equivocarse para ese lado cuesta escribir un flag de mas;
 * equivocarse para el otro cuesta la base de produccion.
 */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1"]);

export type DestinoBase =
  /** PGlite embebido: sin DATABASE_URL, o con `pglite:<carpeta>`. */
  | { tipo: "pglite"; descripcion: string }
  /** Un Postgres en esta maquina (localhost). */
  | { tipo: "postgres-local"; descripcion: string }
  /** Un Postgres en otra maquina. Supabase cae aca. */
  | { tipo: "remota"; descripcion: string }
  /**
   * Un valor que no se sabe a donde va: un esquema que src/db no reconoce, o
   * una URL de Postgres que no se pudo leer. No se escribe ni con el flag.
   */
  | { tipo: "desconocida"; descripcion: string };

/**
 * A donde apunta una DATABASE_URL, con una descripcion que se puede imprimir:
 * host, puerto y base, nunca el usuario ni la contrasena.
 *
 * Replica el criterio de src/db/index.ts para decidir el driver (vacio o
 * `pglite:` es PGlite; `postgres://` o `postgresql://`, tal cual y en
 * minuscula, es Postgres), con una diferencia a proposito: lo que src/db no
 * reconoce lo abre como PGlite en ./data/pg, y aca es "desconocida". Un valor
 * raro en DATABASE_URL es motivo para frenar, no para adivinar. Y no alcanza
 * con tratarlo como remoto: con `--produccion` el script seguiria, y src/db (o
 * migrar.ts, que decide igual) escribiria en la PGlite local mientras quien lo
 * corrio cree haber tocado produccion.
 */
export function destinoDeLaBase(urlCruda: string | undefined): DestinoBase {
  const url = (urlCruda ?? "").trim();

  if (!url) return { tipo: "pglite", descripcion: "PGlite en ./data/pg" };
  if (url.startsWith("pglite:")) {
    return { tipo: "pglite", descripcion: `PGlite en ${url.slice("pglite:".length)}` };
  }

  // Sin la `i`: src/db compara con startsWith, y `POSTGRES://` alla es PGlite.
  if (!/^postgres(ql)?:\/\//.test(url)) {
    return {
      tipo: "desconocida",
      descripcion:
        "DATABASE_URL tiene un formato que no se reconoce (se espera postgresql://" +
        " en minuscula, pglite:<carpeta> o nada)",
    };
  }

  let leida: URL;
  try {
    leida = new URL(url);
  } catch {
    // Pasa con contrasenas que tienen `#`, `/` o `:` sin codificar. No se
    // imprime nada de la URL: justamente puede llevar la clave en claro. Y no
    // se deja escribir ni con el flag: sin un host legible no hay nada que
    // mostrar antes de empezar, y node-postgres podria leerla de otra forma.
    return {
      tipo: "desconocida",
      descripcion:
        "DATABASE_URL no se pudo leer (suele ser una contrasena con # / : o %" +
        " sin codificar: se escriben %23 %2F %3A %25)",
    };
  }

  // node-postgres acepta `?host=` en la query y ese valor manda sobre el de la
  // autoridad: `postgres://localhost/x?host=db.supabase.co` va a Supabase.
  const host = sinCorchetes(leida.searchParams.get("host") || leida.hostname);
  const base = decodificar(leida.pathname.replace(/^\//, ""));
  const descripcion =
    `${host || "(sin host)"}${leida.port ? `:${leida.port}` : ""}` +
    (base ? `/${base}` : "");

  return HOSTS_LOCALES.has(host.toLowerCase())
    ? { tipo: "postgres-local", descripcion: `Postgres local en ${descripcion}` }
    : { tipo: "remota", descripcion };
}

/** `new URL` devuelve las IPv6 entre corchetes (`[::1]`); la lista no los lleva. */
function sinCorchetes(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/** El nombre de la base, legible; un `%` suelto no tiene que tirar el candado. */
function decodificar(texto: string): string {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
}

/**
 * Como volver a correr el comando con el flag. `npm run x` necesita el `--`
 * para pasarle el flag al script, salvo que el comando ya lo traiga
 * (`npm run purgar-contactos -- --confirmar`).
 */
function conFlag(comando: string): string {
  const faltanGuiones = comando.startsWith("npm run ") && !comando.includes(" -- ");
  return `${comando}${faltanGuiones ? " --" : ""} ${FLAG_PRODUCCION}`;
}

export type Veredicto =
  | { permitido: true; destino: DestinoBase; produccion: boolean }
  | { permitido: false; destino: DestinoBase; motivo: string };

/**
 * Decide si un script puede escribir. Es la parte pura del candado: no lee el
 * entorno ni corta el proceso, para poder probarla caso por caso.
 *
 * `flagSoloEnNpm` es el tropiezo mas probable: `npm run seed --produccion` (sin
 * el `--` del medio) no le pasa el flag al script, npm se lo queda como opcion
 * suya y lo deja en `npm_config_produccion`. No se acepta como si fuera el flag
 * (el pedido explicito es el del script), pero se usa para explicar el rechazo.
 */
export function evaluarEscritura(entrada: {
  url: string | undefined;
  argumentos: readonly string[];
  /** Como correr el script, para el mensaje: "npm run seed". */
  comando: string;
  flagSoloEnNpm?: boolean;
}): Veredicto {
  const destino = destinoDeLaBase(entrada.url);
  const pidioProduccion = entrada.argumentos.includes(FLAG_PRODUCCION);

  if (destino.tipo === "desconocida") {
    return {
      permitido: false,
      destino,
      motivo: [
        `${destino.descripcion}.`,
        "",
        "No se sabe a que base iria esta escritura, asi que no se hace, tampoco con",
        `${FLAG_PRODUCCION}. Corregi DATABASE_URL, o sacala del entorno para usar`,
        "PGlite en ./data/pg.",
      ].join("\n"),
    };
  }

  if (destino.tipo === "remota") {
    if (pidioProduccion) return { permitido: true, destino, produccion: true };
    return {
      permitido: false,
      destino,
      motivo: [
        `DATABASE_URL apunta a una base remota: ${destino.descripcion}.`,
        "",
        "Este script escribe en la base. Contra una base remota solo corre si se",
        `lo pedis explicitamente con ${FLAG_PRODUCCION}:`,
        "",
        `  ${conFlag(entrada.comando)}`,
        ...(entrada.flagSoloEnNpm
          ? [
              "",
              `El ${FLAG_PRODUCCION} le llego a npm y no al script: falta el "--" antes`,
              "del flag, que es lo que le indica a npm que lo pase de largo.",
            ]
          : []),
        "",
        "Si no queres tocar esa base, saca DATABASE_URL del entorno: sin ella el",
        "script usa PGlite en ./data/pg.",
      ].join("\n"),
    };
  }

  if (pidioProduccion) {
    return {
      permitido: false,
      destino,
      motivo: [
        `Pediste ${FLAG_PRODUCCION}, pero la base no es remota: ${destino.descripcion}.`,
        "",
        "Si querias escribir en produccion, falta poner su URL en DATABASE_URL para",
        "esta corrida (ver README, \"Despliegue\"). Si no, saca el flag.",
      ].join("\n"),
    };
  }

  return { permitido: true, destino, produccion: false };
}

/** Los argumentos del script sin el flag, para que no estorbe a los posicionales. */
export function sinFlagProduccion(argumentos: readonly string[]): string[] {
  return argumentos.filter((argumento) => argumento !== FLAG_PRODUCCION);
}

/** Segundos que se espera, con el host a la vista, antes de escribir en remoto. */
const SEGUNDOS_PARA_CANCELAR = 5;

/**
 * El candado, listo para la primera linea de un script que escribe.
 *
 * Llamarlo ANTES de la primera consulta. Si la base es remota y no se paso
 * `--produccion` (o se paso y la base es local), imprime por que y termina el
 * proceso con codigo 1 sin haber abierto ninguna conexion. Si se paso el flag
 * contra una base remota, muestra el host y espera unos segundos: el flag se
 * escribe de memoria, y ver el host antes de que empiece es la ultima
 * oportunidad de notar que DATABASE_URL no era la que se creia.
 *
 * Devuelve los argumentos del script sin el flag.
 */
export async function exigirPermisoDeEscritura(comando: string): Promise<{
  destino: DestinoBase;
  argumentos: string[];
}> {
  const argumentos = process.argv.slice(2);
  const veredicto = evaluarEscritura({
    url: process.env.DATABASE_URL,
    argumentos,
    comando,
    flagSoloEnNpm: Boolean(process.env.npm_config_produccion),
  });

  if (!veredicto.permitido) {
    console.error(`\nNO SE ESCRIBIO NADA.\n\n${veredicto.motivo}\n`);
    process.exit(1);
  }

  if (veredicto.produccion) {
    console.log(
      `\n>>> BASE REMOTA: ${veredicto.destino.descripcion}` +
        `\n>>> ${comando} va a escribir ahi. Ctrl+C en los proximos ` +
        `${SEGUNDOS_PARA_CANCELAR} segundos para cancelar.\n`,
    );
    await new Promise((listo) => setTimeout(listo, SEGUNDOS_PARA_CANCELAR * 1000));
  }

  return { destino: veredicto.destino, argumentos: sinFlagProduccion(argumentos) };
}
