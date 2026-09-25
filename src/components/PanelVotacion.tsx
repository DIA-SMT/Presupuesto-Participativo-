"use client";

/**
 * Panel de votacion: eleccion del proyecto del propio distrito y confirmacion
 * del voto. Solo se dibuja con sesion de votante: sin ella, /votar manda a
 * /ingresar, que es donde se entra con CIDITUC (o con el login de prueba).
 *
 * Los proyectos llegan en orden alfabetico (lo pide /votar a listarIdeas) y
 * aca no se reordenan: cualquier otro orden le da ventaja a alguien.
 */
import { useState } from "react";
import { colorCategoria } from "@/lib/formato";

type Proyecto = {
  slug: string;
  titulo: string;
  barrio: string | null;
  categoriaSlug: string | null;
  categoriaNombre: string | null;
  categoriaColor: string | null;
};

type Props = {
  sesion: { distrito: number | null; nombre: string | null };
  proyectos: Proyecto[];
  yaVoto: boolean;
};

export default function PanelVotacion({
  sesion,
  proyectos,
  yaVoto,
}: Props) {
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
        {/* "y las obras" salio del texto: no hay ni un avance de obra cargado y
            la pagina ya no los muestra. Prometerselo justo despues de votar es
            donde mas se nota. */}
        <a href="/transparencia" className="mt-4 inline-block text-sm font-semibold underline">
          Ver los proyectos ganadores
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
        distrito, en orden alfabético; elegí uno.
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
              const colorDeCategoria = colorCategoria(
                proyecto.categoriaSlug,
                proyecto.categoriaColor,
              );
              return (
                <label
                  key={proyecto.slug}
                  className="superficie cursor-pointer rounded-2xl p-5 transition"
                  style={{
                    borderColor: seleccionado ? "var(--color-marca-600)" : "var(--borde)",
                    borderWidth: 2,
                    borderLeft: `4px solid ${colorDeCategoria ?? "var(--borde)"}`,
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
                    <p className="mt-2 text-xs font-semibold" style={{ color: "var(--marca-texto)" }}>
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
