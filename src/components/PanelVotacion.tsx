"use client";

/**
 * Panel de votacion: empadronamiento (o login de prueba en desarrollo),
 * eleccion del proyecto del propio distrito y confirmacion del voto.
 */
import { useState } from "react";

type Proyecto = {
  slug: string;
  titulo: string;
  barrio: string | null;
  categoriaNombre: string | null;
  categoriaColor: string | null;
};

type Props = {
  proveedor: "cidituc" | "dev";
  sesion: { distrito: number | null; nombre: string | null } | null;
  proyectos: Proyecto[];
  yaVoto: boolean;
};

export default function PanelVotacion({ proveedor, sesion, proyectos, yaVoto }: Props) {
  const [elegido, setElegido] = useState<Proyecto | null>(null);
  const [estado, setEstado] = useState<
    | { tipo: "inicial" }
    | { tipo: "confirmando" }
    | { tipo: "enviando" }
    | { tipo: "votado"; proyecto: string }
    | { tipo: "error"; mensaje: string }
  >(yaVoto ? { tipo: "votado", proyecto: "" } : { tipo: "inicial" });

  async function votar() {
    if (!elegido) return;
    setEstado({ tipo: "enviando" });
    try {
      const respuesta = await fetch("/api/votos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: elegido.slug }),
      });
      const cuerpo = (await respuesta.json()) as { ok?: boolean; proyecto?: string; error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo registrar el voto.");
      setEstado({ tipo: "votado", proyecto: cuerpo.proyecto ?? elegido.titulo });
    } catch (causa) {
      setEstado({
        tipo: "error",
        mensaje: causa instanceof Error ? causa.message : "No se pudo registrar el voto.",
      });
    }
  }

  // --- Sin sesion: empadronamiento -----------------------------------------
  if (!sesion) {
    return proveedor === "cidituc" ? (
      <div className="superficie mt-8 max-w-xl rounded-2xl p-8">
        <h2 className="text-xl font-bold">Ingresá con tu ciudadanía digital</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Para votar necesitás tu cuenta CIDITUC. Si todavía no la tenés, podés crearla desde la
          página de la Municipalidad o en las asambleas participativas.
        </p>
        <a
          href="/api/auth/ingresar"
          className="mt-5 inline-block rounded-xl px-5 py-3 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          Ingresar con CIDITUC
        </a>
      </div>
    ) : (
      <LoginDev />
    );
  }

  // --- Ya voto ---------------------------------------------------------------
  if (estado.tipo === "votado") {
    return (
      <div className="superficie mt-8 max-w-xl rounded-2xl p-8">
        <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
          Voto registrado
        </p>
        <h2 className="mt-2 text-2xl font-bold">Gracias por participar</h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed">
          {estado.proyecto
            ? `Tu voto para “${estado.proyecto}” quedó registrado.`
            : "Ya usaste tu voto en esta edición."}{" "}
          Es un voto por persona: no se puede votar de nuevo.
        </p>
        <a href="/transparencia" className="mt-4 inline-block text-sm font-semibold underline">
          Seguir los resultados y las obras
        </a>
      </div>
    );
  }

  // --- Con sesion pero sin distrito ------------------------------------------
  if (!sesion.distrito) {
    return (
      <div className="superficie mt-8 max-w-xl rounded-2xl p-8">
        <h2 className="text-xl font-bold">Falta tu distrito</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Tu empadronamiento no tiene un distrito asignado, y el voto se emite en el distrito donde
          vivís. Acercate a una asamblea participativa para completarlo.
        </p>
      </div>
    );
  }

  // --- Boleta -----------------------------------------------------------------
  return (
    <div className="mt-8">
      <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
        {sesion.nombre ? `Hola, ${sesion.nombre}. ` : ""}Estás empadronado en el{" "}
        <strong>Distrito {sesion.distrito}</strong>. Estos son los proyectos factibles de tu
        distrito; elegí uno.
      </p>

      {proyectos.length === 0 ? (
        <div className="superficie mt-5 max-w-xl rounded-2xl p-8">
          <p className="text-sm">
            Tu distrito no tiene proyectos factibles para votar en esta edición.
          </p>
        </div>
      ) : (
        <>
          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Proyectos de tu distrito</legend>
            {proyectos.map((proyecto) => {
              const seleccionado = elegido?.slug === proyecto.slug;
              return (
                <label
                  key={proyecto.slug}
                  className="superficie cursor-pointer rounded-2xl p-5 transition"
                  style={{
                    borderColor: seleccionado ? "var(--color-marca-600)" : "var(--borde)",
                    borderWidth: 2,
                    borderLeft: `4px solid ${proyecto.categoriaColor ?? "var(--borde)"}`,
                  }}
                >
                  <input
                    type="radio"
                    name="proyecto"
                    value={proyecto.slug}
                    checked={seleccionado}
                    onChange={() => {
                      setElegido(proyecto);
                      setEstado({ tipo: "confirmando" });
                    }}
                    className="sr-only"
                  />
                  <p className="text-base font-semibold leading-snug">{proyecto.titulo}</p>
                  <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                    {[proyecto.barrio && `B° ${proyecto.barrio}`, proyecto.categoriaNombre]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {seleccionado && (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "var(--color-marca-600)" }}>
                      Seleccionado
                    </p>
                  )}
                </label>
              );
            })}
          </fieldset>

          {estado.tipo === "error" && (
            <p
              role="alert"
              className="mt-4 max-w-xl rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              {estado.mensaje}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={!elegido || estado.tipo === "enviando"}
              onClick={votar}
              className="rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: "var(--color-acento-600)" }}
            >
              {estado.tipo === "enviando"
                ? "Registrando el voto…"
                : elegido
                  ? `Votar “${elegido.titulo.slice(0, 40)}${elegido.titulo.length > 40 ? "…" : ""}”`
                  : "Elegí un proyecto para votar"}
            </button>
            <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Tenés un solo voto y no se puede cambiar después de confirmarlo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Login de prueba: solo aparece con AUTH_PROVIDER=dev. */
function LoginDev() {
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
      const cuerpo = (await respuesta.json()) as { ok?: boolean; error?: string };
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo ingresar.");
      window.location.reload();
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No se pudo ingresar.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={ingresar} className="superficie mt-8 max-w-xl rounded-2xl p-8">
      <p
        className="inline-block rounded-lg px-2.5 py-1 text-xs font-semibold"
        style={{
          background: "color-mix(in srgb, var(--color-acento-600) 12%, transparent)",
          color: "var(--color-acento-600)",
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
        <p role="alert" className="mt-4 text-sm" style={{ color: "var(--color-acento-600)" }}>
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
