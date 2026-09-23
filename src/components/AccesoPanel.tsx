"use client";

/**
 * Atajo al backoffice a la derecha del encabezado, solo para quien ya tiene
 * sesion del equipo:
 *
 *  - SIN sesion: nada. El panel no se anuncia en el sitio publico: se entra
 *    escribiendo /admin en la barra de direcciones. Hubo un boton "Ingresar"
 *    que llevaba a /admin/ingresar (primero al pie y desde el 26/08/2026 en el
 *    encabezado), y Lucas pidio sacarlo el 23/09/2026: el vecino lo tomaba
 *    como SU ingreso, y el suyo es con CIDITUC, en /ingresar.
 *
 *  - CON sesion: el atajo al panel con la cuenta a la vista. Quien tiene la
 *    cookie pp_admin es del equipo y quiere llegar rapido; un vecino nunca lo
 *    ve. Lo ve cualquier rol: adentro, cada pantalla y cada accion releen el
 *    rol de la base y recortan lo que se puede hacer.
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
  return cuenta ? <AtajoAlPanel cuenta={cuenta} /> : null;
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
