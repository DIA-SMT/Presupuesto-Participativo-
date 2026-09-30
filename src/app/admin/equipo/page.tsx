import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listarBitacoraEquipo, listarCuentasEquipo } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelEquipo from "./panel";

export const metadata: Metadata = {
  title: "Equipo del panel",
  robots: { index: false, follow: false },
};

/**
 * Cuantos movimientos de la bitacora se muestran. El equipo es chico y la
 * bitacora crece de a pocas filas por mes: 100 cubren mucho mas que la edicion
 * en curso.
 */
const MOVIMIENTOS_VISIBLES = 100;

/**
 * Las fechas se formatean aca, en el servidor, y viajan como texto: si el
 * componente cliente las formateara, el ICU del navegador puede escribirlas
 * distinto que el de Node y la hidratacion no coincidiria. El formato es el
 * del historial de la bandeja (25/09/2026, 10:59), para que las dos bitacoras
 * se lean igual.
 */
const fechaYHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

function comoTexto(valor: Date | null): string | null {
  return valor ? fechaYHora.format(valor) : null;
}

/**
 * Equipo del panel: alta de cuentas, roles, bajas, contrasenas provisorias y la
 * bitacora de todo eso. Volvio en la Fase 2 (se habia sacado en 98d0f8d): sin
 * esta pantalla, dar de alta a un evaluador se hacia con `npm run crear-admin`
 * contra produccion desde una notebook.
 *
 * Solo el rol admin la ve. Esconder el enlace en la navegacion es cosmetico: el
 * chequeo real es este, con el rol que `getSesionAdmin` relee de la base en
 * este mismo pedido (no el de la cookie), y cada accion lo vuelve a exigir.
 * Para los otros roles no se consulta nada: ni la lista de cuentas ni la
 * bitacora salen de la base.
 */
export default async function AdminEquipo() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  if (sesion.rol !== "admin") {
    return (
      <div className="superficie mx-auto max-w-xl rounded-2xl p-8">
        <h1 className="text-xl font-bold">Equipo del panel</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Las cuentas del panel las administra únicamente el rol <strong>administrador</strong>. Si
          necesitás dar de alta a alguien, cambiarle el rol, desactivar una cuenta o restablecer una
          contraseña, pedíselo a quien administra el panel.
        </p>
        <p className="mt-4 text-sm">
          Tu contraseña la podés cambiar vos desde{" "}
          <Link href="/admin/password" className="underline">
            Mi contraseña
          </Link>
          .
        </p>
      </div>
    );
  }

  const [cuentas, bitacora] = await Promise.all([
    listarCuentasEquipo(),
    listarBitacoraEquipo(MOVIMIENTOS_VISIBLES),
  ]);

  return (
    <PanelEquipo
      yoId={sesion.adminId}
      cuentas={cuentas.map((cuenta) => ({
        id: cuenta.id,
        email: cuenta.email,
        nombre: cuenta.nombre,
        rol: cuenta.rol,
        activo: cuenta.activo,
        debeCambiarPassword: cuenta.debeCambiarPassword,
        ultimoIngreso: comoTexto(cuenta.ultimoIngreso),
        alta: comoTexto(cuenta.createdAt),
      }))}
      bitacora={bitacora.map((fila) => ({
        id: fila.id,
        adminNombre: fila.adminNombre,
        objetivoEmail: fila.objetivoEmail,
        accion: fila.accion,
        // "cambio_password" es la misma accion en la tabla cuando la persona
        // cambia la suya y cuando otra se la restablece: la diferencia es
        // quien la firmo.
        propia: fila.adminId !== null && fila.adminId === fila.objetivoId,
        rolAnterior: fila.rolAnterior,
        rolNuevo: fila.rolNuevo,
        cuando: fechaYHora.format(fila.createdAt),
      }))}
      limiteBitacora={MOVIMIENTOS_VISIBLES}
    />
  );
}
