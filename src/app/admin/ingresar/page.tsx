import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSesionAdmin } from "@/lib/sesion";
import FormularioIngreso from "./formulario";

export const metadata: Metadata = {
  title: "Ingreso al panel",
  robots: { index: false, follow: false },
};

export default async function Ingresar() {
  if (await getSesionAdmin()) redirect("/admin");

  return (
    <div className="contenedor flex min-h-[60vh] items-center justify-center py-16">
      <div className="superficie w-full max-w-md rounded-2xl p-8">
        <h1 className="text-2xl font-bold">Panel de administración</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Acceso para el equipo del Presupuesto Participativo.
        </p>
        <FormularioIngreso />
      </div>
    </div>
  );
}
