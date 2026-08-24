import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSesionAdmin } from "@/lib/sesion";
import FormularioPassword from "./formulario";

export const metadata: Metadata = {
  title: "Mi contraseña",
  robots: { index: false, follow: false },
};

export default async function AdminPassword() {
  // Cualquier rol puede cambiar su propia contrasena: la accion trabaja siempre
  // sobre la cuenta de la sesion, nunca sobre otra.
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Mi contraseña</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Estás cambiando la contraseña de tu cuenta ({sesion.email}). En la base se guarda solo un
        hash: ni quien administra el panel puede ver tu contraseña.
      </p>

      <div className="superficie mt-6 rounded-2xl p-6">
        <FormularioPassword />
      </div>

      <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
        Si entraste con una contraseña provisoria, cambiala acá: hasta que lo hagas, el panel te la
        va a seguir pidiendo. En ese caso podés dejar vacío el campo de la contraseña actual.
      </p>
    </div>
  );
}
