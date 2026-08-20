import { redirect } from "next/navigation";
import { getTextos } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelContenido from "./panel";

export default async function AdminContenido() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const textos = await getTextos();

  return (
    <PanelContenido
      soloLectura={sesion.rol === "lector"}
      textos={Object.entries(textos)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, valor]) => ({ clave, valor }))}
    />
  );
}
