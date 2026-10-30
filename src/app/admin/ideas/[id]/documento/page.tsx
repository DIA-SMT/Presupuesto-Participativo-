import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getIdeaAdmin } from "@/db/queries";
import { codigoDePropuesta, formatearFecha } from "@/lib/formato";
import { getSesionAdmin } from "@/lib/sesion";
import DocumentoImprimible from "./documento";

export const metadata = { title: "Propuesta en PDF" };

/**
 * Una propuesta como documento, para bajarla en PDF o imprimirla. Desde 2026
 * las ideas entran solo por el sitio, con CIDITUC: si hace falta el papel de
 * una (para una reunion, para el expediente), sale de aca. Cualquier rol del
 * panel puede verlo: es lo mismo que muestra la ficha.
 */
export default async function DocumentoDeLaPropuesta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const idea = await getIdeaAdmin(id);
  if (!idea) notFound();

  return (
    <div>
      <Link
        href={`/admin?idea=${idea.id}`}
        className="text-sm underline"
        style={{ color: "var(--marca-texto)" }}
      >
        ← Volver a la ficha
      </Link>
      <h1 className="mt-3 text-2xl font-bold">
        {codigoDePropuesta(idea.distrito, idea.numero)} · {idea.titulo}
      </h1>
      <DocumentoImprimible
        datos={{
          titulo: idea.titulo,
          barrio: idea.barrio ?? "",
          distrito: idea.distrito,
          punto: idea.lat !== null && idea.lon !== null ? { lat: idea.lat, lon: idea.lon } : null,
          referenciasUbicacion: idea.referenciasUbicacion ?? "",
          solucion: idea.solucion ?? "",
          problema: idea.problema ?? "",
          beneficios: idea.beneficios ?? "",
          organizacion: idea.organizacion ?? "",
        }}
        propuesta={codigoDePropuesta(idea.distrito, idea.numero)}
        fecha={idea.fecha ? formatearFecha(idea.fecha) : "sin fecha"}
      />
    </div>
  );
}
