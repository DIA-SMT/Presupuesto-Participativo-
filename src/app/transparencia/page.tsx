import Link from "next/link";
import type { Metadata } from "next";
import AvisoEdicion from "@/components/AvisoEdicion";
import TarjetaObra from "@/components/TarjetaObra";
import { Aviso, Vacio } from "@/components/ui";
import {
  getEstadisticas,
  getUltimaEdicionTerminadaConGanadores,
  listarIdeas,
  listarObras,
  type ObraGanadora,
} from "@/db/queries";
import { edicionDeLaPagina, resolverEdicion, tituloConEdicion } from "@/lib/edicion-en-vista";
import { conEdicion, votacionTerminada } from "@/lib/ediciones";
import {
  ETAPAS_PRESUPUESTO,
  ETIQUETA_ETAPA,
  ETIQUETA_PRESUPUESTO,
  distritosConVerbo,
  formatearNumero,
} from "@/lib/formato";

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
 * Desde octubre de 2026 los ganadores se muestran como TARJETAS DE OBRA
 * (src/components/TarjetaObra.tsx): en que etapa esta cada uno (licitacion,
 * adjudicada, en obra, finalizada), con la aclaracion y el link que carga el
 * equipo en /admin/obras. La etapa sale de los avances publicados, no de la
 * columna que lleno el ETL: sin avances, la tarjeta dice que no hay
 * informacion. Con una edicion que todavia no voto, se muestran las obras de
 * la ultima que si, que son las que se estan haciendo.
 *
 * El titulo y el subtitulo estan ACA y no en la tabla `textos`. Salian de la
 * base, pero el panel no tiene pantalla que los edite: en la base quedaban
 * inmutables en la practica, y encima decian "cuánto se ejecutó de su
 * presupuesto". En el codigo quedan versionados y se revisan en un diff.
 */
const DESCRIPCION =
  "Qué proyecto ganó en cada distrito del Presupuesto Participativo de San Miguel de Tucumán y con cuántos votos.";

type Props = {
  searchParams: Promise<{ edicion?: string | string[]; obra?: string | string[] }>;
};

/** El filtro por etapa: una de las cuatro, "sin-informacion", o todas. */
type FiltroObra = (typeof ETAPAS_PRESUPUESTO)[number] | "sin-informacion" | null;

function leerFiltro(valor: string | string[] | undefined): FiltroObra {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (texto === "sin-informacion") return texto;
  return (ETAPAS_PRESUPUESTO as readonly string[]).includes(texto ?? "")
    ? (texto as FiltroObra)
    : null;
}

function etapaDeObra(obra: ObraGanadora): Exclude<FiltroObra, null> {
  return (ETAPAS_PRESUPUESTO as readonly string[]).includes(obra.etapa ?? "")
    ? (obra.etapa as Exclude<FiltroObra, null>)
    : "sin-informacion";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { edicion } = await searchParams;
  const resuelta = await resolverEdicion(edicion).catch(() => null);
  return { title: tituloConEdicion("Transparencia", resuelta), description: DESCRIPCION };
}

export default async function Transparencia({ searchParams }: Props) {
  const parametros = await searchParams;
  const vista = await edicionDeLaPagina(parametros.edicion);
  const filtro = leerFiltro(parametros.obra);
  if (!vista) {
    return (
      <div className="contenedor py-20">
        <Vacio>Todavía no hay una edición cargada.</Vacio>
      </div>
    );
  }
  const { edicion, anioEnEnlaces } = vista;

  const [stats, ganadores] = await Promise.all([
    getEstadisticas(edicion),
    listarIdeas({ edicionId: edicion.id, soloGanadores: true }),
  ]);

  // Una edicion que todavia no voto no tiene ganadores, y la tabla vacia con
  // "Total 0" mas "los distritos 1, 2, ..., 20 no eligieron proyecto" decia
  // algo falso: no es que no eligieron, es que todavia no votaron. En ese caso
  // la pagina lo dice y lleva a los ganadores de la ultima edicion que voto.
  const yaVoto = votacionTerminada(edicion.etapa);
  const anterior =
    !ganadores.length && !yaVoto ? await getUltimaEdicionTerminadaConGanadores() : null;
  // Con la votacion terminada tampoco hay resultado hasta que se proclama, y
  // se proclama de a un distrito: "no tiene proyectos ganadores" y "el distrito
  // 1, 2, ..., 20 no eligió proyecto" eran falsos en ese tramo (ver
  // `ganadorPorProclamar`).
  const porProclamar = yaVoto ? stats.distritosPorProclamar : [];

  // Las obras que se muestran: las de esta edicion si tiene ganadores, o las
  // de la ultima que voto. El enlace de cada tarjeta lleva a la ficha en SU
  // edicion: el slug se repite entre ediciones.
  const edicionDeLasObras = ganadores.length
    ? { id: edicion.id, anio: edicion.anio, enlaces: anioEnEnlaces, propia: true }
    : anterior
      ? {
          id: anterior.id,
          anio: anterior.anio,
          enlaces: anterior.activa ? null : anterior.anio,
          propia: anterior.id === edicion.id,
        }
      : null;
  const obras = edicionDeLasObras ? await listarObras(edicionDeLasObras.id) : [];
  const cuentas = new Map<string, number>();
  for (const obra of obras) {
    const etapa = etapaDeObra(obra);
    cuentas.set(etapa, (cuentas.get(etapa) ?? 0) + 1);
  }
  const visibles = filtro ? obras.filter((obra) => etapaDeObra(obra) === filtro) : obras;
  const votosDeLasObras = obras.reduce((suma, obra) => suma + obra.votos, 0);
  // El filtro mantiene la edicion que se esta mirando.
  const hrefFiltro = (valor: FiltroObra) => {
    const base = conEdicion("/transparencia", anioEnEnlaces);
    if (!valor) return base;
    return `${base}${base.includes("?") ? "&" : "?"}obra=${valor}`;
  };

  return (
    <div className="contenedor py-10 sm:py-14">
      <AvisoEdicion vista={vista} hrefActual="/transparencia" />

      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Transparencia</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Qué proyecto ganó en cada distrito, con cuántos votos, y cómo avanza su obra.
        </p>
      </header>

      {/* --- Aviso de la edicion sin ganadores ------------------------------
          Solo si no hay ninguna obra para mostrar. Con la edicion nueva
          abierta y las obras de la anterior abajo, el aviso ("la edición 2026
          todavía no tiene ganadores…") se leia antes que las tarjetas y no
          aportaba: el titulo de la seccion ya dice de que año son. */}
      {!ganadores.length && !obras.length && (
        <section className="mt-10">
          <Aviso tono={yaVoto && !porProclamar.length ? "atencion" : "info"}>
            {porProclamar.length
              ? `La votación de la edición ${edicion.anio} terminó. Los proyectos ganadores se publican acá a medida que se proclamen.`
              : yaVoto
                ? `La edición ${edicion.anio} no tiene proyectos ganadores publicados.`
                : `La edición ${edicion.anio} todavía no tiene proyectos ganadores: está en la etapa “${
                    ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa
                  }”, y el ganador de cada distrito sale de la votación.`}
          </Aviso>
        </section>
      )}

      {/* --- Tarjetas de obra ----------------------------------------------- */}
      {edicionDeLasObras && obras.length > 0 && (
        <section className="mt-10" aria-labelledby="titulo-obras">
          <h2 id="titulo-obras" className="text-xl font-bold">
            Proyectos ganadores
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Edición {edicionDeLasObras.anio}. En qué etapa está la obra de cada uno: se licita, se adjudica a una empresa, se construye
            y se termina. Entre todos sumaron {formatearNumero(votosDeLasObras)} votos.
          </p>

          <nav aria-label="Filtrar por etapa de la obra" className="mt-5">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={hrefFiltro(null)}
                  aria-current={filtro === null ? "true" : undefined}
                  className="filtro-obra"
                  scroll={false}
                >
                  Todas <span className="cuenta">{obras.length}</span>
                </Link>
              </li>
              {[...ETAPAS_PRESUPUESTO, "sin-informacion" as const]
                .filter((valor) => cuentas.get(valor))
                .map((valor) => (
                  <li key={valor}>
                    <Link
                      href={hrefFiltro(valor)}
                      aria-current={filtro === valor ? "true" : undefined}
                      className="filtro-obra"
                      scroll={false}
                    >
                      {valor === "sin-informacion" ? "Sin información" : ETIQUETA_PRESUPUESTO[valor]}{" "}
                      <span className="cuenta">{cuentas.get(valor)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>

          {visibles.length ? (
            <ul className="grilla-propuestas mt-5">
              {visibles.map((obra) => (
                <li key={obra.id}>
                  <TarjetaObra
                    obra={obra}
                    hrefFicha={conEdicion(`/proyectos/${obra.slug}`, edicionDeLasObras.enlaces)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm" style={{ color: "var(--texto-suave)" }}>
              Ninguna obra está en esa etapa.{" "}
              <Link href={hrefFiltro(null)} className="font-semibold underline" scroll={false}>
                Ver todas
              </Link>
            </p>
          )}
        </section>
      )}

      {/* Solo con la votacion terminada: antes, "no eligió proyecto" es falso.
          Y sin los que esperan su proclamacion, que van en la seccion de abajo. */}
      {yaVoto && stats.distritosSinGanador.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Distritos sin proyecto ganador</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            En la edición {stats.anio}{" "}
            {distritosConVerbo(stats.distritosSinGanador, "no eligió", "no eligieron")} proyecto.
            Publicarlo es parte de la información: muestra dónde el programa todavía no llegó.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.distritosSinGanador.map((numero) => (
              <Link
                key={numero}
                href={conEdicion(`/distritos/${numero}`, anioEnEnlaces)}
                className="superficie rounded-xl px-3.5 py-2 text-sm font-medium"
              >
                Distrito {numero}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Votaron, pero su ganador todavia no se proclamo: no "quedaron sin". */}
      {porProclamar.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold">Distritos por proclamar</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            {frasePorProclamar(stats.anio, porProclamar)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {porProclamar.map((numero) => (
              <Link
                key={numero}
                href={conEdicion(`/distritos/${numero}`, anioEnEnlaces)}
                className="superficie rounded-xl px-3.5 py-2 text-sm font-medium"
              >
                Distrito {numero}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** "el distrito 7 ya votó…", o "los distritos 2, 10 y 13 ya votaron…". */
function frasePorProclamar(anio: number, distritos: number[]): string {
  if (distritos.length === 1) {
    return `En la edición ${anio} el distrito ${distritos[0]} ya votó y su ganador todavía no se proclamó. Se publica en esta página apenas se proclame.`;
  }
  const lista = new Intl.ListFormat("es", { type: "conjunction" }).format(distritos.map(String));
  return `En la edición ${anio} los distritos ${lista} ya votaron y sus ganadores todavía no se proclamaron. Se publican en esta página a medida que se proclamen.`;
}
