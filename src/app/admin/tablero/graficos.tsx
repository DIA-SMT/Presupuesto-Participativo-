/**
 * Graficos del tablero del backoffice.
 *
 * Todo se dibuja a mano con SVG sobre los tokens de color del tema
 * (--color-marca-*, --color-cat-*, --color-estado-*, --texto, --texto-suave,
 * --borde, --fondo-tarjeta): nunca hay un color fijo, asi que las figuras se
 * leen igual en modo claro y en oscuro. No se usa ninguna libreria de graficos.
 *
 * Regla de accesibilidad: ningun grafico es la unica fuente del dato. Cada uno
 * lleva un aria-label con el resumen y, cuando tiene mas de unos pocos
 * valores, la tabla con los mismos numeros en un <details>. El color nunca
 * distingue por si solo: siempre hay texto al lado.
 */
import { ETIQUETA_ESTADO, formatearNumero, formatearFechaCorta } from "@/lib/formato";

// ---------------------------------------------------------------------------
// Colores y formatos compartidos por los graficos
// ---------------------------------------------------------------------------

/**
 * Colores de los estados para el tablero. No se reusa COLOR_ESTADO de
 * src/lib/formato porque ahi "borrador", "pendiente" y "no_factible" comparten
 * el mismo gris: en un anillo serian tres porciones indistinguibles.
 */
export const COLOR_ESTADO_TABLERO: Record<string, string> = {
  borrador: "var(--texto-suave)",
  pendiente: "var(--color-acento-500)",
  factible: "var(--color-estado-factible)",
  no_factible: "var(--color-estado-nofactible)",
  integrado: "var(--color-estado-integrado)",
  ganador: "var(--color-estado-ganador)",
};

/** Color de cada categoria del programa, por el slug que trae la base. */
export function colorCategoria(slug: string): string {
  if (slug.includes("ambiental")) return "var(--color-cat-ambiental)";
  if (slug.includes("deportivo")) return "var(--color-cat-deportivo)";
  if (slug.includes("urbana")) return "var(--color-cat-urbana)";
  return "var(--color-marca-500)";
}

const decimales = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** Porcentaje listo para mostrar. Devuelve null si no hay base para calcularlo. */
export function formatearPorcentaje(parte: number, total: number): string | null {
  if (!total) return null;
  return `${decimales.format((parte / total) * 100)} %`;
}

/** Tinte del color sobre el fondo de la tarjeta, proporcional a la intensidad. */
function tinte(color: string, intensidad: number): string {
  return `color-mix(in srgb, ${color} ${intensidad}%, transparent)`;
}

const estiloEje: React.CSSProperties = { fontSize: 11 };

// ---------------------------------------------------------------------------
// Anillo de estados
// ---------------------------------------------------------------------------

const ORDEN_ESTADOS = [
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
  "borrador",
] as const;

/**
 * Anillo con la composicion de las ideas por estado. La leyenda de al lado es
 * la version accesible: dice el estado, la cantidad y el porcentaje en texto.
 */
export function AnilloEstados({ porEstado }: { porEstado: Record<string, number> }) {
  const partes = ORDEN_ESTADOS.map((estado) => ({
    estado,
    etiqueta: ETIQUETA_ESTADO[estado] ?? estado,
    color: COLOR_ESTADO_TABLERO[estado] ?? "var(--color-marca-500)",
    cantidad: porEstado[estado] ?? 0,
  })).filter((parte) => parte.cantidad > 0);

  const total = partes.reduce((suma, parte) => suma + parte.cantidad, 0);

  if (total === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
        Esta edición todavía no tiene ideas cargadas.
      </p>
    );
  }

  const radio = 54;
  const circunferencia = 2 * Math.PI * radio;
  let acumulado = 0;

  const resumen = partes
    .map((parte) => `${parte.etiqueta}: ${formatearNumero(parte.cantidad)}`)
    .join("; ");

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 160 160"
        className="h-36 w-36 shrink-0"
        role="img"
        aria-label={`Ideas por estado, ${formatearNumero(total)} en total. ${resumen}.`}
      >
        <circle
          cx={80}
          cy={80}
          r={radio}
          fill="none"
          stroke="var(--borde)"
          strokeWidth={22}
        />
        {partes.map((parte) => {
          const largo = (parte.cantidad / total) * circunferencia;
          const desfase = -acumulado;
          acumulado += largo;
          return (
            <circle
              key={parte.estado}
              cx={80}
              cy={80}
              r={radio}
              fill="none"
              stroke={parte.color}
              strokeWidth={22}
              strokeDasharray={`${largo} ${circunferencia - largo}`}
              strokeDashoffset={desfase}
              transform="rotate(-90 80 80)"
            />
          );
        })}
        <text
          x={80}
          y={76}
          textAnchor="middle"
          fill="var(--texto)"
          style={{ fontSize: 26, fontWeight: 700 }}
        >
          {formatearNumero(total)}
        </text>
        <text
          x={80}
          y={96}
          textAnchor="middle"
          fill="var(--texto-suave)"
          style={{ fontSize: 11 }}
        >
          ideas
        </text>
      </svg>

      <ul className="grid gap-1.5 text-sm">
        {ORDEN_ESTADOS.map((estado) => {
          const cantidad = porEstado[estado] ?? 0;
          if (cantidad === 0) return null;
          return (
            <li key={estado} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ background: COLOR_ESTADO_TABLERO[estado] ?? "var(--color-marca-500)" }}
              />
              <span className="font-medium">{ETIQUETA_ESTADO[estado] ?? estado}</span>
              <span style={{ color: "var(--texto-suave)" }}>
                {formatearNumero(cantidad)} · {formatearPorcentaje(cantidad, total)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Serie diaria
// ---------------------------------------------------------------------------

export type PuntoGrafico = { dia: string; cantidad: number };

const ANCHO_SERIE = 640;
const ALTO_SERIE = 210;
const MARGEN = { arriba: 14, derecha: 14, abajo: 34, izquierda: 46 };

/**
 * Linea con area para una serie por dia. El eje horizontal recorre los dias
 * QUE TIENEN datos (las consultas agrupan y no rellenan los dias en cero), asi
 * que el texto alternativo lo aclara: no es un calendario continuo.
 */
export function SerieDiaria({
  titulo,
  descripcion,
  puntos,
  color,
  sustantivo,
}: {
  titulo: string;
  descripcion: string;
  puntos: PuntoGrafico[];
  color: string;
  sustantivo: string;
}) {
  const total = puntos.reduce((suma, punto) => suma + punto.cantidad, 0);

  if (puntos.length === 0) {
    return (
      <section className="superficie rounded-2xl p-5">
        <h3 className="text-base font-bold">{titulo}</h3>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          {descripcion}
        </p>
        <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay {sustantivo} para graficar en esta edición.
        </p>
      </section>
    );
  }

  const maximo = Math.max(...puntos.map((punto) => punto.cantidad), 1);
  const anchoUtil = ANCHO_SERIE - MARGEN.izquierda - MARGEN.derecha;
  const altoUtil = ALTO_SERIE - MARGEN.arriba - MARGEN.abajo;

  const enX = (indice: number) =>
    puntos.length === 1
      ? MARGEN.izquierda + anchoUtil / 2
      : MARGEN.izquierda + (indice / (puntos.length - 1)) * anchoUtil;
  const enY = (valor: number) => MARGEN.arriba + (1 - valor / maximo) * altoUtil;

  const marcas = Array.from(new Set([0, Math.ceil(maximo / 2), maximo]));
  const linea = puntos
    .map((punto, indice) => `${indice === 0 ? "M" : "L"}${enX(indice)},${enY(punto.cantidad)}`)
    .join(" ");
  const area = `${linea} L${enX(puntos.length - 1)},${enY(0)} L${enX(0)},${enY(0)} Z`;

  const pico = puntos.reduce((mejor, punto) => (punto.cantidad > mejor.cantidad ? punto : mejor));
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const medio = puntos[Math.floor((puntos.length - 1) / 2)];

  return (
    <section className="superficie rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold">{titulo}</h3>
        <p className="text-sm font-semibold" style={{ color }}>
          {formatearNumero(total)} en total
        </p>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        {descripcion}
      </p>

      <svg
        viewBox={`0 0 ${ANCHO_SERIE} ${ALTO_SERIE}`}
        className="mt-4 h-auto w-full"
        role="img"
        aria-label={
          `${titulo}: ${formatearNumero(total)} en total, repartidos en ` +
          `${formatearNumero(puntos.length)} ${puntos.length === 1 ? "día" : "días"} con actividad, ` +
          `entre el ${formatearFechaCorta(primero.dia)} y el ${formatearFechaCorta(ultimo.dia)}. ` +
          `El día de mayor movimiento fue el ${formatearFechaCorta(pico.dia)} con ` +
          `${formatearNumero(pico.cantidad)}. Los días sin actividad no se dibujan.`
        }
      >
        {marcas.map((marca) => (
          <g key={marca}>
            <line
              x1={MARGEN.izquierda}
              y1={enY(marca)}
              x2={ANCHO_SERIE - MARGEN.derecha}
              y2={enY(marca)}
              stroke="var(--borde)"
              strokeWidth={1}
            />
            <text
              x={MARGEN.izquierda - 8}
              y={enY(marca) + 4}
              textAnchor="end"
              fill="var(--texto-suave)"
              style={estiloEje}
            >
              {formatearNumero(marca)}
            </text>
          </g>
        ))}

        <path d={area} fill={tinte(color, 18)} />
        <path d={linea} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />

        {puntos.length <= 40 &&
          puntos.map((punto, indice) => (
            <circle
              key={punto.dia}
              cx={enX(indice)}
              cy={enY(punto.cantidad)}
              r={3}
              fill="var(--fondo-tarjeta)"
              stroke={color}
              strokeWidth={2}
            />
          ))}

        <text
          x={puntos.length === 1 ? enX(0) : MARGEN.izquierda}
          y={ALTO_SERIE - 10}
          textAnchor={puntos.length === 1 ? "middle" : "start"}
          fill="var(--texto-suave)"
          style={estiloEje}
        >
          {formatearFechaCorta(primero.dia)}
        </text>
        {puntos.length > 4 && (
          <text
            x={MARGEN.izquierda + anchoUtil / 2}
            y={ALTO_SERIE - 10}
            textAnchor="middle"
            fill="var(--texto-suave)"
            style={estiloEje}
          >
            {formatearFechaCorta(medio.dia)}
          </text>
        )}
        {puntos.length > 1 && (
          <text
            x={ANCHO_SERIE - MARGEN.derecha}
            y={ALTO_SERIE - 10}
            textAnchor="end"
            fill="var(--texto-suave)"
            style={estiloEje}
          >
            {formatearFechaCorta(ultimo.dia)}
          </text>
        )}
      </svg>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm" style={{ color: "var(--texto-suave)" }}>
          Ver los datos del gráfico ({formatearNumero(puntos.length)}{" "}
          {puntos.length === 1 ? "día" : "días"})
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{titulo}: cantidad por día</caption>
            <thead>
              <tr style={{ color: "var(--texto-suave)" }}>
                <th scope="col" className="py-1 text-left font-medium">
                  Día
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Cantidad
                </th>
              </tr>
            </thead>
            <tbody>
              {puntos.map((punto) => (
                <tr key={punto.dia} style={{ borderTop: "1px solid var(--borde)" }}>
                  <th scope="row" className="py-1 text-left font-normal">
                    {formatearFechaCorta(punto.dia)}
                  </th>
                  <td className="py-1 text-right tabular-nums">
                    {formatearNumero(punto.cantidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Matriz distrito por categoria
// ---------------------------------------------------------------------------

const ANCHO_ETIQUETA = 46;
const ANCHO_CELDA = 132;
const ALTO_CELDA = 24;
const ALTO_ENCABEZADO = 44;

/** Parte un titulo largo en lineas de a lo sumo `maximo` caracteres. */
function envolver(texto: string, maximo: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    if (actual && `${actual} ${palabra}`.length > maximo) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 2);
}

export type FilaMatriz = { distrito: number; nombre: string; valores: number[] };

/**
 * Mapa de calor de ideas por distrito y categoria. La intensidad del tinte es
 * el dato redundante: el numero esta escrito en cada celda y la tabla completa
 * (con los nombres de los distritos) queda en el <details>.
 */
export function MapaCalorCategorias({
  categorias,
  filas,
}: {
  categorias: { slug: string; nombre: string }[];
  filas: FilaMatriz[];
}) {
  if (categorias.length === 0 || filas.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
        No hay categorías cargadas para armar la matriz.
      </p>
    );
  }

  const maximo = Math.max(1, ...filas.flatMap((fila) => fila.valores));
  const totalPorCategoria = categorias.map((_, columna) =>
    filas.reduce((suma, fila) => suma + (fila.valores[columna] ?? 0), 0),
  );
  const total = totalPorCategoria.reduce((suma, valor) => suma + valor, 0);

  const ancho = ANCHO_ETIQUETA + ANCHO_CELDA * categorias.length;
  const alto = ALTO_ENCABEZADO + ALTO_CELDA * filas.length;

  const resumen = categorias
    .map((categoria, columna) => `${categoria.nombre}: ${formatearNumero(totalPorCategoria[columna])}`)
    .join("; ");

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          className="mx-auto h-auto w-full"
          // El tope de ancho evita que en una pantalla grande el SVG se estire
          // y los numeros de las celdas queden gigantes.
          style={{ minWidth: 340, maxWidth: ancho }}
          role="img"
          aria-label={
            `Mapa de calor de ideas por distrito y categoría, ${formatearNumero(total)} ideas ` +
            `con categoría asignada. Totales por categoría: ${resumen}. ` +
            "El detalle completo está en la tabla que sigue."
          }
        >
          {categorias.map((categoria, columna) => {
            const x = ANCHO_ETIQUETA + columna * ANCHO_CELDA + ANCHO_CELDA / 2;
            const lineas = envolver(categoria.nombre, 20);
            return (
              <g key={categoria.slug}>
                {lineas.map((linea, indice) => (
                  <text
                    key={linea}
                    x={x}
                    y={16 + indice * 13}
                    textAnchor="middle"
                    fill="var(--texto)"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {linea}
                  </text>
                ))}
                <rect
                  x={ANCHO_ETIQUETA + columna * ANCHO_CELDA + 2}
                  y={ALTO_ENCABEZADO - 8}
                  width={ANCHO_CELDA - 4}
                  height={3}
                  fill={colorCategoria(categoria.slug)}
                  rx={1.5}
                />
              </g>
            );
          })}

          {filas.map((fila, indiceFila) => {
            const y = ALTO_ENCABEZADO + indiceFila * ALTO_CELDA;
            return (
              <g key={fila.distrito}>
                <text
                  x={ANCHO_ETIQUETA - 8}
                  y={y + ALTO_CELDA / 2 + 4}
                  textAnchor="end"
                  fill="var(--texto-suave)"
                  style={estiloEje}
                >
                  D{fila.distrito}
                </text>
                {categorias.map((categoria, columna) => {
                  const valor = fila.valores[columna] ?? 0;
                  const color = colorCategoria(categoria.slug);
                  return (
                    <g key={categoria.slug}>
                      <rect
                        x={ANCHO_ETIQUETA + columna * ANCHO_CELDA + 2}
                        y={y + 2}
                        width={ANCHO_CELDA - 4}
                        height={ALTO_CELDA - 4}
                        rx={4}
                        fill={valor === 0 ? "transparent" : tinte(color, 10 + (valor / maximo) * 45)}
                        stroke="var(--borde)"
                        strokeWidth={valor === 0 ? 1 : 0}
                      />
                      <text
                        x={ANCHO_ETIQUETA + columna * ANCHO_CELDA + ANCHO_CELDA / 2}
                        y={y + ALTO_CELDA / 2 + 4}
                        textAnchor="middle"
                        fill={valor === 0 ? "var(--texto-suave)" : "var(--texto)"}
                        style={{ fontSize: 11, fontWeight: valor === 0 ? 400 : 600 }}
                      >
                        {valor === 0 ? "–" : formatearNumero(valor)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm" style={{ color: "var(--texto-suave)" }}>
          Ver la matriz como tabla
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Ideas por distrito y categoría</caption>
            <thead>
              <tr style={{ color: "var(--texto-suave)" }}>
                <th scope="col" className="py-1 text-left font-medium">
                  Distrito
                </th>
                {categorias.map((categoria) => (
                  <th key={categoria.slug} scope="col" className="py-1 text-right font-medium">
                    {categoria.nombre}
                  </th>
                ))}
                <th scope="col" className="py-1 text-right font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.distrito} style={{ borderTop: "1px solid var(--borde)" }}>
                  <th scope="row" className="py-1 text-left font-normal">
                    D{fila.distrito} · {fila.nombre}
                  </th>
                  {fila.valores.map((valor, columna) => (
                    <td key={categorias[columna].slug} className="py-1 text-right tabular-nums">
                      {formatearNumero(valor)}
                    </td>
                  ))}
                  <td className="py-1 text-right font-semibold tabular-nums">
                    {formatearNumero(fila.valores.reduce((suma, valor) => suma + valor, 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1px solid var(--borde)" }}>
                <th scope="row" className="py-1 text-left font-semibold">
                  Total
                </th>
                {totalPorCategoria.map((valor, columna) => (
                  <td
                    key={categorias[columna].slug}
                    className="py-1 text-right font-semibold tabular-nums"
                  >
                    {formatearNumero(valor)}
                  </td>
                ))}
                <td className="py-1 text-right font-semibold tabular-nums">
                  {formatearNumero(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras
// ---------------------------------------------------------------------------

/**
 * Barra chica para meter dentro de una celda de tabla. Es decorativa a
 * proposito (aria-hidden): el numero exacto esta en la celda de al lado.
 */
export function BarraMini({
  valor,
  maximo,
  color,
}: {
  valor: number;
  maximo: number;
  color: string;
}) {
  const proporcion = maximo > 0 ? Math.min(1, Math.max(0, valor / maximo)) : 0;
  return (
    <svg viewBox="0 0 100 8" className="h-2 w-20" aria-hidden="true" focusable="false">
      <rect x={0} y={2} width={100} height={4} rx={2} fill="var(--borde)" />
      {proporcion > 0 && (
        <rect x={0} y={2} width={Math.max(1.5, proporcion * 100)} height={4} rx={2} fill={color} />
      )}
    </svg>
  );
}

export type Segmento = { etiqueta: string; valor: number; color: string };

/**
 * Barra apilada de una sola linea con su leyenda. La leyenda repite cada valor
 * en texto, asi que el grafico no aporta informacion exclusiva.
 */
export function BarraApilada({
  segmentos,
  formatear,
  etiquetaTotal,
}: {
  segmentos: Segmento[];
  formatear: (valor: number) => string;
  etiquetaTotal: string;
}) {
  const total = segmentos.reduce((suma, segmento) => suma + Math.max(0, segmento.valor), 0);

  if (total <= 0) {
    return (
      <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
        Todavía no hay montos cargados para graficar.
      </p>
    );
  }

  let acumulado = 0;
  const resumen = segmentos
    .map((segmento) => `${segmento.etiqueta}: ${formatear(segmento.valor)}`)
    .join("; ");

  return (
    <div>
      <svg
        viewBox="0 0 1000 26"
        preserveAspectRatio="none"
        className="h-6 w-full"
        role="img"
        aria-label={`${etiquetaTotal}: ${formatear(total)}. ${resumen}.`}
      >
        <rect x={0} y={0} width={1000} height={26} rx={8} fill="var(--borde)" />
        {segmentos.map((segmento) => {
          const ancho = (Math.max(0, segmento.valor) / total) * 1000;
          const x = acumulado;
          acumulado += ancho;
          if (ancho <= 0) return null;
          return (
            <rect
              key={segmento.etiqueta}
              x={x}
              y={0}
              width={ancho}
              height={26}
              fill={segmento.color}
            />
          );
        })}
      </svg>

      <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
        {segmentos.map((segmento) => (
          <li key={segmento.etiqueta} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-sm"
              style={{ background: segmento.color }}
            />
            <span className="font-medium">{segmento.etiqueta}</span>
            <span style={{ color: "var(--texto-suave)" }}>
              {formatear(segmento.valor)}
              {segmento.valor > 0 && ` · ${formatearPorcentaje(segmento.valor, total)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
