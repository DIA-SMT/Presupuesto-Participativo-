"use client";

/**
 * El mapa de las pantallas del panel, y lo que necesita para no redibujarse.
 *
 * `MapaDiferido` es src/components/Mapa.tsx cargado recien cuando se dibuja: la
 * bandeja lo muestra solo en la ficha de una idea, y MapLibre es de lo mas
 * pesado que baja el sitio. Importado de una, la bandeja lo descargaria entero
 * aunque nadie abra ninguna ficha. Sin render en el servidor, porque MapLibre
 * vive del canvas del navegador y el servidor no tiene nada que dibujar.
 *
 * `DISTRITOS_MAPA` y `SIN_PUNTOS` son constantes de modulo porque Mapa los usa
 * como dependencias de sus efectos: un arreglo nuevo en cada render (y con
 * campos controlados hay un render por tecla) le hacia borrar y volver a
 * dibujar sus marcadores con cada letra.
 */
import dynamic from "next/dynamic";
import type { DistritoMapa, PuntoMapa } from "@/components/Mapa";

export const DISTRITOS_MAPA: DistritoMapa[] = Array.from({ length: 20 }, (_, i) => ({
  numero: i + 1,
  nombre: `Distrito ${i + 1}`,
  ideas: 0,
  color: null,
  etiquetaGanador: null,
}));

export const SIN_PUNTOS: PuntoMapa[] = [];

export const MapaDiferido = dynamic(() => import("@/components/Mapa"), {
  ssr: false,
  loading: () => (
    <div
      className="grid place-items-center rounded-2xl text-xs"
      style={{
        height: "14rem",
        background: "var(--fondo-suave)",
        border: "1px solid var(--borde)",
        color: "var(--texto-suave)",
      }}
    >
      Cargando el mapa…
    </div>
  ),
});
