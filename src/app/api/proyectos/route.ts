/**
 * Datos abiertos: las ideas de una edicion en JSON o CSV. Por defecto la
 * vigente; `?edicion=AAAA` pide otra, igual que en las paginas.
 *
 * Existe para que otros sistemas del municipio, periodistas o vecinos puedan
 * reusar la informacion sin scrapear el sitio, que es exactamente lo que hubo
 * que hacer para recuperar los datos de la edicion anterior. Hasta que existio
 * `?edicion`, activar una edicion nueva dejaba a la anterior fuera de los datos
 * abiertos, que es repetir ese problema.
 */
import { getEdicionParaVer, listarIdeas } from "@/db/queries";
import { PARAMETRO_EDICION, conEdicion, leerAnioPedido } from "@/lib/ediciones";

// Render a demanda; el cacheo lo maneja la cabecera Cache-Control de abajo.
export const dynamic = "force-dynamic";

/**
 * Van en TODAS las respuestas, tambien en los errores y en el CSV. Sin ella, un
 * sistema de otro dominio que pide `?edicion=1999` recibe el 404 pero el
 * navegador le esconde el cuerpo, y el motivo que viaja en el JSON ("No hay una
 * edición 1999") no le llega. Son datos publicos: no hay nada que proteger.
 */
const CORS = { "Access-Control-Allow-Origin": "*" } as const;

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
  const parametros = new URL(request.url).searchParams;

  // `getAll` y no `get`: con el parametro repetido, `get` se queda con el
  // primero en silencio, y las paginas lo rechazan.
  const valores = parametros.getAll(PARAMETRO_EDICION);
  const pedido = leerAnioPedido(valores.length > 1 ? valores : valores[0]);
  if (pedido.tipo === "invalido") {
    return Response.json(
      {
        error:
          "El parámetro edicion va una sola vez y con un año de cuatro cifras, por ejemplo ?edicion=2025.",
      },
      { status: 400, headers: CORS },
    );
  }

  const edicion = await getEdicionParaVer(pedido.tipo === "anio" ? pedido.anio : null);
  if (!edicion) {
    return pedido.tipo === "anio"
      ? Response.json(
          { error: `No hay una edición ${pedido.anio}.` },
          { status: 404, headers: CORS },
        )
      : Response.json({ error: "No hay una edición activa." }, { status: 503, headers: CORS });
  }
  // La url de cada ficha, como la declara su pagina: con `?edicion` si no es la activa.
  const anioEnEnlaces = edicion.activa ? null : edicion.anio;

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
    url: conEdicion(`/proyectos/${idea.slug}`, anioEnEnlaces),
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
        ...CORS,
      },
    });
  }

  return Response.json(
    {
      edicion: edicion.anio,
      etapa: edicion.etapa,
      // Sin esto, quien baja la 2025 con la 2026 activa no tiene como saber que
      // no esta mirando la edicion vigente.
      vigente: edicion.activa,
      total: filas.length,
      licencia: "Datos abiertos de la Municipalidad de San Miguel de Tucumán",
      proyectos: filas,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        ...CORS,
      },
    },
  );
}
