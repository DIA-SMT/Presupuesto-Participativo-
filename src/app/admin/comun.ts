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
 *    dentro de su transaccion, con `tomarIdeaParaCambiar` o `bloqueoPorEtapa`,
 *    y decide sus propias reglas (ganador, publicacion) sobre esa misma fila.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ediciones, ideas } from "@/db/schema";
import type {
  AccionRevision,
  AccionSistema,
  EntidadSistema,
  EstadoIdea,
  FilaRanking,
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
  /**
   * La version de las sesiones con la que se autorizo. Las acciones del equipo
   * la vuelven a comparar DENTRO de su transaccion (equipo/cuentas.ts): entre
   * este chequeo y la escritura, otra persona puede haber cortado la sesion.
   */
  version: number;
};

/**
 * Sesion valida con al menos el rol pedido, o null.
 *
 * Es la MISMA validacion que usan el layout y las paginas: `getSesionAdmin`
 * (src/lib/sesion.ts). La cookie prueba quien es y con que version de sus
 * sesiones entro; la base dice si esa version sigue vigente, si la cuenta esta
 * activa y que rol tiene. Nada de eso se toma del JWT, que dura 12 horas: una
 * cuenta dada de baja o degradada seguiria escribiendo hasta que venciera.
 *
 * Una sola consulta por accion, la de esa validacion: el rol, el nombre y el
 * correo salen de la misma fila, y aca no se vuelve a leer nada.
 *
 * Con la contrasena provisoria sin cambiar no se escribe nada: la validacion
 * redirige a /admin/password (en una server action es una navegacion del
 * cliente). Por eso `exigirAdmin` va siempre ANTES de cualquier try/catch de la
 * accion, que se tragaria la redireccion. La unica que pasa
 * `permitirPasswordProvisoria` es la accion que la cambia.
 */
export async function exigirAdmin(
  minimo: RolAdmin,
  opciones: { permitirPasswordProvisoria?: boolean } = {},
): Promise<Autorizacion | null> {
  const sesion = await getSesionAdmin(opciones);
  if (!sesion) return null;
  if (JERARQUIA[sesion.rol] < JERARQUIA[minimo]) return null;

  return {
    adminId: sesion.adminId,
    email: sesion.email,
    nombre: sesion.nombre,
    rol: sesion.rol,
    version: sesion.version,
  };
}

/**
 * El mensaje cuando `exigirAdmin` devuelve null. Con las sesiones que se cortan
 * (una baja, un cambio de rol o de contrasena, tambien la propia desde otro
 * dispositivo) el null ya no significa solamente "no te alcanza el rol", y no
 * hay forma de saber cual de las dos cosas fue sin otra consulta: el texto
 * nombra las dos. Sin la segunda frase, un administrador cuya sesion se corto
 * leia que la accion era "solo para administradores".
 */
export function sinPermiso(minimo: RolAdmin): Resultado {
  if (minimo === "admin") {
    return {
      ok: false,
      error: "Esta acción la puede hacer solo un administrador. Si tu sesión se cerró, volvé a ingresar.",
    };
  }
  if (minimo === "moderador") {
    return {
      ok: false,
      error: "Tu sesión no tiene permisos para escribir. Si se cerró, volvé a ingresar.",
    };
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
 *  - la idea, FOR UPDATE: la politica decide sobre el estado, la publicacion y
 *    la marca de ganador que la idea tiene al escribir, no sobre los que tenia
 *    cuando alguien abrio la ficha. Dos personas sobre la misma idea quedan en
 *    fila, y la segunda decide (y deja en `revisiones` el estado anterior) con
 *    lo que escribio la primera.
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
    .select({ estado: ideas.estado, publicada: ideas.publicada, ganador: ideas.ganador })
    .from(ideas)
    .where(eq(ideas.id, ideaId))
    .for("update");
  if (!idea) return null;

  return {
    etapa: edicion.etapa,
    estado: idea.estado,
    publicada: idea.publicada,
    ganador: idea.ganador,
  };
}

/** Lo que `leerIdeaEnJuego` devuelve de una idea que existe. */
export type IdeaVigente = NonNullable<Awaited<ReturnType<typeof leerIdeaEnJuego>>>;

/**
 * La idea releida y bloqueada, si la etapa y la regla propia de la accion
 * (`regla`, opcional) dejan aplicarle `cambio`; si no, el motivo. Se llama como
 * primera cosa dentro de la transaccion: con un motivo la accion no escribe
 * nada (ni la idea ni la fila de `revisiones`) y lo devuelve como error, que la
 * pantalla muestra tal cual.
 *
 * La regla propia va aca adentro, sobre la misma fila, y no en una lectura
 * previa a la transaccion: entre esa lectura y el bloqueo otra persona puede
 * proclamar, evaluar o despublicar la idea. Asi un moderador que reabria una
 * idea justo cuando un administrador la proclamaba deshacia la proclamacion
 * (que es solo de un administrador), y el historial decia "Factible → En
 * evaluación" en lugar de "Ganador → En evaluación". Por lo mismo, la fila que
 * se devuelve es la que da el `estadoAnterior` de `revisiones`.
 */
export async function tomarIdeaParaCambiar(
  tx: Transaccion,
  ideaId: number,
  cambio: CambioDeIdea,
  regla?: (vigente: IdeaVigente) => string | null,
): Promise<{ ok: true; vigente: IdeaVigente } | { ok: false; motivo: string }> {
  const vigente = await leerIdeaEnJuego(tx, ideaId);
  if (!vigente) return { ok: false, motivo: "La idea no existe." };
  const propia = regla?.(vigente);
  if (propia) return { ok: false, motivo: propia };
  const veredicto = puedeCambiarIdea(vigente.etapa, vigente, cambio);
  return veredicto.permitido ? { ok: true, vigente } : { ok: false, motivo: veredicto.motivo };
}

/**
 * Lo mismo que `tomarIdeaParaCambiar`, para la accion que no necesita la fila:
 * el motivo por el que no se puede, o null si se puede.
 */
export async function bloqueoPorEtapa(
  tx: Transaccion,
  ideaId: number,
  cambio: CambioDeIdea,
  regla?: (vigente: IdeaVigente) => string | null,
): Promise<string | null> {
  const tomada = await tomarIdeaParaCambiar(tx, ideaId, cambio, regla);
  return tomada.ok ? null : tomada.motivo;
}

// ---------------------------------------------------------------------------
// Reglas propias de cada accion sobre una idea
//
// Lo que no depende de la etapa (eso es de src/lib/etapas.ts) sino de la marca
// de ganador, de la publicacion o del rol de quien lo pide. Son puras y cada
// accion las pasa a `tomarIdeaParaCambiar`, que las aplica sobre la fila
// bloqueada. Una accion puede preguntarlas tambien antes de la transaccion
// para contestar sin abrirla (`proclamarGanador`, que necesita la respuesta
// antes de calcular el ranking), pero la que vale es la de adentro.
// ---------------------------------------------------------------------------

/** Evaluar: un ganador no cambia de estado sin reabrir antes su revision. */
export function reglaParaEvaluar(vigente: Pick<IdeaVigente, "ganador">): string | null {
  return vigente.ganador
    ? "Esta idea está proclamada como ganadora. Reabrí la revisión antes de cambiarle el estado."
    : null;
}

/**
 * Publicar o despublicar: solo si la idea no esta ya como se pide, y un ganador
 * no se despublica sin reabrir antes su revision. Todas las cuentas publicas de
 * ganadores filtran por `ganador AND publicada`: despublicar uno lo sacaba del
 * sitio igual que deshacer la proclamacion (que es solo de un administrador),
 * y ademas dejaba la marca puesta, que no deja proclamar a otra idea del
 * distrito mientras el sitio dice que el distrito espera su proclamacion. Vale
 * tambien para un administrador, como `reglaParaEvaluar`: el camino es reabrir
 * (que le corresponde) y despues despublicar, sin pasar por ese estado.
 */
export function reglaParaPublicar(
  vigente: Pick<IdeaVigente, "publicada" | "ganador">,
  publicada: boolean,
): string | null {
  if (vigente.publicada === publicada) {
    return publicada ? "La idea ya está publicada." : "La idea ya estaba sin publicar.";
  }
  if (!publicada && vigente.ganador) {
    return "Esta idea está proclamada como ganadora. Reabrí la revisión antes de sacarla del sitio.";
  }
  return null;
}

/**
 * Reabrir: no hay nada que reabrir en una pendiente sin marca de ganador, y dar
 * marcha atras a una proclamacion es solo de un administrador.
 */
export function reglaParaReabrir(
  vigente: Pick<IdeaVigente, "estado" | "ganador">,
  rol: RolAdmin,
): string | null {
  if (vigente.estado === "pendiente" && !vigente.ganador) {
    return "La idea ya está pendiente de evaluación.";
  }
  if (vigente.ganador && rol !== "admin") {
    return "Dar marcha atrás a una proclamación la puede hacer solo un administrador.";
  }
  return null;
}

/**
 * Proclamar: solo una idea factible y publicada (el universo de
 * getVotosPorIdea), y que no este proclamada ya.
 */
export function reglaParaProclamar(
  vigente: Pick<IdeaVigente, "estado" | "publicada" | "ganador">,
): string | null {
  if (vigente.ganador) return "Este proyecto ya está proclamado como ganador de su distrito.";
  if (vigente.estado !== "factible" || !vigente.publicada) {
    return "Solo se proclama un proyecto que esté declarado factible y publicado.";
  }
  return null;
}

/** “A”, “B” y “C”. */
function enumerarTitulos(filas: Pick<FilaRanking, "titulo">[]): string {
  const titulos = filas.map((fila) => `“${fila.titulo}”`);
  if (titulos.length <= 1) return titulos.join("");
  return `${titulos.slice(0, -1).join(", ")} y ${titulos[titulos.length - 1]}`;
}

/**
 * Por que el ranking del distrito (getVotosPorIdea, ya ordenado) no deja
 * proclamar la idea `ideaId`, o null si es la mas votada sin empate.
 *
 * El empate se mira ANTES que el primer puesto: el ranking desempata el ORDEN
 * por numero de idea, que es un criterio de listado y no del reglamento. Si se
 * mirara primero quien quedo arriba, con dos ideas empatadas la de numero mayor
 * recibia "el proyecto más votado es la otra", que presenta como ganadora sola a
 * una idea empatada. Con empate en el primer puesto no se proclama ninguna: el
 * desempate lo resuelve el reglamento, no el panel.
 */
export function motivoPorRanking(
  ranking: Pick<FilaRanking, "id" | "titulo" | "votos">[],
  ideaId: number,
  distrito: number,
): string | null {
  const primera = ranking[0];
  if (!primera) return `El Distrito ${distrito} no tiene proyectos factibles publicados.`;

  const cabeza = ranking.filter((fila) => fila.votos === primera.votos);
  const estaArriba = cabeza.some((fila) => fila.id === ideaId);
  if (estaArriba) {
    if (cabeza.length === 1) return null;
    const otras = cabeza.filter((fila) => fila.id !== ideaId);
    return `Hay empate en ${primera.votos} votos con ${enumerarTitulos(otras)}. El desempate lo resuelve el reglamento, no el panel.`;
  }
  if (cabeza.length > 1) {
    return `El primer puesto del Distrito ${distrito} está empatado en ${primera.votos} votos entre ${enumerarTitulos(cabeza)}: no se puede proclamar otro, y el desempate lo resuelve el reglamento, no el panel.`;
  }
  return `El proyecto más votado del Distrito ${distrito} es “${primera.titulo}” con ${primera.votos} votos: no se puede proclamar otro.`;
}
