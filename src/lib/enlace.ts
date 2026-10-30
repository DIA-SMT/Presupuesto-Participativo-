/**
 * Si un texto es un link publico que el sitio puede dibujar como enlace: solo
 * https, con un dominio de verdad y sin usuario ni contraseña en la URL. Lo
 * usa `crearAvance` (src/app/admin/acciones.ts) para el link de un avance de
 * obra, que /transparencia muestra en la tarjeta: un "javascript:" o un http
 * plano no pasan.
 */
export function enlaceValido(texto: string): boolean {
  if (texto.length > 500) return false;
  try {
    const url = new URL(texto);
    return (
      url.protocol === "https:" && !url.username && !url.password && url.hostname.includes(".")
    );
  } catch {
    return false;
  }
}
