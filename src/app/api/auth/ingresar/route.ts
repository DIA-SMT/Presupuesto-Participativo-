/**
 * Login de prueba (AUTH_PROVIDER=dev): recibe DNI + distrito por POST y crea la
 * sesion directo. Solo para desarrollo y demostraciones; en produccion esta
 * bloqueado por `proveedorActivo()`.
 *
 * El ingreso real NO pasa por aca: con CIDITUC la persona sale del sitio hacia
 * el Derivador (el boton de /votar lleva la URL que arma `urlDeIngreso()`) y
 * vuelve a /auth/cidituc/callback. No hay un GET en esta ruta que redirija
 * alla: una sola forma de arrancar el flujo es una sola URL que mantener igual
 * a la registrada del otro lado.
 */
import { z } from "zod";
import { empadronar, proveedorActivo } from "@/lib/empadronamiento";
import { crearSesionVotante } from "@/lib/sesion";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import { exigirMismoOrigen } from "@/lib/origen";

export const runtime = "nodejs";

const esquemaDev = z.object({
  dni: z
    .string()
    .trim()
    .regex(/^\d{7,9}$/, "El DNI tiene que tener 7 u 8 números."),
  nombre: z.string().trim().max(120).optional(),
  distrito: z.number().int().min(1).max(20),
});

export async function POST(request: Request) {
  // Aunque sea el login de prueba: sin esto, una pagina ajena podia abrirle a
  // quien la visita una sesion con un DNI elegido por ella (en una demo, el
  // voto que esa persona creyera emitir quedaba a nombre de otro).
  const rechazo = exigirMismoOrigen(request);
  if (rechazo) return rechazo;

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
