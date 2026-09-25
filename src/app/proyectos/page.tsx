import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import AvisoEdicion from "@/components/AvisoEdicion";
import Filtros from "@/components/Filtros";
import Mapa from "@/components/Mapa";
import { TarjetaProyecto, Vacio } from "@/components/ui";
import {
  getCategorias,
  getTextos,
  getUltimaEdicionTerminadaConGanadores,
  listarIdeas,
  ordenDeIdeasPara,
  type EstadoIdea,
} from "@/db/queries";
import { edicionDeLaPagina, resolverEdicion, tituloConEdicion } from "@/lib/edicion-en-vista";
import { PARAMETRO_EDICION, conEdicion } from "@/lib/ediciones";
import { ETIQUETA_ESTADO, colorCategoria, formatearNumero } from "@/lib/formato";

const DESCRIPCION =
  "Todas las ideas presentadas al Presupuesto Participativo de San Miguel de Tucumán, con su evaluación técnica y los proyectos ganadores de cada distrito.";

const ESTADOS: EstadoIdea[] = ["ganador", "factible", "no_factible", "integrado", "pendiente"];

/** Los parametros que son filtros del listado. `edicion` y `vista` no lo son. */
const FILTROS = ["distrito", "categoria", "estado", "q", "ganadores"] as const;

type Parametros = {
  distrito?: string;
  categoria?: string;
  estado?: string;
  q?: string;
  ganadores?: string;
  vista?: string;
  edicion?: string | string[];
};

type Props = { searchParams: Promise<Parametros> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { edicion } = await searchParams;
  const resuelta = await resolverEdicion(edicion).catch(() => null);
  return { title: tituloConEdicion("Proyectos e ideas", resuelta), description: DESCRIPCION };
}

export default async function Proyectos({ searchParams }: Props) {
  const filtros = await searchParams;
  const vista = await edicionDeLaPagina(filtros.edicion);
  if (!vista) {
    return (
      <div className="contenedor py-20">
        <Vacio>Todavía no hay una edición cargada.</Vacio>
      </div>
    );
  }
  const { edicion, anioEnEnlaces } = vista;

  const distrito = Number(filtros.distrito);
  const estado = ESTADOS.includes(filtros.estado as EstadoIdea)
    ? (filtros.estado as EstadoIdea)
    : undefined;

  const [textos, categorias, lista] = await Promise.all([
    getTextos(),
    getCategorias(),
    listarIdeas({
      edicionId: edicion.id,
      distrito: Number.isInteger(distrito) && distrito >= 1 && distrito <= 20 ? distrito : undefined,
      categoria: filtros.categoria || undefined,
      estado,
      texto: filtros.q,
      soloGanadores: filtros.ganadores === "1",
      // Mientras se vota, alfabetico: ordenado por votos, el listado mostraba
      // quien va ganando en cada distrito aunque no dijera un solo numero.
      orden: ordenDeIdeasPara(edicion.etapa),
    }),
  ]);

  const conPunto = lista.filter((idea) => idea.lat !== null);
  const enMapa = filtros.vista !== "lista";

  // Sin ningun filtro y sin resultados, la edicion no tiene ideas publicadas
  // (la 2026 recien abierta, por ejemplo). Decir "ninguna idea coincide con
  // estos filtros" y ofrecer filtros para una lista vacia era mostrarla como si
  // hubiera algo para buscar.
  const hayFiltros = FILTROS.some((clave) => filtros[clave]);
  const sinIdeas = lista.length === 0 && !hayFiltros;
  const anterior = sinIdeas ? await getUltimaEdicionTerminadaConGanadores() : null;

  return (
    <div className="contenedor py-10 sm:py-14">
      <AvisoEdicion vista={vista} hrefActual={enlaceListado(filtros, { vista: filtros.vista })} />

      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {textos["proyectos-titulo"] ?? "Proyectos e ideas"}
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {textos["proyectos-subtitulo"]}
        </p>
      </header>

      {sinIdeas ? (
        <div className="mt-8">
          <Vacio>
            La edición {edicion.anio} todavía no tiene ideas publicadas.
            {anterior && anterior.id !== edicion.id && (
              <>
                {" "}
                <Link
                  href={conEdicion("/proyectos", anterior.activa ? null : anterior.anio)}
                  className="font-semibold underline"
                  style={{ color: "var(--marca-texto)" }}
                >
                  Ver las ideas de la edición {anterior.anio}
                </Link>
              </>
            )}
          </Vacio>
        </div>
      ) : (
        <>
          <div className="mt-7">
            <Suspense fallback={<div className="superficie h-40 animate-pulse rounded-2xl" />}>
              <Filtros
                categorias={categorias.map((c) => ({ valor: c.slug, texto: c.nombre }))}
                estados={ESTADOS.map((e) => ({ valor: e, texto: ETIQUETA_ESTADO[e] ?? e }))}
              />
            </Suspense>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              {lista.length === 0
                ? "Ninguna idea coincide con estos filtros."
                : `${formatearNumero(lista.length)} ${lista.length === 1 ? "idea" : "ideas"}`}
              {lista.length > 0 && conPunto.length < lista.length && (
                <> · {lista.length - conPunto.length} sin ubicación en el mapa</>
              )}
            </p>
            {conPunto.length > 0 && (
              <div className="flex gap-2 text-sm">
                <VistaEnlace
                  href={enlaceListado(filtros, { anio: anioEnEnlaces })}
                  activo={enMapa}
                >
                  Con mapa
                </VistaEnlace>
                <VistaEnlace
                  href={enlaceListado(filtros, { anio: anioEnEnlaces, vista: "lista" })}
                  activo={!enMapa}
                >
                  Solo listado
                </VistaEnlace>
              </div>
            )}
          </div>

          {enMapa && conPunto.length > 0 && (
            <div className="mt-4">
              <Mapa
                puntos={conPunto.map((idea) => ({
                  slug: idea.slug,
                  titulo: idea.titulo,
                  distrito: idea.distrito,
                  lat: idea.lat!,
                  lon: idea.lon!,
                  color: colorCategoria(idea.categoriaSlug, idea.categoriaColor) ?? "var(--color-marca-600)",
                  estado: idea.estado,
                  ganador: idea.ganador,
                  aproximada: idea.ubicacionAproximada,
                }))}
                distritos={[]}
                mostrarEtiquetas={false}
                alto="28rem"
                edicionEnEnlaces={anioEnEnlaces}
              />
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--texto-suave)" }}>
                <span>Los puntos grandes con halo dorado son los proyectos ganadores.</span>
                <span>Los puntos con borde punteado tienen ubicación aproximada.</span>
              </p>
            </div>
          )}

          {lista.length ? (
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((idea) => (
                <TarjetaProyecto key={idea.slug} idea={idea} edicionEnEnlaces={anioEnEnlaces} />
              ))}
            </div>
          ) : (
            <div className="mt-7">
              <Vacio>
                Probá quitando algún filtro, o buscá por el nombre de la plaza o el club.
              </Vacio>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * El listado con los mismos filtros, la vista pedida y la edicion que
 * corresponda. Se arma desde la lista de filtros conocidos y no copiando todos
 * los parametros de la URL: asi `?edicion=` sale siempre de `anio`, que es null
 * en la edicion activa aunque la URL la haya nombrado.
 */
function enlaceListado(
  filtros: Parametros,
  opciones: { anio?: number | null; vista?: string },
): string {
  const parametros = new URLSearchParams();
  for (const clave of FILTROS) {
    const valor = filtros[clave];
    if (valor) parametros.set(clave, valor);
  }
  if (opciones.vista === "lista") parametros.set("vista", "lista");
  if (opciones.anio !== null && opciones.anio !== undefined) {
    parametros.set(PARAMETRO_EDICION, String(opciones.anio));
  }
  const consulta = parametros.toString();
  return consulta ? `/proyectos?${consulta}` : "/proyectos";
}

function VistaEnlace({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={activo ? "true" : undefined}
      className="rounded-lg px-3 py-1.5 font-medium"
      style={
        activo
          ? { background: "var(--color-marca-700)", color: "#fff" }
          : { background: "var(--fondo-suave)", border: "1px solid var(--borde)" }
      }
    >
      {children}
    </a>
  );
}
