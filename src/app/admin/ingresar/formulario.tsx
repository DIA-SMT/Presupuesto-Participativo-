"use client";

import { useActionState } from "react";
import { ingresarAdmin } from "../acciones";

export default function FormularioIngreso() {
  const [estado, accion, pendiente] = useActionState(ingresarAdmin, null);

  return (
    <form action={accion} className="mt-6 grid gap-4">
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Correo</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            background: "var(--fondo-suave)",
            border: "1px solid var(--borde)",
            color: "var(--texto)",
          }}
        />
      </label>

      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{
            background: "var(--fondo-suave)",
            border: "1px solid var(--borde)",
            color: "var(--texto)",
          }}
        />
      </label>

      {estado && !estado.ok && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-acento-600)" }}>
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-marca-700)" }}
      >
        {pendiente ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
