/**
 * Pruebas del candado de los scripts que escriben (scripts/produccion.ts). Se
 * corren con `npm test` y no tocan ninguna base: lo que se prueba es la
 * decision, que es pura.
 *
 * Los casos importantes son los del borde: una URL que parece local y no lo es,
 * una que no se puede leer, y el flag pedido contra una base que no es la que
 * se cree. En todos, equivocarse para el lado de "remota" cuesta escribir un
 * flag; equivocarse para el otro cuesta produccion.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  destinoDeLaBase,
  evaluarDrizzleKit,
  evaluarEscritura,
  FLAG_PRODUCCION,
  sinFlagProduccion,
  VARIABLE_DRIZZLE_KIT,
} from "../produccion";

const SUPABASE =
  "postgresql://postgres.abcdefghij:Clave-Secreta-123@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

// --- A donde apunta la URL ---------------------------------------------------

test("sin DATABASE_URL la base es PGlite, igual que en src/db", () => {
  assert.equal(destinoDeLaBase(undefined).tipo, "pglite");
  assert.equal(destinoDeLaBase("").tipo, "pglite");
  assert.equal(destinoDeLaBase("   ").tipo, "pglite");
});

test("pglite:<carpeta> es PGlite y dice en que carpeta", () => {
  const destino = destinoDeLaBase("pglite:/tmp/pp-prueba");
  assert.equal(destino.tipo, "pglite");
  assert.match(destino.descripcion, /\/tmp\/pp-prueba/);
});

test("un Postgres en esta maquina es local, con cualquiera de sus nombres", () => {
  for (const url of [
    "postgres://yo:clave@localhost:5432/pp",
    "postgresql://yo:clave@127.0.0.1/pp",
    "postgres://yo:clave@[::1]:5432/pp",
    "postgres://yo:clave@LOCALHOST:5432/pp",
  ]) {
    assert.equal(destinoDeLaBase(url).tipo, "postgres-local", url);
  }
});

test("Supabase es remota, directa o por el pooler", () => {
  assert.equal(destinoDeLaBase(SUPABASE).tipo, "remota");
  assert.equal(
    destinoDeLaBase("postgresql://postgres:clave@db.abcdefghij.supabase.co:5432/postgres").tipo,
    "remota",
  );
});

test("la descripcion muestra host, puerto y base, y nunca usuario ni clave", () => {
  const { descripcion } = destinoDeLaBase(SUPABASE);
  assert.equal(descripcion, "aws-0-sa-east-1.pooler.supabase.com:6543/postgres");
  assert.ok(!descripcion.includes("Clave-Secreta-123"), descripcion);
  assert.ok(!descripcion.includes("abcdefghij"), descripcion);
});

test("?host= manda sobre el host de la URL: localhost con host remoto es remota", () => {
  // node-postgres usa el de la query. Mirar solo la autoridad dejaria pasar
  // produccion disfrazada de localhost.
  const destino = destinoDeLaBase(
    "postgres://yo:clave@localhost:5432/pp?host=db.abcdefghij.supabase.co",
  );
  assert.equal(destino.tipo, "remota");
  assert.match(destino.descripcion, /supabase\.co/);
});

test("una URL que no se puede leer es desconocida y no se imprime", () => {
  // Una clave con `#` sin codificar corta la URL: new URL() tira o lee otra
  // cosa. En ningun caso tiene que aparecer la clave en el mensaje.
  const destino = destinoDeLaBase("postgresql://postgres:cla#ve@@:::/postgres");
  assert.equal(destino.tipo, "desconocida");
  assert.ok(!destino.descripcion.includes("cla#ve"), destino.descripcion);
});

test("un esquema que src/db no reconoce es desconocido, no PGlite", () => {
  // src/db abriria PGlite con cualquiera de estas; el candado prefiere frenar
  // a adivinar. `POSTGRES://` incluido: src/db compara en minuscula.
  for (const url of ["mysql://yo:clave@servidor/pp", "POSTGRES://yo:clave@servidor/pp"]) {
    const destino = destinoDeLaBase(url);
    assert.equal(destino.tipo, "desconocida", url);
    assert.ok(!destino.descripcion.includes("clave"), destino.descripcion);
  }
});

test("con una base desconocida no se escribe, ni siquiera con --produccion", () => {
  // Con el flag, tratarla como remota dejaba seguir al script, y src/db (o
  // migrar.ts) terminaba escribiendo en la PGlite local: el operador creia
  // haber migrado produccion.
  for (const url of ["mysql://yo:clave@servidor/pp", "postgresql://u:a/b@host/pp"]) {
    for (const argumentos of [[], [FLAG_PRODUCCION]]) {
      const veredicto = evaluarEscritura({ url, argumentos, comando: "npm run db:migrate" });
      assert.equal(veredicto.permitido, false, `${url} ${argumentos.join(" ")}`);
    }
  }
});

test("un host que no esta en la lista es remoto aunque sea de la red local", () => {
  assert.equal(destinoDeLaBase("postgres://yo:clave@192.168.0.10/pp").tipo, "remota");
  // Sin host, node-postgres va a PGHOST o a localhost: no se sabe cual.
  assert.equal(destinoDeLaBase("postgres:///pp").tipo, "remota");
  // Con credenciales y sin host, new URL() ni siquiera la lee.
  assert.equal(destinoDeLaBase("postgres://yo:clave@/pp").tipo, "desconocida");
});

// --- La decision -------------------------------------------------------------

test("en PGlite y en Postgres local se escribe sin flag", () => {
  for (const url of [undefined, "pglite:./x", "postgres://yo@localhost/pp"]) {
    const veredicto = evaluarEscritura({ url, argumentos: [], comando: "npm run seed" });
    assert.equal(veredicto.permitido, true, String(url));
    if (veredicto.permitido) assert.equal(veredicto.produccion, false);
  }
});

test("contra una base remota sin flag no se escribe, y el rechazo dice como pedirlo", () => {
  const veredicto = evaluarEscritura({
    url: SUPABASE,
    argumentos: [],
    comando: "npm run db:migrate",
  });
  assert.equal(veredicto.permitido, false);
  if (veredicto.permitido) return;
  assert.match(veredicto.motivo, /npm run db:migrate -- --produccion/);
  assert.match(veredicto.motivo, /aws-0-sa-east-1\.pooler\.supabase\.com/);
  assert.ok(!veredicto.motivo.includes("Clave-Secreta-123"));
});

test("el ejemplo no duplica el `--` si el comando ya lo trae", () => {
  const veredicto = evaluarEscritura({
    url: SUPABASE,
    argumentos: ["--confirmar"],
    comando: "npm run purgar-contactos -- --confirmar",
  });
  assert.equal(veredicto.permitido, false);
  if (veredicto.permitido) return;
  assert.match(veredicto.motivo, /npm run purgar-contactos -- --confirmar --produccion/);
  assert.doesNotMatch(veredicto.motivo, /-- --confirmar -- --produccion/);
});

test("contra una base remota con --produccion se escribe", () => {
  const veredicto = evaluarEscritura({
    url: SUPABASE,
    argumentos: ["--confirmar", FLAG_PRODUCCION],
    comando: "npm run purgar-contactos -- --confirmar",
  });
  assert.equal(veredicto.permitido, true);
  if (veredicto.permitido) assert.equal(veredicto.produccion, true);
});

test("el flag que se quedo npm no cuenta, pero el rechazo explica por que", () => {
  // `npm run seed --produccion` (sin el `--`) deja el flag en
  // npm_config_produccion y el script no lo recibe.
  const veredicto = evaluarEscritura({
    url: SUPABASE,
    argumentos: [],
    comando: "npm run seed",
    flagSoloEnNpm: true,
  });
  assert.equal(veredicto.permitido, false);
  if (veredicto.permitido) return;
  assert.match(veredicto.motivo, /falta el "--"/);
});

test("--produccion contra una base local no escribe: quien lo pidio cree estar en produccion", () => {
  for (const url of [undefined, "postgres://yo@localhost/pp"]) {
    const veredicto = evaluarEscritura({
      url,
      argumentos: [FLAG_PRODUCCION],
      comando: "npm run purgar-contactos",
    });
    assert.equal(veredicto.permitido, false, String(url));
  }
});

test("sinFlagProduccion saca el flag sin mover los demas argumentos", () => {
  assert.deepEqual(
    sinFlagProduccion(["correo@smt.gob.ar", FLAG_PRODUCCION, "Nombre Apellido", "admin"]),
    ["correo@smt.gob.ar", "Nombre Apellido", "admin"],
  );
  assert.deepEqual(sinFlagProduccion([]), []);
});

// --- drizzle-kit (drizzle.config.ts) -------------------------------------------

test("drizzle-kit: generate y los otros que no abren la base corren con cualquier URL", () => {
  for (const comando of ["generate", "check", "up", "drop", "export"]) {
    const veredicto = evaluarDrizzleKit({ url: SUPABASE, argumentos: [comando], permiso: undefined });
    assert.equal(veredicto.permitido, true, comando);
    if (veredicto.permitido) assert.equal(veredicto.abreLaBase, false, comando);
  }
});

test("drizzle-kit: contra PGlite o un Postgres local abre la base sin pedir nada", () => {
  for (const url of [undefined, "pglite:./data/pg", "postgres://yo:clave@localhost:5432/pp"]) {
    const veredicto = evaluarDrizzleKit({ url, argumentos: ["studio"], permiso: undefined });
    assert.equal(veredicto.permitido, true, String(url));
  }
});

test("drizzle-kit: studio, migrate y pull no abren una base remota sin el permiso", () => {
  for (const comando of ["studio", "migrate", "pull", "introspect"]) {
    const veredicto = evaluarDrizzleKit({
      url: SUPABASE,
      argumentos: [comando, "--verbose"],
      permiso: undefined,
    });
    assert.equal(veredicto.permitido, false, comando);
    if (veredicto.permitido) continue;
    assert.match(veredicto.motivo, new RegExp(`${VARIABLE_DRIZZLE_KIT}=1 npx drizzle-kit ${comando}`));
    assert.ok(!veredicto.motivo.includes("Clave-Secreta-123"), comando);
  }
});

test("drizzle-kit: un comando que no se reconoce se trata como uno que abre la base", () => {
  for (const argumentos of [[], ["--config", "drizzle.config.ts"], ["comando-nuevo"]]) {
    const veredicto = evaluarDrizzleKit({ url: SUPABASE, argumentos, permiso: undefined });
    assert.equal(veredicto.permitido, false, argumentos.join(" "));
  }
});

test("drizzle-kit: con el permiso de la terminal abre la base remota", () => {
  const veredicto = evaluarDrizzleKit({ url: SUPABASE, argumentos: ["studio"], permiso: "1" });
  assert.equal(veredicto.permitido, true);
  if (veredicto.permitido) {
    assert.equal(veredicto.abreLaBase, true);
    assert.equal(veredicto.destino.tipo, "remota");
  }
  // Solo "1": un "true" o un "0" a medio borrar no habilitan nada.
  for (const permiso of ["0", "true", ""]) {
    assert.equal(
      evaluarDrizzleKit({ url: SUPABASE, argumentos: ["studio"], permiso }).permitido,
      false,
      permiso,
    );
  }
});

test("drizzle-kit: el permiso escrito en un .env no cuenta, y el rechazo dice por que", () => {
  // dotenv deja el valor del archivo en process.env, y drizzle.config.ts lo
  // pasa tal cual: escrito ahi quedaria habilitado para siempre. Tampoco cuenta
  // si la terminal trae la misma variable, porque el archivo la seguiria dando
  // en la corrida siguiente.
  const veredicto = evaluarDrizzleKit({
    url: SUPABASE,
    argumentos: ["studio"],
    permiso: "1",
    permisoEnArchivo: true,
  });
  assert.equal(veredicto.permitido, false);
  if (veredicto.permitido) return;
  assert.match(veredicto.motivo, /desde ahi no cuenta/);
  // Los comandos que no abren la base siguen andando con la variable en el archivo.
  assert.equal(
    evaluarDrizzleKit({ url: SUPABASE, argumentos: ["generate"], permiso: "1", permisoEnArchivo: true })
      .permitido,
    true,
  );
});

test("drizzle-kit: push no corre contra una base remota, ni con el permiso", () => {
  const veredicto = evaluarDrizzleKit({ url: SUPABASE, argumentos: ["push"], permiso: "1" });
  assert.equal(veredicto.permitido, false);
  if (veredicto.permitido) return;
  assert.match(veredicto.motivo, /npm run db:migrate -- --produccion/);
  assert.doesNotMatch(veredicto.motivo, new RegExp(VARIABLE_DRIZZLE_KIT));
  // Contra la base local, push sigue andando.
  assert.equal(evaluarDrizzleKit({ url: undefined, argumentos: ["push"], permiso: undefined }).permitido, true);
});

test("drizzle-kit: con una URL que no se entiende no se abre nada, ni con el permiso", () => {
  const veredicto = evaluarDrizzleKit({
    url: "postgresql://postgres:cla#ve@@:::/postgres",
    argumentos: ["studio"],
    permiso: "1",
  });
  assert.equal(veredicto.permitido, false);
  if (veredicto.permitido) return;
  assert.ok(!veredicto.motivo.includes("cla#ve"), veredicto.motivo);
});
