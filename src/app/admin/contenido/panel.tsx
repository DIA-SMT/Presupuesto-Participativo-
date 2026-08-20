"use client";

/**
 * Edicion de los textos del sitio y alta de novedades. Cumple el rol del
 * endpoint /api/text del sitio anterior, pero con autenticacion.
 */
import { useState, useActionState } from "react";
import { crearNovedad, guardarTexto } from "../acciones";

type Texto = { clave: string; valor: string };

export default function PanelContenido({
  textos,
  soloLectura,
}: {
  textos: Texto[];
  soloLectura: boolean;
}) {
  const [filtro, setFiltro] = useState("");
  const visibles = textos.filter(
    (texto) =>
      !filtro.trim() ||
      texto.clave.includes(filtro.trim().toLowerCase()) ||
      texto.valor.toLowerCase().includes(filtro.trim().toLowerCase()),
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      <section>
        <h1 className="text-2xl font-bold">Textos del sitio</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Cada texto se muestra en la página que indica su clave. Los cambios impactan al guardar.
        </p>

        <input
          type="search"
          placeholder="Filtrar por clave o contenido…"
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value)}
          className="mt-4 w-full max-w-sm rounded-xl px-3 py-2.5 text-sm outline-none"
          style={estiloCampo}
        />

        <ul className="mt-4 space-y-3">
          {visibles.map((texto) => (
            <li key={texto.clave}>
              <FormularioTexto texto={texto} soloLectura={soloLectura} />
            </li>
          ))}
        </ul>
      </section>

      {!soloLectura && (
        <aside className="superficie rounded-2xl p-6">
          <h2 className="text-lg font-bold">Nueva novedad</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Aparece en la portada, en “Novedades y próximos encuentros”.
          </p>
          <FormularioNovedad />
        </aside>
      )}
    </div>
  );
}

function FormularioTexto({ texto, soloLectura }: { texto: Texto; soloLectura: boolean }) {
  const [estado, accion, pendiente] = useActionState(guardarTexto, null);
  const largo = texto.valor.length > 120;

  return (
    <form action={accion} className="superficie rounded-2xl p-4">
      <input type="hidden" name="clave" value={texto.clave} />
      <div className="flex items-center justify-between gap-3">
        <code className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {texto.clave}
        </code>
        {estado && (
          <span
            role="status"
            className="text-xs"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? "Guardado." : estado.error}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <textarea
          name="valor"
          defaultValue={texto.valor}
          rows={largo ? 4 : 1}
          disabled={soloLectura}
          className="flex-1 resize-y rounded-xl px-3 py-2 text-sm"
          style={estiloCampo}
        />
        {!soloLectura && (
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-marca-700)" }}
          >
            Guardar
          </button>
        )}
      </div>
    </form>
  );
}

function FormularioNovedad() {
  const [estado, accion, pendiente] = useActionState(crearNovedad, null);

  return (
    <form action={accion} className="mt-4 grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Título</span>
        <input name="titulo" required maxLength={200} style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Fecha</span>
        <input name="fecha" type="date" required style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Copete (opcional)</span>
        <input name="copete" maxLength={300} style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Cuerpo</span>
        <textarea name="cuerpo" required rows={4} style={estiloCampo} className="resize-y rounded-xl px-3 py-2" />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Publicando…" : "Publicar novedad"}
        </button>
        {estado && (
          <span
            role="status"
            className="text-sm"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? "Publicada." : estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
