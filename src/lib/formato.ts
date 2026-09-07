/** Etiquetas y formatos compartidos por todo el sitio. */

export const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  pendiente: "En evaluación",
  factible: "Factible",
  no_factible: "No factible",
  integrado: "Integrada con otra idea",
  ganador: "Proyecto ganador",
};

export const DESCRIPCION_ESTADO: Record<string, string> = {
  pendiente: "Todavía está siendo evaluada por el equipo técnico.",
  factible: "Pasó la evaluación técnica y presupuestaria: pudo ser votada.",
  no_factible: "La evaluación técnica determinó que no puede ejecutarse como está presentada.",
  integrado: "Se fusionó con otra propuesta parecida para presentarse como un solo proyecto.",
  ganador: "Fue el proyecto más votado de su distrito y se incorpora al presupuesto municipal.",
};

export const COLOR_ESTADO: Record<string, string> = {
  borrador: "var(--color-estado-nofactible)",
  pendiente: "var(--color-estado-nofactible)",
  factible: "var(--color-estado-factible)",
  no_factible: "var(--color-estado-nofactible)",
  integrado: "var(--color-estado-integrado)",
  ganador: "var(--color-estado-ganador)",
};

export const ETIQUETA_PRESUPUESTO: Record<string, string> = {
  sin_asignar: "Sin presupuesto asignado",
  preparacion: "En preparación",
  contratacion: "En contratación",
  ejecucion: "En ejecución",
  finalizado: "Finalizado",
};

/** Orden de las etapas del presupuesto, para dibujar la barra de avance. */
export const ETAPAS_PRESUPUESTO = [
  "preparacion",
  "contratacion",
  "ejecucion",
  "finalizado",
] as const;

export const ETIQUETA_ETAPA: Record<string, string> = {
  ideas: "Presentación de ideas",
  evaluacion: "Evaluación técnica",
  votacion: "Votación abierta",
  seguimiento: "Seguimiento de obras",
  cerrada: "Edición cerrada",
};

/**
 * Los roles del panel. Estaba escrito igual en dos pantallas del backoffice (la
 * cabecera y el equipo), asi que el dia que uno de los tres se renombre hay que
 * acordarse de los dos lugares. Vive aca, con las demas etiquetas del sitio.
 *
 * Va tipado con `string` y no con `RolAdmin`, como las demas tablas de este
 * archivo: formato.ts no importa nada del esquema. La contra es que si aparece
 * un rol nuevo TypeScript no obliga a agregarlo aca, asi que los dos usos leen
 * con `?? rol` y muestran el valor crudo en lugar de un hueco.
 */
export const ETIQUETA_ROL: Record<string, string> = {
  admin: "Administrador",
  moderador: "Moderador",
  lector: "Lector",
};

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const enteros = new Intl.NumberFormat("es-AR");

export function formatearPesos(monto: number | null | undefined): string {
  if (monto === null || monto === undefined) return "Sin cargar";
  return pesos.format(monto);
}

export function formatearNumero(valor: number): string {
  return enteros.format(valor);
}

const fechaLarga = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Argentina/Tucuman",
});

const fechaCorta = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Argentina/Tucuman",
});

/** Las fechas del dataset son "YYYY-MM-DD": se parsean sin corrimiento de zona. */
function aFecha(valor: string): Date {
  const [anio, mes, dia] = valor.split("-").map(Number);
  return new Date(Date.UTC(anio, (mes ?? 1) - 1, dia ?? 1, 12));
}

export function formatearFecha(valor: string | null | undefined): string {
  if (!valor) return "";
  return fechaLarga.format(aFecha(valor));
}

export function formatearFechaCorta(valor: string | null | undefined): string {
  if (!valor) return "";
  return fechaCorta.format(aFecha(valor));
}

export function formatearRango(
  desde: string | null,
  hasta: string | null,
): string {
  if (desde && hasta) {
    if (desde === hasta) return formatearFecha(desde);
    return `${formatearFecha(desde)} — ${formatearFecha(hasta)}`;
  }
  if (desde) return `Desde ${formatearFecha(desde)}`;
  if (hasta) return `Hasta ${formatearFecha(hasta)}`;
  return "";
}

/** Recorta un texto en el ultimo espacio antes del limite. */
export function recortar(texto: string, largo = 220): string {
  if (texto.length <= largo) return texto;
  const corte = texto.slice(0, largo);
  const ultimo = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimo > 0 ? ultimo : largo).trimEnd()}…`;
}
