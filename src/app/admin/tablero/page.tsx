import { redirect } from "next/navigation";
import {
  UMBRAL_SUPRESION,
  getEdiciones,
  getEjecucionPresupuestaria,
  getEstadisticasPorDistrito,
  getMatrizDistritoCategoria,
  getParticipacionPorDistrito,
  getResumenAdmin,
  getSerieIdeas,
  getSerieVotos,
  type EstadisticaDistrito,
} from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelTablero, { type ClaveOrden, type Direccion } from "./panel";
import type { FilaMatriz } from "./graficos";

export const metadata = { title: "Tablero" };

/**
 * Columnas por las que se puede ordenar la tabla de distritos.
 *
 * El orden se resuelve ACA, en el servidor, mapeando el parametro de la URL
 * contra estas claves: si el valor no esta en el objeto se usa "distrito". La
 * consulta (getEstadisticasPorDistrito) devuelve siempre las 20 filas con un
 * ORDER BY fijo, asi que ningun texto del querystring se acerca al tag sql
 * (interpolarlo ahi seria inyeccion directa). Son 20 filas: ordenarlas en
 * memoria no cuesta nada.
 */
const COLUMNAS_ORDEN: Record<ClaveOrden, (fila: EstadisticaDistrito) => number> = {
  distrito: (fila) => fila.numero,
  ideas: (fila) => fila.ideas,
  factibles: (fila) => fila.factibles,
  noFactibles: (fila) => fila.noFactibles,
  pendientes: (fila) => fila.pendientes,
  votos: (fila) => fila.votos,
};

type Props = {
  searchParams: Promise<{ edicion?: string; orden?: string; dir?: string }>;
};

export default async function AdminTablero({ searchParams }: Props) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const parametros = await searchParams;
  const ediciones = await getEdiciones();

  if (ediciones.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Tablero</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          No hay ninguna edición cargada. Corré <code>npm run setup</code> o creá una desde la
          pantalla de ediciones.
        </p>
      </div>
    );
  }

  // La edicion se elige por anio (?edicion=2025). Si el parametro no existe o
  // no coincide con ninguna edicion, se muestra la activa.
  const anioPedido = Number(parametros.edicion);
  const edicion =
    ediciones.find((fila) => fila.anio === anioPedido) ??
    ediciones.find((fila) => fila.activa) ??
    ediciones[0];

  const [
    resumen,
    estadisticas,
    matriz,
    serieVotos,
    serieIdeas,
    ejecucion,
    participacion,
  ] = await Promise.all([
    getResumenAdmin(edicion.id),
    getEstadisticasPorDistrito(edicion.id),
    getMatrizDistritoCategoria(edicion.id),
    getSerieVotos(edicion.id),
    getSerieIdeas(edicion.id),
    getEjecucionPresupuestaria(edicion.id),
    getParticipacionPorDistrito(edicion.id),
  ]);

  const orden: ClaveOrden = Object.hasOwn(COLUMNAS_ORDEN, parametros.orden ?? "")
    ? (parametros.orden as ClaveOrden)
    : "distrito";
  const direccion: Direccion = parametros.dir === "desc" ? "desc" : "asc";
  const valorDe = COLUMNAS_ORDEN[orden];

  const ordenadas = [...estadisticas].sort((a, b) => {
    const diferencia = valorDe(a) - valorDe(b);
    if (diferencia !== 0) return direccion === "asc" ? diferencia : -diferencia;
    return a.numero - b.numero; // desempate estable: el numero de distrito
  });

  // La matriz llega como celdas (distrito x categoria) ya ordenada por distrito
  // y por el orden de la categoria: se pivotea aca para que el grafico reciba
  // una fila por distrito y las categorias una sola vez.
  const categorias: { slug: string; nombre: string }[] = [];
  for (const celda of matriz) {
    if (!categorias.some((categoria) => categoria.slug === celda.categoriaSlug)) {
      categorias.push({ slug: celda.categoriaSlug, nombre: celda.categoriaNombre });
    }
  }

  const nombrePorDistrito = new Map(estadisticas.map((fila) => [fila.numero, fila.nombre]));
  const filasMatriz: FilaMatriz[] = [];
  for (const celda of matriz) {
    let fila = filasMatriz.find((candidata) => candidata.distrito === celda.distrito);
    if (!fila) {
      fila = {
        distrito: celda.distrito,
        nombre: nombrePorDistrito.get(celda.distrito) ?? `Distrito ${celda.distrito}`,
        valores: categorias.map(() => 0),
      };
      filasMatriz.push(fila);
    }
    const columna = categorias.findIndex((categoria) => categoria.slug === celda.categoriaSlug);
    if (columna >= 0) fila.valores[columna] = celda.ideas;
  }

  return (
    <PanelTablero
      ediciones={ediciones.map((fila) => ({
        id: fila.id,
        anio: fila.anio,
        etapa: fila.etapa,
        activa: fila.activa,
      }))}
      edicion={{
        id: edicion.id,
        anio: edicion.anio,
        etapa: edicion.etapa,
        activa: edicion.activa,
      }}
      resumen={resumen}
      distritos={ordenadas}
      categorias={categorias}
      matriz={filasMatriz}
      serieVotos={serieVotos}
      serieIdeas={serieIdeas}
      ejecucion={ejecucion}
      participacion={participacion}
      orden={orden}
      direccion={direccion}
      umbral={UMBRAL_SUPRESION}
    />
  );
}
