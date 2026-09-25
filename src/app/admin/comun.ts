/**
 * Lo comun a todas las acciones del panel: quien puede hacer que, y como queda
 * la auditoria.
 *
 * Vivia adentro de acciones.ts, que es "use server" y por eso solo podia
 * exportar funciones async: cada pantalla nueva tenia que sumar sus acciones a
 * ese mismo archivo (ya pasaba las 2.100 lineas) para poder usar exigirAdmin o
 * filaSistema. Ahora las acciones de cada seccion viven en su carpeta
 * (equipo/acciones.ts, contenido/acciones.ts, ...) y todas importan de aca.
 *
 * Este archivo NO es "use server" a proposito: lo que exporta no queda expuesto
 * como una accion que el navegador pueda llamar. `exigirAdmin` o `filaSistema`
 * son piezas internas de las acciones, no puertas. Y como importa la base, no
 * puede terminar en el bundle del navegador.
 *
 * Reglas que valen para toda accion del panel:
 *  - empieza por `exigirAdmin(<rol minimo>)`: no hay ninguna via de escritura
 *    sin ese chequeo;
 *  - si tiene consecuencias, deja su fila de auditoria en la MISMA transaccion
 *    que el cambio. Hay tres bitacoras, una por tipo de cosa auditada:
 *    `revisiones` (lo que se le hace a UNA idea), `bitacora_equipo` (a UNA
 *    cuenta) y `bitacora_sistema` (al sistema o al contenido publico);
 *  - si toca una idea que se vota o la etapa, le pregunta a src/lib/etapas.ts
 *    dentro de su transaccion, con `bloqueoPorEtapa`.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { admins, ediciones, ideas } from "@/db/schema";
import type {
  AccionRevision,
  AccionSistema,
  EntidadSistema,
  EstadoIdea,
  RolAdmin,
} from "@/db/queries";
import { puedeCambiarIdea, type CambioDeIdea } from "@/lib/etapas";
import { getSesionAdmin } from "@/lib/sesion";

export type Resultado =
  | { ok: true; mensaje?: string; passwordProvisoria?: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Autorizacion
// ---------------------------------------------------------------------------

/** lector < moderador < admin. */
export const JERARQUIA: Record<RolAdmin, number> = { lector: 0, moderador: 1, admin: 2 };

export type Autorizacion = {
  adminId: number;
  email: string;
  nombre: string;
  rol: RolAdmin;
};

/**
 * Sesion valida con al menos el rol pedido, o null.
 *
 * El rol y el estado de la cuenta se releen de la base en cada request y NO se
 * toman del JWT de la cookie: el token dura 12 horas, asi que una cuenta
 * desactivada o degradada seguiria escribiendo con el rol viejo hasta que
 * venciera. La cookie prueba quien es; la base dice que puede hacer.
 */
export async function exigirAdmin(minimo: RolAdmin): Promise<Autorizacion | null> {
  const sesion = await getSesionAdmin();
  if (!sesion) return null;

  const [fila] = await db
    .select({
      id: admins.id,
      email: admins.email,
      nombre: admins.nombre,
      rol: admins.rol,
      activo: admins.activo,
    })
    .from(admins)
    .where(eq(admins.id, sesion.adminId))
    .limit(1);

  if (!fila || !fila.activo) return null;
  if (JERARQUIA[fila.rol] < JERARQUIA[minimo]) return null;

  return { adminId: fila.id, email: fila.email, nombre: fila.nombre, rol: fila.rol };
}

export function sinPermiso(minimo: RolAdmin): Resultado {
  if (minimo === "admin") {
    return { ok: false, error: "Esta acción la puede hacer solo un administrador." };
  }
  if (minimo === "moderador") {
    return { ok: false, error: "Tu sesión no tiene permisos para escribir." };
  }
  return { ok: false, error: "Tu sesión no está activa. Volvé a ingresar." };
}

/**
 * Texto de toda la cadena de causas. Drizzle envuelve el error del driver, asi
 * que el nombre del indice violado aparece en un `cause` y no en el mensaje.
 */
export function mensajeDeError(causa: unknown): string {
  let mensaje = "";
  for (let error: unknown = causa; error instanceof Error; error = error.cause) {
    mensaje += ` ${error.message}`;
  }
  return mensaje;
}

export function esViolacionDeUnico(causa: unknown): boolean {
  return /duplicate key|unique constraint|unique index|_idx|_unique/i.test(
    mensajeDeError(causa),
  );
}

/** Fila de auditoria de una idea. Se inserta en la misma transaccion del cambio. */
export function filaRevision(datos: {
  ideaId: number;
  sesion: Autorizacion;
  accion: AccionRevision;
  estadoAnterior?: EstadoIdea | null;
  estadoNuevo?: EstadoIdea | null;
  nota?: string | null;
}) {
  return {
    ideaId: datos.ideaId,
    adminId: datos.sesion.adminId,
    adminNombre: datos.sesion.nombre,
    accion: datos.accion,
    estadoAnterior: datos.estadoAnterior ?? null,
    estadoNuevo: datos.estadoNuevo ?? null,
    nota: datos.nota ?? null,
  };
}

/**
 * Tope del ANTES y del DESPUES de `bitacora_sistema`. El valor de un texto del
 * sitio puede ser un cuerpo entero: la bitacora audita QUE cambio, no guarda
 * versiones del contenido, asi que lo que pase el tope se recorta y se marca con
 * el largo real.
 */
export const MAXIMO_VALOR_BITACORA = 400;

/** Tope de la etiqueta legible de la entidad (un titulo, una clave). */
export const MAXIMO_ETIQUETA_BITACORA = 200;

/** Recorta por puntos de codigo (no por unidades UTF-16) para no partir un emoji. */
export function recortarValor(
  valor: string | null | undefined,
  tope = MAXIMO_VALOR_BITACORA,
): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = valor.trim();
  const letras = [...limpio];
  if (letras.length <= tope) return limpio;
  return `${letras.slice(0, tope).join("")}… (recortado: ${letras.length} caracteres en total)`;
}

/**
 * Fila de auditoria del sistema o del contenido publico. Se inserta en la misma
 * transaccion del cambio, igual que `filaRevision`.
 *
 * `antes` va en null cuando la fila no existia (un alta) y `despues` en null
 * cuando la fila se borro: son los dos unicos casos legitimos de valor vacio.
 */
export function filaSistema(datos: {
  sesion: Autorizacion;
  accion: AccionSistema;
  entidad: EntidadSistema;
  /** null cuando la entidad no se identifica por id, como un texto por clave. */
  entidadId?: number | null;
  etiqueta: string;
  antes?: string | null;
  despues?: string | null;
}) {
  return {
    adminId: datos.sesion.adminId,
    adminNombre: datos.sesion.nombre,
    accion: datos.accion,
    entidad: datos.entidad,
    entidadId: datos.entidadId ?? null,
    entidadEtiqueta:
      recortarValor(datos.etiqueta, MAXIMO_ETIQUETA_BITACORA) || "(sin nombre)",
    valorAnterior: recortarValor(datos.antes),
    valorNuevo: recortarValor(datos.despues),
  };
}

/**
 * Campo numerico que puede venir vacio de un formulario: el vacio significa
 * "sin asignar" y se guarda como null.
 *
 * OJO, este es un pozo de zod y ya nos costo un dato mal guardado: NO sirve
 * `z.union([z.coerce.number().min(0), z.literal("")])`, porque `Number("")` es
 * 0 y entonces la rama del coerce matchea el vacio. El campo terminaba
 * guardado como 0 en lugar de quedar sin asignar, y el chequeo `=== ""` de mas
 * abajo era codigo muerto. Aca el vacio se resuelve ANTES de coercionar.
 */
export function opcional<T extends z.ZodType<number>>(esquema: T) {
  return z.preprocess(
    (valor) =>
      valor === "" || valor === null || valor === undefined ? null : valor,
    esquema.nullable(),
  );
}

// ---------------------------------------------------------------------------
// Etapa de la edicion
//
// QUE se puede hacer en cada etapa lo decide src/lib/etapas.ts, que tambien usa
// el panel para deshabilitar botones. Aca vive COMO se le pregunta: siempre
// dentro de la transaccion que va a escribir, con la etapa releida de la base
// en ese momento y la fila bloqueada. Nunca con una etapa que haya mandado el
// formulario: la pantalla puede estar vieja, o la accion puede llegar sin
// pasar por la pantalla.
// ---------------------------------------------------------------------------

/** La transaccion de drizzle, para las lecturas que tienen que ir adentro. */
export type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * La etapa de la edicion de una idea y lo que la idea tiene hoy, releidos
 * dentro de la transaccion que la va a cambiar. Cada bloqueo cubre una carrera
 * distinta:
 *  - la edicion, FOR SHARE: choca con el FOR UPDATE de `cambiarEtapa`, asi que
 *    un cambio de etapa no se cuela entre esta lectura y la escritura. Si
 *    alguien abre la votacion mientras otra persona evalua, o esta transaccion
 *    ve "votacion" y rechaza, o termina antes de que la votacion se abra;
 *  - la idea, FOR UPDATE: la politica decide sobre el estado y la publicacion
 *    que la idea tiene al escribir, no sobre los que tenia cuando alguien abrio
 *    la ficha. Dos personas sobre la misma idea quedan en fila.
 *
 * El orden es siempre el mismo, primero la edicion y despues la idea, y
 * `cambiarEtapa` y `activarEdicion` bloquean ediciones pero nunca ideas: entre
 * las acciones del panel no se puede armar un ciclo de esperas. Tambien es el
 * orden en que el INSERT de /api/votos toca las dos filas (verifica la clave
 * foranea de la edicion antes de actualizar el contador de la idea).
 */
export async function leerIdeaEnJuego(tx: Transaccion, ideaId: number) {
  const [edicion] = await tx
    .select({ etapa: ediciones.etapa })
    .from(ideas)
    .innerJoin(ediciones, eq(ediciones.id, ideas.edicionId))
    .where(eq(ideas.id, ideaId))
    .for("share", { of: ediciones });
  if (!edicion) return null;

  const [idea] = await tx
    .select({ estado: ideas.estado, publicada: ideas.publicada })
    .from(ideas)
    .where(eq(ideas.id, ideaId))
    .for("update");
  if (!idea) return null;

  return { etapa: edicion.etapa, estado: idea.estado, publicada: idea.publicada };
}

/**
 * Por que la etapa no deja aplicarle `cambio` a la idea, o null si lo deja. Se
 * llama como primera cosa dentro de la transaccion: si devuelve un motivo, la
 * accion no escribe nada (ni la idea ni la fila de `revisiones`) y lo devuelve
 * como error, que la pantalla muestra tal cual.
 */
export async function bloqueoPorEtapa(
  tx: Transaccion,
  ideaId: number,
  cambio: CambioDeIdea,
): Promise<string | null> {
  const vigente = await leerIdeaEnJuego(tx, ideaId);
  if (!vigente) return "La idea no existe.";
  const veredicto = puedeCambiarIdea(vigente.etapa, vigente, cambio);
  return veredicto.permitido ? null : veredicto.motivo;
}
