"use client";

/**
 * Etapa del proceso de una edicion.
 *
 * Vive en /admin/ediciones, dentro de la edicion activa: es la accion mas
 * peligrosa del panel (cambia lo que ve todo el sitio publico) y estaba en la
 * cabecera de la pantalla de ideas, al lado de un filtro, a un click de
 * distancia y sin preguntar nada.
 *
 * La confirmacion no es un "estas seguro": dice en palabras que abre y que
 * cierra la etapa destino, porque el equipo no tiene por que recordar de memoria
 * que "votacion" abre la votacion publica.
 *
 * Las etapas a las que no se puede pasar (`puedeCambiarEtapa`, en
 * src/lib/etapas.ts) aparecen deshabilitadas en el select, y abajo se dice por
 * que. Sin eso el equipo se enteraba recien al confirmar, despues de leer todo
 * lo que el cambio iba a hacer. La accion igual lo vuelve a decidir con los
 * numeros de la base.
 */
import { useActionState, useState } from "react";
import { cambiarEtapa } from "./acciones";
import { ETAPAS, puedeCambiarEtapa, type ContextoEdicion, type Etapa } from "@/lib/etapas";
import { ETIQUETA_ETAPA } from "@/lib/formato";

/**
 * Que significa cada etapa en el sitio publico. `ahora` describe el estado en
 * que deja al sitio; `alPasar` es lo que cambia en el momento del cambio.
 *
 * Los textos siguen lo que hace el codigo hoy: el formulario de ideas se abre
 * solo en "ideas" (src/app/ideas/nueva/page.tsx y src/app/api/ideas/route.ts) y
 * la votacion solo en "votacion" (src/app/votar/page.tsx y
 * src/app/api/votos/route.ts). Si eso cambia, estos textos cambian con el.
 */
const EFECTO: Record<string, { ahora: string; alPasar: string[] }> = {
  ideas: {
    ahora: "El formulario para presentar ideas está abierto y la votación cerrada.",
    alPasar: [
      "Se abre el formulario público: cualquier vecino puede presentar una propuesta y el botón “Presentá tu idea” vuelve a la cabecera del sitio.",
      "La votación queda cerrada.",
    ],
  },
  evaluacion: {
    ahora:
      "No se presentan ideas nuevas y todavía no se vota: las propuestas están en evaluación técnica.",
    alPasar: [
      "Se cierra el formulario público: el sitio deja de aceptar propuestas nuevas.",
      "La votación sigue cerrada y el sitio informa que las propuestas están en evaluación técnica.",
    ],
  },
  votacion: {
    ahora:
      "La votación pública está abierta: cada vecino empadronado puede votar un proyecto de su distrito.",
    alPasar: [
      "Se abre la votación pública: cualquier vecino empadronado entra a votar un proyecto de su distrito y el botón “Votar” aparece en la cabecera del sitio.",
      "El formulario para presentar ideas queda cerrado.",
      "Los votos que entren son los que después definen el proyecto ganador de cada distrito.",
      "Mientras dure, los proyectos que se votan quedan fijos: en “Propuestas” no se pueden evaluar distinto, despublicar ni reabrir, y ninguna idea nueva entra a la votación. Los ganadores se proclaman recién cuando cierre.",
    ],
  },
  /*
   * Esta etapa decia "el sitio muestra el avance de las obras ganadoras" y que
   * el equipo carga los avances. Las dos cosas dejaron de ser ciertas: no hay
   * ningun avance informado, y la pantalla que los cargaba (/admin/obras) se
   * borro al recortar el panel. Quien leyera esto iba a buscar un formulario
   * que no esta.
   */
  seguimiento: {
    ahora: "La votación está cerrada y el sitio publica los proyectos ganadores de cada distrito.",
    alPasar: [
      "Se cierra la votación: el sitio no acepta ni un voto más.",
      "Quedan al frente los proyectos ganadores de cada distrito, con sus votos.",
      "El formulario para presentar ideas sigue cerrado.",
      "El avance de las obras no se publica: hoy el panel no tiene dónde cargarlo.",
    ],
  },
  cerrada: {
    ahora: "La edición está cerrada: no se presentan ideas ni se vota.",
    alPasar: [
      "Se cierra todo: el sitio no acepta ideas nuevas ni votos.",
      "La edición queda publicada como cerrada, para consulta.",
    ],
  },
};

export default function SelectorEtapa({
  edicionId,
  etapa,
  rol,
  contexto,
}: {
  edicionId: number;
  etapa: Etapa;
  rol: "admin" | "moderador" | "lector";
  /** Votos y ganadores de esta edicion: deciden a que etapas se puede volver. */
  contexto: ContextoEdicion;
}) {
  const [estado, accion, pendiente] = useActionState(cambiarEtapa, null);
  const [destino, setDestino] = useState<Etapa>(etapa);
  const [confirmando, setConfirmando] = useState(false);

  const actual = ETIQUETA_ETAPA[etapa] ?? etapa;
  const efectoActual = EFECTO[etapa];

  // Cuando la accion sale bien, la pantalla se relee y `etapa` ya viene con el
  // valor nuevo: el bloque de confirmacion se cierra solo.
  const cambia = destino !== etapa;

  // Las etapas a las que hoy no se puede pasar, con el motivo de cada una.
  const bloqueadas = ETAPAS.flatMap((valor) => {
    const veredicto = puedeCambiarEtapa(etapa, valor, contexto);
    return veredicto.permitido ? [] : [{ etapa: valor, motivo: veredicto.motivo }];
  });
  const estaBloqueada = (valor: Etapa) => bloqueadas.some((fila) => fila.etapa === valor);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
    >
      <h3 className="text-sm font-bold">Etapa del proceso</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
        Es lo que abre y cierra el sitio público, y el cambio se ve al instante. Etapa actual:{" "}
        <strong style={{ color: "var(--texto)" }}>{actual}</strong>.
        {efectoActual ? ` ${efectoActual.ahora}` : ""}
      </p>

      {rol !== "admin" ? (
        <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
          Con tu rol ({rol}) la etapa se ve pero no se cambia: la cambia un administrador.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm" htmlFor={`etapa-${edicionId}`}>
              <span className="font-medium">Pasar a</span>
              <select
                id={`etapa-${edicionId}`}
                value={destino}
                onChange={(evento) => {
                  setDestino(evento.target.value as Etapa);
                  setConfirmando(false);
                }}
                className="rounded-xl px-3 py-2 text-sm"
                style={{
                  background: "var(--fondo-tarjeta)",
                  border: "1px solid var(--borde)",
                  color: "var(--texto)",
                }}
              >
                {ETAPAS.map((valor) => (
                  <option key={valor} value={valor} disabled={estaBloqueada(valor)}>
                    {ETIQUETA_ETAPA[valor] ?? valor}
                    {valor === etapa
                      ? " (etapa actual)"
                      : estaBloqueada(valor)
                        ? " (no disponible)"
                        : ""}
                  </option>
                ))}
              </select>
            </label>

            {!confirmando && (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                disabled={!cambia}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: "var(--fondo-tarjeta)",
                  border: "1px solid var(--color-marca-600)",
                  color: "var(--marca-texto)",
                }}
              >
                {cambia ? "Ver qué implica el cambio…" : "Ya está en esta etapa"}
              </button>
            )}

            {/* El exito se anuncia aca porque el bloque de confirmacion ya se
                cerro solo; el error se muestra adentro, junto al boton que
                fallo. */}
            {estado?.ok && (
              <span
                role="status"
                className="pb-1 text-sm"
                style={{ color: "var(--color-cat-ambiental)" }}
              >
                Listo: la edición está en “{actual}”.
              </span>
            )}
          </div>

          {/* Los nombres a la vista y los motivos a un click: con votos y
              ganadores son tres parrafos casi iguales, y el selector no tiene
              que quedar enterrado abajo de ellos. */}
          {bloqueadas.length > 0 && (
            <details className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
              <summary className="cursor-pointer">
                No disponibles desde esta etapa:{" "}
                {bloqueadas.map((fila) => ETIQUETA_ETAPA[fila.etapa] ?? fila.etapa).join(", ")}.
                Por qué
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {bloqueadas.map((fila) => (
                  <li key={fila.etapa}>
                    <strong style={{ color: "var(--texto)" }}>
                      {ETIQUETA_ETAPA[fila.etapa] ?? fila.etapa}
                    </strong>
                    : {fila.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {confirmando && cambia && (
            <BloqueConfirmacion
              edicionId={edicionId}
              etapa={etapa}
              destino={destino}
              accion={accion}
              pendiente={pendiente}
              error={estado && !estado.ok ? estado.error : null}
              alCancelar={() => setConfirmando(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

function BloqueConfirmacion({
  edicionId,
  etapa,
  destino,
  accion,
  pendiente,
  error,
  alCancelar,
}: {
  edicionId: number;
  etapa: string;
  destino: string;
  accion: (formulario: FormData) => void;
  pendiente: boolean;
  error: string | null;
  alCancelar: () => void;
}) {
  const desde = ETIQUETA_ETAPA[etapa] ?? etapa;
  const hasta = ETIQUETA_ETAPA[destino] ?? destino;
  const efecto = EFECTO[destino];

  return (
    <form
      action={accion}
      className="mt-3 rounded-xl p-4"
      style={{
        background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-acento-600) 40%, transparent)",
      }}
    >
      <input type="hidden" name="edicionId" value={edicionId} />
      <input type="hidden" name="etapa" value={destino} />

      <p className="text-sm font-semibold">
        Estás por cambiar la etapa de <strong>{desde}</strong> a <strong>{hasta}</strong>.
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        En el sitio público, apenas confirmes:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {(efecto?.alPasar ?? []).map((linea, indice) => (
          <li key={indice}>{linea}</li>
        ))}
      </ul>
      {/*
        Antes decia que siempre se podia volver atras. Ya no es cierto (ver
        puedeCambiarEtapa): se dice aca cuando todavia se puede elegir, no
        despues de que entro el primer voto.
      */}
      <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        Lo que pase mientras tanto —ideas presentadas, votos emitidos— no se borra. Y volver atrás
        tiene límites: con un solo voto emitido la edición ya no vuelve a una etapa anterior a la
        votación, y con un ganador proclamado la votación no se reabre.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Cambiando…" : `Sí, pasar a “${hasta}”`}
        </button>
        <button type="button" onClick={alCancelar} className="text-sm underline">
          Cancelar
        </button>
        {error && (
          <span role="alert" className="text-sm" style={{ color: "var(--acento-texto)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
