import { Suspense } from "react";
import type { Metadata } from "next";
import Filtros from "@/components/Filtros";
import Mapa from "@/components/Mapa";
import { Chip, TarjetaProyecto, Vacio } from "@/components/ui";
import {
  getCategorias,
  getEdicionActiva,
  getTextos,
  listarIdeas,
  type EstadoIdea,
} from "@/db/queries";
import { ETIQUETA_ESTADO, formatearNumero } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Proyectos e ideas",
  description:
    "Todas las ideas presentadas al Presupuesto Participativo de San Miguel de Tucumán, con su evaluación técnica y los proyectos ganadores de cada distrito.",
};

const ESTADOS: EstadoIdea[] = ["ganador", "factible", "no_factible", "integrado", "pendiente"];

type Props = {
  searchParams: Promise<{
    distrito?: string;
    categoria?: string;
    estado?: string;
    q?: string;
    ganadores?: string;
    vista?: string;
  }>;
};

export default async function Proyectos({ searchParams }: Props) {
  const filtros = await searchParams;
  const edicion = await getEdicionActiva();
  if (!edicion) {
    return (
      <div className="contenedor py-20">
        <Vacio>Todavía no hay una edición cargada.</Vacio>
      </div>
    );
  }

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
    }),
  ]);

  const conPunto = lista.filter((idea) => idea.lat !== null);
  const enMapa = filtros.vista !== "lista";

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {textos["proyectos-titulo"] ?? "Proyectos e ideas"}
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {textos["proyectos-subtitulo"]}
        </p>
      </header>

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
            <VistaEnlace filtros={filtros} destino="mapa" activo={enMapa}>
              Con mapa
            </VistaEnlace>
            <VistaEnlace filtros={filtros} destino="lista" activo={!enMapa}>
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
              color: idea.categoriaColor ?? "var(--color-marca-600)",
              estado: idea.estado,
              ganador: idea.ganador,
              aproximada: idea.ubicacionAproximada,
            }))}
            distritos={[]}
            mostrarEtiquetas={false}
            alto="28rem"
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
            <TarjetaProyecto key={idea.slug} idea={idea} />
          ))}
        </div>
      ) : (
        <div className="mt-7">
          <Vacio>
            Probá quitando algún filtro, o buscá por el nombre de la plaza o el club.
          </Vacio>
        </div>
      )}
    </div>
  );
}

function VistaEnlace({
  filtros,
  destino,
  activo,
  children,
}: {
  filtros: Record<string, string | undefined>;
  destino: "mapa" | "lista";
  activo: boolean;
  children: React.ReactNode;
}) {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor && clave !== "vista") parametros.set(clave, valor);
  }
  if (destino === "lista") parametros.set("vista", "lista");
  const consulta = parametros.toString();

  return (
    <a
      href={consulta ? `/proyectos?${consulta}` : "/proyectos"}
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
