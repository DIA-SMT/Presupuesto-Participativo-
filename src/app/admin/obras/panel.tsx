"use client";

/**
 * Seguimiento de obras: por cada proyecto ganador, el historial de avances y
 * el formulario para publicar uno nuevo (fecha, etapa, descripcion, monto).
 */
import { useState, useActionState } from "react";
import { borrarAvance, crearAvance } from "../acciones";
import { ETIQUETA_PRESUPUESTO, formatearFechaCorta, formatearPesos } from "@/lib/formato";

type Avance = {
  id: number;
  fecha: string;
  etapa: string;
  titulo: string;
  descripcion: string | null;
  monto: number | null;
  porcentaje: number | null;
};

type Proyecto = {
  id: number;
  titulo: string;
  distrito: number;
  estadoPresupuesto: string;
  presupuestoTotal: number | null;
  avances: Avance[];
};

const ETAPAS = ["preparacion", "contratacion", "ejecucion", "finalizado"] as const;

export default function PanelObras({
  proyectos,
  soloLectura,
}: {
  proyectos: Proyecto[];
  soloLectura: boolean;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold">Seguimiento de obras</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Cada avance publicado aparece en la ficha pública del proyecto y en Transparencia.
      </p>

      <ul className="mt-6 space-y-2">
        {proyectos.map((proyecto) => (
          <li key={proyecto.id} className="superficie rounded-2xl">
            <button
              type="button"
              onClick={() => setAbierto(abierto === proyecto.id ? null : proyecto.id)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-left"
              aria-expanded={abierto === proyecto.id}
            >
              <span className="min-w-10 text-sm font-semibold">D{proyecto.distrito}</span>
              <span className="flex-1 text-sm font-medium">{proyecto.titulo}</span>
              <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
                {ETIQUETA_PRESUPUESTO[proyecto.estadoPresupuesto]}
                {" · "}
                {proyecto.presupuestoTotal === null
                  ? "sin monto"
                  : formatearPesos(proyecto.presupuestoTotal)}
                {" · "}
                {proyecto.avances.length} avance{proyecto.avances.length === 1 ? "" : "s"}
              </span>
            </button>

            {abierto === proyecto.id && (
              <div className="space-y-5 px-5 pb-5" style={{ borderTop: "1px solid var(--borde)" }}>
                {proyecto.avances.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {proyecto.avances.map((avance) => (
                      <li
                        key={avance.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 text-sm"
                        style={{ background: "var(--fondo-suave)" }}
                      >
                        <span style={{ color: "var(--texto-suave)" }}>
                          {formatearFechaCorta(avance.fecha)}
                        </span>
                        <span className="font-medium">{avance.titulo}</span>
                        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
                          {ETIQUETA_PRESUPUESTO[avance.etapa]}
                          {avance.monto !== null && ` · ${formatearPesos(avance.monto)}`}
                          {avance.porcentaje !== null && ` · ${avance.porcentaje}%`}
                        </span>
                        {!soloLectura && <BotonBorrar id={avance.id} />}
                      </li>
                    ))}
                  </ul>
                )}

                {!soloLectura && <FormularioAvance ideaId={proyecto.id} />}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BotonBorrar({ id }: { id: number }) {
  const [, accion, pendiente] = useActionState(borrarAvance, null);
  return (
    <form action={accion} className="ml-auto">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendiente}
        className="text-xs underline disabled:opacity-50"
        style={{ color: "var(--color-acento-600)" }}
      >
        Borrar
      </button>
    </form>
  );
}

function FormularioAvance({ ideaId }: { ideaId: number }) {
  const [estado, accion, pendiente] = useActionState(crearAvance, null);

  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="ideaId" value={ideaId} />

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Fecha</span>
        <input name="fecha" type="date" required style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Etapa</span>
        <select name="etapa" required defaultValue="preparacion" style={estiloCampo} className="rounded-xl px-3 py-2">
          {ETAPAS.map((etapa) => (
            <option key={etapa} value={etapa}>
              {ETIQUETA_PRESUPUESTO[etapa]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Título del avance</span>
        <input
          name="titulo"
          required
          maxLength={200}
          placeholder="Se firmó el contrato de obra"
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Monto ($, opcional)</span>
        <input name="monto" type="number" min={0} step="0.01" style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">% ejecutado (opcional)</span>
        <input name="porcentaje" type="number" min={0} max={100} style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>

      <label className="grid gap-1 text-sm sm:col-span-2 lg:col-span-3">
        <span className="font-medium">Descripción (opcional)</span>
        <textarea name="descripcion" rows={2} maxLength={3000} style={estiloCampo} className="resize-y rounded-xl px-3 py-2" />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Publicando…" : "Publicar avance"}
        </button>
        {estado && (
          <span
            role="status"
            className="text-sm"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? "Avance publicado." : estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
