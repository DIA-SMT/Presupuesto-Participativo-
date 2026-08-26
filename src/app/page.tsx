import Link from "next/link";
import HeroInicio from "@/components/HeroInicio";
import Mapa from "@/components/Mapa";
import { Boton, Seccion, TarjetaProyecto, Vacio } from "@/components/ui";
import {
  getDistritos,
  getEdicionActiva,
  getEstadisticas,
  getHitos,
  getNovedades,
  getTextos,
  listarIdeas,
} from "@/db/queries";
import { ETIQUETA_ETAPA, formatearFecha, formatearNumero, formatearRango } from "@/lib/formato";

export default async function Home() {
  const edicion = await getEdicionActiva();
  if (!edicion) return <SinDatos />;

  const [textos, stats, distritos, ganadores, hitos, novedades] = await Promise.all([
    getTextos(),
    getEstadisticas(edicion),
    getDistritos(edicion.id),
    listarIdeas({ edicionId: edicion.id, soloGanadores: true, limite: 6 }),
    getHitos(edicion.id),
    getNovedades(3),
  ]);

  const t = (clave: string, defecto = "") => textos[clave] ?? defecto;

  return (
    <>
      {/* --- Portada ------------------------------------------------------- */}
      <HeroInicio />

      {/*
        Los numeros de la edicion. Estaban dentro de la portada anterior; con la
        portada nueva pasan a esta banda, que es angosta a proposito para no
        competir con ella. Son datos reales de la base, y sacarlos de la home
        seria esconder lo unico que dice de que tamano es el programa.
      */}
      <section
        aria-label={`Números de la edición ${stats.anio}`}
        style={{ borderBottom: "1px solid var(--borde)" }}
      >
        <div className="contenedor py-6">
          <dl className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
            {[
              { valor: formatearNumero(stats.ideas), etiqueta: "ideas presentadas" },
              { valor: String(stats.ganadores), etiqueta: "proyectos ganadores" },
              { valor: formatearNumero(stats.votos), etiqueta: "votos registrados" },
              { valor: "20", etiqueta: "distritos, uno por proyecto" },
            ].map((item) => (
              <div key={item.etiqueta} className="flex items-baseline gap-2">
                <dt className="sr-only">{item.etiqueta}</dt>
                <dd className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: "var(--color-marca-800)" }}
                  >
                    {item.valor}
                  </span>
                  <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
                    {item.etiqueta}
                  </span>
                </dd>
              </div>
            ))}
            <div className="ml-auto text-sm" style={{ color: "var(--texto-suave)" }}>
              Edición {stats.anio} · {ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}
            </div>
          </dl>
        </div>
      </section>

      {/* --- Qué es / cómo participo -------------------------------------- */}
      <Seccion titulo="Cómo funciona" bajada={undefined}>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { n: "1", titulo: t("home-bloque1-titulo", "¿Qué es?"), texto: t("home-bloque1-texto") },
            {
              n: "2",
              titulo: t("home-bloque2-titulo", "¿Cómo puedo participar?"),
              texto: t("home-bloque2-texto"),
            },
            {
              n: "3",
              titulo: t("home-bloque3-titulo", "¿Y después qué pasa?"),
              texto: t("home-bloque3-texto"),
            },
          ].map((bloque) => (
            <article key={bloque.n} className="superficie rounded-2xl p-6">
              <span
                className="grid h-9 w-9 place-items-center rounded-xl text-sm font-bold text-white"
                style={{ background: "var(--color-marca-700)" }}
                aria-hidden="true"
              >
                {bloque.n}
              </span>
              <h3 className="mt-4 text-lg font-semibold">{bloque.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                {bloque.texto}
              </p>
            </article>
          ))}
        </div>
      </Seccion>

      {/* --- Mapa --------------------------------------------------------- */}
      <div style={{ background: "var(--fondo-suave)" }}>
        <Seccion
          titulo={t("home-mapa-titulo", "Los 20 distritos")}
          bajada={t("home-mapa-texto")}
          accion={<Boton href="/distritos" variante="secundario">Ver todos los distritos</Boton>}
        >
          <Mapa
            distritos={distritos.map((d) => ({
              numero: d.numero,
              nombre: d.nombre,
              ideas: d.ideas,
              color: d.ganador?.categoriaColor ?? null,
              etiquetaGanador: d.ganador?.titulo ?? null,
            }))}
            alto="32rem"
          />
          <p className="mt-4 text-xs" style={{ color: "var(--texto-suave)" }}>
            Tocá un distrito o su número para ver sus ideas y su proyecto ganador.
            {stats.distritosSinGanador.length > 0 && (
              <>
                {" "}
                En esta edición el distrito {stats.distritosSinGanador.join(", ")} quedó sin
                proyecto ganador.
              </>
            )}
          </p>
        </Seccion>
      </div>

      {/* --- Ganadores ---------------------------------------------------- */}
      <Seccion
        titulo="Los proyectos más votados"
        bajada={`Cada distrito eligió su propio proyecto. Estos son los seis con más votos de la edición ${stats.anio}.`}
        accion={<Boton href="/proyectos?ganadores=1" variante="secundario">Ver los {stats.ganadores} ganadores</Boton>}
      >
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ganadores.map((idea) => (
            <TarjetaProyecto key={idea.slug} idea={idea} />
          ))}
        </div>
      </Seccion>

      {/* --- Cronograma --------------------------------------------------- */}
      {hitos.length > 0 && (
        <div style={{ background: "var(--fondo-suave)" }}>
          <Seccion titulo={`Cronograma ${stats.anio}`}>
            <ol className="relative grid gap-4">
              {hitos.map((hito) => (
                <li key={hito.id} className="superficie rounded-2xl p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold">{hito.titulo}</h3>
                    <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
                      {formatearRango(hito.desde, hito.hasta)}
                    </p>
                  </div>
                  {hito.detalle && (
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                      {hito.detalle}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Seccion>
        </div>
      )}

      {/* --- Novedades ---------------------------------------------------- */}
      <Seccion
        titulo={t("home-novedades-titulo", "Novedades y próximos encuentros")}
        bajada={t("home-novedades-texto")}
      >
        {novedades.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {novedades.map((novedad) => (
              <article key={novedad.id} className="superficie rounded-2xl p-5">
                <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                  {formatearFecha(novedad.fecha)}
                </p>
                <h3 className="mt-1.5 text-lg font-semibold leading-snug">{novedad.titulo}</h3>
                {novedad.copete && (
                  <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
                    {novedad.copete}
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Vacio>
            Todavía no hay novedades publicadas. Las reuniones de cada barrio se cargan desde el
            panel de administración y aparecen acá.
          </Vacio>
        )}
      </Seccion>
    </>
  );
}

function SinDatos() {
  return (
    <div className="contenedor py-24">
      <h1 className="text-2xl font-bold">Todavía no hay datos cargados</h1>
      <p className="mt-3 max-w-prose" style={{ color: "var(--texto-suave)" }}>
        No hay ninguna edición activa en la base. Si estás levantando el proyecto por primera vez,
        corré <code className="rounded bg-black/10 px-1.5 py-0.5">npm run setup</code> para crear la
        base y cargar la edición 2025.
      </p>
    </div>
  );
}
