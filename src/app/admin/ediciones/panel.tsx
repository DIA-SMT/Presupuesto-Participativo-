"use client";

/**
 * Los dos interruptores de Proceso: la presentacion de propuestas y la
 * votacion, cada uno abierto o cerrado. Solo uno puede estar abierto a la vez
 * (mientras se vota no entran propuestas), y la accion lo hace cumplir.
 *
 * Abrir o cerrar pide una confirmacion antes: cambia lo que el sitio deja hacer
 * a los vecinos en el momento.
 */
import { useActionState, useState } from "react";
import type { EtapaEdicion } from "@/db/queries";
import type { Interruptor } from "@/lib/etapas";
import { ETIQUETA_ETAPA } from "@/lib/formato";
import { usarInterruptor } from "../acciones";

type Estado = { presentacionAbierta: boolean; votacionAbierta: boolean };

export default function PanelInterruptores({
  estado,
  etapa,
  puedeCambiar,
}: {
  estado: Estado | null;
  etapa: EtapaEdicion | null;
  puedeCambiar: boolean;
}) {
  const [resultado, accion, pendiente] = useActionState(usarInterruptor, null);

  if (!estado || !etapa) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Presentación y votación</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          La base no tiene un proceso activo.
        </p>
      </div>
    );
  }

  return (
    <div>
      <header className="max-w-3xl">
        <h1 className="text-2xl font-bold">Presentación y votación</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Lo que el sitio les deja hacer hoy a los vecinos. Hoy el programa está en{" "}
          <strong>“{ETIQUETA_ETAPA[etapa] ?? etapa}”</strong>.
          {puedeCambiar
            ? " Cada cambio se aplica en el momento y queda en la bitácora con tu nombre."
            : " Solo un administrador puede abrirlas o cerrarlas."}
        </p>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-2" data-recorrido="ediciones-etapa">
        <Tarjeta
          titulo="Presentación de propuestas"
          abierta={estado.presentacionAbierta}
          textoAbierta="El formulario del sitio recibe propuestas de los vecinos que ingresan con CIDITUC."
          textoCerrada={
            estado.votacionAbierta
              ? "No se reciben propuestas mientras la votación está abierta."
              : "El formulario no recibe propuestas. Al abrirla, los vecinos pueden presentar las suyas."
          }
          abrir="abrir-presentacion"
          cerrar="cerrar-presentacion"
          confirmarAbrir={
            etapa === "seguimiento" || etapa === "cerrada"
              ? "Empieza una ronda nueva de propuestas. Las de la votación anterior y sus ganadores quedan como están."
              : "El formulario del sitio vuelve a recibir propuestas."
          }
          confirmarCerrar="El formulario deja de recibir propuestas. Lo que ya entró queda para evaluar."
          bloqueada={estado.votacionAbierta}
          puedeCambiar={puedeCambiar}
          accion={accion}
          pendiente={pendiente}
        />
        <Tarjeta
          titulo="Votación"
          abierta={estado.votacionAbierta}
          textoAbierta="Cada vecino con CIDITUC vota un proyecto factible y publicado de su distrito."
          textoCerrada="No se aceptan votos. Al abrirla, se votan las propuestas factibles y publicadas."
          abrir="abrir-votacion"
          cerrar="cerrar-votacion"
          confirmarAbrir="Se cierra la presentación de propuestas y los vecinos pueden votar desde ya. Revisá antes que las propuestas factibles estén publicadas."
          confirmarCerrar="No se aceptan más votos. Después proclamás el ganador de cada distrito desde su ficha."
          bloqueada={false}
          puedeCambiar={puedeCambiar}
          accion={accion}
          pendiente={pendiente}
        />
      </div>

      {resultado && (
        <p
          role={resultado.ok ? "status" : "alert"}
          className="mt-4 max-w-3xl rounded-xl px-4 py-3 text-sm"
          style={{
            background: resultado.ok
              ? "color-mix(in srgb, var(--color-marca-600) 8%, transparent)"
              : "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
            color: resultado.ok ? "var(--texto)" : "var(--acento-texto)",
          }}
        >
          {resultado.ok ? resultado.mensaje : resultado.error}
        </p>
      )}
    </div>
  );
}

function Tarjeta({
  titulo,
  abierta,
  textoAbierta,
  textoCerrada,
  abrir,
  cerrar,
  confirmarAbrir,
  confirmarCerrar,
  bloqueada,
  puedeCambiar,
  accion,
  pendiente,
}: {
  titulo: string;
  abierta: boolean;
  textoAbierta: string;
  textoCerrada: string;
  abrir: Interruptor;
  cerrar: Interruptor;
  confirmarAbrir: string;
  confirmarCerrar: string;
  /** Cerrada y sin poder abrirse ahora (la presentacion, con la votacion abierta). */
  bloqueada: boolean;
  puedeCambiar: boolean;
  accion: (datos: FormData) => void;
  pendiente: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const interruptor = abierta ? cerrar : abrir;

  return (
    <section className="superficie flex flex-col gap-3 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
          style={{
            color: abierta ? "var(--obra-finalizado)" : "var(--texto-suave)",
            background: abierta
              ? "color-mix(in srgb, var(--obra-finalizado) 12%, transparent)"
              : "var(--fondo-suave)",
            border: `1px solid ${
              abierta ? "color-mix(in srgb, var(--obra-finalizado) 30%, transparent)" : "var(--borde)"
            }`,
          }}
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ background: abierta ? "var(--obra-finalizado)" : "var(--borde-control)" }}
          />
          {abierta ? "Abierta" : "Cerrada"}
        </span>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        {abierta ? textoAbierta : textoCerrada}
      </p>

      {puedeCambiar && !bloqueada && (
        <div className="mt-auto">
          {!confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={
                abierta
                  ? { border: "1px solid var(--borde-control)", color: "var(--texto)" }
                  : { background: "var(--color-marca-700)", color: "#fff" }
              }
            >
              {abierta ? "Cerrar" : "Abrir"}
            </button>
          ) : (
            <form
              action={(datos) => {
                accion(datos);
                setConfirmando(false);
              }}
              className="rounded-xl p-3 text-sm"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
            >
              <input type="hidden" name="interruptor" value={interruptor} />
              <p>{abierta ? confirmarCerrar : confirmarAbrir}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={pendiente}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--color-marca-700)" }}
                >
                  {pendiente ? "Guardando…" : abierta ? `Sí, cerrar` : `Sí, abrir`}
                </button>
                <button type="button" onClick={() => setConfirmando(false)} className="underline">
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
