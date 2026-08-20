import Link from "next/link";
import type { Metadata } from "next";
import { Vacio } from "@/components/ui";
import { getEdiciones } from "@/db/queries";
import { ETIQUETA_ETAPA } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Archivo de ediciones",
  description:
    "Ediciones anteriores del Presupuesto Participativo de San Miguel de Tucumán y sus proyectos.",
};

export default async function Archivo() {
  const ediciones = await getEdiciones();

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Archivo de ediciones</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Cada edición del programa queda publicada con todas sus ideas, su votación y el avance de
          las obras. Nada se borra al empezar una edición nueva.
        </p>
      </header>

      {ediciones.length ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ediciones.map((edicion) => (
            <li key={edicion.id} className="superficie rounded-2xl p-6">
              <p className="text-3xl font-bold">{edicion.anio}</p>
              <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
                {ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}
              </p>
              <Link
                href="/proyectos"
                className="mt-4 inline-block text-sm font-semibold underline"
              >
                Ver los proyectos
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8">
          <Vacio>Todavía no hay ediciones cargadas.</Vacio>
        </div>
      )}
    </div>
  );
}
