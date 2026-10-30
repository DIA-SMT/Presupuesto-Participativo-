/**
 * La tarjeta de la obra de un proyecto ganador: en que etapa esta (licitacion,
 * adjudicada, en obra, finalizada), desde cuando, la aclaracion del equipo y
 * el link que lo respalda (el boletin oficial, la nota de prensa).
 *
 * La usan /transparencia y /admin/obras, para que el equipo vea al cargar lo
 * mismo que va a ver el vecino. La etapa sale del ultimo avance publicado
 * (`listarObras`, src/db/queries.ts): sin avances la tarjeta dice "Sin
 * información todavía" y deja la barra vacia, en lugar de pintar la etapa
 * "preparacion" que el ETL le puso a todos los ganadores migrados.
 *
 * El color de la etapa nunca va solo: la etiqueta dice el nombre, la barra se
 * lee por cantidad de tramos y la etapa actual va en negrita debajo. Los tonos
 * son tokens --obra-* de globals.css, con contraste en los dos temas.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { ObraGanadora } from "@/db/queries";
import {
  ETAPAS_PRESUPUESTO,
  ETIQUETA_PRESUPUESTO,
  formatearFecha,
  formatearNumero,
} from "@/lib/formato";

/** Las etapas, con el nombre corto que entra debajo de cada tramo de la barra. */
const PASOS: Record<(typeof ETAPAS_PRESUPUESTO)[number], string> = {
  licitacion: "Licitación",
  adjudicada: "Adjudicada",
  ejecucion: "En obra",
  finalizado: "Finalizada",
};

export default function TarjetaObra({
  obra,
  hrefFicha,
  pie,
}: {
  obra: ObraGanadora;
  /** A donde lleva el titulo: la ficha publica del proyecto. */
  hrefFicha: string;
  /** Lo que el panel agrega abajo (el formulario para informar un avance). */
  pie?: ReactNode;
}) {
  const indice = obra.etapa
    ? ETAPAS_PRESUPUESTO.indexOf(obra.etapa as (typeof ETAPAS_PRESUPUESTO)[number])
    : -1;
  const conEtapa = indice !== -1;

  return (
    <article className="tarjeta-obra" data-etapa={conEtapa ? obra.etapa : undefined}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
          {obra.distrito !== null ? `Distrito ${obra.distrito}` : "Sin distrito"}
          {obra.barrio ? ` · ${obra.barrio}` : ""}
        </p>
        {/* Sin votos registrados (la Plaza Urquiza, que vino de una consulta
            ciudadana) no se muestra "0 votos": no es que nadie la voto. */}
        {obra.votos > 0 && (
          <p className="shrink-0 text-xs tabular-nums" style={{ color: "var(--texto-suave)" }}>
            {formatearNumero(obra.votos)} {obra.votos === 1 ? "voto" : "votos"}
          </p>
        )}
      </div>

      <span className="etiqueta-obra">
        <IconoEtapa etapa={conEtapa ? obra.etapa : null} />
        {conEtapa ? ETIQUETA_PRESUPUESTO[obra.etapa as string] : "Sin información todavía"}
      </span>

      <h3 className="text-base font-semibold leading-snug">
        <Link href={hrefFicha} className="hover:underline">
          {obra.titulo}
        </Link>
      </h3>

      <div className="mt-auto">
        <div
          className="barra-obra"
          role="img"
          aria-label={
            conEtapa
              ? `Etapa ${indice + 1} de ${ETAPAS_PRESUPUESTO.length}: ${PASOS[ETAPAS_PRESUPUESTO[indice]]}`
              : "Todavía no hay información sobre la obra"
          }
        >
          {ETAPAS_PRESUPUESTO.map((etapa, i) => (
            <span key={etapa} data-lleno={conEtapa && i <= indice ? "" : undefined} />
          ))}
        </div>
        <div className="pasos-obra mt-1.5" aria-hidden="true">
          {ETAPAS_PRESUPUESTO.map((etapa, i) => (
            <span key={etapa} data-actual={i === indice ? "" : undefined}>
              {PASOS[etapa]}
            </span>
          ))}
        </div>
      </div>

      {obra.fecha && (
        <div
          className="space-y-1.5 pt-3 text-[0.8125rem] leading-relaxed"
          style={{ borderTop: "1px solid var(--borde)" }}
        >
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Actualizado el {formatearFecha(obra.fecha)}
          </p>
          {obra.aclaracion && <p style={{ color: "var(--texto-suave)" }}>{obra.aclaracion}</p>}
          {obra.enlace && (
            <a
              href={obra.enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold hover:underline"
              style={{ color: "var(--marca-texto)" }}
            >
              {textoDelEnlace(obra.enlace)}
              <span aria-hidden="true">↗</span>
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          )}
        </div>
      )}

      {pie}
    </article>
  );
}

/** "Ver la nota de prensa", "Ver el boletín oficial", o el sitio del link. */
function textoDelEnlace(enlace: string): string {
  try {
    const { hostname, pathname } = new URL(enlace);
    if (/bolet/i.test(pathname)) return "Ver el boletín oficial";
    if (hostname.endsWith("comunicacionsmt.gob.ar")) return "Ver la nota de prensa";
    return `Ver en ${hostname.replace(/^www\./, "")}`;
  } catch {
    return "Ver más";
  }
}

/**
 * Un icono por etapa: un documento (se licita), un sello (se adjudica), un
 * casco (en obra), un tilde (terminada), y un reloj sin informacion.
 * Decorativo: el nombre de la etapa va al lado.
 */
function IconoEtapa({ etapa }: { etapa: string | null }) {
  const trazos: Record<string, ReactNode> = {
    licitacion: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
    adjudicada: (
      <>
        <circle cx="12" cy="9" r="6" />
        <path d="m9 14.5-1.5 6.5 4.5-2.5 4.5 2.5-1.5-6.5" />
      </>
    ),
    ejecucion: (
      <>
        <path d="M4 18a8 8 0 0 1 16 0" />
        <path d="M2 18h20M10 10V6h4v4" />
      </>
    ),
    finalizado: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(etapa && trazos[etapa]) ?? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )}
    </svg>
  );
}
