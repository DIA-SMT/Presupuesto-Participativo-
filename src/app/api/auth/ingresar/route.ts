/**
 * Inicio del flujo de empadronamiento.
 *
 * - AUTH_PROVIDER=cidituc: redirige al login de la ciudadania digital (OIDC).
 * - AUTH_PROVIDER=dev: recibe DNI + distrito por POST y crea la sesion directo.
 *   Solo para desarrollo; en produccion esta bloqueado.
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  configOidc,
  descubrirOidc,
  empadronar,
  proveedorActivo,
} from "@/lib/empadronamiento";
import { crearSesionVotante } from "@/lib/sesion";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET() {
  let proveedor: "cidituc" | "dev";
  try {
    proveedor = proveedorActivo();
  } catch (causa) {
    return Response.json(
      { error: causa instanceof Error ? causa.message : "Configuración inválida." },
      { status: 500 },
    );
  }

  if (proveedor === "dev") {
    // El formulario de prueba vive en /votar: no hay nada que redirigir.
    return Response.redirect(new URL("/votar", process.env.SITE_URL ?? "http://localhost:3000"));
  }

  const config = configOidc();
  if (!config) {
    return Response.json(
      { error: "Faltan las credenciales de CIDITUC en el entorno." },
      { status: 500 },
    );
  }

  const descubierto = await descubrirOidc(config);
  const estado = randomBytes(16).toString("hex");

  (await cookies()).set("pp_oidc_estado", estado, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const url = new URL(descubierto.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("state", estado);

  return Response.redirect(url);
}

const esquemaDev = z.object({
  dni: z
    .string()
    .trim()
    .regex(/^\d{7,9}$/, "El DNI tiene que tener 7 u 8 números."),
  nombre: z.string().trim().max(120).optional(),
  distrito: z.number().int().min(1).max(20),
});

export async function POST(request: Request) {
  let proveedor: "cidituc" | "dev";
  try {
    proveedor = proveedorActivo();
  } catch (causa) {
    return Response.json(
      { error: causa instanceof Error ? causa.message : "Configuración inválida." },
      { status: 500 },
    );
  }

  if (proveedor !== "dev") {
    return Response.json(
      { error: "El empadronamiento se hace a través de CIDITUC." },
      { status: 405 },
    );
  }

  const limite = await consumir(`login:${hashearIp(ipDe(request))}`, 10, 600);
  if (!limite.permitido) {
    return Response.json({ error: "Demasiados intentos. Esperá unos minutos." }, { status: 429 });
  }

  let datos: z.infer<typeof esquemaDev>;
  try {
    datos = esquemaDev.parse(await request.json());
  } catch {
    return Response.json({ error: "Revisá el DNI y el distrito." }, { status: 400 });
  }

  const resultado = await empadronar({
    dni: datos.dni,
    nombre: datos.nombre ?? null,
    distrito: datos.distrito,
    proveedor: "dev",
    proveedorSub: null,
    // El login de prueba no verifica identidad: queda marcado asi en el padron.
    verificado: false,
  });

  await crearSesionVotante({
    votanteId: resultado.votanteId,
    distrito: resultado.distrito,
    nombre: resultado.nombre,
  });

  return Response.json({ ok: true, distrito: resultado.distrito });
}
