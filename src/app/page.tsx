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
  getUltimaEdicionTerminadaConGanadores,
  listarIdeas,
  type Edicion,
  type Estadisticas,
  type IdeaVista,
} from "@/db/queries";
import { conEdicion } from "@/lib/ediciones";
import {
  ETIQUETA_ETAPA,
  formatearFecha,
  formatearNumero,
  formatearRango,
  hoyEnTucuman,
} from "@/lib/formato";
import { portadaSegunEtapa } from "@/lib/portada";

/**
 * Los ganadores que muestra la portada. Los de la edicion activa si ya voto; si
 * no, los de la ultima que termino de votar (con la 2026 abierta, los 19 de
 * 2025). Antes mostraba siempre los de la activa: con una edicion nueva, una
 * grilla vacia y "Ver los 0 ganadores".
 */
type Destacados = {
  anio: number;
  /** El año para `?edicion` en los enlaces; null si son de la activa. */
  anioEnEnlaces: number | null;
  ideas: IdeaVista[];
  /** Cuantos ganadores tiene esa edicion en total, para el boton. */
  total: number;
};

async function destacados(
  edicion: Edicion,
  yaVoto: boolean,
  stats: Promise<Estadisticas>,
): Promise<Destacados | null> {
  if (yaVoto) {
    const [ideas, { ganadores }] = await Promise.all([
      listarIdeas({ edicionId: edicion.id, soloGanadores: true, limite: 6 }),
      stats,
    ]);
    return {
      anio: edicion.anio,
      anioEnEnlaces: null,
      ideas,
      total: ganadores,
    };
  }
  // La activa todavia no voto, asi que la ultima que termino de votar es otra
  // (ver getUltimaEdicionTerminadaConGanadores): nunca es la activa.
  const anterior = await getUltimaEdicionTerminadaConGanadores();
  if (!anterior) return null;
  return {
    anio: anterior.anio,
    anioEnEnlaces: anterior.anio,
    ideas: await listarIdeas({ edicionId: anterior.id, soloGanadores: true, limite: 6 }),
    total: anterior.ganadores.length,
  };
}

export default async function Home() {
  const edicion = await getEdicionActiva();
  if (!edicion) return <SinDatos />;

  const portada = portadaSegunEtapa(edicion, hoyEnTucuman());
  const pedidoStats = getEstadisticas(edicion);
  const [textos, stats, distritos, ganadores, hitos, novedades] = await Promise.all([
    getTextos(),
    pedidoStats,
    getDistritos(edicion.id),
    destacados(edicion, portada.yaVoto, pedidoStats),
    getHitos(edicion.id),
    getNovedades(3),
  ]);

  const t = (clave: string, defecto = "") => textos[clave] ?? defecto;

  // Los numeros de la banda, segun lo que ya paso. Antes de votar no hay
  // ganadores ni votos que contar, y "0 proyectos ganadores" se leia como un
  // programa que no dio nada. Mientras se vota, los votos no se muestran: si se
  // publican los parciales es una decision que falta tomar (ver README).
  const numeros = portada.yaVoto
    ? [
        { valor: formatearNumero(stats.ideas), etiqueta: "ideas presentadas" },
        { valor: String(stats.ganadores), etiqueta: "proyectos ganadores" },
        { valor: formatearNumero(stats.votos), etiqueta: "votos registrados" },
      ]
    : edicion.etapa === "votacion"
      ? [
          {
            valor: formatearNumero(stats.porEstado.factible ?? 0),
            etiqueta: "proyectos en votación",
          },
        ]
      : [{ valor: formatearNumero(stats.ideas), etiqueta: "ideas presentadas" }];

  return (
    <>
      {/* --- Portada ------------------------------------------------------- */}
      <HeroInicio
        momento={portada.momento}
        principal={portada.principal}
        secundaria={portada.secundaria}
      />

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
            {[...numeros, { valor: "20", etiqueta: "distritos, uno por proyecto" }].map((item) => (
              <div key={item.etiqueta} className="flex items-baseline gap-2">
                <dt className="sr-only">{item.etiqueta}</dt>
                <dd className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: "var(--marca-texto)" }}
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
            {/* Antes de votar, todos los distritos estan "sin ganador": decirlo
                era anunciar que los 20 se habian quedado sin nada. */}
            {portada.yaVoto
              ? "Tocá un distrito o su número para ver sus ideas y su proyecto ganador."
              : "Tocá un distrito o su número para ver sus ideas."}
            {portada.yaVoto && stats.distritosSinGanador.length > 0 && (
              <> {fraseSinGanador(stats.distritosSinGanador)}</>
            )}
          </p>
        </Seccion>
      </div>

      {/* --- Ganadores ---------------------------------------------------- */}
      {ganadores && ganadores.ideas.length > 0 ? (
        <Seccion
          titulo={
            ganadores.anioEnEnlaces === null
              ? "Los proyectos más votados"
              : `Los ganadores de ${ganadores.anio}`
          }
          bajada={bajadaGanadores(ganadores, edicion.anio)}
          accion={
            <Boton
              href={conEdicion("/proyectos?ganadores=1", ganadores.anioEnEnlaces)}
              variante="secundario"
            >
              {ganadores.anioEnEnlaces === null
                ? `Ver los ${ganadores.total} ganadores`
                : `Ver los ${ganadores.total} ganadores de ${ganadores.anio}`}
            </Boton>
          }
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ganadores.ideas.map((idea) => (
              <TarjetaProyecto
                key={idea.slug}
                idea={idea}
                edicionEnEnlaces={ganadores.anioEnEnlaces}
              />
            ))}
          </div>
        </Seccion>
      ) : (
        portada.yaVoto && (
          // Ya voto pero todavia no se proclamo ningun ganador: el escrutinio
          // esta en curso. Sin esto volvia "Ver los 0 ganadores".
          <Seccion titulo="Los proyectos más votados">
            <Vacio>
              Los proyectos ganadores de la edición {edicion.anio} se publican acá apenas se
              proclamen.
            </Vacio>
          </Seccion>
        )
      )}

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

/**
 * "el distrito 7 quedó sin proyecto ganador", o "los distritos 2, 10 y 13
 * quedaron…". Decia siempre "el distrito 2, 10, 13 quedó", en singular aunque
 * fueran diez.
 */
function fraseSinGanador(distritos: number[]): string {
  if (distritos.length === 1) {
    return `En esta edición el distrito ${distritos[0]} quedó sin proyecto ganador.`;
  }
  const lista = new Intl.ListFormat("es", { type: "conjunction" }).format(distritos.map(String));
  return `En esta edición los distritos ${lista} quedaron sin proyecto ganador.`;
}

/** Hasta seis, que es lo que muestra la grilla: "los seis con más votos". */
const EN_LETRAS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis"];

/**
 * La bajada de la seccion. No dice que los proyectos "estan en obra": el sitio
 * no tiene cargado ningun avance, y la etapa "seguimiento" no lo garantiza.
 */
function bajadaGanadores(ganadores: Destacados, anioActivo: number): string {
  const mostrados = ganadores.ideas.length;
  const enLetras = (n: number) => EN_LETRAS[n] ?? String(n);
  if (ganadores.anioEnEnlaces === null) {
    const cuales =
      ganadores.total > mostrados
        ? `Estos son los ${enLetras(mostrados)} con más votos`
        : ganadores.total === 1
          ? "Este es el ganador"
          : `Estos son los ${enLetras(ganadores.total)} ganadores`;
    return `Cada distrito eligió su propio proyecto. ${cuales} de la edición ${ganadores.anio}.`;
  }
  const cuales =
    ganadores.total > mostrados
      ? `estos son los ${enLetras(mostrados)} más votados de los ${ganadores.total} proyectos que eligieron`
      : ganadores.total === 1
        ? "este es el proyecto que eligieron"
        : `estos son los ${enLetras(ganadores.total)} proyectos que eligieron`;
  return `Mientras avanza la edición ${anioActivo}, ${cuales} los vecinos en ${ganadores.anio}.`;
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
