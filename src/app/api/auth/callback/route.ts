/**
 * Retorno del login CIDITUC (OIDC authorization code).
 *
 * Que campos trae el userinfo depende del municipio; se esperan `dni` (o
 * `document_number`) y opcionalmente nombre y distrito. Ajustar el mapeo
 * cuando el municipio entregue las credenciales y la documentacion del IdP.
 */
import { cookies } from "next/headers";
import { configOidc, descubrirOidc, empadronar } from "@/lib/empadronamiento";
import { crearSesionVotante } from "@/lib/sesion";

export const runtime = "nodejs";

function redirigir(destino: string): Response {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  return Response.redirect(new URL(destino, base));
}

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const codigo = parametros.get("code");
  const estado = parametros.get("state");

  const almacen = await cookies();
  const estadoGuardado = almacen.get("pp_oidc_estado")?.value;
  almacen.delete("pp_oidc_estado");

  if (!codigo || !estado || !estadoGuardado || estado !== estadoGuardado) {
    return redirigir("/votar?error=estado");
  }

  const config = configOidc();
  if (!config) return redirigir("/votar?error=config");

  try {
    const descubierto = await descubrirOidc(config);

    const token = await fetch(descubierto.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: codigo,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });
    if (!token.ok) throw new Error(`token ${token.status}`);
    const { access_token } = (await token.json()) as { access_token: string };

    const perfil = await fetch(descubierto.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!perfil.ok) throw new Error(`userinfo ${perfil.status}`);

    const datos = (await perfil.json()) as Record<string, unknown>;
    const dni = String(datos.dni ?? datos.document_number ?? datos.documento ?? "");
    if (!/^\d{7,9}$/.test(dni.replace(/\D/g, ""))) {
      return redirigir("/votar?error=sin-dni");
    }

    const distritoCrudo = Number(datos.distrito ?? datos.district ?? NaN);
    const resultado = await empadronar({
      dni,
      nombre:
        typeof datos.name === "string"
          ? datos.name
          : typeof datos.nombre === "string"
            ? datos.nombre
            : null,
      distrito:
        Number.isInteger(distritoCrudo) && distritoCrudo >= 1 && distritoCrudo <= 20
          ? distritoCrudo
          : null,
      proveedor: "cidituc",
      proveedorSub: typeof datos.sub === "string" ? datos.sub : null,
      verificado: true,
    });

    await crearSesionVotante({
      votanteId: resultado.votanteId,
      distrito: resultado.distrito,
      nombre: resultado.nombre,
    });

    return redirigir("/votar");
  } catch (causa) {
    console.error("[auth] callback fallido", causa);
    return redirigir("/votar?error=cidituc");
  }
}
