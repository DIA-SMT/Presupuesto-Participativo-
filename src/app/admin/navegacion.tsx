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
 * estilo vive en `.solapa` (src/app/globals.css), compartido con la fila de
 * filtros de la bandeja; ahi esta escrito por que se dejaron las pastillas y
 * como queda el contraste. Lo que cambio aca:
 *
 * - Los titulos de grupo ("EL PROCESO", "CONTENIDO DEL SITIO"…) ya no se
 *   dibujan: eran tres lineas de texto en mayuscula sostenida arriba de todo,
 *   compitiendo con el titulo de la pantalla. La agrupacion no se perdio, se
 *   volvio invisible: sigue en el `aria-label` de cada lista y en los
 *   separadores, asi que un lector de pantalla la anuncia igual.
 * - Las acciones de la cuenta ("Mi contraseña", Salir) dejaron de tener el
 *   tamaño de la navegacion. Son enlaces chicos y subrayados: se ven
 *   accionables, pero no compiten con las secciones.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RolAdmin } from "@/db/queries";
import { salirAdmin } from "./acciones";

/** Linea de lo que agrupa pero no se toca: los separadores entre bloques. */
const BORDE_SUAVE = "color-mix(in srgb, var(--texto) 25%, transparent)";

type Enlace = { href: string; texto: string; soloAdmin?: boolean };

type Grupo = { id: string; titulo: string; enlaces: Enlace[] };

/**
 * Las nueve pantallas ordenadas por lo que se hace en cada una, no por orden de
 * llegada. Ya no hay enlace a /admin/bandeja: /admin ES la bandeja de revision.
 * "Mi contraseña" tampoco esta aca: es de la cuenta, no del proceso, y vive en
 * el bloque de la derecha.
 */
const GRUPOS: Grupo[] = [
  {
    id: "grupo-proceso",
    titulo: "El proceso",
    enlaces: [
      { href: "/admin", texto: "Ideas" },
      { href: "/admin/tablero", texto: "Tablero" },
      { href: "/admin/obras", texto: "Obras" },
    ],
  },
  {
    id: "grupo-contenido",
    titulo: "Contenido del sitio",
    enlaces: [
      { href: "/admin/contenido", texto: "Contenido" },
      { href: "/admin/consultas", texto: "Consultas del chat" },
    ],
  },
  {
    id: "grupo-administracion",
    titulo: "Administración",
    enlaces: [
      { href: "/admin/ediciones", texto: "Ediciones", soloAdmin: true },
      { href: "/admin/equipo", texto: "Equipo", soloAdmin: true },
      // Sin soloAdmin: la bitacora la puede leer cualquier rol, incluido lector.
      { href: "/admin/bitacora", texto: "Bitácora" },
    ],
  },
];

const ETIQUETA_ROL: Record<RolAdmin, string> = {
  admin: "Administrador",
  moderador: "Moderador",
  lector: "Lector",
};

/**
 * "/admin" es prefijo de todas las rutas del panel, asi que solo se marca
 * cuando es la ruta exacta. Las demas secciones se marcan tambien en sus
 * subrutas, para que una pantalla de detalle no apague la seccion.
 */
function estaActivo(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
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

  // Las pantallas de administracion no se le ofrecen a quien no las puede
  // usar. Esconder el enlace es cosmetico: la autorizacion real la hace cada
  // pagina y cada accion releyendo el rol de la base.
  const grupos = GRUPOS.map((grupo) => ({
    ...grupo,
    enlaces: grupo.enlaces.filter((enlace) => !enlace.soloAdmin || rol === "admin"),
  })).filter((grupo) => grupo.enlaces.length > 0);

  return (
    <div
      className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-2"
      style={{ borderBottom: "1px solid var(--borde)" }}
    >
      {/* -mb-px: la linea de la solapa actual se apoya sobre el borde de la
          barra en vez de quedar flotando arriba de el. */}
      <nav className="-mb-px flex flex-wrap items-end" aria-label="Secciones del panel">
        {grupos.map((grupo, indice) => (
          <div key={grupo.id} className="flex items-end">
            {/* Separador entre bloques. Es decorativo: lo que agrupa para un
                lector de pantalla es el aria-label de cada lista. En pantallas
                angostas se esconde, porque ahi los bloques se apilan y la linea
                vertical quedaria colgando al principio de la fila. */}
            {indice > 0 && (
              <span
                aria-hidden="true"
                className="mx-2 mb-2.5 hidden h-3.5 w-px shrink-0 sm:block"
                style={{ background: BORDE_SUAVE }}
              />
            )}
            <ul aria-label={grupo.titulo} className="flex flex-wrap items-end">
              {grupo.enlaces.map((enlace) => (
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
          </div>
        ))}
      </nav>

      <section
        aria-label="Tu cuenta"
        className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs"
      >
        <span className="text-sm font-semibold">{nombre}</span>
        <span style={{ color: "var(--texto-suave)" }}>
          {email} · {ETIQUETA_ROL[rol]}
        </span>
        {/*
          py-1.5 y px-1 no son decorativos: con text-xs (12 px de texto y 16 de
          renglon) el area sensible quedaba en 16 px de alto, y el criterio 2.5.8
          de WCAG 2.2 pide 24x24 para un control que no esta dentro de una
          oracion. Con ese relleno queda en 28 px de alto y arriba de 30 de
          ancho. El relleno no mueve la linea de base, asi que siguen alineados
          con el nombre y el correo.
        */}
        <span className="-my-1.5 flex items-baseline gap-x-2">
          <Link
            href="/admin/password"
            aria-current={estaActivo(pathname, "/admin/password") ? "page" : undefined}
            className="px-1 py-1.5 underline"
            style={{ color: "var(--texto-suave)" }}
          >
            Mi contraseña
          </Link>
          {/* Salir es un boton (escribe: cierra la sesion en el servidor) con
              forma de enlace. Va subrayado siempre, no solo al pasar el mouse,
              para que se lea accionable sin depender del color. */}
          <form action={salirAdmin}>
            <button
              type="submit"
              className="px-1 py-1.5 underline"
              style={{ color: "var(--texto-suave)" }}
            >
              Salir
            </button>
          </form>
        </span>
      </section>
    </div>
  );
}
