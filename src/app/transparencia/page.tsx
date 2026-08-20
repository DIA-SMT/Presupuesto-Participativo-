import Link from "next/link";
import type { Metadata } from "next";
import { Aviso, Chip, Dato, Vacio } from "@/components/ui";
import { getEdicionActiva, getEstadisticas, getTextos, listarIdeas } from "@/db/queries";
import {
  ETAPAS_PRESUPUESTO,
  ETIQUETA_PRESUPUESTO,
  formatearNumero,
  formatearPesos,
} from "@/lib/formato";

export const metadata: Metadata = {
  title: "Transparencia y ejecución",
  description:
    "En qué etapa está cada proyecto ganador del Presupuesto Participativo de San Miguel de Tucumán y cuánto se ejecutó de su presupuesto.",
};

export default async function Transparencia() {
  const edicion = await getEdicionActiva();
  if (!edicion) {
    return (
      <div className="contenedor py-20">
        <Vacio>Todavía no hay una edición cargada.</Vacio>
      </div>
    );
  }

  const [textos, stats, ganadores] = await Promise.all([
    getTextos(),
    getEstadisticas(edicion),
    listarIdeas({ edicionId: edicion.id, soloGanadores: true }),
  ]);

  const sinMonto = ganadores.filter((g) => g.presupuestoTotal === null).length;

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {textos["transparencia-titulo"] ?? "Transparencia y ejecución"}
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {textos["transparencia-subtitulo"]}
        </p>
      </header>

      <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato valor={String(stats.ganadores)} etiqueta="proyectos ganadores" />
        <Dato valor={formatearNumero(stats.votos)} etiqueta="votos registrados" />
        <Dato
          valor={
            stats.presupuestoPublicado > 0
              ? formatearPesos(stats.presupuestoPublicado)
              : "Sin publicar"
          }
          etiqueta="presupuesto asignado"
          detalle={
            sinMonto > 0 ? `${sinMonto} de ${stats.ganadores} proyectos sin monto cargado` : undefined
          }
        />
        <Dato
          valor={String(stats.porEtapaPresupuesto["finalizado"] ?? 0)}
          etiqueta="obras finalizadas"
        />
      </dl>

      {sinMonto === stats.ganadores && stats.ganadores > 0 && (
        <div className="mt-6">
          <Aviso tono="atencion">
            <strong>Los montos todavía no están publicados.</strong> El sistema anterior tenía el
            campo de presupuesto sin usar: las {stats.ideas} ideas figuraban con el valor 1, que era
            un relleno y no un importe, así que no se migró ningún monto. La estructura para
            publicarlos —total y monto por etapa, con historial— ya está en el sitio y se completa
            desde el panel de administración.
          </Aviso>
        </div>
      )}

      {/* --- Etapas --------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold">En qué etapa está cada obra</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ETAPAS_PRESUPUESTO.map((etapa) => (
            <div key={etapa} className="superficie rounded-2xl p-5">
              <p className="text-3xl font-bold">{stats.porEtapaPresupuesto[etapa] ?? 0}</p>
              <p className="mt-1 text-sm font-medium">{ETIQUETA_PRESUPUESTO[etapa]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* --- Tabla ---------------------------------------------------------- */}
      <section className="mt-12">
        <h2 className="text-xl font-bold">Los {ganadores.length} proyectos ganadores</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Ordenados por cantidad de votos.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Proyectos ganadores con su distrito, votos, presupuesto y etapa de obra
            </caption>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--borde)" }}>
                <th scope="col" className="px-3 py-3 text-left font-semibold">
                  Distrito
                </th>
                <th scope="col" className="px-3 py-3 text-left font-semibold">
                  Proyecto
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Votos
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Presupuesto
                </th>
                <th scope="col" className="px-3 py-3 text-left font-semibold">
                  Etapa
                </th>
              </tr>
            </thead>
            <tbody>
              {ganadores.map((idea) => (
                <tr key={idea.slug} style={{ borderBottom: "1px solid var(--borde)" }}>
                  <td className="px-3 py-3 font-medium">
                    <Link href={`/distritos/${idea.distrito}`} className="hover:underline">
                      D{idea.distrito}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/proyectos/${idea.slug}`} className="font-medium hover:underline">
                      {idea.titulo}
                    </Link>
                    {idea.categoriaNombre && (
                      <span className="mt-1 block text-xs" style={{ color: "var(--texto-suave)" }}>
                        {idea.categoriaNombre}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">
                    {formatearNumero(idea.votos)}
                  </td>
                  <td
                    className="px-3 py-3 text-right tabular-nums"
                    style={{
                      color:
                        idea.presupuestoTotal === null ? "var(--texto-suave)" : "var(--texto)",
                    }}
                  >
                    {idea.presupuestoTotal === null
                      ? "Sin publicar"
                      : formatearPesos(idea.presupuestoTotal)}
                  </td>
                  <td className="px-3 py-3">
                    <Chip>
                      {ETIQUETA_PRESUPUESTO[idea.estadoPresupuesto] ?? idea.estadoPresupuesto}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-3" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatearNumero(stats.votos)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {stats.presupuestoPublicado > 0
                    ? formatearPesos(stats.presupuestoPublicado)
                    : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {stats.distritosSinGanador.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Distritos sin proyecto ganador</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            En la edición {stats.anio} el distrito{" "}
            {stats.distritosSinGanador.join(", ")} no eligió proyecto. Publicarlo es parte de la
            información: muestra dónde el programa todavía no llegó.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.distritosSinGanador.map((numero) => (
              <Link
                key={numero}
                href={`/distritos/${numero}`}
                className="superficie rounded-xl px-3.5 py-2 text-sm font-medium"
              >
                Distrito {numero}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xl font-bold">Datos abiertos</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Los datos de este sitio se pueden descargar y reutilizar libremente.
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <a href="/geo/distritos.geojson" className="font-medium underline">
              distritos.geojson
            </a>{" "}
            — geometría de los 20 distritos (EPSG:4326)
          </li>
          <li>
            <a href="/api/proyectos" className="font-medium underline">
              /api/proyectos
            </a>{" "}
            — todas las ideas de la edición vigente en JSON
          </li>
          <li>
            <a href="/api/proyectos?formato=csv" className="font-medium underline">
              /api/proyectos?formato=csv
            </a>{" "}
            — lo mismo en CSV
          </li>
        </ul>
      </section>
    </div>
  );
}
