"use client";

/**
 * Corregir una idea desde la ficha: titulo, textos, categoria, barrio, punto e
 * integracion en otra idea.
 *
 * Lo que la pantalla avisa ANTES de guardar, y que la accion igual vuelve a
 * decidir en el servidor (./operaciones.ts):
 *  - si la etapa no deja corregirla (una idea que se vota, con la votacion
 *    abierta), el boton ni se ofrece y se dice por que;
 *  - si el punto nuevo cae en otro distrito, se dice cual y se pide confirmarlo
 *    con una casilla; si la idea tiene votos o es ganadora, no se puede y se
 *    dice por que (`puedeCambiarDeDistrito`, el mismo texto que el servidor).
 *
 * El slug no se toca: los enlaces a la ficha publica siguen andando.
 *
 * Los campos son controlados, por lo mismo que en la carga: React limpia los
 * que no lo son cuando termina la accion, y un rechazo del servidor borraria la
 * correccion entera. Viven en un hijo que se monta cada vez que se abre el
 * formulario, asi arranca siempre con lo que la idea tiene en la base; guardada
 * la correccion, se cierra. No lleva `key` por la fecha de modificacion: otro
 * formulario de la misma ficha que guarda (la evaluacion) le borraria a la
 * persona lo que estaba corrigiendo.
 */
import { useActionState, useEffect, useRef, useState } from "react";
import type { CandidataIntegracion, IdeaAdmin } from "@/db/queries";
import { puedeCambiarDeDistrito, puedeCambiarIdea, type Etapa } from "@/lib/etapas";
import { corregirIdea } from "./acciones";
import type { Limites } from "./limites";
import { DISTRITOS_MAPA, MapaDiferido, SIN_PUNTOS } from "./mapa-ficha";

type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string };
type Categoria = { slug: string; nombre: string };
type Punto = { lat: number; lon: number };

export default function BloqueCorreccion({
  ficha,
  etapa,
  categorias,
  candidatas,
  limites,
}: {
  ficha: IdeaAdmin;
  etapa: Etapa;
  categorias: Categoria[];
  /** Las ideas en las que se puede integrar esta (getCandidatasIntegracion). */
  candidatas: CandidataIntegracion[];
  limites: Limites;
}) {
  const [abierto, setAbierto] = useState(false);
  const [resultado, accion, pendiente] = useActionState(
    async (previo: Resultado | null, datos: FormData): Promise<Resultado> => {
      const respuesta = await corregirIdea(previo, datos);
      // Guardada, el formulario se cierra: la ficha de arriba ya muestra lo
      // nuevo, y el mensaje queda a la vista.
      if (respuesta.ok) setAbierto(false);
      return respuesta;
    },
    null,
  );
  const veredicto = puedeCambiarIdea(etapa, ficha, { accion: "corregir" });

  // Guardada, el formulario se cierra y se lleva con el el boton que tenia el
  // foco: sin esto quedaba en el <body>. Se lleva al aviso, que dice que quedo
  // guardado y cuantos cambios.
  const aviso = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (resultado?.ok) aviso.current?.focus({ preventScroll: true });
  }, [resultado]);

  return (
    <section className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <h3 className="mt-4 text-sm font-bold">Corregir la idea</h3>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        El título, el texto, la categoría, el barrio, el punto en el mapa o la integración en otra
        idea. El enlace a la ficha pública no cambia, y en el historial queda el antes y el después.
      </p>

      {!veredicto.permitido ? (
        <span className="text-xs" style={{ color: "var(--acento-texto)" }}>
          {veredicto.motivo}
        </span>
      ) : abierto ? (
        <FormularioCorreccion
          ficha={ficha}
          categorias={categorias}
          candidatas={candidatas}
          limites={limites}
          accion={accion}
          pendiente={pendiente}
          alCancelar={() => setAbierto(false)}
        />
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
          >
            Corregir la idea
          </button>
        </div>
      )}

      {resultado && (
        <span
          ref={aviso}
          tabIndex={-1}
          role="status"
          className="text-sm"
          style={{ color: resultado.ok ? "var(--color-cat-ambiental)" : "var(--acento-texto)" }}
        >
          {resultado.ok ? (resultado.mensaje ?? "Corrección guardada.") : resultado.error}
        </span>
      )}
    </section>
  );
}

function FormularioCorreccion({
  ficha,
  categorias,
  candidatas,
  limites,
  accion,
  pendiente,
  alCancelar,
}: {
  ficha: IdeaAdmin;
  categorias: Categoria[];
  candidatas: CandidataIntegracion[];
  limites: Limites;
  accion: (datos: FormData) => void;
  pendiente: boolean;
  alCancelar: () => void;
}) {
  const original: Punto | null =
    ficha.lat === null || ficha.lon === null ? null : { lat: ficha.lat, lon: ficha.lon };
  // `IdeaVista.distrito` es 0 cuando la idea no tiene distrito asignado.
  const distritoActual = ficha.distrito > 0 ? ficha.distrito : null;

  const [campos, setCampos] = useState({
    titulo: ficha.titulo,
    categoria: ficha.categoriaSlug ?? "",
    barrio: ficha.barrio ?? "",
    solucion: ficha.solucion ?? "",
    problema: ficha.problema ?? "",
    beneficios: ficha.beneficios ?? "",
    integradaEn: ficha.integradaEn ? String(ficha.integradaEn.id) : "",
  });
  const [punto, setPunto] = useState<Punto | null>(original);
  /** El distrito del punto nuevo: undefined mientras no se movio o no respondio. */
  const [distritoNuevo, setDistritoNuevo] = useState<number | null | undefined>(undefined);
  const [barrioDelMapa, setBarrioDelMapa] = useState<string | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [aproximada, setAproximada] = useState(ficha.ubicacionAproximada);
  const [confirma, setConfirma] = useState(false);
  /**
   * Numero de la ultima consulta de distrito. Dos clics seguidos disparan dos
   * consultas, y la del primero puede volver despues: sin esto, pisaria el
   * distrito del punto que quedo marcado.
   */
  const consulta = useRef(0);

  function escribir(campo: keyof typeof campos, valor: string) {
    setCampos((actual) => ({ ...actual, [campo]: valor }));
  }

  async function moverPunto(nuevo: Punto) {
    const esta = ++consulta.current;
    setPunto(nuevo);
    setDistritoNuevo(undefined);
    setConfirma(false);
    // Un clic es un lugar elegido: deja de ser "aproximado". Si igual lo es,
    // se vuelve a tildar.
    setAproximada(false);
    setUbicando(true);
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      const cuerpo = (await respuesta.json()) as { distrito: number | null; barrio: string | null };
      if (esta !== consulta.current) return;
      setDistritoNuevo(cuerpo.distrito);
      setBarrioDelMapa(cuerpo.barrio);
    } catch {
      if (esta === consulta.current) setDistritoNuevo(undefined);
    } finally {
      if (esta === consulta.current) setUbicando(false);
    }
  }

  const movido =
    punto !== null &&
    (original === null ||
      punto.lat.toFixed(7) !== original.lat.toFixed(7) ||
      punto.lon.toFixed(7) !== original.lon.toFixed(7));
  const cambiaDistrito =
    movido &&
    typeof distritoNuevo === "number" &&
    distritoActual !== null &&
    distritoNuevo !== distritoActual;
  // El mismo veredicto que da el servidor, para decirlo antes de guardar.
  const mudanza =
    cambiaDistrito && typeof distritoNuevo === "number"
      ? puedeCambiarDeDistrito(
          { votos: ficha.votos, ganador: ficha.ganador },
          distritoActual,
          distritoNuevo,
        )
      : null;

  const faltaTitulo = campos.titulo.trim().length < limites.titulo.minimo;
  // Movido y sin distrito averiguado (la consulta fallo): no se sabe si se muda,
  // y la pantalla no podria ofrecer la casilla que el servidor pediria.
  const sinDistrito = movido && !ubicando && distritoNuevo === undefined;
  const bloqueado =
    pendiente ||
    ubicando ||
    faltaTitulo ||
    !campos.categoria ||
    sinDistrito ||
    (movido && distritoNuevo === null) ||
    (cambiaDistrito && (!mudanza?.permitido || !confirma));

  const integradaActual = ficha.integradaEn;
  const opciones = [...candidatas];
  if (integradaActual && !opciones.some((candidata) => candidata.id === integradaActual.id)) {
    opciones.unshift({
      id: integradaActual.id,
      numero: integradaActual.numero,
      titulo: integradaActual.titulo,
      distrito: null,
    });
  }
  const porDistrito = new Map<string, CandidataIntegracion[]>();
  for (const candidata of opciones) {
    const grupo = candidata.distrito === null ? "Sin distrito" : `Distrito ${candidata.distrito}`;
    porDistrito.set(grupo, [...(porDistrito.get(grupo) ?? []), candidata]);
  }

  return (
    <form action={accion} className="grid gap-3">
      <input type="hidden" name="id" value={ficha.id} />
      <input type="hidden" name="lat" value={punto ? String(punto.lat) : ""} />
      <input type="hidden" name="lon" value={punto ? String(punto.lon) : ""} />

      <Campo etiqueta="Título" cuenta={`${campos.titulo.trim().length} / ${limites.titulo.maximo}`}>
        <input
          name="titulo"
          required
          minLength={limites.titulo.minimo}
          maxLength={limites.titulo.maximo}
          value={campos.titulo}
          onChange={(evento) => escribir("titulo", evento.target.value)}
          className="rounded-xl px-3 py-2"
          style={estiloCampo}
        />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Categoría">
          <select
            name="categoria"
            required
            value={campos.categoria}
            onChange={(evento) => escribir("categoria", evento.target.value)}
            className="rounded-xl px-3 py-2"
            style={estiloCampo}
          >
            <option value="" disabled>
              Elegí una categoría
            </option>
            {categorias.map((categoria) => (
              <option key={categoria.slug} value={categoria.slug}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Barrio">
          <input
            name="barrio"
            maxLength={limites.barrio.maximo}
            value={campos.barrio}
            onChange={(evento) => escribir("barrio", evento.target.value)}
            className="rounded-xl px-3 py-2"
            style={estiloCampo}
          />
          {barrioDelMapa && barrioDelMapa !== campos.barrio && (
            <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Según el mapa, el punto nuevo está en {barrioDelMapa}.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => escribir("barrio", barrioDelMapa)}
              >
                Usar ese
              </button>
            </span>
          )}
        </Campo>
      </div>

      <Campo etiqueta="Qué se propone" cuenta={`${campos.solucion.trim().length} / ${limites.solucion.maximo}`}>
        <textarea
          name="solucion"
          rows={3}
          maxLength={limites.solucion.maximo}
          value={campos.solucion}
          onChange={(evento) => escribir("solucion", evento.target.value)}
          className="resize-y rounded-xl px-3 py-2"
          style={estiloCampo}
        />
      </Campo>
      <Campo etiqueta="Por qué hace falta" cuenta={`${campos.problema.trim().length} / ${limites.problema.maximo}`}>
        <textarea
          name="problema"
          rows={3}
          maxLength={limites.problema.maximo}
          value={campos.problema}
          onChange={(evento) => escribir("problema", evento.target.value)}
          className="resize-y rounded-xl px-3 py-2"
          style={estiloCampo}
        />
      </Campo>
      <Campo
        etiqueta="Quiénes se benefician"
        cuenta={`${campos.beneficios.trim().length} / ${limites.beneficios.maximo}`}
      >
        <textarea
          name="beneficios"
          rows={2}
          maxLength={limites.beneficios.maximo}
          value={campos.beneficios}
          onChange={(evento) => escribir("beneficios", evento.target.value)}
          className="resize-y rounded-xl px-3 py-2"
          style={estiloCampo}
        />
      </Campo>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Los textos no tienen mínimo acá: la mayoría de las ideas de 2025 llegaron sin ellos, y se
        tienen que poder corregir sin inventarlos.
      </p>

      <div className="grid gap-2 text-sm">
        <span className="font-medium">Punto en el mapa</span>
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Tocá el mapa para moverlo. El distrito se recalcula solo, con la misma geometría que el
          formulario del sitio.
        </span>
        <MapaDiferido
          modo="seleccionar"
          onSeleccionar={(nuevo) => void moverPunto(nuevo)}
          puntoElegido={punto}
          distritoActivo={(movido ? distritoNuevo : distritoActual) ?? undefined}
          distritos={DISTRITOS_MAPA}
          puntos={SIN_PUNTOS}
          alto="16rem"
        />
        <span className="text-xs" aria-live="polite" style={{ color: "var(--texto-suave)" }}>
          {!punto && "La idea no tiene punto cargado: tocá el mapa para ponerle uno."}
          {punto && !movido && "El punto está como se cargó."}
          {movido && ubicando && "Buscando el distrito del punto nuevo…"}
          {movido && !ubicando && distritoNuevo === null && (
            <strong style={{ color: "var(--acento-texto)" }}>
              Ese punto queda fuera de los 20 distritos de la ciudad.
            </strong>
          )}
          {movido && !ubicando && typeof distritoNuevo === "number" && !cambiaDistrito &&
            `El punto nuevo sigue en el Distrito ${distritoNuevo}.`}
          {sinDistrito && (
            <strong style={{ color: "var(--acento-texto)" }}>
              No se pudo averiguar el distrito del punto nuevo. Tocá el mapa otra vez.
            </strong>
          )}
        </span>

        {cambiaDistrito && mudanza && !mudanza.permitido && (
          <span className="text-xs" style={{ color: "var(--acento-texto)" }}>
            {mudanza.motivo}
          </span>
        )}
        {cambiaDistrito && mudanza?.permitido && (
          <label
            className="flex items-start gap-2 rounded-xl px-3 py-2 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
              border: "1px solid var(--color-acento-600)",
            }}
          >
            <input
              type="checkbox"
              name="confirmaDistrito"
              value="1"
              checked={confirma}
              onChange={(evento) => setConfirma(evento.target.checked)}
              className="mt-1"
            />
            <span>
              Este punto está en el <strong>Distrito {distritoNuevo}</strong> y la idea está en el{" "}
              <strong>Distrito {distritoActual}</strong>: al guardar, <strong>se muda de
              distrito</strong> (cambia en qué distrito se evalúa y se vota). Confirmo el cambio.
            </span>
          </label>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="aproximada"
            value="1"
            checked={aproximada}
            onChange={(evento) => setAproximada(evento.target.checked)}
          />
          El punto es aproximado: no marca el lugar exacto de la obra
        </label>
      </div>

      <Campo etiqueta="Integrada en otra idea">
        <select
          name="integradaEn"
          value={campos.integradaEn}
          onChange={(evento) => escribir("integradaEn", evento.target.value)}
          disabled={ficha.integradas > 0 && !campos.integradaEn}
          className="rounded-xl px-3 py-2"
          style={estiloCampo}
        >
          <option value="">No está integrada en otra idea</option>
          {[...porDistrito.entries()].map(([grupo, ideas]) => (
            <optgroup key={grupo} label={grupo}>
              {ideas.map((idea) => (
                <option key={idea.id} value={idea.id}>
                  {idea.numero === null ? "Sin número" : `#${idea.numero}`} · {idea.titulo}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {ficha.integradas > 0
            ? `Hay ${ficha.integradas === 1 ? "una idea integrada" : `${ficha.integradas} ideas integradas`} en esta: es la idea final de esas, así que no se integra en otra.`
            : "Elegí la idea final en la que quedó reunida. Integrarla no le cambia el estado: para que el vecino lo lea, marcala también como “Integrada con otra idea” en Evaluar, con su devolución."}
        </span>
      </Campo>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={bloqueado}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Guardando…" : "Guardar la corrección"}
        </button>
        <button type="button" onClick={alCancelar} className="text-sm underline">
          Cancelar
        </button>
        {faltaTitulo && (
          <span className="text-xs" style={{ color: "var(--acento-texto)" }}>
            El título necesita al menos {limites.titulo.minimo} caracteres.
          </span>
        )}
      </div>
    </form>
  );
}

function Campo({
  etiqueta,
  cuenta,
  children,
}: {
  etiqueta: string;
  cuenta?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{etiqueta}</span>
        {cuenta && (
          <span className="text-xs tabular-nums" style={{ color: "var(--texto-suave)" }}>
            {cuenta}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
