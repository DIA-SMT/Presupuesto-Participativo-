"use client";

/**
 * Filtros del listado de proyectos. Escriben en la barra de direcciones, asi que
 * cualquier filtro se puede compartir por link y el navegador lo recuerda al
 * volver atras. Cada cambio parte de los parametros de la URL (la que esta o la
 * ultima pedida), asi que `?edicion=AAAA` viaja con cualquier filtro sin que
 * haya que nombrarlo.
 *
 * Que URL pedir y cuando (la espera de la busqueda, "Limpiar filtros", un
 * selector elegido mientras otra navegacion sigue en camino) lo decide
 * src/lib/filtros-listado.ts; aca solo se muestra y se navega.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { crearFiltrosDelListado } from "@/lib/filtros-listado";

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
  // Uno por montaje: guarda el temporizador de la busqueda, que tiene que
  // sobrevivir a los renders para poder cancelarlo. `router.replace` e `iniciar`
  // son estables, asi que capturarlos aca no deja nada viejo.
  const [filtros] = useState(() =>
    crearFiltrosDelListado(parametros.toString(), (href) =>
      iniciar(() => router.replace(href)),
    ),
  );

  const consultaEnUrl = parametros.toString();
  // `useSearchParams` cambia recien cuando la navegacion termina (o cuando la
  // URL cambia por afuera: el boton de atras, un enlace). Ahi se avisa.
  useEffect(() => filtros.sincronizar(consultaEnUrl), [filtros, consultaEnUrl]);
  // Y Buscar toma la `q` de esa URL. Next no vuelve a montar este componente
  // cuando solo cambian los parametros (el link "Proyectos" del encabezado, el
  // boton de atras), asi que el `useState` de `texto` no se relee: sin esto el
  // campo seguiria diciendo "plaza" sobre un listado que ya no la busca. Se
  // ajusta en el render contra la ultima consulta vista, no con un setTexto en
  // el efecto (un render de mas: react-hooks/set-state-in-effect). Mientras la
  // persona escribe, `textoParaMostrar` da null y lo suyo no se toca.
  const [consultaVista, setConsultaVista] = useState(consultaEnUrl);
  if (consultaVista !== consultaEnUrl) {
    setConsultaVista(consultaEnUrl);
    const textoDeLaUrl = filtros.textoParaMostrar(consultaEnUrl);
    if (textoDeLaUrl !== null) setTexto(textoDeLaUrl);
  }
  useEffect(() => () => filtros.cancelar(), [filtros]);

  const actual = (clave: string) => parametros.get(clave) ?? "";

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
            onChange={(evento) => {
              setTexto(evento.target.value);
              filtros.buscar(evento.target.value);
            }}
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
          onCambio={(valor) => filtros.filtrar({ distrito: valor })}
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
          onCambio={(valor) => filtros.filtrar({ categoria: valor })}
          opciones={[{ valor: "", texto: "Todas las categorías" }, ...categorias]}
        />

        <Selector
          etiqueta="Estado"
          valor={actual("estado")}
          onCambio={(valor) => filtros.filtrar({ estado: valor, ganadores: "" })}
          opciones={[{ valor: "", texto: "Todos los estados" }, ...estados]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={actual("ganadores") === "1"}
            onChange={(evento) =>
              filtros.filtrar({ ganadores: evento.target.checked ? "1" : "", estado: "" })
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
              filtros.limpiar();
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
