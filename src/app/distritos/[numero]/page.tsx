import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AvisoEdicion from "@/components/AvisoEdicion";
import Mapa from "@/components/Mapa";
import { Aviso, Chip, ChipEstado, Dato, TarjetaProyecto, Vacio } from "@/components/ui";
import {
  getDistrito,
  getUltimaEdicionTerminadaConGanadores,
  ordenDeIdeasPara,
} from "@/db/queries";
import { edicionDeLaPagina, resolverEdicion, tituloConEdicion } from "@/lib/edicion-en-vista";
import { conEdicion, votacionTerminada } from "@/lib/ediciones";
import {
  DESCRIPCION_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_ETAPA,
  colorCategoria,
  formatearNumero,
} from "@/lib/formato";

type Props = {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ edicion?: string | string[] }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ numero }, { edicion }] = await Promise.all([params, searchParams]);
  const resuelta = await resolverEdicion(edicion).catch(() => null);
  return {
    title: tituloConEdicion(`Distrito ${numero}`, resuelta),
    description: `Ideas presentadas y proyecto ganador del Distrito ${numero} del Presupuesto Participativo de San Miguel de Tucumán.`,
  };
}


export default async function PaginaDistrito({ params, searchParams }: Props) {
  const [{ numero: crudo }, { edicion: valorEdicion }] = await Promise.all([params, searchParams]);
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < 1 || numero > 20) notFound();

  const vista = await edicionDeLaPagina(valorEdicion);
  if (!vista) notFound();
  const { edicion, anioEnEnlaces } = vista;

  // Mientras se vota, las ideas del distrito van en orden alfabetico: por votos,
  // la primera tarjeta era la que va ganando y el orden publicaba el ranking.
  const distrito = await getDistrito(numero, edicion.id, {
    orden: ordenDeIdeasPara(edicion.etapa),
  });
  if (!distrito) notFound();

  const ganador = distrito.ganador;
  const colorDeCategoria = colorCategoria(ganador?.categoriaSlug, ganador?.categoriaColor);
  const otras = distrito.ideas.filter((idea) => !idea.ganador);
  const conPunto = distrito.ideas.filter((idea) => idea.lat !== null);

  // Con una edicion que todavia no voto, lo que hay para seguir en el distrito
  // es la obra que gano en la ultima edicion que si voto (la de 2025 con la
  // 2026 recien abierta). Se busca solo en ese caso.
  const anterior =
    !ganador && !votacionTerminada(edicion.etapa)
      ? await getUltimaEdicionTerminadaConGanadores()
      : null;
  const ganadorAnterior =
    anterior && anterior.id !== edicion.id
      ? (anterior.ganadores.find((g) => g.distrito === numero) ?? null)
      : null;

  const porEstado = new Map<string, number>();
  for (const idea of distrito.ideas) {
    porEstado.set(idea.estado, (porEstado.get(idea.estado) ?? 0) + 1);
  }

  return (
    <div className="contenedor py-10 sm:py-14">
      <AvisoEdicion vista={vista} hrefActual={`/distritos/${numero}`} />

      <nav aria-label="Camino de navegación" className="text-sm" style={{ color: "var(--texto-suave)" }}>
        <Link href={conEdicion("/distritos", anioEnEnlaces)} className="hover:underline">
          Distritos
        </Link>
        <span aria-hidden="true"> / </span>
        <span>Distrito {numero}</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold sm:text-4xl">Distrito {numero}</h1>
          {distrito.referencia && (
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              <span className="font-medium">Barrios del distrito: </span>
              {distrito.referencia}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {numero > 1 && (
            <Link
              href={conEdicion(`/distritos/${numero - 1}`, anioEnEnlaces)}
              className="superficie rounded-xl px-3.5 py-2 text-sm font-medium"
            >
              ← D{numero - 1}
            </Link>
          )}
          {numero < 20 && (
            <Link
              href={conEdicion(`/distritos/${numero + 1}`, anioEnEnlaces)}
              className="superficie rounded-xl px-3.5 py-2 text-sm font-medium"
            >
              D{numero + 1} →
            </Link>
          )}
        </div>
      </header>

      <dl className="mt-8 grid gap-3 sm:grid-cols-3">
        <Dato valor={String(distrito.ideas.length)} etiqueta="ideas presentadas" />
        <Dato
          valor={ganador ? formatearNumero(ganador.votos) : "—"}
          etiqueta="votos del proyecto ganador"
        />
        {/*
          El tercer dato grande del distrito era "estado de la obra", y mostraba
          el `preparacion` que ponia el ETL por defecto: un dato inventado con el
          tamano de un titular. Los otros dos —ideas presentadas y votos— si son
          reales, y quedan.
        */}
      </dl>

      {/* --- Proyecto ganador --------------------------------------------- */}
      {ganador ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Proyecto ganador</h2>
          <article
            className="superficie mt-4 rounded-2xl p-6"
            style={{ borderLeft: `5px solid ${colorDeCategoria ?? "var(--borde)"}` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <ChipEstado estado="ganador" />
              {ganador.categoriaNombre && (
                <Chip color={colorDeCategoria ?? undefined}>{ganador.categoriaNombre}</Chip>
              )}
              <Chip color="var(--ganador-texto)">
                {formatearNumero(ganador.votos)} votos
              </Chip>
            </div>

            <h3 className="mt-3 text-2xl font-bold leading-tight">
              <Link
                href={conEdicion(`/proyectos/${ganador.slug}`, anioEnEnlaces)}
                className="hover:underline"
              >
                {ganador.titulo}
              </Link>
            </h3>

            {ganador.barrio && (
              <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
                B° {ganador.barrio}
              </p>
            )}

            {ganador.problema && (
              <p className="mt-4 max-w-prose text-sm leading-relaxed">{ganador.problema}</p>
            )}

            <Link
              href={conEdicion(`/proyectos/${ganador.slug}`, anioEnEnlaces)}
              className="mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Ver el proyecto
            </Link>
          </article>
        </section>
      ) : !votacionTerminada(edicion.etapa) ? (
        // Antes de que termine la votacion no hay ganador todavia, y "no tiene
        // proyecto ganador" se leia como que el distrito se habia quedado sin
        // nada. Con la 2026 recien abierta pasaba en los 20 distritos.
        <div className="mt-10 space-y-3">
          <Aviso>
            {edicion.etapa === "votacion"
              ? `La votación de la edición ${edicion.anio} está abierta: el proyecto ganador del distrito se conoce cuando termine. Las ideas de abajo están en orden alfabético.`
              : `La edición ${edicion.anio} está en la etapa “${ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}”: el proyecto ganador del distrito se elige en la votación.`}
          </Aviso>
          {anterior && ganadorAnterior && (
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              En la edición {anterior.anio} ganó en este distrito{" "}
              <Link
                href={conEdicion(
                  `/proyectos/${ganadorAnterior.slug}`,
                  anterior.activa ? null : anterior.anio,
                )}
                className="font-semibold underline"
                style={{ color: "var(--marca-texto)" }}
              >
                {ganadorAnterior.titulo}
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <div className="mt-10">
          <Aviso tono="atencion">
            Este distrito no tiene proyecto ganador en la edición {edicion.anio}.
            {distrito.ideas.length === 1
              ? " Se presentó una sola idea y fue declarada no factible."
              : ""}
          </Aviso>
        </div>
      )}

      {/* --- Mapa del distrito -------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Dónde están las ideas</h2>
        <p className="mt-2 max-w-prose text-sm" style={{ color: "var(--texto-suave)" }}>
          {/* Una edicion recien abierta no tiene ideas: "0 de las 0" no dice nada. */}
          {distrito.ideas.length === 0
            ? `Todavía no hay ideas presentadas en este distrito en la edición ${edicion.anio}.`
            : `${conPunto.length} de las ${distrito.ideas.length} ideas tienen una ubicación en el mapa. Los puntos con borde punteado son aproximados: esas ideas se cargaron sin coordenada y se ubican en el centro del distrito.`}
        </p>
        <div className="mt-4">
          <Mapa
            distritoActivo={numero}
            distritos={[
              {
                numero,
                nombre: distrito.nombre,
                ideas: distrito.ideas.length,
                color: ganador?.categoriaColor ?? null,
                etiquetaGanador: ganador?.titulo ?? null,
              },
            ]}
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
            mostrarEtiquetas={false}
            alto="26rem"
            edicionEnEnlaces={anioEnEnlaces}
          />
        </div>
      </section>

      {/* --- Todas las ideas ---------------------------------------------- */}
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-xl font-bold">
            Las otras ideas del distrito ({otras.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {[...porEstado.entries()].map(([estado, cantidad]) => (
              <span key={estado} title={DESCRIPCION_ESTADO[estado]}>
                <Chip>
                  {cantidad} {ETIQUETA_ESTADO[estado] ?? estado}
                </Chip>
              </span>
            ))}
          </div>
        </div>

        {otras.length ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {otras.map((idea) => (
              <TarjetaProyecto key={idea.slug} idea={idea} edicionEnEnlaces={anioEnEnlaces} />
            ))}
          </div>
        ) : (
          <div className="mt-5">
            <Vacio>No hay otras ideas cargadas para este distrito.</Vacio>
          </div>
        )}
      </section>
    </div>
  );
}
