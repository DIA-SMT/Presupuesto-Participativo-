"use client";

/**
 * Pantalla principal del panel: la bandeja de revision de ideas.
 *
 * El archivo sigue viviendo en bandeja/ pero la ruta que lo usa es /admin
 * (src/app/admin/page.tsx). /admin/bandeja quedo como redirect permanente para
 * no romper los enlaces viejos del equipo.
 *
 * Los datos llegan ya consultados desde la page; aca viven los formularios de
 * revision (useActionState) y el contador de la devolucion, que avisa antes de
 * enviar cuando el estado elegido exige explicarle al vecino.
 *
 * Nada de lo interactivo depende de JavaScript para leer: el filtro es un form
 * GET, y el orden y la pagina son enlaces comunes que resuelve el servidor.
 *
 * Dato sensible: el mail del autor NUNCA llega a esta pantalla. De la base sale
 * solo `tieneContacto`, asi que la bandeja puede decir si hay con quien
 * comunicarse, pero no cual es el dato.
 */
import Link from "next/link";
import { useActionState, useState } from "react";
import { Chip, ChipEstado } from "@/components/ui";
import type {
  AccionRevision,
  DireccionOrden,
  EstadoIdea,
  FilaBandeja,
  FilaRevision,
  IdeaAdmin,
  OrdenBandeja,
  ResumenBandeja,
  RolAdmin,
} from "@/db/queries";
import { ETIQUETA_ESTADO, formatearNumero, formatearPesos } from "@/lib/formato";
import {
  despublicarIdea,
  evaluarIdea,
  proclamarGanador,
  publicarIdea,
  reabrirRevision,
} from "../acciones";

/** La bandeja es la pantalla principal del panel. */
const RUTA = "/admin";

/** Mismo minimo que valida evaluarIdea en el servidor. */
const MINIMO_DEVOLUCION = 40;
/** Mismo minimo que piden despublicarIdea y reabrirRevision. */
const MINIMO_MOTIVO = 10;

/** Los cuatro estados que se pueden fijar evaluando: "ganador" se proclama. */
const ESTADOS_EVALUACION: EstadoIdea[] = ["pendiente", "factible", "no_factible", "integrado"];

/** Estados del filtro, en el orden en que se trabajan. */
const ESTADOS_FILTRO: EstadoIdea[] = [
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
  "borrador",
];

/** Los estados que ya tienen tarjeta propia arriba no se repiten en la fila chica. */
const ESTADOS_TARJETA: EstadoIdea[] = ESTADOS_FILTRO.filter((estado) => estado !== "pendiente");

const ETIQUETA_ACCION: Record<AccionRevision, string> = {
  evaluacion: "Evaluación",
  publicacion: "Publicación",
  despublicacion: "Despublicación",
  proclamacion: "Proclamación",
  reapertura: "Reapertura",
  presupuesto: "Presupuesto",
};

const ETIQUETA_CANAL: Record<IdeaAdmin["canal"], string> = {
  web: "Formulario del sitio",
  asamblea: "Asamblea barrial",
  municipio: "Carga del municipio",
  migracion: "Migración de 2025",
};

/** Lo que devuelven las server actions. El tipo original vive en acciones.ts. */
type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string };

/**
 * Todo lo que define la vista y viaja en el querystring. La page lo arma ya
 * validado (usa `ordenBandeja` y `direccionBandeja` de queries.ts), asi que acá
 * solo se dibuja y se rearman enlaces.
 */
export type Vista = {
  estado: string;
  distrito: string;
  q: string;
  /** Solo los "no" sin devolución escrita: la deuda con el vecino. */
  sinDevolucion: boolean;
  orden: OrdenBandeja;
  /** null = la dirección natural del orden elegido. */
  dir: DireccionOrden | null;
  /** Página actual, base 1. */
  pagina: number;
  /** Id de la idea abierta en la ficha, o "" si no hay ninguna. */
  idea: string;
};

/**
 * Direccion natural de cada orden. Es un espejo del objeto ORDENES de
 * src/db/queries.ts, que es el que manda: acá solo se usa para dibujar la
 * flecha del encabezado y calcular el proximo click.
 */
const DIRECCION_NATURAL: Record<OrdenBandeja, DireccionOrden> = {
  prioridad: "asc",
  reciente: "desc",
  antigua: "asc",
  votos: "desc",
  distrito: "asc",
  estado: "asc",
};

/** Columnas de la tabla de trabajo. `clave` null = columna que no ordena. */
const COLUMNAS: { etiqueta: string; clave: OrdenBandeja | null; alDerecha?: boolean }[] = [
  { etiqueta: "N°", clave: null },
  { etiqueta: "Idea", clave: null },
  { etiqueta: "Estado", clave: "estado" },
  { etiqueta: "Devolución", clave: null },
  { etiqueta: "Contacto", clave: null },
  { etiqueta: "Distrito", clave: "distrito" },
  { etiqueta: "Barrio", clave: null },
  { etiqueta: "Ingresó", clave: "antigua" },
  { etiqueta: "Votos", clave: "votos", alDerecha: true },
];

/**
 * La columna "Ingresó" cubre los dos ordenes por fecha: "antigua" (las más
 * viejas arriba) y "reciente", que es el mismo criterio al revés. Si alguien
 * llega con orden=reciente en el enlace, la columna se muestra igual activa.
 */
function columnaDe(orden: OrdenBandeja): OrdenBandeja {
  return orden === "reciente" ? "antigua" : orden;
}

/** Fechas con hora en la zona de Tucumán: el historial se lee por minuto. */
const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

/**
 * Antiguedad en palabras. El "ahora" lo fija el server component y viaja por
 * props: si cada lado usara su propio reloj, el HTML del servidor y el del
 * cliente podrian no coincidir.
 */
function antiguedad(desde: Date, ahora: number): string {
  const dias = Math.floor((ahora - desde.getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  if (dias < 60) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `hace ${meses} meses`;
}

/** Enlace a la misma pantalla cambiando algunos parametros de la vista. */
function armarEnlace(vista: Vista, cambios: Partial<Vista> = {}): string {
  const proxima = { ...vista, ...cambios };
  const parametros = new URLSearchParams();
  if (proxima.estado) parametros.set("estado", proxima.estado);
  if (proxima.distrito) parametros.set("distrito", proxima.distrito);
  if (proxima.q) parametros.set("q", proxima.q);
  if (proxima.sinDevolucion) parametros.set("sindevolucion", "1");
  if (proxima.orden !== "prioridad") parametros.set("orden", proxima.orden);
  if (proxima.dir) parametros.set("dir", proxima.dir);
  if (proxima.pagina > 1) parametros.set("pagina", String(proxima.pagina));
  if (proxima.idea) parametros.set("idea", proxima.idea);
  const consulta = parametros.toString();
  return consulta ? `${RUTA}?${consulta}` : RUTA;
}

/** Filtros en cero, para el enlace de "Limpiar filtros". */
const VISTA_LIMPIA: Partial<Vista> = {
  estado: "",
  distrito: "",
  q: "",
  sinDevolucion: false,
  pagina: 1,
  idea: "",
};

/** Una idea que dice "no" sin devolucion escrita es deuda con el vecino. */
function faltaDevolucion(estado: EstadoIdea, tieneDevolucion: boolean): boolean {
  return (estado === "no_factible" || estado === "integrado") && !tieneDevolucion;
}

/**
 * Numeros de pagina a mostrar: la primera, la ultima y las vecinas de la
 * actual. Los null son los huecos ("…").
 */
function ventanaPaginas(pagina: number, paginas: number): (number | null)[] {
  const cerca = [1, paginas, pagina - 1, pagina, pagina + 1]
    .filter((numero) => numero >= 1 && numero <= paginas)
    .sort((uno, otro) => uno - otro);
  const salida: (number | null)[] = [];
  let anterior = 0;
  for (const numero of cerca) {
    if (numero === anterior) continue;
    if (anterior && numero - anterior > 1) salida.push(null);
    salida.push(numero);
    anterior = numero;
  }
  return salida;
}

export default function PanelBandeja({
  anio,
  resumen,
  filas,
  total,
  porPagina,
  votosRegistrados,
  distritos,
  vista,
  ficha,
  historial,
  rol,
  ahora,
}: {
  anio: number;
  resumen: ResumenBandeja;
  filas: FilaBandeja[];
  /** Ideas que matchean el filtro, sin límite: es el total del paginador. */
  total: number;
  porPagina: number;
  votosRegistrados: number;
  distritos: { numero: number; nombre: string }[];
  vista: Vista;
  ficha: IdeaAdmin | null;
  historial: FilaRevision[];
  rol: RolAdmin;
  ahora: number;
}) {
  const soloLectura = rol === "lector";
  const deuda = resumen.noFactiblesSinDevolucion;

  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (vista.pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, vista.pagina * porPagina);

  const columnaActiva = columnaDe(vista.orden);
  const direccionActiva = vista.dir ?? DIRECCION_NATURAL[vista.orden];

  /** Cambiar de filtro siempre vuelve a la primera página y cierra la ficha. */
  const enlaceFiltro = (cambios: Partial<Vista>) =>
    armarEnlace(vista, { pagina: 1, idea: "", ...cambios });

  /** Ordenar mantiene el filtro y la ficha abierta, pero vuelve a la página 1. */
  function enlaceOrden(clave: OrdenBandeja): string {
    const activa = columnaActiva === clave;
    return armarEnlace(vista, {
      orden: clave,
      // Sobre la columna activa el click invierte; sobre otra se arranca con la
      // dirección natural de ese orden (null).
      dir: activa ? (direccionActiva === "asc" ? "desc" : "asc") : null,
      pagina: 1,
    });
  }

  const hayFiltro = Boolean(vista.estado || vista.distrito || vista.q || vista.sinDevolucion);

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">Ideas · Edición {anio}</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
          La lista arranca por lo que necesita trabajo: primero las que nadie evaluó, después los
          “no” sin devolución escrita y al final el resto, siempre las más antiguas arriba. Tocá el
          título de una idea para abrir su ficha, evaluarla y ver su historial; cada cambio queda
          registrado.
        </p>
      </header>

      {/* --- Tarjetas accionables: cada una filtra la lista ---------------- */}
      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {deuda > 0 ? (
          <Link
            href={enlaceFiltro({ estado: "", sinDevolucion: true })}
            aria-current={vista.sinDevolucion ? "true" : undefined}
            className="rounded-2xl px-5 py-4"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
              border: `1px solid color-mix(in srgb, var(--color-acento-600) ${
                vista.sinDevolucion ? "80%" : "40%"
              }, transparent)`,
            }}
          >
            <p className="text-3xl font-bold tracking-tight" style={{ color: "var(--color-acento-700)" }}>
              {formatearNumero(deuda)}
            </p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--color-acento-700)" }}>
              {deuda === 1 ? "idea no factible" : "ideas no factibles"} sin devolución escrita
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
              Es la deuda del equipo con los vecinos: a cada una se le dijo que no sin explicarle
              por qué. Tocá para trabajar solo esas y escribir el texto que se publica en la ficha.
            </p>
          </Link>
        ) : (
          <div
            className="rounded-2xl px-5 py-4"
            style={{
              background: "color-mix(in srgb, var(--color-cat-ambiental) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-cat-ambiental) 35%, transparent)",
            }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
              Todas las ideas no factibles tienen su devolución escrita.
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
              No hay ningún vecino con un “no” sin explicación. Se mantiene así escribiendo la
              devolución en el mismo momento en que se evalúa.
            </p>
          </div>
        )}

        <Tarjeta
          valor={resumen.porEstado.pendiente}
          etiqueta="pendientes de evaluación"
          detalle="Nadie las miró todavía. Van primero en la lista."
          href={enlaceFiltro({ estado: "pendiente", sinDevolucion: false })}
          activo={vista.estado === "pendiente" && !vista.sinDevolucion}
          color={resumen.porEstado.pendiente > 0 ? "var(--color-acento-600)" : undefined}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* "Borrador" solo se muestra si existe: casi nunca hay ideas asi. */}
        {ESTADOS_TARJETA.filter(
          (estado) => estado !== "borrador" || resumen.porEstado.borrador > 0,
        ).map((estado) => (
          <Contador
            key={estado}
            valor={resumen.porEstado[estado]}
            etiqueta={ETIQUETA_ESTADO[estado] ?? estado}
            href={enlaceFiltro({ estado, sinDevolucion: false })}
            activo={vista.estado === estado && !vista.sinDevolucion}
          />
        ))}
      </div>

      {/* --- Metricas de vitrina: van al final y en chico ------------------ */}
      <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
        Edición completa:{" "}
        <Link
          href={enlaceFiltro({ estado: "", distrito: "", q: "", sinDevolucion: false })}
          className="underline"
        >
          {formatearNumero(resumen.total)} {resumen.total === 1 ? "idea" : "ideas"}
        </Link>{" "}
        · {formatearNumero(votosRegistrados)}{" "}
        {votosRegistrados === 1 ? "voto registrado" : "votos registrados"} por este sitio.
      </p>

      {/* --- Filtros ------------------------------------------------------- */}
      <form
        method="get"
        action={RUTA}
        key={`${vista.estado}|${vista.distrito}|${vista.q}|${vista.sinDevolucion}`}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        {/* El orden elegido sobrevive al filtro; la página vuelve a la primera. */}
        {vista.orden !== "prioridad" && <input type="hidden" name="orden" value={vista.orden} />}
        {vista.dir && <input type="hidden" name="dir" value={vista.dir} />}

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Estado</span>
          <select
            name="estado"
            defaultValue={vista.estado}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          >
            <option value="">Todos</option>
            {ESTADOS_FILTRO.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO[estado] ?? estado}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Distrito</span>
          <select
            name="distrito"
            defaultValue={vista.distrito}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          >
            <option value="">Todos</option>
            {distritos.map((distrito) => (
              <option key={distrito.numero} value={distrito.numero}>
                {distrito.nombre || `Distrito ${distrito.numero}`}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Buscar</span>
          <input
            type="search"
            name="q"
            defaultValue={vista.q}
            placeholder="Título o barrio (con o sin tildes)…"
            style={estiloCampo}
            className="w-64 rounded-xl px-3 py-2"
          />
        </label>

        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input
            type="checkbox"
            name="sindevolucion"
            value="1"
            defaultChecked={vista.sinDevolucion}
          />
          Solo los “no” sin devolución
        </label>

        <button
          type="submit"
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          Filtrar
        </button>
        {hayFiltro && (
          <Link href={armarEnlace(vista, VISTA_LIMPIA)} className="pb-3 text-sm underline">
            Limpiar filtros
          </Link>
        )}
      </form>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              {total === 0
                ? "Ninguna idea coincide con estos filtros."
                : `Mostrando ${formatearNumero(desde)}–${formatearNumero(hasta)} de ${formatearNumero(total)} ${
                    total === 1 ? "idea" : "ideas"
                  }`}
            </p>
            {vista.orden === "prioridad" ? (
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Orden de trabajo (pendientes → “no” sin devolución → resto).
              </p>
            ) : (
              <Link
                href={armarEnlace(vista, { orden: "prioridad", dir: null, pagina: 1 })}
                scroll={false}
                className="text-xs underline"
                style={{ color: "var(--color-marca-600)" }}
              >
                Volver al orden de trabajo
              </Link>
            )}
          </div>

          {vista.sinDevolucion && (
            // El contador de la tarjeta mide solo las no factibles (es el numero
            // con el que el equipo viene midiendo la deuda); el filtro suma
            // tambien las integradas sin devolucion, asi que puede traer alguna
            // fila mas. Se aclara para que nadie lo lea como un error.
            <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
              Filtro activo: solo las ideas con un “no” sin devolución escrita. Incluye las
              integradas con otra idea, así que puede traer alguna fila más que el número de la
              tarjeta, que cuenta solo las no factibles.
            </p>
          )}

          {filas.length === 0 ? (
            <div
              className="mt-3 rounded-2xl px-5 py-6 text-sm"
              style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
            >
              <p style={{ color: "var(--texto-suave)" }}>
                Probá con menos filtros, buscá el título sin tildes o volvé a{" "}
                <Link href={armarEnlace(vista, VISTA_LIMPIA)} className="underline">
                  la lista completa
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="superficie mt-3 overflow-x-auto rounded-2xl">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <caption className="sr-only">
                  Ideas de la edición {anio} con su estado, distrito, barrio, antigüedad, votos, si
                  tienen devolución escrita y si el autor dejó un dato de contacto
                </caption>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--borde)" }}>
                    {COLUMNAS.map((columna) => {
                      const activa = columna.clave !== null && columna.clave === columnaActiva;
                      return (
                        <th
                          key={columna.etiqueta}
                          scope="col"
                          aria-sort={
                            columna.clave === null
                              ? undefined
                              : activa
                                ? direccionActiva === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                          }
                          className={`px-3 py-3 font-semibold ${
                            columna.alDerecha ? "text-right" : "text-left"
                          }`}
                        >
                          {columna.clave === null ? (
                            columna.etiqueta
                          ) : (
                            <Link
                              href={enlaceOrden(columna.clave)}
                              scroll={false}
                              className="inline-flex items-center gap-1 hover:underline"
                              style={{ color: activa ? "var(--color-marca-600)" : "var(--texto)" }}
                            >
                              {columna.etiqueta}
                              <span aria-hidden="true" style={{ opacity: activa ? 1 : 0.35 }}>
                                {activa ? (direccionActiva === "asc" ? "↑" : "↓") : "↕"}
                              </span>
                            </Link>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => {
                    const abierta = ficha?.id === fila.id;
                    const falta = faltaDevolucion(fila.estado, fila.tieneDevolucion);
                    return (
                      <tr
                        key={fila.id}
                        style={{
                          borderBottom: "1px solid var(--borde)",
                          // Marca al costado: azul la fila abierta, ámbar la que
                          // le debe una devolución a un vecino.
                          borderLeft: `3px solid ${
                            abierta
                              ? "var(--color-marca-500)"
                              : falta
                                ? "var(--color-acento-600)"
                                : "transparent"
                          }`,
                          background: abierta ? "var(--fondo-suave)" : undefined,
                        }}
                      >
                        <td
                          className="px-3 py-2.5 text-xs font-semibold tabular-nums"
                          style={{ color: "var(--texto-suave)" }}
                        >
                          {fila.numero === null ? "—" : `#${fila.numero}`}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            href={`${armarEnlace(vista, { idea: String(fila.id) })}#ficha`}
                            aria-current={abierta ? "true" : undefined}
                            className="font-medium hover:underline"
                            style={{ color: abierta ? "var(--color-marca-600)" : "var(--texto)" }}
                          >
                            {fila.titulo}
                          </Link>
                          {fila.categoria && (
                            <span
                              className="mt-0.5 block text-xs"
                              style={{ color: "var(--texto-suave)" }}
                            >
                              {fila.categoria}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex flex-col items-start gap-1">
                            <ChipEstado estado={fila.estado} />
                            {!fila.publicada && (
                              <Chip color="var(--color-acento-600)">sin publicar</Chip>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {falta ? (
                            <Chip color="var(--color-acento-600)">falta</Chip>
                          ) : fila.tieneDevolucion ? (
                            <Chip color="var(--color-cat-ambiental)">escrita</Chip>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
                              sin escribir
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {/* Solo el booleano: el mail del autor no sale de la base. */}
                          {fila.tieneContacto ? (
                            <span title="El autor dejó un mail para recibir avisos. El panel nunca muestra el dato.">
                              <Chip color="var(--color-marca-600)">
                                <span aria-hidden="true">✉</span> sí
                              </Chip>
                            </span>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "var(--texto-suave)" }}
                              title="No hay forma de avisarle al autor por mail."
                            >
                              sin contacto
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {fila.distrito === null ? (
                            <span style={{ color: "var(--texto-suave)" }}>—</span>
                          ) : (
                            `D${fila.distrito}`
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {fila.barrio ?? <span style={{ color: "var(--texto-suave)" }}>—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          <span title={fechaHora.format(fila.createdAt)}>
                            {antiguedad(fila.createdAt, ahora)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatearNumero(fila.votos)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {paginas > 1 && (
            <nav aria-label="Paginación de las ideas" className="mt-4 flex flex-wrap items-center gap-2">
              <EnlacePagina
                href={armarEnlace(vista, { pagina: vista.pagina - 1 })}
                habilitado={vista.pagina > 1}
              >
                Anterior
              </EnlacePagina>
              {ventanaPaginas(vista.pagina, paginas).map((numero, indice) =>
                numero === null ? (
                  <span
                    key={`hueco-${indice}`}
                    aria-hidden="true"
                    className="px-1 text-sm"
                    style={{ color: "var(--texto-suave)" }}
                  >
                    …
                  </span>
                ) : (
                  <EnlacePagina
                    key={numero}
                    href={armarEnlace(vista, { pagina: numero })}
                    habilitado
                    actual={numero === vista.pagina}
                  >
                    {numero}
                  </EnlacePagina>
                ),
              )}
              <EnlacePagina
                href={armarEnlace(vista, { pagina: vista.pagina + 1 })}
                habilitado={vista.pagina < paginas}
              >
                Siguiente
              </EnlacePagina>
              <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Página {formatearNumero(vista.pagina)} de {formatearNumero(paginas)}
              </span>
            </nav>
          )}
        </section>

        {/* La ficha queda fija al costado, con scroll propio: el historial de una
            idea trabajada puede ser mas alto que la pantalla. */}
        <section
          id="ficha"
          className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
        >
          {ficha ? (
            <Ficha
              key={ficha.id}
              ficha={ficha}
              historial={historial}
              rol={rol}
              soloLectura={soloLectura}
            />
          ) : (
            <div
              className="rounded-2xl px-5 py-6 text-sm"
              style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
            >
              <p className="font-medium">Ninguna idea abierta.</p>
              <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
                Elegí una del listado para ver su ficha, evaluarla, publicarla o revisar su
                historial.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Tarjeta grande de una acción: número, qué es y por qué importa. */
function Tarjeta({
  valor,
  etiqueta,
  detalle,
  href,
  activo,
  color,
}: {
  valor: number;
  etiqueta: string;
  detalle: string;
  href: string;
  activo: boolean;
  color?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className="rounded-2xl px-5 py-4"
      style={{
        background: activo ? "var(--fondo-suave)" : "var(--fondo-tarjeta)",
        border: `1px solid ${activo ? "var(--color-marca-500)" : "var(--borde)"}`,
      }}
    >
      <p
        className="text-3xl font-bold tracking-tight"
        style={color ? { color } : undefined}
      >
        {formatearNumero(valor)}
      </p>
      <p className="mt-0.5 text-sm font-semibold">{etiqueta}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
        {detalle}
      </p>
    </Link>
  );
}

/** Tarjeta chica: la cuenta de un estado, enlazada a su filtro. */
function Contador({
  valor,
  etiqueta,
  href,
  activo,
}: {
  valor: number;
  etiqueta: string;
  href: string;
  activo: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className="rounded-2xl px-4 py-3"
      style={{
        background: activo ? "var(--fondo-suave)" : "var(--fondo-tarjeta)",
        border: `1px solid ${activo ? "var(--color-marca-500)" : "var(--borde)"}`,
      }}
    >
      <p className="text-2xl font-bold tracking-tight">{formatearNumero(valor)}</p>
      <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
        {etiqueta}
      </p>
    </Link>
  );
}

/** Un paso del paginador. Deshabilitado se dibuja como texto, no como enlace. */
function EnlacePagina({
  href,
  habilitado,
  actual = false,
  children,
}: {
  href: string;
  habilitado: boolean;
  actual?: boolean;
  children: React.ReactNode;
}) {
  const estilo: React.CSSProperties = {
    background: actual ? "var(--color-marca-700)" : "var(--fondo-tarjeta)",
    border: `1px solid ${actual ? "var(--color-marca-700)" : "var(--borde)"}`,
    color: actual ? "#fff" : "var(--texto)",
  };
  if (!habilitado) {
    return (
      <span
        aria-hidden="true"
        className="rounded-xl px-3 py-1.5 text-sm"
        style={{
          background: "var(--fondo-suave)",
          border: "1px solid var(--borde)",
          color: "var(--texto-suave)",
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-current={actual ? "page" : undefined}
      className="rounded-xl px-3 py-1.5 text-sm font-medium hover:brightness-95"
      style={estilo}
    >
      {children}
    </Link>
  );
}

function Ficha({
  ficha,
  historial,
  rol,
  soloLectura,
}: {
  ficha: IdeaAdmin;
  historial: FilaRevision[];
  rol: RolAdmin;
  soloLectura: boolean;
}) {
  return (
    <div className="superficie rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            {ficha.numero === null ? "Sin número asignado" : `Idea #${ficha.numero}`} ·{" "}
            {ETIQUETA_CANAL[ficha.canal]}
          </p>
          <h2 className="mt-0.5 text-lg font-bold">{ficha.titulo}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipEstado estado={ficha.estado} />
          <Chip color={ficha.publicada ? "var(--color-cat-ambiental)" : "var(--color-acento-600)"}>
            {ficha.publicada ? "publicada" : "sin publicar"}
          </Chip>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <DatoFicha etiqueta="Distrito">
          {ficha.distritoNombre ?? "Sin distrito asignado"}
        </DatoFicha>
        <DatoFicha etiqueta="Barrio">{ficha.barrio ?? "Sin barrio"}</DatoFicha>
        <DatoFicha etiqueta="Categoría">{ficha.categoriaNombre ?? "Sin categoría"}</DatoFicha>
        <DatoFicha etiqueta="Votos">{formatearNumero(ficha.votos)}</DatoFicha>
        <DatoFicha etiqueta="Autor">{ficha.autorNombre ?? "Sin nombre cargado"}</DatoFicha>
        <DatoFicha etiqueta="Contacto del autor">
          {ficha.tieneContacto
            ? ficha.autorAvisos
              ? "Dejó mail y aceptó recibir avisos"
              : "Dejó mail, sin consentimiento de avisos"
            : "No dejó contacto"}
        </DatoFicha>
        <DatoFicha etiqueta="Presupuesto cargado">
          {formatearPesos(ficha.presupuestoTotal)}
        </DatoFicha>
        <DatoFicha etiqueta="Ingresó">{fechaHora.format(ficha.createdAt)}</DatoFicha>
        <DatoFicha etiqueta="Último cambio de estado">
          {ficha.estadoActualizadoEn ? fechaHora.format(ficha.estadoActualizadoEn) : "Nunca"}
        </DatoFicha>
        <DatoFicha etiqueta="Revisó">{ficha.revisadoPor ?? "Nadie todavía"}</DatoFicha>
      </dl>

      <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        El mail del autor no sale de la base: el panel solo sabe si hay contacto, nunca cuál es.
      </p>

      {(ficha.problema || ficha.solucion || ficha.beneficios) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Texto de la propuesta</summary>
          <div className="mt-2 space-y-2 text-sm" style={{ color: "var(--texto-suave)" }}>
            {ficha.problema && (
              <p>
                <strong>Problema:</strong> {ficha.problema}
              </p>
            )}
            {ficha.solucion && (
              <p>
                <strong>Solución:</strong> {ficha.solucion}
              </p>
            )}
            {ficha.beneficios && (
              <p>
                <strong>Beneficios:</strong> {ficha.beneficios}
              </p>
            )}
          </div>
        </details>
      )}

      {ficha.notasMigracion.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Limpieza de la migración ({ficha.notasMigracion.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs" style={{ color: "var(--texto-suave)" }}>
            {ficha.notasMigracion.map((nota, indice) => (
              <li key={indice}>{nota}</li>
            ))}
            {ficha.tituloOriginal && <li>Título original: {ficha.tituloOriginal}</li>}
            {ficha.coordenadasOriginales && (
              <li>Coordenadas originales: {ficha.coordenadasOriginales}</li>
            )}
          </ul>
        </details>
      )}

      <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--fondo-suave)" }}>
        <p className="text-xs font-medium">Devolución que se publica hoy</p>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          {ficha.motivoEstado?.trim() ? ficha.motivoEstado : "Todavía no hay devolución escrita."}
        </p>
      </div>

      <a
        href={`/proyectos/${ficha.slug}`}
        className="mt-3 inline-block text-sm underline"
        target="_blank"
        rel="noreferrer"
      >
        Ver la ficha pública
      </a>

      {soloLectura ? (
        <p className="mt-5 text-sm" style={{ color: "var(--texto-suave)" }}>
          Tu rol es de lectura: podés ver la bandeja, pero no cambiar el estado ni la publicación.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {ficha.ganador ? (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-estado-ganador) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-estado-ganador) 40%, transparent)",
              }}
            >
              Está proclamada como proyecto ganador. Para cambiarle el estado hay que reabrir la
              revisión primero, y eso lo puede hacer solo un administrador.
            </div>
          ) : (
            <FormularioEvaluacion ficha={ficha} />
          )}

          <FormularioPublicacion ficha={ficha} />

          {rol === "admin" && !ficha.ganador && <FormularioProclamacion ficha={ficha} />}

          <FormularioReapertura ficha={ficha} rol={rol} />
        </div>
      )}

      <Historial historial={historial} />
    </div>
  );
}

function DatoFicha({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--texto-suave)" }}>
        {etiqueta}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function FormularioEvaluacion({ ficha }: { ficha: IdeaAdmin }) {
  const [resultado, accion, pendiente] = useActionState(evaluarIdea, null);
  const inicial: EstadoIdea = ESTADOS_EVALUACION.includes(ficha.estado)
    ? ficha.estado
    : "pendiente";
  const [estado, setEstado] = useState<EstadoIdea>(inicial);
  const [devolucion, setDevolucion] = useState(ficha.motivoEstado ?? "");

  const exige = estado === "no_factible" || estado === "integrado";
  const escritos = devolucion.trim().length;
  const falta = exige && escritos < MINIMO_DEVOLUCION;

  return (
    <form action={accion} className="grid gap-3">
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="text-sm font-bold">Evaluar la idea</h3>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Estado</span>
        <select
          name="estado"
          value={estado}
          onChange={(evento) => setEstado(evento.target.value as EstadoIdea)}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        >
          {ESTADOS_EVALUACION.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_ESTADO[valor] ?? valor}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          Devolución técnica (la lee el vecino en la ficha pública)
        </span>
        <textarea
          name="devolucion"
          rows={4}
          maxLength={5000}
          value={devolucion}
          onChange={(evento) => setDevolucion(evento.target.value)}
          placeholder="Por qué la idea es factible o no, en palabras que se entiendan sin ser técnico."
          style={estiloCampo}
          className="resize-y rounded-xl px-3 py-2"
        />
        <span
          className="text-xs"
          style={{ color: falta ? "var(--color-acento-700)" : "var(--texto-suave)" }}
        >
          {exige
            ? `“${ETIQUETA_ESTADO[estado]}” exige devolución: mínimo ${MINIMO_DEVOLUCION} caracteres (escribiste ${escritos}).`
            : `${escritos} caracteres. Si lo dejás vacío se conserva la devolución anterior.`}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Guardando…" : "Guardar evaluación"}
        </button>
        <MensajeAccion resultado={resultado} exito="Evaluación guardada." />
      </div>
    </form>
  );
}

function FormularioPublicacion({ ficha }: { ficha: IdeaAdmin }) {
  const [resultado, accion, pendiente] = useActionState(
    ficha.publicada ? despublicarIdea : publicarIdea,
    null,
  );

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">
        {ficha.publicada ? "Sacar del sitio público" : "Publicar en el sitio"}
      </h3>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          {ficha.publicada
            ? `Motivo (obligatorio, mínimo ${MINIMO_MOTIVO} caracteres)`
            : "Motivo (opcional)"}
        </span>
        <input
          name="motivo"
          maxLength={5000}
          minLength={ficha.publicada ? MINIMO_MOTIVO : undefined}
          required={ficha.publicada}
          placeholder={
            ficha.publicada
              ? "Por qué se saca algo que los vecinos ya vieron publicado."
              : "Queda en el historial de la idea."
          }
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{
            background: ficha.publicada ? "var(--color-acento-600)" : "var(--color-marca-700)",
          }}
        >
          {pendiente ? "Guardando…" : ficha.publicada ? "Despublicar" : "Publicar"}
        </button>
        {/* El texto de exito es generico a proposito: cuando la accion sale bien
            la ficha se relee y este formulario ya muestra la accion contraria. */}
        <MensajeAccion resultado={resultado} exito="Listo, quedó en el historial." />
      </div>
    </form>
  );
}

function FormularioProclamacion({ ficha }: { ficha: IdeaAdmin }) {
  const [resultado, accion, pendiente] = useActionState(proclamarGanador, null);

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">Proclamar proyecto ganador</h3>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Solo se puede proclamar la idea más votada del distrito entre las factibles y publicadas. Si
        no es la más votada, si hay empate en el primer puesto o si el distrito ya tiene ganador, la
        acción lo explica y no cambia nada.
      </p>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Nota para el historial (opcional)</span>
        <input
          name="nota"
          maxLength={5000}
          placeholder="Si la dejás vacía se guarda el distrito y la cantidad de votos."
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--color-estado-ganador)", color: "#fff" }}
        >
          {pendiente ? "Proclamando…" : "Proclamar ganador"}
        </button>
        <MensajeAccion resultado={resultado} exito="Proyecto proclamado ganador." />
      </div>
    </form>
  );
}

function FormularioReapertura({ ficha, rol }: { ficha: IdeaAdmin; rol: RolAdmin }) {
  const [resultado, accion, pendiente] = useActionState(reabrirRevision, null);

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">Reabrir la revisión</h3>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Vuelve la idea a “En evaluación”. Es la marcha atrás de una evaluación o de una
        proclamación equivocada.
        {ficha.ganador &&
          rol !== "admin" &&
          " Esta idea está proclamada: dar marcha atrás lo puede hacer solo un administrador."}
      </p>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Motivo (obligatorio, mínimo {MINIMO_MOTIVO} caracteres)</span>
        <input
          name="motivo"
          required
          minLength={MINIMO_MOTIVO}
          maxLength={5000}
          placeholder="Por qué se reabre."
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          {pendiente ? "Reabriendo…" : "Reabrir revisión"}
        </button>
        <MensajeAccion resultado={resultado} exito="Revisión reabierta." />
      </div>
    </form>
  );
}

function MensajeAccion({
  resultado,
  exito,
}: {
  resultado: Resultado | null;
  exito: string;
}) {
  if (!resultado) return null;
  return (
    <span
      role="status"
      className="text-sm"
      style={{ color: resultado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-700)" }}
    >
      {resultado.ok ? (resultado.mensaje ?? exito) : resultado.error}
    </span>
  );
}

function Historial({ historial }: { historial: FilaRevision[] }) {
  return (
    <div className="mt-6" style={{ borderTop: "1px solid var(--borde)" }}>
      <h3 className="mt-4 text-sm font-bold">Historial de revisiones</h3>
      {historial.length === 0 ? (
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay movimientos registrados para esta idea.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {historial.map((fila) => (
            <li key={fila.id} className="rounded-xl px-4 py-3" style={{ background: "var(--fondo-suave)" }}>
              <p className="text-sm font-medium">
                {ETIQUETA_ACCION[fila.accion]}
                {fila.estadoNuevo && (
                  <span className="font-normal" style={{ color: "var(--texto-suave)" }}>
                    {" · "}
                    {fila.estadoAnterior ? `${ETIQUETA_ESTADO[fila.estadoAnterior]} → ` : ""}
                    {ETIQUETA_ESTADO[fila.estadoNuevo]}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                {fila.adminNombre} · {fechaHora.format(fila.createdAt)}
              </p>
              {fila.nota && <p className="mt-1 text-sm">{fila.nota}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
