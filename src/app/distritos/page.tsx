import Link from "next/link";
import type { Metadata } from "next";
import AvisoEdicion from "@/components/AvisoEdicion";
import Mapa from "@/components/Mapa";
import { Chip, Vacio } from "@/components/ui";
import { getDistritos, getTextos } from "@/db/queries";
import { edicionDeLaPagina, resolverEdicion, tituloConEdicion } from "@/lib/edicion-en-vista";
import { conEdicion, votacionTerminada } from "@/lib/ediciones";
import { colorCategoria, formatearNumero } from "@/lib/formato";

const DESCRIPCION =
  "Los 20 distritos de San Miguel de Tucumán. Tocá tu distrito para ver las ideas presentadas y el proyecto ganador.";

type Props = { searchParams: Promise<{ edicion?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { edicion } = await searchParams;
  const resuelta = await resolverEdicion(edicion).catch(() => null);
  return { title: tituloConEdicion("Distritos", resuelta), description: DESCRIPCION };
}

export default async function Distritos({ searchParams }: Props) {
  const vista = await edicionDeLaPagina((await searchParams).edicion);
  if (!vista) {
    return (
      <div className="contenedor py-20">
        <Vacio>Todavía no hay una edición cargada.</Vacio>
      </div>
    );
  }
  const { edicion, anioEnEnlaces } = vista;

  const [textos, distritos] = await Promise.all([getTextos(), getDistritos(edicion.id)]);
  // Antes de que termine la votacion no hay ganadores, y "sin proyecto ganador"
  // en las 20 tarjetas de una edicion recien abierta se leia como que ningun
  // distrito habia elegido nada.
  const yaVoto = votacionTerminada(edicion.etapa);

  return (
    <div className="contenedor py-10 sm:py-14">
      <AvisoEdicion vista={vista} hrefActual="/distritos" />

      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {textos["distritos-titulo"] ?? "Distritos"}
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {textos["distritos-subtitulo"] ??
            "San Miguel de Tucumán está dividida en 20 distritos. Cada uno elige su propio proyecto."}
        </p>
      </header>

      <div className="mt-8">
        <Mapa
          distritos={distritos.map((d) => ({
            numero: d.numero,
            nombre: d.nombre,
            ideas: d.ideas,
            color: d.ganador?.categoriaColor ?? null,
            etiquetaGanador: d.ganador?.titulo ?? null,
          }))}
          alto="34rem"
          edicionEnEnlaces={anioEnEnlaces}
        />
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {distritos.map((distrito) => (
          <li key={distrito.numero}>
            <Link
              href={conEdicion(`/distritos/${distrito.numero}`, anioEnEnlaces)}
              className="superficie group flex h-full flex-col rounded-2xl p-5 transition hover:shadow-lg"
              style={{
                borderLeft: `4px solid ${
                  colorCategoria(
                    distrito.ganador?.categoriaSlug,
                    distrito.ganador?.categoriaColor,
                  ) ?? "var(--borde)"
                }`,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Distrito {distrito.numero}</h2>
                <Chip>
                  {distrito.ideas} {distrito.ideas === 1 ? "idea" : "ideas"}
                </Chip>
              </div>

              {distrito.referencia && (
                <p
                  className="mt-2 line-clamp-2 text-xs leading-relaxed"
                  style={{ color: "var(--texto-suave)" }}
                >
                  {distrito.referencia}
                </p>
              )}

              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--borde)" }}>
                {distrito.ganador ? (
                  <>
                    <p
                      className="text-[0.6875rem] font-semibold uppercase tracking-wider"
                      style={{ color: "var(--ganador-texto)" }}
                    >
                      Proyecto ganador
                    </p>
                    <p className="mt-1 text-sm font-medium leading-snug group-hover:underline">
                      {distrito.ganador.titulo}
                    </p>
                    {/* Decia ademas "· En preparación", el default del ETL (ver
                        scripts/etl.ts). Quedan los votos, que son reales. */}
                    <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                      {formatearNumero(distrito.ganador.votos)}{" "}
                      {distrito.ganador.votos === 1 ? "voto" : "votos"}
                    </p>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
                    {yaVoto
                      ? "Sin proyecto ganador en esta edición."
                      : "El proyecto ganador se elige en la votación."}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
