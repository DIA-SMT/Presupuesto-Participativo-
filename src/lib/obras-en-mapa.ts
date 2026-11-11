/**
 * Las obras de los proyectos ganadores como puntos de mapa: la portada las
 * muestra todas y la pagina de un distrito la suya. El color es el de la etapa
 * de la obra (los mismos tokens --obra-* que las tarjetas de Transparencia), y
 * la etapa sale del ultimo avance publicado: sin avances se dice que esta en
 * confeccion de expediente (el paso previo a la licitacion).
 */
import type { PuntoMapa } from "@/components/Mapa";
import type { ObraGanadora } from "@/db/queries";
import { ETAPAS_PRESUPUESTO, ETIQUETA_PRESUPUESTO, ETIQUETA_SIN_ETAPA_OBRA } from "@/lib/formato";

export const SIN_ETAPA_OBRA = ETIQUETA_SIN_ETAPA_OBRA;

function esEtapa(etapa: string | null): etapa is string {
  return etapa !== null && (ETAPAS_PRESUPUESTO as readonly string[]).includes(etapa);
}

export function colorDeEtapaObra(etapa: string | null): string {
  return esEtapa(etapa) ? `var(--obra-${etapa})` : "var(--texto-suave)";
}

/**
 * El punto de una obra. La que se cargo sin coordenada va al centro de su
 * distrito y se marca aproximada (borde punteado y aviso en el popup), como en
 * el resto de los mapas del sitio. Sin distrito ni centro, no hay punto.
 */
export function puntoDeObra(
  obra: ObraGanadora,
  centro: { lat: number; lon: number } | null | undefined,
): PuntoMapa | null {
  if (obra.distrito === null) return null;
  const conPunto = obra.lat !== null && obra.lon !== null;
  if (!conPunto && !centro) return null;
  return {
    slug: obra.slug,
    titulo: obra.titulo,
    distrito: obra.distrito,
    lat: conPunto ? obra.lat! : centro!.lat,
    lon: conPunto ? obra.lon! : centro!.lon,
    color: colorDeEtapaObra(obra.etapa),
    estado: "ganadora",
    ganador: true,
    aproximada: !conPunto || obra.ubicacionAproximada,
    obra: esEtapa(obra.etapa) ? (ETIQUETA_PRESUPUESTO[obra.etapa] ?? obra.etapa) : SIN_ETAPA_OBRA,
    edicion: obra.edicionActiva ? null : obra.anio,
  };
}

/** Las etapas presentes, en el orden de la obra, con cuantas hay en cada una. */
export function leyendaDeObras(obras: ObraGanadora[]) {
  const items = ETAPAS_PRESUPUESTO.map((etapa) => ({
    etiqueta: ETIQUETA_PRESUPUESTO[etapa] ?? etapa,
    color: colorDeEtapaObra(etapa),
    cantidad: obras.filter((o) => o.etapa === etapa).length,
  }));
  const sinEtapa = obras.filter((o) => !esEtapa(o.etapa)).length;
  return [
    ...items,
    { etiqueta: SIN_ETAPA_OBRA, color: colorDeEtapaObra(null), cantidad: sinEtapa },
  ].filter((item) => item.cantidad > 0);
}
