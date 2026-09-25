/**
 * Sesiones firmadas con JWT (cookie httpOnly). Dos tipos independientes:
 *  - votante: vecino empadronado via CIDITUC (o el login "dev" en desarrollo)
 *  - admin: usuario del backoffice
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { atributosCookie, borradoCookie, nombreCookie } from "@/lib/cookies";

// En produccion llevan el prefijo __Host- (ver src/lib/cookies.ts): otro
// sistema bajo *.smt.gob.ar no las puede plantar ni pisar. Escritura, lectura
// y borrado usan estas dos constantes y nada mas.
const COOKIE_VOTANTE = nombreCookie("pp_votante");
const COOKIE_ADMIN = nombreCookie("pp_admin");
const DURACION_VOTANTE = 60 * 60 * 4; // 4 horas: alcanza para votar
const DURACION_ADMIN = 60 * 60 * 12;

function clave(): Uint8Array {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error("SESSION_SECRET faltante o demasiado corto (minimo 32 caracteres).");
  }
  return new TextEncoder().encode(secreto);
}

export type SesionVotante = {
  tipo: "votante";
  votanteId: number;
  distrito: number | null;
  nombre: string | null;
};

export type SesionAdmin = {
  tipo: "admin";
  adminId: number;
  email: string;
  rol: "admin" | "moderador" | "lector";
};

async function firmar(datos: object, duracion: number): Promise<string> {
  return new SignJWT({ ...datos })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${duracion}s`)
    .sign(clave());
}

async function leer<T>(token: string | undefined, tipo: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave());
    if (payload.tipo !== tipo) return null;
    return payload as T;
  } catch {
    return null;
  }
}

// --- Votante ----------------------------------------------------------------

export async function crearSesionVotante(datos: Omit<SesionVotante, "tipo">) {
  const token = await firmar({ tipo: "votante", ...datos }, DURACION_VOTANTE);
  (await cookies()).set(COOKIE_VOTANTE, token, {
    ...atributosCookie(),
    maxAge: DURACION_VOTANTE,
  });
}

export async function getSesionVotante(): Promise<SesionVotante | null> {
  const token = (await cookies()).get(COOKIE_VOTANTE)?.value;
  return leer<SesionVotante>(token, "votante");
}

export async function cerrarSesionVotante() {
  (await cookies()).delete(borradoCookie(COOKIE_VOTANTE));
}

// --- Admin --------------------------------------------------------------------

export async function crearSesionAdmin(datos: Omit<SesionAdmin, "tipo">) {
  const token = await firmar({ tipo: "admin", ...datos }, DURACION_ADMIN);
  (await cookies()).set(COOKIE_ADMIN, token, {
    ...atributosCookie(),
    maxAge: DURACION_ADMIN,
  });
}

export async function getSesionAdmin(): Promise<SesionAdmin | null> {
  const token = (await cookies()).get(COOKIE_ADMIN)?.value;
  return leer<SesionAdmin>(token, "admin");
}

export async function cerrarSesionAdmin() {
  (await cookies()).delete(borradoCookie(COOKIE_ADMIN));
}
