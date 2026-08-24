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
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RolAdmin } from "@/db/queries";
import { salirAdmin } from "./acciones";

/**
 * Borde de los controles del panel (los enlaces con forma de boton y el bloque
 * de la cuenta).
 *
 * Medido antes de tocarlo: el chip pintado con --fondo-tarjeta sobre el
 * contenedor --fondo-suave daba 1.04:1 en oscuro y 1.07:1 en claro, y el borde
 * --borde sobre el chip 1.31:1 y 1.23:1; o sea que los enlaces se leian como
 * texto flotando y no como botones. El criterio 1.4.11 de WCAG pide 3:1 para el
 * borde que delimita un control. Con --texto al 55% el borde queda en 3.8:1
 * sobre el chip y 3.5:1 sobre el contenedor en claro, y arriba de 4,5:1 en
 * oscuro. Sale del mismo token del tema, asi que sigue solo al modo claro y al
 * oscuro: no hay un color nuevo que mantener.
 */
/** Borde de un control: el token vive en src/app/globals.css (WCAG 1.4.11). */
const BORDE_CONTROL = "var(--borde-control)";

/** Borde/linea de lo que agrupa pero no se toca: separadores y chip del rol. */
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
      className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 rounded-2xl px-5 py-4"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
    >
      <nav
        className="flex flex-wrap items-stretch gap-x-2 gap-y-3"
        aria-label="Secciones del panel"
      >
        {grupos.map((grupo, indice) => (
          <div key={grupo.id} className="flex items-stretch gap-4">
            {/* Separador entre bloques. Es decorativo: lo que agrupa para un
                lector de pantalla es el titulo de cada lista. En pantallas
                angostas se esconde, porque ahi los bloques se apilan y la linea
                vertical quedaria colgando al principio de la fila. */}
            {indice > 0 && (
              <span
                aria-hidden="true"
                className="hidden w-px shrink-0 sm:block"
                style={{ background: BORDE_SUAVE }}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <span
                id={grupo.id}
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--texto-suave)" }}
              >
                {grupo.titulo}
              </span>
              <ul aria-labelledby={grupo.id} className="flex flex-wrap items-center gap-1.5">
                {grupo.enlaces.map((enlace) => (
                  <li key={enlace.href}>
                    <EnlaceSeccion
                      href={enlace.href}
                      activo={estaActivo(pathname, enlace.href)}
                      texto={enlace.texto}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </nav>

      <section aria-labelledby="grupo-cuenta" className="flex flex-col gap-1.5">
        <span
          id="grupo-cuenta"
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--texto-suave)" }}
        >
          Tu cuenta
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1">
            <span className="block text-sm font-semibold leading-tight">{nombre}</span>
            <span className="block text-xs leading-tight" style={{ color: "var(--texto-suave)" }}>
              {email}
            </span>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              background: "var(--fondo-tarjeta)",
              border: `1px solid ${BORDE_SUAVE}`,
              color: "var(--texto-suave)",
            }}
          >
            {ETIQUETA_ROL[rol]}
          </span>
          <EnlaceSeccion
            href="/admin/password"
            activo={estaActivo(pathname, "/admin/password")}
            texto="Mi contraseña"
          />
          <form action={salirAdmin}>
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium hover:brightness-95"
              style={{
                background: "var(--fondo-tarjeta)",
                border: `1px solid ${BORDE_CONTROL}`,
                color: "var(--texto)",
              }}
            >
              Salir
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

/**
 * Enlace a una seccion. La seccion activa no se distingue solo por el color:
 * invierte el relleno (pastilla llena con texto blanco, en vez de contorno con
 * texto oscuro) y sube el peso de la tipografia, asi que se sigue viendo en
 * escala de grises. `aria-current="page"` lo dice tambien en palabras.
 */
function EnlaceSeccion({
  href,
  texto,
  activo,
}: {
  href: string;
  texto: string;
  activo: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`block rounded-lg px-3 py-1.5 text-sm ${
        activo ? "font-semibold" : "font-medium hover:brightness-95"
      }`}
      style={
        activo
          ? {
              background: "var(--color-marca-700)",
              border: "1px solid var(--color-marca-700)",
              color: "#fff",
            }
          : {
              background: "var(--fondo-tarjeta)",
              border: `1px solid ${BORDE_CONTROL}`,
              color: "var(--texto)",
            }
      }
    >
      {texto}
    </Link>
  );
}
