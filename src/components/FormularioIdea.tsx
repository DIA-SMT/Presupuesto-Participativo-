"use client";

/**
 * Formulario de carga de una idea.
 *
 * La diferencia central con el sitio anterior: la ubicacion no se escribe, se
 * marca en el mapa. El formulario manda lat/lon numericos y el servidor deriva
 * el distrito con PostGIS, asi que no hay forma de cargar una coordenada
 * invalida ni de asignar mal el distrito.
 *
 * Datos personales: el telefono ya no se pide (la columna no existe) y el
 * correo es facultativo, detras de una casilla desmarcada. Sin la casilla el
 * campo del correo ni siquiera se envia, y el aviso de como sigue la idea se
 * resuelve con el codigo de seguimiento que devuelve /api/ideas.
 *
 * Antes de enviar hay un paso de revision (/api/ideas/asistente): senala lo que
 * le falta a la propuesta, avisa si ya hay algo parecido en el distrito y ofrece
 * una reescritura. Es opcional en el sentido fuerte: "Enviar sin revisar" esta
 * siempre disponible y si el asistente falla el envio no se entera.
 *
 * Los campos siguen SIN ser controlados. Para poder aplicar la reescritura
 * alcanza con una referencia por campo y escribir su `.value`: el FormData del
 * envio lo levanta igual. Pasarlos a controlados habria sido rehacer el
 * formulario entero para no ganar nada.
 */
import { useRef, useState } from "react";
import Mapa from "@/components/Mapa";
import type { RespuestaAsistente } from "@/app/api/ideas/asistente/route";

type Categoria = { slug: string; nombre: string; descripcion: string };

type Estado =
  | { tipo: "editando" }
  | { tipo: "revisando" }
  | { tipo: "enviando" }
  | { tipo: "listo"; numero: number; distrito: number; codigo: string }
  | { tipo: "error"; mensaje: string };

const LARGOS = {
  titulo: 140,
  problema: 3000,
  solucion: 4000,
  beneficios: 3000,
} as const;

export default function FormularioIdea({
  categorias,
  abierta,
}: {
  categorias: Categoria[];
  abierta: boolean;
}) {
  const [punto, setPunto] = useState<{ lat: number; lon: number } | null>(null);
  const [distrito, setDistrito] = useState<number | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "editando" });
  /** Consentimiento para guardar el correo. Arranca en false, siempre. */
  const [avisos, setAvisos] = useState(false);

  /** Ultima revision del asistente, o null si todavia no se pidio ninguna. */
  const [revision, setRevision] = useState<RespuestaAsistente | null>(null);
  /** Para no ofrecer dos veces la misma reescritura ya aplicada. */
  const [reescrituraAplicada, setReescrituraAplicada] = useState(false);

  // Referencias a los campos de contenido: se leen para revisar y se escriben
  // al aceptar una reescritura, sin volver controlado el formulario.
  const refTitulo = useRef<HTMLInputElement>(null);
  const refProblema = useRef<HTMLTextAreaElement>(null);
  const refSolucion = useRef<HTMLTextAreaElement>(null);
  const refBeneficios = useRef<HTMLTextAreaElement>(null);

  /** Al marcar un punto se le pregunta al servidor a que distrito pertenece. */
  async function elegirPunto(nuevo: { lat: number; lon: number }) {
    setPunto(nuevo);
    setDistrito(null);
    setUbicando(true);
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      const cuerpo = (await respuesta.json()) as { distrito: number | null };
      setDistrito(cuerpo.distrito);
    } catch {
      setDistrito(null);
    } finally {
      setUbicando(false);
    }
  }

  /**
   * El submit decide: si todavia no se reviso, revisa; si ya se reviso, envia.
   *
   * El FormData se arma en la PRIMERA linea sincronica a proposito. React
   * recicla el evento apenas hay un await, y `evento.currentTarget` pasa a ser
   * null: cualquier lectura despues del primer await se pierde.
   */
  async function alEnviarFormulario(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);

    if (!punto || !distrito) {
      setEstado({
        tipo: "error",
        mensaje: "Marcá en el mapa dónde sería la obra, dentro del ejido municipal.",
      });
      return;
    }

    if (revision) await enviar(datos);
    else await revisar(datos, distrito);
  }

  /** Pide la revision al asistente. Nunca bloquea el envio: si falla, avisa. */
  async function revisar(datos: FormData, numeroDistrito: number) {
    setEstado({ tipo: "revisando" });
    try {
      const respuesta = await fetch("/api/ideas/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: datos.get("titulo"),
          categoria: datos.get("categoria"),
          barrio: datos.get("barrio") || null,
          problema: datos.get("problema"),
          solucion: datos.get("solucion"),
          beneficios: datos.get("beneficios") || null,
          distrito: numeroDistrito,
          // Ni nombre ni correo: el asistente no necesita saber quien escribe.
        }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(cuerpo?.error ?? "No se pudo revisar la idea.");
      }

      setRevision((await respuesta.json()) as RespuestaAsistente);
      setReescrituraAplicada(false);
      setEstado({ tipo: "editando" });
    } catch (causa) {
      // La revision es una ayuda, no un requisito: se deja pasar al envio.
      setRevision({
        modo: "basico",
        faltantes: [],
        parecidas: [],
        senalamientos: [],
        reescritura: null,
        aviso:
          causa instanceof Error
            ? causa.message
            : "No se pudo revisar la idea. Podés enviarla igual.",
      });
      setEstado({ tipo: "editando" });
    }
  }

  /** Escribe la reescritura en los campos. Solo se llama si la persona acepta. */
  function usarReescritura() {
    const propuesta = revision?.reescritura;
    if (!propuesta) return;
    if (refTitulo.current) refTitulo.current.value = propuesta.titulo;
    if (refProblema.current) refProblema.current.value = propuesta.problema;
    if (refSolucion.current) refSolucion.current.value = propuesta.solucion;
    if (refBeneficios.current && propuesta.beneficios) {
      refBeneficios.current.value = propuesta.beneficios;
    }
    setReescrituraAplicada(true);
  }

  async function enviar(datos: FormData) {
    if (!punto || !distrito) return;
    setEstado({ tipo: "enviando" });

    try {
      const respuesta = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: datos.get("titulo"),
          categoria: datos.get("categoria"),
          barrio: datos.get("barrio") || null,
          problema: datos.get("problema"),
          solucion: datos.get("solucion"),
          beneficios: datos.get("beneficios") || null,
          lat: punto.lat,
          lon: punto.lon,
          autorNombre: datos.get("autorNombre") || null,
          // Sin la casilla marcada el correo no viaja: no hay consentimiento.
          autorEmail: avisos ? datos.get("autorEmail") || null : null,
          autorAvisos: avisos,
        }),
      });

      const cuerpo = (await respuesta.json()) as {
        numero?: number;
        distrito?: number;
        codigo?: string;
        error?: string;
      };

      if (!respuesta.ok || !cuerpo.numero || !cuerpo.codigo) {
        throw new Error(cuerpo.error ?? "No se pudo enviar la idea.");
      }
      setEstado({
        tipo: "listo",
        numero: cuerpo.numero,
        distrito: cuerpo.distrito ?? distrito,
        codigo: cuerpo.codigo,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (causa) {
      setEstado({
        tipo: "error",
        mensaje: causa instanceof Error ? causa.message : "No se pudo enviar la idea.",
      });
    }
  }

  if (estado.tipo === "listo") {
    return (
      <div className="superficie mt-8 rounded-2xl p-8">
        <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
          Idea recibida
        </p>
        <h2 className="mt-2 text-2xl font-bold">Gracias por participar</h2>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed">
          Tu idea quedó registrada en el <strong>Distrito {estado.distrito}</strong>. El equipo del
          Presupuesto Participativo la va a revisar y evaluar técnicamente. Cuando esté publicada vas
          a poder verla en el listado de proyectos de tu distrito.
        </p>

        {/* Numero y codigo: los dos datos que se necesitan para el seguimiento. */}
        <div className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
          >
            <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
              Número de tu idea
            </p>
            <p className="mt-1 font-mono text-2xl font-bold">#{estado.numero}</p>
          </div>
          <div
            className="rounded-2xl px-5 py-4"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
              border: "1px solid var(--color-acento-600)",
            }}
          >
            <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
              Código de seguimiento
            </p>
            <p className="mt-1 font-mono text-2xl font-bold" style={{ letterSpacing: "0.12em" }}>
              {estado.codigo}
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-prose text-[0.9375rem] font-semibold leading-relaxed">
          Anotá los dos datos o sacale una foto a esta pantalla.
        </p>
        <p className="mt-1 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          El código no se vuelve a mostrar y no lo podés recuperar desde el sitio. Con el número y el
          código consultás cuando quieras en qué etapa está tu idea y leés la devolución del equipo,
          sin depender de que te escribamos.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/ideas/seguimiento"
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ background: "var(--color-marca-700)" }}
          >
            Seguir mi idea
          </a>
          <a
            href={`/distritos/${estado.distrito}`}
            className="superficie rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Ver el Distrito {estado.distrito}
          </a>
          <a
            href="/ideas/nueva"
            className="superficie rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Cargar otra idea
          </a>
        </div>
      </div>
    );
  }

  const enviando = estado.tipo === "enviando";
  const revisando = estado.tipo === "revisando";
  const ocupado = enviando || revisando;

  return (
    <form
      onSubmit={alEnviarFormulario}
      className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start"
    >
      {/* --- Ubicación ----------------------------------------------------- */}
      <section className="order-1 lg:order-2">
        <h2 className="text-lg font-bold">1. ¿Dónde sería?</h2>
        <p className="mt-1.5 text-sm" style={{ color: "var(--texto-suave)" }}>
          Tocá el mapa en el lugar de la obra. El distrito se completa solo.
        </p>
        <div className="mt-3">
          <Mapa
            modo="seleccionar"
            onSeleccionar={elegirPunto}
            puntoElegido={punto}
            distritoActivo={distrito ?? undefined}
            distritos={Array.from({ length: 20 }, (_, i) => ({
              numero: i + 1,
              nombre: `Distrito ${i + 1}`,
              ideas: 0,
              color: null,
              etiquetaGanador: null,
            }))}
            alto="24rem"
          />
        </div>

        <div
          className="mt-3 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "var(--fondo-suave)",
            border: `1px solid ${
              punto && !distrito && !ubicando ? "var(--color-acento-600)" : "var(--borde)"
            }`,
          }}
          aria-live="polite"
        >
          {!punto && "Todavía no marcaste el lugar."}
          {punto && ubicando && "Buscando el distrito…"}
          {punto && !ubicando && distrito && (
            <>
              Punto marcado en el <strong>Distrito {distrito}</strong>.{" "}
              <span style={{ color: "var(--texto-suave)" }}>
                {punto.lat.toFixed(5)}, {punto.lon.toFixed(5)}
              </span>
            </>
          )}
          {punto && !ubicando && !distrito && (
            <>Ese punto queda fuera de los 20 distritos de la ciudad. Probá marcar más cerca.</>
          )}
        </div>
      </section>

      {/* --- Contenido ----------------------------------------------------- */}
      <div className="order-2 space-y-6 lg:order-1">
        <section className="space-y-4">
          <h2 className="text-lg font-bold">2. Contanos tu idea</h2>

          <Campo etiqueta="Título de la idea" ayuda="Una línea que resuma la propuesta.">
            <input
              ref={refTitulo}
              name="titulo"
              required
              maxLength={LARGOS.titulo}
              disabled={!abierta || ocupado}
              placeholder="Puesta en valor de la plaza del barrio…"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          <Campo etiqueta="Categoría">
            <select
              name="categoria"
              required
              disabled={!abierta || ocupado}
              defaultValue=""
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
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
            <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--texto-suave)" }}>
              {categorias.map((categoria) => (
                <li key={categoria.slug}>
                  <strong>{categoria.nombre}:</strong> {categoria.descripcion}
                </li>
              ))}
            </ul>
          </Campo>

          <Campo etiqueta="Barrio" ayuda="Opcional, pero ayuda a ubicar la propuesta.">
            <input
              name="barrio"
              maxLength={120}
              disabled={!abierta || ocupado}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          <Campo
            etiqueta="¿Qué problema querés resolver?"
            ayuda="¿A quiénes afecta y cómo? Cuanto más concreto, mejor se puede evaluar."
          >
            <textarea
              ref={refProblema}
              name="problema"
              required
              rows={5}
              maxLength={LARGOS.problema}
              disabled={!abierta || ocupado}
              className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          <Campo etiqueta="¿Cómo lo resolverías?" ayuda="Describí la obra o la intervención que propones.">
            <textarea
              ref={refSolucion}
              name="solucion"
              required
              rows={5}
              maxLength={LARGOS.solucion}
              disabled={!abierta || ocupado}
              className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          <Campo
            etiqueta="Beneficios para el barrio"
            ayuda="Opcional. ¿Quiénes se benefician y de qué manera?"
          >
            <textarea
              ref={refBeneficios}
              name="beneficios"
              rows={3}
              maxLength={LARGOS.beneficios}
              disabled={!abierta || ocupado}
              className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold">3. Tus datos (opcionales)</h2>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Ninguno de estos datos se publica. Al enviar la idea te vamos a dar un{" "}
            <strong>código de seguimiento</strong>: con ese código y el número de tu idea podés ver
            cuando quieras cómo sigue, sin dejarnos ningún dato de contacto.
          </p>

          <Campo etiqueta="Tu nombre" ayuda="Opcional. Solo lo ve el equipo que evalúa la propuesta.">
            <input
              name="autorNombre"
              maxLength={120}
              disabled={!abierta || ocupado}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          {/* Consentimiento del correo: casilla desmarcada y finalidad declarada. */}
          <div
            className="rounded-xl px-4 py-4"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={avisos}
                onChange={(evento) => setAvisos(evento.target.checked)}
                disabled={!abierta || ocupado}
                className="mt-0.5"
              />
              <span className="text-sm font-medium">
                Quiero dejar mi correo para que me avisen cómo sigue mi idea.
              </span>
            </label>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              Lo usamos solo para contarte cómo sigue tu idea: no lo publicamos, no lo damos a nadie
              y no te vamos a mandar otra cosa. Es opcional, y{" "}
              <strong>no dar el correo no afecta la evaluación de tu propuesta</strong>: se evalúa
              igual. Podés pedir que lo borremos cuando quieras. Cómo tratamos tus datos está
              explicado en la{" "}
              <a href="/privacidad" className="underline">
                política de privacidad
              </a>
              .
            </p>

            {avisos && (
              <div className="mt-4">
                <Campo etiqueta="Correo electrónico">
                  <input
                    name="autorEmail"
                    type="email"
                    required
                    maxLength={160}
                    disabled={!abierta || ocupado}
                    placeholder="tunombre@ejemplo.com"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={campoEstilo}
                  />
                </Campo>
              </div>
            )}
          </div>
        </section>

        {estado.tipo === "error" && (
          <p
            role="alert"
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
              border: "1px solid var(--color-acento-600)",
            }}
          >
            {estado.mensaje}
          </p>
        )}

        {revision && (
          <PanelRevision
            revision={revision}
            reescrituraAplicada={reescrituraAplicada}
            onUsarReescritura={usarReescritura}
          />
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <button
            type="submit"
            disabled={!abierta || ocupado}
            className="w-full rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition disabled:opacity-50 sm:w-auto"
            style={{ background: "var(--color-acento-600)" }}
          >
            {revisando
              ? "Revisando…"
              : enviando
                ? "Enviando…"
                : revision
                  ? "Enviar mi idea"
                  : "Revisar mi idea"}
          </button>

          {/* Salida siempre disponible: la revision ayuda, no condiciona. */}
          {!revision && (
            <button
              type="button"
              disabled={!abierta || ocupado}
              onClick={(evento) => {
                const formulario = evento.currentTarget.form;
                if (formulario) void enviar(new FormData(formulario));
              }}
              className="text-sm underline disabled:opacity-50"
              style={{ color: "var(--texto-suave)" }}
            >
              Enviar sin revisar
            </button>
          )}
        </div>

        {!revision && !revisando && (
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Antes de enviar podemos revisar tu idea: te decimos qué le falta para que se entienda
            mejor y si ya hay una propuesta parecida en tu distrito. Después decidís vos.
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * Resultado de la revision. Todo lo que muestra es o determinístico (mínimos y
 * propuestas parecidas) o generado por el modelo, y en ese caso va dicho.
 */
function PanelRevision({
  revision,
  reescrituraAplicada,
  onUsarReescritura,
}: {
  revision: RespuestaAsistente;
  reescrituraAplicada: boolean;
  onUsarReescritura: () => void;
}) {
  const { faltantes, parecidas, senalamientos, reescritura, aviso } = revision;
  const todoBien =
    !faltantes.length && !parecidas.length && !senalamientos.length && !aviso;

  return (
    <section
      aria-live="polite"
      className="rounded-2xl p-5"
      style={{
        background: "var(--fondo-suave)",
        border: "1px solid var(--color-marca-600)",
      }}
    >
      <h3 className="text-base font-bold">Revisión de tu idea</h3>

      {todoBien && (
        <p className="mt-2 text-sm leading-relaxed">
          Tu propuesta se entiende y está completa. Podés enviarla.
        </p>
      )}

      {aviso && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {aviso}
        </p>
      )}

      {faltantes.length > 0 && (
        <ul className="mt-3 space-y-1.5 pl-4 text-sm">
          {faltantes.map((texto) => (
            <li key={texto} className="list-disc">
              {texto}
            </li>
          ))}
        </ul>
      )}

      {senalamientos.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold">Para que se entienda mejor:</p>
          <ul className="mt-1.5 space-y-1.5 pl-4 text-sm">
            {senalamientos.map((senalamiento, indice) => (
              <li key={indice} className="list-disc">
                {senalamiento.texto}
              </li>
            ))}
          </ul>
        </>
      )}

      {parecidas.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            Ya hay {parecidas.length === 1 ? "una propuesta parecida" : "propuestas parecidas"} en
            tu distrito
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Podés presentar la tuya igual. Si son lo mismo, el equipo las integra en un solo
            proyecto.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {parecidas.map((parecida, indice) => (
              <li key={indice}>
                {parecida.url && parecida.titulo ? (
                  <a
                    href={parecida.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    style={{ color: "var(--color-marca-600)" }}
                  >
                    {parecida.titulo}
                  </a>
                ) : (
                  <span style={{ color: "var(--texto-suave)" }}>
                    Una propuesta que todavía está en evaluación.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {reescritura && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Una forma de escribirlo</p>
          <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
            Generado por inteligencia artificial a partir de lo que escribiste, sin agregar datos
            nuevos. Es una sugerencia: si no te representa, dejá tu texto.
          </p>

          <div
            className="mt-3 space-y-3 rounded-xl p-4 text-sm leading-relaxed"
            style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
          >
            <p className="font-semibold">{reescritura.titulo}</p>
            <p>{reescritura.problema}</p>
            <p>{reescritura.solucion}</p>
            {reescritura.beneficios && <p>{reescritura.beneficios}</p>}
          </div>

          <button
            type="button"
            onClick={onUsarReescritura}
            disabled={reescrituraAplicada}
            className="mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60"
            style={{
              background: reescrituraAplicada ? "var(--fondo-suave)" : "var(--color-marca-700)",
              color: reescrituraAplicada ? "var(--texto-suave)" : "#fff",
              border: "1px solid var(--borde)",
            }}
          >
            {reescrituraAplicada ? "Texto aplicado ✓" : "Usar este texto"}
          </button>
          {reescrituraAplicada && (
            <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
              Quedó cargado en los campos de arriba. Podés seguir editándolo antes de enviar.
            </p>
          )}
        </div>
      )}

      {/* Cierra el panel entero, no solo la reescritura: el miedo razonable de
          quien lee una revision automatica es que la maquina este puntuando su
          idea, y el lugar para desmentirlo es el pie de la revision. */}
      <p
        className="mt-5 border-t pt-3 text-xs leading-relaxed"
        style={{ borderColor: "var(--borde)", color: "var(--texto-suave)" }}
      >
        Esta revisión la hace un asistente de inteligencia artificial y puede equivocarse.{" "}
        <strong>No evalúa tu propuesta ni decide si se publica</strong>: eso lo hace el equipo del
        programa, y podés enviarla igual sin aplicar ningún cambio.{" "}
        <a href="#aviso-ia" className="underline" style={{ color: "inherit" }}>
          Aviso legal
        </a>
      </p>
    </section>
  );
}

const campoEstilo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{etiqueta}</span>
      {ayuda && (
        <span className="mt-0.5 block text-xs" style={{ color: "var(--texto-suave)" }}>
          {ayuda}
        </span>
      )}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
