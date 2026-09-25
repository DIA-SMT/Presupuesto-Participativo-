/**
 * Que enlaces de una respuesta del chat se dibujan como enlace.
 *
 * La respuesta del modelo es contenido no confiable (ver src/components/Chat.tsx)
 * y el widget solo convierte en enlace las rutas INTERNAS del sitio: el
 * asistente deriva a /proyectos, /distritos y compañia, nunca afuera. Las urls
 * externas se muestran como texto, sin clic.
 *
 * El filtro de antes era "empieza con /", y eso deja pasar dos formas de salir
 * del sitio que el navegador entiende como otro dominio:
 *
 *   //ejemplo.com/phishing   url relativa al protocolo: https://ejemplo.com
 *   /\ejemplo.com/phishing   el navegador toma la barra invertida como "/"
 *
 * Asi que ademas de mirar el comienzo se resuelve la url contra un origen de
 * mentira y se exige que el resultado siga en ese origen. Es la prueba que no
 * depende de conocer cada truco del parser de urls del navegador.
 */

/** Origen ficticio para resolver rutas relativas. `.invalid` no existe (RFC 2606). */
const ORIGEN_PROPIO = "https://sitio.invalid";

/**
 * La ruta, si es interna del sitio; `null` si no lo es o si no se puede estar
 * seguro. Devuelve la ruta tal cual vino, no la resuelta: lo que se valida es
 * que no sale del sitio, no se la reescribe.
 */
export function rutaInterna(url: string): string | null {
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  // Barras invertidas, espacios y caracteres de control: el parser de urls
  // saca o reinterpreta varios ("/\t/x" termina siendo "//x"). Ninguna ruta
  // del sitio los necesita, asi que no se discute caso por caso.
  if (/[\\\s]/.test(url) || [...url].some(esDeControl)) return null;
  try {
    return new URL(url, ORIGEN_PROPIO).origin === ORIGEN_PROPIO ? url : null;
  } catch {
    return null;
  }
}

/** Caracteres de control ASCII. Sin regex: `no-control-regex` los prohibe ahi. */
function esDeControl(caracter: string): boolean {
  const codigo = caracter.charCodeAt(0);
  return codigo < 0x20 || codigo === 0x7f;
}
