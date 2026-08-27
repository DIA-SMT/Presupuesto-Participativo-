"use client";

/**
 * Consulta del estado de una idea con el numero y el codigo de seguimiento.
 *
 * El formulario no lleva nada en la URL: la accion del servidor recibe los dos
 * datos por POST, asi el codigo no queda en el historial del navegador, ni en
 * los logs del proxy, ni en un enlace compartido por error.
 *
 * La accion llega por prop desde la pagina (server component): este archivo es
 * de cliente y no puede tocar la base ni el codigo de seguimiento.
 */
import Link from "next/link";
import { useActionState, useState } from "react";
import { ChipEstado } from "@/components/ui";
import { DESCRIPCION_ESTADO, formatearFecha } from "@/lib/formato";

/**
 * Estados en los que la evaluacion ya termino. Si una idea esta en uno de
 * estos y no tiene devolucion escrita, la devolucion no esta "en camino":
 * prometerla seria mentirle al vecino.
 */
const ESTADOS_CERRADOS = new Set(["factible", "no_factible", "integrado", "ganador"]);

/**
 * Como entro una idea que no se cargo en este sitio. Sirve para explicarle al
 * vecino por que no hay una devolucion escrita para leer.
 */
const ORIGEN_FUERA_DEL_SITIO: Record<string, string> = {
  asamblea: "se presentó en una asamblea de vecinos",
  municipio: "la cargó el equipo del municipio",
  migracion: "se importó de un registro anterior",
};

export type IdeaSeguida = {
  anio: number;
  numero: number;
  titulo: string;
  estado: string;
  /** Devolucion tecnica del equipo (ideas.motivo_estado). */
  devolucion: string | null;
  /**
   * Canal de entrada (ideas.canal). Se usa para un solo caso: si no hay
   * devolucion escrita, decide si todavia puede llegar o si nunca existio.
   * Se escribe como string, igual que `estado`, para no traer tipos de la base
   * a un componente de cliente.
   */
  canal: string;
  distrito: number | null;
  fecha: string | null;
  publicada: boolean;
  /** Solo si esta publicada: si no, todavia no hay pagina que mostrar. */
  slug: string | null;
};

export type ResultadoSeguimiento =
  | { ok: true; idea: IdeaSeguida }
  | { ok: false; error: string };

export type AccionSeguimiento = (
  previo: ResultadoSeguimiento | null,
  formulario: FormData,
) => Promise<ResultadoSeguimiento>;

export default function FormularioSeguimiento({ accion }: { accion: AccionSeguimiento }) {
  const [resultado, enviar, pendiente] = useActionState(accion, null);
  // Campos controlados a proposito: React limpia los formularios sin controlar
  // cuando termina la accion, y perder el codigo de 8 caracteres por una
  // consulta fallida obliga a copiarlo de nuevo del papel.
  const [numero, setNumero] = useState("");
  const [codigo, setCodigo] = useState("");

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <form action={enviar} className="superficie rounded-2xl p-6">
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Número de tu idea</span>
            <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Es el número que te dimos cuando la enviaste, por ejemplo 42.
            </span>
            <input
              name="numero"
              inputMode="numeric"
              autoComplete="off"
              required
              maxLength={8}
              value={numero}
              onChange={(evento) => setNumero(evento.target.value)}
              placeholder="42"
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium">Código de seguimiento</span>
            <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Son 8 caracteres. No distingue mayúsculas de minúsculas.
            </span>
            <input
              name="codigo"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              maxLength={16}
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value)}
              placeholder="ABCD2345"
              className="rounded-xl px-3 py-2.5 font-mono text-base uppercase outline-none"
              style={{ ...campoEstilo, letterSpacing: "0.18em" }}
            />
          </label>

          <button
            type="submit"
            disabled={pendiente}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
            style={{ background: "var(--color-marca-700)" }}
          >
            {pendiente ? "Buscando…" : "Ver cómo sigue mi idea"}
          </button>

          {resultado && !resultado.ok && (
            <p
              role="alert"
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              {resultado.error}
            </p>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {resultado?.ok ? (
          <Ficha idea={resultado.idea} />
        ) : (
          <div
            className="rounded-2xl px-6 py-8 text-sm"
            style={{
              background: "var(--fondo-suave)",
              border: "1px dashed var(--borde)",
              color: "var(--texto-suave)",
            }}
          >
            <p className="font-medium" style={{ color: "var(--texto)" }}>
              Acá va a aparecer el estado de tu idea.
            </p>
            <p className="mt-2 leading-relaxed">
              Vas a ver en qué etapa está, y la devolución del equipo técnico cuando la haya. No
              mostramos ningún dato de contacto, ni acá ni en el resto del sitio.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Ficha({ idea }: { idea: IdeaSeguida }) {
  return (
    <article className="superficie rounded-2xl p-6">
      <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
        Idea #{idea.numero} · Edición {idea.anio}
        {idea.distrito !== null && <> · Distrito {idea.distrito}</>}
        {idea.fecha && <> · Presentada el {formatearFecha(idea.fecha)}</>}
      </p>

      <h2 className="mt-2 text-xl font-bold leading-snug">{idea.titulo}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ChipEstado estado={idea.estado} />
        {!idea.publicada && (
          <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Todavía no está publicada en el listado de proyectos.
          </span>
        )}
      </div>

      <p className="mt-4 text-[0.9375rem] leading-relaxed">
        {DESCRIPCION_ESTADO[idea.estado] ??
          "El equipo del Presupuesto Participativo está trabajando sobre tu propuesta."}
      </p>

      {idea.devolucion ? (
        <div
          className="mt-5 rounded-xl px-4 py-4"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          <p className="text-sm font-semibold">Devolución del equipo técnico</p>
          <div className="mt-2 space-y-2 text-sm leading-relaxed">
            {idea.devolucion
              .split("\n")
              .filter(Boolean)
              .map((parrafo, indice) => (
                <p key={indice}>{parrafo}</p>
              ))}
          </div>
        </div>
      ) : ESTADOS_CERRADOS.has(idea.estado) ? (
        /*
         * La evaluacion ya termino y no hay texto que mostrar. No se promete
         * nada: se explica por que no esta. En las ideas que entraron por fuera
         * del sitio el detalle escrito no existe y no va a existir; en las que
         * entraron por el sitio, todavia puede escribirse.
         */
        <p className="mt-5 text-sm" style={{ color: "var(--texto-suave)" }}>
          {ORIGEN_FUERA_DEL_SITIO[idea.canal]
            ? "La evaluación de esta idea se hizo por fuera de este sitio: " +
              ORIGEN_FUERA_DEL_SITIO[idea.canal] +
              " en " +
              idea.anio +
              ". Su detalle escrito no quedó registrado en el sistema, así que no podemos " +
              "mostrarlo acá."
            : "La evaluación ya está cerrada, pero el equipo todavía no publicó el detalle escrito."}
        </p>
      ) : (
        <p className="mt-5 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay una devolución escrita. Cuando el equipo termine de evaluar tu idea, la vas
          a poder leer en esta misma pantalla.
        </p>
      )}

      {idea.publicada && idea.slug && (
        <p className="mt-5 text-sm">
          <Link href={`/proyectos/${idea.slug}`} className="font-semibold underline">
            Ver la ficha pública de tu idea
          </Link>
        </p>
      )}
    </article>
  );
}

const campoEstilo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
