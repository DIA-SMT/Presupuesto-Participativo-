import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Mapa from "@/components/Mapa";
import { Chip, ChipEstado, TarjetaProyecto, Vacio } from "@/components/ui";
import { getAvances, getEdicionActiva, getIdea, listarIdeas } from "@/db/queries";
import {
  DESCRIPCION_ESTADO,
  ETAPAS_PRESUPUESTO,
  ETIQUETA_PRESUPUESTO,
  formatearFecha,
  formatearNumero,
  formatearPesos,
  recortar,
} from "@/lib/formato";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const idea = await getIdea(slug).catch(() => null);
  if (!idea) return { title: "Proyecto no encontrado" };
  return {
    title: idea.titulo,
    description: recortar(
      idea.problema ?? idea.solucion ?? `Proyecto del Distrito ${idea.distrito}.`,
      160,
    ),
  };
}

export default async function PaginaProyecto({ params }: Props) {
  const { slug } = await params;
  const idea = await getIdea(slug);
  if (!idea) notFound();

  const edicion = await getEdicionActiva();
  const avances = idea.ganador ? await getAvances(idea.id) : [];
  const relacionadas = edicion
    ? (await listarIdeas({ edicionId: edicion.id, distrito: idea.distrito, limite: 4 })).filter(
        (otra) => otra.slug !== idea.slug,
      )
    : [];

  const secciones = [
    { titulo: "El problema", texto: idea.problema },
    { titulo: "La propuesta", texto: idea.solucion },
    { titulo: "Beneficios para el barrio", texto: idea.beneficios },
  ];
  const conTexto = secciones.filter((s) => s.texto);

  return (
    <div className="contenedor py-10 sm:py-14">
      <nav aria-label="Camino de navegación" className="text-sm" style={{ color: "var(--texto-suave)" }}>
        <Link href="/proyectos" className="hover:underline">
          Proyectos
        </Link>
        <span aria-hidden="true"> / </span>
        <Link href={`/distritos/${idea.distrito}`} className="hover:underline">
          Distrito {idea.distrito}
        </Link>
      </nav>

      <header className="mt-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <ChipEstado estado={idea.estado} />
          {idea.categoriaNombre && (
            <Chip color={idea.categoriaColor ?? undefined}>{idea.categoriaNombre}</Chip>
          )}
          <Chip>Distrito {idea.distrito}</Chip>
          {idea.ganador && idea.votos > 0 && (
            <Chip color="var(--color-estado-ganador)">
              {formatearNumero(idea.votos)} votos
            </Chip>
          )}
          <Chip>Edición {idea.anio}</Chip>
        </div>

        <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{idea.titulo}</h1>

        {idea.barrio && (
          <p className="mt-2 text-base" style={{ color: "var(--texto-suave)" }}>
            Barrio {idea.barrio}
          </p>
        )}

        <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
          {DESCRIPCION_ESTADO[idea.estado]}
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* --- Contenido -------------------------------------------------- */}
        <div className="min-w-0">
          {conTexto.length ? (
            <div className="space-y-8">
              {conTexto.map((seccion) => (
                <section key={seccion.titulo}>
                  <h2 className="text-xl font-bold">{seccion.titulo}</h2>
                  <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed">
                    {seccion.texto!.split("\n").filter(Boolean).map((parrafo, indice) => (
                      <p key={indice}>{parrafo}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <Vacio>
              El texto completo de esta idea no está cargado en el sistema. El relevamiento del sitio
              anterior sólo recuperó el contenido de los proyectos ganadores.
            </Vacio>
          )}

          {secciones.some((s) => !s.texto) && conTexto.length > 0 && (
            <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
              Faltan cargar:{" "}
              {secciones
                .filter((s) => !s.texto)
                .map((s) => s.titulo.toLowerCase())
                .join(", ")}
              .
            </p>
          )}

          {idea.motivoEstado && (
            <section className="mt-10">
              <h2 className="text-xl font-bold">Devolución del equipo técnico</h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed">{idea.motivoEstado}</p>
            </section>
          )}

          {/*
            --- Seguimiento de obra --------------------------------------
            La barra de las cuatro etapas se dibuja SOLO si el municipio informo
            algun avance. Antes se dibujaba siempre, y como el ETL le ponia
            `preparacion` a todo ganador —una constante del script, no un dato
            que alguien informara—, pintaba la primera etapa como ya alcanzada,
            con aria-current="step", en los 19 proyectos. Era un progreso
            inventado, y dibujado como verificado.

            Sin avances queda una linea que dice que no hay informacion. No se
            esconde: que falte el dato es informacion, y este proyecto prefiere
            mostrar lo que falta antes que rellenarlo (el mismo criterio del
            componente `Pendiente` de ui.tsx). Lo que se saco es la promesa de
            quien lo carga y cuando: el aviso decia que el municipio los carga
            "desde el panel de administración", y esa pantalla ya no existe.
          -------------------------------------------------------------- */}
          {idea.ganador && (
            <section className="mt-12">
              <h2 className="text-xl font-bold">Avance de la obra</h2>

              {avances.length ? (
                <>
                  <ol className="mt-4 grid gap-2 sm:grid-cols-4">
                    {ETAPAS_PRESUPUESTO.map((etapa, indice) => {
                      const actual = ETAPAS_PRESUPUESTO.indexOf(
                        idea.estadoPresupuesto as (typeof ETAPAS_PRESUPUESTO)[number],
                      );
                      const alcanzada = actual >= indice && actual !== -1;
                      return (
                        <li
                          key={etapa}
                          className="rounded-xl px-3 py-2.5 text-xs font-medium"
                          style={{
                            background: alcanzada
                              ? "color-mix(in srgb, var(--color-marca-600) 16%, transparent)"
                              : "var(--fondo-suave)",
                            border: `1px solid ${
                              alcanzada
                                ? "color-mix(in srgb, var(--color-marca-600) 38%, transparent)"
                                : "var(--borde)"
                            }`,
                            color: alcanzada ? "var(--color-marca-600)" : "var(--texto-suave)",
                          }}
                          aria-current={actual === indice ? "step" : undefined}
                        >
                          {indice + 1}. {ETIQUETA_PRESUPUESTO[etapa]}
                        </li>
                      );
                    })}
                  </ol>

                  <ol className="mt-6 space-y-4">
                    {avances.map((avance) => (
                      <li key={avance.id} className="superficie rounded-2xl p-5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <h3 className="text-base font-semibold">{avance.titulo}</h3>
                          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
                            {formatearFecha(avance.fecha)}
                          </p>
                        </div>
                        <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
                          {ETIQUETA_PRESUPUESTO[avance.etapa] ?? avance.etapa}
                          {avance.monto ? ` · ${formatearPesos(Number(avance.monto))}` : ""}
                          {avance.porcentaje !== null ? ` · ${avance.porcentaje}% ejecutado` : ""}
                        </p>
                        {avance.descripcion && (
                          <p className="mt-2 text-sm leading-relaxed">{avance.descripcion}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p
                  className="mt-3 text-[0.9375rem] leading-relaxed"
                  style={{ color: "var(--texto-suave)" }}
                >
                  Todavía no hay información sobre el avance de esta obra. Cuando el municipio la
                  informe, va a aparecer acá con su fecha y su monto.
                </p>
              )}
            </section>
          )}

          {/* --- Trazabilidad de la migración --------------------------- */}
          {idea.notasMigracion.length > 0 && (
            <details className="superficie mt-12 rounded-2xl p-5">
              <summary className="cursor-pointer text-sm font-semibold">
                Notas sobre el dato original ({idea.notasMigracion.length})
              </summary>
              <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
                Esta idea viene de la edición {idea.anio}, cargada en el sitio anterior. Estas son
                las correcciones aplicadas al migrarla:
              </p>
              <ul className="mt-3 space-y-1.5 pl-4 text-sm" style={{ color: "var(--texto-suave)" }}>
                {idea.notasMigracion.map((nota, indice) => (
                  <li key={indice} className="list-disc">
                    {nota}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        {/* --- Columna lateral -------------------------------------------- */}
        <aside className="space-y-5">
          <div className="superficie rounded-2xl p-5">
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--texto-suave)" }}>
              Ficha
            </h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Fila etiqueta="Distrito">
                <Link href={`/distritos/${idea.distrito}`} className="underline">
                  Distrito {idea.distrito}
                </Link>
              </Fila>
              <Fila etiqueta="Categoría">{idea.categoriaNombre ?? "Sin categoría"}</Fila>
              {idea.barrio && <Fila etiqueta="Barrio">{idea.barrio}</Fila>}
              {idea.ganador && (
                <Fila etiqueta="Votos">{formatearNumero(idea.votos)}</Fila>
              )}
              <Fila etiqueta="Presupuesto">
                {idea.presupuestoTotal === null ? (
                  <span style={{ color: "var(--texto-suave)" }}>Sin publicar</span>
                ) : (
                  formatearPesos(idea.presupuestoTotal)
                )}
              </Fila>
              {/*
                La fila "Estado de obra" salio de esta lista. Mostraba
                `estadoPresupuesto`, que en los 19 ganadores decia "En
                preparación" por el default del ETL. Con el dato corregido diria
                "Sin presupuesto asignado", que es lo mismo que la fila de arriba
                ya dice mejor ("Presupuesto: Sin publicar"), y con una etiqueta
                que habla de la obra para un dato que habla de la plata. La etapa
                real, cuando la haya, la dice la seccion "Avance de la obra".
              */}
              {idea.fecha && <Fila etiqueta="Presentada">{formatearFecha(idea.fecha)}</Fila>}
            </dl>
          </div>

          {idea.lat !== null && idea.lon !== null && (
            <div>
              <Mapa
                distritoActivo={idea.distrito}
                distritos={[
                  {
                    numero: idea.distrito,
                    nombre: `Distrito ${idea.distrito}`,
                    ideas: 1,
                    color: idea.categoriaColor ?? null,
                    etiquetaGanador: null,
                  },
                ]}
                puntos={[
                  {
                    slug: idea.slug,
                    titulo: idea.titulo,
                    distrito: idea.distrito,
                    lat: idea.lat,
                    lon: idea.lon,
                    color: idea.categoriaColor ?? "var(--color-marca-600)",
                    estado: idea.estado,
                    ganador: idea.ganador,
                    aproximada: idea.ubicacionAproximada,
                  },
                ]}
                mostrarEtiquetas={false}
                alto="18rem"
              />
              {idea.ubicacionAproximada && (
                <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                  Ubicación aproximada: la idea se cargó sin coordenada, así que el punto marca el
                  centro del distrito y no el lugar exacto de la obra.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {relacionadas.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-bold">Otras ideas del Distrito {idea.distrito}</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {relacionadas.slice(0, 3).map((otra) => (
              <TarjetaProyecto key={otra.slug} idea={otra} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt style={{ color: "var(--texto-suave)" }}>{etiqueta}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
