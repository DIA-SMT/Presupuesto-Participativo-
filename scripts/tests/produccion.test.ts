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
  evaluarEscritura,
  FLAG_PRODUCCION,
  sinFlagProduccion,
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

test("una URL que no se puede leer se trata como remota y no se imprime", () => {
  // Una clave con `#` sin codificar corta la URL: new URL() tira o lee otra
  // cosa. En ningun caso tiene que aparecer la clave en el mensaje.
  const destino = destinoDeLaBase("postgresql://postgres:cla#ve@@:::/postgres");
  assert.equal(destino.tipo, "remota");
  assert.ok(!destino.descripcion.includes("cla"), destino.descripcion);
});

test("un esquema que no se reconoce se trata como remoto, no como PGlite", () => {
  // src/db abriria PGlite con esto; el candado prefiere frenar a adivinar.
  const destino = destinoDeLaBase("mysql://yo:clave@servidor/pp");
  assert.equal(destino.tipo, "remota");
  assert.ok(!destino.descripcion.includes("clave"), destino.descripcion);
});

test("un host que no esta en la lista es remoto aunque sea de la red local", () => {
  assert.equal(destinoDeLaBase("postgres://yo:clave@192.168.0.10/pp").tipo, "remota");
  assert.equal(destinoDeLaBase("postgres://yo:clave@/pp").tipo, "remota");
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
