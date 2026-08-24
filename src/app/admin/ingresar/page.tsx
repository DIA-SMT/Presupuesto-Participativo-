import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoFlor } from "@/components/Logo";
import { getSesionAdmin } from "@/lib/sesion";
import FormularioIngreso from "./formulario";

export const metadata: Metadata = {
  title: "Acceso del equipo",
  robots: { index: false, follow: false },
};

/**
 * Puerta del backoffice.
 *
 * A esta pantalla llegan dos publicos y solo uno tiene que estar: el equipo del
 * municipio, y algun vecino que siguio el enlace del pie del sitio sin saber
 * que era. Por eso hay tres cosas antes y despues del formulario: de quien es
 * el panel, la salida de vuelta al sitio, y el aviso de que para participar no
 * hace falta ninguna cuenta (el vecino entra con su DNI por CIDITUC).
 *
 * Lo que NO hay, a proposito: ninguna pista sobre que cuentas existen ni como
 * se consigue una. El mensaje de error del formulario tampoco distingue entre
 * correo inexistente y contrasena equivocada (ver `ingresarAdmin` en
 * ../acciones.ts); enumerar cuentas desde aca seria regalar la mitad del
 * trabajo a quien pruebe correos.
 */
export default async function Ingresar() {
  if (await getSesionAdmin()) redirect("/admin");

  return (
    <div className="mx-auto w-full max-w-md">
      {/* Salida clara para quien llego por error: es lo primero que se tabula. */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm hover:underline"
        style={{ color: "var(--texto-suave)" }}
      >
        <span aria-hidden="true">←</span>
        Volver al sitio del Presupuesto Participativo
      </Link>

      <div className="superficie mt-4 rounded-2xl p-8">
        <div className="flex items-center gap-3">
          <LogoFlor tamano={36} />
          <span
            className="text-xs font-semibold uppercase leading-tight tracking-wide"
            style={{ color: "var(--texto-suave)" }}
          >
            <span className="block">Presupuesto Participativo</span>
            <span className="block">San Miguel de Tucumán</span>
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-bold">Acceso del equipo</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Panel de gestión del Presupuesto Participativo, de uso interno del
          equipo de la Municipalidad de San Miguel de Tucumán. Ingresá con el
          correo y la contraseña de tu cuenta del panel.
        </p>

        <FormularioIngreso />
      </div>

      <div
        className="mt-6 rounded-2xl p-5"
        style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
      >
        <p className="text-sm font-semibold">¿Sos vecino o vecina?</p>
        <p className="mt-1.5 text-sm" style={{ color: "var(--texto-suave)" }}>
          Entonces esta pantalla no es para vos, y no te falta ninguna cuenta:
          para presentar una idea o votar se ingresa con tu DNI, no con correo y
          contraseña.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <Link href="/" className="font-medium underline">
            Ir al sitio
          </Link>
          <Link href="/acerca-de" className="font-medium underline">
            Cómo participar
          </Link>
        </p>
      </div>
    </div>
  );
}
