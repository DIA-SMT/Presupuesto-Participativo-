/**
 * Datos abiertos: las ideas de la edicion vigente en JSON o CSV.
 *
 * Existe para que otros sistemas del municipio, periodistas o vecinos puedan
 * reusar la informacion sin scrapear el sitio, que es exactamente lo que hubo
 * que hacer para recuperar los datos de la edicion anterior.
 */
import { getEdicionActiva, listarIdeas } from "@/db/queries";

// Render a demanda; el cacheo lo maneja la cabecera Cache-Control de abajo.
export const dynamic = "force-dynamic";

const COLUMNAS = [
  "distrito",
  "titulo",
  "barrio",
  "categoria",
  "estado",
  "ganador",
  "votos",
  "lat",
  "lon",
  "ubicacion_aproximada",
  "presupuesto_total",
  "estado_presupuesto",
  "fecha",
  "url",
] as const;

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export async function GET(request: Request) {
  const edicion = await getEdicionActiva();
  if (!edicion) {
    return Response.json({ error: "No hay una edición activa." }, { status: 503 });
  }

  const parametros = new URL(request.url).searchParams;
  const distrito = Number(parametros.get("distrito"));

  const lista = await listarIdeas({
    edicionId: edicion.id,
    distrito:
      Number.isInteger(distrito) && distrito >= 1 && distrito <= 20 ? distrito : undefined,
    categoria: parametros.get("categoria") ?? undefined,
    soloGanadores: parametros.get("ganadores") === "1",
  });

  const filas = lista.map((idea) => ({
    distrito: idea.distrito,
    titulo: idea.titulo,
    barrio: idea.barrio,
    categoria: idea.categoriaNombre,
    estado: idea.estado,
    ganador: idea.ganador,
    votos: idea.votos,
    lat: idea.lat,
    lon: idea.lon,
    ubicacion_aproximada: idea.ubicacionAproximada,
    presupuesto_total: idea.presupuestoTotal,
    estado_presupuesto: idea.estadoPresupuesto,
    fecha: idea.fecha,
    url: `/proyectos/${idea.slug}`,
  }));

  if (parametros.get("formato") === "csv") {
    const csv = [
      COLUMNAS.join(","),
      ...filas.map((fila) => COLUMNAS.map((columna) => celda(fila[columna])).join(",")),
    ].join("\n");

    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pp-smt-${edicion.anio}.csv"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  return Response.json(
    {
      edicion: edicion.anio,
      etapa: edicion.etapa,
      total: filas.length,
      licencia: "Datos abiertos de la Municipalidad de San Miguel de Tucumán",
      proyectos: filas,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
