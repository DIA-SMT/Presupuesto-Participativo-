import type { NextConfig } from "next";

/**
 * Encabezados de seguridad para todas las respuestas.
 *
 * Son los que no pueden romper nada, elegidos mirando lo que el sitio usa:
 *
 *  - Permissions-Policy: la geolocalizacion queda permitida SOLO para este
 *    origen, porque el formulario de ideas tiene el boton "usar mi ubicación"
 *    (navigator.geolocation en src/components/FormularioIdea.tsx). Camara,
 *    microfono, pagos y USB no los usa nada del sitio y se niegan. La pantalla
 *    completa del mapa (FullscreenControl de MapLibre) no se nombra: su valor
 *    por defecto ya es "solo este origen".
 *  - X-Frame-Options DENY y `frame-ancestors 'none'`: nadie puede meter el
 *    sitio en un iframe. Es la defensa contra el clickjacking sobre el boton de
 *    votar (una pagina que lo tapa con otra cosa y hace que el clic caiga en el).
 *    Van los dos porque los navegadores viejos solo entienden el primero.
 *  - Una Content-Security-Policy MINIMA: frame-ancestors, base-uri, object-src
 *    y form-action. `form-action 'self'` vale porque ningun formulario postea
 *    afuera: son server actions, busquedas GET y el "Salir" del votante, todos
 *    contra este mismo origen; el ingreso con CIDITUC es un enlace, no un
 *    formulario. Lo que NO lleva, a proposito: script-src, style-src,
 *    connect-src ni img-src. MapLibre crea workers desde blobs, las fuentes
 *    vienen de Google y el mapa baja teselas; cualquiera de esas directivas mal
 *    calibrada deja el mapa en blanco o el chat mudo, y eso se nota menos que un
 *    encabezado de mas y se paga mas caro.
 *  - Strict-Transport-Security solo en produccion: en `next dev` el sitio corre
 *    en http://localhost y un HSTS ahi no sirve para nada (el navegador lo
 *    ignora sobre http) salvo para confundir a otro proyecto en el mismo
 *    puerto. Sin includeSubDomains ni preload: no le corresponde a este sitio
 *    decidir por los otros hosts del municipio.
 *
 * `next build` corre con NODE_ENV=production, y ahi queda fijada la lista.
 */
const esProduccion = process.env.NODE_ENV === "production";

const politicaDeContenido = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const encabezadosDeSeguridad = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: politicaDeContenido },
  ...(esProduccion
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // PGlite carga WASM y archivos de datos propios: no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        // `/:path*` incluye la raiz: cero o mas segmentos.
        source: "/:path*",
        headers: encabezadosDeSeguridad,
      },
      {
        // Los GeoJSON son datos abiertos: se cachean y se pueden pedir desde
        // cualquier origen. No choca con la regla de arriba: son otras claves.
        source: "/geo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
