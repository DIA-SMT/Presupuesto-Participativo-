"use client";

/**
 * Tablero del backoffice: todo lo que el equipo mira sin tocar nada.
 *
 * El componente no consulta la base: recibe los datos ya resueltos por
 * page.tsx (que es quien llama a src/db/queries.ts) y solo los dibuja. Lo unico
 * interactivo es el selector de edicion; el orden de la tabla de distritos
 * viaja por querystring y lo resuelve el servidor, asi que los encabezados son
 * enlaces comunes y la pantalla funciona igual sin JavaScript.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type {
  EstadisticaDistrito,
  EtapaEdicion,
  FilaEjecucion,
  ParticipacionDistrito,
  ResumenAdmin,
} from "@/db/queries";
import {
  ETIQUETA_ETAPA,
  ETIQUETA_PRESUPUESTO,
  formatearNumero,
  formatearPesos,
} from "@/lib/formato";
import {
  AnilloEstados,
  BarraApilada,
  BarraMini,
  MapaCalorCategorias,
  SerieDiaria,
  colorCategoria,
  formatearPorcentaje,
  type FilaMatriz,
  type PuntoGrafico,
} from "./graficos";

/**
 * Claves por las que se puede ordenar la tabla de distritos. page.tsx importa
 * este tipo (solo el tipo, se borra al compilar) y lo mapea contra su propio
 * objeto de columnas permitidas: el valor del querystring nunca llega a SQL.
 */
export type ClaveOrden =
  | "distrito"
  | "ideas"
  | "factibles"
  | "noFactibles"
  | "pendientes"
  | "votos";

export type Direccion = "asc" | "desc";

const COLUMNAS: { clave: ClaveOrden; etiqueta: string; alDerecha: boolean }[] = [
  { clave: "distrito", etiqueta: "Distrito", alDerecha: false },
  { clave: "ideas", etiqueta: "Ideas", alDerecha: true },
  { clave: "factibles", etiqueta: "Factibles", alDerecha: true },
  { clave: "noFactibles", etiqueta: "No factibles", alDerecha: true },
  { clave: "pendientes", etiqueta: "Pendientes", alDerecha: true },
  { clave: "votos", etiqueta: "Votos", alDerecha: true },
];

type EdicionOpcion = { id: number; anio: number; etapa: EtapaEdicion; activa: boolean };

type Props = {
  ediciones: EdicionOpcion[];
  edicion: EdicionOpcion;
  resumen: ResumenAdmin;
  distritos: EstadisticaDistrito[];
  categorias: { slug: string; nombre: string }[];
  matriz: FilaMatriz[];
  serieVotos: PuntoGrafico[];
  serieIdeas: PuntoGrafico[];
  ejecucion: FilaEjecucion[];
  participacion: ParticipacionDistrito[];
  orden: ClaveOrden;
  direccion: Direccion;
  umbral: number;
};

export default function PanelTablero({
  ediciones,
  edicion,
  resumen,
  distritos,
  categorias,
  matriz,
  serieVotos,
  serieIdeas,
  ejecucion,
  participacion,
  orden,
  direccion,
  umbral,
}: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  function enlaceOrden(clave: ClaveOrden): string {
    // Al cambiar de columna se arranca por lo mas interesante: el distrito de
    // menor a mayor, los conteos de mayor a menor.
    const siguiente: Direccion =
      clave === orden
        ? direccion === "asc"
          ? "desc"
          : "asc"
        : clave === "distrito"
          ? "asc"
          : "desc";
    return `/admin/tablero?edicion=${edicion.anio}&orden=${clave}&dir=${siguiente}`;
  }

  const totales = distritos.reduce(
    (suma, fila) => ({
      ideas: suma.ideas + fila.ideas,
      factibles: suma.factibles + fila.factibles,
      noFactibles: suma.noFactibles + fila.noFactibles,
      pendientes: suma.pendientes + fila.pendientes,
      votos: suma.votos + fila.votos,
    }),
    { ideas: 0, factibles: 0, noFactibles: 0, pendientes: 0, votos: 0 },
  );

  // Con la edicion en cero, estas tablas son 20 filas de ceros: dicen menos
  // que una frase y se leen como un error. La de participacion es la peor,
  // porque con el padron vacio cada celda muestra "menos de N" y parece que se
  // estan ocultando datos que en realidad no existen.
  const matrizVacia = matriz.every((fila) => fila.valores.every((valor) => valor === 0));
  const sinPadron = resumen.votantesEmpadronados === 0;

  const maximoIdeas = Math.max(1, ...distritos.map((fila) => fila.ideas));
  const maximoVotos = Math.max(1, ...distritos.map((fila) => fila.votos));
  const restoPresupuesto =
    resumen.presupuestoEdicion === null
      ? 0
      : Math.max(0, resumen.presupuestoEdicion - resumen.presupuestoAsignado);

  return (
    <div aria-busy={pendiente} style={{ opacity: pendiente ? 0.72 : 1, transition: "opacity 120ms" }}>
      {/* --- Cabecera y selector de edicion ------------------------------- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tablero · Edición {edicion.anio}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Etapa: <strong>{ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}</strong>
            {edicion.activa ? " · edición activa en el sitio" : " · edición no activa"} ·{" "}
            {formatearNumero(resumen.ideas)}{" "}
            {resumen.ideas === 1 ? "idea cargada" : "ideas cargadas"}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Edición</span>
          <select
            value={edicion.anio}
            onChange={(evento) =>
              iniciar(() => router.push(`/admin/tablero?edicion=${evento.target.value}`))
            }
            className="rounded-xl px-3 py-2 text-sm outline-none"
            style={estiloCampo}
          >
            {ediciones.map((opcion) => (
              <option key={opcion.id} value={opcion.anio}>
                {opcion.anio}
                {opcion.activa ? " (activa)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <AvisoContexto resumen={resumen} />

      {/* --- Tarjetas de resumen ------------------------------------------ */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tarjeta
          titulo="Ideas presentadas"
          valor={formatearNumero(resumen.ideas)}
          detalle={`${formatearNumero(resumen.publicadas)} publicadas · ${formatearNumero(
            resumen.sinPublicar,
          )} sin publicar`}
        />
        <Tarjeta
          titulo="Votos registrados en el sitio"
          valor={formatearNumero(resumen.votosRegistrados)}
          detalle={`Contador de las ideas: ${formatearNumero(
            resumen.votosEnIdeas,
          )} (incluye los votos importados de ediciones anteriores)`}
        />
        <Tarjeta
          titulo="Vecinos empadronados"
          valor={formatearNumero(resumen.votantesEmpadronados)}
          detalle="Padrón completo: no se divide por edición."
        />
        <Tarjeta
          titulo="Proyectos ganadores"
          valor={formatearNumero(resumen.ganadores)}
          detalle="Sobre 20 distritos. Se proclaman de uno en uno desde la bandeja."
          color="var(--color-estado-ganador)"
        />
        <Tarjeta
          titulo="Presupuesto de la edición"
          valor={formatearPesos(resumen.presupuestoEdicion)}
          detalle={`Asignado a los ganadores: ${formatearPesos(resumen.presupuestoAsignado)}`}
        />
        <Tarjeta
          titulo="Pendientes de evaluación"
          valor={formatearNumero(resumen.porEstado.pendiente)}
          detalle={`${formatearNumero(resumen.porEstado.factible)} factibles · ${formatearNumero(
            resumen.porEstado.no_factible,
          )} no factibles`}
          color="var(--color-acento-600)"
        />
      </div>

      {/* --- Composicion por estado --------------------------------------- */}
      <section className="superficie mt-3 rounded-2xl p-5">
        <h2 className="text-lg font-bold">Composición de las ideas por estado</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Cada idea tiene un solo estado, así que las porciones suman el total de la edición.
        </p>
        <div className="mt-4">
          <AnilloEstados porEstado={resumen.porEstado} />
        </div>
      </section>

      {/* --- Estadisticas por distrito ------------------------------------ */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Estadísticas por distrito</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Las 20 filas siempre están, incluso los distritos sin ideas. Tocá un encabezado para
          ordenar; el orden queda en la dirección del navegador y se puede compartir por link.
        </p>

        {totales.ideas === 0 ? (
          <p
            className="superficie mt-4 rounded-2xl p-5 text-sm"
            style={{ color: "var(--texto-suave)" }}
          >
            Sin ideas cargadas las 20 filas darían todas cero. La tabla aparece con la primera idea.
          </p>
        ) : (
          <div className="superficie mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">
                Ideas, evaluaciones y votos de cada distrito en la edición {edicion.anio}
              </caption>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--borde)" }}>
                  {COLUMNAS.map((columna) => {
                    const activa = columna.clave === orden;
                    return (
                      <th
                        key={columna.clave}
                        scope="col"
                        aria-sort={
                          activa ? (direccion === "asc" ? "ascending" : "descending") : "none"
                        }
                        className={`px-3 py-3 font-semibold ${
                          columna.alDerecha ? "text-right" : "text-left"
                        }`}
                      >
                        <Link
                          href={enlaceOrden(columna.clave)}
                          scroll={false}
                          className="inline-flex items-center gap-1 hover:underline"
                          style={{ color: activa ? "var(--color-marca-600)" : "var(--texto)" }}
                        >
                          {columna.etiqueta}
                          <span aria-hidden="true" style={{ opacity: activa ? 1 : 0.35 }}>
                            {activa ? (direccion === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </Link>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-3 py-3 text-left font-semibold">
                    Proyecto ganador
                  </th>
                </tr>
              </thead>
              <tbody>
                {distritos.map((fila) => (
                  <tr key={fila.numero} style={{ borderBottom: "1px solid var(--borde)" }}>
                    <th scope="row" className="px-3 py-3 text-left font-medium">
                      <Link href={`/distritos/${fila.numero}`} className="hover:underline">
                        D{fila.numero}
                      </Link>
                      <span
                        className="mt-0.5 block text-xs font-normal"
                        style={{ color: "var(--texto-suave)" }}
                      >
                        {fila.nombre}
                      </span>
                    </th>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className="flex items-center justify-end gap-2">
                        <BarraMini
                          valor={fila.ideas}
                          maximo={maximoIdeas}
                          color="var(--color-marca-600)"
                        />
                        <strong className="font-medium">{formatearNumero(fila.ideas)}</strong>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatearNumero(fila.factibles)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatearNumero(fila.noFactibles)}
                    </td>
                    <td
                      className="px-3 py-3 text-right tabular-nums"
                      style={{ color: fila.pendientes > 0 ? "var(--color-acento-600)" : "var(--texto-suave)" }}
                    >
                      {formatearNumero(fila.pendientes)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className="flex items-center justify-end gap-2">
                        <BarraMini
                          valor={fila.votos}
                          maximo={maximoVotos}
                          color="var(--color-marca-500)"
                        />
                        <strong className="font-medium">{formatearNumero(fila.votos)}</strong>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {fila.tituloGanador ? (
                        <span style={{ color: "var(--color-estado-ganador)" }}>
                          <span aria-hidden="true">★ </span>
                          {fila.tituloGanador}
                        </span>
                      ) : (
                        <span style={{ color: "var(--texto-suave)" }}>Sin proclamar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--borde)" }}>
                  <th scope="row" className="px-3 py-3 text-left font-semibold">
                    Total
                  </th>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatearNumero(totales.ideas)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatearNumero(totales.factibles)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatearNumero(totales.noFactibles)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatearNumero(totales.pendientes)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatearNumero(totales.votos)}
                  </td>
                  <td className="px-3 py-3 text-left font-semibold">
                    {formatearNumero(resumen.ganadores)} proclamados
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
          La columna de votos suma el contador de cada idea, que incluye los votos importados de
          ediciones anteriores: por eso puede no coincidir con los votos registrados por este sitio.
        </p>
      </section>

      {/* --- Matriz distrito x categoria ---------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Ideas por distrito y categoría</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Cuanto más intenso el color, más ideas hay en ese cruce. Sirve para ver qué categoría le
          falta a cada distrito antes de cerrar la etapa de ideas.
        </p>
        {matrizVacia ? (
          <p
            className="superficie mt-4 rounded-2xl p-5 text-sm"
            style={{ color: "var(--texto-suave)" }}
          >
            Ningún cruce de distrito y categoría tiene ideas todavía: el mapa de calor saldría todo
            del mismo color.
          </p>
        ) : (
          <div className="superficie mt-4 rounded-2xl p-5">
            <ul className="mb-4 flex flex-wrap gap-4 text-sm">
              {categorias.map((categoria) => (
                <li key={categoria.slug} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ background: colorCategoria(categoria.slug) }}
                  />
                  {categoria.nombre}
                </li>
              ))}
            </ul>
            <MapaCalorCategorias categorias={categorias} filas={matriz} />
          </div>
        )}
      </section>

      {/* --- Series ------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Actividad día por día</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Las ideas se cuentan por su fecha de presentación y los votos por el momento en que se
          registraron. En las ediciones migradas la fecha puede ser la del dataset original.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SerieDiaria
            titulo="Ideas presentadas"
            descripcion="Una línea por día con al menos una idea."
            puntos={serieIdeas}
            color="var(--color-marca-600)"
            sustantivo="ideas"
          />
          <SerieDiaria
            titulo="Votos emitidos"
            descripcion="Votos registrados por este sitio, sin contar los importados."
            puntos={serieVotos}
            color="var(--color-cat-ambiental)"
            sustantivo="votos"
          />
        </div>
      </section>

      {/* --- Ejecucion presupuestaria ------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Ejecución presupuestaria</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Solo los proyectos proclamados ganadores. El monto de la etapa es el que se cargó para la
          etapa en la que está hoy la obra.
        </p>

        <div className="superficie mt-4 rounded-2xl p-5">
          {resumen.presupuestoEdicion === null ? (
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              La edición no tiene presupuesto total cargado: se puede completar en la pantalla de
              ediciones. Asignado hasta ahora a los ganadores:{" "}
              <strong>{formatearPesos(resumen.presupuestoAsignado)}</strong>.
            </p>
          ) : (
            <BarraApilada
              etiquetaTotal={`Presupuesto de la edición ${edicion.anio}`}
              formatear={(valor) => formatearPesos(valor)}
              segmentos={[
                {
                  etiqueta: "Asignado a los proyectos ganadores",
                  valor: resumen.presupuestoAsignado,
                  color: "var(--color-estado-ganador)",
                },
                {
                  etiqueta: "Sin asignar",
                  valor: restoPresupuesto,
                  color: "var(--color-marca-500)",
                },
              ]}
            />
          )}

          {resumen.presupuestoEdicion !== null &&
            resumen.presupuestoAsignado > resumen.presupuestoEdicion && (
              <p className="mt-3 text-sm font-semibold" style={{ color: "var(--color-acento-600)" }}>
                Atención: lo asignado a los ganadores supera el presupuesto cargado para la edición.
              </p>
            )}
        </div>

        {ejecucion.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
            Todavía no hay proyectos ganadores en esta edición: la ejecución se completa después de
            la proclamación.
          </p>
        ) : (
          <div className="superficie mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <caption className="sr-only">
                Proyectos ganadores con su presupuesto, la etapa de la obra y el monto de esa etapa
              </caption>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--borde)" }}>
                  <th scope="col" className="px-3 py-3 text-left font-semibold">
                    Distrito
                  </th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold">
                    Proyecto
                  </th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold">
                    Etapa
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Presupuesto total
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Monto de la etapa
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Avance del monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {ejecucion.map((fila) => {
                  const avance =
                    fila.presupuestoTotal && fila.montoEtapaActual !== null
                      ? formatearPorcentaje(fila.montoEtapaActual, fila.presupuestoTotal)
                      : null;
                  return (
                    <tr key={fila.id} style={{ borderBottom: "1px solid var(--borde)" }}>
                      <td className="px-3 py-3 font-medium">
                        {fila.distrito === null ? "—" : `D${fila.distrito}`}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/proyectos/${fila.slug}`}
                          className="font-medium hover:underline"
                        >
                          {fila.titulo}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {ETIQUETA_PRESUPUESTO[fila.estadoPresupuesto] ?? fila.estadoPresupuesto}
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums"
                        style={{
                          color:
                            fila.presupuestoTotal === null ? "var(--texto-suave)" : "var(--texto)",
                        }}
                      >
                        {formatearPesos(fila.presupuestoTotal)}
                      </td>
                      <td
                        className="px-3 py-3 text-right tabular-nums"
                        style={{
                          color:
                            fila.montoEtapaActual === null ? "var(--texto-suave)" : "var(--texto)",
                        }}
                      >
                        {formatearPesos(fila.montoEtapaActual)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {avance === null ? (
                          <span style={{ color: "var(--texto-suave)" }}>Sin datos</span>
                        ) : (
                          <span className="flex items-center justify-end gap-2">
                            <BarraMini
                              valor={fila.montoEtapaActual ?? 0}
                              maximo={fila.presupuestoTotal ?? 0}
                              color="var(--color-estado-ganador)"
                            />
                            {avance}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Participacion por distrito ----------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xl font-bold">Participación por distrito</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Empadronados de cada distrito y cuántos de ellos votaron en esta edición.
        </p>

        {sinPadron ? (
          <p
            className="superficie mt-4 rounded-2xl p-5 text-sm"
            style={{ color: "var(--texto-suave)" }}
          >
            Todavía no hay nadie empadronado en el sitio, así que no hay participación que medir. La
            tabla aparece cuando se empadrone la primera persona.
          </p>
        ) : (
          <>
          <div className="superficie mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">
                Personas empadronadas y votantes de cada distrito, con las celdas chicas suprimidas
              </caption>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--borde)" }}>
                  <th scope="col" className="px-3 py-3 text-left font-semibold">
                    Distrito
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Empadronados
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Votaron
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    Participación
                  </th>
                </tr>
              </thead>
              <tbody>
                {participacion.map((fila) => {
                  const proporcion =
                    fila.empadronados !== null && fila.votaron !== null && fila.empadronados > 0
                      ? formatearPorcentaje(fila.votaron, fila.empadronados)
                      : null;
                  return (
                    <tr key={fila.distrito} style={{ borderBottom: "1px solid var(--borde)" }}>
                      <th scope="row" className="px-3 py-3 text-left font-medium">
                        D{fila.distrito}
                        <span
                          className="mt-0.5 block text-xs font-normal"
                          style={{ color: "var(--texto-suave)" }}
                        >
                          {fila.nombre}
                        </span>
                      </th>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <Celda valor={fila.empadronados} umbral={umbral} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <Celda valor={fila.votaron} umbral={umbral} />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {proporcion === null ? (
                          <span style={{ color: "var(--texto-suave)" }}>—</span>
                        ) : (
                          <span className="flex items-center justify-end gap-2">
                            <BarraMini
                              valor={fila.votaron ?? 0}
                              maximo={fila.empadronados ?? 0}
                              color="var(--color-cat-ambiental)"
                            />
                            {proporcion}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-3xl text-xs" style={{ color: "var(--texto-suave)" }}>
            <strong>Por qué aparece “menos de {umbral}”:</strong> cuando en un distrito hay muy pocas
            personas, publicar el número exacto junto con el ranking de proyectos permite deducir a
            quién votó cada una. Por eso toda celda con menos de {umbral} personas se suprime en la
            consulta y llega a esta pantalla sin el valor real. Tampoco se muestra el total del padrón
            por distrito: restando las filas visibles se podría reconstruir la celda suprimida. Un
            “menos de {umbral}” puede ser cero.
          </p>
          </>
        )}
      </section>
    </div>
  );
}

/** Como se nombra cada canal dentro de una frase. */
const NOMBRE_CANAL: Record<string, string> = {
  web: "por el sitio",
  asamblea: "en asambleas",
  municipio: "por el municipio",
  migracion: "importadas de otro registro",
};

/** Une una lista en castellano: "a, b y c". */
function unirEnCastellano(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];
}

/**
 * El aviso que encabeza el tablero.
 *
 * Existe por un problema concreto y medido: la edicion activa (2025) se corrio
 * en asambleas y sus datos se importaron, asi que "votos registrados en el
 * sitio", "vecinos empadronados" y toda la participacion valen cero POR
 * DEFINICION. Sin esta frase, media pantalla en cero se lee como si el tablero
 * estuviera roto.
 *
 * No clasifica la edicion por el canal de las ideas: eso daba falsos negativos
 * (con cuatro ideas de prueba cargadas por la web, 2025 pasaba a "mixta" y el
 * aviso dejaba de explicar los ceros). Se enumeran las dimensiones que estan en
 * cero y por que, que es exactamente lo que el equipo necesita saber.
 */
function AvisoContexto({ resumen }: { resumen: ResumenAdmin }) {
  if (resumen.ideas === 0) {
    return (
      <Aviso titulo="Todavía no entró ninguna idea en esta edición.">
        Por eso todo lo que sigue está en cero. Los indicadores se van a ir llenando solos cuando
        abra la presentación de ideas.
      </Aviso>
    );
  }

  const ideasDeAfuera = resumen.ideas - resumen.porCanal.web;
  const canalesDeAfuera = (["asamblea", "municipio", "migracion"] as const)
    .filter((canal) => resumen.porCanal[canal] > 0)
    .map((canal) => formatearNumero(resumen.porCanal[canal]) + " " + NOMBRE_CANAL[canal]);

  // Los votos existen (las ideas los muestran) pero ninguno se emitio en el
  // sitio: se importaron con la edicion.
  const votacionDeAfuera = resumen.votosRegistrados === 0 && resumen.votosEnIdeas > 0;
  const sinPadron = resumen.votantesEmpadronados === 0;

  const aclaraciones: string[] = [];
  if (ideasDeAfuera > 0) {
    aclaraciones.push(
      formatearNumero(ideasDeAfuera) +
        " de sus " +
        formatearNumero(resumen.ideas) +
        " ideas entraron " +
        unirEnCastellano(canalesDeAfuera) +
        ", no por el sitio.",
    );
  }
  if (votacionDeAfuera) {
    aclaraciones.push(
      "Los " +
        formatearNumero(resumen.votosEnIdeas) +
        " votos que muestran las ideas se importaron junto con ellas: el sitio no registró ninguno.",
    );
  }
  if (sinPadron) {
    aclaraciones.push("Nadie se empadronó por el sitio, así que no hay participación que medir.");
  }

  if (aclaraciones.length === 0) return null; // Edicion enteramente en el sitio.

  const titulo = votacionDeAfuera
    ? "La votación de esta edición no pasó por el sitio."
    : ideasDeAfuera > 0
      ? "Parte de esta edición se cargó por fuera del sitio."
      : "Todavía no hay nadie empadronado en el sitio.";

  return (
    <Aviso titulo={titulo}>
      {aclaraciones.join(" ")}{" "}
      {votacionDeAfuera || sinPadron
        ? "Por eso los indicadores que dependen del sitio —votos registrados, vecinos " +
          "empadronados y participación por distrito— están en cero por definición, y no por " +
          "una falla."
        : null}
    </Aviso>
  );
}

/** El recuadro del aviso. Separado para que AvisoContexto sea solo la regla. */
function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      className="mt-4 max-w-4xl rounded-2xl px-4 py-3 text-sm leading-relaxed"
      style={{
        background: "var(--fondo-suave)",
        border: "1px solid var(--borde)",
        borderLeft: "4px solid var(--color-marca-600)",
      }}
    >
      <strong>{titulo}</strong> <span style={{ color: "var(--texto-suave)" }}>{children}</span>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  color,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  color?: string;
}) {
  return (
    <div className="superficie rounded-2xl p-5">
      <p className="text-sm font-medium" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-bold" style={color ? { color } : undefined}>
        {valor}
      </p>
      <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
        {detalle}
      </p>
    </div>
  );
}

/** Celda de un agregado con supresion: el null NO es un cero. */
function Celda({ valor, umbral }: { valor: number | null; umbral: number }) {
  if (valor === null) {
    return (
      <span style={{ color: "var(--texto-suave)" }} title="Dato suprimido por ser un grupo chico">
        menos de {umbral}
      </span>
    );
  }
  return <>{formatearNumero(valor)}</>;
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
