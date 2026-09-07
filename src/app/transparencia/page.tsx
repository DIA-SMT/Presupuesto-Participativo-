import Link from "next/link";
import type { Metadata } from "next";
import { Vacio } from "@/components/ui";
import { getEdicionActiva, getEstadisticas, listarIdeas } from "@/db/queries";
import { formatearNumero } from "@/lib/formato";

/**
 * Que gano en cada distrito y con cuantos votos.
 *
 * ESTA PAGINA MOSTRABA LA EJECUCION PRESUPUESTARIA y se le saco, porque no habia
 * ni un dato real que sostenerla:
 *
 *  - Ningun monto: el sistema anterior traia `presupuesto-total = 1` en las 100
 *    ideas como relleno, asi que el ETL no migro ningun importe (ver
 *    data/reporte-limpieza.md). Los 19 ganadores estaban los 19 "Sin publicar".
 *  - Ninguna etapa informada: el "19 en preparación" que mostraba no lo cargo
 *    nadie, es el valor que el ETL le pone por defecto a todo ganador
 *    (scripts/etl.ts, `estadoPresupuesto`). Se leia como el estado real de 19
 *    obras y era una constante de la migracion, que es peor que un cero.
 *  - Y desde que el panel se recorto no queda pantalla para cargarlos, asi que
 *    el aviso que prometia que "se completa desde el panel de administración"
 *    tampoco era cierto. Ese aviso, que es el que rinde cuentas de por que no
 *    hay montos, se mudo a /acerca-de: es informacion, no se tira.
 *
 * Queda lo que si esta cargado y verificado: los ganadores, sus votos y los
 * distritos que no eligieron proyecto. Si algun dia el municipio carga montos,
 * la estructura sigue entera en la base (`ideas.presupuesto_total`, la tabla
 * `avances`) y la ficha de cada proyecto ya sabe dibujarlos.
 *
 * El titulo y el subtitulo estan ACA y no en la tabla `textos`. Salian de la
 * base, pero la pantalla que los editaba (/admin/contenido) se borro: en la base
 * quedaban inmutables en la practica, y encima decian "cuánto se ejecutó de su
 * presupuesto". En el codigo quedan versionados y se revisan en un diff.
 */
export const metadata: Metadata = {
  title: "Transparencia",
  description:
    "Qué proyecto ganó en cada distrito del Presupuesto Participativo de San Miguel de Tucumán y con cuántos votos.",
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

  const [stats, ganadores] = await Promise.all([
    getEstadisticas(edicion),
    listarIdeas({ edicionId: edicion.id, soloGanadores: true }),
  ]);

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Transparencia</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Qué proyecto ganó en cada distrito y con cuántos votos. Todos los datos de esta página se
          pueden descargar.
        </p>
      </header>

      {/* --- Tabla ---------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">
          {ganadores.length === 1
            ? "El proyecto ganador"
            : `Los ${ganadores.length} proyectos ganadores`}
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Edición {stats.anio}, ordenados por cantidad de votos.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <caption className="sr-only">
              Proyectos ganadores de la edición {stats.anio} con su distrito y sus votos
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
