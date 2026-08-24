"use server";

/**
 * Server actions del backoffice.
 *
 * Toda accion empieza por `exigirAdmin(<rol minimo>)`: no hay ninguna via de
 * escritura sin ese chequeo. Las que cambian el estado de una idea o una cuenta
 * dejan siempre una fila de auditoria (`revisiones` / `bitacora_equipo`) en la
 * MISMA transaccion que el cambio, para que no exista un cambio sin rastro.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  admins,
  avances,
  bitacoraEquipo,
  distritos,
  ediciones,
  hitos,
  ideas,
  novedades,
  revisiones,
  textos,
} from "@/db/schema";
import {
  getVotosPorIdea,
  type AccionRevision,
  type EstadoIdea,
  type RolAdmin,
} from "@/db/queries";
import { hashearPassword, verificarPassword } from "@/lib/password";
import { consumir, hashearIp, ipDeCabeceras } from "@/lib/rate-limit";
import { cerrarSesionAdmin, crearSesionAdmin, getSesionAdmin } from "@/lib/sesion";
import { slugificar } from "@/lib/texto";

type Resultado =
  | { ok: true; mensaje?: string; passwordProvisoria?: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Autorizacion
// ---------------------------------------------------------------------------

/** lector < moderador < admin. */
const JERARQUIA: Record<RolAdmin, number> = { lector: 0, moderador: 1, admin: 2 };

type Autorizacion = {
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
async function exigirAdmin(minimo: RolAdmin): Promise<Autorizacion | null> {
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

function sinPermiso(minimo: RolAdmin): Resultado {
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
function mensajeDeError(causa: unknown): string {
  let mensaje = "";
  for (let error: unknown = causa; error instanceof Error; error = error.cause) {
    mensaje += ` ${error.message}`;
  }
  return mensaje;
}

function esViolacionDeUnico(causa: unknown): boolean {
  return /duplicate key|unique constraint|unique index|_idx|_unique/i.test(
    mensajeDeError(causa),
  );
}

/** Fila de auditoria de una idea. Se inserta en la misma transaccion del cambio. */
function filaRevision(datos: {
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

/** Largo minimo de la devolucion tecnica que el vecino va a leer. */
const MINIMO_DEVOLUCION = 40;

/**
 * Los estados que le dicen "no" a una idea no se pueden guardar sin devolucion:
 * es el texto que explica al vecino por que su propuesta no sigue.
 */
function faltaDevolucion(estado: EstadoIdea, texto: string | null): boolean {
  if (estado !== "no_factible" && estado !== "integrado") return false;
  return (texto ?? "").trim().length < MINIMO_DEVOLUCION;
}

const ERROR_DEVOLUCION =
  `Para marcar una idea como no factible o integrada tenés que escribir la ` +
  `devolución (mínimo ${MINIMO_DEVOLUCION} caracteres): es lo que lee el vecino.`;

// ---------------------------------------------------------------------------
// Sesion
// ---------------------------------------------------------------------------

export async function ingresarAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const email = String(formulario.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formulario.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Completá el correo y la contraseña." };

  // Tope de intentos por IP, igual que el login ciudadano de
  // /api/auth/ingresar. Este login es la puerta del backoffice: sin limite,
  // una contrasena debil se rompe por fuerza bruta sin dejar rastro.
  const limite = await consumir(
    `login-admin:${hashearIp(ipDeCabeceras(await headers()))}`,
    10,
    600,
  );
  if (!limite.permitido) {
    const minutos = Math.max(1, Math.ceil(limite.reiniciaEn / 60));
    return {
      ok: false,
      error: `Demasiados intentos. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`,
    };
  }

  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  // La verificacion corre aunque el usuario no exista, para no revelar
  // por tiempo de respuesta cuales correos estan registrados.
  const hashFalso =
    "scrypt$64$0000000000000000000000000000000000000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
  const valido = await verificarPassword(password, admin?.passwordHash ?? hashFalso);

  if (!admin || !admin.activo || !valido) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  // Fecha del ultimo ingreso: sirve para detectar cuentas abandonadas y para
  // que la persona note un ingreso que no hizo.
  await db
    .update(admins)
    .set({ ultimoIngreso: new Date() })
    .where(eq(admins.id, admin.id));

  await crearSesionAdmin({ adminId: admin.id, email: admin.email, rol: admin.rol });
  redirect("/admin");
}

export async function salirAdmin(): Promise<void> {
  await cerrarSesionAdmin();
  redirect("/admin/ingresar");
}

/**
 * Cambio de la propia contrasena. Pide la actual, salvo cuando la cuenta esta
 * marcada con `debeCambiarPassword` (la eligio otra persona al crear la cuenta,
 * asi que exigirla no protegeria nada).
 */
export async function cambiarMiPassword(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("lector");
  if (!sesion) return sinPermiso("lector");

  const actual = String(formulario.get("actual") ?? "");
  const nueva = String(formulario.get("nueva") ?? "");
  const repetida = String(formulario.get("repetida") ?? "");

  if (nueva.length < 12) {
    return { ok: false, error: "La contraseña nueva tiene que tener 12 caracteres o más." };
  }
  if (repetida && repetida !== nueva) {
    return { ok: false, error: "Las dos contraseñas nuevas no coinciden." };
  }

  const [cuenta] = await db
    .select({
      passwordHash: admins.passwordHash,
      debeCambiarPassword: admins.debeCambiarPassword,
    })
    .from(admins)
    .where(eq(admins.id, sesion.adminId))
    .limit(1);
  if (!cuenta) return { ok: false, error: "La cuenta ya no existe." };

  if (!cuenta.debeCambiarPassword) {
    if (!actual) return { ok: false, error: "Escribí tu contraseña actual." };
    if (!(await verificarPassword(actual, cuenta.passwordHash))) {
      return { ok: false, error: "La contraseña actual no es correcta." };
    }
  }
  if (await verificarPassword(nueva, cuenta.passwordHash)) {
    return { ok: false, error: "La contraseña nueva tiene que ser distinta de la anterior." };
  }

  const hash = await hashearPassword(nueva);
  await db.transaction(async (tx) => {
    await tx
      .update(admins)
      .set({ passwordHash: hash, debeCambiarPassword: false })
      .where(eq(admins.id, sesion.adminId));
    await tx.insert(bitacoraEquipo).values({
      adminId: sesion.adminId,
      adminNombre: sesion.nombre,
      objetivoId: sesion.adminId,
      objetivoEmail: sesion.email,
      accion: "cambio_password",
    });
  });

  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Contraseña actualizada." };
}

// ---------------------------------------------------------------------------
// Ideas: edicion general
// ---------------------------------------------------------------------------

const esquemaIdea = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.enum(["pendiente", "factible", "no_factible", "integrado", "ganador"]),
  motivoEstado: z.string().trim().max(5000).optional(),
  publicada: z.coerce.boolean(),
  presupuestoTotal: z
    .union([z.coerce.number().min(0), z.literal(""), z.null()])
    .optional(),
  estadoPresupuesto: z.enum([
    "sin_asignar",
    "preparacion",
    "contratacion",
    "ejecucion",
    "finalizado",
  ]),
});

/**
 * Formulario general de una idea: devolucion, publicacion y presupuesto.
 *
 * Dos cosas que este formulario ya NO puede hacer:
 *  - editar el contador de votos: un contador editable a mano vuelve
 *    indefendible cualquier resultado discutido;
 *  - marcar un ganador: eso lo hace `proclamarGanador`, que valida los votos
 *    del distrito y es el unico escritor de la columna `ganador`.
 */
export async function actualizarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  let datos: z.infer<typeof esquemaIdea>;
  try {
    datos = esquemaIdea.parse({
      id: formulario.get("id"),
      estado: formulario.get("estado"),
      motivoEstado: formulario.get("motivoEstado") ?? undefined,
      publicada: formulario.get("publicada") === "on",
      presupuestoTotal: formulario.get("presupuestoTotal") || null,
      estadoPresupuesto: formulario.get("estadoPresupuesto"),
    });
  } catch {
    return { ok: false, error: "Datos inválidos." };
  }

  if (datos.estado === "ganador") {
    return {
      ok: false,
      error:
        "El estado “ganador” no se elige a mano: se proclama, y la proclamación verifica que sea el proyecto más votado del distrito.",
    };
  }

  const [previa] = await db
    .select({
      estado: ideas.estado,
      publicada: ideas.publicada,
      motivoEstado: ideas.motivoEstado,
    })
    .from(ideas)
    .where(eq(ideas.id, datos.id))
    .limit(1);
  if (!previa) return { ok: false, error: "La idea no existe." };

  // La devolucion que va a quedar guardada: la nueva si vino, la anterior si no.
  const devolucion = datos.motivoEstado || previa.motivoEstado;
  if (previa.estado !== datos.estado && faltaDevolucion(datos.estado, devolucion)) {
    return { ok: false, error: ERROR_DEVOLUCION };
  }

  const ahora = new Date();
  const cambioEstado = previa.estado !== datos.estado;
  const cambioPublicacion = previa.publicada !== datos.publicada;

  await db.transaction(async (tx) => {
    await tx
      .update(ideas)
      .set({
        estado: datos.estado,
        // La devolucion tecnica es lo que el vecino lee para saber por que su
        // idea no fue factible: guardar el formulario con el textarea vacio no
        // la borra. Se corrige escribiendo otra, no vaciandola.
        ...(datos.motivoEstado ? { motivoEstado: datos.motivoEstado } : {}),
        publicada: datos.publicada,
        ...(cambioEstado
          ? { estadoActualizadoEn: ahora, revisadoPorId: sesion.adminId }
          : {}),
        presupuestoTotal:
          datos.presupuestoTotal === null || datos.presupuestoTotal === ""
            ? null
            : String(datos.presupuestoTotal),
        estadoPresupuesto: datos.estadoPresupuesto,
        updatedAt: ahora,
      })
      .where(eq(ideas.id, datos.id));

    // Ningun cambio de estado o de publicacion queda sin fila en el historial,
    // venga de este formulario o de la bandeja de revision.
    if (cambioEstado) {
      await tx.insert(revisiones).values(
        filaRevision({
          ideaId: datos.id,
          sesion,
          accion: "evaluacion",
          estadoAnterior: previa.estado,
          estadoNuevo: datos.estado,
          nota: datos.motivoEstado || null,
        }),
      );
    }
    if (cambioPublicacion) {
      await tx.insert(revisiones).values(
        filaRevision({
          ideaId: datos.id,
          sesion,
          accion: datos.publicada ? "publicacion" : "despublicacion",
          nota: "Cambio hecho desde el formulario de la idea.",
        }),
      );
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ideas: bandeja de revision
// ---------------------------------------------------------------------------

const esquemaEvaluacion = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.enum(["pendiente", "factible", "no_factible", "integrado"]),
  devolucion: z.string().trim().max(5000),
});

/**
 * Evalua una idea: fija el estado y escribe la devolucion tecnica.
 *
 * Para `no_factible` e `integrado` la devolucion es obligatoria y no se guarda
 * nada si falta: un "no" sin explicacion es exactamente lo que el sitio
 * anterior dejaba sin resolver.
 */
export async function evaluarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  let datos: z.infer<typeof esquemaEvaluacion>;
  try {
    datos = esquemaEvaluacion.parse({
      id: formulario.get("id"),
      estado: formulario.get("estado"),
      devolucion: formulario.get("devolucion") ?? "",
    });
  } catch {
    return { ok: false, error: "Datos inválidos." };
  }

  const [previa] = await db
    .select({ estado: ideas.estado, motivoEstado: ideas.motivoEstado, ganador: ideas.ganador })
    .from(ideas)
    .where(eq(ideas.id, datos.id))
    .limit(1);
  if (!previa) return { ok: false, error: "La idea no existe." };

  if (previa.ganador) {
    return {
      ok: false,
      error:
        "Esta idea está proclamada como ganadora. Reabrí la revisión antes de cambiarle el estado.",
    };
  }

  const devolucion = datos.devolucion || previa.motivoEstado;
  if (faltaDevolucion(datos.estado, devolucion)) {
    return { ok: false, error: ERROR_DEVOLUCION };
  }

  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ideas)
      .set({
        estado: datos.estado,
        ...(datos.devolucion ? { motivoEstado: datos.devolucion } : {}),
        estadoActualizadoEn: ahora,
        revisadoPorId: sesion.adminId,
        updatedAt: ahora,
      })
      .where(eq(ideas.id, datos.id));

    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: datos.id,
        sesion,
        accion: "evaluacion",
        estadoAnterior: previa.estado,
        estadoNuevo: datos.estado,
        nota: datos.devolucion || previa.motivoEstado,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Publica una idea. La publicacion es una decision aparte del estado tecnico. */
export async function publicarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  return cambiarPublicacion(formulario, true);
}

/**
 * Saca una idea del sitio publico. Pide motivo: sacar algo que el vecino ya vio
 * publicado tiene que quedar explicado en el historial.
 */
export async function despublicarIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  return cambiarPublicacion(formulario, false);
}

async function cambiarPublicacion(
  formulario: FormData,
  publicada: boolean,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const id = Number(formulario.get("id"));
  const motivo = String(formulario.get("motivo") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Idea inválida." };
  if (motivo.length > 5000) return { ok: false, error: "El motivo es demasiado largo." };
  if (!publicada && motivo.length < 10) {
    return {
      ok: false,
      error: "Escribí el motivo por el que la idea se despublica (mínimo 10 caracteres).",
    };
  }

  const [previa] = await db
    .select({ publicada: ideas.publicada })
    .from(ideas)
    .where(eq(ideas.id, id))
    .limit(1);
  if (!previa) return { ok: false, error: "La idea no existe." };
  if (previa.publicada === publicada) {
    return {
      ok: false,
      error: publicada ? "La idea ya está publicada." : "La idea ya estaba sin publicar.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ideas)
      .set({ publicada, updatedAt: new Date() })
      .where(eq(ideas.id, id));
    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: id,
        sesion,
        accion: publicada ? "publicacion" : "despublicacion",
        nota: motivo || null,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Proclama el proyecto ganador de un distrito.
 *
 * Es el unico lugar del sistema que escribe `ideas.ganador`, y solo lo hace si
 * la idea es la mas votada de su distrito dentro del universo del reglamento
 * (factible y publicada, ver getVotosPorIdea). Si hay empate en el primer
 * puesto no proclama: el desempate lo define el reglamento, no el panel.
 */
export async function proclamarGanador(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  const nota = String(formulario.get("nota") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Idea inválida." };

  const [idea] = await db
    .select({
      id: ideas.id,
      titulo: ideas.titulo,
      estado: ideas.estado,
      publicada: ideas.publicada,
      edicionId: ideas.edicionId,
      distrito: distritos.numero,
    })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .where(eq(ideas.id, id))
    .limit(1);

  if (!idea) return { ok: false, error: "La idea no existe." };
  if (idea.distrito === null) {
    return { ok: false, error: "La idea no tiene distrito asignado: no se puede proclamar." };
  }
  if (idea.estado !== "factible" || !idea.publicada) {
    return {
      ok: false,
      error: "Solo se proclama un proyecto que esté declarado factible y publicado.",
    };
  }

  const distrito = Number(idea.distrito);
  const ranking = await getVotosPorIdea(idea.edicionId, distrito);
  const primera = ranking[0];
  if (!primera) {
    return {
      ok: false,
      error: `El Distrito ${distrito} no tiene proyectos factibles publicados.`,
    };
  }
  if (primera.id !== idea.id) {
    return {
      ok: false,
      error: `El proyecto más votado del Distrito ${distrito} es “${primera.titulo}” con ${primera.votos} votos: no se puede proclamar otro.`,
    };
  }
  const segunda = ranking[1];
  if (segunda && segunda.votos === primera.votos) {
    return {
      ok: false,
      error: `Hay empate en ${primera.votos} votos con “${segunda.titulo}”. El desempate lo resuelve el reglamento, no el panel.`,
    };
  }

  // Un distrito, un ganador. Si ya hay uno proclamado hay que reabrir esa
  // revision primero: asi el cambio queda registrado en las dos ideas.
  const [proclamado] = await db
    .select({ titulo: ideas.titulo })
    .from(ideas)
    .innerJoin(distritos, eq(distritos.id, ideas.distritoId))
    .where(
      and(
        eq(ideas.edicionId, idea.edicionId),
        eq(distritos.numero, distrito),
        eq(ideas.ganador, true),
      ),
    )
    .limit(1);
  if (proclamado) {
    return {
      ok: false,
      error: `El Distrito ${distrito} ya tiene un ganador proclamado (“${proclamado.titulo}”). Reabrí esa revisión antes de proclamar otro.`,
    };
  }

  const ahora = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(ideas)
        .set({
          estado: "ganador",
          ganador: true,
          estadoActualizadoEn: ahora,
          revisadoPorId: sesion.adminId,
          updatedAt: ahora,
        })
        .where(eq(ideas.id, idea.id));
      await tx.insert(revisiones).values(
        filaRevision({
          ideaId: idea.id,
          sesion,
          accion: "proclamacion",
          estadoAnterior: idea.estado,
          estadoNuevo: "ganador",
          nota: nota || `Proyecto más votado del Distrito ${distrito}: ${primera.votos} votos.`,
        }),
      );
    });
  } catch (causa) {
    // Nunca dejar explotar la accion: la pantalla tiene que poder mostrar algo.
    console.error("[admin] proclamarGanador fallo", causa);
    if (esViolacionDeUnico(causa)) {
      return {
        ok: false,
        error: "La base rechazó la proclamación por un dato repetido. Revisá el distrito y el número de la idea.",
      };
    }
    return { ok: false, error: "No se pudo proclamar el proyecto." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Devuelve una idea a `pendiente`. Es la marcha atras de una evaluacion o de
 * una proclamacion equivocada; si la idea estaba proclamada tambien apaga la
 * marca de ganador, y eso lo puede hacer solo un admin.
 */
export async function reabrirRevision(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const id = Number(formulario.get("id"));
  const motivo = String(formulario.get("motivo") ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Idea inválida." };
  if (motivo.length < 10 || motivo.length > 5000) {
    return {
      ok: false,
      error: "Escribí el motivo por el que la revisión se reabre (mínimo 10 caracteres).",
    };
  }

  const [previa] = await db
    .select({ estado: ideas.estado, ganador: ideas.ganador })
    .from(ideas)
    .where(eq(ideas.id, id))
    .limit(1);
  if (!previa) return { ok: false, error: "La idea no existe." };
  if (previa.estado === "pendiente" && !previa.ganador) {
    return { ok: false, error: "La idea ya está pendiente de evaluación." };
  }
  if (previa.ganador && sesion.rol !== "admin") {
    return {
      ok: false,
      error: "Dar marcha atrás a una proclamación la puede hacer solo un administrador.",
    };
  }

  const ahora = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ideas)
      .set({
        estado: "pendiente",
        ganador: false,
        estadoActualizadoEn: ahora,
        revisadoPorId: sesion.adminId,
        updatedAt: ahora,
      })
      .where(eq(ideas.id, id));
    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: id,
        sesion,
        accion: "reapertura",
        estadoAnterior: previa.estado,
        estadoNuevo: "pendiente",
        nota: motivo,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Avances de obra
// ---------------------------------------------------------------------------

const esquemaAvance = z.object({
  ideaId: z.coerce.number().int().positive(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  etapa: z.enum(["preparacion", "contratacion", "ejecucion", "finalizado"]),
  titulo: z.string().trim().min(3).max(200),
  descripcion: z.string().trim().max(3000).optional(),
  monto: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  porcentaje: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).optional(),
});

export async function crearAvance(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("moderador"))) return sinPermiso("moderador");

  let datos: z.infer<typeof esquemaAvance>;
  try {
    datos = esquemaAvance.parse({
      ideaId: formulario.get("ideaId"),
      fecha: formulario.get("fecha"),
      etapa: formulario.get("etapa"),
      titulo: formulario.get("titulo"),
      descripcion: formulario.get("descripcion") ?? undefined,
      monto: formulario.get("monto") ?? "",
      porcentaje: formulario.get("porcentaje") ?? "",
    });
  } catch {
    return { ok: false, error: "Revisá los campos del avance." };
  }

  await db.insert(avances).values({
    ideaId: datos.ideaId,
    fecha: datos.fecha,
    etapa: datos.etapa,
    titulo: datos.titulo,
    descripcion: datos.descripcion || null,
    monto: datos.monto === "" || datos.monto === undefined ? null : String(datos.monto),
    porcentaje:
      datos.porcentaje === "" || datos.porcentaje === undefined ? null : datos.porcentaje,
  });

  // El estado del presupuesto acompaña al ultimo avance publicado.
  await db
    .update(ideas)
    .set({ estadoPresupuesto: datos.etapa, updatedAt: new Date() })
    .where(eq(ideas.id, datos.ideaId));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function borrarAvance(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("moderador"))) return sinPermiso("moderador");
  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "Avance inválido." };
  await db.delete(avances).where(eq(avances.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ediciones y cronograma
// ---------------------------------------------------------------------------

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;

export async function cambiarEtapa(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("admin"))) return sinPermiso("admin");

  const id = Number(formulario.get("edicionId"));
  const etapa = String(formulario.get("etapa"));
  if (!Number.isInteger(id) || !ETAPAS.includes(etapa as (typeof ETAPAS)[number])) {
    return { ok: false, error: "Etapa inválida." };
  }

  await db
    .update(ediciones)
    .set({ etapa: etapa as (typeof ETAPAS)[number] })
    .where(eq(ediciones.id, id));

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function crearEdicion(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("admin"))) return sinPermiso("admin");

  const anio = Number(formulario.get("anio"));
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) {
    return { ok: false, error: "El año tiene que estar entre 2020 y 2100." };
  }

  const [existente] = await db
    .select({ id: ediciones.id })
    .from(ediciones)
    .where(eq(ediciones.anio, anio))
    .limit(1);
  if (existente) return { ok: false, error: `Ya existe la edición ${anio}.` };

  try {
    // La edicion nace inactiva: se activa aparte, en una transaccion que apaga
    // las demas (ver activarEdicion).
    await db.insert(ediciones).values({ anio, etapa: "ideas", activa: false });
  } catch (causa) {
    console.error("[admin] crearEdicion fallo", causa);
    if (esViolacionDeUnico(causa)) {
      return { ok: false, error: `Ya existe la edición ${anio}.` };
    }
    return { ok: false, error: "No se pudo crear la edición." };
  }

  revalidatePath("/", "layout");
  return { ok: true, mensaje: `Edición ${anio} creada.` };
}

const esquemaEdicion = z.object({
  id: z.coerce.number().int().positive(),
  ideasDesde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  ideasHasta: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  votacionDesde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  votacionHasta: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  presupuestoTotal: z.union([z.coerce.number().min(0), z.literal("")]),
});

export async function guardarEdicion(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("admin"))) return sinPermiso("admin");

  let datos: z.infer<typeof esquemaEdicion>;
  try {
    datos = esquemaEdicion.parse({
      id: formulario.get("id"),
      ideasDesde: formulario.get("ideasDesde") ?? "",
      ideasHasta: formulario.get("ideasHasta") ?? "",
      votacionDesde: formulario.get("votacionDesde") ?? "",
      votacionHasta: formulario.get("votacionHasta") ?? "",
      presupuestoTotal: formulario.get("presupuestoTotal") ?? "",
    });
  } catch {
    return { ok: false, error: "Revisá las fechas (formato AAAA-MM-DD) y el presupuesto." };
  }

  // Las fechas en formato ISO se comparan como texto sin ambiguedad.
  if (datos.ideasDesde && datos.ideasHasta && datos.ideasDesde > datos.ideasHasta) {
    return { ok: false, error: "La presentación de ideas no puede terminar antes de empezar." };
  }
  if (
    datos.votacionDesde &&
    datos.votacionHasta &&
    datos.votacionDesde > datos.votacionHasta
  ) {
    return { ok: false, error: "La votación no puede terminar antes de empezar." };
  }

  const [edicion] = await db
    .select({ id: ediciones.id })
    .from(ediciones)
    .where(eq(ediciones.id, datos.id))
    .limit(1);
  if (!edicion) return { ok: false, error: "La edición no existe." };

  await db
    .update(ediciones)
    .set({
      ideasDesde: datos.ideasDesde || null,
      ideasHasta: datos.ideasHasta || null,
      votacionDesde: datos.votacionDesde || null,
      votacionHasta: datos.votacionHasta || null,
      presupuestoTotal:
        datos.presupuestoTotal === "" ? null : String(datos.presupuestoTotal),
    })
    .where(eq(ediciones.id, datos.id));

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Activa una edicion y desactiva las demas EN LA MISMA TRANSACCION: el indice
 * unico parcial `ediciones_una_activa_idx` rechaza dos filas con activa = true,
 * asi que el orden (primero apagar, despues prender) no es opcional.
 */
export async function activarEdicion(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("admin"))) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Edición inválida." };

  const [edicion] = await db
    .select({ id: ediciones.id, anio: ediciones.anio })
    .from(ediciones)
    .where(eq(ediciones.id, id))
    .limit(1);
  if (!edicion) return { ok: false, error: "La edición no existe." };

  try {
    await db.transaction(async (tx) => {
      await tx.update(ediciones).set({ activa: false }).where(ne(ediciones.id, id));
      await tx.update(ediciones).set({ activa: true }).where(eq(ediciones.id, id));
    });
  } catch (causa) {
    console.error("[admin] activarEdicion fallo", causa);
    if (esViolacionDeUnico(causa)) {
      return {
        ok: false,
        error: "Quedó otra edición activa. Volvé a intentarlo: solo puede haber una.",
      };
    }
    return { ok: false, error: "No se pudo activar la edición." };
  }

  revalidatePath("/", "layout");
  return { ok: true, mensaje: `Edición ${edicion.anio} activa.` };
}

const esquemaHito = z.object({
  id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
  edicionId: z.coerce.number().int().positive(),
  orden: z.coerce.number().int().min(0).max(999),
  titulo: z.string().trim().min(3).max(200),
  detalle: z.string().trim().max(2000).optional(),
  desde: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  hasta: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]),
  etapa: z.union([z.enum(ETAPAS), z.literal("")]),
});

export async function guardarHito(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("moderador"))) return sinPermiso("moderador");

  let datos: z.infer<typeof esquemaHito>;
  try {
    datos = esquemaHito.parse({
      id: formulario.get("id") ?? "",
      edicionId: formulario.get("edicionId"),
      orden: formulario.get("orden") || 0,
      titulo: formulario.get("titulo"),
      detalle: formulario.get("detalle") ?? undefined,
      desde: formulario.get("desde") ?? "",
      hasta: formulario.get("hasta") ?? "",
      etapa: formulario.get("etapa") ?? "",
    });
  } catch {
    return { ok: false, error: "Revisá el título, el orden y las fechas del hito." };
  }

  if (datos.desde && datos.hasta && datos.desde > datos.hasta) {
    return { ok: false, error: "El hito no puede terminar antes de empezar." };
  }

  const valores = {
    edicionId: datos.edicionId,
    orden: datos.orden,
    titulo: datos.titulo,
    detalle: datos.detalle || null,
    desde: datos.desde || null,
    hasta: datos.hasta || null,
    etapa: datos.etapa || null,
  };

  if (typeof datos.id === "number") {
    await db.update(hitos).set(valores).where(eq(hitos.id, datos.id));
  } else {
    await db.insert(hitos).values(valores);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function borrarHito(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("moderador"))) return sinPermiso("moderador");
  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Hito inválido." };
  await db.delete(hitos).where(eq(hitos.id, id));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contenido editable
// ---------------------------------------------------------------------------

export async function guardarTexto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("moderador"))) return sinPermiso("moderador");

  const clave = String(formulario.get("clave") ?? "").trim();
  const valor = String(formulario.get("valor") ?? "").trim();
  if (!clave || clave.length > 100) return { ok: false, error: "Clave inválida." };

  await db
    .insert(textos)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: textos.clave, set: { valor, updatedAt: new Date() } });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function crearNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  if (!(await exigirAdmin("moderador"))) return sinPermiso("moderador");

  const titulo = String(formulario.get("titulo") ?? "").trim();
  const cuerpo = String(formulario.get("cuerpo") ?? "").trim();
  const fecha = String(formulario.get("fecha") ?? "").trim();
  const copete = String(formulario.get("copete") ?? "").trim();
  if (titulo.length < 3 || !cuerpo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Completá título, fecha y cuerpo." };
  }

  await db.insert(novedades).values({
    titulo,
    slug: `${slugificar(titulo)}-${Date.now().toString(36)}`,
    copete: copete || null,
    cuerpo,
    fecha,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Equipo del backoffice
// ---------------------------------------------------------------------------

const ROLES = ["admin", "moderador", "lector"] as const;

const esquemaAdmin = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  nombre: z.string().trim().min(3).max(120),
  rol: z.enum(ROLES),
});

/**
 * Alta de una cuenta del backoffice.
 *
 * La contrasena provisoria la genera el servidor (nadie la elige por la otra
 * persona) y se devuelve UNA sola vez, para que la pantalla la muestre y quien
 * la recibe la cambie en el primer ingreso: la cuenta queda marcada con
 * `debeCambiarPassword`.
 */
export async function crearAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  let datos: z.infer<typeof esquemaAdmin>;
  try {
    datos = esquemaAdmin.parse({
      email: formulario.get("email"),
      nombre: formulario.get("nombre"),
      rol: formulario.get("rol"),
    });
  } catch {
    return { ok: false, error: "Revisá el correo, el nombre y el rol." };
  }

  const [existente] = await db
    .select({ id: admins.id })
    .from(admins)
    .where(eq(admins.email, datos.email))
    .limit(1);
  if (existente) return { ok: false, error: `Ya hay una cuenta con ${datos.email}.` };

  // 12 bytes al azar en base64url: 16 caracteres, sin nada que adivinar.
  const provisoria = randomBytes(12).toString("base64url");
  const hash = await hashearPassword(provisoria);

  try {
    await db.transaction(async (tx) => {
      const [creado] = await tx
        .insert(admins)
        .values({
          email: datos.email,
          nombre: datos.nombre,
          passwordHash: hash,
          rol: datos.rol,
          activo: true,
          debeCambiarPassword: true,
        })
        .returning({ id: admins.id });

      await tx.insert(bitacoraEquipo).values({
        adminId: sesion.adminId,
        adminNombre: sesion.nombre,
        objetivoId: creado.id,
        objetivoEmail: datos.email,
        accion: "alta",
        rolNuevo: datos.rol,
      });
    });
  } catch (causa) {
    console.error("[admin] crearAdmin fallo", causa);
    if (esViolacionDeUnico(causa)) {
      return { ok: false, error: `Ya hay una cuenta con ${datos.email}.` };
    }
    return { ok: false, error: "No se pudo crear la cuenta." };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    passwordProvisoria: provisoria,
    mensaje:
      "Contraseña provisoria generada. Se muestra una sola vez: copiala y entregala en mano. Quien la reciba tiene que cambiarla al ingresar.",
  };
}

export async function cambiarRolAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  const rol = String(formulario.get("rol"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Cuenta inválida." };
  if (!ROLES.includes(rol as RolAdmin)) return { ok: false, error: "Rol inválido." };

  // Nadie se cambia el rol a si mismo: es lo que evita que el ultimo admin se
  // degrade y deje el backoffice sin nadie que pueda administrarlo.
  if (id === sesion.adminId) {
    return { ok: false, error: "No podés cambiarte el rol a vos mismo. Pedíselo a otro administrador." };
  }

  const [cuenta] = await db
    .select({ id: admins.id, email: admins.email, rol: admins.rol })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!cuenta) return { ok: false, error: "La cuenta no existe." };
  if (cuenta.rol === rol) return { ok: false, error: "La cuenta ya tiene ese rol." };

  await db.transaction(async (tx) => {
    await tx
      .update(admins)
      .set({ rol: rol as RolAdmin })
      .where(eq(admins.id, id));
    await tx.insert(bitacoraEquipo).values({
      adminId: sesion.adminId,
      adminNombre: sesion.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: "cambio_rol",
      rolAnterior: cuenta.rol,
      rolNuevo: rol as RolAdmin,
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Activa o desactiva una cuenta. El campo `activo` llega como "true" o "false". */
export async function activarAdmin(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  const valor = String(formulario.get("activo") ?? "");
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Cuenta inválida." };
  if (valor !== "true" && valor !== "false") {
    return { ok: false, error: "Falta indicar si la cuenta queda activa." };
  }
  const activo = valor === "true";

  if (id === sesion.adminId && !activo) {
    return { ok: false, error: "No podés desactivar tu propia cuenta." };
  }

  const [cuenta] = await db
    .select({ id: admins.id, email: admins.email, activo: admins.activo })
    .from(admins)
    .where(eq(admins.id, id))
    .limit(1);
  if (!cuenta) return { ok: false, error: "La cuenta no existe." };
  if (cuenta.activo === activo) {
    return {
      ok: false,
      error: activo ? "La cuenta ya está activa." : "La cuenta ya estaba desactivada.",
    };
  }

  await db.transaction(async (tx) => {
    await tx.update(admins).set({ activo }).where(eq(admins.id, id));
    await tx.insert(bitacoraEquipo).values({
      adminId: sesion.adminId,
      adminNombre: sesion.nombre,
      objetivoId: cuenta.id,
      objetivoEmail: cuenta.email,
      accion: activo ? "reactivacion" : "desactivacion",
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
