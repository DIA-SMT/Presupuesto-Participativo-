"use server";

/**
 * Acciones de la pantalla de contenido (/admin/contenido): los textos del sitio
 * (incluidos el reglamento y el aviso urgente), las preguntas frecuentes y las
 * novedades.
 *
 * Todas son SOLO para el rol admin: cambian lo que lee todo el sitio y lo que
 * el chat le contesta a la gente. Cada una empieza por `exigirAdmin("admin")`,
 * que relee el rol de la base (no del JWT), lee el formulario y le pasa el
 * trabajo a escritura.ts, que es donde vive la transaccion con su fila de
 * `bitacora_sistema` (y donde se puede probar sin cookie).
 *
 * Revalidacion: el sitio es `force-dynamic`, asi que un visitante nuevo ve el
 * cambio igual; lo que hace falta revalidar es lo que el navegador de quien
 * edita ya tiene en su cache de rutas, empezando por esta misma pantalla. Solo
 * se revalida si la escritura cambio algo.
 *  - Un texto puede leerlo el layout raiz (el pie, el chat, el aviso urgente),
 *    asi que invalida todo: `revalidatePath("/", "layout")`.
 *  - Las preguntas frecuentes se ven en /acerca-de. El chat las lee de la base
 *    en cada consulta y no tiene cache que invalidar.
 *  - Las novedades se ven en la portada.
 */
import { revalidatePath } from "next/cache";
import { exigirAdmin, sinPermiso, type Resultado } from "../comun";
import {
  borrarFaq as borrarFaqEn,
  crearFaq as crearFaqEn,
  crearNovedad as crearNovedadEn,
  editarFaq as editarFaqEn,
  editarNovedad as editarNovedadEn,
  escribirTexto,
  moverFaq as moverFaqEn,
  publicarFaq as publicarFaqEn,
  publicarNovedad as publicarNovedadEn,
  type Escritura,
} from "./escritura";

const RUTA_PANEL = "/admin/contenido";

function campo(formulario: FormData, nombre: string): string {
  const valor = formulario.get(nombre);
  return typeof valor === "string" ? valor : "";
}

/** El id del formulario, o null si no es un entero positivo. */
function idDe(formulario: FormData): number | null {
  const id = Number(campo(formulario, "id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** "1" publica, "0" despublica. Cualquier otra cosa no es un pedido valido. */
function publicacionDe(formulario: FormData): boolean | null {
  const valor = campo(formulario, "publicada");
  return valor === "1" ? true : valor === "0" ? false : null;
}

const PEDIDO_INVALIDO: Resultado = {
  ok: false,
  error: "El pedido llegó incompleto. Recargá la página y probá de nuevo.",
};

/** Traduce lo que devolvio la escritura y revalida solo si hubo un cambio. */
function responder(resultado: Escritura, revalidar: () => void): Resultado {
  if (!resultado.ok) return resultado;
  if (resultado.cambio) revalidar();
  return { ok: true, mensaje: resultado.mensaje };
}

function revalidarTextos() {
  revalidatePath("/", "layout");
}

function revalidarPreguntas() {
  revalidatePath("/acerca-de");
  revalidatePath(RUTA_PANEL);
}

function revalidarNovedades() {
  revalidatePath("/");
  revalidatePath(RUTA_PANEL);
}

// ---------------------------------------------------------------------------
// Textos (tambien el reglamento y el aviso urgente: quitar el aviso es
// guardarlo vacio)
// ---------------------------------------------------------------------------

export async function guardarTexto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const resultado = await escribirTexto(sesion, {
    clave: campo(formulario, "clave"),
    valor: campo(formulario, "valor"),
  });
  return responder(resultado, revalidarTextos);
}

// ---------------------------------------------------------------------------
// Preguntas frecuentes
// ---------------------------------------------------------------------------

export async function crearPregunta(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const publicada = publicacionDe(formulario);
  if (publicada === null) return PEDIDO_INVALIDO;

  const resultado = await crearFaqEn(sesion, {
    pregunta: campo(formulario, "pregunta"),
    respuesta: campo(formulario, "respuesta"),
    publicada,
  });
  return responder(resultado, revalidarPreguntas);
}

export async function editarPregunta(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDe(formulario);
  if (id === null) return PEDIDO_INVALIDO;

  const resultado = await editarFaqEn(sesion, {
    id,
    pregunta: campo(formulario, "pregunta"),
    respuesta: campo(formulario, "respuesta"),
  });
  return responder(resultado, revalidarPreguntas);
}

export async function publicarPregunta(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDe(formulario);
  const publicada = publicacionDe(formulario);
  if (id === null || publicada === null) return PEDIDO_INVALIDO;

  return responder(await publicarFaqEn(sesion, { id, publicada }), revalidarPreguntas);
}

export async function moverPregunta(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDe(formulario);
  const direccion = campo(formulario, "direccion");
  if (id === null || (direccion !== "arriba" && direccion !== "abajo")) return PEDIDO_INVALIDO;

  return responder(await moverFaqEn(sesion, { id, direccion }), revalidarPreguntas);
}

export async function borrarPregunta(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDe(formulario);
  if (id === null) return PEDIDO_INVALIDO;

  return responder(await borrarFaqEn(sesion, { id }), revalidarPreguntas);
}

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

function datosNovedad(formulario: FormData) {
  return {
    titulo: campo(formulario, "titulo"),
    fecha: campo(formulario, "fecha"),
    copete: campo(formulario, "copete"),
    cuerpo: campo(formulario, "cuerpo"),
  };
}

/** Publica una novedad en la portada, o la deja guardada sin publicar. */
export async function crearNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const publicada = publicacionDe(formulario);
  if (publicada === null) return PEDIDO_INVALIDO;

  const resultado = await crearNovedadEn(sesion, { ...datosNovedad(formulario), publicada });
  return responder(resultado, revalidarNovedades);
}

export async function editarNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDe(formulario);
  if (id === null) return PEDIDO_INVALIDO;

  const resultado = await editarNovedadEn(sesion, { id, ...datosNovedad(formulario) });
  return responder(resultado, revalidarNovedades);
}

export async function publicarNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = idDe(formulario);
  const publicada = publicacionDe(formulario);
  if (id === null || publicada === null) return PEDIDO_INVALIDO;

  return responder(await publicarNovedadEn(sesion, { id, publicada }), revalidarNovedades);
}
