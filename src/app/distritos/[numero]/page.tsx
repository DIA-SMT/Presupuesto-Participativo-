import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Mapa from "@/components/Mapa";
import { Aviso, Chip, ChipEstado, Dato, TarjetaProyecto, Vacio } from "@/components/ui";
import { getDistrito, getEdicionActiva } from "@/db/queries";
import {
  DESCRIPCION_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_PRESUPUESTO,
  formatearNumero,
} from "@/lib/formato";

type Props = { params: Promise<{ numero: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { numero } = await params;
  return {
    title: `Distrito ${numero}`,
    description: `Ideas presentadas y proyecto ganador del Distrito ${numero} del Presupuesto Participativo de San Miguel de Tucumán.`,
  };
}


export default async function PaginaDistrito({ params }: Props) {
  const { numero: crudo } = await params;
  const numero = Number(crudo);
  if (!Number.isInteger(numero) || numero < 1 || numero > 20) notFound();

  const edicion = await getEdicionActiva();
  if (!edicion) notFound();

  const distrito = await getDistrito(numero, edicion.id);
  if (!distrito) notFound();

  const ganador = distrito.ganador;
  const otras = distrito.ideas.filter((idea) => !idea.ganador);
  const conPunto = distrito.ideas.filter((idea) => idea.lat !== null);

  const porEstado = new Map<string, number>();
  for (const idea of distrito.ideas) {
    porEstado.set(idea.estado, (porEstado.get(idea.estado) ?? 0) + 1);
  }

  return (
    <div className="contenedor py-10 sm:py-14">
      <nav aria-label="Camino de navegación" className="text-sm" style={{ color: "var(--texto-suave)" }}>
        <Link href="/distritos" className="hover:underline">
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
              href={`/distritos/${numero - 1}`}
              className="superficie rounded-xl px-3.5 py-2 text-sm font-medium"
            >
              ← D{numero - 1}
            </Link>
          )}
          {numero < 20 && (
            <Link
              href={`/distritos/${numero + 1}`}
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
        <Dato
          valor={
            ganador ? (ETIQUETA_PRESUPUESTO[ganador.estadoPresupuesto] ?? "—") : "Sin ganador"
          }
          etiqueta="estado de la obra"
        />
      </dl>

      {/* --- Proyecto ganador --------------------------------------------- */}
      {ganador ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Proyecto ganador</h2>
          <article
            className="superficie mt-4 rounded-2xl p-6"
            style={{ borderLeft: `5px solid ${ganador.categoriaColor ?? "var(--borde)"}` }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <ChipEstado estado="ganador" />
              {ganador.categoriaNombre && (
                <Chip color={ganador.categoriaColor ?? undefined}>{ganador.categoriaNombre}</Chip>
              )}
              <Chip color="var(--color-estado-ganador)">
                {formatearNumero(ganador.votos)} votos
              </Chip>
            </div>

            <h3 className="mt-3 text-2xl font-bold leading-tight">
              <Link href={`/proyectos/${ganador.slug}`} className="hover:underline">
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
              href={`/proyectos/${ganador.slug}`}
              className="mt-5 inline-flex rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Ver el proyecto y su avance
            </Link>
          </article>
        </section>
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
          {conPunto.length} de las {distrito.ideas.length} ideas tienen una ubicación en el mapa.
          Los puntos con borde punteado son aproximados: esas ideas se cargaron sin coordenada y se
          ubican en el centro del distrito.
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
              color: idea.categoriaColor ?? "var(--color-marca-600)",
              estado: idea.estado,
              ganador: idea.ganador,
              aproximada: idea.ubicacionAproximada,
            }))}
            mostrarEtiquetas={false}
            alto="26rem"
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
              <TarjetaProyecto key={idea.slug} idea={idea} />
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
