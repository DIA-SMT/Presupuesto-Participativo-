"use client";

/**
 * Donde queda la obra, en la ficha de la bandeja: un mapa chico con el punto y
 * el contorno de su distrito, el barrio, las coordenadas y si el punto es
 * aproximado.
 *
 * La ficha no lo mostraba, y el equipo evaluaba una obra sin saber donde era:
 * para verlo tenia que abrir la ficha publica, que ademas da 404 mientras la
 * idea no esta publicada (o sea, justo cuando se la evalua).
 *
 * No hay un campo de direccion en la base: la ubicacion es el punto. Para
 * leer la calle, el enlace abre el mismo punto en OpenStreetMap.
 *
 * Cuando el punto cae en otro distrito que el de la idea, se dice: son las
 * ideas de 2025 que el ETL marco "para revision" (data/reporte-limpieza.md), y
 * una carga nueva no deberia llegar nunca asi.
 */
import { useMemo } from "react";
import type { IdeaAdmin } from "@/db/queries";
import { DISTRITOS_MAPA, MapaDiferido, SIN_PUNTOS } from "./mapa-ficha";

export default function UbicacionFicha({
  ficha,
  distritoDelPunto,
}: {
  ficha: IdeaAdmin;
  /** El distrito en el que cae el punto guardado, segun la geometria oficial. */
  distritoDelPunto: number | null;
}) {
  const { lat, lon } = ficha;
  // El mismo objeto mientras el punto no cambie: Mapa lo usa de dependencia y,
  // nuevo en cada render, borraria y volveria a poner el marcador.
  const punto = useMemo(
    () => (lat === null || lon === null ? null : { lat, lon }),
    [lat, lon],
  );
  // `IdeaVista.distrito` es 0 cuando la idea no tiene distrito asignado.
  const distrito = ficha.distrito > 0 ? ficha.distrito : null;

  return (
    <section className="mt-4 rounded-xl p-4" style={{ background: "var(--fondo-suave)" }}>
      <h3 className="text-sm font-bold">Dónde queda</h3>

      {punto ? (
        <>
          <div className="mt-3">
            <MapaDiferido
              modo="seleccionar"
              puntoElegido={punto}
              distritoActivo={distrito ?? undefined}
              distritos={DISTRITOS_MAPA}
              puntos={SIN_PUNTOS}
              alto="14rem"
            />
          </div>
          {/* El distrito y el barrio ya estan arriba, en los datos de la ficha. */}
          <p className="mt-3 text-sm tabular-nums">
            <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Coordenadas{" "}
            </span>
            {punto.lat.toFixed(5)}, {punto.lon.toFixed(5)} ·{" "}
            <a
              href={`https://www.openstreetmap.org/?mlat=${punto.lat}&mlon=${punto.lon}#map=18/${punto.lat}/${punto.lon}`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Ver la calle en OpenStreetMap
            </a>
          </p>

          {ficha.ubicacionAproximada && (
            <p className="mt-2 text-xs" style={{ color: "var(--acento-texto)" }}>
              El punto es aproximado: no marca el lugar exacto de la obra (en las ideas de 2025 sin
              coordenada es el centro del distrito). En el mapa público se dibuja distinto.
            </p>
          )}
          {distrito !== null && distritoDelPunto !== null && distritoDelPunto !== distrito && (
            <p className="mt-2 text-xs" style={{ color: "var(--acento-texto)" }}>
              El punto cae en el Distrito {distritoDelPunto}, pero la idea figura en el Distrito{" "}
              {distrito}. Revisá cuál de los dos está bien: si es el punto, corregilo desde “Corregir
              la idea”.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Sin ubicación cargada{distrito === null ? "" : ` (figura en el Distrito ${distrito})`}.
          {ficha.barrio ? ` Barrio: ${ficha.barrio}.` : ""}
        </p>
      )}
    </section>
  );
}
