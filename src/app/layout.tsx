import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import AccesoPanel from "@/components/AccesoPanel";
import AvisoLegal from "@/components/AvisoLegal";
import Chat from "@/components/Chat";
import VentanaAvisoLegal from "@/components/VentanaAvisoLegal";
import { LogoFlor, SelloDireccionIA } from "@/components/Logo";
import { getEdicionActiva, getTextos } from "@/db/queries";
import { urlDelSitio } from "@/lib/sitio";
import { ETIQUETA_ETAPA } from "@/lib/formato";
import { getSesionAdmin } from "@/lib/sesion";

/**
 * Todo el sitio se renderiza a demanda: los datos (votos, avances de obra,
 * etapa del proceso) cambian en la base y las paginas deben reflejarlo.
 * Ademas, PGlite es de proceso unico y no admite el prerender en paralelo del
 * build. Con Supabase en produccion se puede reintroducir cacheo por ruta.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Presupuesto Participativo · San Miguel de Tucumán",
    template: "%s · Presupuesto Participativo SMT",
  },
  // Es la descripcion que muestran Google y las previsualizaciones al compartir
  // el sitio. Decia "proponen, eligen y siguen las obras" y "avance de cada
  // obra": el sitio no tiene ni un avance de obra informado.
  description:
    "Vecinos y vecinas de San Miguel de Tucumán proponen y eligen obras del Presupuesto Participativo. Mapa de los 20 distritos, las ideas presentadas y los proyectos ganadores de cada distrito.",
  metadataBase: new URL(urlDelSitio()),
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Presupuesto Participativo SMT",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#084fc4",
};

const NAVEGACION = [
  { href: "/distritos", texto: "Distritos" },
  { href: "/proyectos", texto: "Proyectos" },
  { href: "/transparencia", texto: "Transparencia" },
  { href: "/acerca-de", texto: "Cómo participar" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /*
   * La sesion del equipo decide cual de los dos accesos al panel se dibuja
   * (ver src/components/AccesoPanel.tsx). Leer la cookie no cambia el cacheo:
   * este layout ya es `force-dynamic` por los datos que muestra, y la guia de
   * Next dice que `cookies()` en un layout solo lleva la ruta a render
   * dinamico
   * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md),
   * que es exactamente donde ya estaba.
   *
   * El `.catch` no es decoracion: `getSesionAdmin()` tira si falta
   * SESSION_SECRET o es corto, y este es el layout raiz de TODO el sitio. Sin
   * el, una variable de entorno mal puesta apaga hasta la portada. Igual que
   * las dos consultas de al lado: si el dato no viene, el sitio sigue en pie
   * sin el acceso.
   */
  const [textos, edicion, sesionEquipo] = await Promise.all([
    getTextos().catch(() => ({}) as Record<string, string>),
    getEdicionActiva().catch(() => null),
    getSesionAdmin().catch(() => null),
  ]);

  /*
   * Solo el correo, que ya viene firmado en la cookie. El nombre completo
   * obligaria a consultar la base en cada pagina publica para una etiqueta
   * decorativa; el panel, adentro, ya muestra nombre, correo y rol.
   */
  const cuentaEquipo = sesionEquipo?.email ?? null;

  return (
    <html lang="es-AR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Noto+Serif:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a href="#contenido" className="salto-contenido">
          Saltar al contenido
        </a>

        <header
          className="sticky top-0 z-30 backdrop-blur"
          style={{
            background: "color-mix(in srgb, var(--fondo) 88%, transparent)",
            borderBottom: "1px solid var(--borde)",
          }}
        >
          <div className="contenedor flex items-center justify-between gap-4 py-3.5">
            <Link href="/" className="flex items-center gap-3">
              <LogoFlor tamano={40} />
              <span className="leading-tight">
                <span className="block text-sm font-bold sm:text-base">
                  Presupuesto Participativo
                </span>
                <span className="block text-xs" style={{ color: "var(--texto-suave)" }}>
                  San Miguel de Tucumán
                </span>
              </span>
            </Link>

            {/* Las secciones del vecino y, aparte, el acceso del equipo
                (Ingresar sin sesion, el atajo al panel con sesion): queda
                FUERA del <nav> porque no es una seccion del sitio. */}
            <div className="flex items-center gap-2">
              <nav aria-label="Secciones del sitio" className="hidden items-center gap-1 md:flex">
                {NAVEGACION.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium transition hover:brightness-95"
                    style={{ color: "var(--texto)" }}
                  >
                    {item.texto}
                  </Link>
                ))}
                {edicion?.etapa === "ideas" && (
                  <Link
                    href="/ideas/nueva"
                    className="ml-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: "var(--color-acento-600)" }}
                  >
                    Presentá tu idea
                  </Link>
                )}
                {edicion?.etapa === "votacion" && (
                  <Link
                    href="/votar"
                    className="ml-2 rounded-xl px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: "var(--color-acento-600)" }}
                  >
                    Votar
                  </Link>
                )}
              </nav>

              <AccesoPanel cuenta={cuentaEquipo} />
            </div>
          </div>

          {/* Navegacion en telefono: barra desplazable, sin menu hamburguesa. */}
          <nav
            aria-label="Secciones del sitio"
            className="flex gap-1 overflow-x-auto px-4 pb-2.5 md:hidden"
          >
            {NAVEGACION.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
              >
                {item.texto}
              </Link>
            ))}
          </nav>
        </header>

        <main id="contenido">{children}</main>

        <footer
          className="mt-16 py-12"
          style={{ background: "var(--fondo-suave)", borderTop: "1px solid var(--borde)" }}
        >
          <div className="contenedor grid gap-8 md:grid-cols-3">
            <div>
              <div className="mb-3 flex items-center gap-2.5">
                <LogoFlor tamano={30} />
                <span className="text-sm font-bold leading-tight">
                  Presupuesto Participativo
                </span>
              </div>
              <p className="text-sm font-bold">
                {textos["contacto-organismo"] ?? "Municipalidad de San Miguel de Tucumán"}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
                {textos["contacto-direccion"] ??
                  "9 de Julio 570, San Miguel de Tucumán, Tucumán T4000IHL, Argentina"}
              </p>
              <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
                {textos["contacto-telefono"] ?? "381 451 6500 int. 6517"}
              </p>
            </div>

            <div>
              <p className="text-sm font-bold">El programa</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {[
                  ...NAVEGACION,
                  { href: "/reglamento", texto: "Reglamento" },
                  { href: "/archivo", texto: "Archivo de ediciones" },
                  { href: "/ideas/seguimiento", texto: "Seguí tu idea" },
                  { href: "/privacidad", texto: "Política de privacidad" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="hover:underline" style={{ color: "var(--texto-suave)" }}>
                      {item.texto}
                    </Link>
                  </li>
                ))}
                {/* Fuera de la lista de arriba porque no es una ruta: es un
                    boton que abre el aviso en una ventana centrada con su
                    propio scroll (src/components/VentanaAvisoLegal.tsx). El
                    texto entra como children ya renderizado en el servidor. */}
                <li>
                  <VentanaAvisoLegal>
                    <AvisoLegal textos={textos} />
                  </VentanaAvisoLegal>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-bold">Datos abiertos</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li>
                  <a
                    href="/geo/distritos.geojson"
                    className="hover:underline"
                    style={{ color: "var(--texto-suave)" }}
                  >
                    Distritos en GeoJSON
                  </a>
                </li>
                <li>
                  <a
                    href="/api/proyectos"
                    className="hover:underline"
                    style={{ color: "var(--texto-suave)" }}
                  >
                    Proyectos en JSON
                  </a>
                </li>
              </ul>
              {edicion && (
                <p className="mt-4 text-xs" style={{ color: "var(--texto-suave)" }}>
                  Edición {edicion.anio} · {ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}
                </p>
              )}
            </div>
          </div>

          {/* Autoria: cierra todas las paginas del sitio. */}
          <div
            className="contenedor mt-10 pt-8"
            style={{ borderTop: "1px solid var(--borde)" }}
          >
            <SelloDireccionIA />
          </div>
        </footer>

        <Chat
          bienvenida={
            textos["chat-bienvenida"] ??
            "Hola. Puedo responderte sobre los proyectos del Presupuesto Participativo."
          }
        />
      </body>
    </html>
  );
}
