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
 * Nada de lo interactivo depende de JavaScript para leer: el orden y la pagina
 * son enlaces comunes que resuelve el servidor, las tarjetas y los graficos del
 * panorama (panorama.tsx) tambien, y el buscador sigue siendo un form GET. Con
 * JavaScript el buscador busca en vivo (ver usarFiltrosEnVivo) y el boton
 * "Buscar" ni se dibuja; sin JavaScript aparece y funciona como antes.
 *
 * Dato sensible: el mail del autor NUNCA llega a esta pantalla. De la base sale
 * solo `tieneContacto`, asi que la bandeja puede decir si hay con quien
 * comunicarse, pero no cual es el dato.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Chip, ChipEstado } from "@/components/ui";
import type {
  AccionRevision,
  CandidataIntegracion,
  DireccionOrden,
  EstadoIdea,
  FilaBandeja,
  FilaRevision,
  IdeaAdmin,
  InformeImpacto,
  OrdenBandeja,
  PanoramaBandeja,
  ResumenBandeja,
  RolAdmin,
} from "@/db/queries";
import { puedeCambiarIdea, puedeProclamar, type Etapa, type Veredicto } from "@/lib/etapas";
import {
  ETIQUETA_ESTADO,
  formatearFechaCorta,
  formatearNumero,
  formatearPesos,
} from "@/lib/formato";
import {
  despublicarIdea,
  evaluarIdea,
  generarInformeImpacto,
  proclamarGanador,
  publicarIdea,
  reabrirRevision,
} from "../acciones";
import UbicacionFicha from "../ideas/ficha-ubicacion";
import BloqueCorreccion from "../ideas/formulario-correccion";
import { BloqueDescarte, BloqueRestaurar } from "../ideas/formulario-descarte";
import type { Limites } from "../ideas/limites";
import Panorama, { FiltrosActivos } from "./panorama";

/** La bandeja es la pantalla principal del panel. */
const RUTA = "/admin";

/** Mismo minimo que valida evaluarIdea en el servidor. */
const MINIMO_DEVOLUCION = 40;
/** Mismo minimo que piden despublicarIdea y reabrirRevision. */
const MINIMO_MOTIVO = 10;

/** Los cuatro estados que se pueden fijar evaluando: "ganador" se proclama. */
const ESTADOS_EVALUACION: EstadoIdea[] = ["pendiente", "factible", "no_factible", "integrado"];

const ETIQUETA_ACCION: Record<AccionRevision, string> = {
  evaluacion: "Evaluación",
  publicacion: "Publicación",
  despublicacion: "Despublicación",
  proclamacion: "Proclamación",
  reapertura: "Reapertura",
  presupuesto: "Presupuesto",
  informe: "Informe de impacto",
  alta: "Carga desde el panel",
  correccion: "Corrección",
  descarte: "Descarte",
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
  /** Slug de la categoría, o "" para todas. */
  categoria: string;
  q: string;
  /** Solo los "no" sin devolución escrita: la deuda con el vecino. */
  sinDevolucion: boolean;
  /** Solo las que todavía no se ven en el sitio. */
  sinPublicar: boolean;
  /** Solo las que tienen un mail del autor para avisarle. */
  conContacto: boolean;
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
  if (proxima.categoria) parametros.set("categoria", proxima.categoria);
  if (proxima.q) parametros.set("q", proxima.q);
  if (proxima.sinDevolucion) parametros.set("sindevolucion", "1");
  if (proxima.sinPublicar) parametros.set("publicada", "0");
  if (proxima.conContacto) parametros.set("contacto", "1");
  if (proxima.orden !== "prioridad") parametros.set("orden", proxima.orden);
  if (proxima.dir) parametros.set("dir", proxima.dir);
  if (proxima.pagina > 1) parametros.set("pagina", String(proxima.pagina));
  if (proxima.idea) parametros.set("idea", proxima.idea);
  const consulta = parametros.toString();
  return consulta ? `${RUTA}?${consulta}` : RUTA;
}

/** Lo que se espera a que la persona deje de escribir, en milisegundos. */
const DEMORA_BUSQUEDA = 350;

/**
 * El buscador busca solo, sin apretar un boton: espera a que la persona deje
 * de escribir, para no disparar una consulta por tecla. Es el unico campo que
 * queda como campo: el estado, el distrito, la categoria y las cuentas de
 * trabajo se eligen tocando las tarjetas del panorama, que son enlaces comunes.
 *
 * Detalles que hacen la diferencia entre "anda" y "no molesta":
 *  - `router.replace` y no `push`: si cada tecla dejara una entrada, el boton
 *    de atras del navegador tendria que deshacer letra por letra en vez de
 *    salir de la bandeja.
 *  - buscar vuelve SIEMPRE a la pagina 1: si estabas en la 4 de 100 ideas y
 *    filtras a 3 resultados, la pagina 4 no existe.
 *  - la URL sigue siendo la fuente de verdad, asi que la vista se puede
 *    compartir por enlace y el boton de atras funciona.
 *  - mientras la persona escribe, la URL va atras del texto por la demora: por
 *    eso el buscador no se sincroniza desde las props en ese momento, o le
 *    comeria letras.
 */
function usarFiltrosEnVivo(vista: Vista) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [montado, setMontado] = useState(false);
  const [q, setQ] = useState(vista.q);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimaVista = useRef(vista);
  ultimaVista.current = vista;

  // Sin JavaScript el formulario sigue siendo un GET con su boton "Buscar":
  // el boton se esconde recien cuando este componente monto y puede navegar.
  useEffect(() => setMontado(true), []);

  // La busqueda tambien cambia por fuera del campo: la cruz de su chip, el
  // boton de atras o "Limpiar todo". El campo sigue a la URL.
  useEffect(() => {
    if (!temporizador.current) setQ(vista.q);
  }, [vista.q]);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const navegar = (cambios: Partial<Vista>) => {
    iniciarTransicion(() => {
      router.replace(armarEnlace(ultimaVista.current, { ...cambios, pagina: 1 }), {
        scroll: false,
      });
    });
  };

  return {
    montado,
    pendiente,
    q,
    cambiarBusqueda(valor: string) {
      setQ(valor);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        temporizador.current = null;
        navegar({ q: valor });
      }, DEMORA_BUSQUEDA);
    },
    /** Enter en el buscador: no esperar la demora. */
    buscarYa() {
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
      navegar({ q });
    },
  };
}

/** Filtros en cero, para "Limpiar todo" y para el aviso de la tabla vacia. */
const VISTA_LIMPIA: Partial<Vista> = {
  estado: "",
  distrito: "",
  categoria: "",
  q: "",
  sinDevolucion: false,
  sinPublicar: false,
  conContacto: false,
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

/** Lo que la ficha necesita para corregir la idea y mostrar donde queda. */
export type ExtrasFicha = {
  categorias: { slug: string; nombre: string }[];
  /** Las ideas en las que se puede integrar la abierta. */
  candidatas: CandidataIntegracion[];
  /** En que distrito cae el punto guardado, segun la geometria oficial. */
  distritoDelPunto: number | null;
  limites: Limites;
};

export default function PanelBandeja({
  anio,
  etapa,
  resumen,
  filas,
  total,
  porPagina,
  votosRegistrados,
  panorama,
  vista,
  ficha,
  historial,
  informe,
  extras,
  rol,
  ahora,
}: {
  anio: number;
  /** Etapa de la edicion activa, que es la de todas las ideas de la bandeja. */
  etapa: Etapa;
  resumen: ResumenBandeja;
  filas: FilaBandeja[];
  /** Ideas que matchean el filtro, sin límite: es el total del paginador. */
  total: number;
  porPagina: number;
  votosRegistrados: number;
  /** Los numeros de las tarjetas y los graficos, con el filtro de `vista` puesto. */
  panorama: PanoramaBandeja;
  vista: Vista;
  ficha: IdeaAdmin | null;
  historial: FilaRevision[];
  /** Informe de impacto de la idea abierta, si alguien ya lo generó. */
  informe: InformeImpacto | null;
  /** Solo con una ficha abierta: lo de la ubicacion y la correccion. */
  extras: ExtrasFicha | null;
  rol: RolAdmin;
  ahora: number;
}) {
  const soloLectura = rol === "lector";
  const filtros = usarFiltrosEnVivo(vista);

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

  return (
    <div>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="text-2xl font-bold">Ideas · Edición {anio}</h1>
          {/*
            Lo que llega de una asamblea, por mail o en papel. Solo para quien
            puede escribir; si la etapa no deja cargar, la pantalla lo explica
            (y la accion igual lo rechaza).
          */}
          {!soloLectura && (
            <Link
              href="/admin/ideas/nueva"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Cargar una idea
            </Link>
          )}
        </div>
        {/*
          "emitidos desde esta plataforma" y no "registrados por este sitio":
          esta cuenta mira la tabla `votos`, donde solo entran los votos que se
          emitieron aca, mientras que el sitio publico muestra la suma del
          contador de cada idea, que llego con los datos migrados de 2025. Son
          dos numeros distintos y muy separados (0 contra 2.069); leerlos sin
          saber que miden cosas distintas parece un error del sistema.
        */}
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {formatearNumero(votosRegistrados)}{" "}
          {votosRegistrados === 1 ? "voto emitido" : "votos emitidos"} desde esta plataforma
        </p>
      </header>

      {/*
        --- El panorama: tarjetas y graficos que filtran -----------------
        Las tarjetas por estado, las columnas por distrito, las categorias y
        las cuentas de trabajo son los controles del filtro: cada una es un
        enlace a esta misma pantalla con el filtro cambiado, y la elegida se
        marca con borde, tilde y aria-current. Sus numeros se calculan con el
        filtro puesto (ver getPanoramaBandeja), asi que la tarjeta elegida y el
        "Mostrando X de Z" de la tabla siempre dicen lo mismo.

        Antes esto era una fila de solapas de texto mas dos selects, y antes de
        eso siete tarjetas con un numero grande que nadie sospechaba que
        filtraban. Las tarjetas volvieron porque el equipo quiso leer la bandeja
        como un tablero, con la leccion aprendida: tienen que verse como
        controles (relieve al pasar, borde en la elegida) y la fila "Filtros:"
        con sus cruces, arriba de la tabla, dice siempre que esta filtrando.
      */}
      <Panorama panorama={panorama} resumen={resumen} vista={vista} enlace={enlaceFiltro} />

      {/* --- Filtros puestos y buscador ----------------------------------- */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <FiltrosActivos
          vista={vista}
          categorias={panorama.porCategoria}
          enlace={enlaceFiltro}
          limpiar={armarEnlace(vista, VISTA_LIMPIA)}
        />
        <form
          method="get"
          action={RUTA}
          // Con JavaScript el campo ya navego solo; el submit solo llega cuando
          // alguien aprieta Enter, y ahi se busca sin esperar la demora.
          onSubmit={(evento) => {
            if (!filtros.montado) return;
            evento.preventDefault();
            filtros.buscarYa();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          {/* El resto del filtro viaja escondido: sin JavaScript, buscar no
              tiene que borrar la tarjeta elegida ni el orden. */}
          {vista.estado && <input type="hidden" name="estado" value={vista.estado} />}
          {vista.distrito && <input type="hidden" name="distrito" value={vista.distrito} />}
          {vista.categoria && <input type="hidden" name="categoria" value={vista.categoria} />}
          {vista.sinDevolucion && <input type="hidden" name="sindevolucion" value="1" />}
          {vista.sinPublicar && <input type="hidden" name="publicada" value="0" />}
          {vista.conContacto && <input type="hidden" name="contacto" value="1" />}
          {vista.orden !== "prioridad" && <input type="hidden" name="orden" value={vista.orden} />}
          {vista.dir && <input type="hidden" name="dir" value={vista.dir} />}

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Buscar</span>
            <input
              type="search"
              name="q"
              value={filtros.q}
              onChange={(evento) => filtros.cambiarBusqueda(evento.target.value)}
              placeholder="Título o barrio (con o sin tildes)…"
              style={estiloCampo}
              className="w-64 rounded-xl px-3 py-2"
            />
          </label>

          {/* Sin JavaScript el buscador necesita su boton; con JavaScript el
              campo ya busca solo y el boton sobra. */}
          {!filtros.montado && (
            <button
              type="submit"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Buscar
            </button>
          )}
        </form>
      </div>

      {/*
        La tabla y la ficha se ponen lado a lado SOLO desde 1536 px (2xl), no
        desde 1280. Son nueve columnas que necesitan unos 900 px: partiendo una
        pantalla de 1280 quedaban 715 y se cortaban el barrio, la antiguedad y
        los votos. Abajo de ese ancho la ficha va debajo de la tabla y cada una
        usa todo el ancho. Cuando entran las dos, la tabla se lleva el doble.
      */}
      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,2.2fr)_minmax(22rem,1fr)] 2xl:items-start">
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            {/*
              aria-live: como el listado ahora cambia solo, sin que nadie
              apriete un boton, quien usa lector de pantalla necesita que le
              avisen cuantos resultados quedaron.
            */}
            <p
              className="text-sm"
              aria-live="polite"
              style={{ color: "var(--texto-suave)" }}
            >
              {filtros.pendiente
                ? "Buscando…"
                : total === 0
                  ? "Ninguna idea coincide con estos filtros."
                  : `Mostrando ${formatearNumero(desde)}–${formatearNumero(hasta)} de ${formatearNumero(total)} ${
                      total === 1 ? "idea" : "ideas"
                    }`}
              {/* Sin filtro de estado las descartadas no vienen: se avisa, para
                  que una busqueda que no encuentra un spam no parezca un error. */}
              {!filtros.pendiente && !vista.estado && panorama.porEstado.descartado > 0 && (
                <>
                  {" · "}
                  <Link
                    href={enlaceFiltro({ estado: "descartado", sinDevolucion: false })}
                    className="underline"
                  >
                    {panorama.porEstado.descartado === 1
                      ? "sin la descartada"
                      : `sin las ${formatearNumero(panorama.porEstado.descartado)} descartadas`}
                  </Link>
                </>
              )}
            </p>
            {vista.orden === "prioridad" ? (
              // La unica explicacion del orden en toda la pantalla. Antes lo
              // decia tambien un parrafo de cuatro lineas abajo del titulo, a
              // dos pantallas de distancia de la tabla que ordena.
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Primero las que no evaluó nadie, después los “no” sin devolución. Tocá una idea
                para evaluarla.
              </p>
            ) : (
              <Link
                href={armarEnlace(vista, { orden: "prioridad", dir: null, pagina: 1 })}
                scroll={false}
                className="text-xs underline"
                style={{ color: "var(--marca-texto)" }}
              >
                Volver al orden de trabajo
              </Link>
            )}
          </div>

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
                              style={{ color: activa ? "var(--marca-texto)" : "var(--texto)" }}
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
                          // le debe una devolución a un vecino. Acá van las rampas
                          // y no los tokens de texto (--marca-texto, --acento-texto)
                          // que usan las pastillas de estas mismas filas: como
                          // borde alcanza con el 3:1 que pide WCAG, y la rampa lo
                          // cumple en los dos temas.
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
                            style={{ color: abierta ? "var(--marca-texto)" : "var(--texto)" }}
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
                              <Chip color="var(--acento-texto)">sin publicar</Chip>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {falta ? (
                            <Chip color="var(--acento-texto)">falta</Chip>
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
                              <Chip color="var(--marca-texto)">
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
              etapa={etapa}
              historial={historial}
              informe={informe}
              extras={extras}
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
  etapa,
  historial,
  informe,
  extras,
  rol,
  soloLectura,
}: {
  ficha: IdeaAdmin;
  etapa: Etapa;
  historial: FilaRevision[];
  informe: InformeImpacto | null;
  extras: ExtrasFicha | null;
  rol: RolAdmin;
  soloLectura: boolean;
}) {
  const descartada = ficha.estado === "descartado";
  // El historial viene del mas nuevo al mas viejo: el primer descarte es el
  // vigente.
  const descarte = historial.find((fila) => fila.accion === "descarte");

  return (
    <div className="superficie rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            {ficha.numero === null ? "Sin número asignado" : `Idea #${ficha.numero}`} ·{" "}
            {ETIQUETA_CANAL[ficha.canal]}
            {/* De que asamblea o por que via: no es publico, el equipo si lo ve. */}
            {ficha.canalDetalle && ` · ${ficha.canalDetalle}`}
          </p>
          <h2 className="mt-0.5 text-lg font-bold">{ficha.titulo}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipEstado estado={ficha.estado} />
          <Chip color={ficha.publicada ? "var(--color-cat-ambiental)" : "var(--acento-texto)"}>
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
        {/*
          "Presentada" es la fecha que declara la idea (la del papel, si la
          cargo el equipo) e "Ingresó" es cuando entro a este sistema: en una
          carga del panel pueden estar a semanas de distancia.
        */}
        {ficha.fecha && (
          <DatoFicha etiqueta="Presentada">{formatearFechaCorta(ficha.fecha)}</DatoFicha>
        )}
        <DatoFicha etiqueta="Ingresó">{fechaHora.format(ficha.createdAt)}</DatoFicha>
        {ficha.cargadoPor && <DatoFicha etiqueta="La cargó">{ficha.cargadoPor}</DatoFicha>}
        <DatoFicha etiqueta="Último cambio de estado">
          {ficha.estadoActualizadoEn ? fechaHora.format(ficha.estadoActualizadoEn) : "Nunca"}
        </DatoFicha>
        <DatoFicha etiqueta="Revisó">{ficha.revisadoPor ?? "Nadie todavía"}</DatoFicha>
        {ficha.integradaEn && (
          <DatoFicha etiqueta="Integrada en">
            <Link
              href={`/admin?idea=${ficha.integradaEn.id}#ficha`}
              className="underline"
              style={{ color: "var(--marca-texto)" }}
            >
              {ficha.integradaEn.numero === null ? "" : `#${ficha.integradaEn.numero} · `}
              {ficha.integradaEn.titulo}
            </Link>
          </DatoFicha>
        )}
        {ficha.integradas > 0 && (
          <DatoFicha etiqueta="Ideas integradas en esta">
            {formatearNumero(ficha.integradas)}
          </DatoFicha>
        )}
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

      <UbicacionFicha ficha={ficha} distritoDelPunto={extras?.distritoDelPunto ?? null} />

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

      {descartada ? (
        // Una descartada no se evalua ni se publica (src/lib/etapas.ts): la
        // ficha muestra por que se descarto y como deshacerlo, y nada mas.
        <BloqueRestaurar
          ficha={ficha}
          etapa={etapa}
          soloLectura={soloLectura}
          motivoDescarte={
            descarte
              ? {
                  nota: descarte.nota,
                  quien: descarte.adminNombre,
                  cuando: fechaHora.format(descarte.createdAt),
                }
              : null
          }
        />
      ) : (
        <FichaEnTrabajo
          ficha={ficha}
          etapa={etapa}
          informe={informe}
          extras={extras}
          rol={rol}
          soloLectura={soloLectura}
        />
      )}

      <Historial historial={historial} />
    </div>
  );
}

/**
 * La ficha de una idea que no esta descartada: su devolucion, el enlace publico,
 * el informe y todos los formularios del equipo.
 */
function FichaEnTrabajo({
  ficha,
  etapa,
  informe,
  extras,
  rol,
  soloLectura,
}: {
  ficha: IdeaAdmin;
  etapa: Etapa;
  informe: InformeImpacto | null;
  extras: ExtrasFicha | null;
  rol: RolAdmin;
  soloLectura: boolean;
}) {
  return (
    <>
      <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--fondo-suave)" }}>
        <p className="text-xs font-medium">Devolución que se publica hoy</p>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          {ficha.motivoEstado?.trim() ? ficha.motivoEstado : "Todavía no hay devolución escrita."}
        </p>
      </div>

      {/*
        La ficha publica existe solo si la idea esta publicada: getIdea la
        filtra, y el enlace llevaba a un 404 justo mientras se evaluaba.
      */}
      {ficha.publicada ? (
        <a
          href={`/proyectos/${ficha.slug}`}
          className="mt-3 inline-block text-sm underline"
          target="_blank"
          rel="noreferrer"
        >
          Ver la ficha pública
        </a>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
          Sin publicar: todavía no tiene ficha pública.
        </p>
      )}

      <BloqueInforme ficha={ficha} informe={informe} soloLectura={soloLectura} />

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
            <FormularioEvaluacion ficha={ficha} etapa={etapa} />
          )}

          <FormularioPublicacion ficha={ficha} etapa={etapa} />

          {rol === "admin" && !ficha.ganador && (
            <FormularioProclamacion ficha={ficha} etapa={etapa} />
          )}

          <FormularioReapertura ficha={ficha} rol={rol} etapa={etapa} />

          {extras && (
            <BloqueCorreccion
              ficha={ficha}
              etapa={etapa}
              categorias={extras.categorias}
              candidatas={extras.candidatas}
              limites={extras.limites}
            />
          )}

          <BloqueDescarte ficha={ficha} etapa={etapa} />
        </div>
      )}
    </>
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

function FormularioEvaluacion({ ficha, etapa }: { ficha: IdeaAdmin; etapa: Etapa }) {
  const [resultado, accion, pendiente] = useActionState(evaluarIdea, null);
  const inicial: EstadoIdea = ESTADOS_EVALUACION.includes(ficha.estado)
    ? ficha.estado
    : "pendiente";
  const [estado, setEstado] = useState<EstadoIdea>(inicial);
  const [devolucion, setDevolucion] = useState(ficha.motivoEstado ?? "");

  const exige = estado === "no_factible" || estado === "integrado";
  const escritos = devolucion.trim().length;
  const falta = exige && escritos < MINIMO_DEVOLUCION;

  // Con la votacion abierta algunos estados no se ofrecen: los que sacarian a
  // la idea de la votacion o la meterian. El estado actual siempre queda
  // habilitado (no mueve nada), asi que la devolucion se puede seguir editando.
  const permitidos = new Map(
    ESTADOS_EVALUACION.map((valor) => [
      valor,
      puedeCambiarIdea(etapa, ficha, { accion: "evaluar", estado: valor }),
    ]),
  );
  const motivoBloqueo = primerMotivo([...permitidos.values()]);

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
          {ESTADOS_EVALUACION.map((valor) => {
            const habilitado = permitidos.get(valor)?.permitido ?? true;
            return (
              <option key={valor} value={valor} disabled={!habilitado}>
                {ETIQUETA_ESTADO[valor] ?? valor}
                {habilitado ? "" : " (no disponible en votación)"}
              </option>
            );
          })}
        </select>
        {motivoBloqueo && <AvisoEtapa motivo={motivoBloqueo} />}
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
          style={{ color: falta ? "var(--acento-texto)" : "var(--texto-suave)" }}
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

function FormularioPublicacion({ ficha, etapa }: { ficha: IdeaAdmin; etapa: Etapa }) {
  const [resultado, accion, pendiente] = useActionState(
    ficha.publicada ? despublicarIdea : publicarIdea,
    null,
  );
  const veredicto = puedeCambiarIdea(etapa, ficha, {
    accion: ficha.publicada ? "despublicar" : "publicar",
  });
  const bloqueado = !veredicto.permitido;

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">
        {ficha.publicada ? "Sacar del sitio público" : "Publicar en el sitio"}
      </h3>
      {!veredicto.permitido && <AvisoEtapa motivo={veredicto.motivo} />}

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
          disabled={bloqueado}
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
          disabled={pendiente || bloqueado}
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

function FormularioProclamacion({ ficha, etapa }: { ficha: IdeaAdmin; etapa: Etapa }) {
  const [resultado, accion, pendiente] = useActionState(proclamarGanador, null);
  const veredicto = puedeProclamar(etapa);
  const bloqueado = !veredicto.permitido;

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">Proclamar proyecto ganador</h3>
      {veredicto.permitido ? (
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Solo se puede proclamar la idea más votada del distrito entre las factibles y publicadas.
          Si no es la más votada, si hay empate en el primer puesto o si el distrito ya tiene
          ganador, la acción lo explica y no cambia nada.
        </p>
      ) : (
        <AvisoEtapa motivo={veredicto.motivo} />
      )}

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Nota para el historial (opcional)</span>
        <input
          name="nota"
          maxLength={5000}
          disabled={bloqueado}
          placeholder="Si la dejás vacía se guarda el distrito y la cantidad de votos."
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente || bloqueado}
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

function FormularioReapertura({
  ficha,
  rol,
  etapa,
}: {
  ficha: IdeaAdmin;
  rol: RolAdmin;
  etapa: Etapa;
}) {
  const [resultado, accion, pendiente] = useActionState(reabrirRevision, null);
  const veredicto = puedeCambiarIdea(etapa, ficha, { accion: "reabrir" });
  const bloqueado = !veredicto.permitido;

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
      {!veredicto.permitido && <AvisoEtapa motivo={veredicto.motivo} />}

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Motivo (obligatorio, mínimo {MINIMO_MOTIVO} caracteres)</span>
        <input
          name="motivo"
          required
          minLength={MINIMO_MOTIVO}
          maxLength={5000}
          disabled={bloqueado}
          placeholder="Por qué se reabre."
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente || bloqueado}
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

/**
 * Por que la etapa de la edicion no deja usar un formulario, dicho ANTES de que
 * alguien apriete el boton (que queda deshabilitado). El texto sale de
 * src/lib/etapas.ts, el mismo que devolveria la accion si igual llegara: la
 * pantalla avisa, pero quien decide es el servidor.
 */
function AvisoEtapa({ motivo }: { motivo: string }) {
  return (
    <span className="text-xs" style={{ color: "var(--acento-texto)" }}>
      {motivo}
    </span>
  );
}

/** El motivo del primer veredicto que rechaza, o null si todos permiten. */
function primerMotivo(veredictos: Veredicto[]): string | null {
  for (const veredicto of veredictos) {
    if (!veredicto.permitido) return veredicto.motivo;
  }
  return null;
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
      style={{ color: resultado.ok ? "var(--color-cat-ambiental)" : "var(--acento-texto)" }}
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
              {/* pre-line: una correccion anota un cambio por renglon. */}
              {fila.nota && (
                <p className="mt-1 text-sm" style={{ whiteSpace: "pre-line" }}>
                  {fila.nota}
                </p>
              )}
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

/**
 * Informe de impacto de la idea.
 *
 * Es un insumo interno y esta dicho en la pantalla: no decide nada, no se
 * publica, y el borrador de devolucion hay que copiarlo al formulario de
 * evaluacion, editarlo y guardarlo. Ese recorrido de mas es a proposito: lo que
 * lee el vecino lo escribe y lo firma una persona.
 */
function BloqueInforme({
  ficha,
  informe,
  soloLectura,
}: {
  ficha: IdeaAdmin;
  informe: InformeImpacto | null;
  soloLectura: boolean;
}) {
  const [resultado, accion, pendiente] = useActionState(generarInformeImpacto, null);
  const [copiado, setCopiado] = useState(false);

  // Sin texto no hay nada que analizar: es el caso de casi todas las ideas de
  // 2025, y conviene decirlo antes de que alguien apriete el boton.
  const sinMaterial =
    `${ficha.problema ?? ""} ${ficha.solucion ?? ""}`.trim().length < 60;

  async function copiarBorrador() {
    if (!informe?.borradorDevolucion) return;
    try {
      await navigator.clipboard.writeText(informe.borradorDevolucion);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso de portapapeles queda el texto a la vista para copiarlo a mano.
    }
  }

  return (
    <section
      className="mt-5 rounded-xl p-4"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">Informe de impacto</h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
            Análisis generado por inteligencia artificial para ayudarte a evaluar. No es una
            decisión ni se publica.
          </p>
        </div>

        {!soloLectura && (
          <form action={accion}>
            <input type="hidden" name="id" value={ficha.id} />
            <button
              type="submit"
              disabled={pendiente || sinMaterial}
              className="rounded-xl px-3.5 py-2 text-xs font-semibold transition disabled:opacity-50"
              style={{ background: "var(--color-marca-700)", color: "#fff" }}
            >
              {pendiente
                ? "Generando…"
                : informe
                  ? "Volver a generar"
                  : "Generar informe"}
            </button>
          </form>
        )}
      </div>

      {sinMaterial && (
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Esta idea no tiene problema ni solución cargados: no hay material para analizar. Es el
          caso de casi todas las ideas migradas de 2025, donde solo se recuperó el texto de los
          proyectos ganadores.
        </p>
      )}

      {resultado && !resultado.ok && (
        <p
          role="alert"
          className="mt-3 rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
            border: "1px solid var(--color-acento-600)",
          }}
        >
          {resultado.error}
        </p>
      )}

      {!informe && !sinMaterial && !pendiente && (
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no se generó el informe de esta idea.
        </p>
      )}

      {informe && (
        <div className="mt-4 space-y-4 text-sm">
          <p className="font-medium">{informe.resumen}</p>

          <ListaInforme titulo="Impacto positivo esperado" puntos={informe.impactoPositivo} />
          <ListaInforme titulo="Riesgos y costos" puntos={informe.riesgos} />
          <ListaInforme
            titulo="Qué falta saber antes de decidir"
            puntos={informe.preguntas}
          />

          {informe.encuadre && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
                Encuadre
              </p>
              <p className="mt-1 leading-relaxed">{informe.encuadre}</p>
            </div>
          )}

          {informe.borradorDevolucion && (
            <div
              className="rounded-xl p-3.5"
              style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
                Borrador de devolución
              </p>
              <p className="mt-1.5 leading-relaxed">{informe.borradorDevolucion}</p>
              <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
                Copialo al campo de devolución de acá abajo, editalo y guardalo. Lo que lee el
                vecino es lo que guardes vos, con tu nombre en el historial.
              </p>
              {!soloLectura && (
                <button
                  type="button"
                  onClick={copiarBorrador}
                  className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde-control)" }}
                >
                  {copiado ? "Copiado ✓" : "Copiar borrador"}
                </button>
              )}
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Generado con {informe.modelo} · lo pidió {informe.pedidoPorNombre} ·{" "}
            {fechaHora.format(informe.createdAt)}
          </p>
        </div>
      )}
    </section>
  );
}

function ListaInforme({ titulo, puntos }: { titulo: string; puntos: string[] }) {
  if (!puntos.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </p>
      <ul className="mt-1 space-y-1 pl-4">
        {puntos.map((punto, indice) => (
          <li key={indice} className="list-disc leading-relaxed">
            {punto}
          </li>
        ))}
      </ul>
    </div>
  );
}
