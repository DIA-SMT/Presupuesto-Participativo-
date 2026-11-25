/**
 * URL publica del sitio, para todo lo que necesita una direccion absoluta:
 * `metadataBase`, la imagen de Open Graph, el sitemap y el robots.
 *
 * Sin esto, en produccion sin `SITE_URL` la base caia en
 * "http://localhost:3000" y las etiquetas og:image apuntaban a localhost: la
 * tarjeta de previsualizacion no se veia en ningun lado, y el sitemap publicaba
 * URLs de localhost. `VERCEL_PROJECT_PRODUCTION_URL` y `VERCEL_URL` los define
 * la plataforma, asi que el sitio funciona incluso si alguien despliega sin
 * configurar la variable.
 *
 * La vuelta del ingreso de CIDITUC NO usa este helper a proposito: se arma
 * sobre la URL con la que llego el pedido (ver la ruta del callback), asi la
 * persona termina en el mismo sitio del que salio aunque SITE_URL este sin
 * configurar o apunte a otro lado.
 */
export function urlDelSitio(): string {
  const configurada = process.env.SITE_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");

  // En Vercel: primero el dominio de produccion, despues el del despliegue.
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}

/**
 * La URL con la que llego el pedido, vista desde afuera: la base de las
 * redirecciones que tienen que dejar a la persona en el mismo sitio del que
 * salio (la vuelta de CIDITUC, la salida).
 *
 * Detras de nginx (la VPS, desde el 25/11/2026) Next escucha en 127.0.0.1 y
 * `request.url` dice http://localhost:3011: la vuelta de CIDITUC mandaba a la
 * persona a su propio celular. nginx pisa X-Forwarded-Host y -Proto con los
 * verdaderos (no agrega a lo que mande el cliente), y Vercel hace lo mismo; en
 * `npm run dev` no vienen y queda `request.url`, con su puerto.
 */
export function urlDelPedido(request: Request): URL {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocolo = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return url;
  // Se arma de cero: asignar solo `host` deja el puerto de adentro (:3011)
  // cuando el de afuera no trae uno.
  const esquema = protocolo === "https" || protocolo === "http" ? protocolo : url.protocol.slice(0, -1);
  const afuera = new URL(`${esquema}://${host}`);
  afuera.pathname = url.pathname;
  afuera.search = url.search;
  return afuera;
}
