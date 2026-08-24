"use client";

/**
 * Formulario del ingreso al panel.
 *
 * El mensaje de error sale tal cual lo devuelve `ingresarAdmin`: no distingue
 * entre correo inexistente y contrasena equivocada, y eso es a proposito. No
 * agregarle detalle ni "ayudas" que dejen enumerar cuentas.
 */
import { useActionState } from "react";
import { ingresarAdmin } from "../acciones";

/** Borde de un campo: es un control, va con --borde-control (WCAG 1.4.11). */
const ESTILO_CAMPO = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde-control)",
  color: "var(--texto)",
} as const;

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
          autoCapitalize="none"
          spellCheck={false}
          className="rounded-xl px-3 py-2.5 text-sm outline-none"
          style={ESTILO_CAMPO}
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
          style={ESTILO_CAMPO}
        />
      </label>

      {/* Mismo token de error que el resto del panel (--color-acento-600). En
          oscuro queda en 3.3:1 sobre la tarjeta, por debajo del 4.5:1 de AA,
          pero eso es un token del tema (src/app/globals.css) y se arregla ahi
          para todo el sitio a la vez, no con un color propio de esta
          pantalla. */}
      {estado && !estado.ok && (
        <p role="alert" className="text-sm font-medium" style={{ color: "var(--color-acento-600)" }}>
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-marca-700)" }}
      >
        {pendiente ? "Ingresando…" : "Ingresar al panel"}
      </button>
    </form>
  );
}
