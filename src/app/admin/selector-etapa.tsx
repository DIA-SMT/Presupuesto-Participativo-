"use client";

import { useActionState } from "react";
import { cambiarEtapa } from "./acciones";
import { ETIQUETA_ETAPA } from "@/lib/formato";

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;

export default function SelectorEtapa({
  edicionId,
  etapa,
  rol,
}: {
  edicionId: number;
  etapa: string;
  rol: "admin" | "moderador" | "lector";
}) {
  const [estado, accion, pendiente] = useActionState(cambiarEtapa, null);

  if (rol !== "admin") {
    return (
      <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
        Etapa: <strong>{ETIQUETA_ETAPA[etapa] ?? etapa}</strong>
      </p>
    );
  }

  return (
    <form action={accion} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="edicionId" value={edicionId} />
      <label className="font-medium" htmlFor="admin-etapa">
        Etapa del proceso
      </label>
      <select
        id="admin-etapa"
        name="etapa"
        defaultValue={etapa}
        className="rounded-xl px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--fondo-tarjeta)",
          border: "1px solid var(--borde)",
          color: "var(--texto)",
        }}
      >
        {ETAPAS.map((valor) => (
          <option key={valor} value={valor}>
            {ETIQUETA_ETAPA[valor]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-xl px-3.5 py-2 font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-marca-700)" }}
      >
        Cambiar
      </button>
      {estado && !estado.ok && (
        <span role="alert" style={{ color: "var(--color-acento-600)" }}>
          {estado.error}
        </span>
      )}
    </form>
  );
}
