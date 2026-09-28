/**
 * El distrito que declara la persona antes de votar.
 *
 * CIDITUC no informa el domicilio, asi que quien entra con su cuenta llega a
 * /votar sin distrito. Antes la pantalla lo mandaba a una asamblea que no tenia
 * como cargarlo: con CIDITUC nadie podia votar. Ahora la persona encuentra su
 * distrito en /votar (por su barrio o marcando su casa en el mapa, calculado en
 * su navegador), tilda "Declaro que vivo en el distrito N" y confirma, y esta
 * ruta lo guarda con la fecha de la declaracion.
 *
 * Llega SOLO el numero de distrito y la declaracion: ni la direccion ni el
 * punto del mapa salen del navegador.
 *
 * Las reglas (votacion abierta, todavia no voto) las decide declararDistrito,
 * dentro de su transaccion. La sesion lleva el distrito, asi que se reemite con
 * el nuevo: es lo que le abre la boleta.
 */
import { z } from "zod";
import { declararDistrito, type ResultadoDeclaracion } from "@/lib/empadronamiento";
import { exigirMismoOrigen } from "@/lib/origen";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import { crearSesionVotante, getSesionVotante } from "@/lib/sesion";

export const runtime = "nodejs";

const esquema = z.object({
  distrito: z.number().int().min(1).max(20),
  // La declaracion va en el pedido: sin la casilla tildada no se guarda nada.
  declaro: z.literal(true),
});

const ESTADO: Record<Extract<ResultadoDeclaracion, { ok: false }>["motivo"], number> = {
  "fuera-de-etapa": 409,
  "ya-voto": 409,
  "sin-votante": 401,
  "distrito-invalido": 400,
};

export async function POST(request: Request) {
  // Primero, antes del rate limit, como en /api/votos.
  const rechazo = exigirMismoOrigen(request);
  if (rechazo) return rechazo;

  const limite = await consumir(`distrito:${hashearIp(ipDe(request))}`, 30, 3600);
  if (!limite.permitido) {
    return Response.json(
      { error: "Demasiados intentos. Probá de nuevo en un rato." },
      { status: 429 },
    );
  }

  const sesion = await getSesionVotante();
  if (!sesion) {
    return Response.json(
      { error: "Tu sesión se cerró o venció. Ingresá de nuevo para votar." },
      { status: 401 },
    );
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Elegí tu distrito y tildá la declaración para confirmarlo." },
      { status: 400 },
    );
  }

  const resultado = await declararDistrito(sesion.votanteId, datos.distrito);
  if (!resultado.ok) {
    return Response.json({ error: resultado.mensaje }, { status: ESTADO[resultado.motivo] });
  }

  // La sugerencia ya se uso: no se vuelve a proponer.
  await crearSesionVotante({
    votanteId: sesion.votanteId,
    distrito: resultado.distrito,
    nombre: sesion.nombre,
    sugerido: null,
  });
  return Response.json({ ok: true, distrito: resultado.distrito });
}
