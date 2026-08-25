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
 * Los redirects de autenticacion NO usan este helper a proposito: el
 * `redirect_uri` de CIDITUC esta registrado en el proveedor y tiene que ser
 * exactamente el configurado, no uno adivinado del entorno.
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
