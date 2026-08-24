import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getBitacoraEquipo, listarAdmins } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelEquipo from "./panel";

export const metadata: Metadata = {
  title: "Equipo del panel",
  robots: { index: false, follow: false },
};

/**
 * Las fechas se formatean aca, en el servidor, y viajan como texto: si el
 * componente cliente las formateara con el huso del navegador, el HTML de la
 * hidratacion no coincidiria con el que se genero en el servidor.
 */
const fechaYHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Tucuman",
  dateStyle: "short",
  timeStyle: "short",
});

function comoTexto(valor: Date | null): string | null {
  return valor ? fechaYHora.format(valor) : null;
}

export default async function AdminEquipo() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  // El rol de la cookie alcanza para decidir que se muestra; cada escritura lo
  // vuelve a chequear contra la base dentro de la server action.
  if (sesion.rol !== "admin") {
    return (
      <div className="superficie mx-auto max-w-xl rounded-2xl p-8">
        <h1 className="text-xl font-bold">Equipo del backoffice</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Las cuentas del panel las administra únicamente el rol <strong>administrador</strong>. Si
          necesitás dar de alta a alguien, cambiarle el rol o desactivar una cuenta, pedíselo a
          quien administra el panel.
        </p>
        <p className="mt-4 text-sm">
          Tu contraseña la podés cambiar vos desde{" "}
          <a href="/admin/password" className="underline">
            Mi contraseña
          </a>
          .
        </p>
      </div>
    );
  }

  const [cuentas, bitacora] = await Promise.all([listarAdmins(), getBitacoraEquipo(100)]);

  return (
    <PanelEquipo
      yoId={sesion.adminId}
      cuentas={cuentas.map((cuenta) => ({
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        rol: cuenta.rol,
        activo: cuenta.activo,
        ultimoIngreso: comoTexto(cuenta.ultimoIngreso),
        alta: comoTexto(cuenta.createdAt),
      }))}
      bitacora={bitacora.map((fila) => ({
        id: fila.id,
        adminNombre: fila.adminNombre,
        objetivoEmail: fila.objetivoEmail,
        accion: fila.accion,
        rolAnterior: fila.rolAnterior,
        rolNuevo: fila.rolNuevo,
        cuando: fechaYHora.format(fila.createdAt),
      }))}
    />
  );
}
