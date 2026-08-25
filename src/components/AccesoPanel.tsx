"use client";

/**
 * La unica puerta al backoffice desde el sitio publico. Hasta ahora al panel se
 * llegaba escribiendo /admin en la barra de direcciones.
 *
 * Son dos accesos distintos porque son dos personas distintas, y la diferencia
 * es deliberada:
 *
 *  - `lugar="pie"`, SIN sesion del equipo: un enlace discreto al pie, "Acceso
 *    del equipo municipal". Va al pie y NO al encabezado a proposito: el
 *    encabezado es del vecino, y un boton de "Ingresar" ahi le hace creer que
 *    necesita usuario y contrasena para mirar el sitio o para votar. No los
 *    necesita: para participar entra con su DNI por CIDITUC, que es otra cosa
 *    (cookie pp_votante, sin contrasena). De ahi que el texto del enlace nombre
 *    al equipo municipal y no diga solo "Ingresar".
 *
 *  - `lugar="encabezado"`, CON sesion del equipo: ahi si un atajo visible, con
 *    la cuenta a la vista. Quien tiene la cookie pp_admin es del equipo y
 *    quiere llegar rapido. Lo ve cualquier rol: adentro, cada pantalla y cada
 *    accion releen el rol de la base y recortan lo que se puede hacer.
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
  lugar,
  cuenta,
}: {
  lugar: "encabezado" | "pie";
  /** Correo de la sesion del equipo, o null si no hay sesion. */
  cuenta: string | null;
}) {
  const pathname = usePathname();
  if (estaEnElPanel(pathname)) return null;

  if (lugar === "encabezado") {
    // Sin sesion no hay atajo en el encabezado: el vecino no tiene nada que
    // hacer con el panel. Su puerta es el enlace del pie.
    if (!cuenta) return null;
    return <AtajoAlPanel cuenta={cuenta} />;
  }

  // Con sesion el enlace del pie sobra: el atajo del encabezado ya lleva al
  // panel, y /admin/ingresar redirige a /admin de todos modos.
  if (cuenta) return null;
  return <EnlaceDelEquipo />;
}

/**
 * Atajo del encabezado. No entra en el `<nav>` de las secciones del sitio ni
 * se pinta como esas pastillas: es una herramienta interna, no una seccion mas.
 * El borde punteado y el icono de controles lo dicen sin depender del color,
 * y el borde usa --borde-control porque delimita un control (WCAG 1.4.11 pide
 * 3:1, y --borde queda en 1.2:1).
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

/**
 * Enlace del pie. Discreto a proposito: mismo tamano y mismo color que la
 * letra chica que lo rodea, sin forma de boton. No dice "Ingresar" solo,
 * porque el vecino no tiene que preguntarse si eso es para el.
 *
 * `rel="nofollow"` acompana al `robots: noindex` de /admin/ingresar: la puerta
 * del backoffice no tiene por que estar en un buscador.
 */
function EnlaceDelEquipo() {
  return (
    <p className="mt-8 text-center text-xs" style={{ color: "var(--texto-suave)" }}>
      <Link href="/admin/ingresar" rel="nofollow" className="hover:underline">
        Acceso del equipo municipal
      </Link>
    </p>
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
