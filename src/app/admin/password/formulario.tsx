"use client";

/**
 * Cambio de la propia contrasena. La accion pide la actual salvo que la cuenta
 * este marcada con debeCambiarPassword (entro con una provisoria), asi que el
 * campo no se marca como obligatorio en el HTML: quien valida es el servidor.
 */
import { useActionState } from "react";
import { cambiarMiPassword } from "../acciones";
import { MINIMO_PASSWORD } from "@/lib/politica-password";

export default function FormularioPassword() {
  const [estado, accion, pendiente] = useActionState(cambiarMiPassword, null);

  return (
    <form action={accion} className="grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Contraseña actual</span>
        <input
          name="actual"
          type="password"
          autoComplete="current-password"
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={estiloCampo}
        />
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Dejala vacía solo si entraste con una contraseña provisoria.
        </span>
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Contraseña nueva</span>
        <input
          name="nueva"
          type="password"
          required
          minLength={MINIMO_PASSWORD}
          autoComplete="new-password"
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={estiloCampo}
        />
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Repetí la contraseña nueva</span>
        <input
          name="repetida"
          type="password"
          required
          minLength={MINIMO_PASSWORD}
          autoComplete="new-password"
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={estiloCampo}
        />
      </label>

      <ul className="list-disc pl-5 text-xs" style={{ color: "var(--texto-suave)" }}>
        <li>
          {MINIMO_PASSWORD} caracteres como mínimo. Una frase larga y fácil de recordar protege
          mucho más que un jeroglífico corto: este panel da acceso al padrón y a los datos de
          contacto de los vecinos.
        </li>
        <li>Tiene que ser distinta de la que usabas.</li>
        <li>No la compartas ni la anotes en un archivo compartido.</li>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Guardando…" : "Cambiar contraseña"}
        </button>

        {estado && (
          <span
            role={estado.ok ? "status" : "alert"}
            className="text-sm"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? (estado.mensaje ?? "Contraseña actualizada.") : estado.error}
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
