/**
 * Empadronamiento de votantes.
 *
 * Proveedor "cidituc": la ciudadania digital municipal. El flujo entero
 * (Derivador, token, consulta del perfil) vive en src/lib/cidituc.ts; aca queda
 * solo lo que hace el sitio con la persona ya identificada.
 *
 * Proveedor "dev": login de prueba local con DNI y distrito, para desarrollo
 * y demostraciones. Se activa solo con AUTH_PROVIDER=dev y NUNCA debe estar
 * activo en produccion.
 *
 * En ambos casos el DNI se guarda hasheado (sha256 + pepper): el padron del
 * sitio no contiene DNIs en claro.
 */
import { createHash } from "node:crypto";
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
