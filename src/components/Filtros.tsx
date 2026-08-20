"use client";

/**
 * Filtros del listado de proyectos. Escriben en la barra de direcciones, asi que
 * cualquier filtro se puede compartir por link y el navegador lo recuerda al
 * volver atras.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Opcion = { valor: string; texto: string };

export default function Filtros({
  categorias,
  estados,
}: {
  categorias: Opcion[];
  estados: Opcion[];
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState(parametros.get("q") ?? "");

  const actual = (clave: string) => parametros.get(clave) ?? "";

  function navegar(cambios: Record<string, string>) {
    const siguientes = new URLSearchParams(parametros.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) siguientes.set(clave, valor);
      else siguientes.delete(clave);
    }
    const consulta = siguientes.toString();
    iniciar(() => router.replace(consulta ? `/proyectos?${consulta}` : "/proyectos"));
  }

  // La busqueda por texto espera a que la persona deje de escribir.
  useEffect(() => {
    const actualEnUrl = parametros.get("q") ?? "";
    if (texto === actualEnUrl) return;
    const temporizador = setTimeout(() => navegar({ q: texto }), 350);
    return () => clearTimeout(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const hayFiltros = ["distrito", "categoria", "estado", "q", "ganadores"].some((clave) =>
    parametros.get(clave),
  );

  return (
    <div
      className="superficie rounded-2xl p-4"
      aria-busy={pendiente}
      style={{ opacity: pendiente ? 0.72 : 1, transition: "opacity 120ms" }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Buscar</span>
          <input
            type="search"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            placeholder="Plaza, club, barrio…"
            className="rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{
              background: "var(--fondo-suave)",
              border: "1px solid var(--borde)",
              color: "var(--texto)",
            }}
          />
        </label>

        <Selector
          etiqueta="Distrito"
          valor={actual("distrito")}
          onCambio={(valor) => navegar({ distrito: valor })}
          opciones={[
            { valor: "", texto: "Todos los distritos" },
            ...Array.from({ length: 20 }, (_, i) => ({
              valor: String(i + 1),
              texto: `Distrito ${i + 1}`,
            })),
          ]}
        />

        <Selector
          etiqueta="Categoría"
          valor={actual("categoria")}
          onCambio={(valor) => navegar({ categoria: valor })}
          opciones={[{ valor: "", texto: "Todas las categorías" }, ...categorias]}
        />

        <Selector
          etiqueta="Estado"
          valor={actual("estado")}
          onCambio={(valor) => navegar({ estado: valor, ganadores: "" })}
          opciones={[{ valor: "", texto: "Todos los estados" }, ...estados]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={actual("ganadores") === "1"}
            onChange={(evento) =>
              navegar({ ganadores: evento.target.checked ? "1" : "", estado: "" })
            }
            className="h-4 w-4 rounded"
          />
          Solo proyectos ganadores
        </label>

        {hayFiltros && (
          <button
            type="button"
            onClick={() => {
              setTexto("");
              iniciar(() => router.replace("/proyectos"));
            }}
            className="text-sm underline"
            style={{ color: "var(--texto-suave)" }}
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}

function Selector({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  valor: string;
  opciones: Opcion[];
  onCambio: (valor: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <select
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        className="rounded-xl px-3 py-2.5 text-sm outline-none"
        style={{
          background: "var(--fondo-suave)",
          border: "1px solid var(--borde)",
          color: "var(--texto)",
        }}
      >
        {opciones.map((opcion) => (
          <option key={opcion.valor} value={opcion.valor}>
            {opcion.texto}
          </option>
        ))}
      </select>
    </label>
  );
}
