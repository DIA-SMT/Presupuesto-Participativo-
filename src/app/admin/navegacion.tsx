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
import type { RolAdmin } from "@/db/queries";
import { ETIQUETA_ROL } from "@/lib/formato";
import { salirAdmin } from "./acciones";

type Enlace = { href: string; texto: string; soloAdmin?: boolean };

/**
 * Las pantallas del panel.
 *
 * Eran nueve, agrupadas en tres bloques con separadores. El panel se recorto a
 * lo que el equipo hace de verdad —leer las propuestas, evaluarlas y
 * exportarlas— y se fueron los grupos, sus titulos y la linea que los
 * separaba. Con las que volvieron en la Fase 2 siguen siendo pocas, en una
 * sola fila.
 *
 * "Mi contraseña" no esta aca: es de la cuenta, no del proceso, y vive en el
 * bloque de la derecha. Tampoco hay enlace a /admin/bandeja: /admin ES la
 * bandeja de revision.
 */
const ENLACES: Enlace[] = [
  { href: "/admin", texto: "Propuestas" },
  { href: "/admin/tablero", texto: "Tablero" },
  { href: "/admin/migue", texto: "Migue" },
  // Para todos los roles: ahi el moderador carga el cronograma y el lector
  // consulta la etapa. La pantalla deja en solo lectura lo que cada rol no
  // puede tocar. Era solo para admin de cuando la pantalla era solo la etapa, y
  // el cronograma de los moderadores quedaba escondido.
  { href: "/admin/ediciones", texto: "Etapa del proceso" },
  // Volvieron en la Fase 2 (se habian sacado en 98d0f8d): sin ellas, dar de alta
  // a un evaluador o cargar el reglamento se hacia por consola contra
  // produccion. Solo admin: no son tareas de todos los dias.
  { href: "/admin/contenido", texto: "Contenido", soloAdmin: true },
  { href: "/admin/equipo", texto: "Equipo", soloAdmin: true },
];

/**
 * "/admin" es prefijo de todas las rutas del panel, asi que solo se marca
 * cuando es la ruta exacta. Las demas secciones se marcan tambien en sus
 * subrutas, para que una pantalla de detalle no apague la seccion.
 */
function estaActivo(pathname: string, href: string): boolean {
  // "Propuestas" es la bandeja y tambien lo que se hace desde ella: cargar una
  // idea (/admin/ideas/nueva) no es otra seccion, y sin esto ninguna solapa
  // quedaba marcada en esa pantalla.
  if (href === "/admin") return pathname === "/admin" || pathname.startsWith("/admin/ideas/");
  return pathname === href || pathname.startsWith(`${href}/`);
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

  // Contenido y Equipo no se le ofrecen a quien no los puede usar. Esconder
  // el enlace es cosmetico: la autorizacion real la hace cada pagina y cada
  // accion releyendo el rol de la base.
  const enlaces = ENLACES.filter((enlace) => !enlace.soloAdmin || rol === "admin");

  return (
    <div
      className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-2"
      style={{ borderBottom: "1px solid var(--borde)" }}
    >
      {/* -mb-px: la linea de la solapa actual se apoya sobre el borde de la
          barra en vez de quedar flotando arriba de el. */}
      <nav className="-mb-px flex flex-wrap items-end" aria-label="Secciones del panel">
        <ul className="flex flex-wrap items-end">
          {enlaces.map((enlace) => (
            <li key={enlace.href}>
              <Link
                href={enlace.href}
                aria-current={estaActivo(pathname, enlace.href) ? "page" : undefined}
                className="solapa"
              >
                {enlace.texto}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="Tu cuenta" className="cuenta-panel">
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
