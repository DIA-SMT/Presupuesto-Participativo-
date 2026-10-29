"use client";

/**
 * Pantalla de obras del panel: una tarjeta por proyecto ganador, la misma que
 * ve el vecino en /transparencia (TarjetaObra), y debajo de cada una lo que
 * el equipo usa para mantenerla al dia:
 *
 *  - "Actualizar estado": la etapa, la fecha, una aclaracion y el link (el
 *    boletin oficial, la nota de prensa). Cada envio es un avance nuevo: la
 *    tarjeta muestra el ultimo y la ficha del proyecto, todos.
 *  - El historial de avances, para borrar uno mal cargado.
 *
 * Arriba, un resumen de cuantas obras hay en cada etapa, que filtra.
 */
import { startTransition, useActionState, useState } from "react";
import TarjetaObra from "@/components/TarjetaObra";
import type { AvanceDeObra, ObraGanadora } from "@/db/queries";
import {
  ETAPAS_PRESUPUESTO,
  ETIQUETA_PRESUPUESTO,
  formatearFecha,
} from "@/lib/formato";
import { conEdicion } from "@/lib/ediciones";
import { borrarAvance, crearAvance } from "../acciones";

type Filtro = (typeof ETAPAS_PRESUPUESTO)[number] | "sin-informacion" | null;

function etapaDe(obra: ObraGanadora): Exclude<Filtro, null> {
  return (ETAPAS_PRESUPUESTO as readonly string[]).includes(obra.etapa ?? "")
    ? (obra.etapa as Exclude<Filtro, null>)
    : "sin-informacion";
}

export default function PanelObras({
  anio,
  anioEnEnlaces,
  obras,
  puedeEscribir,
  hoy,
}: {
  anio: number | null;
  anioEnEnlaces: number | null;
  obras: ObraGanadora[];
  puedeEscribir: boolean;
  /** AAAA-MM-DD en Tucuman: la fecha que propone el formulario. */
  hoy: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>(null);

  if (anio === null || !obras.length) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Obras</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay una edición que haya terminado de votar con proyectos ganadores
          publicados. Las obras aparecen acá cuando se proclaman los ganadores.
        </p>
      </div>
    );
  }

  const cuentas = new Map<string, number>();
  for (const obra of obras) cuentas.set(etapaDe(obra), (cuentas.get(etapaDe(obra)) ?? 0) + 1);
  const visibles = filtro ? obras.filter((obra) => etapaDe(obra) === filtro) : obras;
  const opciones: Exclude<Filtro, null>[] = [...ETAPAS_PRESUPUESTO, "sin-informacion"];

  return (
    <div>
      <header className="max-w-3xl" data-recorrido="obras">
        <h1 className="text-2xl font-bold">Obras de la edición {anio}</h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          En qué etapa está la obra de cada proyecto ganador. Lo que cargues acá se publica en
          Transparencia y en la ficha del proyecto, tal como lo ves en cada tarjeta.
          {puedeEscribir
            ? " Cada actualización queda en el historial del proyecto con tu nombre."
            : " Tu cuenta es de lectura: podés consultar, no actualizar."}
        </p>
      </header>

      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Filtrar por etapa">
        <li>
          <button
            type="button"
            className="filtro-obra"
            aria-current={filtro === null ? "true" : undefined}
            onClick={() => setFiltro(null)}
          >
            Todas <span className="cuenta">{obras.length}</span>
          </button>
        </li>
        {opciones
          .filter((valor) => cuentas.get(valor))
          .map((valor) => (
            <li key={valor}>
              <button
                type="button"
                className="filtro-obra"
                aria-current={filtro === valor ? "true" : undefined}
                onClick={() => setFiltro(valor)}
              >
                {valor === "sin-informacion" ? "Sin información" : ETIQUETA_PRESUPUESTO[valor]}{" "}
                <span className="cuenta">{cuentas.get(valor)}</span>
              </button>
            </li>
          ))}
      </ul>

      <ul className="grilla-propuestas mt-5">
        {visibles.map((obra) => (
          <li key={obra.id}>
            <TarjetaObra
              obra={obra}
              hrefFicha={conEdicion(`/proyectos/${obra.slug}`, anioEnEnlaces)}
              pie={
                <div className="space-y-2 pt-3" style={{ borderTop: "1px dashed var(--borde)" }}>
                  {puedeEscribir && <FormularioAvance obra={obra} hoy={hoy} />}
                  {obra.avances.length > 0 && (
                    <Historial avances={obra.avances} puedeEscribir={puedeEscribir} />
                  )}
                </div>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actualizar el estado
// ---------------------------------------------------------------------------

function FormularioAvance({ obra, hoy }: { obra: ObraGanadora; hoy: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearAvance, null);

  // Guardado: se cierra. La tarjeta de arriba ya muestra la etapa nueva
  // (la accion revalida la pagina). Se ajusta durante el render, cuando llega
  // un resultado nuevo, y no en un efecto: asi no hay un render de mas con el
  // formulario abierto.
  const [resultadoVisto, setResultadoVisto] = useState(estado);
  if (estado !== resultadoVisto) {
    setResultadoVisto(estado);
    if (estado?.ok) setAbierto(false);
  }

  // La etapa que propone: la siguiente a la actual, que es lo que suele pasar.
  const actual = ETAPAS_PRESUPUESTO.indexOf(obra.etapa as (typeof ETAPAS_PRESUPUESTO)[number]);
  const propuesta = ETAPAS_PRESUPUESTO[Math.min(actual + 1, ETAPAS_PRESUPUESTO.length - 1)];

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          Actualizar estado
        </button>
        {estado?.ok && (
          <span role="status" className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Guardado y publicado.
          </span>
        )}
      </div>
    );
  }

  const idBase = `obra-${obra.id}`;
  return (
    <form
      action={accion}
      // Sin esto React vacia el formulario al terminar cada envio, y un error
      // del servidor (un link sin https) borraba la aclaracion escrita. Es lo
      // mismo que hace ediciones/panel.tsx con `enviarSinResetear`.
      onSubmit={(evento) => {
        evento.preventDefault();
        const datos = new FormData(evento.currentTarget);
        startTransition(() => accion(datos));
      }}
      className="grid gap-2.5 text-sm"
    >
      <input type="hidden" name="ideaId" value={obra.id} />
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs font-medium" htmlFor={`${idBase}-etapa`}>
          Etapa
          <select
            id={`${idBase}-etapa`}
            name="etapa"
            defaultValue={propuesta}
            className="rounded-lg px-2 py-1.5 text-sm"
            style={{ border: "1px solid var(--borde-control)", background: "var(--fondo)" }}
          >
            {ETAPAS_PRESUPUESTO.map((etapa) => (
              <option key={etapa} value={etapa}>
                {ETIQUETA_PRESUPUESTO[etapa]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium" htmlFor={`${idBase}-fecha`}>
          Desde el
          <input
            id={`${idBase}-fecha`}
            type="date"
            name="fecha"
            required
            defaultValue={hoy}
            max={hoy}
            className="rounded-lg px-2 py-1.5 text-sm"
            style={{ border: "1px solid var(--borde-control)", background: "var(--fondo)" }}
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idBase}-aclaracion`}>
        Aclaración para el vecino (opcional)
        <textarea
          id={`${idBase}-aclaracion`}
          name="descripcion"
          rows={3}
          maxLength={3000}
          placeholder="Se abrieron los sobres el 22/10. Plazo de obra: tres meses."
          className="rounded-lg px-2 py-1.5 text-sm"
          style={{ border: "1px solid var(--borde-control)", background: "var(--fondo)" }}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium" htmlFor={`${idBase}-enlace`}>
        Link que lo respalda (opcional)
        <input
          id={`${idBase}-enlace`}
          type="url"
          name="enlace"
          inputMode="url"
          placeholder="https://comunicacionsmt.gob.ar/contenido/…"
          className="rounded-lg px-2 py-1.5 text-sm"
          style={{ border: "1px solid var(--borde-control)", background: "var(--fondo)" }}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Publicando…" : "Publicar"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs underline">
          Cancelar
        </button>
        {estado && !estado.ok && (
          <span role="alert" className="text-xs" style={{ color: "var(--acento-texto)" }}>
            {estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

function Historial({
  avances,
  puedeEscribir,
}: {
  avances: AvanceDeObra[];
  puedeEscribir: boolean;
}) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium" style={{ color: "var(--texto-suave)" }}>
        Historial ({avances.length})
      </summary>
      <ol className="mt-2 space-y-2">
        {avances.map((avance) => (
          <li key={avance.id} className="rounded-lg p-2" style={{ background: "var(--fondo-suave)" }}>
            <p className="font-semibold">
              {ETIQUETA_PRESUPUESTO[avance.etapa] ?? avance.etapa} · {formatearFecha(avance.fecha)}
            </p>
            {avance.descripcion && (
              <p className="mt-0.5" style={{ color: "var(--texto-suave)" }}>
                {avance.descripcion}
              </p>
            )}
            {puedeEscribir && <BorrarAvance id={avance.id} />}
          </li>
        ))}
      </ol>
    </details>
  );
}

function BorrarAvance({ id }: { id: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, accion, pendiente] = useActionState(borrarAvance, null);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="mt-1 underline">
        Borrar
      </button>
    );
  }
  return (
    <form action={accion} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <span>Deja de verse en el sitio.</span>
      <button
        type="submit"
        disabled={pendiente}
        className="font-semibold underline disabled:opacity-50"
        style={{ color: "var(--acento-texto)" }}
      >
        {pendiente ? "Borrando…" : "Sí, borrar"}
      </button>
      <button type="button" onClick={() => setConfirmando(false)} className="underline">
        Cancelar
      </button>
      {estado && !estado.ok && (
        <span role="alert" style={{ color: "var(--acento-texto)" }}>
          {estado.error}
        </span>
      )}
    </form>
  );
}
