/**
 * Hash de contrasenas del backoffice con scrypt, que viene en Node.
 * Formato guardado: "scrypt$<N>$<sal hex>$<hash hex>".
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const LARGO_CLAVE = 64;

export async function hashearPassword(password: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scryptAsync(password.normalize("NFKC"), sal, LARGO_CLAVE);
  return `scrypt$${LARGO_CLAVE}$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export async function verificarPassword(
  password: string,
  guardado: string,
): Promise<boolean> {
  const [algoritmo, largo, salHex, hashHex] = guardado.split("$");
  if (algoritmo !== "scrypt" || !salHex || !hashHex) return false;

  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(salHex, "hex"),
    Number(largo) || LARGO_CLAVE,
  );
  if (esperado.length !== calculado.length) return false;
  return timingSafeEqual(esperado, calculado);
}
