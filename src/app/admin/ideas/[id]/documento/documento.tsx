"use client";

/**
 * La propuesta como documento, para bajarla en PDF o imprimirla desde el panel.
 *
 * Es el mismo DocumentoIdea que el vecino ve al escribirla y baja al enviarla:
 * el papel del equipo no puede salir distinto del suyo. El PDF lo hace el
 * navegador ("Guardar como PDF" del dialogo de impresion), y la hoja de
 * impresion de DocumentoIdea deja en el papel solo el documento: el boton y el
 * resto del panel no salen.
 *
 * El pie lleva el codigo de la propuesta y la fecha, NO el codigo de
 * seguimiento: ese es del vecino, y un papel que circula por la oficina no
 * tiene por que llevarlo.
 */
import { useEffect, useState } from "react";
import DocumentoIdea, { type DatosDocumento } from "@/components/DocumentoIdea";

export default function DocumentoImprimible({
  datos,
  anio,
  propuesta,
  fecha,
}: {
  datos: DatosDocumento;
  anio: number;
  /** El codigo de la propuesta, D05-P012. */
  propuesta: string;
  fecha: string;
}) {
  const [poligono, setPoligono] = useState<number[][] | null>(null);

  // El contorno del distrito para el mapita, del mismo /geo/distritos.geojson
  // que usan los mapas. Si falla, el documento dibuja solo el punto.
  useEffect(() => {
    if (datos.distrito === null) return;
    let vigente = true;
    fetch("/geo/distritos.geojson")
      .then((respuesta) => respuesta.json())
      .then(
        (geo: {
          features: Array<{
            properties: { numero: number };
            geometry: { coordinates: number[][][][] };
          }>;
        }) => {
          const f = geo.features.find((x) => x.properties.numero === datos.distrito);
          if (vigente) setPoligono(f?.geometry.coordinates?.[0]?.[0] ?? null);
        },
      )
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [datos.distrito]);

  return (
    <div className="mt-6 max-w-3xl">
      <button
        type="button"
        onClick={() => window.print()}
        className="mb-4 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        style={{ background: "var(--color-marca-700)" }}
      >
        Descargar PDF
      </button>
      <p className="mb-4 text-xs" style={{ color: "var(--texto-suave)" }}>
        Se abre el diálogo de impresión: elegí “Guardar como PDF” para bajarlo, o una impresora
        para imprimirlo.
      </p>
      <DocumentoIdea
        datos={datos}
        anio={anio}
        poligono={poligono}
        comprobante={{ propuesta, codigo: null, fecha }}
      />
    </div>
  );
}
