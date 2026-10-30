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
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  admins,
  avances,
  bitacoraSistema,
  categorias,
  chatConsultas,
  distritos,
  ediciones,
  hitos,
  ideas,
  informesImpacto,
  revisiones,
  votos,
} from "@/db/schema";
import {
  getTokensUsadosHoy,
  getVotosPorIdea,
  registrarConsumoDeRespaldo,
  type EstadoIdea,
} from "@/db/queries";
import { sinCaracteresDeControl } from "@/lib/texto-limpio";
import { resumenDeError } from "@/lib/errores-base";
import {
  ETAPAS,
  esEtapa,
  esInterruptor,
  planDeInterruptor,
  puedeActivarOtraEdicion,
  puedeCambiarEtapa,
  puedeProclamar,
  votosDeLaEdicion,
  type Etapa,
} from "@/lib/etapas";
import {
  generarInforme,
  InformeInvalido,
  tieneMaterial,
} from "@/lib/informe-impacto";
// `mensajeDeError` ya existe aca abajo con otro proposito (encadenar causas):
// el del proveedor se importa con otro nombre para no pisarlo.
import {
  CONSUMO_VACIO,
  gastoDelDiaAgotado,
  hayClave,
  mensajeDeError as mensajeDelProveedor,
  modeloPara,
  motivoDeFalla,
  type Consumo,
} from "@/lib/modelo";
import { ETAPAS_PRESUPUESTO, ETIQUETA_PRESUPUESTO, MAXIMO_PRESUPUESTO } from "@/lib/formato";
import { enlaceValido } from "@/lib/enlace";
import { hashearPassword, verificarPassword } from "@/lib/password";
import { MINIMO_PASSWORD } from "@/lib/politica-password";
import { consumir, ipDeCabeceras } from "@/lib/rate-limit";
import { topeDeIngresoAdmin } from "@/lib/tope-ingreso-admin";
import { topeDePasswordPropia } from "@/lib/tope-password-propia";
import { cerrarSesionAdmin, crearSesionAdmin } from "@/lib/sesion";
import {
  bloqueoPorEtapa,
  esViolacionDeUnico,
  exigirAdmin,
  filaRevision,
  filaSistema,
  leerIdeaEnJuego,
  mensajeDeError,
  motivoPorRanking,
  opcional,
  reglaParaEvaluar,
  reglaParaProclamar,
  reglaParaPublicar,
  reglaParaReabrir,
  sinPermiso,
  tomarIdeaParaCambiar,
  type Resultado,
} from "./comun";
import { cambiarPasswordPropia } from "./equipo/cuentas";


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
  enlace?: string | null;
}): string {
  return [
    `“${avance.titulo}”`,
    `fecha ${avance.fecha}`,
    `etapa ${avance.etapa}`,
    `monto ${montoEnPesos(avance.monto === null ? null : Number(avance.monto))}`,
    avance.porcentaje === null ? "sin porcentaje" : `${avance.porcentaje}% de avance`,
    avance.descripcion ? `descripción: ${avance.descripcion}` : "sin descripción",
    avance.enlace ? `enlace: ${avance.enlace}` : "sin enlace",
  ].join(" · ");
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

  // Tope de intentos por IP y por cuenta (ver src/lib/tope-ingreso-admin.ts).
  // Este login es la puerta del backoffice: sin limite, una contrasena debil
  // se rompe por fuerza bruta sin dejar rastro. Va antes de buscar la cuenta,
  // y el de la cuenta corre para cualquier correo, exista o no.
  const tope = await topeDeIngresoAdmin(ipDeCabeceras(await headers()), email);
  if (tope) return { ok: false, error: tope };

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

  // En el token va la version de sesiones que la cuenta tiene AHORA: cualquier
  // baja, cambio de rol o de contrasena posterior la sube y esta sesion se corta
  // (ver `validarTokenAdmin` en src/lib/sesion.ts).
  await crearSesionAdmin({ adminId: admin.id, version: admin.versionSesion });
  // Con una provisoria, derecho a elegir la propia: cualquier otra pantalla lo
  // mandaria ahi igual, y asi se ahorra el salto.
  redirect(admin.debeCambiarPassword ? "/admin/password" : "/admin");
}

export async function salirAdmin(): Promise<void> {
  await cerrarSesionAdmin();
  redirect("/admin/ingresar");
}

/**
 * Cambio de la propia contrasena. Pide la actual, salvo cuando la cuenta esta
 * marcada con `debeCambiarPassword` (la eligio otra persona al crear la cuenta
 * o al restablecerla, asi que exigirla no protegeria nada).
 *
 * Cierra las OTRAS sesiones de la cuenta: sube la version de sesiones y a este
 * navegador le reemite la cookie con la nueva, asi quien la cambio sigue
 * adentro. Tambien apaga `debeCambiarPassword`, que es lo que libera el resto
 * del panel a quien entro con una provisoria.
 */
export async function cambiarMiPassword(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  // La unica accion que se deja usar con la provisoria: es la que la reemplaza.
  const sesion = await exigirAdmin("lector", { permitirPasswordProvisoria: true });
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
    if (!actual) {
      // Sin la actual y con la cuenta ya sin provisoria: casi siempre es una
      // pantalla vieja, dibujada sin ese campo, de alguien que eligio su
      // contraseña en otra pestaña (la cookie reemitida vale para las dos). Sin
      // revalidar, Next no la vuelve a dibujar y el mensaje pedia un campo que no
      // estaba. Asi el panel se redibuja con la sesion de hoy: aparece el campo,
      // y el formulario, que queda en el mismo lugar del arbol, conserva el aviso.
      revalidatePath("/admin", "layout");
      return {
        ok: false,
        error: "Ya no tenés la contraseña provisoria: para cambiarla, escribí tu contraseña actual.",
      };
    }
    // La respuesta de abajo dice si la actual es correcta: sin tope era una
    // forma de probar contrasenas por fuera de los de `ingresarAdmin` (ver
    // src/lib/tope-password-propia.ts). Cuenta antes de comparar, y solo aca:
    // con una provisoria no se compara nada y no hay intento que contar.
    const tope = await topeDePasswordPropia(sesion.adminId);
    if (tope) return { ok: false, error: tope };
    if (!(await verificarPassword(actual, cuenta.passwordHash))) {
      return { ok: false, error: "La contraseña actual no es correcta." };
    }
  }
  if (await verificarPassword(nueva, cuenta.passwordHash)) {
    return { ok: false, error: "La contraseña nueva tiene que ser distinta de la anterior." };
  }

  const hash = await hashearPassword(nueva);
  // La escritura (con su fila de bitacora) solo prospera si la cuenta sigue
  // activa y con la version de esta sesion: si en el medio alguien la desactivo
  // o le restablecio la contrasena, gana lo que hizo esa persona.
  const version = await cambiarPasswordPropia(sesion, hash);
  if (version === null) {
    return {
      ok: false,
      error: "Tu sesión se cerró mientras cambiabas la contraseña. Volvé a ingresar.",
    };
  }
  await crearSesionAdmin({ adminId: sesion.adminId, version });

  revalidatePath("/", "layout");
  return {
    ok: true,
    mensaje: cuenta.debeCambiarPassword
      ? "Listo: ya tenés tu contraseña y el panel está disponible."
      : "Contraseña actualizada. Si tenías el panel abierto en otro dispositivo, esa sesión se cerró.",
  };
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

  const ahora = new Date();
  // Con la votacion abierta, evaluar no puede sacar a una idea de la votacion
  // ni meterla (ver puedeCambiarIdea). Si la etapa lo impide no se escribe
  // nada, ni siquiera la devolucion que venia en el mismo formulario.
  //
  // Todo se decide adentro, con la fila bloqueada, y no con una lectura previa:
  // una proclamacion que se cuele en el medio dejaba un ganador con estado
  // "no factible", y el historial con el estado anterior equivocado.
  const bloqueo = await db.transaction(async (tx) => {
    const tomada = await tomarIdeaParaCambiar(
      tx,
      datos.id,
      { accion: "evaluar", estado: datos.estado },
      reglaParaEvaluar,
    );
    if (!tomada.ok) return tomada.motivo;

    // La devolucion que la idea ya tiene cubre un "no" que llega sin texto
    // nuevo, y es la que queda en el historial si no se escribio otra.
    const [propia] = await tx
      .select({ motivoEstado: ideas.motivoEstado })
      .from(ideas)
      .where(eq(ideas.id, datos.id));
    const devolucion = datos.devolucion || propia?.motivoEstado || null;
    if (faltaDevolucion(datos.estado, devolucion)) return ERROR_DEVOLUCION;

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
        estadoAnterior: tomada.vigente.estado,
        estadoNuevo: datos.estado,
        nota: devolucion,
      }),
    );
    return null;
  });
  if (bloqueo) return { ok: false, error: bloqueo };

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

  // El tope diario de gasto (CHAT_TOPE_TOKENS_DIA) es uno solo para las tres
  // funciones de IA: el informe ya sumaba su consumo en chat_consultas, pero no
  // lo consultaba, asi que podia seguir gastando con el chat ya cortado.
  if (await gastoDelDiaAgotado(getTokensUsadosHoy)) {
    return {
      ok: false,
      error:
        "Hoy ya se usó el tope diario de consumo de IA (CHAT_TOPE_TOKENS_DIA). El informe vuelve a estar disponible mañana.",
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

  const [leida] = await db
    .select({
      estado: ideas.estado,
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
  if (!leida) return { ok: false, error: "La idea no existe." };

  // Una descartada (prueba, spam, carga repetida) no se evalua, y el informe es
  // parte de la evaluacion: la ficha no lo ofrece, y la accion tampoco lo genera
  // si le llega igual (una pestaña vieja). Cada informe es una llamada paga, y el
  // texto de un spam no tiene nada que analizar.
  const { estado, ...idea } = leida;
  if (estado === "descartado") {
    return {
      ok: false,
      error:
        "Esta idea está descartada: no se evalúa, así que no lleva informe. Si se descartó por error, deshacé el descarte primero.",
    };
  }

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
    // La falla tambien se anota, como en el chat y el asistente: si la
    // respuesta llego y no servia, lo que se cobro cuenta para el tope diario;
    // si fallo el proveedor, el motivo le dice al equipo que hacer (un 402 es
    // credito que cargar).
    const invalido = causa instanceof InformeInvalido ? causa : null;
    await registrarCostoInforme({
      titulo: idea.titulo,
      resumen: null,
      modelo: invalido?.modelo ?? modeloPara("informe"),
      consumo: invalido?.consumo ?? CONSUMO_VACIO,
      ms: Date.now() - inicio,
      falla: invalido
        ? invalido.motivoDeCorte === "length"
          ? "salida-cortada"
          : "salida-invalida"
        : motivoDeFalla(causa),
    });
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

  await registrarCostoInforme({
    titulo: idea.titulo,
    resumen: generado.datos.resumen,
    modelo: generado.modelo,
    consumo: generado.consumo,
    ms,
  });

  // Solo cambia una pantalla del backoffice: no hace falta tirar abajo el
  // cache del sitio publico entero como hacen las acciones que publican.
  revalidatePath("/admin");
  return { ok: true, mensaje: "Informe generado." };
}

/**
 * Registro de costo del informe, en la misma tabla que el chat y el asistente:
 * es lo que suma CHAT_TOPE_TOKENS_DIA. Con `falla`, la fila va con `ok` en
 * false y la marca `falla:<motivo>` en `herramientas`, la misma que deja el
 * chat (la tabla no tiene una columna para "que paso"). Si el registro falla,
 * no cambia lo que ve la persona: va al log.
 *
 * No se exporta: en un archivo "use server" cada export es una accion que se
 * puede invocar desde afuera.
 */
async function registrarCostoInforme(datos: {
  titulo: string;
  resumen: string | null;
  modelo: string;
  consumo: Consumo;
  ms: number;
  falla?: string;
}) {
  // El resumen lo escribe el modelo: un NUL hacia fallar el INSERT y el
  // informe no contaba para el tope (ver src/lib/texto-limpio.ts).
  try {
    await db.insert(chatConsultas).values({
      origen: "informe",
      pregunta: sinCaracteresDeControl(datos.titulo),
      respuesta: datos.resumen === null ? null : sinCaracteresDeControl(datos.resumen),
      herramientas: datos.falla ? [`falla:${datos.falla}`] : [],
      modelo: datos.modelo,
      tokensEntrada: datos.consumo.tokensEntrada,
      tokensSalida: datos.consumo.tokensSalida,
      cacheLectura: datos.consumo.cacheLectura,
      ms: datos.ms,
      ok: !datos.falla,
    });
  } catch (causa) {
    console.error("[informe] no se pudo registrar el costo", resumenDeError(causa));
    // El costo cuenta para el tope aunque la fila completa no se haya guardado.
    try {
      await registrarConsumoDeRespaldo({
        origen: "informe",
        modelo: datos.modelo,
        tokensEntrada: datos.consumo.tokensEntrada,
        tokensSalida: datos.consumo.tokensSalida,
        ipHash: null,
      });
    } catch (otra) {
      console.error("[informe] tampoco se pudo registrar el consumo", resumenDeError(otra));
    }
  }
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

  // Con la votacion abierta no se despublica una idea que se esta votando (sale
  // del ranking y sus votantes no pueden votar de nuevo) ni se publica una
  // factible (entra a competir a mitad de camino). El resto de las
  // publicaciones no mueve la votacion y sigue permitido. Si ya esta como se
  // pide se mira con la fila bloqueada, no antes: dos despublicaciones a la vez
  // dejaban dos filas en el historial para un solo cambio.
  const bloqueo = await db.transaction(async (tx) => {
    const rechazo = await bloqueoPorEtapa(
      tx,
      id,
      { accion: publicada ? "publicar" : "despublicar" },
      (vigente) => reglaParaPublicar(vigente, publicada),
    );
    if (rechazo) return rechazo;

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
    return null;
  });
  if (bloqueo) return { ok: false, error: bloqueo };

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
      ganador: ideas.ganador,
      edicionId: ideas.edicionId,
      etapa: ediciones.etapa,
      distrito: distritos.numero,
    })
    .from(ideas)
    .innerJoin(ediciones, eq(ediciones.id, ideas.edicionId))
    .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
    .where(eq(ideas.id, id))
    .limit(1);

  if (!idea) return { ok: false, error: "La idea no existe." };

  // Solo con la votacion terminada. Se mira aca, ANTES de pedir el ranking,
  // para no calcular un "mas votado" con la votacion abierta y para que el
  // motivo que se muestre sea la etapa y no un empate de un conteo que todavia
  // se mueve. Adentro de la transaccion se vuelve a mirar, con la fila
  // bloqueada, por si la etapa cambio en el medio.
  const porEtapa = puedeProclamar(idea.etapa);
  if (!porEtapa.permitido) return { ok: false, error: porEtapa.motivo };

  if (idea.distrito === null) {
    return { ok: false, error: "La idea no tiene distrito asignado: no se puede proclamar." };
  }
  // Se pregunta aca para contestar antes de calcular el ranking; la que vale es
  // la de adentro de la transaccion, con la fila bloqueada.
  const porLaIdea = reglaParaProclamar(idea);
  if (porLaIdea) return { ok: false, error: porLaIdea };

  const distrito = Number(idea.distrito);
  const ranking = await getVotosPorIdea(idea.edicionId, distrito);
  const porRanking = motivoPorRanking(ranking, idea.id, distrito);
  if (porRanking) return { ok: false, error: porRanking };
  // Sin motivo, la idea es la primera del ranking y la unica con esos votos.
  const votos = ranking[0].votos;

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
  let bloqueo: string | null;
  try {
    bloqueo = await db.transaction(async (tx) => {
      const vigente = await leerIdeaEnJuego(tx, idea.id);
      if (!vigente) return "La idea no existe.";
      const veredicto = puedeProclamar(vigente.etapa);
      if (!veredicto.permitido) return veredicto.motivo;
      // Lo que se miro antes de la transaccion se vuelve a mirar sobre la fila
      // bloqueada: si en el medio alguien la evaluo "no factible" o la
      // despublico, quedaba un ganador con ese estado o sin publicar.
      const porLaVigente = reglaParaProclamar(vigente);
      if (porLaVigente) return porLaVigente;

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
          estadoAnterior: vigente.estado,
          estadoNuevo: "ganador",
          nota: nota || `Proyecto más votado del Distrito ${distrito}: ${votos} votos.`,
        }),
      );
      return null;
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
  if (bloqueo) return { ok: false, error: bloqueo };

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

  const ahora = new Date();
  // Reabrir una idea que se esta votando la saca de la votacion (vuelve a
  // pendiente): con la votacion abierta no se puede. Reabrir un "no" o una
  // idea sin publicar no mueve la votacion y sigue permitido.
  //
  // Si es ganadora se mira con la fila bloqueada, no antes: un moderador que
  // leia "no es ganadora" mientras un administrador la proclamaba deshacia la
  // proclamacion, que es solo de un administrador.
  const bloqueo = await db.transaction(async (tx) => {
    const tomada = await tomarIdeaParaCambiar(tx, id, { accion: "reabrir" }, (vigente) =>
      reglaParaReabrir(vigente, sesion.rol),
    );
    if (!tomada.ok) return tomada.motivo;

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
        estadoAnterior: tomada.vigente.estado,
        estadoNuevo: "pendiente",
        nota: motivo,
      }),
    );
    return null;
  });
  if (bloqueo) return { ok: false, error: bloqueo };

  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Presupuesto asignado a un proyecto
// ---------------------------------------------------------------------------

/** Monto para el historial y los mensajes. `null` es "sin asignar". */
/**
 * El monto de un campo de presupuesto: null si quedo vacio (es una decision
 * explicita, deja el presupuesto sin asignar) o un error para la pantalla.
 *
 * Solo un numero en pesos, con hasta dos decimales y coma o punto decimal. Los
 * separadores de miles se rechazan a proposito: "1.500" es ambiguo (mil
 * quinientos o uno con cinco) y esto es plata.
 */
function leerMonto(
  valor: FormDataEntryValue | null,
): { ok: true; monto: number | null } | { ok: false; error: string } {
  const crudo = String(valor ?? "").trim();
  if (crudo === "") return { ok: true, monto: null };
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(crudo)) {
    return {
      ok: false,
      error:
        "Escribí el monto en pesos, sin puntos de miles ni símbolos: por ejemplo 1500000 o 1500000,50.",
    };
  }
  const monto = Number(crudo.replace(",", "."));
  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: "El presupuesto no puede ser negativo." };
  }
  if (monto > MAXIMO_PRESUPUESTO) {
    return {
      ok: false,
      error: `El presupuesto no puede pasar de ${montoEnPesos(MAXIMO_PRESUPUESTO)}.`,
    };
  }
  return { ok: true, monto };
}

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
 *
 * No mira la etapa de la edicion, a proposito: el monto no cambia que ideas se
 * votan ni como se cuentan (ver `puedeCambiarIdea` en src/lib/etapas.ts), y
 * bloquearlo en votacion impediria corregir un monto mal cargado justo cuando
 * el vecino lo esta leyendo para decidir. El cambio queda en el historial.
 */
export async function guardarPresupuestoIdea(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Idea inválida." };

  const leido = leerMonto(formulario.get("presupuestoTotal"));
  if (!leido.ok) return leido;
  const nuevo = leido.monto;

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

/**
 * El presupuesto que estima el equipo al evaluar una idea
 * (`ideas.presupuesto_estimado`). Es el numero con el que el panel ordena y
 * compara las propuestas ("de mayor a menor presupuesto"); no es el monto de la
 * obra, que va en `guardarPresupuestoIdea` cuando la idea gana.
 *
 * Moderador o mas: lo carga quien evalua. Como el monto de obra, no mira la
 * etapa (no cambia que se vota ni como se cuenta) y deja su fila en
 * `revisiones` en la misma transaccion. No es publico: no lo devuelve ninguna
 * consulta del sitio ni del chat.
 */
export async function estimarPresupuesto(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("moderador");
  if (!sesion) return sinPermiso("moderador");

  const id = Number(formulario.get("id"));
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Idea inválida." };

  const leido = leerMonto(formulario.get("presupuestoEstimado"));
  if (!leido.ok) return leido;
  const nuevo = leido.monto;

  try {
    const resultado = await db.transaction(async (tx): Promise<Resultado> => {
      // La fila se bloquea para que dos estimaciones a la vez no dejen en el
      // historial un "antes" que ya no era el de la base.
      const [previa] = await tx
        .select({ estimado: ideas.presupuestoEstimado })
        .from(ideas)
        .where(eq(ideas.id, id))
        .for("update");
      if (!previa) return { ok: false, error: "La idea no existe." };
      const anterior = previa.estimado === null ? null : Number(previa.estimado);
      if (anterior === nuevo) {
        return {
          ok: false,
          error:
            nuevo === null
              ? "La idea ya estaba sin estimar."
              : `La estimación ya era ${montoEnPesos(nuevo)}.`,
        };
      }

      await tx
        .update(ideas)
        .set({
          presupuestoEstimado: nuevo === null ? null : nuevo.toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(ideas.id, id));
      await tx.insert(revisiones).values(
        filaRevision({
          ideaId: id,
          sesion,
          accion: "presupuesto",
          nota: `Presupuesto estimado por el equipo: de ${
            anterior === null ? "sin estimar" : montoEnPesos(anterior)
          } a ${nuevo === null ? "sin estimar" : montoEnPesos(nuevo)}.`,
        }),
      );
      return {
        ok: true,
        mensaje:
          nuevo === null
            ? "Estimación borrada. Quedó registrado en el historial."
            : `Estimación guardada: ${montoEnPesos(nuevo)}.`,
      };
    });
    if (resultado.ok) revalidatePath("/admin");
    return resultado;
  } catch (causa) {
    console.error("[admin] estimarPresupuesto fallo", resumenDeError(causa));
    if (/presupuesto_estimado/i.test(mensajeDeError(causa))) {
      return {
        ok: false,
        error:
          "Falta aplicar la migración 0016 en esta base (npm run db:migrate). Sin ella no hay dónde guardar la estimación.",
      };
    }
    return { ok: false, error: "No se pudo guardar la estimación." };
  }
}

// ---------------------------------------------------------------------------
// Avances de obra
// ---------------------------------------------------------------------------

const esquemaAvance = z.object({
  ideaId: z.coerce.number().int().positive(),
  fecha: z.string().refine(fechaValida),
  etapa: z.enum(ETAPAS_PRESUPUESTO),
  // Sin titulo, el avance se llama como su etapa ("En licitación").
  titulo: z.string().trim().max(200).optional(),
  descripcion: z.string().trim().max(3000).optional(),
  enlace: z
    .string()
    .trim()
    .optional()
    .refine((texto) => !texto || enlaceValido(texto)),
  monto: opcional(z.coerce.number().min(0)),
  porcentaje: opcional(z.coerce.number().int().min(0).max(100)),
});

/**
 * Carga un avance de obra: es lo que el vecino ve como el estado de su proyecto
 * en la tarjeta de /transparencia y en la ficha. Se carga desde /admin/obras.
 *
 * Solo para ganadores publicados: sin ese control, el avance de una idea que
 * no gano se publicaba igual en su ficha, como si fuera una obra.
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
      titulo: formulario.get("titulo") ?? undefined,
      descripcion: formulario.get("descripcion") ?? undefined,
      enlace: formulario.get("enlace") ?? undefined,
      monto: formulario.get("monto") ?? "",
      porcentaje: formulario.get("porcentaje") ?? "",
    });
  } catch {
    return {
      ok: false,
      error: "Revisá los campos: la fecha, la etapa y, si pegaste un link, que empiece con https://.",
    };
  }

  // El proyecto se lee antes de escribir: da la etapa anterior (el ANTES del
  // registro, que despues del UPDATE ya no existe) y el titulo para la etiqueta,
  // y ademas avisa con un mensaje si el id no existe en lugar de dejar explotar
  // la clave foranea.
  const [idea] = await db
    .select({
      titulo: ideas.titulo,
      estadoPresupuesto: ideas.estadoPresupuesto,
      ganador: ideas.ganador,
      publicada: ideas.publicada,
    })
    .from(ideas)
    .where(eq(ideas.id, datos.ideaId))
    .limit(1);
  if (!idea) return { ok: false, error: "El proyecto no existe." };
  if (!idea.ganador || !idea.publicada) {
    return { ok: false, error: "Solo los proyectos ganadores publicados tienen obra." };
  }

  const valores = {
    ideaId: datos.ideaId,
    fecha: datos.fecha,
    etapa: datos.etapa,
    titulo: datos.titulo || ETIQUETA_PRESUPUESTO[datos.etapa],
    descripcion: datos.descripcion || null,
    enlace: datos.enlace || null,
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
        etiqueta: `${valores.titulo} — ${idea.titulo}`,
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
      enlace: avances.enlace,
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

/**
 * Cambia la etapa de una edicion.
 *
 * Es la accion mas consecuente del panel: define lo que ve todo el sitio y al
 * pasar a "votacion" abre la votacion publica. La etapa anterior se lee ANTES
 * del UPDATE, porque despues no queda en ningun lado, y la fila de bitacora va
 * en la misma transaccion: no hay forma de mover la etapa sin que quede quien la
 * movio, cuando y desde donde.
 *
 * Que transiciones se permiten lo decide `puedeCambiarEtapa`
 * (src/lib/etapas.ts): avanzar siempre, volver solo en los casos en que no se
 * deshace una votacion. Para decidirlo hacen falta los votos y los ganadores de
 * la edicion, y se cuentan adentro de la transaccion con la fila de la edicion
 * bloqueada FOR UPDATE. Ese bloqueo choca con el FOR SHARE de las acciones
 * sobre ideas (ver `leerIdeaEnJuego`), asi que ninguna decide con la etapa
 * vieja. Tambien choca con el que toma el INSERT de un voto al verificar su
 * clave foranea hacia `ediciones`, asi que los votos que estaban entrando
 * terminan antes de que se cuente.
 *
 * El voto que llega mientras tanto no se cuela: /api/votos relee la etapa con
 * FOR SHARE dentro de su propia transaccion (src/app/api/votos/registrar.ts),
 * asi que espera este bloqueo y despues ve la etapa nueva. No se traban entre
 * si: aca no se bloquea ninguna idea (solo se cuentan), y el voto toma la
 * edicion antes que la idea.
 */
export async function cambiarEtapa(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const id = Number(formulario.get("edicionId"));
  const etapa = formulario.get("etapa");
  if (!Number.isInteger(id) || id <= 0 || !esEtapa(etapa)) {
    return { ok: false, error: "Etapa inválida." };
  }
  const destino: Etapa = etapa;

  let resultado:
    | { tipo: "inexistente" }
    | { tipo: "sin_cambio"; anio: number }
    | { tipo: "rechazado"; motivo: string }
    | { tipo: "hecho"; anio: number };
  try {
    resultado = await db.transaction(async (tx) => {
      const [edicion] = await tx
        .select({ anio: ediciones.anio, etapa: ediciones.etapa })
        .from(ediciones)
        .where(eq(ediciones.id, id))
        .for("update");
      if (!edicion) return { tipo: "inexistente" as const };

      // Sin cambio no se escribe: una fila de bitacora que dice "de X a X" no
      // audita nada. La pantalla ya deshabilita el boton en este caso.
      if (edicion.etapa === destino) return { tipo: "sin_cambio" as const, anio: edicion.anio };

      // Las dos cuentas de los votos, porque una edicion migrada tiene sus votos
      // solo en el contador de las ideas (ver votosDeLaEdicion).
      const [emitidos] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(votos)
        .where(eq(votos.edicionId, id));
      const [enIdeas] = await tx
        .select({
          votos: sql<number>`coalesce(sum(${ideas.votos}), 0)::int`,
          ganadores: sql<number>`count(*) FILTER (WHERE ${ideas.ganador})::int`,
        })
        .from(ideas)
        .where(eq(ideas.edicionId, id));

      const veredicto = puedeCambiarEtapa(edicion.etapa, destino, {
        votos: votosDeLaEdicion(Number(emitidos?.total ?? 0), Number(enIdeas?.votos ?? 0)),
        ganadores: Number(enIdeas?.ganadores ?? 0),
      });
      if (!veredicto.permitido) return { tipo: "rechazado" as const, motivo: veredicto.motivo };

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
      return { tipo: "hecho" as const, anio: edicion.anio };
    });
  } catch (causa) {
    console.error("[admin] cambiarEtapa fallo", causa);
    return { ok: false, error: "No se pudo cambiar la etapa. Probá de nuevo en un momento." };
  }

  switch (resultado.tipo) {
    case "inexistente":
      return { ok: false, error: "La edición no existe." };
    case "sin_cambio":
      return {
        ok: true,
        mensaje: `La edición ${resultado.anio} ya estaba en la etapa “${destino}”.`,
      };
    case "rechazado":
      return { ok: false, error: resultado.motivo };
    case "hecho":
      revalidatePath("/", "layout");
      return { ok: true, mensaje: `Edición ${resultado.anio}: etapa “${destino}”.` };
  }
}

/** Lo que dice el panel despues de cada interruptor. */
const HECHO_DEL_INTERRUPTOR = {
  "abrir-presentacion": "Presentación de propuestas abierta: el formulario del sitio ya recibe propuestas.",
  "cerrar-presentacion": "Presentación de propuestas cerrada: el equipo puede evaluar lo que entró.",
  "abrir-votacion": "Votación abierta: los vecinos ya pueden votar el proyecto de su distrito.",
  "cerrar-votacion": "Votación cerrada: ya podés proclamar el ganador de cada distrito desde su ficha.",
} as const;

/**
 * Los dos interruptores de Proceso: abrir o cerrar la presentacion de
 * propuestas y la votacion. Reemplazan al selector de etapa y a la pantalla de
 * ediciones: el programa ya no se maneja por ediciones anuales.
 *
 * Cada interruptor se traduce a un cambio de etapa de la edicion activa
 * (`planDeInterruptor` en src/lib/etapas.ts) y pasa por las mismas reglas que
 * el cambio de etapa (`puedeCambiarEtapa`), releyendo la edicion dentro de la
 * transaccion. Abrir la presentacion despues de una votacion terminada crea y
 * activa una edicion interna nueva (el año siguiente al mas alto): asi las
 * propuestas nuevas no se mezclan con las ya votadas, y nadie elige un año.
 *
 * Solo administradores, como el cambio de etapa.
 */
export async function usarInterruptor(
  _previo: Resultado | null,
  formulario: FormData,
): Promise<Resultado> {
  const sesion = await exigirAdmin("admin");
  if (!sesion) return sinPermiso("admin");

  const interruptor = formulario.get("interruptor");
  if (!esInterruptor(interruptor)) return { ok: false, error: "Acción inválida." };

  let resultado: { ok: true; mensaje: string } | { ok: false; error: string };
  try {
    resultado = await db.transaction(async (tx) => {
      const [activa] = await tx
        .select({ id: ediciones.id, anio: ediciones.anio, etapa: ediciones.etapa })
        .from(ediciones)
        .where(eq(ediciones.activa, true))
        .limit(1)
        .for("update");
      if (!activa) return { ok: false as const, error: "No hay un proceso activo en la base." };

      const plan = planDeInterruptor(activa.etapa, interruptor);
      if (plan.tipo === "sin-cambio") return { ok: true as const, mensaje: plan.mensaje };
      if (plan.tipo === "rechazo") return { ok: false as const, error: plan.motivo };

      if (plan.tipo === "nuevo-ciclo") {
        const [{ maximo }] = await tx
          .select({ maximo: sql<number>`max(${ediciones.anio})::int` })
          .from(ediciones);
        const anio = Number(maximo) + 1;
        await tx.update(ediciones).set({ activa: false }).where(eq(ediciones.id, activa.id));
        const [nueva] = await tx
          .insert(ediciones)
          .values({ anio, etapa: "ideas", activa: true })
          .returning({ id: ediciones.id });
        await tx.insert(bitacoraSistema).values(
          filaSistema({
            sesion,
            accion: "edicion_activada",
            entidad: "edicion",
            entidadId: nueva.id,
            etiqueta: `Proceso nuevo (edición interna ${anio})`,
            antes: `Proceso activo: edición interna ${activa.anio}, etapa ${activa.etapa}`,
            despues: `Presentación de propuestas abierta en la edición interna ${anio}`,
          }),
        );
        return { ok: true as const, mensaje: HECHO_DEL_INTERRUPTOR[interruptor] };
      }

      const [emitidos] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(votos)
        .where(eq(votos.edicionId, activa.id));
      const [enIdeas] = await tx
        .select({
          votos: sql<number>`coalesce(sum(${ideas.votos}), 0)::int`,
          ganadores: sql<number>`count(*) FILTER (WHERE ${ideas.ganador})::int`,
        })
        .from(ideas)
        .where(eq(ideas.edicionId, activa.id));
      const veredicto = puedeCambiarEtapa(activa.etapa, plan.destino, {
        votos: votosDeLaEdicion(Number(emitidos?.total ?? 0), Number(enIdeas?.votos ?? 0)),
        ganadores: Number(enIdeas?.ganadores ?? 0),
      });
      if (!veredicto.permitido) return { ok: false as const, error: veredicto.motivo };

      await tx.update(ediciones).set({ etapa: plan.destino }).where(eq(ediciones.id, activa.id));
      await tx.insert(bitacoraSistema).values(
        filaSistema({
          sesion,
          accion: "cambio_etapa",
          entidad: "edicion",
          entidadId: activa.id,
          etiqueta: HECHO_DEL_INTERRUPTOR[interruptor].split(":")[0],
          antes: `Etapa ${activa.etapa}`,
          despues: `Etapa ${plan.destino}`,
        }),
      );
      return { ok: true as const, mensaje: HECHO_DEL_INTERRUPTOR[interruptor] };
    });
  } catch (causa) {
    console.error("[admin] usarInterruptor fallo", causa);
    return { ok: false, error: "No se pudo guardar el cambio. Probá de nuevo en un momento." };
  }

  if (resultado.ok) revalidatePath("/", "layout");
  return resultado;
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

/**
 * Una fecha "AAAA-MM-DD" que exista en el calendario, o vacio. La regex sola
 * dejaba pasar un 30 de febrero, que la base rechaza al escribir: el error
 * salia de la accion sin atrapar y tiraba la pantalla entera. Los campos
 * `type="date"` no lo mandan nunca, pero un pedido armado a mano si.
 */
const fechaOVacio = z.union([z.string().refine(fechaValida), z.literal("")]);

/** "YYYY-MM-DD" que existe en el calendario: el formato solo deja pasar un 31 de febrero. */
function fechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [anio, mes, dia] = texto.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    anio >= 2000 &&
    anio <= 2100 &&
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

const esquemaEdicion = z.object({
  id: z.coerce.number().int().positive(),
  ideasDesde: fechaOVacio,
  ideasHasta: fechaOVacio,
  votacionDesde: fechaOVacio,
  votacionHasta: fechaOVacio,
  // Con tope: `ediciones.presupuesto_total` es numeric(14, 2) y un cero de mas
  // en un monto ya grande hacia fallar el UPDATE por desborde.
  presupuestoTotal: opcional(z.coerce.number().min(0).max(MAXIMO_PRESUPUESTO)),
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

  const leido = esquemaEdicion.safeParse({
    id: formulario.get("id"),
    ideasDesde: formulario.get("ideasDesde") ?? "",
    ideasHasta: formulario.get("ideasHasta") ?? "",
    votacionDesde: formulario.get("votacionDesde") ?? "",
    votacionHasta: formulario.get("votacionHasta") ?? "",
    presupuestoTotal: formulario.get("presupuestoTotal") ?? "",
  });
  if (!leido.success) {
    // El monto tiene su propio mensaje: con el tope a la vista se ve enseguida
    // si sobro un cero.
    const presupuestoMal = leido.error.issues.some((p) => p.path[0] === "presupuestoTotal");
    return {
      ok: false,
      error: presupuestoMal
        ? `El presupuesto tiene que ser un monto en pesos entre ${montoEnPesos(0)} y ${montoEnPesos(MAXIMO_PRESUPUESTO)}.`
        : "Revisá las fechas: cada una tiene que ser un día que exista, en formato AAAA-MM-DD.",
    };
  }
  const datos = leido.data;

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

  // Atrapado como en crearEdicion y activarEdicion: un error de la base que
  // sale de la accion lo agarra admin/error.tsx, que reemplaza la pantalla y
  // se lleva lo que la persona habia escrito.
  try {
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
  } catch (causa) {
    console.error("[admin] guardarEdicion fallo", causa);
    return { ok: false, error: "No se pudieron guardar las fechas y el presupuesto." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Activa una edicion y desactiva las demas EN LA MISMA TRANSACCION: el indice
 * unico parcial `ediciones_una_activa_idx` rechaza dos filas con activa = true,
 * asi que el orden (primero apagar, despues prender) no es opcional.
 *
 * No se activa otra edicion si la activa esta en votacion
 * (`puedeActivarOtraEdicion`): /api/votos solo mira la edicion activa, asi que
 * seria cortar la votacion sin pasar por el cambio de etapa ni avisarle a nadie.
 * La etapa de la saliente se lee con su fila bloqueada FOR UPDATE, el mismo
 * bloqueo que toma `cambiarEtapa`: nadie puede abrir la votacion de la saliente
 * entre esta lectura y el cambio.
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

  let bloqueo: string | null;
  try {
    bloqueo = await db.transaction(async (tx) => {
      // Cual se apaga se lee DENTRO de la transaccion y antes del UPDATE: es el
      // ANTES del registro y despues del primer UPDATE ya no hay ninguna activa.
      const [saliente] = await tx
        .select({ anio: ediciones.anio, etapa: ediciones.etapa })
        .from(ediciones)
        .where(eq(ediciones.activa, true))
        .limit(1)
        .for("update");

      const veredicto = puedeActivarOtraEdicion(saliente ?? null);
      if (!veredicto.permitido) return veredicto.motivo;

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
      return null;
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
  if (bloqueo) return { ok: false, error: bloqueo };

  revalidatePath("/", "layout");
  return { ok: true, mensaje: `Edición ${edicion.anio} activa.` };
}

const esquemaHito = z.object({
  id: z.union([z.coerce.number().int().positive(), z.literal("")]).optional(),
  edicionId: z.coerce.number().int().positive(),
  orden: z.coerce.number().int().min(0).max(999),
  titulo: z.string().trim().min(3).max(200),
  detalle: z.string().trim().max(2000).optional(),
  desde: fechaOVacio,
  hasta: fechaOVacio,
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
    try {
      // El ANTES se lee adentro de la transaccion y con FOR UPDATE, como en
      // las demas escrituras del panel: asi es el que habia al escribir y no el de un
      // momento antes, si otra persona guardo el mismo hito en el medio.
      const resultado = await db.transaction(async (tx) => {
        const [anterior] = await tx
          .select({
            edicionId: hitos.edicionId,
            titulo: hitos.titulo,
            orden: hitos.orden,
            detalle: hitos.detalle,
            desde: hitos.desde,
            hasta: hitos.hasta,
            etapa: hitos.etapa,
          })
          .from(hitos)
          .where(eq(hitos.id, hitoId))
          .limit(1)
          .for("update");
        if (!anterior) return "no_existe" as const;
        // Mover un hito a otra edicion no es una operacion del panel: el
        // formulario siempre manda la edicion propia del hito (es un hidden).
        // Si llega otra, el pedido esta armado a mano, y aceptarlo dejaba en la
        // bitacora un cambio de edicion que ni el antes ni el despues mencionan.
        if (anterior.edicionId !== datos.edicionId) return "otra_edicion" as const;

        const antes = resumenHito(anterior);
        if (antes === despues) return "sin_cambios" as const;

        // valores.edicionId ya se comprobo igual a la del hito: no lo muda.
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
        return "guardado" as const;
      });
      if (resultado === "no_existe") return { ok: false, error: "El hito no existe." };
      if (resultado === "otra_edicion") {
        return { ok: false, error: "El hito pertenece a otra edición." };
      }
      if (resultado === "sin_cambios") {
        return { ok: true, mensaje: "No hubo cambios para guardar." };
      }
    } catch (causa) {
      // Mismo motivo que en guardarEdicion: sin esto, admin/error.tsx se lleva
      // la pantalla y lo escrito.
      console.error("[admin] guardarHito fallo", causa);
      return { ok: false, error: "No se pudo guardar el hito." };
    }
  } else {
    try {
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
    } catch (causa) {
      console.error("[admin] guardarHito fallo", causa);
      return { ok: false, error: "No se pudo guardar el hito." };
    }
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

