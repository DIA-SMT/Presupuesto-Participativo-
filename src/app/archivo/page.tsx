import Link from "next/link";
import type { Metadata } from "next";
import { Chip, Vacio } from "@/components/ui";
import { getArchivoDeEdiciones } from "@/db/queries";
import { conEdicion } from "@/lib/ediciones";
import { ETIQUETA_ETAPA, formatearNumero } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Archivo de ediciones",
  description:
    "Ediciones anteriores del Presupuesto Participativo de San Miguel de Tucumán y sus proyectos.",
};

/**
 * Las ediciones del programa, cada una con lo que tiene para ver.
 *
 * Antes todas las tarjetas decian "Ver los proyectos" y llevaban a /proyectos
 * sin edicion, es decir a la activa: desde el archivo no se podia llegar a una
 * edicion anterior. Y se listaban tambien las ediciones sin ninguna idea (la
 * 2026 preparada de antemano, por ejemplo), con el mismo enlace, como si
 * hubiera algo para ver. Ahora:
 *
 *  - cada tarjeta lleva a SU edicion (`?edicion=AAAA`; la activa, sin
 *    parametro, que es su URL de siempre);
 *  - una edicion que no es la activa y no tiene ideas publicadas no se lista:
 *    no es parte del archivo, es una edicion que todavia no empezo o que quedo
 *    vacia;
 *  - la activa se lista siempre, marcada como la edicion en curso, pero sin
 *    enlaces mientras no tenga ideas publicadas.
 */
export default async function Archivo() {
  const ediciones = (await getArchivoDeEdiciones()).filter(
    (edicion) => edicion.activa || edicion.ideas > 0,
  );

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Archivo de ediciones</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Cada edición del programa queda publicada con todas sus ideas y su votación. Nada se
          borra al empezar una edición nueva.
        </p>
      </header>

      {ediciones.length ? (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ediciones.map((edicion) => {
            // La activa se enlaza sin parametro: es la URL de siempre de cada pagina.
            const anio = edicion.activa ? null : edicion.anio;
            return (
              <li key={edicion.id} className="superficie flex flex-col rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-3xl font-bold">{edicion.anio}</p>
                  {edicion.activa && <Chip color="var(--marca-texto)">Edición en curso</Chip>}
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
                  {ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}
                </p>

                {edicion.ideas > 0 ? (
                  <>
                    <p className="mt-4 text-sm">
                      {formatearNumero(edicion.ideas)}{" "}
                      {edicion.ideas === 1 ? "idea publicada" : "ideas publicadas"}
                      {edicion.ganadores > 0 && (
                        <>
                          {" · "}
                          {formatearNumero(edicion.ganadores)}{" "}
                          {edicion.ganadores === 1 ? "proyecto ganador" : "proyectos ganadores"}
                        </>
                      )}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                      <li>
                        <Link href={conEdicion("/proyectos", anio)} className="underline">
                          Ver los proyectos
                        </Link>
                      </li>
                      {edicion.ganadores > 0 && (
                        <li>
                          <Link href={conEdicion("/transparencia", anio)} className="underline">
                            Ver los ganadores
                          </Link>
                        </li>
                      )}
                      <li>
                        <Link href={conEdicion("/distritos", anio)} className="underline">
                          Ver los distritos
                        </Link>
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
                    Todavía no tiene ideas publicadas.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-8">
          <Vacio>Todavía no hay ediciones cargadas.</Vacio>
        </div>
      )}
    </div>
  );
}
