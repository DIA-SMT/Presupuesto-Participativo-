"use client";

/**
 * Seguimiento de obras: por cada proyecto ganador, el presupuesto asignado, el
 * historial de avances y el formulario para publicar uno nuevo.
 *
 * El presupuesto por proyecto (`ideas.presupuesto_total`) se edita aca y no en
 * la pantalla de ideas: la ejecucion de la obra vive en esta pantalla, que ya
 * mostraba el monto. Lo guarda `guardarPresupuestoIdea`, que exige rol admin y
 * deja el monto anterior y el nuevo en el historial de la idea.
 *
 * El ESTADO del presupuesto no se elige a mano en ningun formulario: lo escribe
 * `crearAvance` con la etapa del ultimo avance publicado. Un selector suelto
 * podria dejar la obra diciendo "en ejecucion" sin un solo avance que lo
 * respalde.
 */
import { useState, useActionState } from "react";
import { borrarAvance, crearAvance, guardarPresupuestoIdea } from "../acciones";
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

type Rol = "admin" | "moderador" | "lector";

const ETAPAS = ["preparacion", "contratacion", "ejecucion", "finalizado"] as const;

/** Tope de `ideas.presupuesto_total`: numeric(14, 2). Igual que en la accion. */
const MAXIMO_PRESUPUESTO = 999_999_999_999.99;

/**
 * Monto con centavos, igual que el que la accion escribe en el historial.
 * `formatearPesos` redondea a pesos enteros y sirve para los listados; en el
 * campo que se edita el numero se muestra completo.
 */
function montoExacto(valor: number | null): string {
  if (valor === null) return "sin asignar";
  return valor.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PanelObras({
  proyectos,
  rol,
}: {
  proyectos: Proyecto[];
  rol: Rol;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const soloLectura = rol === "lector";

  return (
    <div>
      <h1 className="text-2xl font-bold">Seguimiento de obras</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Cada avance publicado aparece en la ficha pública del proyecto y en Transparencia. Acá se
        carga también el presupuesto asignado a cada obra; el estado del presupuesto no se elige a
        mano, sale del último avance cargado.
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
                <BloquePresupuesto proyecto={proyecto} rol={rol} />

                {proyecto.avances.length > 0 && (
                  <ul className="space-y-2">
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

// ---------------------------------------------------------------------------
// Presupuesto asignado al proyecto
// ---------------------------------------------------------------------------

function BloquePresupuesto({ proyecto, rol }: { proyecto: Proyecto; rol: Rol }) {
  const [estado, accion, pendiente] = useActionState(guardarPresupuestoIdea, null);
  const puedeEditar = rol === "admin";
  // El historial llega ordenado de la fecha mas nueva a la mas vieja.
  const ultimo = proyecto.avances[0] ?? null;

  return (
    <div
      className="mt-5 rounded-xl p-4"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
    >
      <h4 className="text-sm font-bold">Presupuesto asignado a la obra</h4>
      <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
        Es el monto que el sitio le muestra al vecino como lo que cuesta el proyecto. Hoy:{" "}
        <strong style={{ color: "var(--texto)" }}>{montoExacto(proyecto.presupuestoTotal)}</strong>.
      </p>

      <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        El estado del presupuesto no se elige a mano: sale del último avance cargado. Hoy figura como
        “{ETIQUETA_PRESUPUESTO[proyecto.estadoPresupuesto] ?? proyecto.estadoPresupuesto}”
        {ultimo
          ? `, por el avance del ${formatearFechaCorta(ultimo.fecha)} (“${ultimo.titulo}”). Para moverlo, cargá un avance nuevo con la etapa que corresponda.`
          : ", porque todavía no hay ningún avance cargado. Escribir el monto no lo cambia: se mueve cuando cargás el primer avance."}
      </p>

      {puedeEditar ? (
        <form action={accion} className="mt-3">
          <input type="hidden" name="id" value={proyecto.id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Monto en pesos</span>
              <input
                name="presupuestoTotal"
                type="number"
                min={0}
                max={MAXIMO_PRESUPUESTO}
                step="0.01"
                inputMode="decimal"
                defaultValue={proyecto.presupuestoTotal ?? ""}
                placeholder="1500000"
                // Sobre el bloque suave, el campo va en fondo de tarjeta para
                // que se vea que es un campo y no un dato mas.
                style={{
                  background: "var(--fondo-tarjeta)",
                  border: "1px solid var(--borde)",
                  color: "var(--texto)",
                }}
                className="w-56 rounded-xl px-3 py-2"
              />
            </label>
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              {pendiente ? "Guardando…" : "Guardar presupuesto"}
            </button>
            {estado && (
              <span
                role="status"
                className="pb-1 text-sm"
                style={{
                  color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-700)",
                }}
              >
                {estado.ok ? (estado.mensaje ?? "Presupuesto guardado.") : estado.error}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
            Sin puntos de miles ni signo $: 1500000 o 1500000,50. Si lo dejás vacío el proyecto queda
            sin monto asignado. El cambio queda en el historial de la idea con el monto anterior y el
            nuevo, y con tu nombre.
          </p>
        </form>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
          Con tu rol ({rol}) el monto se ve pero no se edita: es plata pública, así que lo cambia un
          administrador y el cambio queda en el historial de la idea.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avances
// ---------------------------------------------------------------------------

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
            {estado.ok ? "Avance publicado. El estado del presupuesto quedó en la etapa de este avance." : estado.error}
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
