/**
 * Devuelve el distrito que contiene una coordenada.
 * Lo resuelve PostGIS con ST_Contains sobre la geometria oficial.
 */
import { distritoDeCoordenada } from "@/db/queries";

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const lat = Number(parametros.get("lat"));
  const lon = Number(parametros.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "Coordenada inválida." }, { status: 400 });
  }

  const distrito = await distritoDeCoordenada(lat, lon);
  return Response.json(
    { distrito },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
