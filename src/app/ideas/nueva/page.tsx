import type { Metadata } from "next";
import FormularioIdea from "@/components/FormularioIdea";
import { Aviso } from "@/components/ui";
import { getCategorias, getEdicionActiva, getTextos } from "@/db/queries";
import { ETIQUETA_ETAPA, formatearRango } from "@/lib/formato";
import { hayClave } from "@/lib/modelo";
import { puedeCargarFueraDeEtapa } from "@/lib/modo-prueba";

export const metadata: Metadata = {
  title: "Presentá tu idea",
  description:
    "Cargá tu propuesta para el Presupuesto Participativo de San Miguel de Tucumán. Marcá el lugar en el mapa y el distrito se completa solo.",
};

export default async function NuevaIdea() {
  const edicion = await getEdicionActiva();
  const [textos, categorias] = await Promise.all([getTextos(), getCategorias()]);

  /*
   * La etapa manda para el vecino. El equipo (o MODO_PRUEBA_IDEAS=1) puede
   * cargar igual para recorrer el circuito completo y mostrarlo: el por que
   * esta en src/lib/modo-prueba.ts. Los dos casos se distinguen para poder
   * decirlo en pantalla, que es lo que evita que una demostracion se confunda
   * con una carga real.
   */
  const enEtapa = edicion?.etapa === "ideas";
  const porPrueba = !enEtapa && (await puedeCargarFueraDeEtapa());
  const abierta = enEtapa || porPrueba;

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

      {!enEtapa && edicion && (
        <div className="mt-6 max-w-3xl">
          <Aviso tono="atencion">
            <strong>
              La etapa de presentación de ideas de la edición {edicion.anio} está cerrada.
            </strong>{" "}
            Hoy el programa está en {(ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa).toLowerCase()}.
            {edicion.ideasDesde && (
              <> La etapa de ideas fue {formatearRango(edicion.ideasDesde, edicion.ideasHasta)}.</>
            )}{" "}
            {porPrueba ? (
              <>
                El formulario está habilitado en <strong>modo prueba</strong> para poder recorrer el
                circuito completo: la idea que cargues queda registrada sin publicar y el equipo la
                puede borrar. No es una presentación válida para la edición.
              </>
            ) : (
              <>Cuando se abra la próxima edición vas a poder cargar tu propuesta desde acá.</>
            )}
          </Aviso>
        </div>
      )}

      {/*
        Sin clave del modelo los botones de redaccion NO se dibujan, en lugar de
        dibujarse y fallar al apretarlos. No es solo cortesia: el aviso legal del
        pie ya dice que si el servicio del modelo no esta disponible "las otras
        dos funciones simplemente no aparecen", y un boton que siempre devuelve
        error dejaba a ese texto mintiendo. Se evalua en el servidor porque la
        clave es del servidor y no tiene por que viajar al navegador.
      */}
      <FormularioIdea
        categorias={categorias}
        abierta={abierta}
        conIA={hayClave()}
        anio={edicion?.anio ?? new Date().getFullYear()}
      />
    </div>
  );
}
