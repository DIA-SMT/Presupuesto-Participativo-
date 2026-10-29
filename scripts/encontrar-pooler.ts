/**
 * A partir de la Direct connection de Supabase (solo IPv6, no accesible desde
 * redes sin IPv6), deriva y prueba la URL del Transaction pooler (IPv4):
 * usuario `postgres.<ref>` en `aws-0-<region>.pooler.supabase.com:6543`.
 * Prueba las regiones mas probables y muestra la que conecta.
 *
 * Cada prueba va con el TLS de la aplicacion (`opcionesDePool`): con
 * postgres.js, que arranca sin TLS, la clave viajaba en claro a cada region.
 */
import "./cargar-env";
import { Pool } from "pg";
import { opcionesDePool } from "../src/db";

const REGIONES = [
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-west-1",
];

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const ref = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1];
  if (!ref) throw new Error("La DATABASE_URL actual no es una Direct connection de Supabase.");
  const password = decodeURIComponent(url.password);

  for (const region of REGIONES) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const candidata = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`;
    process.stdout.write(`probando ${region}... `);
    const pool = new Pool({ ...opcionesDePool(candidata), max: 1, connectionTimeoutMillis: 8_000 });
    try {
      await pool.query("SELECT 1");
      console.log("CONECTA");
      console.log(`\nPOOLER OK -> postgres.${ref}@${host}:6543/postgres`);
      return;
    } catch (e) {
      console.log((e as Error).message.slice(0, 60));
    } finally {
      await pool.end().catch(() => {});
    }
  }
  throw new Error(
    "Ninguna region conecto. Copiar la URI del Transaction pooler desde el boton Connect del dashboard.",
  );
}

main().catch((e) => {
  console.error("FALLO:", e?.message ?? e);
  process.exit(1);
});
