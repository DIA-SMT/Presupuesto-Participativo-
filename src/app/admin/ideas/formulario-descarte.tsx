"use client";

/**
 * Descartar una idea que no es una propuesta (una prueba, spam, una carga
 * repetida) y deshacer ese descarte.
 *
 * Descartar no borra: la idea pasa a "Descartada", sale del sitio si estaba
 * publicada y deja de contar en todos los numeros, pero conserva su numero, su
 * historial y el motivo. Por eso no pide confirmacion: se deshace con un clic y
 * un motivo, y las dos cosas quedan en el historial.
 *
 * Solo se ofrece en una idea que nadie evaluo (borrador o en evaluacion), que
 * es lo que deja la politica (src/lib/etapas.ts). Una evaluada ya tiene una
 * decision que el vecino puede estar leyendo: primero se reabre su revision.
 * Si la idea tiene votos o esta en una integracion (`puedeDescartarse`), se
 * dice por que no en lugar del formulario.
 */
import { useActionState, useState } from "react";
import type { IdeaAdmin } from "@/db/queries";
import { puedeCambiarIdea, puedeDescartarse, type Etapa } from "@/lib/etapas";
import { descartarIdea, restaurarIdea } from "./acciones";

type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string };

/** Mismo minimo que valida el servidor (MINIMO_MOTIVO en ./operaciones.ts). */
const MINIMO_MOTIVO = 10;

/** Principios de motivo para los tres casos de siempre: se completan a mano. */
const ARRANQUES = [
  { etiqueta: "Prueba", texto: "Era una prueba del equipo, no una idea de un vecino." },
  { etiqueta: "Spam", texto: "Spam: no es una propuesta para el programa." },
  { etiqueta: "Repetida", texto: "Carga repetida: es la misma idea que la #" },
];

export function BloqueDescarte({ ficha, etapa }: { ficha: IdeaAdmin; etapa: Etapa }) {
  const [resultado, accion, pendiente] = useActionState(descartarIdea, null);
  const [motivo, setMotivo] = useState("");
  const veredicto = puedeCambiarIdea(etapa, ficha, { accion: "descartar" });
  if (!veredicto.permitido) return null;

  // Lo que la idea tiene y no la deja descartar, con el mismo texto que da la
  // accion. `ficha.votos` es el contador: la accion ademas cuenta las filas de
  // `votos`, y si hay diferencia decide ella.
  const porLoQueTiene = puedeDescartarse({
    votos: ficha.votos,
    integradaEn: ficha.integradaEn,
    integradas: ficha.integradas,
  });
  const corto = motivo.trim().length < MINIMO_MOTIVO;

  if (!porLoQueTiene.permitido) {
    return (
      <details style={{ borderTop: "1px solid var(--borde)" }}>
        <summary className="mt-4 cursor-pointer text-sm font-bold">
          Descartar: prueba, spam o carga repetida
        </summary>
        <p className="mt-3 text-xs" style={{ color: "var(--acento-texto)" }}>
          {porLoQueTiene.motivo}
        </p>
      </details>
    );
  }

  return (
    <details style={{ borderTop: "1px solid var(--borde)" }}>
      <summary className="mt-4 cursor-pointer text-sm font-bold">
        Descartar: prueba, spam o carga repetida
      </summary>
      <form action={accion} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={ficha.id} />
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          No se borra: queda como “Descartada”, fuera del sitio y de todos los números, con su
          historial. Se puede deshacer desde la solapa “Descartadas”.
        </p>
        <div className="flex flex-wrap gap-2">
          {ARRANQUES.map((arranque) => (
            <button
              key={arranque.etiqueta}
              type="button"
              onClick={() => setMotivo(arranque.texto)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde-control)" }}
            >
              {arranque.etiqueta}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">
            Motivo (obligatorio, mínimo {MINIMO_MOTIVO} caracteres)
          </span>
          <textarea
            name="motivo"
            rows={2}
            required
            minLength={MINIMO_MOTIVO}
            maxLength={2000}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder="Por qué no es una propuesta. Si es repetida, de qué número."
            className="resize-y rounded-xl px-3 py-2"
            style={estiloCampo}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pendiente || corto}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-acento-600)" }}
          >
            {pendiente ? "Descartando…" : "Descartar la idea"}
          </button>
          <Mensaje resultado={resultado} />
        </div>
      </form>
    </details>
  );
}

export function BloqueRestaurar({
  ficha,
  etapa,
  motivoDescarte,
  soloLectura,
}: {
  ficha: IdeaAdmin;
  etapa: Etapa;
  /** La nota de la ultima fila de descarte del historial, si la hay. */
  motivoDescarte: { nota: string | null; quien: string; cuando: string } | null;
  soloLectura: boolean;
}) {
  const [resultado, accion, pendiente] = useActionState(restaurarIdea, null);
  const [motivo, setMotivo] = useState("");
  const veredicto = puedeCambiarIdea(etapa, ficha, { accion: "restaurar" });
  const corto = motivo.trim().length < MINIMO_MOTIVO;

  return (
    <div className="mt-5 space-y-4">
      <div
        className="rounded-xl px-4 py-3 text-sm"
        style={{
          background: "color-mix(in srgb, var(--color-estado-nofactible) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-estado-nofactible) 40%, transparent)",
        }}
      >
        <p className="font-semibold">Descartada: no es una propuesta.</p>
        <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
          No se evalúa, no se publica y no cuenta en ningún número del sitio ni del panel.
        </p>
        {motivoDescarte && (
          <p className="mt-2">
            <span style={{ color: "var(--texto-suave)" }}>
              Motivo ({motivoDescarte.quien}, {motivoDescarte.cuando}):
            </span>{" "}
            {motivoDescarte.nota ?? "sin motivo escrito"}
          </p>
        )}
      </div>

      {!soloLectura && (
        <form action={accion} className="grid gap-3">
          <input type="hidden" name="id" value={ficha.id} />
          <h3 className="text-sm font-bold">Deshacer el descarte</h3>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Vuelve a “En evaluación”, sin publicar. Queda en el historial.
          </p>
          {!veredicto.permitido && (
            <span className="text-xs" style={{ color: "var(--acento-texto)" }}>
              {veredicto.motivo}
            </span>
          )}
          <label className="grid gap-1 text-sm">
            <span className="font-medium">
              Motivo (obligatorio, mínimo {MINIMO_MOTIVO} caracteres)
            </span>
            <input
              name="motivo"
              required
              minLength={MINIMO_MOTIVO}
              maxLength={2000}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Por qué se deshace: por ejemplo, era una idea real."
              className="rounded-xl px-3 py-2"
              style={estiloCampo}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pendiente || corto || !veredicto.permitido}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
            >
              {pendiente ? "Deshaciendo…" : "Deshacer el descarte"}
            </button>
            <Mensaje resultado={resultado} />
          </div>
        </form>
      )}
    </div>
  );
}

function Mensaje({ resultado }: { resultado: Resultado | null }) {
  if (!resultado) return null;
  return (
    <span
      role="status"
      className="text-sm"
      style={{ color: resultado.ok ? "var(--color-cat-ambiental)" : "var(--acento-texto)" }}
    >
      {resultado.ok ? (resultado.mensaje ?? "Listo, quedó en el historial.") : resultado.error}
    </span>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
