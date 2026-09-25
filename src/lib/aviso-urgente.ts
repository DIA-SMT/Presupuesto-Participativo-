/**
 * El aviso urgente del sitio: un texto que el equipo carga desde el panel
 * (/admin/contenido, solapa "Aviso urgente") y que aparece arriba de todas las
 * paginas publicas mientras no este vacio. Es para lo que no puede esperar a
 * que alguien lea una novedad: "la votacion se extiende hasta el viernes por la
 * caida de CIDITUC", "el sitio va a estar en mantenimiento el sabado".
 *
 * Vive en la tabla `textos` con la clave de abajo y se guarda con la misma
 * accion que cualquier otro texto, asi que cada cambio queda en
 * `bitacora_sistema`. No tiene tabla propia porque es UN texto: hay aviso o no
 * hay, nada mas. Quitarlo es guardarlo vacio.
 *
 * Este archivo es codigo puro, sin React ni base, para que lo compartan el
 * componente publico (src/components/AvisoUrgente.tsx), la vista previa del
 * panel y las pruebas (scripts/tests/aviso-urgente.test.ts).
 */
import { rutaInterna } from "./chat-enlaces";

export const CLAVE_AVISO_URGENTE = "aviso-urgente";

/**
 * Tope del aviso. Es una banda arriba de cada pagina: en un telefono, 400
 * caracteres ya son siete u ocho renglones antes del encabezado. Si hace falta
 * explicar mas, el aviso enlaza a una novedad o a una pagina.
 */
export const MAXIMO_AVISO_URGENTE = 400;

export type TrozoAviso =
  | { tipo: "texto"; texto: string }
  | { tipo: "enlace"; texto: string; href: string; interno: boolean };

/**
 * El aviso partido en texto y enlaces, para dibujarlo con nodos React y sin
 * dangerouslySetInnerHTML.
 *
 * Se convierte en enlace, y nada mas:
 *  - una url completa con https://, que se muestra tal como se escribio (se ve
 *    a donde lleva). Con http:// no: la banda sale en todo el sitio del
 *    municipio, y un enlace sin cifrar ahi es una puerta para que alguien en la
 *    red del vecino le cambie la pagina de destino. El panel avisa antes de
 *    guardar (`avisosDeFormato`) y el texto se ve igual, sin clic;
 *  - una ruta del sitio que empieza con "/", como /votar o /reglamento.
 *
 * Todo lo demas queda como texto, incluido el formato [texto](url) de
 * markdown: con ese formato el vecino no ve a donde lo manda el enlace, y la
 * banda sale en TODAS las paginas del sitio. El panel avisa si alguien lo
 * intenta (ver `avisosDeFormato` en src/app/admin/contenido/catalogo.ts).
 *
 * Se recorre palabra por palabra y no con una expresion regular con
 * lookbehind a proposito: el lookbehind no existe en Safari anterior a 16.4 y
 * una expresion asi rompe el script entero en esos telefonos, no solo el
 * aviso. Este componente va en el layout de todo el sitio.
 */
export function trozosDelAviso(texto: string): TrozoAviso[] {
  const trozos: TrozoAviso[] = [];
  const sumarTexto = (parte: string) => {
    if (!parte) return;
    const ultimo = trozos[trozos.length - 1];
    if (ultimo?.tipo === "texto") ultimo.texto += parte;
    else trozos.push({ tipo: "texto", texto: parte });
  };

  for (const palabra of texto.split(/(\s+)/)) {
    const enlace = palabra.trim() ? enlaceDe(palabra) : null;
    if (!enlace) {
      sumarTexto(palabra);
      continue;
    }
    sumarTexto(enlace.antes);
    trozos.push({
      tipo: "enlace",
      texto: enlace.texto,
      href: enlace.href,
      interno: enlace.interno,
    });
    sumarTexto(enlace.despues);
  }
  return trozos;
}

/** Signos que pueden abrir una palabra sin ser parte del enlace: "(ver /votar)". */
const APERTURA = "([¿¡«“‘\"'";

/**
 * Signos que suelen cerrar una frase pegados al enlace: "en /votar." Los tres
 * puntos van tambien como un solo caracter ("…"), que es como los escriben el
 * Word y el telefono: sin eso, "Votá en /votar…" enlazaba a "/votar…", que no
 * existe.
 */
const CIERRE = ".,;:!?…]}»”’\"'";

function enlaceDe(
  palabra: string,
): { antes: string; texto: string; href: string; interno: boolean; despues: string } | null {
  let inicio = 0;
  while (inicio < palabra.length && APERTURA.includes(palabra[inicio])) inicio++;
  const resto = palabra.slice(inicio);
  const nucleo = sinCola(resto);
  if (!nucleo) return null;

  const antes = palabra.slice(0, inicio);
  const despues = resto.slice(nucleo.length);

  if (/^https:\/\//i.test(nucleo)) {
    const href = urlExterna(nucleo);
    return href ? { antes, texto: nucleo, href, interno: false, despues } : null;
  }

  // Una ruta del sitio: "/" seguida de una letra o un numero. La barra sola
  // ("uno / otro") o "/?" no son rutas. "y/o" o "24/7" ni llegan aca: la
  // palabra no empieza con la barra.
  if (nucleo.startsWith("/") && /^\/[\p{L}\p{N}]/u.test(nucleo)) {
    const ruta = rutaInterna(nucleo);
    return ruta ? { antes, texto: nucleo, href: ruta, interno: true, despues } : null;
  }
  return null;
}

/**
 * La palabra sin los signos de cierre del final. Un parentesis de cierre se
 * saca solo si esta de mas: en "(ver /votar)" sobra, pero en una url como
 * https://es.wikipedia.org/wiki/Tucumán_(provincia) es parte de ella.
 */
function sinCola(palabra: string): string {
  let fin = palabra.length;
  while (fin > 0) {
    const ultimo = palabra[fin - 1];
    if (ultimo === ")") {
      const parte = palabra.slice(0, fin);
      const abren = parte.split("(").length - 1;
      const cierran = parte.split(")").length - 1;
      if (cierran <= abren) break;
      fin--;
      continue;
    }
    if (!CIERRE.includes(ultimo)) break;
    fin--;
  }
  return palabra.slice(0, fin);
}

/**
 * La url, si se puede enlazar. Se descartan las que llevan usuario o clave
 * adelante del host: "https://smt.gob.ar@otro.sitio" se lee como el sitio del
 * municipio y lleva a otro lado.
 */
function urlExterna(candidata: string): string | null {
  try {
    const url = new URL(candidata);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}
