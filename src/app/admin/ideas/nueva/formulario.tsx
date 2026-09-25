"use client";

/**
 * Formulario de carga de una idea por el equipo.
 *
 * No es el formulario publico (src/components/FormularioIdea.tsx), a proposito:
 * ese es un paso a paso para un vecino que escribe su propuesta por primera vez,
 * con ayuda de IA. Aca alguien del equipo transcribe una tanda de papeles de una
 * asamblea: todo a la vista en una sola pantalla, sin pasos, y lo que es comun a
 * la tanda (por donde llego, de que asamblea, que dia) queda puesto de una idea
 * a la siguiente. Los minimos y los largos si son los mismos: vienen por props
 * de src/lib/idea-esquema.ts, que es lo que valida el servidor.
 *
 * Los campos son CONTROLADOS. React limpia los campos sin controlar cuando
 * termina la accion de un <form>, y aca eso borraria cinco parrafos tipeados
 * de un papel por un rechazo del servidor (la fecha, un punto fuera del ejido).
 *
 * Al terminar muestra el numero y el codigo de seguimiento, y el comprobante
 * para imprimir y darle al vecino.
 */
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import DocumentoIdea from "@/components/DocumentoIdea";
import Mapa from "@/components/Mapa";
import { cargarIdea } from "../acciones";
import Comprobante from "../comprobante";
import type { Largo, Limites } from "../limites";
import { DISTRITOS_MAPA, SIN_PUNTOS } from "../mapa-ficha";
import type { IdeaCargada, ResultadoAlta } from "../operaciones";

type Categoria = { slug: string; nombre: string; descripcion: string };

type Punto = { lat: number; lon: number };

/** Lo de cada idea. Lo de la tanda (canal, de donde, fecha) va aparte. */
const CONTENIDO_VACIO = {
  titulo: "",
  categoria: "",
  solucion: "",
  problema: "",
  beneficios: "",
  autorNombre: "",
};

/**
 * El barrio va aparte porque lo pueden escribir dos: la persona y el mapa.
 * `delMapa` dice si el valor lo puso un clic: si es asi, el clic siguiente lo
 * reemplaza; si lo escribio la persona (del papel), no se toca.
 */
const BARRIO_VACIO = { valor: "", delMapa: false };

const CANALES = [
  {
    valor: "asamblea",
    etiqueta: "Una asamblea",
    ayuda: "Las fichas de papel de una asamblea barrial.",
  },
  {
    valor: "municipio",
    etiqueta: "El municipio",
    ayuda: "Mesa de entradas, un mail al programa, la oficina.",
  },
] as const;

export default function FormularioCarga({
  anio,
  enEvaluacion,
  categorias,
  hoy,
  limites,
  sitio,
}: {
  anio: number;
  /** La edicion ya cerro el formulario publico: se avisa, pero se carga igual. */
  enEvaluacion: boolean;
  categorias: Categoria[];
  /** El dia de hoy en Tucuman, AAAA-MM-DD: el tope de la fecha. */
  hoy: string;
  limites: Limites;
  /** Dominio del sitio, para las instrucciones del comprobante. */
  sitio: string;
}) {
  const [lote, setLote] = useState({ canal: "asamblea", canalDetalle: "", fecha: hoy });
  const [contenido, setContenido] = useState(CONTENIDO_VACIO);
  const [barrio, setBarrio] = useState(BARRIO_VACIO);
  const [punto, setPunto] = useState<Punto | null>(null);
  /** undefined: sin respuesta todavia. null: el punto cae fuera de los 20 distritos. */
  const [distrito, setDistrito] = useState<number | null | undefined>(undefined);
  const [ubicando, setUbicando] = useState(false);
  const [aproximada, setAproximada] = useState(false);
  /** El anillo exterior de cada distrito, para el mapita del comprobante. */
  const [contornos, setContornos] = useState<Record<number, number[][]>>({});
  /** La ultima idea cargada: mientras hay una, se muestra su comprobante. */
  const [ultima, setUltima] = useState<IdeaCargada | null>(null);
  const [cargadas, setCargadas] = useState(0);

  /** Numero de la ultima consulta de distrito: una respuesta vieja no pisa a una nueva. */
  const consulta = useRef(0);
  const geometria = useRef<Promise<Record<number, number[][]>> | null>(null);

  const [resultado, accion, pendiente] = useActionState(
    async (previo: ResultadoAlta | null, datos: FormData): Promise<ResultadoAlta> => {
      const respuesta = await cargarIdea(previo, datos);
      if (respuesta.ok) {
        setUltima(respuesta.idea);
        setCargadas((cantidad) => cantidad + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return respuesta;
    },
    null,
  );

  function escribir(campo: keyof typeof CONTENIDO_VACIO, valor: string) {
    setContenido((actual) => ({ ...actual, [campo]: valor }));
  }

  /**
   * El contorno de los distritos, del mismo /geo/distritos.geojson que ya bajo
   * el mapa (lo sirve el cache del navegador). Si falla, el comprobante dibuja
   * solo el punto: las coordenadas y el distrito van en texto igual.
   */
  function cargarContornos() {
    geometria.current ??= fetch("/geo/distritos.geojson")
      .then((respuesta) => respuesta.json())
      .then(
        (geo: {
          features: Array<{ properties: { numero: number }; geometry: { coordinates: number[][][][] } }>;
        }) => {
          const anillos: Record<number, number[][]> = {};
          for (const feature of geo.features) {
            const anillo = feature.geometry.coordinates?.[0]?.[0];
            if (anillo) anillos[feature.properties.numero] = anillo;
          }
          setContornos(anillos);
          return anillos;
        },
      )
      .catch(() => ({}));
  }

  /**
   * Al marcar un punto se le pregunta al servidor el distrito y el barrio,
   * como en el formulario publico. El barrio se completa solo si el campo esta
   * vacio o lo habia puesto el mapa: lo que tipeo la persona (del papel) gana.
   */
  async function elegirPunto(nuevo: Punto) {
    const esta = ++consulta.current;
    setPunto(nuevo);
    setDistrito(undefined);
    setUbicando(true);
    cargarContornos();
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      const cuerpo = (await respuesta.json()) as { distrito: number | null; barrio: string | null };
      if (esta !== consulta.current) return;
      setDistrito(cuerpo.distrito);
      const delPunto = cuerpo.barrio;
      if (delPunto) {
        setBarrio((actual) =>
          !actual.valor.trim() || actual.delMapa ? { valor: delPunto, delMapa: true } : actual,
        );
      }
    } catch {
      if (esta === consulta.current) setDistrito(undefined);
    } finally {
      if (esta === consulta.current) setUbicando(false);
    }
  }

  function cargarOtra() {
    setUltima(null);
    setContenido(CONTENIDO_VACIO);
    setBarrio(BARRIO_VACIO);
    setPunto(null);
    setDistrito(undefined);
    setAproximada(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // --- Terminada: el numero, el codigo y el comprobante ----------------------
  if (ultima) {
    return (
      <div className="mt-6 space-y-6">
        <section
          className="rounded-2xl px-5 py-5"
          style={{
            background: "color-mix(in srgb, var(--color-cat-ambiental) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-cat-ambiental) 40%, transparent)",
          }}
          aria-live="polite"
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
            Idea cargada{cargadas > 1 ? ` · ${cargadas} en esta tanda` : ""}
          </p>
          <h2 className="mt-1 text-xl font-bold">
            #{ultima.numero} · {ultima.titulo}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Distrito {ultima.distrito} · En evaluación, sin publicar.
          </p>

          <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="rounded-xl px-4 py-3" style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}>
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Número de la idea
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold">#{ultima.numero}</p>
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Código de seguimiento
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold" style={{ letterSpacing: "0.12em" }}>
                {ultima.codigo}
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed">
            Imprimí el comprobante y dáselo a quien presentó la idea: con el número y el código
            consulta cómo sigue en <strong>{sitio}/ideas/seguimiento</strong>.{" "}
            <strong>El código no se vuelve a mostrar</strong>: si no se imprime ahora, anotalo.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Imprimir comprobante
            </button>
            <button
              type="button"
              onClick={cargarOtra}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde-control)" }}
            >
              Cargar otra de la misma tanda
            </button>
            <Link
              href={`/admin?idea=${ultima.id}#ficha`}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold underline"
            >
              Ver su ficha en Propuestas
            </Link>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
            “Cargar otra” deja puesto de dónde vino y la fecha ({lote.canalDetalle || "sin detalle"},{" "}
            {lote.fecha}), para seguir con la tanda.
          </p>
        </section>

        <div className="max-w-3xl">
          <Comprobante idea={ultima} poligono={contornos[ultima.distrito] ?? null} sitio={sitio} />
        </div>
      </div>
    );
  }

  // --- El formulario ---------------------------------------------------------
  const largo = (valor: string) => valor.trim().length;
  const faltantes: string[] = [];
  if (largo(lote.canalDetalle) < limites.canalDetalle.minimo) faltantes.push("de dónde vino");
  if (!lote.fecha) faltantes.push("la fecha en que se presentó");
  if (!punto) faltantes.push("el lugar en el mapa");
  else if (distrito === null) faltantes.push("un punto dentro de los 20 distritos");
  if (largo(contenido.titulo) < limites.titulo.minimo) faltantes.push("el título");
  if (!contenido.categoria) faltantes.push("la categoría");
  if (largo(contenido.solucion) < limites.solucion.minimo) faltantes.push("qué se propone");
  if (largo(contenido.problema) < limites.problema.minimo) faltantes.push("por qué hace falta");

  const bloqueado = pendiente || ubicando || faltantes.length > 0;
  const categoriaElegida = categorias.find((categoria) => categoria.slug === contenido.categoria);

  return (
    <form
      action={accion}
      className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start"
    >
      <div className="space-y-8">
        {enEvaluacion && (
          <p
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-marca-600) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-marca-600) 28%, transparent)",
            }}
          >
            La edición {anio} ya está en evaluación técnica: el formulario del sitio está cerrado,
            pero lo que se presentó por otra vía se sigue cargando acá y se evalúa con las demás.
          </p>
        )}

        {/* --- 1. De donde viene ------------------------------------------- */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold">1. De dónde viene</legend>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Esto queda puesto para la idea siguiente, así la tanda de una misma asamblea se carga
            de corrido.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {CANALES.map((canal) => (
              <label
                key={canal.valor}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm"
                style={{
                  background: lote.canal === canal.valor ? "var(--fondo-suave)" : "var(--fondo-tarjeta)",
                  border: `1px solid ${lote.canal === canal.valor ? "var(--color-marca-500)" : "var(--borde)"}`,
                }}
              >
                <input
                  type="radio"
                  name="canal"
                  value={canal.valor}
                  checked={lote.canal === canal.valor}
                  onChange={() => setLote((actual) => ({ ...actual, canal: canal.valor }))}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">{canal.etiqueta}</span>
                  <span className="block text-xs" style={{ color: "var(--texto-suave)" }}>
                    {canal.ayuda}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <Campo
            etiqueta="De dónde vino exactamente"
            ayuda="Por ejemplo “Asamblea del distrito 7, 12/10/2026”, “Mesa de entradas” o “Mail al programa”. No es público. Sin datos de personas: el nombre va más abajo."
          >
            <input
              name="canalDetalle"
              required
              minLength={limites.canalDetalle.minimo}
              maxLength={limites.canalDetalle.maximo}
              value={lote.canalDetalle}
              onChange={(evento) => {
                const valor = evento.target.value;
                setLote((actual) => ({ ...actual, canalDetalle: valor }));
              }}
              placeholder="Asamblea del distrito 7, 12/10/2026"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Fecha en que se presentó" ayuda="La del papel o la de la asamblea, no la de hoy.">
              <input
                type="date"
                name="fecha"
                required
                max={hoy}
                value={lote.fecha}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setLote((actual) => ({ ...actual, fecha: valor }));
                }}
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={estiloCampo}
              />
            </Campo>
            <Campo
              etiqueta="Quién la presentó (opcional)"
              ayuda="Solo el nombre: sin DNI, teléfono ni correo."
            >
              <input
                name="autorNombre"
                maxLength={limites.autorNombre.maximo}
                value={contenido.autorNombre}
                onChange={(evento) => escribir("autorNombre", evento.target.value)}
                autoComplete="off"
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={estiloCampo}
              />
            </Campo>
          </div>
        </fieldset>

        {/* --- 2. Donde seria ----------------------------------------------- */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-bold">2. Dónde sería</legend>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Tocá el mapa en el lugar de la obra. El distrito y el barrio se completan solos. Si el
            papel no dice el lugar exacto, marcá lo más cerca que puedas y tildá “aproximado”.
          </p>

          <Mapa
            modo="seleccionar"
            onSeleccionar={(nuevo) => void elegirPunto(nuevo)}
            puntoElegido={punto}
            distritoActivo={distrito ?? undefined}
            distritos={DISTRITOS_MAPA}
            puntos={SIN_PUNTOS}
            alto="22rem"
          />
          {/* El punto viaja en campos ocultos: el mapa no es un campo de formulario. */}
          <input type="hidden" name="lat" value={punto ? String(punto.lat) : ""} />
          <input type="hidden" name="lon" value={punto ? String(punto.lon) : ""} />

          <p
            className="rounded-xl px-4 py-3 text-sm"
            aria-live="polite"
            style={{
              background: "var(--fondo-suave)",
              border: `1px solid ${punto && distrito === null ? "var(--color-acento-600)" : "var(--borde)"}`,
            }}
          >
            {!punto && "Todavía no se marcó el lugar."}
            {punto && ubicando && "Buscando el distrito…"}
            {punto && !ubicando && distrito && (
              <>
                Punto en el <strong>Distrito {distrito}</strong>.{" "}
                <span style={{ color: "var(--texto-suave)" }}>
                  {punto.lat.toFixed(5)}, {punto.lon.toFixed(5)}
                </span>
              </>
            )}
            {punto && !ubicando && distrito === null && (
              <>Ese punto queda fuera de los 20 distritos de la ciudad. Marcá uno más cerca.</>
            )}
            {punto && !ubicando && distrito === undefined && (
              <>No se pudo averiguar el distrito ahora. Se calcula igual al guardar.</>
            )}
          </p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aproximada"
              value="1"
              checked={aproximada}
              onChange={(evento) => setAproximada(evento.target.checked)}
            />
            El punto es aproximado: no se sabe el lugar exacto de la obra
          </label>

          <Campo
            etiqueta="Barrio"
            ayuda={
              barrio.delMapa && barrio.valor
                ? "Lo completó el mapa. Si el papel dice otro, escribilo."
                : "Opcional."
            }
          >
            <input
              name="barrio"
              maxLength={limites.barrio.maximo}
              value={barrio.valor}
              onChange={(evento) => setBarrio({ valor: evento.target.value, delMapa: false })}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
          </Campo>
        </fieldset>

        {/* --- 3. La propuesta ---------------------------------------------- */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold">3. La propuesta</legend>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Transcribila como está en el papel. Si viene en mayúsculas, el título se acomoda solo al
            guardar; después se puede corregir desde la ficha.
          </p>

          <Campo etiqueta="Título de la idea" contador={contador(contenido.titulo, limites.titulo)}>
            <input
              name="titulo"
              required
              maxLength={limites.titulo.maximo}
              value={contenido.titulo}
              onChange={(evento) => escribir("titulo", evento.target.value)}
              placeholder="Puesta en valor de la plaza del barrio"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
          </Campo>

          <Campo etiqueta="Categoría">
            <select
              name="categoria"
              required
              value={contenido.categoria}
              onChange={(evento) => escribir("categoria", evento.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm"
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
            {categoriaElegida && (
              <span className="mt-1 block text-xs" style={{ color: "var(--texto-suave)" }}>
                {categoriaElegida.descripcion}
              </span>
            )}
          </Campo>

          <Campo
            etiqueta="Qué se propone"
            ayuda="En el formulario del sitio: “¿Qué querés proponer?”"
            contador={contador(contenido.solucion, limites.solucion)}
          >
            <textarea
              name="solucion"
              required
              rows={4}
              maxLength={limites.solucion.maximo}
              value={contenido.solucion}
              onChange={(evento) => escribir("solucion", evento.target.value)}
              className="w-full resize-y rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
          </Campo>

          <Campo
            etiqueta="Por qué hace falta"
            ayuda="En el formulario del sitio: “¿Por qué hace falta?”"
            contador={contador(contenido.problema, limites.problema)}
          >
            <textarea
              name="problema"
              required
              rows={4}
              maxLength={limites.problema.maximo}
              value={contenido.problema}
              onChange={(evento) => escribir("problema", evento.target.value)}
              className="w-full resize-y rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
          </Campo>

          <Campo
            etiqueta="Quiénes se benefician (opcional)"
            contador={contador(contenido.beneficios, limites.beneficios)}
          >
            <textarea
              name="beneficios"
              rows={3}
              maxLength={limites.beneficios.maximo}
              value={contenido.beneficios}
              onChange={(evento) => escribir("beneficios", evento.target.value)}
              className="w-full resize-y rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
          </Campo>
        </fieldset>

        <div className="space-y-2" style={{ borderTop: "1px solid var(--borde)" }}>
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={bloqueado}
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              {pendiente ? "Cargando…" : "Cargar la idea"}
            </button>
            {faltantes.length > 0 && (
              <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
                Falta: {faltantes.join(", ")}.
              </span>
            )}
          </div>
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
      </div>

      {/* --- La vista previa: asi sale el comprobante ----------------------- */}
      <aside className="space-y-2 xl:sticky xl:top-4">
        <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
          Así va a salir el comprobante (el número y el código aparecen al cargarla).
        </p>
        <DocumentoIdea
          datos={{
            titulo: contenido.titulo,
            categoria: categoriaElegida?.nombre ?? "",
            barrio: barrio.valor,
            distrito: distrito ?? null,
            punto,
            solucion: contenido.solucion,
            problema: contenido.problema,
            beneficios: contenido.beneficios,
          }}
          anio={anio}
          poligono={distrito ? (contornos[distrito] ?? null) : null}
        />
      </aside>
    </form>
  );
}

/** Cuanto lleva escrito un campo, y si le falta para el minimo. */
function contador(valor: string, largo: Largo): { texto: string; falta: boolean } {
  const escritos = valor.trim().length;
  if (largo.minimo > 0 && escritos < largo.minimo) {
    return { texto: `${escritos} de al menos ${largo.minimo} caracteres`, falta: true };
  }
  return { texto: `${escritos} / ${largo.maximo}`, falta: false };
}

function Campo({
  etiqueta,
  ayuda,
  contador: cuenta,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  contador?: { texto: string; falta: boolean };
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{etiqueta}</span>
        {cuenta && (
          <span
            className="text-xs tabular-nums"
            style={{ color: cuenta.falta ? "var(--acento-texto)" : "var(--texto-suave)" }}
          >
            {cuenta.texto}
          </span>
        )}
      </span>
      {children}
      {ayuda && (
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {ayuda}
        </span>
      )}
    </label>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
