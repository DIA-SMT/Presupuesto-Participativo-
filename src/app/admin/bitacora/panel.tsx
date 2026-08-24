/**
 * Pantalla de la bitacora del sistema.
 *
 * NO lleva "use client" a proposito: la pantalla no tiene una sola escritura, y
 * lo interactivo que tiene se resuelve sin JavaScript. El filtro es un form GET
 * y las paginas son enlaces comunes, igual que en la bandeja, asi que no hace
 * falta mandarle nada de esto al navegador. Al ser un componente de servidor las
 * fechas se pueden formatear aca mismo con el huso de Tucuman sin riesgo de que
 * el HTML de la hidratacion no coincida: no hay hidratacion.
 *
 * Cada fila se tiene que poder leer sola, sin cruzar nada con otra pantalla: la
 * accion en palabras (nunca el valor del enum), sobre que entidad, la etiqueta
 * legible que se guardo en el momento del cambio, el antes, el despues, quien y
 * cuando. Por eso el ANTES/DESPUES es el bloque grande y central de cada fila y
 * no una columna angosta de una tabla: los valores pueden ser un parrafo de un
 * texto del sitio (la base los recorta a 400 caracteres).
 *
 * Datos personales: de la base sale solo el nombre de quien hizo el cambio
 * (rendicion de cuentas del equipo) y la etiqueta de lo que se toco, que es
 * contenido publicable. No hay mail, ni id de cuenta, ni nada de vecinos.
 */
import Link from "next/link";
import { Chip } from "@/components/ui";
import {
  ACCIONES_SISTEMA,
  ENTIDADES_SISTEMA,
  type AccionSistema,
  type EntidadSistema,
  type FilaBitacoraSistema,
} from "@/db/queries";
import { formatearNumero } from "@/lib/formato";

/** La ruta de esta pantalla: el destino del form de filtros y de los enlaces. */
const RUTA = "/admin/bitacora";

/** Borde de un control: el token vive en src/app/globals.css (WCAG 1.4.11). */
const BORDE_CONTROL = "var(--borde-control)";

/**
 * La accion en palabras. El valor del enum (`cambio_etapa`) no se muestra nunca:
 * es un dato de la base, no algo que alguien tenga que interpretar.
 */
const ETIQUETA_ACCION: Record<AccionSistema, string> = {
  cambio_etapa: "Cambio de etapa del proceso",
  edicion_creada: "Edición creada",
  edicion_editada: "Fechas y presupuesto de la edición",
  edicion_activada: "Edición activada",
  hito_guardado: "Hito del cronograma guardado",
  hito_borrado: "Hito del cronograma borrado",
  texto_guardado: "Texto del sitio guardado",
  novedad_creada: "Novedad creada",
  avance_creado: "Avance de obra cargado",
  avance_borrado: "Avance de obra borrado",
};

/** Sobre que tipo de cosa se actuo. */
const ETIQUETA_ENTIDAD: Record<EntidadSistema, string> = {
  edicion: "Edición",
  hito: "Hito del cronograma",
  texto: "Texto del sitio",
  novedad: "Novedad",
  avance: "Avance de obra",
};

/**
 * Las dos acciones que cambian lo que ve TODO el sitio, no una ficha ni un
 * texto: la etapa de la edicion activa (que ademas abre la votacion publica
 * cuando pasa a "votacion") y el cambio de cual es la edicion activa.
 *
 * Se destacan con tres marcas a la vez y no solo con color, para que se sigan
 * distinguiendo en escala de grises y con un lector de pantalla: una barra al
 * costado, un fondo apenas teñido y un chip que lo dice en palabras.
 */
const ACCIONES_DE_ALTO_IMPACTO: readonly AccionSistema[] = ["cambio_etapa", "edicion_activada"];

function esDeAltoImpacto(accion: AccionSistema): boolean {
  return ACCIONES_DE_ALTO_IMPACTO.includes(accion);
}

/** Fechas con hora en la zona de Tucuman: una bitacora se lee por minuto. */
const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

/**
 * Todo lo que define la vista y viaja en el querystring. La page lo arma ya
 * validado contra las listas blancas de queries.ts, asi que aca solo se dibuja
 * y se rearman enlaces.
 */
export type VistaBitacora = {
  /** "" = sin filtrar por accion. */
  accion: AccionSistema | "";
  /** "" = sin filtrar por entidad. */
  entidad: EntidadSistema | "";
  /** Pagina actual, base 1. */
  pagina: number;
};

/** Enlace a esta misma pantalla cambiando algo de la vista. */
function armarEnlace(vista: VistaBitacora, cambios: Partial<VistaBitacora> = {}): string {
  const proxima = { ...vista, ...cambios };
  const parametros = new URLSearchParams();
  if (proxima.accion) parametros.set("accion", proxima.accion);
  if (proxima.entidad) parametros.set("entidad", proxima.entidad);
  if (proxima.pagina > 1) parametros.set("pagina", String(proxima.pagina));
  const consulta = parametros.toString();
  return consulta ? `${RUTA}?${consulta}` : RUTA;
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

export default function PanelBitacora({
  filas,
  total,
  porPagina,
  vista,
}: {
  filas: FilaBitacoraSistema[];
  /** Filas que matchean el filtro, sin límite: es el total del paginador. */
  total: number;
  porPagina: number;
  vista: VistaBitacora;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (vista.pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, vista.pagina * porPagina);
  const hayFiltro = Boolean(vista.accion || vista.entidad);

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">Bitácora del sistema</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
          Quién cambió qué, cuándo, y de qué valor a qué valor. Cubre lo que no es una idea ni una
          cuenta: la etapa del proceso, las ediciones y su cronograma, los textos y las novedades
          del sitio, y los avances de obra que ve el vecino.
        </p>
      </header>

      {/* Solo lectura: es la propiedad que hace que la bitácora sirva de prueba,
          así que se dice en la pantalla y no solo en el código. */}
      <aside
        className="mt-4 max-w-3xl rounded-2xl px-5 py-4 text-sm"
        style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
      >
        <p className="font-semibold">Esta pantalla es de solo lectura.</p>
        <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
          La bitácora es <strong>append-only</strong>: acá no hay ningún botón que guarde, edite ni
          borre, y tampoco lo hay para un administrador. Una bitácora que se puede corregir no
          prueba nada. Por eso también la puede consultar cualquier rol del panel, incluido{" "}
          <strong>lector</strong>: auditar no necesita permiso de escritura.
        </p>
        <p className="mt-2" style={{ color: "var(--texto-suave)" }}>
          Lo que cambia sobre <strong>una idea</strong> (evaluación, publicación, proclamación,
          presupuesto) queda en el historial de su ficha, en{" "}
          <Link href="/admin" className="underline">
            Ideas
          </Link>
          ; lo que cambia sobre <strong>una cuenta</strong> del panel, en la bitácora de Equipo.
        </p>
      </aside>

      {/* --- Filtros -------------------------------------------------------
          Form GET: funciona sin JavaScript y el resultado es un enlace que se
          puede pasar al resto del equipo. No lleva el campo `pagina`, así que
          filtrar vuelve sola a la primera página. */}
      <form method="get" action={RUTA} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Acción</span>
          <select
            name="accion"
            defaultValue={vista.accion}
            className="rounded-xl px-3 py-2"
            style={estiloControl}
          >
            <option value="">Todas</option>
            {ACCIONES_SISTEMA.map((accion) => (
              <option key={accion} value={accion}>
                {ETIQUETA_ACCION[accion]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Entidad</span>
          <select
            name="entidad"
            defaultValue={vista.entidad}
            className="rounded-xl px-3 py-2"
            style={estiloControl}
          >
            <option value="">Todas</option>
            {ENTIDADES_SISTEMA.map((entidad) => (
              <option key={entidad} value={entidad}>
                {ETIQUETA_ENTIDAD[entidad]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)", border: "1px solid var(--color-marca-700)" }}
        >
          Filtrar
        </button>
        {hayFiltro && (
          <Link href={RUTA} className="pb-3 text-sm underline">
            Limpiar filtros
          </Link>
        )}
      </form>

      <section className="mt-6" aria-labelledby="titulo-movimientos">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="titulo-movimientos" className="text-lg font-bold">
            Movimientos
          </h2>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            {total === 0
              ? "Ningún movimiento registrado con estos filtros."
              : `Mostrando ${formatearNumero(desde)}–${formatearNumero(hasta)} de ${formatearNumero(
                  total,
                )} ${total === 1 ? "movimiento" : "movimientos"}, del más nuevo al más viejo.`}
          </p>
        </div>

        {filas.length === 0 ? (
          <div
            className="mt-3 rounded-2xl px-5 py-6 text-sm"
            style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
          >
            {hayFiltro ? (
              <p style={{ color: "var(--texto-suave)" }}>
                Probá con otra acción u otra entidad, o volvé a{" "}
                <Link href={RUTA} className="underline">
                  la bitácora completa
                </Link>
                .
              </p>
            ) : (
              <p style={{ color: "var(--texto-suave)" }}>
                Todavía no se registró ningún movimiento. La bitácora empieza a llenarse con el
                próximo cambio de etapa, edición, hito, texto, novedad o avance de obra: lo que pasó
                antes de que existiera esta tabla no quedó registrado en ninguna parte.
              </p>
            )}
          </div>
        ) : (
          <ol className="mt-3 space-y-3">
            {filas.map((fila) => (
              <li key={fila.id}>
                <Movimiento fila={fila} />
              </li>
            ))}
          </ol>
        )}

        {paginas > 1 && (
          <nav
            aria-label="Paginación de la bitácora"
            className="mt-5 flex flex-wrap items-center gap-2"
          >
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
    </div>
  );
}

/**
 * Una fila de la bitacora. Se lee de arriba abajo: que se hizo, sobre que, de
 * que valor a que valor, quien y cuando.
 */
function Movimiento({ fila }: { fila: FilaBitacoraSistema }) {
  const altoImpacto = esDeAltoImpacto(fila.accion);

  return (
    <article
      className="rounded-2xl px-5 py-4"
      style={{
        background: altoImpacto
          ? "color-mix(in srgb, var(--color-acento-600) 6%, var(--fondo-tarjeta))"
          : "var(--fondo-tarjeta)",
        border: `1px solid ${
          altoImpacto
            ? "color-mix(in srgb, var(--color-acento-600) 45%, transparent)"
            : "var(--borde)"
        }`,
        // Barra al costado: la marca que sobrevive a la escala de grises.
        borderLeftWidth: "4px",
        borderLeftColor: altoImpacto ? "var(--color-acento-600)" : "var(--borde)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{ETIQUETA_ACCION[fila.accion]}</h3>
          <p className="mt-0.5 text-sm" style={{ color: "var(--texto-suave)" }}>
            {ETIQUETA_ENTIDAD[fila.entidad]}
            {fila.entidadId !== null && ` #${fila.entidadId}`} ·{" "}
            <span className="font-medium" style={{ color: "var(--texto)" }}>
              {fila.entidadEtiqueta}
            </span>
          </p>
        </div>
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {fila.adminNombre} ·{" "}
          <time dateTime={fila.createdAt.toISOString()}>{fechaHora.format(fila.createdAt)}</time>
        </p>
      </div>

      {altoImpacto && (
        <p className="mt-2">
          <Chip color="var(--color-acento-700)">
            <span aria-hidden="true">▲</span> Cambia lo que ve todo el sitio
          </Chip>
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
        <Valor
          titulo="Antes"
          valor={fila.valorAnterior}
          sinValor="No existía: este movimiento lo creó."
        />
        {/* Decorativo: la dirección ya la dicen los títulos "Antes" y "Después". */}
        <p
          aria-hidden="true"
          className="flex items-center justify-center text-lg leading-none"
          style={{ color: "var(--texto-suave)" }}
        >
          <span className="sm:hidden">↓</span>
          <span className="hidden sm:inline">→</span>
        </p>
        <Valor
          titulo="Después"
          valor={fila.valorNuevo}
          sinValor="Ya no existe: este movimiento lo borró."
          destacado
        />
      </div>
    </article>
  );
}

/**
 * Un lado del antes/despues.
 *
 * `overflow-wrap: anywhere` mas el `minmax(0, 1fr)` de la grilla son los que
 * aguantan un valor largo sin estirar la fila: una clave de texto sin espacios o
 * un parrafo entero cortan dentro de la caja en lugar de empujar el layout. El
 * `white-space: pre-wrap` conserva los saltos de linea de un texto del sitio.
 */
function Valor({
  titulo,
  valor,
  sinValor,
  destacado = false,
}: {
  titulo: string;
  valor: string | null;
  /** Qué decir cuando el valor es null (un alta no tiene antes; un borrado, después). */
  sinValor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className="min-w-0 rounded-xl px-3.5 py-2.5"
      style={{
        background: destacado
          ? "color-mix(in srgb, var(--color-marca-600) 8%, var(--fondo-suave))"
          : "var(--fondo-suave)",
        border: `1px solid ${
          destacado ? "color-mix(in srgb, var(--color-marca-600) 40%, transparent)" : "var(--borde)"
        }`,
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: destacado ? "var(--color-marca-700)" : "var(--texto-suave)" }}
      >
        {titulo}
      </p>
      {valor === null ? (
        <p className="mt-1 text-sm italic" style={{ color: "var(--texto-suave)" }}>
          {sinValor}
        </p>
      ) : (
        <p
          className={`mt-1 text-sm ${destacado ? "font-medium" : ""}`}
          style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
        >
          {valor}
        </p>
      )}
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
      style={{
        background: actual ? "var(--color-marca-700)" : "var(--fondo-tarjeta)",
        border: `1px solid ${actual ? "var(--color-marca-700)" : BORDE_CONTROL}`,
        color: actual ? "#fff" : "var(--texto)",
      }}
    >
      {children}
    </Link>
  );
}

/** Los combos y el botón son controles: el borde va con --borde-control. */
const estiloControl: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: `1px solid ${BORDE_CONTROL}`,
  color: "var(--texto)",
};
