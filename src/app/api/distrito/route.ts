/**
 * Devuelve el distrito y el barrio que contienen una coordenada.
 *
 * Los dos se resuelven con point-in-polygon en la aplicacion
 * (src/lib/geo-servidor.ts) sobre la geografia oficial del municipio, asi que
 * funciona igual con PGlite o con Postgres y no necesita extensiones.
 *
 * El barrio puede venir null y eso NO es un error: la capa de barrios cubre los
 * barrios reconocidos, no cada metro del ejido, y hay plazas, avenidas y
 * terrenos que no pertenecen a ninguno. El formulario deja el campo en blanco y
 * la persona lo completa si quiere.
 *
 * El distrito manda: si el punto cae fuera de los 20 distritos no se busca
 * barrio, porque un punto fuera del ejido no puede tener uno.
 */
import { distritoDeCoordenada } from "@/db/queries";
import { barrioDePunto } from "@/lib/geo-servidor";
import { normalizarBarrio } from "@/lib/texto";

export async function GET(request: Request) {
  const parametros = new URL(request.url).searchParams;
  const lat = Number(parametros.get("lat"));
  const lon = Number(parametros.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "Coordenada inválida." }, { status: 400 });
  }

  const distrito = await distritoDeCoordenada(lat, lon);
  // El nombre pasa por la MISMA normalizacion que aplica el alta al guardarlo
  // (la capa oficial viene en mayusculas). Asi el valor que se autocompleta es
  // identico al que va a quedar en la base si la persona no lo toca, y no
  // aparece un cambio fantasma entre lo que vio y lo que se guardo.
  const barrio =
    distrito === null ? null : normalizarBarrio(barrioDePunto({ lat, lon }));

  return Response.json(
    { distrito, barrio },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
