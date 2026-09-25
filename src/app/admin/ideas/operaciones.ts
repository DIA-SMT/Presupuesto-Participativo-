/**
 * Lo que el equipo le hace a una idea desde el panel, mas alla de evaluarla:
 * cargarla (lo que llego de una asamblea, por mail o en papel), corregirla,
 * descartarla (prueba, spam, carga repetida) y deshacer ese descarte.
 *
 * Por que un archivo aparte de las acciones: las server actions
 * (./acciones.ts, "use server") leen la cookie de sesion y no se pueden invocar
 * sin un pedido de verdad. Todo lo que decide y escribe vive aca y recibe la
 * sesion ya resuelta, asi que se prueba contra una base real
 * (scripts/tests/ideas-panel.test.ts), igual que el voto en
 * src/app/api/votos/registrar.ts. Las acciones solo autorizan, ponen el tope,
 * llaman a esto y revalidan.
 *
 * Este archivo NO es "use server": nada de lo que exporta es una puerta que el
 * navegador pueda llamar. Toda escritura pasa antes por `exigirAdmin` en la
 * accion correspondiente.
 *
 * Reglas que valen para las cuatro operaciones, como en el resto del panel
 * (ver src/app/admin/comun.ts):
 *  - la fila de `revisiones` va en la MISMA transaccion que el cambio;
 *  - lo que la etapa y el estado dejan hacer lo decide src/lib/etapas.ts, con
 *    la etapa y la idea releidas adentro de la transaccion y la fila bloqueada
 *    (`leerIdeaEnJuego`). Nunca con lo que mando la pantalla.
 */
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categorias, distritos, ideas, revisiones, votos } from "@/db/schema";
import { getEdicionActiva } from "@/db/queries";
import { crearIdea } from "@/lib/alta-idea";
import { codigoSeguimiento } from "@/lib/avisos";
import {
  puedeCambiarDeDistrito,
  puedeCambiarIdea,
  puedeCargarIdea,
  puedeDescartarse,
} from "@/lib/etapas";
import { formatearFechaCorta } from "@/lib/formato";
import { distritoDePunto } from "@/lib/geo-servidor";
import { contenidoIdea, LARGOS, MINIMOS } from "@/lib/idea-esquema";
import { normalizar, normalizarParrafo } from "@/lib/texto";
import {
  filaRevision,
  leerIdeaEnJuego,
  mensajeDeError,
  recortarValor,
  type Autorizacion,
  type Resultado,
} from "../comun";

// ---------------------------------------------------------------------------
// Lo comun
// ---------------------------------------------------------------------------

/**
 * Tope de altas por cuenta y por hora. El formulario publico tiene 5 por IP,
 * que aplicado al equipo frenaba la carga de una asamblea a la quinta idea. Una
 * tanda real es de unas 100 (89 ideas entraron por asamblea en 2025): 300 deja
 * cargar tres asambleas seguidas y todavia frena a un script que se desboque
 * con una sesion robada.
 */
export const TOPE_ALTAS_POR_HORA = 300;

/** Largo maximo de "de donde vino" (`ideas.canal_detalle`). */
export const LARGO_CANAL_DETALLE = 200;

/** Los canales que carga el equipo. "web" es solo del formulario publico. */
export const CANALES_DEL_PANEL = ["asamblea", "municipio"] as const;

/** Largo minimo del motivo de un descarte o de deshacerlo, como despublicar. */
export const MINIMO_MOTIVO = 10;

/** Tope de cada valor del antes y el despues en la fila de una correccion. */
const TOPE_VALOR_CORRECCION = 160;

/**
 * El dia de hoy en Tucuman, AAAA-MM-DD. Se arma con las partes de Intl y no con
 * `toISOString()`, que da el dia en UTC: despues de las 21:00 locales ya es
 * manana, y una idea cargada a la noche quedaba con fecha del dia siguiente.
 */
export function hoyEnTucuman(ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Tucuman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

/** Un campo de texto de una sola linea: sin espacios de mas. */
function limpiarLinea(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\s+/g, " ").trim();
}

/**
 * El punto que mando el formulario, o null si no mando ninguno. Llega como
 * texto (FormData) y un campo vacio no es el punto (0, 0): es "sin punto".
 */
function leerPunto(crudo: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = typeof crudo.lat === "string" ? crudo.lat.trim() : "";
  const lon = typeof crudo.lon === "string" ? crudo.lon.trim() : "";
  if (!lat || !lon) return null;
  const punto = { lat: Number(lat), lon: Number(lon) };
  if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lon)) return null;
  if (Math.abs(punto.lat) > 90 || Math.abs(punto.lon) > 180) return null;
  return punto;
}

/** Una casilla del formulario: llega "1" (u "on") marcada y ausente sin marcar. */
function casilla(valor: unknown): boolean {
  return valor === "1" || valor === "on" || valor === "true";
}

/**
 * Que esta mal, en castellano y listo para mostrar. zod dice "String must
 * contain at least 30 character(s)": al equipo le sirve saber QUE campo y
 * cuanto le falta. Un mensaje por campo, en el orden del formulario.
 */
const MENSAJE_DEL_CAMPO: Record<string, string> = {
  canal: "Elegí por dónde llegó la idea: una asamblea o el municipio.",
  canalDetalle: `Contá de dónde vino, por ejemplo “Asamblea del distrito 7, 12/10/2026” o “Mesa de entradas”: entre 3 y ${LARGO_CANAL_DETALLE} caracteres.`,
  fecha: "Revisá la fecha en que se presentó.",
  autorNombre: `El nombre de quien la presentó no puede pasar de ${LARGOS.autorNombre} caracteres.`,
  titulo: `El título tiene que tener entre ${MINIMOS.titulo} y ${LARGOS.titulo} caracteres.`,
  categoria: "Elegí una categoría.",
  barrio: `El barrio no puede pasar de ${LARGOS.barrio} caracteres.`,
  solucion: `“Qué se propone” tiene que tener entre ${MINIMOS.solucion} y ${LARGOS.solucion} caracteres.`,
  problema: `“Por qué hace falta” tiene que tener entre ${MINIMOS.problema} y ${LARGOS.problema} caracteres.`,
  beneficios: `“Quiénes se benefician” no puede pasar de ${LARGOS.beneficios} caracteres.`,
  integradaEn: "La idea en la que se integra no es válida.",
  id: "La idea no es válida.",
};

function explicar(error: z.ZodError): string {
  const campos = [...new Set(error.issues.map((problema) => String(problema.path[0] ?? "")))];
  const mensajes = campos.map((campo) => MENSAJE_DEL_CAMPO[campo] ?? `Revisá el campo ${campo}.`);
  return mensajes.join(" ");
}

/**
 * Si la base todavia no tiene los valores de la migracion 0012 ("alta",
 * "correccion", "descarte", "descartado"), la fila de auditoria no entra y la
 * transaccion vuelve atras entera. Es lo correcto (nada sin rastro), pero
 * conviene decir por que en lugar de un "no se pudo" que no explica nada.
 */
export function errorDeEscritura(causa: unknown, generico: string): string {
  if (/accion_revision|estado_idea|canal_detalle/i.test(mensajeDeError(causa))) {
    return "Falta aplicar la migración 0012 en esta base (npm run db:migrate). Sin ella el cambio no queda en el historial, así que no se guarda.";
  }
  return generico;
}

// ---------------------------------------------------------------------------
// Alta desde el panel
// ---------------------------------------------------------------------------

/**
 * Lo mismo que pide el formulario publico (el contenido, con sus minimos y sus
 * largos, de src/lib/idea-esquema.ts) mas lo que solo sabe el equipo: por donde
 * llego, de donde exactamente, cuando se presento y quien la presento.
 *
 * El correo NO esta, ni opcional: los avisos por mail estan apagados
 * (src/lib/aviso-por-mail.ts) y un dato personal sin una finalidad que se
 * cumpla no se junta. Si el formulario lo mandara igual, zod lo descarta: los
 * campos que no estan en el esquema no pasan.
 */
const esquemaAlta = contenidoIdea.extend({
  canal: z.enum(CANALES_DEL_PANEL),
  canalDetalle: z.string().trim().min(3).max(LARGO_CANAL_DETALLE),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  autorNombre: z.string().trim().max(LARGOS.autorNombre).optional(),
});

/** Lo que la pantalla muestra al terminar: el comprobante y el codigo. */
export type IdeaCargada = {
  id: number;
  numero: number;
  /** Codigo de seguimiento (src/lib/avisos.ts). Se muestra una sola vez. */
  codigo: string;
  distrito: number;
  anio: number;
  titulo: string;
  categoria: string;
  barrio: string | null;
  problema: string | null;
  solucion: string | null;
  beneficios: string | null;
  lat: number;
  lon: number;
  fecha: string;
};

export type ResultadoAlta = { ok: true; idea: IdeaCargada } | { ok: false; error: string };

/** Por que una fecha de presentacion no sirve, o null si sirve. */
function problemaDeFecha(fecha: string, hoy: string, anio: number): string | null {
  const [a, m, d] = fecha.split("-").map(Number);
  const leida = new Date(Date.UTC(a, m - 1, d));
  if (
    leida.getUTCFullYear() !== a ||
    leida.getUTCMonth() !== m - 1 ||
    leida.getUTCDate() !== d
  ) {
    return "La fecha en que se presentó no existe: revisá el día y el mes.";
  }
  if (fecha > hoy) {
    return "La fecha en que se presentó no puede ser posterior a hoy.";
  }
  // Un papel de la asamblea de fin del año anterior puede ser para esta
  // edicion; uno de dos años atras, no.
  if (fecha < `${anio - 1}-01-01`) {
    return `La fecha en que se presentó es anterior a ${anio - 1}: no puede ser una idea para la edición ${anio}.`;
  }
  return null;
}

const NOMBRE_CANAL: Record<(typeof CANALES_DEL_PANEL)[number], string> = {
  asamblea: "una asamblea",
  municipio: "el municipio",
};

/**
 * Carga una idea en la edicion activa, a nombre de quien la carga.
 *
 * Sale igual que una del formulario publico (misma creacion, src/lib/
 * alta-idea.ts): `pendiente`, sin publicar, con numero correlativo y codigo de
 * seguimiento. Lo distinto: el canal y de donde vino, la fecha que dice el
 * papel, `cargado_por` y la fila "alta" en `revisiones`, que es lo que deja
 * constancia de que la cargo el equipo y no un vecino.
 *
 * La fila NO lleva el nombre del autor: `revisiones` no se borra nunca y
 * `npm run purgar-contactos` borra el nombre de la idea al cerrar la edicion.
 * Copiado aca, sobreviviria a la purga.
 */
export async function registrarAlta(
  crudo: Record<string, unknown>,
  sesion: Autorizacion,
  hoy: string = hoyEnTucuman(),
): Promise<ResultadoAlta> {
  const leido = esquemaAlta.safeParse(crudo);
  if (!leido.success) return { ok: false, error: explicar(leido.error) };
  const datos = leido.data;

  const punto = leerPunto(crudo);
  if (!punto) return { ok: false, error: "Marcá en el mapa dónde sería la obra." };

  const edicion = await getEdicionActiva();
  if (!edicion) {
    return { ok: false, error: "No hay una edición activa. Activá una antes de cargar ideas." };
  }

  const fechaMal = problemaDeFecha(datos.fecha, hoy, edicion.anio);
  if (fechaMal) return { ok: false, error: fechaMal };

  // Se pregunta aca para no calcular nada si la etapa ya lo impide, y se vuelve
  // a preguntar adentro de la transaccion, con la etapa releida y bloqueada.
  const porEtapa = puedeCargarIdea(edicion.etapa);
  if (!porEtapa.permitido) return { ok: false, error: porEtapa.motivo };

  const aproximada = casilla(crudo.aproximada);
  const creada = await crearIdea(
    {
      edicionId: edicion.id,
      titulo: datos.titulo,
      categoria: datos.categoria,
      barrio: datos.barrio,
      problema: datos.problema,
      solucion: datos.solucion,
      beneficios: datos.beneficios,
      lat: punto.lat,
      lon: punto.lon,
      ubicacionAproximada: aproximada,
      canal: datos.canal,
      canalDetalle: limpiarLinea(datos.canalDetalle),
      autorNombre: limpiarLinea(datos.autorNombre) || null,
      contacto: null,
      cargadoPor: sesion.nombre,
      fecha: datos.fecha,
    },
    {
      etapaPermitida: ({ etapa }) => {
        const veredicto = puedeCargarIdea(etapa);
        return veredicto.permitido ? null : veredicto.motivo;
      },
      enLaMismaTransaccion: async (tx, idea) => {
        await tx.insert(revisiones).values(
          filaRevision({
            ideaId: idea.id,
            sesion,
            accion: "alta",
            estadoNuevo: "pendiente",
            nota:
              `Cargada desde el panel. Llegó por ${NOMBRE_CANAL[datos.canal]}: ` +
              `${limpiarLinea(datos.canalDetalle)}. Presentada el ${formatearFechaCorta(datos.fecha)}.` +
              (aproximada ? " El punto marcado es aproximado." : ""),
          }),
        );
      },
    },
  );

  if (!creada.ok) {
    return {
      ok: false,
      error:
        creada.motivo === "edicion"
          ? "La edición activa cambió mientras cargabas la idea. Volvé a abrir la pantalla."
          : creada.mensaje,
    };
  }

  // De aca en adelante la idea YA esta guardada: nada de lo que sigue va a la
  // base. Un error aca lo mostraria la accion como "no se pudo guardar", y el
  // reintento la cargaria dos veces sin que nadie vea el primer codigo.
  return {
    ok: true,
    idea: {
      id: creada.id,
      numero: creada.numero,
      codigo: codigoSeguimiento(creada.id),
      distrito: creada.distrito,
      anio: edicion.anio,
      titulo: creada.titulo,
      categoria: creada.categoria,
      barrio: creada.barrio,
      problema: creada.problema,
      solucion: creada.solucion,
      beneficios: creada.beneficios,
      lat: punto.lat,
      lon: punto.lon,
      fecha: datos.fecha,
    },
  };
}

// ---------------------------------------------------------------------------
// Correccion
// ---------------------------------------------------------------------------

/**
 * Lo que se corrige. Los textos de la propuesta van SIN los minimos del alta a
 * proposito: 81 de las 100 ideas de 2025 llegaron sin problema ni solucion (el
 * relevamiento solo recupero el texto de los ganadores), y con los minimos no
 * se les podria corregir ni el titulo sin inventarles un texto. Los largos
 * maximos si, que son los de la columna y el formulario.
 */
const esquemaCorreccion = z.object({
  id: z.coerce.number().int().positive(),
  titulo: z.string().trim().min(MINIMOS.titulo).max(LARGOS.titulo),
  categoria: z.string().trim().min(1).max(60),
  barrio: z.string().trim().max(LARGOS.barrio).optional(),
  problema: z.string().trim().max(LARGOS.problema).optional(),
  solucion: z.string().trim().max(LARGOS.solucion).optional(),
  beneficios: z.string().trim().max(LARGOS.beneficios).optional(),
  // "" es "no integrada en ninguna". El literal va primero: coerce("") da 0.
  integradaEn: z.union([z.literal(""), z.coerce.number().int().positive()]).optional(),
});

/** Un valor del antes o el despues, recortado y entre comillas. */
function citar(valor: string | null | undefined): string {
  const recortado = recortarValor(valor, TOPE_VALOR_CORRECCION);
  return recortado ? `“${recortado}”` : "(vacío)";
}

function coordenadas(lat: string | number | null, lon: string | number | null): string {
  if (lat === null || lon === null) return "sin punto";
  return `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`;
}

/**
 * Corrige lo que dice una idea: titulo, textos, categoria, barrio, punto (y con
 * el, el distrito) e integracion en otra idea.
 *
 * Tres cosas que NO hace, a proposito:
 *  - no cambia el slug: los enlaces a /proyectos/<slug> que ya circulan siguen
 *    andando aunque el titulo cambie;
 *  - no normaliza el titulo ni el barrio como el alta (solo saca espacios de
 *    mas): la correccion es la ultima palabra de una persona, y
 *    `normalizarTitulo` le desharia justo el arreglo de una sigla que la
 *    normalizacion habia estropeado ("UNSTA" volveria a "Unsta");
 *  - no recalcula el distrito si el punto no cambio: hay ideas de 2025 cuyo
 *    punto cae en otro distrito que el declarado (data/reporte-limpieza.md), y
 *    corregirles el titulo no puede mudarlas en silencio.
 *
 * Si el punto cambia de distrito hace falta la confirmacion de la pantalla
 * (`confirmaDistrito`), y ni con ella se muda una idea con votos o ganadora
 * (`puedeCambiarDeDistrito`). Con la votacion abierta, una idea que se vota no
 * se corrige (`puedeCambiarIdea`).
 */
export async function aplicarCorreccion(
  crudo: Record<string, unknown>,
  sesion: Autorizacion,
): Promise<Resultado> {
  const leido = esquemaCorreccion.safeParse(crudo);
  if (!leido.success) return { ok: false, error: explicar(leido.error) };
  const datos = leido.data;
  const punto = leerPunto(crudo);
  const aproximada = casilla(crudo.aproximada);
  const confirmaDistrito = casilla(crudo.confirmaDistrito);
  const integradaEn =
    datos.integradaEn === undefined || datos.integradaEn === "" ? null : datos.integradaEn;

  const [categoria] = await db
    .select({ id: categorias.id, nombre: categorias.nombre })
    .from(categorias)
    .where(eq(categorias.slug, datos.categoria))
    .limit(1);
  if (!categoria) return { ok: false, error: "Categoría desconocida." };

  return db.transaction(async (tx): Promise<Resultado> => {
    // Primero la edicion (FOR SHARE) y despues la idea (FOR UPDATE), como toda
    // accion del panel: la etapa no cambia en el medio, y dos personas que
    // corrigen la misma idea hacen fila en lugar de pisarse.
    const vigente = await leerIdeaEnJuego(tx, datos.id);
    if (!vigente) return { ok: false, error: "La idea no existe." };
    const veredicto = puedeCambiarIdea(vigente.etapa, vigente, { accion: "corregir" });
    if (!veredicto.permitido) return { ok: false, error: veredicto.motivo };

    // La fila ya esta bloqueada por esta transaccion: esta lectura es la
    // version que se va a pisar, y es la mitad del registro.
    const [actual] = await tx
      .select({
        edicionId: ideas.edicionId,
        titulo: ideas.titulo,
        barrio: ideas.barrio,
        problema: ideas.problema,
        solucion: ideas.solucion,
        beneficios: ideas.beneficios,
        categoriaId: ideas.categoriaId,
        categoria: categorias.nombre,
        lat: ideas.lat,
        lon: ideas.lon,
        ubicacionAproximada: ideas.ubicacionAproximada,
        distritoId: ideas.distritoId,
        distrito: distritos.numero,
        integradaEnId: ideas.integradaEnId,
        votos: ideas.votos,
        ganador: ideas.ganador,
      })
      .from(ideas)
      .leftJoin(categorias, eq(categorias.id, ideas.categoriaId))
      .leftJoin(distritos, eq(distritos.id, ideas.distritoId))
      .where(eq(ideas.id, datos.id));
    if (!actual) return { ok: false, error: "La idea no existe." };

    // --- El punto y el distrito ------------------------------------------
    const puntoCambio =
      punto !== null &&
      (actual.lat === null ||
        actual.lon === null ||
        Number(actual.lat).toFixed(7) !== punto.lat.toFixed(7) ||
        Number(actual.lon).toFixed(7) !== punto.lon.toFixed(7));

    const distritoActual = actual.distrito === null ? null : Number(actual.distrito);
    let distritoFinal = distritoActual;
    if (punto && puntoCambio) {
      const delPunto = distritoDePunto(punto);
      if (!delPunto) {
        return {
          ok: false,
          error: "El punto marcado queda fuera de los 20 distritos de la ciudad.",
        };
      }
      if (delPunto !== distritoActual) {
        // El contador de la idea y sus filas en `votos` se mueven juntos en el
        // voto; en una idea migrada solo esta el contador. Con la fila
        // bloqueada ningun voto nuevo entra mientras tanto (el voto toma la
        // idea FOR NO KEY UPDATE, que choca con este FOR UPDATE).
        const [emitidos] = await tx
          .select({ total: count() })
          .from(votos)
          .where(eq(votos.ideaId, datos.id));
        const mudanza = puedeCambiarDeDistrito(
          {
            votos: Math.max(Number(actual.votos), Number(emitidos?.total ?? 0)),
            ganador: actual.ganador,
          },
          distritoActual,
          delPunto,
        );
        if (!mudanza.permitido) return { ok: false, error: mudanza.motivo };
        // La pantalla avisa antes de guardar y pide la casilla; si el pedido
        // llega sin ella (una pestaña vieja, sin JavaScript), no se muda.
        if (!confirmaDistrito && distritoActual !== null) {
          return {
            ok: false,
            error: `Ese punto queda en el Distrito ${delPunto} y la idea está en el Distrito ${distritoActual}: si la guardás así, se muda de distrito. Confirmalo en la casilla de abajo del mapa y volvé a guardar.`,
          };
        }
        distritoFinal = delPunto;
      }
    }

    // --- La integracion ---------------------------------------------------
    // Se valida solo si cambia: lo que ya estaba guardado no se vuelve a
    // discutir en cada correccion del titulo.
    const integracionCambia = integradaEn !== actual.integradaEnId;
    const nombreDe = async (id: number | null): Promise<string> => {
      if (id === null) return "ninguna";
      const [otra] = await tx
        .select({ numero: ideas.numero, titulo: ideas.titulo })
        .from(ideas)
        .where(eq(ideas.id, id))
        .limit(1);
      return otra ? `#${otra.numero ?? "sin número"} ${citar(otra.titulo)}` : "una idea que ya no existe";
    };
    if (integracionCambia && integradaEn !== null) {
      if (integradaEn === datos.id) {
        return { ok: false, error: "Una idea no se puede integrar en sí misma." };
      }
      // FOR KEY SHARE sobre la idea destino: espera a quien la este
      // descartando o integrando en otra (las dos toman su fila FOR UPDATE) y
      // despues lee como quedo. Sin el bloqueo, un descarte que confirma entre
      // esta lectura y el UPDATE dejaba esta idea integrada en una descartada.
      // Dos personas integrando A en B y B en A en el mismo instante se
      // esperan en cruz: Postgres corta una con un error, la accion lo muestra
      // como "no se pudo guardar" y al reintentar la regla de abajo la frena.
      const [destino] = await tx
        .select({
          edicionId: ideas.edicionId,
          estado: ideas.estado,
          integradaEnId: ideas.integradaEnId,
          numero: ideas.numero,
        })
        .from(ideas)
        .where(eq(ideas.id, integradaEn))
        .for("key share", { of: ideas });
      if (!destino || destino.edicionId !== actual.edicionId) {
        return {
          ok: false,
          error: "La idea en la que se integra tiene que ser de la misma edición.",
        };
      }
      if (destino.estado === "descartado") {
        return { ok: false, error: "No se puede integrar en una idea descartada." };
      }
      // `integrada_en_id` apunta a la idea FINAL (ver el esquema): una cadena
      // de integraciones obligaria a recorrerla para saber donde termino cada
      // propuesta.
      if (destino.integradaEnId !== null) {
        return {
          ok: false,
          error: `La idea #${destino.numero ?? "sin número"} ya está integrada en otra: elegí la idea final, la que reúne a las demás.`,
        };
      }
      const [propias] = await tx
        .select({ total: count() })
        .from(ideas)
        .where(eq(ideas.integradaEnId, datos.id));
      const cuantas = Number(propias?.total ?? 0);
      if (cuantas > 0) {
        return {
          ok: false,
          error: `${cuantas === 1 ? "Hay una idea integrada" : `Hay ${cuantas} ideas integradas`} en esta: si esta se integra en otra, quedarían apuntando a una idea que ya no es la final. Integralas primero en la idea elegida.`,
        };
      }
    }

    // --- Lo que cambio ----------------------------------------------------
    const nuevo = {
      titulo: limpiarLinea(datos.titulo),
      barrio: limpiarLinea(datos.barrio) || null,
      problema: normalizarParrafo(datos.problema),
      solucion: normalizarParrafo(datos.solucion),
      beneficios: normalizarParrafo(datos.beneficios),
    };

    const cambios: string[] = [];
    if (nuevo.titulo !== actual.titulo) {
      cambios.push(`Título: ${citar(actual.titulo)} → ${citar(nuevo.titulo)}`);
    }
    if (categoria.id !== actual.categoriaId) {
      cambios.push(`Categoría: ${actual.categoria ?? "sin categoría"} → ${categoria.nombre}`);
    }
    if (nuevo.barrio !== actual.barrio) {
      cambios.push(`Barrio: ${citar(actual.barrio)} → ${citar(nuevo.barrio)}`);
    }
    if (nuevo.solucion !== actual.solucion) {
      cambios.push(`Qué se propone: ${citar(actual.solucion)} → ${citar(nuevo.solucion)}`);
    }
    if (nuevo.problema !== actual.problema) {
      cambios.push(`Por qué hace falta: ${citar(actual.problema)} → ${citar(nuevo.problema)}`);
    }
    if (nuevo.beneficios !== actual.beneficios) {
      cambios.push(
        `Quiénes se benefician: ${citar(actual.beneficios)} → ${citar(nuevo.beneficios)}`,
      );
    }
    if (punto && puntoCambio) {
      const distritoAntes = distritoActual === null ? "sin distrito" : `Distrito ${distritoActual}`;
      cambios.push(
        `Ubicación: ${coordenadas(actual.lat, actual.lon)} (${distritoAntes}) → ` +
          `${coordenadas(punto.lat, punto.lon)} (Distrito ${distritoFinal})`,
      );
    }
    if (aproximada !== actual.ubicacionAproximada) {
      cambios.push(
        `Punto aproximado: ${actual.ubicacionAproximada ? "sí" : "no"} → ${aproximada ? "sí" : "no"}`,
      );
    }
    if (integracionCambia) {
      cambios.push(
        `Integrada en: ${await nombreDe(actual.integradaEnId)} → ${await nombreDe(integradaEn)}`,
      );
    }

    // Sin cambio no se escribe: una fila que dice "de X a X" solo ensucia el
    // historial de la idea.
    if (cambios.length === 0) return { ok: true, mensaje: "No hubo cambios para guardar." };

    await tx
      .update(ideas)
      .set({
        ...nuevo,
        barrioNormalizado: nuevo.barrio ? normalizar(nuevo.barrio) : null,
        categoriaId: categoria.id,
        ubicacionAproximada: aproximada,
        integradaEnId: integradaEn,
        ...(punto && puntoCambio ? { lat: String(punto.lat), lon: String(punto.lon) } : {}),
        // El id de cada distrito es su numero (ver scripts/seed.ts), el mismo
        // supuesto que usa el alta al guardar el distrito del punto. Solo se
        // escribe si cambio: si no, la columna queda como estaba.
        ...(distritoFinal !== distritoActual ? { distritoId: distritoFinal } : {}),
        updatedAt: new Date(),
      })
      .where(eq(ideas.id, datos.id));

    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: datos.id,
        sesion,
        accion: "correccion",
        nota: cambios.join("\n"),
      }),
    );

    return {
      ok: true,
      mensaje:
        cambios.length === 1
          ? "Corrección guardada. Quedó en el historial con el antes y el después."
          : `Corrección guardada (${cambios.length} cambios). Quedó en el historial con el antes y el después.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Descarte y su marcha atras
// ---------------------------------------------------------------------------

const esquemaMotivo = z.object({
  id: z.coerce.number().int().positive(),
  motivo: z.string().trim().min(MINIMO_MOTIVO).max(2000),
});

/**
 * Descarta una idea que no es una propuesta: una prueba, spam o una carga
 * repetida por error. No se borra (el numero y el codigo que alguien pudo
 * haber recibido siguen apuntando a algo, y el descarte tiene motivo): pasa a
 * "descartado", sale del sitio si estaba publicada y deja de contar en todas
 * las cuentas, publicas y del panel (ver src/db/queries.ts).
 *
 * Solo desde borrador o pendiente (`puedeCambiarIdea`): una idea evaluada ya
 * tiene una decision que el vecino puede estar leyendo. Y solo si no tiene
 * votos ni esta metida en una integracion, para ningun lado (`puedeDescartarse`).
 */
export async function aplicarDescarte(
  crudo: Record<string, unknown>,
  sesion: Autorizacion,
): Promise<Resultado> {
  const leido = esquemaMotivo.safeParse(crudo);
  if (!leido.success) {
    return {
      ok: false,
      error: `Escribí por qué se descarta (mínimo ${MINIMO_MOTIVO} caracteres): queda en el historial.`,
    };
  }
  const { id, motivo } = leido.data;

  return db.transaction(async (tx): Promise<Resultado> => {
    const vigente = await leerIdeaEnJuego(tx, id);
    if (!vigente) return { ok: false, error: "La idea no existe." };
    const veredicto = puedeCambiarIdea(vigente.etapa, vigente, { accion: "descartar" });
    if (!veredicto.permitido) return { ok: false, error: veredicto.motivo };

    // Lo que la idea tiene y no la deja descartar (`puedeDescartarse`): votos,
    // una integracion en otra, otras integradas en ella. Se lee con la fila ya
    // bloqueada: un voto (FOR NO KEY UPDATE sobre la idea) o una correccion
    // (FOR UPDATE) no se cuelan entre esta lectura y el UPDATE.
    const [propia] = await tx
      .select({ votos: ideas.votos, integradaEnId: ideas.integradaEnId })
      .from(ideas)
      .where(eq(ideas.id, id));
    const [emitidos] = await tx
      .select({ total: count() })
      .from(votos)
      .where(eq(votos.ideaId, id));
    let integradaEn: { numero: number | null } | null = null;
    if (propia && propia.integradaEnId !== null) {
      const [final] = await tx
        .select({ numero: ideas.numero })
        .from(ideas)
        .where(eq(ideas.id, propia.integradaEnId));
      integradaEn = { numero: final?.numero ?? null };
    }
    const [integradas] = await tx
      .select({ total: count() })
      .from(ideas)
      .where(eq(ideas.integradaEnId, id));
    const porLoQueTiene = puedeDescartarse({
      votos: Math.max(Number(propia?.votos ?? 0), Number(emitidos?.total ?? 0)),
      integradaEn,
      integradas: Number(integradas?.total ?? 0),
    });
    if (!porLoQueTiene.permitido) return { ok: false, error: porLoQueTiene.motivo };

    const ahora = new Date();
    await tx
      .update(ideas)
      .set({
        estado: "descartado",
        publicada: false,
        estadoActualizadoEn: ahora,
        revisadoPorId: sesion.adminId,
        updatedAt: ahora,
      })
      .where(eq(ideas.id, id));

    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: id,
        sesion,
        accion: "descarte",
        estadoAnterior: vigente.estado,
        estadoNuevo: "descartado",
        nota: vigente.publicada ? `${motivo} (Estaba publicada: salió del sitio.)` : motivo,
      }),
    );
    return {
      ok: true,
      mensaje:
        "Idea descartada: ya no aparece con las demás ni cuenta en ningún número. Se puede deshacer desde la solapa “Descartadas”.",
    };
  });
}

/**
 * Deshace un descarte: la idea vuelve a "pendiente", sin publicar. La fila de
 * `revisiones` es una "reapertura" (vuelve a pendiente, como `reabrirRevision`)
 * con el motivo, asi el historial muestra "Descartada → En evaluación".
 */
export async function aplicarRestauracion(
  crudo: Record<string, unknown>,
  sesion: Autorizacion,
): Promise<Resultado> {
  const leido = esquemaMotivo.safeParse(crudo);
  if (!leido.success) {
    return {
      ok: false,
      error: `Escribí por qué se deshace el descarte (mínimo ${MINIMO_MOTIVO} caracteres): queda en el historial.`,
    };
  }
  const { id, motivo } = leido.data;

  return db.transaction(async (tx): Promise<Resultado> => {
    const vigente = await leerIdeaEnJuego(tx, id);
    if (!vigente) return { ok: false, error: "La idea no existe." };
    const veredicto = puedeCambiarIdea(vigente.etapa, vigente, { accion: "restaurar" });
    if (!veredicto.permitido) return { ok: false, error: veredicto.motivo };

    const ahora = new Date();
    await tx
      .update(ideas)
      .set({
        estado: "pendiente",
        estadoActualizadoEn: ahora,
        revisadoPorId: sesion.adminId,
        updatedAt: ahora,
      })
      .where(and(eq(ideas.id, id), eq(ideas.estado, "descartado")));

    await tx.insert(revisiones).values(
      filaRevision({
        ideaId: id,
        sesion,
        accion: "reapertura",
        estadoAnterior: "descartado",
        estadoNuevo: "pendiente",
        nota: `Deshace el descarte: ${motivo}`,
      }),
    );
    return {
      ok: true,
      mensaje: "Descarte deshecho: la idea volvió a “En evaluación”, sin publicar.",
    };
  });
}
