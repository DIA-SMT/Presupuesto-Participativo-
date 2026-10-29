/** Etiquetas y formatos compartidos por todo el sitio. */

export const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  pendiente: "En evaluación",
  factible: "Factible",
  no_factible: "No factible",
  integrado: "Integrada con otra idea",
  ganador: "Proyecto ganador",
  // Solo lo ve el panel: una idea descartada queda despublicada.
  descartado: "Descartada",
};

/**
 * Lo que significa cada estado. No se exporta: se lee con `descripcionEstado`,
 * porque "factible" no se dice igual en todas las etapas y por eso no esta aca.
 */
const DESCRIPCION_ESTADO: Record<string, string> = {
  pendiente: "Todavía está siendo evaluada por el equipo técnico.",
  no_factible: "La evaluación técnica determinó que no puede ejecutarse como está presentada.",
  integrado: "Se fusionó con otra propuesta parecida para presentarse como un solo proyecto.",
  ganador: "Fue el proyecto más votado de su distrito y se incorpora al presupuesto municipal.",
  // Solo en el panel: una descartada nunca se publica.
  descartado: "Se descartó: era una prueba, un mensaje sin propuesta o una carga repetida.",
};

/**
 * La descripcion de un estado, dicha para la etapa de la edicion de la idea.
 * La usan la ficha publica, las pastillas por estado de /distritos/N y el
 * seguimiento de quien presento la idea.
 *
 * Solo "factible" depende de la etapa. Su texto era fijo y en pasado ("pudo ser
 * votada"), escrito para la edicion 2025 ya votada: en una edicion en
 * evaluacion o en votacion daba a entender que la votacion ya habia pasado. La
 * ficha de un proyecto que estaba en la boleta decia que "pudo ser votado", y
 * el vecino que seguia su idea recien declarada factible leia lo mismo antes de
 * que se votara.
 *
 * `publicada` cuenta por lo mismo que en `seVota` (src/lib/etapas.ts): lo que
 * entra en la boleta es factible Y publicada, y la boleta queda fija cuando se
 * abre la votacion. Las paginas publicas solo muestran publicadas (de ahi el
 * valor por defecto); el seguimiento del autor puede mostrar una que no lo
 * esta. `etapa` va como string, como el resto de este archivo, que no importa
 * tipos del esquema: una etapa que no se conoce cae en la frase sin tiempo.
 */
export function descripcionEstado(
  estado: string,
  etapa: string | null | undefined,
  publicada = true,
): string | undefined {
  if (estado !== "factible") return DESCRIPCION_ESTADO[estado];
  const paso = "Pasó la evaluación técnica y presupuestaria";
  switch (etapa) {
    case "ideas":
    case "evaluacion":
      return publicada
        ? `${paso}: va a poder votarse en su distrito.`
        : `${paso}: si el equipo la publica antes de la votación, va a poder votarse en su distrito.`;
    case "votacion":
      return publicada
        ? `${paso}: está en la boleta de su distrito.`
        : `${paso}, pero no está publicada: no entra en la boleta de esta votación.`;
    case "seguimiento":
    case "cerrada":
      // Sin publicar no se sabe si llego a la boleta (pudo despublicarse
      // despues de la votacion): se dice solo lo seguro.
      return publicada ? `${paso}: pudo ser votada.` : `${paso}.`;
    default:
      return `${paso}.`;
  }
}

/*
 * Estos valores terminan siendo el color de LETRA de la pastilla de estado
 * (`Chip` en components/ui.tsx), asi que los que eran un azul de fondo de la
 * rampa usan el token de texto, que se aclara en el tema oscuro.
 */
export const COLOR_ESTADO: Record<string, string> = {
  borrador: "var(--color-estado-nofactible)",
  pendiente: "var(--color-estado-nofactible)",
  factible: "var(--marca-texto)",
  no_factible: "var(--color-estado-nofactible)",
  integrado: "var(--color-estado-integrado)",
  ganador: "var(--ganador-texto)",
  // Gris como "no factible": en la bandeja tiene que leerse apagada.
  descartado: "var(--color-estado-nofactible)",
};

/**
 * El color de una categoria, tomado del TOKEN del tema y no del hex que trae la
 * base.
 *
 * `categorias.color` se siembra desde data/contenido-sitio.json con tres hexes
 * calculados para fondo blanco, asi que en el tema oscuro no se adaptan: la
 * pastilla de "Espacio de innovacion urbana" daba 2.18:1 sobre el fondo, contra
 * el 4.5:1 que pide WCAG 1.4.3. Los --color-cat-* si se aclaran en oscuro (ver
 * globals.css), y en claro valen EXACTAMENTE los mismos hexes que siembra el
 * JSON: por eso cambiar de uno al otro no altera el tema claro.
 *
 * El `respaldo` es para una categoria que no sea ninguna de las tres: se pinta
 * con lo que traiga la base, que es lo que se hacia hasta ahora. Si el programa
 * suma una categoria hay que darle su token; hasta que lo tenga, su color no
 * sigue al tema, pero tampoco se pierde.
 *
 * El slug se compara por parte y no entero porque los de la base son
 * "socio-ambiental", "cultural-deportivo" e "innovacion-urbana", y el resto del
 * codigo (el tablero, las pruebas) ya venia usando los cortos.
 */
export function colorCategoria(
  slug: string | null | undefined,
  respaldo: string | null | undefined = null,
): string | null {
  if (slug) {
    if (slug.includes("ambiental")) return "var(--color-cat-ambiental)";
    if (slug.includes("deportivo")) return "var(--color-cat-deportivo)";
    if (slug.includes("urbana")) return "var(--color-cat-urbana)";
  }
  return respaldo ?? null;
}

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

/**
 * El monto mas grande que entra en `ediciones.presupuesto_total` y en
 * `ideas.presupuesto_total`: las dos son numeric(14, 2), 12 digitos enteros.
 * Vive aca y no en las acciones porque lo usan las dos puntas: la accion lo
 * valida (un monto mas grande hacia fallar el UPDATE con "numeric field
 * overflow" y tiraba la pantalla entera) y el formulario lo pone de `max`.
 */
export const MAXIMO_PRESUPUESTO = 999_999_999_999.99;

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

/**
 * El codigo de la propuesta del formulario 2026, "D05-P012": el distrito y el
 * numero de la idea en la edicion. El papel trae el casillero vacio
 * ("Código: D___ P___") y el equipo lo completa con lo que muestra el panel al
 * cargarla. No se guarda: sale de dos columnas que ya existen, y el numero es
 * el identificador que no cambia (si una correccion muda la idea de distrito,
 * el papel archivado se sigue encontrando por la P).
 */
export function codigoDePropuesta(distrito: number | null, numero: number | null): string {
  const d = distrito === null ? "--" : String(distrito).padStart(2, "0");
  const p = numero === null ? "---" : String(numero).padStart(3, "0");
  return `D${d}-P${p}`;
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

/**
 * El dia de hoy en Tucuman, AAAA-MM-DD. Se arma con las partes de Intl y no con
 * `toISOString()`, que da el dia en UTC: despues de las 21:00 locales ya es
 * manana, y una idea cargada a la noche quedaba con fecha del dia siguiente.
 * La usan el formulario publico (/api/ideas) y la carga desde el panel.
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

/**
 * Cuantos dias de calendario de Tucuman van de `desde` a `hasta` (0 = el mismo
 * dia). No se cuentan bloques de 24 h: una idea de ayer a las 23:40 vista hoy a
 * las 9:00 es de "hace 1 dia", aunque hayan pasado 9 horas. Cada fecha se lleva
 * a su dia local y se restan los dias a medianoche UTC, que siempre distan
 * 86.400.000 ms (Tucuman no tiene horario de verano, y aunque lo tuviera la
 * resta es sobre fechas, no sobre horas).
 */
export function diasDeCalendarioEnTucuman(desde: Date, hasta: Date): number {
  const aDia = (fecha: Date) => {
    const [anio, mes, dia] = hoyEnTucuman(fecha).split("-").map(Number);
    return Date.UTC(anio, mes - 1, dia);
  };
  return Math.round((aDia(hasta) - aDia(desde)) / 86_400_000);
}

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

const conjuncion = new Intl.ListFormat("es", { type: "conjunction" });

/**
 * "el distrito 7 quedó", o "los distritos 2, 10 y 13 quedaron": los distritos
 * con el verbo que concuerda. La portada y /transparencia armaban la frase cada
 * una por su lado, y cuando la portada dejo de decir "el distrito 2, 10, 13
 * quedó" (en singular aunque fueran diez), /transparencia siguio diciendo "el
 * distrito 2, 10, 13 no eligió proyecto". Quien llama se asegura de que haya
 * al menos uno: sin distritos no hay frase que armar.
 */
export function distritosConVerbo(distritos: number[], singular: string, plural: string): string {
  if (distritos.length === 1) return `el distrito ${distritos[0]} ${singular}`;
  return `los distritos ${conjuncion.format(distritos.map(String))} ${plural}`;
}

/** Recorta un texto en el ultimo espacio antes del limite. */
export function recortar(texto: string, largo = 220): string {
  if (texto.length <= largo) return texto;
  const corte = texto.slice(0, largo);
  const ultimo = corte.lastIndexOf(" ");
  return `${corte.slice(0, ultimo > 0 ? ultimo : largo).trimEnd()}…`;
}
