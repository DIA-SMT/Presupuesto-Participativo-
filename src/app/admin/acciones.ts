"use server";

/**
 * Server actions del backoffice.
 *
 * Toda accion empieza por `exigirAdmin(<rol minimo>)`: no hay ninguna via de
 * escritura sin ese chequeo. Las que tienen consecuencias dejan siempre una fila
 * de auditoria en la MISMA transaccion que el cambio, para que no exista un
 * cambio sin rastro. Hay tres bitacoras, una por tipo de cosa auditada:
 *  - `revisiones`: lo que se le hace a UNA idea;
 *  - `bitacora_equipo`: lo que se le hace a UNA cuenta del backoffice;
 *  - `bitacora_sistema`: lo que cambia el sistema o el contenido publico (la
 *    etapa de la edicion, las ediciones, el cronograma, los textos, las
 *    novedades y los avances de obra).
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
  bitacoraSistema,
  categorias,
  chatConsultas,
  distritos,
  ediciones,
  hitos,
  ideas,
  informesImpacto,
  novedades,
  revisiones,
  textos,
} from "@/db/schema";
import {
  getVotosPorIdea,
  type AccionRevision,
  type AccionSistema,
  type EntidadSistema,
  type EstadoIdea,
  type RolAdmin,
} from "@/db/queries";
import { generarInforme, tieneMaterial } from "@/lib/informe-impacto";
// `mensajeDeError` ya existe aca abajo con otro proposito (encadenar causas):
// el del proveedor se importa con otro nombre para no pisarlo.
import { hayClave, mensajeDeError as mensajeDelProveedor } from "@/lib/modelo";
import { hashearPassword, verificarPassword } from "@/lib/password";
import { MINIMO_PASSWORD } from "@/lib/politica-password";
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

/**
 * Tope del ANTES y del DESPUES de `bitacora_sistema`. El valor de un texto del
 * sitio puede ser un cuerpo entero: la bitacora audita QUE cambio, no guarda
 * versiones del contenido, asi que lo que pase el tope se recorta y se marca con
 * el largo real.
 */
const MAXIMO_VALOR_BITACORA = 400;

/** Tope de la etiqueta legible de la entidad (un titulo, una clave). */
const MAXIMO_ETIQUETA_BITACORA = 200;

/** Recorta por puntos de codigo (no por unidades UTF-16) para no partir un emoji. */
function recortarValor(
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
function filaSistema(datos: {
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

/** Fecha ISO tal como esta guardada, o el texto que la reemplaza si falta. */
function fechaOTexto(valor: string | null): string {
  return valor ?? "sin fecha";
}

/** Fechas y presupuesto de una edicion, en una linea comparable y legible. */
function resumenEdicion(edicion: {
  ideasDesde: string | null;
  ideasHasta: string | null;
  votacionDesde: string | null;
  votacionHasta: string | null;
  presupuestoTotal: string | null;
}): string {
  return [
    `Ideas: ${fechaOTexto(edicion.ideasDesde)} → ${fechaOTexto(edicion.ideasHasta)}`,
    `Votación: ${fechaOTexto(edicion.votacionDesde)} → ${fechaOTexto(edicion.votacionHasta)}`,
    `Presupuesto: ${montoEnPesos(
      edicion.presupuestoTotal === null ? null : Number(edicion.presupuestoTotal),
    )}`,
  ].join(" · ");
}

/** Un hito del cronograma en una linea. */
function resumenHito(hito: {
  titulo: string;
  orden: number;
  detalle: string | null;
  desde: string | null;
  hasta: string | null;
  etapa: string | null;
}): string {
  return [
    `“${hito.titulo}”`,
    `orden ${hito.orden}`,
    `${fechaOTexto(hito.desde)} → ${fechaOTexto(hito.hasta)}`,
    `etapa: ${hito.etapa ?? "ninguna"}`,
    hito.detalle ? `detalle: ${hito.detalle}` : "sin detalle",
  ].join(" · ");
}

/**
 * Un avance de obra en una linea. Incluye la descripcion porque este resumen es
 * lo unico que queda de un avance borrado.
 */
function resumenAvance(avance: {
  fecha: string;
  etapa: string;
  titulo: string;
  descripcion: string | null;
  monto: string | null;
  porcentaje: number | null;
}): string {
  return [
    `“${avance.titulo}”`,
    `fecha ${avance.fecha}`,
    `etapa ${avance.etapa}`,
    `monto ${montoEnPesos(avance.monto === null ? null : Number(avance.monto))}`,
    avance.porcentaje === null ? "sin porcentaje" : `${avance.porcentaje}% de avance`,
    avance.descripcion ? `descripción: ${avance.descripcion}` : "sin descripción",
  ].join(" · ");
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
function opcional<T extends z.ZodType<number>>(esquema: T) {
  return z.preprocess(
    (valor) =>
      valor === "" || valor === null || valor === undefined ? null : valor,
    esquema.nullable(),
  );
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

  if (nueva.length < MINIMO_PASSWORD) {
    return {
      ok: false,
      error: `La contraseña nueva tiene que tener ${MINIMO_PASSWORD} caracteres o más.`,
    };
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
// Ideas: bandeja de revision
//
// `actualizarIdea` (el viejo formulario general de /admin) se elimino: editaba
// estado, devolucion y publicacion SIN dejar historial completo y conviviendo
// con la bandeja, asi que un mismo cambio tenia dos caminos y uno de los dos no
// dejaba rastro. Todo lo que toca el estado de una idea pasa por las acciones de
// abajo, que escriben en `revisiones` en la misma transaccion.
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

/**
 * Genera el informe de impacto de una idea.
 *
 * Es un insumo interno: NO cambia el estado de la idea ni escribe en
 * `motivo_estado`, que es la devolucion que lee el vecino. Si el informe
 * propone un texto de devolucion, la persona lo copia, lo edita y lo guarda con
 * `evaluarIdea`, que es el unico camino auditado hacia esa columna.
 *
 * Deja fila en `revisiones` igual, aunque no cambie nada: que hubo un analisis
 * automatico de por medio es parte del expediente.
 */
export async function generarInformeImpacto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "Datos inválidos." };
  }

  if (!hayClave()) {
    return {
      ok: false,
      error:
        "El informe necesita la clave del modelo (OPENROUTER_API_KEY), que no está configurada en el servidor.",
    };
  }

  // Tope por cuenta: sin esto, un clic repetido dispara N llamadas pagas sobre
  // la misma idea.
  const limite = await consumir(`informe:${sesion.adminId}`, 30, 3600);
  if (!limite.permitido) {
    return {
      ok: false,
      error: `Ya generaste 30 informes en la última hora. Probá de nuevo en ${Math.ceil(
        limite.reiniciaEn / 60,
      )} minutos.`,
    };
  }

  const [idea] = await db
    .select({
      titulo: ideas.titulo,
      barrio: ideas.barrio,
      distrito: distritos.numero,
      categoria: categorias.nombre,
      problema: ideas.problema,
      solucion: ideas.solucion,
      beneficios: ideas.beneficios,
    })
    .from(ideas)
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .leftJoin(categorias, eq(categorias.id, ideas.categoriaId))
    .where(eq(ideas.id, id))
    .limit(1);
  if (!idea) return { ok: false, error: "La idea no existe." };

  // Sin texto no hay informe posible. Es el caso de casi todas las ideas de
  // 2025: el relevamiento del sitio anterior solo recupero el de los ganadores.
  if (!tieneMaterial(idea)) {
    return {
      ok: false,
      error:
        "Esta idea no tiene problema ni solución cargados: no hay material para analizar. Cargá el texto de la propuesta y volvé a intentar.",
    };
  }

  const inicio = Date.now();
  let generado: Awaited<ReturnType<typeof generarInforme>>;
  try {
    generado = await generarInforme(idea);
  } catch (causa) {
    console.error("[informe]", causa);
    return {
      ok: false,
      error: mensajeDelProveedor(
        causa,
        "No se pudo generar el informe. Probá de nuevo en un momento.",
      ),
    };
  }
  const ms = Date.now() - inicio;

  const fila = {
    ideaId: id,
    ...generado.datos,
    modelo: generado.modelo,
    tokensEntrada: generado.consumo.tokensEntrada,
    tokensSalida: generado.consumo.tokensSalida,
    ms,
    pedidoPorId: sesion.adminId,
    pedidoPorNombre: sesion.nombre,
    createdAt: new Date(),
  };

  await db.transaction(async (tx) => {
    // Hay un informe por idea: regenerar reemplaza al anterior. El rastro de
    // cada pedido queda en `revisiones`, que si es append-only.
    await tx
      .insert(informesImpacto)
      .values(fila)
      .onConflictDoUpdate({ target: informesImpacto.ideaId, set: fila });

    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: id,
        sesion,
        accion: "informe",
        nota: `Informe de impacto generado con ${generado.modelo}.`,
      }),
    );
  });

  // Registro de costo, en la misma tabla que el chat y el asistente.
  try {
    await db.insert(chatConsultas).values({
      origen: "informe",
      pregunta: idea.titulo,
      respuesta: generado.datos.resumen,
      herramientas: [],
      modelo: generado.modelo,
      tokensEntrada: generado.consumo.tokensEntrada,
      tokensSalida: generado.consumo.tokensSalida,
      cacheLectura: generado.consumo.cacheLectura,
      ms,
      ok: true,
    });
  } catch (causa) {
    console.error("[informe] no se pudo registrar el costo", causa);
  }

  // Solo cambia una pantalla del backoffice: no hace falta tirar abajo el
  // cache del sitio publico entero como hacen las acciones que publican.
  revalidatePath("/admin");
  return { ok: true, mensaje: "Informe generado." };
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
// Presupuesto asignado a un proyecto
// ---------------------------------------------------------------------------

/** Tope de `ideas.presupuesto_total`: numeric(14, 2), 12 digitos enteros. */
const MAXIMO_PRESUPUESTO = 999_999_999_999.99;

/** Monto para el historial y los mensajes. `null` es "sin asignar". */
function montoEnPesos(valor: number | null): string {
  if (valor === null) return "sin asignar";
  return valor.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Presupuesto asignado a UN proyecto (`ideas.presupuesto_total`).
 *
 * Rol `admin` y no `moderador`: es el monto de plata publica que el sitio le
 * muestra al vecino como lo que va a costar su obra.
 *
 * El cambio deja fila en `revisiones` con el monto anterior y el nuevo, en la
 * misma transaccion que el UPDATE: sin eso, el numero se podria mover sin que
 * quede quien lo movio ni desde cuanto.
 *
 * No toca `estadoPresupuesto`: esa columna la escribe `crearAvance` a partir del
 * ultimo avance cargado. Un select manual la dejaria diciendo "en ejecucion"
 * sin un solo avance que lo respalde; para retroceder una etapa se carga otro
 * avance.
 */
export async function guardarPresupuestoIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Idea inválida." };

  const crudo = String(formulario.get("presupuestoTotal") ?? "").trim();

  // El campo vacio es una decision explicita: deja el presupuesto sin asignar.
  let nuevo: number | null = null;
  if (crudo !== "") {
    // Solo un numero en pesos, con hasta dos decimales y coma o punto decimal.
    // Los separadores de miles se rechazan a proposito: "1.500" es ambiguo
    // (mil quinientos o uno con cinco) y esto es plata.
    if (!/^\d{1,12}([.,]\d{1,2})?$/.test(crudo)) {
      return {
        ok: false,
        error:
          "Escribí el monto en pesos, sin puntos de miles ni símbolos: por ejemplo 1500000 o 1500000,50.",
      };
    }
    nuevo = Number(crudo.replace(",", "."));
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      return { ok: false, error: "El presupuesto no puede ser negativo." };
    }
    if (nuevo > MAXIMO_PRESUPUESTO) {
      return {
        ok: false,
        error: `El presupuesto no puede pasar de ${montoEnPesos(MAXIMO_PRESUPUESTO)}.`,
      };
    }
  }

  const [previa] = await db
    .select({ presupuestoTotal: ideas.presupuestoTotal })
    .from(ideas)
    .where(eq(ideas.id, id))
    .limit(1);
  if (!previa) return { ok: false, error: "La idea no existe." };

  const anterior =
    previa.presupuestoTotal === null ? null : Number(previa.presupuestoTotal);

  // Sin cambio no se escribe: una fila de auditoria que dice "de X a X" solo
  // ensucia el historial de la idea.
  if (anterior === nuevo) {
    return {
      ok: false,
      error:
        nuevo === null
          ? "El presupuesto ya estaba sin asignar."
          : `El presupuesto ya era ${montoEnPesos(nuevo)}.`,
    };
  }

  const ahora = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(ideas)
        .set({
          presupuestoTotal: nuevo === null ? null : nuevo.toFixed(2),
          estadoActualizadoEn: ahora,
          revisadoPorId: sesion.adminId,
          updatedAt: ahora,
        })
        .where(eq(ideas.id, id));

      await tx.insert(revisiones).values(
        filaRevision({
          ideaId: id,
          sesion,
          accion: "presupuesto",
          nota: `Presupuesto asignado: de ${montoEnPesos(anterior)} a ${montoEnPesos(nuevo)}.`,
        }),
      );
    });
  } catch (causa) {
    console.error("[admin] guardarPresupuestoIdea fallo", causa);
    // Si la base todavia no tiene el valor 'presupuesto' del enum
    // accion_revision (migracion 0003 sin aplicar), falla el INSERT de
    // auditoria y la transaccion vuelve atras el monto tambien. Es el
    // comportamiento correcto: antes que mover plata sin rastro, no moverla.
    if (/accion_revision/i.test(mensajeDeError(causa))) {
      return {
        ok: false,
        error:
          "Falta aplicar la migración 0003 en esta base (npm run db:migrate). Sin ella el cambio no queda auditado, así que no se guarda.",
      };
    }
    return { ok: false, error: "No se pudo guardar el presupuesto." };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    mensaje:
      nuevo === null
        ? "Presupuesto sin asignar. Quedó registrado en el historial."
        : `Presupuesto guardado: ${montoEnPesos(nuevo)}. Quedó registrado en el historial.`,
  };
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
  monto: opcional(z.coerce.number().min(0)),
  porcentaje: opcional(z.coerce.number().int().min(0).max(100)),
});

/**
 * Carga un avance de obra: es lo que el vecino ve como el estado de su proyecto.
 *
 * Las tres escrituras (el avance, la etapa del proyecto y la fila de bitacora)
 * van en UNA transaccion. Antes el INSERT y el UPDATE eran dos operaciones
 * separadas: si la segunda fallaba, el avance quedaba publicado con el proyecto
 * en otra etapa.
 */
export async function crearAvance(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

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

  // El proyecto se lee antes de escribir: da la etapa anterior (el ANTES del
  // registro, que despues del UPDATE ya no existe) y el titulo para la etiqueta,
  // y ademas avisa con un mensaje si el id no existe en lugar de dejar explotar
  // la clave foranea.
  const [idea] = await db
    .select({ titulo: ideas.titulo, estadoPresupuesto: ideas.estadoPresupuesto })
    .from(ideas)
    .where(eq(ideas.id, datos.ideaId))
    .limit(1);
  if (!idea) return { ok: false, error: "El proyecto no existe." };

  const valores = {
    ideaId: datos.ideaId,
    fecha: datos.fecha,
    etapa: datos.etapa,
    titulo: datos.titulo,
    descripcion: datos.descripcion || null,
    monto: datos.monto === null ? null : String(datos.monto),
    porcentaje:
      datos.porcentaje,
  };

  await db.transaction(async (tx) => {
    const [creado] = await tx.insert(avances).values(valores).returning({ id: avances.id });

    // El estado del presupuesto acompaña al ultimo avance publicado.
    await tx
      .update(ideas)
      .set({ estadoPresupuesto: datos.etapa, updatedAt: new Date() })
      .where(eq(ideas.id, datos.ideaId));

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "avance_creado",
        entidad: "avance",
        entidadId: creado.id,
        etiqueta: `${datos.titulo} — ${idea.titulo}`,
        antes: `Etapa del proyecto: ${idea.estadoPresupuesto} (sin este avance)`,
        despues: `Etapa del proyecto: ${datos.etapa} · ${resumenAvance(valores)}`,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Borra un avance de obra. La pantalla no pregunta nada antes, asi que la
 * bitacora es lo unico que queda: guarda el avance completo en el ANTES para
 * poder volver a cargarlo si el borrado fue un error.
 *
 * No recalcula `ideas.estado_presupuesto`: la etapa del proyecto la fija el
 * ultimo avance CARGADO, y para retroceder se carga otro avance (ver
 * `crearAvance` y el comentario de `guardarPresupuestoIdea`).
 */
export async function borrarAvance(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Avance inválido." };

  const [previo] = await db
    .select({
      fecha: avances.fecha,
      etapa: avances.etapa,
      titulo: avances.titulo,
      descripcion: avances.descripcion,
      monto: avances.monto,
      porcentaje: avances.porcentaje,
      ideaTitulo: ideas.titulo,
    })
    .from(avances)
    .innerJoin(ideas, eq(ideas.id, avances.ideaId))
    .where(eq(avances.id, id))
    .limit(1);
  if (!previo) return { ok: false, error: "El avance no existe." };

  await db.transaction(async (tx) => {
    await tx.delete(avances).where(eq(avances.id, id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "avance_borrado",
        entidad: "avance",
        entidadId: id,
        etiqueta: `${previo.titulo} — ${previo.ideaTitulo}`,
        antes: resumenAvance(previo),
        despues: null,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ediciones y cronograma
// ---------------------------------------------------------------------------

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;

type Etapa = (typeof ETAPAS)[number];

/**
 * Cambia la etapa de una edicion.
 *
 * Es la accion mas consecuente del panel: define lo que ve todo el sitio y al
 * pasar a "votacion" abre la votacion publica. La etapa anterior se lee ANTES
 * del UPDATE, porque despues no queda en ningun lado, y la fila de bitacora va
 * en la misma transaccion: no hay forma de mover la etapa sin que quede quien la
 * movio, cuando y desde donde.
 */
export async function cambiarEtapa(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("edicionId"));
  const etapa = String(formulario.get("etapa"));
  if (!Number.isInteger(id) || id <= 0 || !ETAPAS.includes(etapa as Etapa)) {
    return { ok: false, error: "Etapa inválida." };
  }
  const destino = etapa as Etapa;

  const [edicion] = await db
    .select({ anio: ediciones.anio, etapa: ediciones.etapa })
    .from(ediciones)
    .where(eq(ediciones.id, id))
    .limit(1);
  if (!edicion) return { ok: false, error: "La edición no existe." };

  // Sin cambio no se escribe: una fila de bitacora que dice "de X a X" no
  // audita nada. La pantalla ya deshabilita el boton en este caso.
  if (edicion.etapa === destino) {
    return {
      ok: true,
      mensaje: `La edición ${edicion.anio} ya estaba en la etapa “${destino}”.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.update(ediciones).set({ etapa: destino }).where(eq(ediciones.id, id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "cambio_etapa",
        entidad: "edicion",
        entidadId: id,
        etiqueta: `Edición ${edicion.anio}`,
        antes: `Etapa ${edicion.etapa}`,
        despues: `Etapa ${destino}`,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true, mensaje: `Edición ${edicion.anio}: etapa “${destino}”.` };
}

export async function crearEdicion(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

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
    await db.transaction(async (tx) => {
      const [creada] = await tx
        .insert(ediciones)
        .values({ anio, etapa: "ideas", activa: false })
        .returning({ id: ediciones.id });

      await tx.insert(bitacoraSistema).values(
        filaSistema({
          sesion,
          accion: "edicion_creada",
          entidad: "edicion",
          entidadId: creada.id,
          etiqueta: `Edición ${anio}`,
          // No hay ANTES: la edicion no existia.
          despues: "Etapa ideas · inactiva · sin fechas ni presupuesto cargados",
        }),
      );
    });
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
  presupuestoTotal: opcional(z.coerce.number().min(0)),
});

/**
 * Fechas y presupuesto de una edicion. Son los datos que el sitio publica como
 * el calendario del programa y la plata comprometida, asi que el cambio deja
 * fila con el resumen anterior y el nuevo, en la misma transaccion.
 */
export async function guardarEdicion(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

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

  // Los valores anteriores se leen antes de escribir: son la mitad del registro
  // y el UPDATE los pisa.
  const [edicion] = await db
    .select({
      anio: ediciones.anio,
      ideasDesde: ediciones.ideasDesde,
      ideasHasta: ediciones.ideasHasta,
      votacionDesde: ediciones.votacionDesde,
      votacionHasta: ediciones.votacionHasta,
      presupuestoTotal: ediciones.presupuestoTotal,
    })
    .from(ediciones)
    .where(eq(ediciones.id, datos.id))
    .limit(1);
  if (!edicion) return { ok: false, error: "La edición no existe." };

  const valores = {
    ideasDesde: datos.ideasDesde || null,
    ideasHasta: datos.ideasHasta || null,
    votacionDesde: datos.votacionDesde || null,
    votacionHasta: datos.votacionHasta || null,
    presupuestoTotal:
      datos.presupuestoTotal === null ? null : String(datos.presupuestoTotal),
  };

  // Los dos resumenes se comparan ya formateados: asi "1500000" y "1500000.00"
  // (el mismo monto escrito distinto) no cuentan como un cambio.
  const antes = resumenEdicion(edicion);
  const despues = resumenEdicion(valores);
  if (antes === despues) {
    return { ok: true, mensaje: "No hubo cambios para guardar." };
  }

  await db.transaction(async (tx) => {
    await tx.update(ediciones).set(valores).where(eq(ediciones.id, datos.id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "edicion_editada",
        entidad: "edicion",
        entidadId: datos.id,
        etiqueta: `Edición ${edicion.anio}`,
        antes,
        despues,
      }),
    );
  });

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
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Edición inválida." };

  const [edicion] = await db
    .select({ id: ediciones.id, anio: ediciones.anio, activa: ediciones.activa })
    .from(ediciones)
    .where(eq(ediciones.id, id))
    .limit(1);
  if (!edicion) return { ok: false, error: "La edición no existe." };
  // Ya activa: no hay nada que cambiar, asi que tampoco hay nada que registrar.
  if (edicion.activa) {
    return { ok: true, mensaje: `Edición ${edicion.anio} activa.` };
  }

  try {
    await db.transaction(async (tx) => {
      // Cual se apaga se lee DENTRO de la transaccion y antes del UPDATE: es el
      // ANTES del registro y despues del primer UPDATE ya no hay ninguna activa.
      const [saliente] = await tx
        .select({ anio: ediciones.anio })
        .from(ediciones)
        .where(eq(ediciones.activa, true))
        .limit(1);

      await tx.update(ediciones).set({ activa: false }).where(ne(ediciones.id, id));
      await tx.update(ediciones).set({ activa: true }).where(eq(ediciones.id, id));

      await tx.insert(bitacoraSistema).values(
        filaSistema({
          sesion,
          accion: "edicion_activada",
          entidad: "edicion",
          entidadId: id,
          etiqueta: `Edición ${edicion.anio}`,
          antes: saliente
            ? `Edición activa: ${saliente.anio}`
            : "Ninguna edición activa",
          despues: `Edición activa: ${edicion.anio}`,
        }),
      );
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

/** Alta o edicion de un hito del cronograma, que es contenido publico. */
export async function guardarHito(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

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

  // El anio de la edicion hace legible la etiqueta ("… (Edición 2026)") y de
  // paso avisa con un mensaje si la edicion no existe, en lugar de dejar
  // explotar la clave foranea.
  const [edicion] = await db
    .select({ anio: ediciones.anio })
    .from(ediciones)
    .where(eq(ediciones.id, datos.edicionId))
    .limit(1);
  if (!edicion) return { ok: false, error: "La edición del hito no existe." };

  const etiqueta = `${datos.titulo} (Edición ${edicion.anio})`;
  const despues = resumenHito(valores);

  if (typeof datos.id === "number") {
    const hitoId = datos.id;
    const [anterior] = await db
      .select({
        titulo: hitos.titulo,
        orden: hitos.orden,
        detalle: hitos.detalle,
        desde: hitos.desde,
        hasta: hitos.hasta,
        etapa: hitos.etapa,
      })
      .from(hitos)
      .where(eq(hitos.id, hitoId))
      .limit(1);
    if (!anterior) return { ok: false, error: "El hito no existe." };

    const antes = resumenHito(anterior);
    if (antes === despues) return { ok: true, mensaje: "No hubo cambios para guardar." };

    await db.transaction(async (tx) => {
      await tx.update(hitos).set(valores).where(eq(hitos.id, hitoId));
      await tx.insert(bitacoraSistema).values(
        filaSistema({
          sesion,
          accion: "hito_guardado",
          entidad: "hito",
          entidadId: hitoId,
          etiqueta,
          antes,
          despues,
        }),
      );
    });
  } else {
    await db.transaction(async (tx) => {
      const [creado] = await tx.insert(hitos).values(valores).returning({ id: hitos.id });
      await tx.insert(bitacoraSistema).values(
        filaSistema({
          sesion,
          accion: "hito_guardado",
          entidad: "hito",
          entidadId: creado.id,
          etiqueta,
          // No hay ANTES: el hito no existia.
          despues,
        }),
      );
    });
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Borra un hito del cronograma. El hito completo queda en el ANTES de la
 * bitacora: es lo unico que permite reponerlo si el borrado fue un error.
 */
export async function borrarHito(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Hito inválido." };

  const [previo] = await db
    .select({
      titulo: hitos.titulo,
      orden: hitos.orden,
      detalle: hitos.detalle,
      desde: hitos.desde,
      hasta: hitos.hasta,
      etapa: hitos.etapa,
      anio: ediciones.anio,
    })
    .from(hitos)
    .innerJoin(ediciones, eq(ediciones.id, hitos.edicionId))
    .where(eq(hitos.id, id))
    .limit(1);
  if (!previo) return { ok: false, error: "El hito no existe." };

  await db.transaction(async (tx) => {
    await tx.delete(hitos).where(eq(hitos.id, id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "hito_borrado",
        entidad: "hito",
        entidadId: id,
        etiqueta: `${previo.titulo} (Edición ${previo.anio})`,
        antes: resumenHito(previo),
        despues: null,
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contenido editable
// ---------------------------------------------------------------------------

/**
 * Guarda un texto del sitio (la tabla `textos`, lo que el sitio anterior servia
 * por /api/text sin autenticacion).
 *
 * El valor anterior se lee antes del upsert: la tabla no tiene historial, asi
 * que despues de escribir la version vieja no existe mas en ningun lado. En la
 * bitacora el ANTES y el DESPUES van recortados (`MAXIMO_VALOR_BITACORA`): un
 * texto puede ser un parrafo entero y esto audita que cambio, no guarda
 * versiones.
 */
export async function guardarTexto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const clave = String(formulario.get("clave") ?? "").trim();
  const valor = String(formulario.get("valor") ?? "").trim();
  if (!clave || clave.length > 100) return { ok: false, error: "Clave inválida." };

  const [anterior] = await db
    .select({ valor: textos.valor })
    .from(textos)
    .where(eq(textos.clave, clave))
    .limit(1);

  // Guardar dos veces el mismo texto no es un cambio: no deja fila.
  if (anterior && anterior.valor === valor) {
    return { ok: true, mensaje: "El texto ya estaba así: no se registró ningún cambio." };
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(textos)
      .values({ clave, valor })
      .onConflictDoUpdate({ target: textos.clave, set: { valor, updatedAt: new Date() } });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "texto_guardado",
        entidad: "texto",
        // Un texto se identifica por su clave, no por un id: va en la etiqueta.
        entidadId: null,
        etiqueta: clave,
        antes: anterior ? anterior.valor || "(vacío)" : null,
        despues: valor || "(vacío)",
      }),
    );
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Publica una novedad en la portada del sitio. */
export async function crearNovedad(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const titulo = String(formulario.get("titulo") ?? "").trim();
  const cuerpo = String(formulario.get("cuerpo") ?? "").trim();
  const fecha = String(formulario.get("fecha") ?? "").trim();
  const copete = String(formulario.get("copete") ?? "").trim();
  if (titulo.length < 3 || !cuerpo || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Completá título, fecha y cuerpo." };
  }

  const slug = `${slugificar(titulo)}-${Date.now().toString(36)}`;

  await db.transaction(async (tx) => {
    const [creada] = await tx
      .insert(novedades)
      .values({ titulo, slug, copete: copete || null, cuerpo, fecha })
      .returning({ id: novedades.id });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "novedad_creada",
        entidad: "novedad",
        entidadId: creada.id,
        etiqueta: titulo,
        // No hay ANTES: la novedad no existia.
        despues: `Fecha ${fecha} · publicada · ${slug} · ${copete || cuerpo}`,
      }),
    );
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
