/**
 * La conexion a una base remota, sin base ni red.
 *
 * Lo que se prueba falla EN SILENCIO si se rompe: que una base remota vaya
 * siempre cifrada, y que la URL no pueda pisar la opcion `ssl` que arma
 * src/db/index.ts. Se prueba contra el ConnectionParameters real de
 * node-postgres, que es donde ocurria el pisado: un `?sslmode=disable` en la
 * URL mandaba todo en claro aunque el codigo pidiera TLS.
 *
 * Lo que NO se puede probar aca es el handshake contra Supabase (necesita red):
 * se midio a mano y esta anotado en el comentario de `opcionesDeConexion`.
 * Nada de esto abre una conexion: `src/db` abre la base en la primera consulta,
 * y aca no se hace ninguna.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { conexionEnCampos, esBaseRemota, opcionesDeConexion } from "../../src/db";

const REMOTA = "postgres://postgres.abc:clave@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIDxDCC\n-----END CERTIFICATE-----";

/** Lo que node-postgres termina usando despues de mezclar la URL y las opciones. */
type Parametros = { ssl: unknown; user: string; password: string; host: string; port: number; database: string };
const ConnectionParameters = createRequire(join(process.cwd(), "package.json"))(
  "pg/lib/connection-parameters.js",
) as new (config: object) => Parametros;

// --- Base local o remota -----------------------------------------------------

test("PGlite y los Postgres de esta maquina son locales", () => {
  for (const url of [
    "",
    "pglite:./data/pg",
    "postgres://u:p@localhost:5432/db",
    "postgres://u:p@LOCALHOST/db",
    "postgresql://u:p@127.0.0.1/db",
    "postgres://u:p@[::1]:5432/db",
    "postgres://u@servidor/db?host=/var/run/postgresql",
  ]) {
    assert.equal(esBaseRemota(url), false, url);
  }
});

test("cualquier otro host es remoto, incluido el que llega por ?host=", () => {
  assert.equal(esBaseRemota(REMOTA), true);
  assert.equal(esBaseRemota("postgres://u:p@10.0.0.5:5432/db"), true);
  // node-postgres usa el parametro por encima del host de la URL.
  assert.equal(esBaseRemota("postgres://u:p@localhost/db?host=db.remota.com"), true);
  // Un ?host= vacio no gana: node-postgres usa el de la URL.
  assert.equal(esBaseRemota("postgres://u:p@db.remota.com/db?host="), true);
  assert.equal(new ConnectionParameters({ connectionString: "postgres://u:p@db.remota.com/db?host=" }).host, "db.remota.com");
});

// --- TLS ---------------------------------------------------------------------

test("con base local la URL pasa intacta y sin opcion ssl", () => {
  const url = "postgres://u:p@localhost:5432/db?sslmode=disable";
  assert.deepEqual(opcionesDeConexion(url, PEM), { connectionString: url, avisos: [] });
});

test("con base remota y sin DATABASE_CA_PEM se cifra igual, y se avisa", () => {
  const { connectionString, ssl, avisos } = opcionesDeConexion(REMOTA, undefined);
  assert.equal(connectionString, REMOTA, "sin parametros ssl la URL no se reescribe");
  assert.deepEqual(ssl, { rejectUnauthorized: false });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /SIN verificar.*DATABASE_CA_PEM/s);
});

test("con DATABASE_CA_PEM se verifica contra ese certificado", () => {
  const { ssl, avisos } = opcionesDeConexion(REMOTA, PEM);
  assert.deepEqual(ssl, { ca: PEM, rejectUnauthorized: true });
  assert.deepEqual(avisos, []);
});

test("el PEM pegado en una sola linea recupera sus saltos", () => {
  const { ssl } = opcionesDeConexion(REMOTA, PEM.replace(/\n/g, "\\n"));
  assert.equal(ssl?.ca, PEM);
});

test("un DATABASE_CA_PEM que no es un certificado es un error claro", () => {
  assert.throws(
    () => opcionesDeConexion(REMOTA, "./certificados/prod-ca-2021.crt"),
    /DATABASE_CA_PEM no parece un certificado/,
  );
});

test("ningun parametro ssl de la URL pisa la opcion ssl en node-postgres", () => {
  // Cada uno de estos, dejado en la URL, reemplazaba la opcion `ssl` entera:
  // `disable` y `ssl=0` por `false` (todo en claro), el resto por `{}` o `true`
  // (sin el certificado de DATABASE_CA_PEM).
  for (const parametros of [
    "sslmode=disable",
    "ssl=0",
    "sslmode=require",
    "sslmode=no-verify",
    "ssl=true",
    "sslnegotiation=direct",
    "uselibpqcompat=true&sslmode=require",
  ]) {
    const opciones = opcionesDeConexion(`${REMOTA}?${parametros}`, PEM);
    const final = new ConnectionParameters(opciones);
    assert.deepEqual(final.ssl, { ca: PEM, rejectUnauthorized: true }, parametros);
    assert.match(opciones.avisos[0] ?? "", /se ignora/, parametros);
  }
});

test("sacar los parametros ssl no cambia usuario, clave, host ni base", () => {
  const url =
    "postgres://postgres.abc:cl%40ve%23rara@aws-0-sa-east-1.pooler.supabase.com:6543/postgres" +
    "?sslmode=require&application_name=pp-smt";
  const final = new ConnectionParameters(opcionesDeConexion(url, PEM));
  assert.equal(final.user, "postgres.abc");
  assert.equal(final.password, "cl@ve#rara");
  assert.equal(final.host, "aws-0-sa-east-1.pooler.supabase.com");
  assert.equal(final.port, 6543);
  assert.equal(final.database, "postgres");
});

// --- En campos sueltos (drizzle-kit) -----------------------------------------

test("en campos sueltos la base remota lleva el mismo TLS que en la aplicacion", () => {
  // Es lo que drizzle.config.ts le pasa a drizzle-kit: con `{ url }` iba en claro.
  assert.deepEqual(conexionEnCampos(REMOTA, PEM).ssl, { ca: PEM, rejectUnauthorized: true });
  const sinPem = conexionEnCampos(`${REMOTA}?sslmode=disable`, undefined);
  assert.deepEqual(sinPem.ssl, { rejectUnauthorized: false });
  assert.ok(sinPem.avisos.some((aviso) => /SIN verificar/.test(aviso)));
});

test("los campos sueltos son los que node-postgres leeria de la URL", () => {
  for (const url of [
    REMOTA,
    "postgres://postgres.abc:cl%40ve%23ra%2Fra@aws-0-sa-east-1.pooler.supabase.com:6543/postgres",
    // ?host= manda sobre la autoridad, igual que para el candado y para pg.
    "postgres://u:p@localhost:5432/pp?host=db.remota.com",
    // Sin puerto, pg usa el 5432; sin base, el nombre del usuario.
    "postgresql://usuario:p@db.remota.com",
    "postgres://u:p@db.remota.com:5432/pp?user=otro&password=otra&port=6000",
  ]) {
    const campos = conexionEnCampos(url, PEM);
    const pg = new ConnectionParameters({ connectionString: url });
    assert.equal(campos.host, pg.host, url);
    assert.equal(campos.port ?? 5432, pg.port, url);
    assert.equal(campos.user, pg.user, url);
    assert.equal(campos.password, pg.password, url);
    assert.equal(campos.database, pg.database, url);
  }
});

test("en campos sueltos se avisa lo que no tiene donde ir, sin la clave", () => {
  const { avisos } = conexionEnCampos(`${REMOTA}?application_name=pp-smt&pgbouncer=true`, PEM);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /application_name, pgbouncer.*se ignora/);
  assert.ok(!avisos[0].includes("clave"), avisos[0]);
});
