import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSesionAdmin } from "@/lib/sesion";
import FormularioPassword from "./formulario";

export const metadata: Metadata = {
  title: "Mi contraseña",
  robots: { index: false, follow: false },
};

/**
 * Cambio de la propia contrasena. Cualquier rol puede: la accion trabaja
 * siempre sobre la cuenta de la sesion, nunca sobre otra.
 *
 * Es la unica pantalla del panel que atiende a una cuenta con la contrasena
 * provisoria sin cambiar (por eso `permitirPasswordProvisoria`): todas las
 * demas la mandan aca. En ese caso la pantalla lo dice primero y no pide la
 * contrasena actual, que la eligio otra persona.
 *
 * Cuando la persona elige su contrasena, la accion reemite la cookie y Next
 * vuelve a dibujar esta pagina con la sesion nueva, ya sin la provisoria. El
 * formulario queda en el mismo lugar del arbol en los dos casos (cambian el
 * aviso de arriba y la nota de abajo, no lo que lo rodea), asi que React lo
 * conserva y sigue mostrando el mensaje de exito.
 */
export default async function AdminPassword() {
  const sesion = await getSesionAdmin({ permitirPasswordProvisoria: true });
  if (!sesion) redirect("/admin/ingresar");

  const provisoria = sesion.debeCambiarPassword;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">
        {provisoria ? "Elegí tu contraseña" : "Mi contraseña"}
      </h1>
      {provisoria ? (
        <div
          role="alert"
          className="mt-3 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
            border: "1px solid var(--color-acento-600)",
          }}
        >
          Entraste con una contraseña provisoria, que eligió otra persona. Antes de usar el panel
          tenés que cambiarla por una propia: hasta que lo hagas, cualquier otra pantalla te trae de
          vuelta acá.
        </div>
      ) : (
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Estás cambiando la contraseña de tu cuenta ({sesion.email}). En la base se guarda solo un
          hash: ni quien administra el panel puede ver tu contraseña.
        </p>
      )}

      <div className="superficie mt-6 rounded-2xl p-6">
        <FormularioPassword provisoria={provisoria} />
      </div>

      {/* Va despues del formulario a proposito: aparecer o no, no mueve al
          formulario de su lugar en el arbol. */}
      {!provisoria && (
        <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
          Al cambiarla se cierran las sesiones que tengas abiertas en otras computadoras o
          teléfonos; en esta seguís adentro. Si no te acordás de tu contraseña, pedile a un
          administrador que te la restablezca desde Equipo.
        </p>
      )}
    </div>
  );
}
