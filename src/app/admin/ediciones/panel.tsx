"use client";

/**
 * Panel de ediciones: alta de un anio nuevo, fechas y presupuesto de cada
 * edicion, activacion (la base solo tolera una activa), etapa del proceso y
 * cronograma de hitos.
 *
 * La etapa se cambia aca, dentro de la edicion activa y con confirmacion
 * explicita (ver ../selector-etapa). Antes estaba en la cabecera de la pantalla
 * de Ideas, al lado de un filtro: era la accion mas peligrosa del panel puesta
 * en el lugar mas cotidiano.
 */
import { useState, useActionState } from "react";
import SelectorEtapa from "../selector-etapa";
import { Chevron } from "@/components/ui";
import {
  activarEdicion,
  borrarHito,
  crearEdicion,
  guardarEdicion,
  guardarHito,
} from "../acciones";
import {
  ETIQUETA_ETAPA,
  formatearNumero,
  formatearPesos,
  formatearRango,
} from "@/lib/formato";

type Hito = {
  id: number;
  orden: number;
  titulo: string;
  detalle: string | null;
  desde: string | null;
  hasta: string | null;
  etapa: string | null;
};

export type FilaEdicion = {
  id: number;
  anio: number;
  etapa: string;
  activa: boolean;
  presupuestoTotal: number | null;
  ideasDesde: string | null;
  ideasHasta: string | null;
  votacionDesde: string | null;
  votacionHasta: string | null;
  ideas: number;
  votos: number;
  hitos: Hito[];
};

type Rol = "admin" | "moderador" | "lector";

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;

const anioProximo = new Date().getFullYear() + 1;

export default function PanelEdiciones({
  ediciones,
  rol,
}: {
  ediciones: FilaEdicion[];
  rol: Rol;
}) {
  const activa = ediciones.find((edicion) => edicion.activa) ?? null;
  const [abierta, setAbierta] = useState<number | null>(activa?.id ?? ediciones[0]?.id ?? null);

  // guardarEdicion, crearEdicion y activarEdicion piden rol admin; el
  // cronograma lo puede editar un moderador.
  const puedeEdiciones = rol === "admin";
  const puedeCronograma = rol !== "lector";

  return (
    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <section>
        <h1 className="text-2xl font-bold">Ediciones del Presupuesto Participativo</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          {ediciones.length} {ediciones.length === 1 ? "edición" : "ediciones"} ·{" "}
          {activa ? (
            <>
              activa: <strong>{activa.anio}</strong> ({ETIQUETA_ETAPA[activa.etapa] ?? activa.etapa}
              )
            </>
          ) : (
            <strong>ninguna activa</strong>
          )}
        </p>

        {!activa && (
          <p
            role="alert"
            className="mt-4 rounded-2xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
              border: "1px solid var(--color-acento-600)",
            }}
          >
            No hay ninguna edición activa: el sitio público no tiene qué mostrar. Activá una desde
            la lista.
          </p>
        )}

        <ul className="mt-6 space-y-2">
          {ediciones.map((edicion) => (
            <li key={edicion.id} className="superficie rounded-2xl">
              {/*
                Las cuatro cuentas de la derecha van en columnas de ancho fijo y
                no concatenadas con puntos medios: asi se pueden comparar dos
                ediciones leyendo para abajo. El presupuesto va apagado cuando
                falta, la misma distincion que hacen las tarjetas del tablero
                entre un dato y un dato que todavia no esta.
              */}
              <button
                type="button"
                onClick={() => setAbierta(abierta === edicion.id ? null : edicion.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left"
                aria-expanded={abierta === edicion.id}
              >
                <Chevron abierto={abierta === edicion.id} />
                <span className="text-base font-bold">{edicion.anio}</span>
                {edicion.activa ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-semibold"
                    style={{
                      background: "color-mix(in srgb, var(--color-marca-600) 14%, transparent)",
                      color: "var(--color-marca-700)",
                    }}
                  >
                    activa
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
                    inactiva
                  </span>
                )}
                <span className="flex-1 text-sm font-medium">
                  {ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}
                </span>
                <span className="w-20 text-right text-xs" style={{ color: "var(--texto-suave)" }}>
                  {formatearNumero(edicion.ideas)} ideas
                </span>
                <span className="w-24 text-right text-xs" style={{ color: "var(--texto-suave)" }}>
                  {formatearNumero(edicion.votos)} votos
                </span>
                <span className="w-16 text-right text-xs" style={{ color: "var(--texto-suave)" }}>
                  {edicion.hitos.length} {edicion.hitos.length === 1 ? "hito" : "hitos"}
                </span>
                <span
                  className="w-32 text-right text-xs"
                  style={{
                    color:
                      edicion.presupuestoTotal === null ? "var(--texto-suave)" : "var(--texto)",
                  }}
                >
                  {edicion.presupuestoTotal === null
                    ? "sin presupuesto"
                    : formatearPesos(edicion.presupuestoTotal)}
                </span>
              </button>

              {abierta === edicion.id && (
                <div
                  className="space-y-6 px-5 pb-6"
                  style={{ borderTop: "1px solid var(--borde)" }}
                >
                  {/* La etapa solo se ofrece sobre la edicion activa: es la
                      unica que el sitio publico mira. */}
                  {edicion.activa ? (
                    <div className="mt-5">
                      <SelectorEtapa
                        edicionId={edicion.id}
                        etapa={edicion.etapa}
                        rol={rol}
                      />
                    </div>
                  ) : (
                    <p className="mt-5 text-xs" style={{ color: "var(--texto-suave)" }}>
                      Etapa guardada: <strong>{ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}</strong>
                      . Mientras la edición esté inactiva la etapa no cambia nada en el sitio
                      público: activala primero y ahí se puede mover.
                    </p>
                  )}

                  <FormularioEdicion edicion={edicion} soloLectura={!puedeEdiciones} />

                  {!edicion.activa && puedeEdiciones && (
                    <BloqueActivar edicion={edicion} anioActiva={activa?.anio ?? null} />
                  )}

                  <Cronograma edicion={edicion} soloLectura={!puedeCronograma} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <aside className="space-y-6">
        {puedeEdiciones && <FormularioNuevaEdicion />}

        <div className="superficie rounded-2xl p-6 text-sm">
          <h2 className="text-lg font-bold">Cómo funciona</h2>
          <ul className="mt-3 space-y-3" style={{ color: "var(--texto-suave)" }}>
            <li>
              <strong style={{ color: "var(--texto)" }}>Una sola edición activa.</strong> Al activar
              una edición, la que estaba activa se desactiva en el mismo movimiento. Todo el sitio
              público —portada, mapa, votación, transparencia y el chatbot— pasa a mostrar la
              edición nueva.
            </li>
            <li>
              <strong style={{ color: "var(--texto)" }}>La etapa se cambia acá.</strong> La etapa
              del proceso (presentación de ideas, evaluación técnica, votación, seguimiento o
              cerrada) se elige dentro de la edición activa, en esta misma pantalla. Es lo que abre
              el formulario de ideas y lo que abre la votación pública, así que antes de guardar el
              cambio la pantalla te dice, en palabras, qué va a pasar en el sitio.
            </li>
            <li>
              <strong style={{ color: "var(--texto)" }}>Las fechas son informativas.</strong> Se
              usan para contarle al vecino cuándo presenta y cuándo vota; lo que habilita o cierra
              cada formulario es la etapa.
            </li>
            <li>
              <strong style={{ color: "var(--texto)" }}>El cronograma es lo que se publica.</strong>{" "}
              Los hitos de la edición activa se muestran en la portada y en “Cómo participar”, y el
              chatbot los usa para responder cuándo pasa cada cosa.
            </li>
          </ul>
          {!puedeEdiciones && (
            <p className="mt-4" style={{ color: "var(--texto-suave)" }}>
              {puedeCronograma
                ? `Con tu rol (${rol}) podés editar el cronograma, pero crear, editar y activar ediciones queda para un administrador.`
                : `Con tu rol (${rol}) esta pantalla es de solo lectura.`}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fechas y presupuesto
// ---------------------------------------------------------------------------

function FormularioEdicion({
  edicion,
  soloLectura,
}: {
  edicion: FilaEdicion;
  soloLectura: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(guardarEdicion, null);

  return (
    <form action={accion} className="mt-5">
      <input type="hidden" name="id" value={edicion.id} />
      <h3 className="text-sm font-bold">Fechas y presupuesto</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
        Ideas: {formatearRango(edicion.ideasDesde, edicion.ideasHasta) || "sin fechas cargadas"} ·
        Votación: {formatearRango(edicion.votacionDesde, edicion.votacionHasta) || "sin fechas cargadas"}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Ideas desde</span>
          <input
            name="ideasDesde"
            type="date"
            defaultValue={edicion.ideasDesde ?? ""}
            disabled={soloLectura}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Ideas hasta</span>
          <input
            name="ideasHasta"
            type="date"
            defaultValue={edicion.ideasHasta ?? ""}
            disabled={soloLectura}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Presupuesto total ($)</span>
          <input
            name="presupuestoTotal"
            type="number"
            min={0}
            step="0.01"
            defaultValue={edicion.presupuestoTotal ?? ""}
            disabled={soloLectura}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Votación desde</span>
          <input
            name="votacionDesde"
            type="date"
            defaultValue={edicion.votacionDesde ?? ""}
            disabled={soloLectura}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Votación hasta</span>
          <input
            name="votacionHasta"
            type="date"
            defaultValue={edicion.votacionHasta ?? ""}
            disabled={soloLectura}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!soloLectura && (
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-marca-700)" }}
          >
            {pendiente ? "Guardando…" : "Guardar fechas"}
          </button>
        )}
        {estado && (
          <span
            role="status"
            className="text-sm"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? "Guardado." : estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Activacion
// ---------------------------------------------------------------------------

function BloqueActivar({
  edicion,
  anioActiva,
}: {
  edicion: FilaEdicion;
  anioActiva: number | null;
}) {
  const [estado, accion, pendiente] = useActionState(activarEdicion, null);
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
    >
      <h3 className="text-sm font-bold">Activar la edición {edicion.anio}</h3>

      {!confirmando ? (
        <>
          <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
            {anioActiva
              ? `Activar esta edición desactiva la edición ${anioActiva}: solo puede haber una activa.`
              : "Al activarla, el sitio público empieza a mostrar esta edición."}
          </p>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{
              background: "var(--fondo-tarjeta)",
              border: "1px solid var(--color-marca-600)",
              color: "var(--color-marca-700)",
            }}
          >
            Activar esta edición…
          </button>
        </>
      ) : (
        <form action={accion} className="mt-2">
          <input type="hidden" name="id" value={edicion.id} />
          <p className="text-sm">
            Todo el sitio público va a mostrar la edición <strong>{edicion.anio}</strong>: la
            portada, el mapa, la votación, transparencia y el chatbot.
            {anioActiva ? (
              <>
                {" "}
                La edición <strong>{anioActiva}</strong> queda inactiva y pasa al archivo.
              </>
            ) : null}{" "}
            ¿Confirmás el cambio?
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-acento-600)" }}
            >
              {pendiente ? "Activando…" : `Sí, activar ${edicion.anio}`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="text-sm underline"
            >
              Cancelar
            </button>
            {estado && (
              <span
                role="status"
                className="text-sm"
                style={{
                  color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)",
                }}
              >
                {estado.ok ? (estado.mensaje ?? "Activada.") : estado.error}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------------

function Cronograma({
  edicion,
  soloLectura,
}: {
  edicion: FilaEdicion;
  soloLectura: boolean;
}) {
  const [agregando, setAgregando] = useState(false);

  return (
    <div>
      <h3 className="text-sm font-bold">Cronograma público ({edicion.hitos.length})</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
        Si la edición está activa, se publica en la portada y en “Cómo participar”. El orden más
        bajo aparece primero.
      </p>

      {edicion.hitos.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay hitos cargados para esta edición.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {edicion.hitos.map((hito) => (
            <li key={hito.id}>
              <FilaHito
                hito={hito}
                edicionId={edicion.id}
                soloLectura={soloLectura}
                publicado={edicion.activa}
              />
            </li>
          ))}
        </ul>
      )}

      {!soloLectura && (
        <div className="mt-3">
          {agregando ? (
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">Hito nuevo</h4>
                <button
                  type="button"
                  onClick={() => setAgregando(false)}
                  className="text-xs underline"
                >
                  Cerrar
                </button>
              </div>
              <FormularioHito
                edicionId={edicion.id}
                ordenSugerido={siguienteOrden(edicion.hitos)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde)",
                color: "var(--texto)",
              }}
            >
              Agregar un hito
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Deja hueco de 10 en 10 para poder intercalar hitos sin renumerar todo. */
function siguienteOrden(lista: Hito[]): number {
  if (lista.length === 0) return 10;
  const mayor = Math.max(...lista.map((hito) => hito.orden));
  return Math.min(mayor + 10, 999);
}

function FilaHito({
  hito,
  edicionId,
  soloLectura,
  publicado,
}: {
  hito: Hito;
  edicionId: number;
  soloLectura: boolean;
  publicado: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const rango = formatearRango(hito.desde, hito.hasta);

  return (
    <div className="rounded-xl" style={{ background: "var(--fondo-suave)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        <span
          className="min-w-8 text-xs font-semibold"
          style={{ color: "var(--texto-suave)" }}
        >
          {hito.orden}
        </span>
        <span className="font-medium">{hito.titulo}</span>
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {rango || "sin fechas"}
          {hito.etapa && ` · ${ETIQUETA_ETAPA[hito.etapa] ?? hito.etapa}`}
        </span>
        {/*
          py-1.5 y px-1: con text-xs (12 px de texto y 16 de renglon) el area
          sensible de estos dos botones quedaba en 16 px de alto, abajo de los
          24x24 que pide el criterio 2.5.8 de WCAG 2.2 para un control que no
          esta dentro de una oracion. El -my-1.5 del contenedor se lo come, asi
          que la fila del hito no crece.
        */}
        {!soloLectura && (
          <div className="-my-1.5 ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditando(!editando)}
              className="px-1 py-1.5 text-xs underline"
              aria-expanded={editando}
            >
              {editando ? "Cerrar" : "Editar"}
            </button>
            <button
              type="button"
              onClick={() => setBorrando(!borrando)}
              className="px-1 py-1.5 text-xs underline"
              style={{ color: "var(--color-acento-600)" }}
              aria-expanded={borrando}
            >
              {borrando ? "Cerrar" : "Borrar"}
            </button>
          </div>
        )}
      </div>

      {borrando && !soloLectura && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--borde)" }}>
          <ConfirmacionBorrarHito
            hito={hito}
            publicado={publicado}
            alCancelar={() => setBorrando(false)}
          />
        </div>
      )}

      {editando && !soloLectura && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--borde)" }}>
          <FormularioHito edicionId={edicionId} hito={hito} ordenSugerido={hito.orden} />
        </div>
      )}
    </div>
  );
}

function FormularioHito({
  edicionId,
  hito,
  ordenSugerido,
}: {
  edicionId: number;
  hito?: Hito;
  ordenSugerido: number;
}) {
  const [estado, accion, pendiente] = useActionState(guardarHito, null);

  return (
    <form action={accion} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="edicionId" value={edicionId} />
      {hito && <input type="hidden" name="id" value={hito.id} />}

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Orden</span>
        <input
          name="orden"
          type="number"
          min={0}
          max={999}
          defaultValue={ordenSugerido}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Título</span>
        <input
          name="titulo"
          required
          minLength={3}
          maxLength={200}
          defaultValue={hito?.titulo ?? ""}
          placeholder="Asambleas por distrito"
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Etapa (opcional)</span>
        <select
          name="etapa"
          defaultValue={hito?.etapa ?? ""}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        >
          <option value="">Sin etapa</option>
          {ETAPAS.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_ETAPA[valor]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Desde</span>
        <input
          name="desde"
          type="date"
          defaultValue={hito?.desde ?? ""}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Hasta</span>
        <input
          name="hasta"
          type="date"
          defaultValue={hito?.hasta ?? ""}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm sm:col-span-2">
        <span className="font-medium">Detalle (opcional)</span>
        <textarea
          name="detalle"
          rows={2}
          maxLength={2000}
          defaultValue={hito?.detalle ?? ""}
          placeholder="Qué pasa en esta etapa, contado para el vecino."
          style={estiloCampo}
          className="resize-y rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Guardando…" : hito ? "Guardar hito" : "Agregar hito"}
        </button>
        {estado && (
          <span
            role="status"
            className="text-sm"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? "Guardado." : estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * Borrado de un hito, con confirmacion. El borrado es definitivo (la fila se
 * va de la tabla `hitos`, no queda marcada) y, si la edicion esta activa, el
 * hito desaparece del cronograma que el vecino ve publicado: eso hay que
 * decirlo antes, no despues.
 */
function ConfirmacionBorrarHito({
  hito,
  publicado,
  alCancelar,
}: {
  hito: Hito;
  publicado: boolean;
  alCancelar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(borrarHito, null);
  const rango = formatearRango(hito.desde, hito.hasta);

  return (
    <form
      action={accion}
      className="mt-3 rounded-xl p-3"
      style={{
        background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-acento-600) 40%, transparent)",
      }}
    >
      <input type="hidden" name="id" value={hito.id} />
      <p className="text-sm font-semibold">Vas a borrar el hito “{hito.titulo}”.</p>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        {publicado
          ? "La edición está activa: el hito desaparece del cronograma de la portada y de “Cómo participar”, y el chatbot deja de contarlo cuando le preguntan cuándo pasa cada cosa."
          : "La edición está inactiva, así que este hito todavía no se publica en el sitio."}{" "}
        No se puede deshacer: si lo necesitás de nuevo hay que cargarlo otra vez
        {rango ? ` con sus fechas (${rango})` : ""}.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Borrando…" : "Sí, borrar el hito"}
        </button>
        <button type="button" onClick={alCancelar} className="text-sm underline">
          Cancelar
        </button>
        {estado && !estado.ok && (
          <span role="alert" className="text-sm" style={{ color: "var(--color-acento-700)" }}>
            {estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Alta de una edicion
// ---------------------------------------------------------------------------

function FormularioNuevaEdicion() {
  const [estado, accion, pendiente] = useActionState(crearEdicion, null);

  return (
    <div className="superficie rounded-2xl p-6">
      <h2 className="text-lg font-bold">Nueva edición</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Nace inactiva y en etapa “Presentación de ideas”. Después cargale las fechas, armá el
        cronograma y recién entonces activala.
      </p>
      <form action={accion} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Año</span>
          <input
            name="anio"
            type="number"
            required
            min={2020}
            max={2100}
            step={1}
            defaultValue={anioProximo}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-acento-600)" }}
          >
            {pendiente ? "Creando…" : "Crear edición"}
          </button>
          {estado && (
            <span
              role="status"
              className="text-sm"
              style={{
                color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)",
              }}
            >
              {estado.ok ? (estado.mensaje ?? "Creada.") : estado.error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
