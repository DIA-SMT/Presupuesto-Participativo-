"use client";

/**
 * Mapa de distritos y proyectos.
 *
 * Usa la geometria oficial servida como archivo estatico en /geo/distritos.geojson
 * (no empaquetada dentro del bundle, como pasaba en el sitio anterior).
 *
 * Las etiquetas de los distritos se dibujan como marcadores HTML y no como capas
 * de texto de MapLibre: asi el mapa no necesita un servidor de glifos externo.
 */
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapaLibre, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre procesa las fuentes GeoJSON en un Web Worker. El worker se sirve
// como archivo estatico (scripts/copiar-maplibre.mjs lo copia en el
// postinstall) porque empaquetado por Turbopack no carga y el mapa queda sin
// poligonos.
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

export type DistritoMapa = {
  numero: number;
  nombre: string;
  ideas: number;
  color: string | null;
  etiquetaGanador: string | null;
};

export type PuntoMapa = {
  slug: string;
  titulo: string;
  distrito: number;
  lat: number;
  lon: number;
  color: string;
  estado: string;
  ganador: boolean;
  aproximada: boolean;
};

type Props = {
  distritos?: DistritoMapa[];
  puntos?: PuntoMapa[];
  /** Distrito resaltado y encuadrado al abrir. */
  distritoActivo?: number;
  /** "navegar" abre la pagina del distrito o del proyecto al hacer clic. */
  modo?: "navegar" | "seleccionar";
  /** Solo en modo "seleccionar". El distrito lo resuelve el servidor. */
  onSeleccionar?: (punto: { lat: number; lon: number }) => void;
  puntoElegido?: { lat: number; lon: number } | null;
  alto?: string;
  mostrarEtiquetas?: boolean;
};

const GEO = "/geo/distritos.geojson";
/**
 * Colores oficiales del isotipo, aplicados a todos los distritos. Van
 * literales porque MapLibre no resuelve variables CSS dentro del estilo del
 * mapa; son los mismos valores que --color-marca-600 y --color-marca-500.
 */
const AZUL = "#0166ff";
const CELESTE = "#2db0ff";

/** Estilo minimo con teselas raster. Ver README: cambiar de proveedor en produccion. */
function estilo(oscuro: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    },
    layers: [
      {
        id: "base",
        type: "raster",
        source: "base",
        paint: oscuro
          ? { "raster-saturation": -0.7, "raster-brightness-max": 0.55, "raster-contrast": 0.1 }
          : { "raster-saturation": -0.35, "raster-brightness-min": 0.08 },
      },
    ],
  };
}

export default function Mapa({
  distritos = [],
  puntos = [],
  distritoActivo,
  modo = "navegar",
  onSeleccionar,
  puntoElegido,
  alto = "30rem",
  mostrarEtiquetas = true,
}: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLibre | null>(null);
  const marcadores = useRef<maplibregl.Marker[]>([]);
  const marcadorElegido = useRef<maplibregl.Marker | null>(null);
  const geometrias = useRef<{
    features: Array<{ properties: { numero: number }; geometry: { coordinates: unknown } }>;
  } | null>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los callbacks se leen desde una ref para no recrear el mapa en cada render.
  const alSeleccionar = useRef(onSeleccionar);
  alSeleccionar.current = onSeleccionar;

  // --- Creacion del mapa (una sola vez) ------------------------------------
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    const oscuro =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const instancia = new maplibregl.Map({
      container: contenedor.current,
      style: estilo(oscuro),
      center: [-65.21705, -26.84725],
      zoom: 11.4,
      minZoom: 10,
      maxZoom: 18,
      attributionControl: { compact: true },
      // El ejido de la ciudad, con margen: evita que el usuario se pierda.
      maxBounds: [
        [-65.45, -27.02],
        [-64.99, -26.68],
      ],
    });

    instancia.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instancia.addControl(new maplibregl.FullscreenControl(), "top-right");
    instancia.addControl(
      new maplibregl.ScaleControl({ maxWidth: 90, unit: "metric" }),
      "bottom-left",
    );

    instancia.on("load", async () => {
      try {
        const respuesta = await fetch(GEO);
        if (!respuesta.ok) throw new Error(`GeoJSON ${respuesta.status}`);
        const datos = await respuesta.json();

        geometrias.current = datos;
        // promoteId hace que el numero de distrito sea el id de la feature, que
        // es lo que necesita setFeatureState para pintar y resaltar.
        instancia.addSource("distritos", {
          type: "geojson",
          data: datos,
          promoteId: "numero",
        });

        // Estilo uniforme institucional: relleno celeste suave y borde azul
        // marcado en todos los distritos. El estado (hover / activo) se
        // comunica con la intensidad, no con colores distintos por distrito.
        instancia.addLayer({
          id: "distritos-relleno",
          type: "fill",
          source: "distritos",
          paint: {
            "fill-color": CELESTE,
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "activo"], false],
              0.42,
              ["boolean", ["feature-state", "hover"], false],
              0.34,
              0.16,
            ],
          },
        });

        instancia.addLayer({
          id: "distritos-borde",
          type: "line",
          source: "distritos",
          paint: {
            "line-color": AZUL,
            "line-width": [
              "case",
              ["boolean", ["feature-state", "activo"], false],
              4,
              ["boolean", ["feature-state", "hover"], false],
              3.5,
              2.5,
            ],
            "line-blur": 0.2,
          },
        });

        setListo(true);
      } catch (causa) {
        setError(
          causa instanceof Error
            ? `No se pudo cargar el mapa de distritos (${causa.message}).`
            : "No se pudo cargar el mapa de distritos.",
        );
      }
    });

    mapa.current = instancia;
    if (process.env.NODE_ENV !== "production") {
      // Solo para inspeccionar el mapa desde la consola en desarrollo.
      (window as unknown as { __ppMapa?: MapaLibre }).__ppMapa = instancia;
    }
    return () => {
      marcadores.current.forEach((m) => m.remove());
      marcadores.current = [];
      instancia.remove();
      mapa.current = null;
    };
  }, []);

  // --- Colores, hover y clic sobre los poligonos ---------------------------
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia || !listo) return;

    for (let numero = 1; numero <= 20; numero += 1) {
      instancia.setFeatureState(
        { source: "distritos", id: numero },
        {
          activo: distritoActivo === numero,
          hover: false,
        },
      );
    }

    let sobre: number | null = null;

    const alMover = (evento: maplibregl.MapLayerMouseEvent) => {
      const id = evento.features?.[0]?.id;
      if (typeof id !== "number" || id === sobre) return;
      if (sobre !== null) {
        instancia.setFeatureState({ source: "distritos", id: sobre }, { hover: false });
      }
      sobre = id;
      instancia.setFeatureState({ source: "distritos", id }, { hover: true });
      instancia.getCanvas().style.cursor = modo === "navegar" ? "pointer" : "crosshair";
    };

    const alSalir = () => {
      if (sobre !== null) {
        instancia.setFeatureState({ source: "distritos", id: sobre }, { hover: false });
      }
      sobre = null;
      instancia.getCanvas().style.cursor = modo === "seleccionar" ? "crosshair" : "";
    };

    const alClic = (evento: maplibregl.MapLayerMouseEvent) => {
      if (modo === "seleccionar") return;
      const numero = evento.features?.[0]?.properties?.numero;
      if (numero) window.location.href = `/distritos/${numero}`;
    };

    instancia.on("mousemove", "distritos-relleno", alMover);
    instancia.on("mouseleave", "distritos-relleno", alSalir);
    instancia.on("click", "distritos-relleno", alClic);

    // Redibuja los estados si el estilo se recarga.
    return () => {
      instancia.off("mousemove", "distritos-relleno", alMover);
      instancia.off("mouseleave", "distritos-relleno", alSalir);
      instancia.off("click", "distritos-relleno", alClic);
    };
  }, [listo, distritos, distritoActivo, modo]);

  // --- Modo seleccionar: un clic en cualquier parte elige el punto ---------
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia || modo !== "seleccionar") return;

    instancia.getCanvas().style.cursor = "crosshair";
    const alClic = (evento: maplibregl.MapMouseEvent) => {
      alSeleccionar.current?.({ lat: evento.lngLat.lat, lon: evento.lngLat.lng });
    };
    instancia.on("click", alClic);
    return () => {
      instancia.off("click", alClic);
    };
  }, [modo, listo]);

  // --- Marcador del punto elegido -----------------------------------------
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia) return;

    marcadorElegido.current?.remove();
    marcadorElegido.current = null;
    if (!puntoElegido) return;

    const nodo = document.createElement("div");
    nodo.className = "pp-marcador-elegido";
    nodo.setAttribute("aria-hidden", "true");
    marcadorElegido.current = new maplibregl.Marker({ element: nodo, anchor: "bottom" })
      .setLngLat([puntoElegido.lon, puntoElegido.lat])
      .addTo(instancia);
  }, [puntoElegido]);

  // --- Etiquetas de distrito y puntos de proyectos -------------------------
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia || !listo) return;

    marcadores.current.forEach((m) => m.remove());
    marcadores.current = [];

    if (mostrarEtiquetas) {
      for (const distrito of distritos) {
        const nodo = document.createElement("button");
        nodo.type = "button";
        nodo.className = "pp-etiqueta-distrito";
        nodo.textContent = String(distrito.numero);
        nodo.setAttribute(
          "aria-label",
          `${distrito.nombre}: ${distrito.ideas} ${distrito.ideas === 1 ? "idea" : "ideas"}` +
            (distrito.etiquetaGanador ? `. Ganador: ${distrito.etiquetaGanador}` : ""),
        );
        if (distrito.numero === distritoActivo) nodo.dataset.activo = "si";
        if (modo === "navegar") {
          nodo.addEventListener("click", (evento) => {
            evento.stopPropagation();
            window.location.href = `/distritos/${distrito.numero}`;
          });
        } else {
          nodo.style.pointerEvents = "none";
        }
        marcadores.current.push(
          new maplibregl.Marker({ element: nodo, anchor: "center" })
            .setLngLat(centroideDe(distrito.numero))
            .addTo(instancia),
        );
      }
    }

    for (const punto of puntos) {
      const nodo = document.createElement("button");
      nodo.type = "button";
      nodo.className = punto.ganador ? "pp-punto pp-punto-ganador" : "pp-punto";
      nodo.style.setProperty("--punto-color", punto.color);
      nodo.setAttribute("aria-label", punto.titulo);
      if (punto.aproximada) nodo.dataset.aprox = "si";

      const popup = new maplibregl.Popup({ offset: 14, closeButton: true }).setHTML(
        `<div class="pp-popup">
           <p class="pp-popup-distrito">Distrito ${punto.distrito}${
             punto.ganador ? " · Ganador" : ""
           }</p>
           <p class="pp-popup-titulo">${escapar(punto.titulo)}</p>
           ${
             punto.aproximada
               ? '<p class="pp-popup-aviso">Ubicación aproximada: la idea no tenía coordenada cargada.</p>'
               : ""
           }
           <a class="pp-popup-link" href="/proyectos/${punto.slug}">Ver el proyecto</a>
         </div>`,
      );

      marcadores.current.push(
        new maplibregl.Marker({ element: nodo, anchor: "center" })
          .setLngLat([punto.lon, punto.lat])
          .setPopup(popup)
          .addTo(instancia),
      );
    }
  }, [listo, distritos, puntos, distritoActivo, modo, mostrarEtiquetas]);

  // --- Encuadre del distrito activo ---------------------------------------
  useEffect(() => {
    const instancia = mapa.current;
    if (!instancia || !listo || !distritoActivo) return;

    // Se usa el GeoJSON completo que quedo en memoria y no querySourceFeatures,
    // que solo devuelve las features visibles en el encuadre actual.
    const geometria = geometrias.current?.features.find(
      (f) => f.properties.numero === distritoActivo,
    )?.geometry;
    if (!geometria) return;

    const limites = new maplibregl.LngLatBounds();
    const recorrer = (coordenadas: unknown): void => {
      if (
        Array.isArray(coordenadas) &&
        typeof coordenadas[0] === "number" &&
        typeof coordenadas[1] === "number"
      ) {
        limites.extend([coordenadas[0], coordenadas[1]]);
        return;
      }
      if (Array.isArray(coordenadas)) coordenadas.forEach(recorrer);
    };
    recorrer(geometria.coordinates);

    if (!limites.isEmpty()) {
      instancia.fitBounds(limites, { padding: 56, duration: 700, maxZoom: 15 });
    }
  }, [listo, distritoActivo]);

  return (
    <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "var(--borde)" }}>
      <div
        ref={contenedor}
        style={{ height: alto, width: "100%", background: "var(--fondo-suave)" }}
        role="application"
        aria-label="Mapa de los distritos del Presupuesto Participativo"
      />
      {error && (
        <p
          className="absolute inset-x-4 top-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
        >
          {error} Los datos igual están disponibles en el listado de proyectos.
        </p>
      )}
      <style>{estilosMarcadores}</style>
    </div>
  );
}

/** Centroides oficiales, embebidos para no pedir otro archivo al pintar etiquetas. */
const CENTROIDES: Record<number, [number, number]> = {
  1: [-65.25151134315509, -26.7965902293152],
  2: [-65.23988581119002, -26.796820092784316],
  3: [-65.2303437489238, -26.800060455943257],
  4: [-65.21887724399366, -26.80227461511192],
  5: [-65.20587806092627, -26.80407480868227],
  6: [-65.19552563059214, -26.80683579779532],
  7: [-65.17407510866583, -26.802812469674468],
  8: [-65.17776541241761, -26.81738924562414],
  9: [-65.24815395452917, -26.82137240670826],
  10: [-65.21328351096994, -26.82922590834758],
  11: [-65.18321582635352, -26.83462664976466],
  12: [-65.26232954340108, -26.839274499012827],
  13: [-65.24553958503606, -26.843928316560405],
  14: [-65.23037527801343, -26.851408125413077],
  15: [-65.21130257493127, -26.85196947431887],
  16: [-65.19655788415795, -26.860786172666575],
  17: [-65.25899864553605, -26.85564466073455],
  18: [-65.24854348312063, -26.86743982959108],
  19: [-65.22058514180601, -26.867722862506795],
  20: [-65.21505224925212, -26.88823630115151],
};

function centroideDe(numero: number): [number, number] {
  return CENTROIDES[numero] ?? [-65.21705, -26.84725];
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const estilosMarcadores = `
.pp-etiqueta-distrito {
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 999px;
  border: 2px solid rgb(255 255 255 / 0.9);
  background: var(--color-marca-800);
  color: #fff;
  font: 600 0.8125rem/1 var(--font-sans, sans-serif);
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.35);
  transition: transform 120ms ease;
}
.pp-etiqueta-distrito:hover { transform: scale(1.18); }
.pp-etiqueta-distrito[data-activo="si"] {
  background: var(--color-acento-600);
  width: 2rem;
  height: 2rem;
  font-size: 0.9375rem;
}
.pp-punto {
  width: 0.9rem;
  height: 0.9rem;
  border-radius: 999px;
  border: 2px solid #fff;
  background: var(--punto-color, #0166ff);
  cursor: pointer;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.4);
  transition: transform 120ms ease;
}
.pp-punto:hover { transform: scale(1.35); }
.pp-punto[data-aprox="si"] { opacity: 0.62; border-style: dashed; }
.pp-punto-ganador {
  width: 1.35rem;
  height: 1.35rem;
  border-width: 3px;
  box-shadow: 0 0 0 4px rgb(184 134 11 / 0.35), 0 1px 6px rgb(0 0 0 / 0.4);
}
.pp-marcador-elegido {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px 999px 999px 2px;
  transform: rotate(-45deg);
  border: 3px solid #fff;
  background: var(--color-acento-600);
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.45);
}
.pp-popup { display: grid; gap: 0.3rem; }
.pp-popup-distrito {
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--texto-suave);
  margin: 0;
}
.pp-popup-titulo { font-weight: 600; font-size: 0.9375rem; margin: 0; line-height: 1.35; }
.pp-popup-aviso { font-size: 0.75rem; color: var(--texto-suave); margin: 0.15rem 0 0; }
.pp-popup-link {
  margin-top: 0.35rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-marca-600);
  text-decoration: underline;
}
`;
