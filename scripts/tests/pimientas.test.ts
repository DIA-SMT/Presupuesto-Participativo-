/**
 * Los secretos del padron y el candado del login de prueba, sin base.
 *
 *  - Que el hash del DNI no dependa de SESSION_SECRET (rotarlo duplicaba el
 *    padron), que pasar a DNI_PEPPER con el valor viejo no cambie ni un hash,
 *    y que sin DNI_PEPPER no se pueda hashear en produccion ni con base remota.
 *  - Que la IP tampoco dependa de SESSION_SECRET, y que su hash no se caiga
 *    (ni caiga a una pimienta publica) si falta una variable.
 *  - Que el login "dev" quede bloqueado con base remota, no solo con NODE_ENV.
 *
 * Nada de esto abre una conexion: con una DATABASE_URL remota en el entorno,
 * `src/db` no se conecta hasta la primera consulta, y aca no se hace ninguna.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { hashearDni, proveedorActivo } from "../../src/lib/empadronamiento";
import { hashearIp } from "../../src/lib/rate-limit";

const REMOTA = "postgres://postgres.abc:clave@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";

/**
 * Corre `fn` con esas variables de entorno y deja todo como estaba. `undefined`
 * borra la variable. Va por Reflect porque los tipos de Next declaran NODE_ENV
 * de solo lectura.
 */
function conEntorno<T>(variables: Record<string, string | undefined>, fn: () => T): T {
  const antes = new Map(Object.keys(variables).map((k) => [k, process.env[k]]));
  const poner = (k: string, v: string | undefined) => {
    if (v === undefined) Reflect.deleteProperty(process.env, k);
    else Reflect.set(process.env, k, v);
  };
  try {
    for (const [k, v] of Object.entries(variables)) poner(k, v);
    return fn();
  } finally {
    for (const [k, v] of antes) poner(k, v);
  }
}

// --- Pimienta del DNI --------------------------------------------------------

const DNI = "30.111.222";
const PIMIENTA = "una-pimienta-de-produccion-con-mas-de-32-caracteres";

test("rotar SESSION_SECRET no cambia el hash del DNI", () => {
  const entorno = { NODE_ENV: undefined, DATABASE_URL: undefined, DNI_PEPPER: PIMIENTA };
  const antes = conEntorno({ ...entorno, SESSION_SECRET: "a".repeat(40) }, () => hashearDni(DNI));
  const despues = conEntorno({ ...entorno, SESSION_SECRET: "b".repeat(40) }, () => hashearDni(DNI));
  assert.equal(antes, despues);
});

test("DNI_PEPPER con el valor viejo de SESSION_SECRET conserva el padron", () => {
  // La forma del hash es la de siempre: pasar a DNI_PEPPER con el mismo valor
  // no tiene que cambiar ni un hash. Si esto falla, el padron existente se pierde.
  const viejo = createHash("sha256").update(`dni:30111222:${PIMIENTA}`).digest("hex");
  const nuevo = conEntorno({ NODE_ENV: "production", DNI_PEPPER: PIMIENTA }, () => hashearDni(DNI));
  assert.equal(nuevo, viejo);
});

test("en produccion, sin DNI_PEPPER o con una corta, no se hashea", () => {
  for (const DNI_PEPPER of [undefined, "", "corta"]) {
    assert.throws(
      () => conEntorno({ NODE_ENV: "production", DNI_PEPPER }, () => hashearDni(DNI)),
      /DNI_PEPPER faltante/,
      String(DNI_PEPPER),
    );
  }
});

test("con base remota DNI_PEPPER es obligatoria aunque NODE_ENV no diga produccion", () => {
  assert.throws(
    () =>
      conEntorno({ NODE_ENV: "development", DATABASE_URL: REMOTA, DNI_PEPPER: undefined }, () =>
        hashearDni(DNI),
      ),
    /DNI_PEPPER faltante/,
  );
});

test("en desarrollo con base local hay una pimienta fija, sin configurar nada", () => {
  const entorno = { NODE_ENV: undefined, DATABASE_URL: undefined, DNI_PEPPER: undefined };
  const uno = conEntorno(entorno, () => hashearDni(DNI));
  const otro = conEntorno(entorno, () => hashearDni("30111222"));
  assert.equal(uno, otro, "el DNI se limpia antes de hashear");
});

// --- Pimienta de la IP -------------------------------------------------------

test("rotar SESSION_SECRET tampoco cambia el hash de la IP", () => {
  const entorno = { NODE_ENV: undefined, DATABASE_URL: undefined, IP_PEPPER: undefined };
  const antes = conEntorno({ ...entorno, SESSION_SECRET: "a".repeat(40) }, () => hashearIp("1.2.3.4"));
  const despues = conEntorno({ ...entorno, SESSION_SECRET: "b".repeat(40) }, () => hashearIp("1.2.3.4"));
  assert.equal(antes, despues);
});

test("la IP no se hashea con la pimienta del DNI tal cual", () => {
  // Separacion de dominio: con la misma pimienta en crudo, el hash de la IP
  // saldria de la misma cuenta que el del DNI.
  const entorno = { NODE_ENV: "production", DNI_PEPPER: PIMIENTA, IP_PEPPER: undefined };
  const hash = conEntorno(entorno, () => hashearIp("1.2.3.4"));
  assert.notEqual(hash, createHash("sha256").update(`1.2.3.4:${PIMIENTA}`).digest("hex"));
  const conPropia = conEntorno({ ...entorno, IP_PEPPER: "x".repeat(40) }, () => hashearIp("1.2.3.4"));
  assert.notEqual(conPropia, hash, "IP_PEPPER, si esta, manda");
});

test("en produccion, una IP_PEPPER corta se ignora en lugar de usarse", () => {
  const entorno = { NODE_ENV: "production", DNI_PEPPER: PIMIENTA };
  const errorOriginal = console.error;
  console.error = () => {};
  try {
    const sinPropia = conEntorno({ ...entorno, IP_PEPPER: undefined }, () => hashearIp("1.2.3.4"));
    const conCorta = conEntorno({ ...entorno, IP_PEPPER: "corta" }, () => hashearIp("1.2.3.4"));
    assert.equal(conCorta, sinPropia);
  } finally {
    console.error = errorOriginal;
  }
});

test("en produccion sin DNI_PEPPER la IP se sigue hasheando (el sitio no se cae)", () => {
  const entorno = {
    NODE_ENV: "production",
    DNI_PEPPER: undefined,
    IP_PEPPER: undefined,
    SESSION_SECRET: "s".repeat(40),
  };
  const errorOriginal = console.error;
  const avisos: unknown[] = [];
  console.error = (...partes: unknown[]) => avisos.push(partes);
  try {
    const hash = conEntorno(entorno, () => hashearIp("1.2.3.4"));
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(avisos.length, 1, "avisa, y una sola vez");
    conEntorno(entorno, () => hashearIp("5.6.7.8"));
    assert.equal(avisos.length, 1);
  } finally {
    console.error = errorOriginal;
  }
  assert.throws(
    () => conEntorno({ ...entorno, SESSION_SECRET: undefined }, () => hashearIp("1.2.3.4")),
    /Falta DNI_PEPPER/,
  );
});

// --- El login de prueba ------------------------------------------------------

test("el login dev funciona solo con base local y fuera de produccion", () => {
  assert.equal(
    conEntorno({ AUTH_PROVIDER: "dev", NODE_ENV: undefined, DATABASE_URL: undefined }, proveedorActivo),
    "dev",
  );
  assert.equal(
    conEntorno(
      { AUTH_PROVIDER: "dev", NODE_ENV: undefined, DATABASE_URL: "postgres://u:p@localhost/db" },
      proveedorActivo,
    ),
    "dev",
  );
  assert.throws(
    () => conEntorno({ AUTH_PROVIDER: "dev", NODE_ENV: undefined, DATABASE_URL: REMOTA }, proveedorActivo),
    /solo funciona con base local/,
  );
  // Sin AUTH_PROVIDER el valor por defecto es "dev": tambien queda bloqueado.
  assert.throws(
    () => conEntorno({ AUTH_PROVIDER: undefined, NODE_ENV: undefined, DATABASE_URL: REMOTA }, proveedorActivo),
    /solo funciona con base local/,
  );
  assert.throws(
    () => conEntorno({ AUTH_PROVIDER: "dev", NODE_ENV: "production", DATABASE_URL: undefined }, proveedorActivo),
    /debe ser 'cidituc'/,
  );
  assert.equal(
    conEntorno({ AUTH_PROVIDER: "cidituc", NODE_ENV: undefined, DATABASE_URL: REMOTA }, proveedorActivo),
    "cidituc",
  );
});
