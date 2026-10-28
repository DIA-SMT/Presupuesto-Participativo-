"use client";

/**
 * Formulario del ingreso al panel.
 *
 * El mensaje de error sale tal cual lo devuelve `ingresarAdmin`: no distingue
 * entre correo inexistente y contrasena equivocada, y eso es a proposito. No
 * agregarle detalle ni "ayudas" que dejen enumerar cuentas.
 */
import { useActionState, useState } from "react";
import { ingresarAdmin } from "../acciones";

/** Borde de un campo: es un control, va con --borde-control (WCAG 1.4.11). */
const ESTILO_CAMPO = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde-control)",
  color: "var(--texto)",
} as const;

export default function FormularioIngreso() {
  const [estado, accion, pendiente] = useActionState(ingresarAdmin, null);

  // El correo del ultimo envio. Un <form action> se resetea solo al terminar
  // cada envio, tambien con "Correo o contraseña incorrectos.", y el correo se
  // borraba junto con la contrasena. Puesto como valor por defecto, el reset lo
  // deja; la contrasena si se vacia, y esta bien. No es un campo controlado a
  // proposito: el gestor de contrasenas lo puede completar antes de que cargue
  // React, sin que React se entere, y un campo controlado lo vaciaria en el
  // primer render (el de "Ingresando…").
  const [correo, setCorreo] = useState("");

  return (
    <form
      action={accion}
      onSubmit={(evento) => setCorreo(String(new FormData(evento.currentTarget).get("email") ?? ""))}
      className="mt-6 grid gap-4"
    >
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Correo</span>
        <input
          name="email"
          type="email"
          defaultValue={correo}
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
        <p role="alert" className="text-sm font-medium" style={{ color: "var(--acento-texto)" }}>
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
