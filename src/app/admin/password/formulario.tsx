"use client";

/**
 * Cambio de la propia contrasena.
 *
 * Con una contrasena provisoria (`provisoria`) no se pide la actual: la eligio
 * otra persona, asi que exigirla no protegeria nada. Igual quien decide es el
 * servidor, que relee `debe_cambiar_password` de la base: si la pantalla
 * estuviera vieja, la accion pide la actual y lo dice.
 */
import Link from "next/link";
import { useActionState } from "react";
import { cambiarMiPassword } from "../acciones";
import { MINIMO_PASSWORD } from "@/lib/politica-password";

export default function FormularioPassword({ provisoria }: { provisoria: boolean }) {
  const [estado, accion, pendiente] = useActionState(cambiarMiPassword, null);

  return (
    <form action={accion} className="grid gap-4">
      {!provisoria && (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Contraseña actual</span>
          <input
            name="actual"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={estiloCampo}
          />
        </label>
      )}

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
        <li>{provisoria ? "Tiene que ser distinta de la provisoria." : "Tiene que ser distinta de la que usabas."}</li>
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
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--acento-texto)" }}
          >
            {estado.ok ? (estado.mensaje ?? "Contraseña actualizada.") : estado.error}
          </span>
        )}
      </div>

      {estado?.ok && (
        <p className="text-sm">
          <Link href="/admin" className="font-medium underline">
            Ir al panel
          </Link>
        </p>
      )}
    </form>
  );
}

/** Un campo es un control: va con --borde-control (WCAG 1.4.11). */
const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde-control)",
  color: "var(--texto)",
};
