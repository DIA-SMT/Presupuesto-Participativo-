/**
 * Empadronamiento de votantes.
 *
 * Proveedor "cidituc": OpenID Connect contra la ciudadania digital municipal.
 * Las URLs y credenciales van por entorno; hasta tener las credenciales reales
 * del municipio el flujo queda implementado pero sin probar contra el IdP.
 *
 * Proveedor "dev": login de prueba local con DNI y distrito, para desarrollo
 * y demostraciones. Se activa solo con AUTH_PROVIDER=dev y NUNCA debe estar
 * activo en produccion.
 *
 * En ambos casos el DNI se guarda hasheado (sha256 + pepper): el padron del
 * sitio no contiene DNIs en claro.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { votantes } from "@/db/schema";

export function hashearDni(dni: string): string {
  const pimienta = process.env.SESSION_SECRET ?? "pp-smt";
  const limpio = dni.replace(/\D/g, "");
  return createHash("sha256").update(`dni:${limpio}:${pimienta}`).digest("hex");
}

export type DatosEmpadronamiento = {
  dni: string;
  nombre: string | null;
  distrito: number | null;
  proveedor: "cidituc" | "dev";
  proveedorSub: string | null;
  verificado: boolean;
};

/** Crea o actualiza el votante y devuelve su id interno. */
export async function empadronar(datos: DatosEmpadronamiento): Promise<{
  votanteId: number;
  distrito: number | null;
  nombre: string | null;
}> {
  const dniHash = hashearDni(datos.dni);
  const dniCola = datos.dni.replace(/\D/g, "").slice(-3);

  const [fila] = await db
    .insert(votantes)
    .values({
      dniHash,
      dniCola,
      nombre: datos.nombre,
      distritoId: datos.distrito,
      proveedor: datos.proveedor,
      proveedorSub: datos.proveedorSub,
      verificado: datos.verificado,
    })
    .onConflictDoUpdate({
      target: votantes.dniHash,
      set: {
        nombre: datos.nombre ?? undefined,
        distritoId: datos.distrito ?? undefined,
        verificado: datos.verificado,
      },
    })
    .returning({
      id: votantes.id,
      distritoId: votantes.distritoId,
      nombre: votantes.nombre,
    });

  return { votanteId: fila.id, distrito: fila.distritoId, nombre: fila.nombre };
}

export function proveedorActivo(): "cidituc" | "dev" {
  const valor = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  if (valor === "cidituc") return "cidituc";
  if (process.env.NODE_ENV === "production" && valor !== "cidituc") {
    // En produccion el login de prueba queda deshabilitado aunque el entorno
    // lo pida: es preferible que la votacion falle a que se pueda votar sin
    // identidad verificada.
    throw new Error(
      "AUTH_PROVIDER debe ser 'cidituc' en produccion. El proveedor 'dev' es solo para desarrollo.",
    );
  }
  return "dev";
}

// ---------------------------------------------------------------------------
// OpenID Connect (CIDITUC)
// ---------------------------------------------------------------------------

export type ConfigOidc = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function configOidc(): ConfigOidc | null {
  const issuer = process.env.CIDITUC_ISSUER?.trim();
  const clientId = process.env.CIDITUC_CLIENT_ID?.trim();
  const clientSecret = process.env.CIDITUC_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CIDITUC_REDIRECT_URI?.trim();
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  return { issuer, clientId, clientSecret, redirectUri };
}

type Descubrimiento = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

export async function descubrirOidc(config: ConfigOidc): Promise<Descubrimiento> {
  const respuesta = await fetch(
    `${config.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
    { next: { revalidate: 3600 } },
  );
  if (!respuesta.ok) {
    throw new Error(`No se pudo descubrir el proveedor OIDC (${respuesta.status}).`);
  }
  return (await respuesta.json()) as Descubrimiento;
}
