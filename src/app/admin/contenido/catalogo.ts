/**
 * Catalogo de los textos del sitio: que clave de la tabla `textos` se ve en que
 * pagina, como se llama en castellano y cuanto puede medir.
 *
 * Por que un catalogo escrito a mano y no nombres derivados de la clave, como
 * hacia la pantalla que se borro en 98d0f8d: esa pantalla deducia la pagina
 * por el prefijo ("home-" era la portada) y mentia. Los cuatro `home-hero-*`
 * decian "se ve en la portada" y la portada nueva (src/components/HeroInicio.tsx)
 * tiene su texto en el codigo; `transparencia-*` y `chat-titulo` tampoco los lee
 * nadie. Alguien podia pasar una tarde corrigiendo un texto que no se muestra.
 *
 * Este catalogo no se puede desfasar en silencio: scripts/tests/contenido-catalogo.test.ts
 * recorre src/ buscando cada `textos["clave"]` (y el `t("clave")` de la
 * portada) y falla si una clave que el codigo lee no esta aca, si `archivos` no
 * coincide con donde se lee de verdad, o si el seed carga una clave que el
 * catalogo no conoce. Si agregas un texto a una pagina, sumalo aca, y leelo con
 * la clave escrita literal (`textos["clave"]`): con una constante la prueba no
 * lo encuentra y el panel lo mostraria como un texto que nadie usa.
 *
 * Es codigo puro, sin base ni React: lo usan el panel (para mostrar), las
 * acciones (para validar) y las pruebas.
 */
import { CLAVE_AVISO_URGENTE, MAXIMO_AVISO_URGENTE } from "@/lib/aviso-urgente";

/**
 * Como se escribe el texto, que decide el campo del panel y la limpieza al
 * guardar:
 *  - "linea": un titulo o un dato suelto. Se guarda en un solo renglon.
 *  - "parrafo": una bajada o un mensaje. Los saltos de linea se conservan,
 *    pero la pagina los muestra como espacios (va en un unico <p>).
 *  - "largo": el cuerpo del reglamento. Cada renglon es un parrafo.
 */
export type TipoTexto = "linea" | "parrafo" | "largo";

/**
 * Que formato entiende la pagina que lo muestra. Decide de que se avisa antes
 * de guardar (`avisosDeFormato`), no cambia como se guarda:
 *  - "llano": nada. Casi todo el sitio.
 *  - "negritas": solo **negritas** (las respuestas de las preguntas frecuentes,
 *    ver `conNegritas` en src/app/acerca-de/page.tsx).
 *  - "chat": el markdown reducido del chat (parrafos, listas con guion,
 *    **negritas** y [texto](/ruta) a paginas del sitio; ver `renderizar` en
 *    src/components/Chat.tsx).
 *  - "aviso": texto con enlaces escritos enteros (ver src/lib/aviso-urgente.ts).
 */
export type FormatoTexto = "llano" | "negritas" | "chat" | "aviso";

/** En que pagina se ve, para agrupar la lista del panel. */
export type GrupoTexto =
  | "portada"
  | "proyectos"
  | "distritos"
  | "votacion"
  | "ideas"
  | "todo-el-sitio"
  | "reglamento"
  | "aviso"
  | "sin-uso";

export const GRUPOS: Record<GrupoTexto, { titulo: string; donde: string; ruta: string | null }> = {
  portada: { titulo: "Portada", donde: "la portada", ruta: "/" },
  proyectos: { titulo: "Proyectos", donde: "el listado de proyectos", ruta: "/proyectos" },
  distritos: { titulo: "Distritos", donde: "la página de los distritos", ruta: "/distritos" },
  votacion: { titulo: "Votación", donde: "la página para votar", ruta: "/votar" },
  ideas: { titulo: "Presentar una idea", donde: "el formulario de ideas", ruta: "/ideas/nueva" },
  "todo-el-sitio": {
    titulo: "Todo el sitio",
    donde: "el pie de página y el chat, en todas las páginas",
    ruta: null,
  },
  reglamento: { titulo: "Reglamento", donde: "la página del reglamento", ruta: "/reglamento" },
  aviso: { titulo: "Aviso urgente", donde: "arriba de todas las páginas", ruta: null },
  "sin-uso": {
    titulo: "Textos que ninguna página muestra",
    donde: "ningún lado",
    ruta: null,
  },
};

export type EntradaCatalogo = {
  clave: string;
  /** Que es, en castellano, como lo busca quien viene a cambiarlo. */
  nombre: string;
  grupo: GrupoTexto;
  tipo: TipoTexto;
  /**
   * Archivos de src/ que leen la clave, con barras "/". Vacio: ninguna pagina
   * la muestra. Lo verifica la prueba del catalogo.
   */
  archivos: string[];
  /** Donde se ve, cuando no alcanza con el grupo. */
  donde?: string;
  /** Lo que conviene saber antes de tocarlo. */
  nota?: string;
  /** Tope propio. Si falta, el del tipo (`MAXIMO_POR_TIPO`). */
  maximo?: number;
  /** Si falta, "llano". */
  formato?: FormatoTexto;
  /**
   * Por que no puede quedar vacio, si no puede. Guardado vacio, la pagina NO
   * vuelve al texto del codigo (`textos[clave] ?? "..."` solo cae con la clave
   * ausente, no con ""): deja un titulo en blanco o una frase cortada. Lo que
   * si puede faltar (una bajada, el aviso urgente) no lo lleva.
   */
  obligatorio?: string;
};

const SIN_TITULO_PORTADA = "la portada quedaría con un título en blanco.";
const SIN_TITULO = "la página quedaría sin título.";

export const CLAVE_REGLAMENTO_CUERPO = "reglamento-cuerpo";
export const CLAVE_REGLAMENTO_AVISO = "reglamento-aviso";

/**
 * Topes por tipo, holgados a proposito: el texto mas largo que hay hoy mide
 * unos 300 caracteres. El del reglamento cubre un texto de cincuenta paginas y
 * queda muy lejos del limite de 1 MB que Next le pone al cuerpo de una server
 * action (serverActions.bodySizeLimit): pasado ese limite el pedido ni llega a
 * la accion y el panel muestra un error generico en vez de este mensaje.
 */
export const MAXIMO_POR_TIPO: Record<TipoTexto, number> = {
  linea: 300,
  parrafo: 3_000,
  largo: 200_000,
};

/** Tope de una clave que esta en la base pero no en el catalogo. */
export const MAXIMO_TEXTO_DESCONOCIDO = 20_000;

const LAYOUT = "src/app/layout.tsx";
const PORTADA = "src/app/page.tsx";

/** Los datos del organismo se leen en el pie y en tres paginas mas. */
const CONTACTO = [
  LAYOUT,
  "src/app/acerca-de/page.tsx",
  "src/app/privacidad/page.tsx",
  "src/components/AvisoLegal.tsx",
];
const CONTACTO_Y_SEGUIMIENTO = [...CONTACTO, "src/app/ideas/seguimiento/page.tsx"];
const DONDE_CONTACTO =
  "El pie de todas las páginas, “Cómo participar”, la política de privacidad y el aviso legal.";

export const CATALOGO: EntradaCatalogo[] = [
  // --- Portada: los tres bloques de "Cómo funciona", el mapa, las novedades ---
  {
    clave: "home-bloque1-titulo",
    nombre: "Título del bloque 1 de “Cómo funciona”",
    grupo: "portada",
    tipo: "linea",
    archivos: [PORTADA],
    obligatorio: SIN_TITULO_PORTADA,
  },
  {
    clave: "home-bloque1-texto",
    nombre: "Texto del bloque 1 de “Cómo funciona”",
    grupo: "portada",
    tipo: "parrafo",
    archivos: [PORTADA],
  },
  {
    clave: "home-bloque2-titulo",
    nombre: "Título del bloque 2 de “Cómo funciona”",
    grupo: "portada",
    tipo: "linea",
    archivos: [PORTADA],
    obligatorio: SIN_TITULO_PORTADA,
  },
  {
    clave: "home-bloque2-texto",
    nombre: "Texto del bloque 2 de “Cómo funciona”",
    grupo: "portada",
    tipo: "parrafo",
    archivos: [PORTADA],
  },
  {
    clave: "home-bloque3-titulo",
    nombre: "Título del bloque 3 de “Cómo funciona”",
    grupo: "portada",
    tipo: "linea",
    archivos: [PORTADA],
    obligatorio: SIN_TITULO_PORTADA,
  },
  {
    clave: "home-bloque3-texto",
    nombre: "Texto del bloque 3 de “Cómo funciona”",
    grupo: "portada",
    tipo: "parrafo",
    archivos: [PORTADA],
  },
  {
    clave: "home-mapa-titulo",
    nombre: "Título de la sección del mapa",
    grupo: "portada",
    tipo: "linea",
    archivos: [PORTADA],
    obligatorio: SIN_TITULO_PORTADA,
  },
  {
    clave: "home-mapa-texto",
    nombre: "Bajada de la sección del mapa",
    grupo: "portada",
    tipo: "parrafo",
    archivos: [PORTADA],
  },
  {
    clave: "home-novedades-titulo",
    nombre: "Título de la sección de novedades",
    grupo: "portada",
    tipo: "linea",
    archivos: [PORTADA],
    obligatorio: SIN_TITULO_PORTADA,
  },
  {
    clave: "home-novedades-texto",
    nombre: "Bajada de la sección de novedades",
    grupo: "portada",
    tipo: "parrafo",
    archivos: [PORTADA],
  },

  // --- Encabezados de las paginas ---------------------------------------------
  {
    clave: "proyectos-titulo",
    nombre: "Título de la página",
    grupo: "proyectos",
    tipo: "linea",
    archivos: ["src/app/proyectos/page.tsx"],
    obligatorio: SIN_TITULO,
  },
  {
    clave: "proyectos-subtitulo",
    nombre: "Bajada, debajo del título",
    grupo: "proyectos",
    tipo: "parrafo",
    archivos: ["src/app/proyectos/page.tsx"],
  },
  {
    clave: "distritos-titulo",
    nombre: "Título de la página",
    grupo: "distritos",
    tipo: "linea",
    archivos: ["src/app/distritos/page.tsx"],
    obligatorio: SIN_TITULO,
  },
  {
    clave: "distritos-subtitulo",
    nombre: "Bajada, debajo del título",
    grupo: "distritos",
    tipo: "parrafo",
    archivos: ["src/app/distritos/page.tsx"],
  },
  {
    clave: "votacion-titulo",
    nombre: "Título de la página",
    grupo: "votacion",
    tipo: "linea",
    archivos: ["src/app/votar/page.tsx"],
    obligatorio: SIN_TITULO,
  },
  {
    clave: "votacion-subtitulo",
    nombre: "Bajada, debajo del título",
    grupo: "votacion",
    tipo: "parrafo",
    archivos: ["src/app/votar/page.tsx"],
  },
  {
    clave: "ideas-nueva-titulo",
    nombre: "Título de la página",
    grupo: "ideas",
    tipo: "linea",
    archivos: ["src/app/ideas/nueva/page.tsx"],
    obligatorio: SIN_TITULO,
  },
  {
    clave: "ideas-nueva-subtitulo",
    nombre: "Bajada, debajo del título",
    grupo: "ideas",
    tipo: "parrafo",
    archivos: ["src/app/ideas/nueva/page.tsx"],
  },

  // --- Lo que esta en todas las paginas ---------------------------------------
  {
    clave: "contacto-organismo",
    nombre: "Organismo responsable",
    grupo: "todo-el-sitio",
    tipo: "linea",
    archivos: CONTACTO,
    donde: DONDE_CONTACTO,
    obligatorio: "va dentro de frases del aviso legal y de la política de privacidad, que quedarían cortadas.",
  },
  {
    clave: "contacto-direccion",
    nombre: "Dirección de la oficina",
    grupo: "todo-el-sitio",
    tipo: "linea",
    archivos: CONTACTO_Y_SEGUIMIENTO,
    donde: `${DONDE_CONTACTO} También en “Seguí tu idea”, para quien perdió el código.`,
  },
  {
    clave: "contacto-telefono",
    nombre: "Teléfono de contacto",
    grupo: "todo-el-sitio",
    tipo: "linea",
    archivos: CONTACTO_Y_SEGUIMIENTO,
    donde: `${DONDE_CONTACTO} También en “Seguí tu idea”, para quien perdió el código.`,
  },
  {
    clave: "chat-bienvenida",
    nombre: "Mensaje de bienvenida del chat",
    grupo: "todo-el-sitio",
    tipo: "parrafo",
    archivos: [LAYOUT],
    donde: "El primer mensaje del chat “Consultas”, en todas las páginas.",
    nota: "Se dibuja como una respuesta del chat: cada renglón es un párrafo, y funcionan las **negritas**, las listas con guion y los enlaces a páginas del sitio escritos [así](/votar).",
    formato: "chat",
    obligatorio: "el chat abriría con un mensaje en blanco.",
  },

  // --- Con solapa propia en el panel ------------------------------------------
  {
    clave: CLAVE_REGLAMENTO_CUERPO,
    nombre: "Texto completo del reglamento",
    grupo: "reglamento",
    tipo: "largo",
    archivos: ["src/app/reglamento/page.tsx"],
  },
  {
    clave: CLAVE_REGLAMENTO_AVISO,
    nombre: "Aviso mientras no haya reglamento",
    grupo: "reglamento",
    tipo: "parrafo",
    archivos: ["src/app/reglamento/page.tsx"],
    nota: "Solo se ve mientras el texto del reglamento esté vacío.",
    obligatorio: "mientras no haya reglamento, /reglamento mostraría un recuadro vacío.",
  },
  {
    clave: CLAVE_AVISO_URGENTE,
    nombre: "Aviso urgente",
    grupo: "aviso",
    // Una banda de un renglon o dos: se guarda sin saltos de linea.
    tipo: "linea",
    archivos: [LAYOUT],
    maximo: MAXIMO_AVISO_URGENTE,
    formato: "aviso",
  },

  // --- En la base, pero ninguna pagina los lee --------------------------------
  // Quedaron de la carga inicial (data/contenido-sitio.json). No se borran de la
  // base desde aca: si algun dia una pagina los vuelve a leer, siguen estando.
  {
    clave: "sitio-nombre",
    nombre: "Nombre del sitio",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "El nombre que se ve en el encabezado y en la pestaña del navegador está en el código (src/app/layout.tsx).",
  },
  {
    clave: "sitio-titulo",
    nombre: "Título del sitio",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "El título de la pestaña y de las previsualizaciones está en el código (src/app/layout.tsx).",
  },
  {
    clave: "home-hero-volanta",
    nombre: "Volanta del encabezado de la portada",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "La portada nueva tiene su encabezado en el código (src/components/HeroInicio.tsx).",
  },
  {
    clave: "home-hero-titulo",
    nombre: "Título del encabezado de la portada",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "La portada nueva tiene su encabezado en el código (src/components/HeroInicio.tsx).",
  },
  {
    clave: "home-hero-texto",
    nombre: "Texto del encabezado de la portada",
    grupo: "sin-uso",
    tipo: "parrafo",
    archivos: [],
    nota: "La portada nueva tiene su encabezado en el código (src/components/HeroInicio.tsx).",
  },
  {
    clave: "home-hero-boton",
    nombre: "Botón del encabezado de la portada",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "La portada nueva tiene su encabezado en el código (src/components/HeroInicio.tsx).",
  },
  {
    clave: "transparencia-titulo",
    nombre: "Título de Transparencia",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "Pasó al código de src/app/transparencia/page.tsx cuando se sacó esta pantalla: decía “cuánto se ejecutó de su presupuesto” y no había dato detrás.",
  },
  {
    clave: "transparencia-subtitulo",
    nombre: "Bajada de Transparencia",
    grupo: "sin-uso",
    tipo: "parrafo",
    archivos: [],
    nota: "Pasó al código de src/app/transparencia/page.tsx cuando se sacó esta pantalla.",
  },
  {
    clave: "chat-titulo",
    nombre: "Título del chat",
    grupo: "sin-uso",
    tipo: "linea",
    archivos: [],
    nota: "El chat se llama “Consultas” en el código (src/components/Chat.tsx).",
  },
];

const POR_CLAVE = new Map(CATALOGO.map((entrada) => [entrada.clave, entrada]));

export function entradaDe(clave: string): EntradaCatalogo | undefined {
  return POR_CLAVE.get(clave);
}

/** Un texto como lo muestra el panel: lo que hay en la base cruzado con el catalogo. */
export type TextoDelPanel = {
  clave: string;
  /** Lo guardado; "" si todavia no esta en la base. */
  valor: string;
  /** false: la pagina lo lee pero nadie lo cargo, y muestra lo que trae el codigo. */
  existe: boolean;
  /** La columna `descripcion` de la base, si alguien la cargo. */
  descripcion: string | null;
  /** Cuando se guardo por ultima vez, ya en palabras. */
  actualizado: string | null;
  /** null: la clave esta en la base pero el catalogo no la conoce. */
  entrada: EntradaCatalogo | null;
};

/** El orden de los grupos en el panel: de la portada a lo que no se usa. */
const ORDEN_GRUPOS: GrupoTexto[] = [
  "portada",
  "proyectos",
  "distritos",
  "votacion",
  "ideas",
  "todo-el-sitio",
  "reglamento",
  "aviso",
  "sin-uso",
];

/**
 * Las filas de la base agrupadas por pagina, en el orden del catalogo (que es
 * el orden en que se leen en la pagina, de arriba abajo).
 *
 * - Una clave que el sitio lee y la base no tiene aparece igual, vacia y con
 *   `existe: false`: guardarla la crea. Es el caso del cuerpo del reglamento y
 *   del aviso urgente, que no vienen en la carga inicial.
 * - Una clave de la base que el catalogo no conoce va a "sin-uso": la prueba
 *   del catalogo garantiza que toda clave que el codigo lee esta en el
 *   catalogo, asi que una desconocida no la lee nadie.
 * - Una clave "sin-uso" que tampoco esta en la base no aparece: no hay nada que
 *   mostrar ni que editar.
 */
export function agruparTextos(
  filas: { clave: string; valor: string; descripcion: string | null; actualizado: string | null }[],
): { grupo: GrupoTexto; textos: TextoDelPanel[] }[] {
  const enLaBase = new Map(filas.map((fila) => [fila.clave, fila]));
  const porGrupo = new Map<GrupoTexto, TextoDelPanel[]>(ORDEN_GRUPOS.map((grupo) => [grupo, []]));

  for (const entrada of CATALOGO) {
    const fila = enLaBase.get(entrada.clave);
    if (!fila && entrada.grupo === "sin-uso") continue;
    porGrupo.get(entrada.grupo)!.push({
      clave: entrada.clave,
      valor: fila?.valor ?? "",
      existe: Boolean(fila),
      descripcion: fila?.descripcion ?? null,
      actualizado: fila?.actualizado ?? null,
      entrada,
    });
  }

  const desconocidas = filas
    .filter((fila) => !POR_CLAVE.has(fila.clave))
    .sort((a, b) => a.clave.localeCompare(b.clave));
  for (const fila of desconocidas) {
    porGrupo.get("sin-uso")!.push({ ...fila, existe: true, entrada: null });
  }

  return ORDEN_GRUPOS.map((grupo) => ({ grupo, textos: porGrupo.get(grupo)! })).filter(
    (grupo) => grupo.textos.length > 0,
  );
}

/** Tipo de una clave. Lo desconocido se trata como parrafo: no se le sacan saltos. */
export function tipoDe(clave: string): TipoTexto {
  return entradaDe(clave)?.tipo ?? "parrafo";
}

export function maximoDe(clave: string): number {
  const entrada = entradaDe(clave);
  if (!entrada) return MAXIMO_TEXTO_DESCONOCIDO;
  return entrada.maximo ?? MAXIMO_POR_TIPO[entrada.tipo];
}

/**
 * El valor tal como se guarda. Lo usan la accion (antes de escribir) y el panel
 * (para saber si hay cambios sin guardar y para la vista previa), asi las dos
 * puntas comparan lo mismo.
 *
 *  - Los saltos de Windows ("\r\n") pasan a "\n": un formulario los manda asi y
 *    el texto se guardaba con los dos.
 *  - Una "linea" queda en un renglon, con los espacios colapsados.
 *  - Todo va sin espacios al principio ni al final.
 */
export function normalizarValor(clave: string, valor: string): string {
  return tipoDe(clave) === "linea" ? normalizarLinea(valor) : normalizarBloque(valor);
}

/** Largo en caracteres de verdad (puntos de codigo), no en unidades UTF-16. */
export function largoDe(valor: string): number {
  return [...valor].length;
}

// ---------------------------------------------------------------------------
// Preguntas frecuentes y novedades
//
// No son textos de la tabla `textos`, pero se limpian con el mismo criterio y
// el panel necesita los mismos topes para el contador. Viven aca porque este
// archivo es el unico del contenido que puede importar el navegador: el que
// escribe (escritura.ts) trae la base.
// ---------------------------------------------------------------------------

export const MAXIMO_PREGUNTA = 300;
/**
 * El chat recibe TODAS las respuestas publicadas en cada consulta (ver
 * `construirSistema` en src/app/api/chat/route.ts): cada respuesta larga se
 * paga en cada pregunta que alguien le hace a Migue.
 */
export const MAXIMO_RESPUESTA = 3_000;
export const MAXIMO_TITULO_NOVEDAD = 200;
export const MAXIMO_COPETE = 300;
export const MAXIMO_CUERPO_NOVEDAD = 5_000;

/** Un renglon: sin saltos, con los espacios colapsados. */
export function normalizarLinea(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
}

/** Un texto de varios renglones: saltos de Unix y sin espacios en las puntas. */
export function normalizarBloque(valor: string): string {
  return valor.replace(/\r\n?/g, "\n").trim();
}

export function formatoDe(clave: string): FormatoTexto {
  return entradaDe(clave)?.formato ?? "llano";
}

/**
 * Lo que conviene avisar ANTES de guardar un texto. El sitio dibuja todo con
 * nodos React (nunca con dangerouslySetInnerHTML), asi que lo pegado con un
 * formato que la pagina no entiende se ve con los signos a la vista. No se
 * corrige solo: puede ser a proposito, y un "arreglo" automatico sobre un texto
 * legal es peor que un aviso.
 */
export function avisosDeFormato(valor: string, formato: FormatoTexto, tipo: TipoTexto): string[] {
  const avisos: string[] = [];

  if (HTML.test(valor)) {
    avisos.push(
      "Tiene etiquetas HTML (como <p> o <br>). El sitio no las interpreta: se van a ver tal cual, con los signos. Si lo copiaste de otra página, pegalo sin formato (Ctrl+Mayús+V).",
    );
  }

  // El chat entiende [texto](/ruta) hacia paginas del sitio; un enlace de
  // markdown hacia afuera no lo dibuja nadie.
  const enlaces = [...valor.matchAll(ENLACE_MARKDOWN)];
  const enlacesQueNoSeVen =
    formato === "chat" ? enlaces.filter((enlace) => !enlace[1].startsWith("/")) : enlaces;
  if (enlacesQueNoSeVen.length > 0) {
    avisos.push(
      formato === "aviso"
        ? "El formato [texto](dirección) no se interpreta: el enlace se escribe entero (https://…) o como ruta del sitio (/votar), así el vecino ve a dónde lo lleva."
        : formato === "chat"
          ? "El chat solo dibuja enlaces a páginas del sitio, como [texto](/votar): los que van afuera se ven con los corchetes."
          : "El formato [texto](dirección) no se interpreta: se van a ver los corchetes y la dirección.",
    );
  }

  // El aviso enlaza solo las urls con https:// (ver `trozosDelAviso` en
  // src/lib/aviso-urgente.ts). Una con http:// se publica como texto sin clic, y
  // quien la escribio tiene que enterarse antes y no mirando el sitio.
  if (formato === "aviso" && URL_SIN_CIFRAR.test(valor)) {
    avisos.push(
      "Una dirección que empieza con http:// (sin la s) no se convierte en enlace: se ve como texto, sin clic. Si la página abre con https://, escribila así.",
    );
  }

  const negritasQueNoSeVen = NEGRITA.test(valor) && formato !== "negritas" && formato !== "chat";
  if (negritasQueNoSeVen || TITULO_MARKDOWN.test(valor)) {
    avisos.push(
      formato === "negritas" || formato === "chat"
        ? "Los títulos con # no se interpretan: se va a ver el signo. Las **negritas** sí funcionan."
        : "Tiene marcas de formato (# o **). Este texto no las interpreta: se van a ver los signos.",
    );
  }

  // En un "parrafo" la pagina pone todo en un <p>, y ahi un salto de linea es
  // un espacio. El chat si arma un parrafo por renglon, y el reglamento tambien.
  if (tipo === "parrafo" && formato !== "chat" && valor.trim().includes("\n")) {
    avisos.push(
      "Los saltos de línea no se ven en la página: el texto sale todo seguido, en un mismo párrafo.",
    );
  }

  if (tipo === "largo" && parecenRenglonesCortados(valor)) {
    avisos.push(
      "Parece copiado de un PDF: muchos renglones terminan a mitad de frase. Cada renglón se publica como un párrafo aparte, así que esas frases van a quedar partidas. Uní los renglones de cada párrafo antes de guardar.",
    );
  }

  return avisos;
}

/**
 * Etiquetas HTML conocidas, no cualquier "<": un texto legal puede decir "si el
 * monto es < 100" y eso no es HTML.
 */
const HTML =
  /<\/?(?:p|br|div|span|strong|b|i|em|u|a|ul|ol|li|h[1-6]|table|tbody|thead|tr|td|th|font|img|script|style)\b[^>]*>/i;
/** El grupo 1 es la direccion, para distinguir una ruta del sitio de una url. */
const ENLACE_MARKDOWN = /\[[^\]\n]+\]\(([^)\s]+)\)/g;
const NEGRITA = /\*\*[^*\n]+\*\*/;
const TITULO_MARKDOWN = /^\s{0,3}#{1,6}\s+\S/m;
const URL_SIN_CIFRAR = /\bhttp:\/\//i;

/**
 * El sintoma del texto copiado de un PDF: el renglon termina sin signo de
 * cierre y el siguiente sigue en minuscula, o sea que es la misma frase. Se
 * avisa recien cuando pasa varias veces, y en una parte apreciable del texto:
 * un reglamento tiene incisos y enumeraciones que tambien cortan asi, de a uno.
 */
function parecenRenglonesCortados(valor: string): boolean {
  const renglones = valor
    .split(/\r?\n/)
    .map((renglon) => renglon.trim())
    .filter(Boolean);
  if (renglones.length < 6) return false;
  let cortados = 0;
  for (let i = 0; i < renglones.length - 1; i++) {
    const termina = /[.:;!?)»”"]$/.test(renglones[i]);
    const sigueEnMinuscula = /^\p{Ll}/u.test(renglones[i + 1]);
    if (!termina && sigueEnMinuscula) cortados++;
  }
  return cortados >= 3 && cortados / renglones.length >= 0.2;
}
