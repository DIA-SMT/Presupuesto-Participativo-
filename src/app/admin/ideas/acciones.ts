"use server";

/**
 * Server actions de las ideas que el equipo carga, corrige y descarta desde el
 * panel.
 *
 * Cada una hace lo mismo y en el mismo orden: `exigirAdmin("moderador")` (el
 * rol se relee de la base, no del JWT), el tope si corresponde, y despues la
 * operacion de ./operaciones.ts, que es la que decide y escribe (y la que se
 * prueba contra una base real). Aca no hay ninguna regla del proceso: si una
 * regla viviera en la accion, las pruebas no la verian.
 *
 * Los errores de la base no se dejan explotar: la pantalla tiene que poder
 * mostrar algo, y el detalle queda en el log del servidor.
 */
import { revalidatePath } from "next/cache";
import { consumir } from "@/lib/rate-limit";
import { exigirAdmin, sinPermiso, type Resultado } from "../comun";
import {
  aplicarCorreccion,
  aplicarDescarte,
  aplicarRestauracion,
  errorDeEscritura,
  registrarAlta,
  TOPE_ALTAS_POR_HORA,
  type ResultadoAlta,
} from "./operaciones";

/** El FormData como objeto de textos. Los archivos no se esperan en ningun campo. */
function comoObjeto(formulario: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [clave, valor] of formulario.entries()) {
    if (typeof valor === "string" && !(clave in campos)) campos[clave] = valor;
  }
  return campos;
}

/** El rechazo por permisos, con la forma del resultado del alta. */
function sinPermisoParaCargar(): ResultadoAlta {
  const rechazo = sinPermiso("moderador");
  return { ok: false, error: rechazo.ok ? "Tu sesión no tiene permisos." : rechazo.error };
}

/**
 * Carga una idea que llego por fuera del formulario del sitio: una asamblea,
 * mesa de entradas, un mail. Devuelve el numero y el codigo de seguimiento
 * para el comprobante del vecino.
 */
export async function cargarIdea(
  _previo: ResultadoAlta | null,
  formulario: FormData,
): Promise<ResultadoAlta> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermisoParaCargar();

  // Tope por cuenta y no por IP: el equipo carga desde la misma red de la
  // oficina, y el de IP del formulario publico (5 por hora) lo frenaba en la
  // quinta idea de una asamblea.
  const limite = await consumir(`alta-panel:${sesion.adminId}`, TOPE_ALTAS_POR_HORA, 3600);
  if (!limite.permitido) {
    const minutos = Math.max(1, Math.ceil(limite.reiniciaEn / 60));
    return {
      ok: false,
      error: `Ya cargaste ${TOPE_ALTAS_POR_HORA} ideas en la última hora. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`,
    };
  }

  try {
    const resultado = await registrarAlta(comoObjeto(formulario), sesion);
    // Entra sin publicar: el sitio publico no cambia, pero la bandeja si.
    if (resultado.ok) revalidatePath("/admin");
    return resultado;
  } catch (causa) {
    console.error("[admin] cargarIdea fallo", causa);
    return {
      ok: false,
      error: errorDeEscritura(causa, "No se pudo guardar la idea. Probá de nuevo en un momento."),
    };
  }
}

/** Corrige titulo, textos, categoria, barrio, punto o integracion de una idea. */
export async function corregirIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  try {
    const resultado = await aplicarCorreccion(comoObjeto(formulario), sesion);
    // Una idea publicada cambia en el sitio: la ficha, los listados, el mapa.
    if (resultado.ok) revalidatePath("/", "layout");
    return resultado;
  } catch (causa) {
    console.error("[admin] corregirIdea fallo", causa);
    return {
      ok: false,
      error: errorDeEscritura(causa, "No se pudo guardar la corrección. Probá de nuevo en un momento."),
    };
  }
}

/** Descarta una prueba, un spam o una carga repetida. Se puede deshacer. */
export async function descartarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  try {
    const resultado = await aplicarDescarte(comoObjeto(formulario), sesion);
    // Si estaba publicada, sale del sitio y de sus numeros.
    if (resultado.ok) revalidatePath("/", "layout");
    return resultado;
  } catch (causa) {
    console.error("[admin] descartarIdea fallo", causa);
    return {
      ok: false,
      error: errorDeEscritura(causa, "No se pudo descartar la idea. Probá de nuevo en un momento."),
    };
  }
}

/** Deshace un descarte: la idea vuelve a "En evaluación", sin publicar. */
export async function restaurarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  try {
    const resultado = await aplicarRestauracion(comoObjeto(formulario), sesion);
    if (resultado.ok) revalidatePath("/admin");
    return resultado;
  } catch (causa) {
    console.error("[admin] restaurarIdea fallo", causa);
    return {
      ok: false,
      error: errorDeEscritura(causa, "No se pudo deshacer el descarte. Probá de nuevo en un momento."),
    };
  }
}
