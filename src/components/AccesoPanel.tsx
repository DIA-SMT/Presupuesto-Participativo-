"use client";

/**
 * La unica puerta al backoffice desde el sitio publico, a la derecha del
 * encabezado. Segun haya o no sesion del equipo:
 *
 *  - SIN sesion: el boton "Ingresar", que lleva a /admin/ingresar. Estuvo
 *    primero al pie, en letra chica, para no hacerle creer al vecino que
 *    necesita usuario y contrasena para mirar el sitio o votar (no los
 *    necesita: para participar entra con su DNI por CIDITUC, sin contrasena).
 *    Pero al pie no lo encontraba nadie, empezando por el propio equipo, y
 *    Lucas pidio el boton a la vista en el encabezado (26/08/2026). La
 *    confusion posible la desarma la pantalla de destino: /admin/ingresar dice
 *    a quien esta dirigida.
 *
 *  - CON sesion: el atajo al panel con la cuenta a la vista. Quien tiene la
 *    cookie pp_admin es del equipo y quiere llegar rapido. Lo ve cualquier
 *    rol: adentro, cada pantalla y cada accion releen el rol de la base y
 *    recortan lo que se puede hacer.
 *
 * Por que es un componente cliente
 * --------------------------------
 * src/app/layout.tsx es el layout raiz de TODO el sitio, /admin incluido, asi
 * que sin este filtro el acceso se dibujaria tambien encima del panel, que ya
 * tiene su propia cabecera con navegacion, cuenta y boton de salir. Un layout
 * no puede leer la ruta: no se vuelve a renderizar al navegar y el valor
 * quedaria viejo, y la guia de Next lo dice explicito
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md,
 * "Reading the current URL from a Server Component is not supported").
 * `usePathname` en el cliente es la via documentada, la misma que ya usa
 * src/app/admin/navegacion.tsx para marcar la seccion activa.
 *
 * Solo recibe el correo de la propia sesion, que layout.tsx ya resolvio: este
 * componente no consulta la base ni ve datos de otras personas.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Prefijo de todo el backoffice, incluida la pantalla de ingreso. */
const RUTA_PANEL = "/admin";

/** Adentro del panel no se ofrece la puerta del panel. */
function estaEnElPanel(pathname: string): boolean {
  return pathname === RUTA_PANEL || pathname.startsWith(`${RUTA_PANEL}/`);
}

export default function AccesoPanel({
  cuenta,
}: {
  /** Correo de la sesion del equipo, o null si no hay sesion. */
  cuenta: string | null;
}) {
  const pathname = usePathname();
  if (estaEnElPanel(pathname)) return null;
  return cuenta ? <AtajoAlPanel cuenta={cuenta} /> : <BotonIngresar />;
}

/**
 * El boton de ingreso. No entra en el `<nav>` de las secciones ni se pinta
 * como esas pastillas: es una puerta, no una seccion del sitio. Secundario a
 * proposito (borde y fondo de tarjeta, como los botones secundarios del
 * hero): el protagonista del encabezado sigue siendo el llamado de la etapa
 * ("Presenta tu idea" / "Votar"), no el login.
 *
 * `rel="nofollow"` acompana al `robots: noindex` de /admin/ingresar: la puerta
 * del backoffice no tiene por que estar en un buscador.
 */
function BotonIngresar() {
  return (
    <Link
      href="/admin/ingresar"
      rel="nofollow"
      className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition hover:brightness-95 sm:py-1.5"
      style={{
        background: "var(--fondo-tarjeta)",
        border: "1px solid var(--borde-control)",
        color: "var(--color-marca-700)",
      }}
    >
      <IconoPersona />
      Ingresar
    </Link>
  );
}

/**
 * Atajo del encabezado con sesion. El borde punteado y el icono de controles
 * dicen "herramienta interna" sin depender del color, y el borde usa
 * --borde-control porque delimita un control (WCAG 1.4.11 pide 3:1, y --borde
 * queda en 1.2:1).
 *
 * En telefono queda solo el icono: el encabezado ya lleva el logo con dos
 * lineas de texto y el correo no entra sin empujar todo. El `aria-label` fijo
 * hace que el nombre accesible sea el mismo en los dos tamanos.
 */
function AtajoAlPanel({ cuenta }: { cuenta: string }) {
  return (
    <Link
      href="/admin"
      aria-label={`Panel de gestión, sesión de ${cuenta}`}
      className="flex shrink-0 items-center gap-2 rounded-xl p-2 transition hover:brightness-95 sm:px-3 sm:py-1.5"
      style={{
        background: "var(--fondo-suave)",
        border: "1px dashed var(--borde-control)",
        color: "var(--texto)",
      }}
    >
      <IconoControles />
      <span className="hidden leading-tight sm:block">
        <span className="block text-xs font-semibold">Panel de gestión</span>
        <span className="block text-[0.6875rem]" style={{ color: "var(--texto-suave)" }}>
          {cuenta}
        </span>
      </span>
    </Link>
  );
}

/** Silueta de persona: dice "cuenta", el gesto universal del login. */
function IconoPersona() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.5-3.4 4.2-5 7.5-5s6 1.6 7.5 5" />
    </svg>
  );
}

/** Perillas de control: dice "herramienta", no "seccion del sitio". */
function IconoControles() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3" />
      <path d="M1.5 15h5M9.5 8h5M17.5 17h5" />
    </svg>
  );
}
