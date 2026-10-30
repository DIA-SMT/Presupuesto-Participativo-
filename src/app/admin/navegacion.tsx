"use client";

/**
 * Cabecera del panel: las secciones agrupadas, la seccion actual marcada y el
 * bloque de la cuenta (nombre, correo, rol, "Mi contraseña" y Salir).
 *
 * Es un componente cliente por una sola razon: layout.tsx es un server
 * component y los layouts NO se vuelven a renderizar al navegar, asi que la
 * ruta leida en el servidor quedaria vieja (lo dice la guia de Next en
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md,
 * "Pathname"). `usePathname` corre en el cliente, que si se re-renderiza en cada
 * navegacion: es la unica via para saber donde estamos parados.
 *
 * No consulta la base ni recibe datos de otras personas: solo el nombre, el
 * correo y el rol de la sesion, que ya vienen resueltos desde layout.tsx.
 *
 * FORMA: una barra de solapas de texto, no una caja con nueve pastillas. El
 * estilo vive en `.solapa` (src/app/globals.css); ahi esta escrito por que se
 * dejaron las pastillas y como queda el contraste. (La bandeja uso estas
 * mismas solapas para filtrar por estado hasta que paso a las tarjetas del
 * panorama, bandeja/panorama.tsx.) Lo que cambio aca:
 *
 * - Los titulos de grupo ("EL PROCESO", "CONTENIDO DEL SITIO"…) ya no se
 *   dibujan: eran tres lineas de texto en mayuscula sostenida arriba de todo,
 *   compitiendo con el titulo de la pantalla. La agrupacion no se perdio, se
 *   volvio invisible: sigue en el `aria-label` de cada lista y en los
 *   separadores, asi que un lector de pantalla la anuncia igual.
 * - El bloque de la cuenta es una pastilla: avatar con las iniciales, nombre,
 *   correo, el rol como etiqueta y dos botones chicos con icono ("Mi
 *   contraseña", Salir). Antes eran dos enlaces subrayados en gris, que no se
 *   veian como botones. Siguen sin competir con las secciones: son de 32 px,
 *   van en el color del texto comun y Salir recien se tiñe al pasar el mouse.
 *   El estilo vive en `.cuenta-panel` y `.boton-cuenta` (globals.css).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { RolAdmin } from "@/db/queries";
import { ETIQUETA_ROL } from "@/lib/formato";
import { salirAdmin } from "./acciones";
import { BotonRecorrido } from "./recorrido/recorrido";

type Enlace = {
  href: string;
  texto: string;
  soloAdmin?: boolean;
  /** No se ofrece a quien solo lee: la pantalla es para escribir. */
  soloEscritura?: boolean;
};

type Seccion = Enlace & { pantallas: Enlace[] };

/**
 * Las secciones del panel: tres, cada una con sus pantallas.
 *
 * Eran seis solapas sueltas en una fila (Propuestas, Tablero, Migue, Etapa del
 * proceso, Contenido, Equipo) y el jefe del programa pidio un panel "mucho mas
 * predictivo": que se sepa donde esta cada cosa sin probar solapa por solapa.
 * Se agruparon por lo que hace el equipo:
 *
 *  - Propuestas: lo de todos los dias. Las tarjetas para evaluar y las
 *    estadisticas de la edicion (el viejo Tablero).
 *  - Proceso: la etapa y el cronograma, y el estado de las obras de los
 *    ganadores (lo que publica Transparencia).
 *  - Equipo: las cuentas del panel.
 *
 * Las rutas NO cambiaron (/admin/tablero sigue siendo el Tablero): los enlaces
 * que el equipo tiene guardados, el recorrido guiado y los redirects de
 * /admin/bandeja siguen andando sin redirigir nada.
 *
 * "Mi contraseña" no esta aca: es de la cuenta, no del proceso, y vive en el
 * bloque de la derecha.
 */
const SECCIONES: Seccion[] = [
  {
    href: "/admin",
    texto: "Propuestas",
    pantallas: [
      { href: "/admin", texto: "Tablero de propuestas" },
      { href: "/admin/tablero", texto: "Estadísticas" },
    ],
  },
  {
    href: "/admin/ediciones",
    texto: "Proceso",
    pantallas: [
      // Para todos los roles: ahi el moderador carga el cronograma y el lector
      // consulta la etapa. La pantalla deja en solo lectura lo que cada rol no
      // puede tocar.
      { href: "/admin/ediciones", texto: "Etapa y cronograma" },
      // Todos la ven; actualizar una obra es de moderador para arriba.
      { href: "/admin/obras", texto: "Obras" },
    ],
  },
  { href: "/admin/equipo", texto: "Equipo", soloAdmin: true, pantallas: [] },
];

/**
 * Si una pantalla es la de `href`. "/admin" es prefijo de todas las rutas del
 * panel, asi que solo vale exacta; las demas valen tambien en sus subrutas.
 * La ficha de una idea se abre adentro de /admin, asi que no hace falta mas.
 */
function estaActivo(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** La seccion es la actual si alguna de sus pantallas lo es. */
function seccionActiva(pathname: string, seccion: Seccion): boolean {
  if (estaActivo(pathname, seccion.href)) return true;
  return seccion.pantallas.some((pantalla) => estaActivo(pathname, pantalla.href));
}

export default function CabeceraPanel({
  nombre,
  email,
  rol,
}: {
  nombre: string;
  email: string;
  rol: RolAdmin;
}) {
  const pathname = usePathname();

  // El layout del panel no se vuelve a dibujar al navegar dentro de el: si la
  // sesion se corta (una baja, un cambio de contrasena desde otra sesion) y la
  // pagina manda al ingreso, la cabecera con el nombre quedaba arriba del
  // formulario de ingreso. En /admin/ingresar nunca hay una sesion que mostrar.
  if (pathname === "/admin/ingresar") return null;

  // Contenido y Equipo no se le ofrecen a quien no los puede usar, ni la carga
  // a quien solo lee. Esconder el enlace es cosmetico: la autorizacion real la
  // hace cada pagina y cada accion releyendo el rol de la base.
  const visible = (enlace: Enlace) =>
    (!enlace.soloAdmin || rol === "admin") && (!enlace.soloEscritura || rol !== "lector");
  const secciones = SECCIONES.filter(visible);
  const actual = secciones.find((seccion) => seccionActiva(pathname, seccion));
  const pantallas = actual?.pantallas.filter(visible) ?? [];

  return (
    <div className="mb-6">
    <div
      className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2"
      style={{ borderBottom: "1px solid var(--borde)" }}
    >
      {/* -mb-px: la linea de la solapa actual se apoya sobre el borde de la
          barra en vez de quedar flotando arriba de el. */}
      <nav className="-mb-px flex flex-wrap items-end" aria-label="Secciones del panel">
        <ul className="flex flex-wrap items-end">
          {secciones.map((seccion) => (
            <li key={seccion.href}>
              <Link
                href={seccion.href}
                aria-current={actual === seccion ? "page" : undefined}
                className="solapa solapa-seccion"
              >
                {seccion.texto}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section data-recorrido="cuenta" aria-label="Tu cuenta" className="cuenta-panel">
        <span className="cuenta-panel-avatar" aria-hidden="true">
          {iniciales(nombre, email)}
        </span>
        <span className="cuenta-panel-datos">
          <span className="cuenta-panel-nombre">{nombre}</span>
          <span className="cuenta-panel-detalle">
            <span className="truncate">{email}</span>
            <span className="cuenta-panel-rol" data-rol={rol}>
              {ETIQUETA_ROL[rol] ?? rol}
            </span>
          </span>
        </span>
        {/*
          Dos botones de 32 px de alto (el criterio 2.5.8 de WCAG 2.2 pide
          24x24 para un control que no esta dentro de una oracion), con icono y
          texto: el icono solo no alcanza para entenderlos, y el texto solo no
          se veia como boton. Salir es un boton de verdad (escribe: cierra la
          sesion en el servidor), por eso va dentro de un form.
        */}
        <span className="cuenta-panel-acciones">
          {/* Vuelve a abrir el recorrido guiado del panel (recorrido/recorrido.tsx). */}
          <BotonRecorrido />
          <Link
            href="/admin/password"
            aria-current={estaActivo(pathname, "/admin/password") ? "page" : undefined}
            className="boton-cuenta"
          >
            <IconoLlave />
            Mi contraseña
          </Link>
          <form action={salirAdmin}>
            <button type="submit" className="boton-cuenta boton-cuenta-salir">
              <IconoSalir />
              Salir
            </button>
          </form>
        </span>
      </section>
    </div>

      {/*
        Las pantallas de la seccion actual, en un selector segmentado con un
        icono por pantalla (`.selector-pantallas`, globals.css). Con una sola
        pantalla no se dibuja: seria repetir la solapa.
      */}
      {pantallas.length > 1 && (
        <nav aria-label={`Pantallas de ${actual?.texto ?? "la sección"}`} className="mt-4">
          <ul className="selector-pantallas">
            {pantallas.map((pantalla) => (
              <li key={pantalla.href}>
                <Link
                  href={pantalla.href}
                  aria-current={estaActivo(pathname, pantalla.href) ? "page" : undefined}
                  className="opcion-pantalla"
                >
                  <IconoPantalla href={pantalla.href} />
                  {pantalla.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/**
 * Las iniciales del avatar: la primera letra de las dos primeras palabras del
 * nombre ("Nombre Apellido" → "NA"). Si el nombre no da ninguna, la del correo.
 */
function iniciales(nombre: string, email: string): string {
  const letras = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0].toUpperCase())
    .join("");
  return letras || email.slice(0, 1).toUpperCase();
}

/**
 * El icono de cada pantalla del selector: una grilla de tarjetas para el
 * tablero, barras para las estadisticas, un calendario para el cronograma y
 * un casco para las obras.
 * Decorativo: el texto va al lado.
 */
function IconoPantalla({ href }: { href: string }) {
  const trazos: Record<string, ReactNode> = {
    "/admin": (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    "/admin/tablero": (
      <>
        <path d="M3 21h18" />
        <path d="M7 17v-6" />
        <path d="M12 17V7" />
        <path d="M17 17v-9" />
      </>
    ),
    "/admin/ediciones": (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </>
    ),
    "/admin/obras": (
      <>
        <path d="M4 18a8 8 0 0 1 16 0" />
        <path d="M2 18h20M10 10V6h4v4" />
      </>
    ),
  };
  const trazo = trazos[href];
  if (!trazo) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {trazo}
    </svg>
  );
}

/** Una llave, para "Mi contraseña". Decorativa: el texto va al lado. */
function IconoLlave() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15 19 4" />
      <path d="m18 5 2 2" />
      <path d="m15 8 2 2" />
    </svg>
  );
}

/** Una puerta con la flecha hacia afuera, para Salir. Decorativa. */
function IconoSalir() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
