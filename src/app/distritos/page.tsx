import Link from "next/link";
import type { Metadata } from "next";
import Mapa from "@/components/Mapa";
import { Chip, Vacio } from "@/components/ui";
import { getDistritos, getEdicionActiva, getTextos } from "@/db/queries";
import { ETIQUETA_PRESUPUESTO, formatearNumero } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Distritos",
  description:
    "Los 20 distritos de San Miguel de Tucumán. Tocá tu distrito para ver las ideas presentadas y el proyecto ganador.",
};

export default async function Distritos() {
  const edicion = await getEdicionActiva();
  if (!edicion) {
    return (
      <div className="contenedor py-20">
        <Vacio>Todavía no hay una edición cargada.</Vacio>
      </div>
    );
  }

  const [textos, distritos] = await Promise.all([getTextos(), getDistritos(edicion.id)]);

  return (
    <div className="contenedor py-10 sm:py-14">
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
        />
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {distritos.map((distrito) => (
          <li key={distrito.numero}>
            <Link
              href={`/distritos/${distrito.numero}`}
              className="superficie group flex h-full flex-col rounded-2xl p-5 transition hover:shadow-lg"
              style={{
                borderLeft: `4px solid ${distrito.ganador?.categoriaColor ?? "var(--borde)"}`,
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
                      style={{ color: "var(--color-estado-ganador)" }}
                    >
                      Proyecto ganador
                    </p>
                    <p className="mt-1 text-sm font-medium leading-snug group-hover:underline">
                      {distrito.ganador.titulo}
                    </p>
                    <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                      {formatearNumero(distrito.ganador.votos)} votos ·{" "}
                      {ETIQUETA_PRESUPUESTO[distrito.ganador.estadoPresupuesto] ?? ""}
                    </p>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
                    Sin proyecto ganador en esta edición.
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
