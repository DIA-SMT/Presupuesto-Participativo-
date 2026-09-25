"use client";

/**
 * Login de prueba: solo aparece con AUTH_PROVIDER=dev, en /ingresar. Al entrar
 * recarga la pagina, y /ingresar ya con sesion manda a /votar.
 */
import { useState } from "react";

export default function LoginDev() {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/auth/ingresar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dni: datos.get("dni"),
          nombre: datos.get("nombre") || undefined,
          distrito: Number(datos.get("distrito")),
        }),
      });
      // Un 500 sin cuerpo (por ejemplo, sin SESSION_SECRET) no trae JSON.
      const cuerpo = (await respuesta.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo ingresar.");
      window.location.reload();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo ingresar.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={ingresar} className="superficie rounded-2xl p-8">
      <p
        className="inline-block rounded-lg px-2.5 py-1 text-xs font-semibold"
        style={{
          background: "color-mix(in srgb, var(--color-acento-600) 12%, transparent)",
          color: "var(--acento-texto)",
        }}
      >
        Modo de prueba — sin verificación de identidad
      </p>
      <h2 className="mt-3 text-xl font-bold">Empadronamiento de prueba</h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        Este formulario existe solo en desarrollo. En producción el ingreso es con la ciudadanía
        digital CIDITUC.
      </p>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">DNI</span>
          <input
            name="dni"
            required
            inputMode="numeric"
            pattern="\d{7,9}"
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)", color: "var(--texto)" }}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Nombre (opcional)</span>
          <input
            name="nombre"
            maxLength={120}
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)", color: "var(--texto)" }}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Tu distrito</span>
          <select
            name="distrito"
            required
            defaultValue=""
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)", color: "var(--texto)" }}
          >
            <option value="" disabled>
              Elegí tu distrito
            </option>
            {Array.from({ length: 20 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Distrito {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm" style={{ color: "var(--acento-texto)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-5 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--color-marca-700)" }}
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
