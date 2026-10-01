"use client";

/**
 * El panorama de la bandeja: las tarjetas y los graficos que FILTRAN.
 *
 * Cada tarjeta y cada columna es un enlace a la bandeja con el filtro cambiado
 * (la page lo resuelve en el servidor, asi que la vista se comparte por link y
 * funciona sin JavaScript). La elegida se marca con borde, tilde y
 * aria-current; al tocarla de nuevo se saca el filtro.
 *
 * Los numeros llegan de `getPanoramaBandeja` (src/db/queries.ts) ya calculados
 * con el filtro puesto: cada bloque cuenta sin su propia dimension y con las
 * demas, asi que dice "cuantas filas habria si eligiera esto". Cuando otro
 * filtro acota un bloque, sus tarjetas aclaran abajo cuantas hay en la edicion
 * entera (`resumen`), para que un "Factibles 3" con el distrito 5 elegido no
 * parezca un numero roto.
 *
 * Los graficos se dibujan con HTML comun (barras que son spans con ancho o
 * alto en porcentaje), no con SVG: asi cada columna es un enlace de verdad,
 * que se enfoca con Tab y se lee con un lector de pantalla. Los colores son
 * los tokens del tema, los mismos del tablero (../tablero/graficos.tsx), y
 * ningun dato esta solo en el color: la cantidad va siempre en texto.
 *
 * Lo unico con estado propio es "Ocultar graficos", que se recuerda en el
 * navegador: quien entra todos los dias a evaluar quiere la tabla mas arriba.
 * Esconde las columnas por distrito y las categorias; las tarjetas por estado
 * y las de trabajo quedan siempre, porque son los filtros de todos los dias y
 * porque la deuda con el vecino no se esconde.
 */
import Link from "next/link";
import { useSyncExternalStore, type CSSProperties } from "react";
import type {
  CategoriaPanorama,
  DistritoPanorama,
  EstadoIdea,
  PanoramaBandeja,
  ResumenBandeja,
} from "@/db/queries";
import { colorCategoria, formatearNumero } from "@/lib/formato";
import { COLOR_ESTADO_TABLERO } from "../tablero/graficos";
import type { Vista } from "./panel";

/** Enlace a la bandeja con algunos parametros de la vista cambiados. */
type Enlace = (cambios: Partial<Vista>) => string;

/**
 * Estados de las tarjetas, en el orden en que se trabajan. Las descartadas van
 * al final y solo aparecen si se piden: sin filtro de estado la bandeja no las
 * trae (ver `listarIdeasBandeja`), para que una prueba o un spam no se mezcle
 * con el trabajo del equipo.
 */
const ESTADOS_TARJETAS: EstadoIdea[] = [
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
  "borrador",
  "descartado",
];

/**
 * Las tarjetas que solo se muestran si la edicion tiene alguna (o si estan
 * elegidas): casi nunca hay borradores, y las descartadas son la excepcion.
 */
const TARJETAS_OCASIONALES: EstadoIdea[] = ["borrador", "descartado"];

/**
 * Etiquetas de las tarjetas y de los chips. Son mas cortas y en plural que las
 * de ETIQUETA_ESTADO (src/lib/formato.ts), que se siguen usando en la tabla, en
 * la ficha y en el sitio publico: ahi nombran el estado de UNA idea ("Integrada
 * con otra idea"), y aca encabezan un monton de ellas ("Integradas 2").
 */
export const ETIQUETA_SOLAPA: Record<EstadoIdea, string> = {
  pendiente: "Sin evaluar",
  factible: "Factibles",
  no_factible: "No factibles",
  integrado: "Integradas",
  ganador: "Ganadoras",
  borrador: "Borradores",
  descartado: "Descartadas",
};

type Tramo = { clave: string; etiqueta: string; estados: EstadoIdea[]; color: string };

/**
 * Los tramos de cada columna del grafico por distrito, de abajo hacia arriba.
 * Los borradores van con "Sin evaluar": tampoco los miro nadie. Las
 * descartadas solo aparecen si se filtra por ese estado.
 */
const TRAMOS: Tramo[] = [
  {
    clave: "pendiente",
    etiqueta: "Sin evaluar",
    estados: ["pendiente", "borrador"],
    color: COLOR_ESTADO_TABLERO.pendiente,
  },
  { clave: "factible", etiqueta: "Factibles", estados: ["factible"], color: COLOR_ESTADO_TABLERO.factible },
  {
    clave: "no_factible",
    etiqueta: "No factibles",
    estados: ["no_factible"],
    color: COLOR_ESTADO_TABLERO.no_factible,
  },
  { clave: "integrado", etiqueta: "Integradas", estados: ["integrado"], color: COLOR_ESTADO_TABLERO.integrado },
  { clave: "ganador", etiqueta: "Ganadoras", estados: ["ganador"], color: COLOR_ESTADO_TABLERO.ganador },
  { clave: "descartado", etiqueta: "Descartadas", estados: ["descartado"], color: "var(--borde-control)" },
];

/** Alto de las columnas, en rem. Entra al lado de las tarjetas sin empujar la tabla. */
const ALTO_COLUMNAS = 7;

/** Donde se recuerda que los graficos estan ocultos. Solo en este navegador. */
const CLAVE_GRAFICOS = "pp-bandeja-graficos";

/**
 * La preferencia de "Ocultar graficos" vive AFUERA de React, en localStorage,
 * y se lee con useSyncExternalStore: en el servidor y durante la hidratacion
 * vale "visibles" (el HTML de los dos lados coincide) y recien despues toma lo
 * guardado. Un useState mas un useEffect que lo pise haria lo mismo con un
 * render de mas, que es justo lo que la regla react-hooks/set-state-in-effect
 * marca. Si el almacenamiento no esta (modo privado, bloqueado), la
 * preferencia dura lo que dura la pagina.
 */
const EVENTO_GRAFICOS = "pp-bandeja-graficos";
let graficosEnMemoria = true;

function leerGraficos(): boolean {
  try {
    const guardado = window.localStorage.getItem(CLAVE_GRAFICOS);
    if (guardado !== null) return guardado !== "ocultos";
  } catch {
    // Sin almacenamiento: vale lo que haya en memoria.
  }
  return graficosEnMemoria;
}

function guardarGraficos(visibles: boolean) {
  graficosEnMemoria = visibles;
  try {
    window.localStorage.setItem(CLAVE_GRAFICOS, visibles ? "visibles" : "ocultos");
  } catch {
    // Idem: queda en memoria.
  }
  window.dispatchEvent(new Event(EVENTO_GRAFICOS));
}

function suscribirGraficos(avisar: () => void) {
  // "storage" avisa de otra pestaña; el evento propio, de esta misma.
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO_GRAFICOS, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO_GRAFICOS, avisar);
  };
}

const suave: CSSProperties = { color: "var(--texto-suave)" };

export default function Panorama({
  panorama,
  resumen,
  vista,
  enlace,
}: {
  panorama: PanoramaBandeja;
  /** La edicion entera, sin filtro: el "de N" de las tarjetas acotadas. */
  resumen: ResumenBandeja;
  vista: Vista;
  enlace: Enlace;
}) {
  // En el servidor siempre visibles (ver leerGraficos).
  const graficos = useSyncExternalStore(suscribirGraficos, leerGraficos, () => true);

  // Si algo mas que el estado acota la cuenta, las tarjetas por estado dicen
  // de cuantas son en la edicion entera.
  const acotado = Boolean(
    vista.distrito ||
      vista.categoria ||
      vista.q ||
      vista.sinDevolucion ||
      vista.sinPublicar ||
      vista.conContacto,
  );

  return (
    <div className="mt-5">
      <TarjetasEstado
        panorama={panorama}
        resumen={resumen}
        acotado={acotado}
        vista={vista}
        enlace={enlace}
      />

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs" style={suave}>
          {acotado || vista.estado
            ? "Los números siguen al filtro puesto: cada tarjeta dice cuántas filas habría al elegirla."
            : "Tocá una tarjeta o una columna para ver solo esas ideas; tocala de nuevo para sacar el filtro."}
        </p>
        <button
          type="button"
          onClick={() => guardarGraficos(!graficos)}
          aria-expanded={graficos}
          aria-controls="panorama-graficos"
          className="text-xs underline"
          style={suave}
        >
          {graficos ? "Ocultar gráficos" : "Mostrar gráficos"}
        </button>
      </div>

      <div
        id="panorama-graficos"
        className={`mt-3 grid gap-4 ${graficos ? "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}`}
      >
        {graficos && (
          <ColumnasDistrito
            distritos={panorama.porDistrito}
            sinDistrito={panorama.sinDistrito}
            vista={vista}
            enlace={enlace}
          />
        )}
        <div className="grid content-start gap-4">
          {graficos && <TarjetasCategoria panorama={panorama} vista={vista} enlace={enlace} />}
          <TarjetasTrabajo panorama={panorama} vista={vista} enlace={enlace} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarjetas por estado
// ---------------------------------------------------------------------------

function TarjetasEstado({
  panorama,
  resumen,
  acotado,
  vista,
  enlace,
}: {
  panorama: PanoramaBandeja;
  resumen: ResumenBandeja;
  acotado: boolean;
  vista: Vista;
  enlace: Enlace;
}) {
  // Las ocasionales se deciden con la edicion entera y no con el filtro: si la
  // edicion tiene descartadas, la tarjeta no desaparece al elegir un distrito
  // que no tiene ninguna.
  const estados = ESTADOS_TARJETAS.filter(
    (estado) =>
      !TARJETAS_OCASIONALES.includes(estado) ||
      resumen.porEstado[estado] > 0 ||
      vista.estado === estado,
  );

  return (
    <ul
      className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3"
      aria-label="Filtrar por estado"
    >
      <li>
        <TarjetaFiltro
          etiqueta="Todas"
          valor={panorama.total}
          color="var(--marca-texto)"
          href={enlace({ estado: "" })}
          activo={!vista.estado}
          detalle={acotado ? `de ${formatearNumero(resumen.total)} en la edición` : undefined}
        />
      </li>
      {estados.map((estado) => {
        const activo = vista.estado === estado;
        return (
          <li key={estado}>
            <TarjetaFiltro
              etiqueta={ETIQUETA_SOLAPA[estado]}
              valor={panorama.porEstado[estado]}
              // Las descartadas no son parte del total: su porcentaje no dice nada.
              base={estado === "descartado" ? undefined : panorama.total}
              color={COLOR_ESTADO_TABLERO[estado] ?? "var(--texto-suave)"}
              href={enlace({ estado: activo ? "" : estado })}
              activo={activo}
              detalle={
                acotado
                  ? `de ${formatearNumero(resumen.porEstado[estado])} en la edición`
                  : undefined
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Una tarjeta que filtra. Es un enlace con forma de tarjeta (estilo
 * `.tarjeta-filtro` en src/app/globals.css): la etiqueta, el numero grande, el
 * porcentaje sobre `base` si lo hay, una barrita con esa proporcion y, cuando
 * esta elegida, el tilde. El aria-label dice lo mismo en una frase, con lo que
 * va a pasar al tocarla.
 */
function TarjetaFiltro({
  etiqueta,
  valor,
  base,
  color,
  href,
  activo,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: number;
  /** Sobre que total se calcula el porcentaje. Sin base no hay porcentaje. */
  base?: number;
  color: string;
  href: string;
  activo: boolean;
  detalle?: string;
  /** "alerta" la pinta ambar (la deuda con el vecino); "ok" verde (deuda en cero). */
  tono?: "alerta" | "ok";
}) {
  const proporcion = base && base > 0 ? Math.min(1, valor / base) : null;
  const porcentaje = proporcion === null ? null : `${Math.round(proporcion * 100)} %`;
  const lectura =
    `${etiqueta}: ${formatearNumero(valor)}` +
    (porcentaje ? ` (${porcentaje})` : "") +
    (detalle ? `, ${detalle}` : "") +
    (activo ? ". Filtro puesto: tocá para sacarlo." : ". Tocá para ver solo estas.");

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={activo ? "true" : undefined}
      aria-label={lectura}
      data-tono={tono}
      className="tarjeta-filtro"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium" style={suave}>
          {etiqueta}
        </span>
        {activo && (
          <span className="tarjeta-filtro-tilde" aria-hidden="true">
            ✓ viendo estas
          </span>
        )}
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" style={{ color }}>
          {formatearNumero(valor)}
        </span>
        {porcentaje && (
          <span className="text-xs tabular-nums" style={suave}>
            {porcentaje}
          </span>
        )}
      </span>
      {proporcion !== null && (
        <span className="tarjeta-filtro-barra" aria-hidden="true">
          <span style={{ width: `${proporcion * 100}%`, background: color }} />
        </span>
      )}
      {detalle && (
        <span className="mt-1.5 block text-xs" style={suave}>
          {detalle}
        </span>
      )}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Columnas por distrito
// ---------------------------------------------------------------------------

function cantidadDelTramo(distrito: DistritoPanorama, tramo: Tramo): number {
  return tramo.estados.reduce((suma, estado) => suma + distrito.porEstado[estado], 0);
}

function ColumnasDistrito({
  distritos,
  sinDistrito,
  vista,
  enlace,
}: {
  distritos: DistritoPanorama[];
  sinDistrito: number;
  vista: Vista;
  enlace: Enlace;
}) {
  const elegido = vista.distrito ? Number(vista.distrito) : null;
  const total = distritos.reduce((suma, distrito) => suma + distrito.total, 0);
  const maximo = Math.max(1, ...distritos.map((distrito) => distrito.total));
  // La leyenda nombra solo los tramos que aparecen en alguna columna.
  const tramos = TRAMOS.filter((tramo) =>
    distritos.some((distrito) => cantidadDelTramo(distrito, tramo) > 0),
  );

  return (
    <section className="superficie rounded-2xl p-4" aria-labelledby="panorama-distritos">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="panorama-distritos" className="text-sm font-semibold">
          Ideas por distrito
        </h2>
        <p className="text-xs" style={suave}>
          {elegido === null
            ? "Tocá una columna para ver solo ese distrito"
            : `Viendo el distrito ${elegido}; tocalo de nuevo para ver todos`}
        </p>
      </div>

      {total === 0 && elegido === null ? (
        <p className="mt-4 text-sm" style={suave}>
          Ninguna idea con este filtro tiene distrito: no hay columnas que dibujar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <ol
            className="mt-3 flex min-w-[34rem] items-end gap-1"
            aria-label="Un enlace por distrito; cada uno filtra el listado"
          >
            {distritos.map((distrito) => {
              const activo = elegido === distrito.numero;
              const apagado = elegido !== null && !activo;
              const partes = TRAMOS.map((tramo) => ({
                tramo,
                cantidad: cantidadDelTramo(distrito, tramo),
              })).filter((parte) => parte.cantidad > 0);
              const detalle = partes
                .map((parte) => `${formatearNumero(parte.cantidad)} ${parte.tramo.etiqueta.toLowerCase()}`)
                .join(", ");
              const lectura =
                `Distrito ${distrito.numero}, ${distrito.nombre}: ${formatearNumero(distrito.total)} ${
                  distrito.total === 1 ? "idea" : "ideas"
                }` +
                (detalle ? ` (${detalle})` : "") +
                (activo ? ". Filtro puesto: tocá para sacarlo." : ". Tocá para ver solo este distrito.");
              return (
                <li key={distrito.numero} className="min-w-0 flex-1">
                  <Link
                    href={enlace({ distrito: activo ? "" : String(distrito.numero) })}
                    scroll={false}
                    aria-current={activo ? "true" : undefined}
                    aria-label={lectura}
                    title={`D${distrito.numero} · ${distrito.nombre}: ${formatearNumero(distrito.total)}`}
                    className="columna-distrito"
                    data-apagada={apagado || undefined}
                  >
                    <span className="columna-distrito-valor" aria-hidden="true">
                      {distrito.total > 0 ? formatearNumero(distrito.total) : ""}
                    </span>
                    <span
                      className="columna-distrito-pila"
                      style={{ height: `${ALTO_COLUMNAS}rem` }}
                      aria-hidden="true"
                    >
                      {partes.map(({ tramo, cantidad }) => (
                        <span
                          key={tramo.clave}
                          style={{ height: `${(cantidad / maximo) * 100}%`, background: tramo.color }}
                        />
                      ))}
                    </span>
                    <span className="columna-distrito-etiqueta" aria-hidden="true">
                      D{distrito.numero}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {tramos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Qué significa cada color">
          {tramos.map((tramo) => (
            <li key={tramo.clave} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: tramo.color }}
              />
              {tramo.etiqueta}
            </li>
          ))}
        </ul>
      )}
      {sinDistrito > 0 && (
        <p className="mt-2 text-xs" style={suave}>
          {sinDistrito === 1
            ? "Una idea no tiene distrito asignado: no está en las columnas, pero sí en el listado."
            : `${formatearNumero(sinDistrito)} ideas no tienen distrito asignado: no están en las columnas, pero sí en el listado.`}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Categorias y seguimiento del trabajo
// ---------------------------------------------------------------------------

function TarjetasCategoria({
  panorama,
  vista,
  enlace,
}: {
  panorama: PanoramaBandeja;
  vista: Vista;
  enlace: Enlace;
}) {
  const base =
    panorama.porCategoria.reduce((suma, categoria) => suma + categoria.cantidad, 0) +
    panorama.sinCategoria;

  return (
    <section aria-labelledby="panorama-categorias">
      <h2 id="panorama-categorias" className="text-sm font-semibold">
        Por categoría
      </h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-3">
        {panorama.porCategoria.map((categoria) => {
          const activo = vista.categoria === categoria.slug;
          return (
            <li key={categoria.slug}>
              <TarjetaFiltro
                etiqueta={categoria.nombre}
                valor={categoria.cantidad}
                base={base}
                color={colorCategoria(categoria.slug) ?? "var(--marca-texto)"}
                href={enlace({ categoria: activo ? "" : categoria.slug })}
                activo={activo}
              />
            </li>
          );
        })}
      </ul>
      {panorama.sinCategoria > 0 && (
        <p className="mt-2 text-xs" style={suave}>
          {panorama.sinCategoria === 1
            ? "Una idea no tiene categoría asignada."
            : `${formatearNumero(panorama.sinCategoria)} ideas no tienen categoría asignada.`}
        </p>
      )}
    </section>
  );
}

function TarjetasTrabajo({
  panorama,
  vista,
  enlace,
}: {
  panorama: PanoramaBandeja;
  vista: Vista;
  enlace: Enlace;
}) {
  const { trabajo } = panorama;
  const hayDeuda = trabajo.sinDevolucion > 0;

  return (
    <section aria-labelledby="panorama-trabajo">
      <h2 id="panorama-trabajo" className="text-sm font-semibold">
        Seguimiento del trabajo
      </h2>
      <ul className="mt-2 grid gap-3 sm:grid-cols-3">
        <li>
          {/*
            La deuda con el vecino: se le dijo que no sin explicarle por que.
            Es la unica tarjeta con color de fondo, ambar mientras quede alguna
            y verde cuando no queda ninguna. Antes era la unica alerta de la
            pantalla, una franja arriba de todo; ahora es una tarjeta mas, pero
            la unica pintada.
          */}
          <TarjetaFiltro
            etiqueta="Falta la devolución"
            valor={trabajo.sinDevolucion}
            color={hayDeuda ? "var(--acento-texto)" : "var(--color-cat-ambiental)"}
            tono={hayDeuda ? "alerta" : "ok"}
            href={enlace({ sinDevolucion: !vista.sinDevolucion })}
            activo={vista.sinDevolucion}
            detalle={
              hayDeuda
                ? "Se les dijo que no sin explicarles por qué"
                : "Ningún “no” quedó sin explicación"
            }
          />
        </li>
        <li>
          <TarjetaFiltro
            etiqueta="Sin publicar"
            valor={trabajo.sinPublicar}
            color="var(--texto)"
            href={enlace({ sinPublicar: !vista.sinPublicar })}
            activo={vista.sinPublicar}
            detalle="Todavía no se ven en el sitio"
          />
        </li>
        <li>
          {/* Solo la cuenta: el mail del autor no llega a esta pantalla. */}
          <TarjetaFiltro
            etiqueta="Con contacto"
            valor={trabajo.conContacto}
            color="var(--marca-texto)"
            href={enlace({ conContacto: !vista.conContacto })}
            activo={vista.conContacto}
            detalle="Dejaron un mail para avisarles"
          />
        </li>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Los filtros puestos
// ---------------------------------------------------------------------------

/**
 * La fila "Filtros:" arriba de la tabla: un chip por filtro puesto, cada uno
 * un enlace que lo saca, y "Limpiar todo" cuando hay mas de uno. Es lo que
 * hace legible el panorama: con los controles repartidos en cuatro bloques,
 * aca se ve de un vistazo que esta filtrando la tabla.
 */
export function FiltrosActivos({
  vista,
  categorias,
  enlace,
  limpiar,
}: {
  vista: Vista;
  categorias: CategoriaPanorama[];
  enlace: Enlace;
  /** El enlace a la bandeja sin ningun filtro. */
  limpiar: string;
}) {
  const chips: { clave: string; etiqueta: string; href: string }[] = [];
  if (vista.estado) {
    chips.push({
      clave: "estado",
      etiqueta: ETIQUETA_SOLAPA[vista.estado as EstadoIdea] ?? vista.estado,
      href: enlace({ estado: "" }),
    });
  }
  if (vista.distrito) {
    chips.push({ clave: "distrito", etiqueta: `Distrito ${vista.distrito}`, href: enlace({ distrito: "" }) });
  }
  if (vista.categoria) {
    chips.push({
      clave: "categoria",
      etiqueta: categorias.find((categoria) => categoria.slug === vista.categoria)?.nombre ?? vista.categoria,
      href: enlace({ categoria: "" }),
    });
  }
  if (vista.sinDevolucion) {
    chips.push({ clave: "sinDevolucion", etiqueta: "Falta la devolución", href: enlace({ sinDevolucion: false }) });
  }
  if (vista.sinPublicar) {
    chips.push({ clave: "sinPublicar", etiqueta: "Sin publicar", href: enlace({ sinPublicar: false }) });
  }
  if (vista.conContacto) {
    chips.push({ clave: "conContacto", etiqueta: "Con contacto", href: enlace({ conContacto: false }) });
  }
  if (vista.q) {
    chips.push({ clave: "q", etiqueta: `“${vista.q}”`, href: enlace({ q: "" }) });
  }

  if (chips.length === 0) {
    return (
      <p className="text-sm" style={suave}>
        Toda la edición, sin filtros.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span style={suave}>Filtros:</span>
      <ul
        className="flex flex-wrap items-center gap-2"
        aria-label="Filtros puestos; cada uno se saca tocándolo"
      >
        {chips.map((chip) => (
          <li key={chip.clave}>
            <Link
              href={chip.href}
              scroll={false}
              className="chip-filtro"
              aria-label={`Sacar el filtro ${chip.etiqueta}`}
            >
              {chip.etiqueta}
              <span aria-hidden="true">×</span>
            </Link>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <Link href={limpiar} scroll={false} className="underline" style={suave}>
          Limpiar todo
        </Link>
      )}
    </div>
  );
}
