import type { Metadata } from "next";
import FormularioIdea from "@/components/FormularioIdea";
import { Aviso } from "@/components/ui";
import { getCategorias, getEdicionActiva, getTextos } from "@/db/queries";
import { ETIQUETA_ETAPA, formatearRango } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Presentá tu idea",
  description:
    "Cargá tu propuesta para el Presupuesto Participativo de San Miguel de Tucumán. Marcá el lugar en el mapa y el distrito se completa solo.",
};

export default async function NuevaIdea() {
  const edicion = await getEdicionActiva();
  const [textos, categorias] = await Promise.all([getTextos(), getCategorias()]);

  const abierta = edicion?.etapa === "ideas";

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {textos["ideas-nueva-titulo"] ?? "Presentá tu idea"}
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {textos["ideas-nueva-subtitulo"]}
        </p>
      </header>

      {!abierta && edicion && (
        <div className="mt-6 max-w-3xl">
          <Aviso tono="atencion">
            <strong>
              La etapa de presentación de ideas de la edición {edicion.anio} está cerrada.
            </strong>{" "}
            Hoy el programa está en {(ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa).toLowerCase()}.
            {edicion.ideasDesde && (
              <> La etapa de ideas fue {formatearRango(edicion.ideasDesde, edicion.ideasHasta)}.</>
            )}{" "}
            Cuando se abra la próxima edición vas a poder cargar tu propuesta desde acá.
          </Aviso>
        </div>
      )}

      <FormularioIdea categorias={categorias} abierta={abierta} />
    </div>
  );
}
