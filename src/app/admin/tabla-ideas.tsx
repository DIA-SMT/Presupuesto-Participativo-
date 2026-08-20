"use client";

/**
 * Tabla de moderacion de ideas: filtro rapido, edicion en linea del estado,
 * la publicacion, los votos y el presupuesto.
 */
import { useMemo, useState, useActionState } from "react";
import { actualizarIdea } from "./acciones";
import { ETIQUETA_ESTADO, ETIQUETA_PRESUPUESTO } from "@/lib/formato";

export type FilaIdea = {
  id: number;
  slug: string;
  titulo: string;
  distrito: number;
  barrio: string | null;
  categoria: string | null;
  estado: string;
  ganador: boolean;
  votos: number;
  publicada: boolean;
  presupuestoTotal: number | null;
  estadoPresupuesto: string;
  motivoEstado: string | null;
};

const ESTADOS = ["pendiente", "factible", "no_factible", "integrado", "ganador"] as const;
const ETAPAS = ["sin_asignar", "preparacion", "contratacion", "ejecucion", "finalizado"] as const;

export default function TablaIdeas({
  ideas,
  soloLectura,
}: {
  ideas: FilaIdea[];
  soloLectura: boolean;
}) {
  const [filtro, setFiltro] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [abierta, setAbierta] = useState<number | null>(null);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (soloPendientes && idea.estado !== "pendiente") return false;
      if (!q) return true;
      return (
        idea.titulo.toLowerCase().includes(q) ||
        (idea.barrio ?? "").toLowerCase().includes(q) ||
        String(idea.distrito) === q
      );
    });
  }, [ideas, filtro, soloPendientes]);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Filtrar por título, barrio o distrito…"
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value)}
          className="w-full max-w-sm rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            background: "var(--fondo-suave)",
            border: "1px solid var(--borde)",
            color: "var(--texto)",
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(evento) => setSoloPendientes(evento.target.checked)}
          />
          Solo pendientes
        </label>
        <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
          {visibles.length} de {ideas.length}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {visibles.map((idea) => (
          <li key={idea.id} className="superficie rounded-2xl">
            <button
              type="button"
              onClick={() => setAbierta(abierta === idea.id ? null : idea.id)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left"
              aria-expanded={abierta === idea.id}
            >
              <span className="min-w-10 text-sm font-semibold">D{idea.distrito}</span>
              <span className="flex-1 text-sm font-medium">
                {idea.titulo}
                {!idea.publicada && (
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 text-xs"
                    style={{
                      background: "color-mix(in srgb, var(--color-acento-600) 12%, transparent)",
                      color: "var(--color-acento-600)",
                    }}
                  >
                    sin publicar
                  </span>
                )}
              </span>
              <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
                {ETIQUETA_ESTADO[idea.estado] ?? idea.estado}
                {idea.votos > 0 && ` · ${idea.votos} votos`}
              </span>
            </button>

            {abierta === idea.id && (
              <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--borde)" }}>
                <FormularioFila idea={idea} soloLectura={soloLectura} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioFila({ idea, soloLectura }: { idea: FilaIdea; soloLectura: boolean }) {
  const [estado, accion, pendiente] = useActionState(actualizarIdea, null);

  return (
    <form action={accion} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <input type="hidden" name="id" value={idea.id} />

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Estado</span>
        <select name="estado" defaultValue={idea.estado} disabled={soloLectura} style={estiloCampo} className="rounded-xl px-3 py-2">
          {ESTADOS.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_ESTADO[valor]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Etapa del presupuesto</span>
        <select
          name="estadoPresupuesto"
          defaultValue={idea.estadoPresupuesto}
          disabled={soloLectura}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        >
          {ETAPAS.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_PRESUPUESTO[valor]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Presupuesto total ($)</span>
        <input
          name="presupuestoTotal"
          type="number"
          min={0}
          step="0.01"
          defaultValue={idea.presupuestoTotal ?? ""}
          disabled={soloLectura}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Votos</span>
        <input
          name="votos"
          type="number"
          min={0}
          defaultValue={idea.votos}
          disabled={soloLectura}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex items-end gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="publicada" defaultChecked={idea.publicada} disabled={soloLectura} />
          Publicada
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="ganador" defaultChecked={idea.ganador} disabled={soloLectura} />
          Ganadora
        </label>
      </div>

      <label className="grid gap-1.5 text-sm sm:col-span-2 lg:col-span-3">
        <span className="font-medium">Devolución técnica (pública)</span>
        <textarea
          name="motivoEstado"
          rows={3}
          defaultValue={idea.motivoEstado ?? ""}
          disabled={soloLectura}
          placeholder="Por qué la idea es factible o no factible. Este texto se muestra en la ficha del proyecto."
          style={estiloCampo}
          className="resize-y rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
        {!soloLectura && (
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-marca-700)" }}
          >
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </button>
        )}
        <a href={`/proyectos/${idea.slug}`} className="text-sm underline">
          Ver en el sitio
        </a>
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

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
