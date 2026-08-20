import Link from "next/link";
import Mapa from "@/components/Mapa";
import { Boton, Dato, Seccion, TarjetaProyecto, Vacio } from "@/components/ui";
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
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(150deg, var(--color-marca-950) 0%, var(--color-marca-800) 45%, var(--color-marca-600) 100%)",
        }}
      >
        {/* La flor del logo como marca de agua. */}
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-[26rem] w-[26rem] opacity-[0.14] sm:h-[34rem] sm:w-[34rem]"
        >
          <path d="M37 4 C 8 26, 2 60, 27 93 C 40 72, 45 38, 37 4 Z" fill="#ffffff" />
          <path d="M72 18 C 97 42, 94 74, 60 92 C 51 68, 55 42, 72 18 Z" fill="#ffffff" opacity="0.8" />
          <circle cx="63" cy="11" r="11" fill="var(--color-sol)" opacity="0.9" />
        </svg>
        <div className="contenedor relative grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div className="text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
              {t("home-hero-volanta", "Municipalidad de San Miguel de Tucumán")}
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.1] sm:text-5xl">
              {t("home-hero-titulo", "Vos decidís en qué se invierte tu barrio")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              {t("home-hero-texto")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/proyectos"
                className="inline-flex items-center rounded-xl bg-white px-5 py-3 text-sm font-semibold transition hover:bg-white/90"
                style={{ color: "var(--color-marca-900)" }}
              >
                {t("home-hero-boton", "Ver los proyectos")}
              </Link>
              <Link
                href="/distritos"
                className="inline-flex items-center rounded-xl border border-white/35 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Buscá tu distrito
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/70">
              Edición {stats.anio} · {ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}
            </p>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              { valor: formatearNumero(stats.ideas), etiqueta: "ideas presentadas" },
              { valor: String(stats.ganadores), etiqueta: "proyectos ganadores" },
              { valor: formatearNumero(stats.votos), etiqueta: "votos registrados" },
              { valor: "20", etiqueta: "distritos, uno por proyecto" },
            ].map((item) => (
              <div
                key={item.etiqueta}
                className="rounded-2xl border border-white/20 bg-white/10 p-5 text-white backdrop-blur-sm"
              >
                <dt className="sr-only">{item.etiqueta}</dt>
                <dd>
                  <span className="block text-3xl font-bold sm:text-4xl">{item.valor}</span>
                  <span className="mt-1 block text-sm text-white/80">{item.etiqueta}</span>
                </dd>
              </div>
            ))}
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
