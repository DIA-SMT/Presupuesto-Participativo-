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
 * Hay DOS ayudas de inteligencia artificial, y hacen cosas distintas:
 *
 *  1. **Por campo, mientras escribe** (/api/ideas/redactar). Un boton al pie de
 *     cada campo largo. En `problema` y `solucion` la IA NO escribe desde cero:
 *     el boton recien se habilita cuando la persona escribio algo, y formaliza
 *     ESE texto. En `beneficios`, que es opcional, si puede redactarlo, pero
 *     deduciendolo del problema y la solucion que la persona ya escribio. El
 *     boton deshabilitado es comodidad: la regla de verdad la aplica el
 *     servidor con un 422 (ver el comentario de la ruta).
 *  2. **Al final, sobre la propuesta entera** (/api/ideas/asistente): senala lo
 *     que le falta y avisa si ya hay algo parecido en el distrito. NO reescribe
 *     nada, y eso es deliberado: ofrecia una reescritura completa que hacia el
 *     mismo trabajo que los botones por campo, peor (con su propio prompt, mas
 *     timido) y sin que la persona pudiera elegir campo por campo. Dos ofertas
 *     de lo mismo con distinta calidad en la misma pantalla. Quedo con lo que
 *     solo el puede hacer: mirar la propuesta completa y compararla con las
 *     demas del distrito.
 *
 * Ninguna de las dos es obligatoria. "Enviar sin revisar" esta siempre
 * disponible, los botones de ayuda se pueden ignorar, y si el modelo falla o no
 * hay clave el envio no se entera.
 *
 * Los campos siguen SIN ser controlados. Para poder aplicar un texto generado
 * alcanza con una referencia por campo y escribir su `.value`: el FormData del
 * envio lo levanta igual. Pasarlos a controlados habria sido rehacer el
 * formulario entero para no ganar nada. Lo unico que se sigue en estado es el
 * LARGO de los tres campos largos, que es lo que habilita cada boton de ayuda;
 * eso no vuelve controlado al campo, porque no le devolvemos el `value`.
 */
import { useEffect, useRef, useState } from "react";
import Mapa from "@/components/Mapa";
import type { RespuestaAsistente } from "@/app/api/ideas/asistente/route";
import type { RespuestaRedactar } from "@/app/api/ideas/redactar/route";

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

/** Los tres campos largos, los unicos con ayuda de redaccion. */
type CampoLargo = "problema" | "solucion" | "beneficios";

/**
 * Los mismos minimos que valida /api/ideas/redactar. Estan repetidos a
 * proposito y no importados: la ruta es codigo de servidor y traerla al
 * navegador arrastraria el cliente del modelo y la base. Si cambian alla,
 * cambian aca; el que manda es el servidor, esto solo evita el viaje.
 */
const MINIMO_PARA_FORMALIZAR = 15;
const MINIMO_DE_CONTEXTO = 25;

type EstadoAyuda =
  | { tipo: "quieto" }
  | { tipo: "pidiendo" }
  | {
      tipo: "propuesta";
      texto: string;
      modo: RespuestaRedactar["modo"];
      /** Aspectos de obra que se ofrecen para tildar. Solo en `solucion`. */
      detalles: string[];
    }
  | { tipo: "error"; mensaje: string };

const AYUDAS_QUIETAS: Record<CampoLargo, EstadoAyuda> = {
  problema: { tipo: "quieto" },
  solucion: { tipo: "quieto" },
  beneficios: { tipo: "quieto" },
};

/**
 * Como se llama cada campo EN PANTALLA.
 *
 * El asistente devuelve la clave de la columna (`problema`, `solucion`) y aca se
 * traduce a la pregunta que la persona tiene delante. Antes el modelo escribia
 * el nombre del campo dentro de la observacion y decia cosas como "no
 * completaste el campo de beneficios", una etiqueta que ya no existe en el
 * formulario. Ahora el modelo dice QUE falta y el formulario dice DONDE.
 */
const PREGUNTA_DEL_CAMPO: Record<string, string> = {
  solucion: "¿Qué querés proponer?",
  problema: "¿Por qué hace falta?",
  beneficios: "¿Quiénes se benefician?",
  titulo: "Título de la idea",
  categoria: "Categoría",
};

export default function FormularioIdea({
  categorias,
  abierta,
  conIA,
}: {
  categorias: Categoria[];
  abierta: boolean;
  /**
   * Si hay clave del modelo. Sin ella los botones de redaccion no se dibujan:
   * la regla del proyecto es que nada se rompe por falta de clave, y el aviso
   * legal ya promete que estas funciones "simplemente no aparecen".
   */
  conIA: boolean;
}) {
  const [punto, setPunto] = useState<{ lat: number; lon: number } | null>(null);
  const [distrito, setDistrito] = useState<number | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "editando" });
  /** Consentimiento para guardar el correo. Arranca en false, siempre. */
  const [avisos, setAvisos] = useState(false);

  /** Ultima revision del asistente, o null si todavia no se pidio ninguna. */
  const [revision, setRevision] = useState<RespuestaAsistente | null>(null);

  /** Estado de la ayuda de redaccion de cada campo largo. */
  const [ayudas, setAyudas] = useState<Record<CampoLargo, EstadoAyuda>>(AYUDAS_QUIETAS);
  /** Largo de cada campo largo: es lo que habilita o no cada boton de ayuda. */
  const [largos, setLargos] = useState<Record<CampoLargo, number>>({
    problema: 0,
    solucion: 0,
    beneficios: 0,
  });

  // Referencias a los campos de contenido: se leen para revisar y para armar el
  // contexto de la ayuda, y se escriben al aceptar un texto generado, sin
  // volver controlado el formulario.
  const refTitulo = useRef<HTMLInputElement>(null);
  const refCategoria = useRef<HTMLSelectElement>(null);
  const refBarrio = useRef<HTMLInputElement>(null);
  const refProblema = useRef<HTMLTextAreaElement>(null);
  const refSolucion = useRef<HTMLTextAreaElement>(null);
  const refBeneficios = useRef<HTMLTextAreaElement>(null);
  /**
   * El ultimo barrio que puso el mapa. Sirve para distinguir "esto lo completo
   * un clic" de "esto lo escribio la persona": si el valor del campo coincide
   * con esto, es nuestro y se puede reemplazar; si no, es suyo y no se toca.
   */
  const barrioPuesto = useRef<string | null>(null);
  /** Si el barrio del campo lo puso el mapa, para poder decirlo en pantalla. */
  const [barrioAutomatico, setBarrioAutomatico] = useState(false);
  const refDe: Record<CampoLargo, React.RefObject<HTMLTextAreaElement | null>> = {
    problema: refProblema,
    solucion: refSolucion,
    beneficios: refBeneficios,
  };

  /**
   * Al marcar un punto se le pregunta al servidor el distrito y el barrio.
   *
   * El barrio se AUTOCOMPLETA pero no se impone: solo se escribe si el campo
   * esta vacio o si lo habia puesto un clic anterior. Si la persona lo escribio
   * a mano, gana ella: conoce su barrio mejor que una capa de 2022, y contra las
   * ideas ya cargadas la capa acierta en 23 de 34 casos, no en todos.
   */
  async function elegirPunto(nuevo: { lat: number; lon: number }) {
    setPunto(nuevo);
    setDistrito(null);
    setUbicando(true);
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      const cuerpo = (await respuesta.json()) as {
        distrito: number | null;
        barrio: string | null;
      };
      setDistrito(cuerpo.distrito);

      const campo = refBarrio.current;
      const escritoAMano = campo && campo.value.trim() && campo.value !== barrioPuesto.current;
      if (campo && cuerpo.barrio && !escritoAMano) {
        campo.value = cuerpo.barrio;
        barrioPuesto.current = cuerpo.barrio;
        setBarrioAutomatico(true);
      }
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
      setEstado({ tipo: "editando" });
    } catch (causa) {
      // La revision es una ayuda, no un requisito: se deja pasar al envio.
      setRevision({
        modo: "basico",
        faltantes: [],
        parecidas: [],
        senalamientos: [],
        aviso:
          causa instanceof Error
            ? causa.message
            : "No se pudo revisar la idea. Podés enviarla igual.",
      });
      setEstado({ tipo: "editando" });
    }
  }

  /**
   * Pide a la IA el texto de UN campo. Nunca escribe sola: deja la propuesta a
   * la vista y la persona decide si la usa.
   */
  async function pedirAyuda(campo: CampoLargo, agregar?: string[]) {
    setAyudas((previo) => ({ ...previo, [campo]: { tipo: "pidiendo" } }));
    try {
      const respuesta = await fetch("/api/ideas/redactar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campo,
          titulo: refTitulo.current?.value || null,
          categoria: refCategoria.current?.value || null,
          barrio: refBarrio.current?.value || null,
          distrito,
          problema: refProblema.current?.value || null,
          solucion: refSolucion.current?.value || null,
          beneficios: refBeneficios.current?.value || null,
          // Los aspectos que la persona tildo, si volvio a pedir con alguno.
          ...(agregar?.length ? { agregar } : {}),
          // Ni nombre ni correo: para redactar no hace falta saber quien escribe.
        }),
      });

      const cuerpo = (await respuesta.json().catch(() => null)) as
        | (RespuestaRedactar & { error?: string })
        | null;

      if (!respuesta.ok || !cuerpo?.texto) {
        throw new Error(cuerpo?.error ?? "No se pudo generar el texto.");
      }

      setAyudas((previo) => ({
        ...previo,
        [campo]: {
          tipo: "propuesta",
          texto: cuerpo.texto,
          modo: cuerpo.modo,
          detalles: cuerpo.detalles ?? [],
        },
      }));
    } catch (causa) {
      setAyudas((previo) => ({
        ...previo,
        [campo]: {
          tipo: "error",
          mensaje:
            causa instanceof Error
              ? causa.message
              : "No se pudo generar el texto. Podés seguir escribiendo a mano.",
        },
      }));
    }
  }

  /** Pega el texto generado en el campo. Solo se llama si la persona acepta. */
  function usarAyuda(campo: CampoLargo, texto: string) {
    const campoDom = refDe[campo].current;
    if (campoDom) {
      campoDom.value = texto;
      setLargos((previo) => ({ ...previo, [campo]: texto.length }));
      campoDom.focus();
    }
    setAyudas((previo) => ({ ...previo, [campo]: { tipo: "quieto" } }));
  }

  function descartarAyuda(campo: CampoLargo) {
    setAyudas((previo) => ({ ...previo, [campo]: { tipo: "quieto" } }));
  }

  /** Un campo largo cambio: solo se anota el largo, el valor lo tiene el DOM. */
  function anotarLargo(campo: CampoLargo, valor: string) {
    setLargos((previo) =>
      previo[campo] === valor.trim().length
        ? previo
        : { ...previo, [campo]: valor.trim().length },
    );
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
              ref={refCategoria}
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

          <Campo
            etiqueta="Barrio"
            ayuda={
              barrioAutomatico
                ? "Lo completamos con el punto que marcaste en el mapa. Si no es ese, corregilo."
                : "Opcional. Se completa solo cuando marcás el lugar en el mapa."
            }
          >
            <input
              ref={refBarrio}
              name="barrio"
              maxLength={120}
              disabled={!abierta || ocupado}
              // Si lo edita a mano deja de ser nuestro y el mapa no lo pisa mas.
              onInput={() => setBarrioAutomatico(false)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          {/* La ayuda va FUERA del <Campo>: Campo es un <label>, y un <button>
              adentro de un label es contenido interactivo anidado, que roba el
              clic del campo etiquetado. El <div> mantiene al par junto pese al
              space-y de la seccion. */}
          {/*
            El orden de estas dos preguntas esta invertido respecto de las
            columnas de la base, y es a proposito (pedido de Lucas, 26/08/2026):
            la gente llega con "quiero una plaza", no con "el problema es la
            carencia de espacios verdes". Primero se le pregunta QUE quiere
            (columna `solucion`) y despues POR QUE hace falta (columna
            `problema`). Las columnas siguen significando lo mismo que siempre;
            lo unico que cambia es el orden en pantalla y como se pregunta.
          */}
          <div>
            <Campo
              etiqueta="¿Qué querés proponer?"
              ayuda="Contá qué obra o mejora querés para tu barrio. Con tus palabras alcanza."
            >
              <textarea
                ref={refSolucion}
                name="solucion"
                required
                rows={5}
                maxLength={LARGOS.solucion}
                disabled={!abierta || ocupado}
                placeholder="Una canchita para que los chicos jueguen…"
                onInput={(evento) => anotarLargo("solucion", evento.currentTarget.value)}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
            {conIA && (
              <AyudaDeRedaccion
                estado={ayudas.solucion}
                etiqueta="Formalizar con IA"
                habilitado={largos.solucion >= MINIMO_PARA_FORMALIZAR}
                motivo="Escribí qué querés, aunque sea corto y con errores, y la IA te lo ordena. No lo escribe por vos."
                deshabilitado={!abierta || ocupado}
                onPedir={() => void pedirAyuda("solucion")}
                onUsar={(texto) => usarAyuda("solucion", texto)}
                onDescartar={() => descartarAyuda("solucion")}
                onAgregar={(detalles) => void pedirAyuda("solucion", detalles)}
              />
            )}
          </div>

          <div>
            <Campo
              etiqueta="¿Por qué hace falta?"
              ayuda="¿Qué pasa hoy en el barrio? ¿A quiénes afecta?"
            >
              <textarea
                ref={refProblema}
                name="problema"
                required
                rows={5}
                maxLength={LARGOS.problema}
                disabled={!abierta || ocupado}
                placeholder="Hoy no hay ningún lugar donde jugar…"
                onInput={(evento) => anotarLargo("problema", evento.currentTarget.value)}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
            {conIA && (
              <AyudaDeRedaccion
                estado={ayudas.problema}
                etiqueta="Formalizar con IA"
                habilitado={largos.problema >= MINIMO_PARA_FORMALIZAR}
                motivo="Escribí unas palabras, aunque sea corto y con errores, y la IA te lo ordena. No lo escribe por vos."
                deshabilitado={!abierta || ocupado}
                onPedir={() => void pedirAyuda("problema")}
                onUsar={(texto) => usarAyuda("problema", texto)}
                onDescartar={() => descartarAyuda("problema")}
              />
            )}
          </div>

          {/*
            El unico campo donde la IA puede escribir con el campo vacio, porque
            es opcional y porque no lo saca de la nada: lo deduce del problema y
            la solucion que la persona ya escribio. De ahi que el boton pida esos
            dos campos y no este.
          */}
          <div>
            <Campo
              etiqueta="¿Quiénes se benefician?"
              ayuda="Opcional. La IA puede escribirlo a partir de lo que contaste arriba."
            >
              <textarea
                ref={refBeneficios}
                name="beneficios"
                rows={3}
                maxLength={LARGOS.beneficios}
                disabled={!abierta || ocupado}
                onInput={(evento) => anotarLargo("beneficios", evento.currentTarget.value)}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
            {conIA && (
              <AyudaDeRedaccion
                estado={ayudas.beneficios}
                etiqueta={largos.beneficios > 0 ? "Completar con IA" : "Redactar con IA"}
                habilitado={
                  largos.problema >= MINIMO_DE_CONTEXTO &&
                  largos.solucion >= MINIMO_DE_CONTEXTO
                }
                motivo="Completá antes el problema y la solución: los beneficios salen de ahí."
                deshabilitado={!abierta || ocupado}
                onPedir={() => void pedirAyuda("beneficios")}
                onUsar={(texto) => usarAyuda("beneficios", texto)}
                onDescartar={() => descartarAyuda("beneficios")}
              />
            )}
          </div>
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
 * La ayuda de redaccion de un campo: el boton, y lo que la IA devolvio.
 *
 * Dos decisiones que valen para los tres campos:
 *
 *  1. **Nunca escribe sola.** El texto generado aparece en un recuadro aparte y
 *     el campo no se toca hasta que la persona aprieta "Usar este texto". Lo
 *     que se manda al municipio no puede haber aparecido sin que lo vea.
 *  2. **Cuando el boton esta bloqueado, dice por que.** Un boton gris sin
 *     explicacion se lee como que la funcion esta rota. El motivo ocupa el
 *     lugar del boton y desaparece cuando se habilita.
 */
function AyudaDeRedaccion({
  estado,
  etiqueta,
  habilitado,
  motivo,
  deshabilitado,
  onPedir,
  onUsar,
  onDescartar,
  onAgregar,
}: {
  estado: EstadoAyuda;
  /** Que dice el boton. Cambia segun el campo tenga texto o no. */
  etiqueta: string;
  /** Si la persona ya escribio lo suficiente como para que la IA ayude. */
  habilitado: boolean;
  /** Que le falta, cuando `habilitado` es false. */
  motivo: string;
  /** El formulario esta cerrado u ocupado: nada de esto se puede tocar. */
  deshabilitado: boolean;
  onPedir: () => void;
  onUsar: (texto: string) => void;
  onDescartar: () => void;
  /** Rehace el texto incluyendo los aspectos tildados. Solo en `solucion`. */
  onAgregar?: (detalles: string[]) => void;
}) {
  const pidiendo = estado.tipo === "pidiendo";
  const [tildados, setTildados] = useState<string[]>([]);
  const propuesta = estado.tipo === "propuesta" ? estado.texto : null;

  // Cada propuesta nueva empieza con las casillas limpias: las de la anterior
  // ya se incorporaron al texto, y dejarlas tildadas invitaria a agregarlas
  // dos veces.
  useEffect(() => setTildados([]), [propuesta]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={onPedir}
          disabled={deshabilitado || !habilitado || pidiendo}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-45"
          style={{
            background: "var(--fondo-tarjeta)",
            border: "1px solid var(--borde-control)",
            color: "var(--color-marca-700)",
          }}
        >
          <IconoChispa />
          {pidiendo ? "Escribiendo…" : etiqueta}
        </button>

        {!habilitado && !deshabilitado && (
          <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
            {motivo}
          </span>
        )}
      </div>

      {estado.tipo === "error" && (
        <p
          role="alert"
          className="mt-2 rounded-xl px-3 py-2 text-xs leading-relaxed"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-acento-600) 35%, transparent)",
          }}
        >
          {estado.mensaje}
        </p>
      )}

      {estado.tipo === "propuesta" && (
        <div
          aria-live="polite"
          className="mt-2 rounded-xl p-3.5"
          style={{
            background: "var(--fondo-tarjeta)",
            border: "1px solid var(--color-marca-600)",
          }}
        >
          <p className="text-xs font-semibold">
            {estado.modo === "redactado"
              ? "Escrito a partir de tu problema y tu solución"
              : "Tu texto, ordenado"}
          </p>
          <p
            className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed"
            style={{ color: "var(--texto)" }}
          >
            {estado.texto}
          </p>

          {/*
            Los aspectos de obra. Van como casillas y NO dentro del texto: es la
            unica via por la que aparece vocabulario tecnico que la persona no
            escribio, y lo que la hace legitima es que lo elige ella. El por que
            esta en src/lib/redaccion-prompts.ts.
          */}
          {onAgregar && estado.detalles.length > 0 && (
            <div
              className="mt-3 rounded-xl p-3"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
            >
              <p className="text-xs font-semibold">
                ¿Querés agregar alguno de estos? Los elegís vos
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
                Son cosas que el municipio suele pedir para una obra así y que no escribiste. Tildá
                solo las que quieras.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                {estado.detalles.map((detalle) => (
                  <label key={detalle} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={tildados.includes(detalle)}
                      onChange={(evento) =>
                        setTildados((previo) =>
                          evento.target.checked
                            ? [...previo, detalle]
                            : previo.filter((d) => d !== detalle),
                        )
                      }
                    />
                    {detalle}
                  </label>
                ))}
              </div>
              {tildados.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAgregar(tildados)}
                  className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{
                    background: "var(--fondo-tarjeta)",
                    border: "1px solid var(--borde-control)",
                    color: "var(--color-marca-700)",
                  }}
                >
                  Agregar {tildados.length === 1 ? "lo elegido" : `los ${tildados.length} elegidos`}
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onUsar(estado.texto)}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Usar este texto
            </button>
            <button
              type="button"
              onClick={onDescartar}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                background: "var(--fondo-suave)",
                border: "1px solid var(--borde)",
                color: "var(--texto-suave)",
              }}
            >
              Dejar el mío
            </button>
          </div>

          <p className="mt-2.5 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Lo escribió un asistente de inteligencia artificial a partir de lo que cargaste, sin
            agregar datos nuevos. Puede equivocarse: leelo antes de usarlo y editalo si hace falta.{" "}
            <a href="#aviso-ia" className="underline" style={{ color: "inherit" }}>
              Aviso legal
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

/** Chispas: el gesto ya convencional de "esto lo hace la IA". */
function IconoChispa() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M18 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </svg>
  );
}

/**
 * Resultado de la revision. Todo lo que muestra es o determinístico (mínimos y
 * propuestas parecidas) o generado por el modelo, y en ese caso va dicho.
 */
function PanelRevision({
  revision,
}: {
  revision: RespuestaAsistente;
}) {
  const { modo, faltantes, parecidas, senalamientos, aviso } = revision;
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
          {/* La pregunta la pone el formulario, no el modelo: asi el nombre que
              lee la persona es siempre el que tiene arriba en la pantalla, y no
              depende de que el modelo lo escriba bien. */}
          <ul className="mt-1.5 space-y-1.5 pl-4 text-sm">
            {senalamientos.map((senalamiento, indice) => (
              <li key={indice} className="list-disc">
                {PREGUNTA_DEL_CAMPO[senalamiento.campo] && (
                  <span className="font-semibold">
                    {PREGUNTA_DEL_CAMPO[senalamiento.campo]}:{" "}
                  </span>
                )}
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

      {/* Cierra el panel entero: el miedo razonable de
          quien lee una revision automatica es que la maquina este puntuando su
          idea, y el lugar para desmentirlo es el pie de la revision.

          Solo en modo "ia". En modo "basico" no intervino ningun modelo (los
          minimos y las propuestas parecidas se calculan con codigo comun), y
          decir que reviso una IA seria atribuirle algo que no hizo: exactamente
          el tipo de afirmacion que este pie existe para evitar. */}
      {modo === "ia" ? (
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
      ) : (
        <p
          className="mt-5 border-t pt-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--borde)", color: "var(--texto-suave)" }}
        >
          Esta revisión son chequeos automáticos sobre lo que cargaste, sin inteligencia
          artificial. <strong>No evalúa tu propuesta ni decide si se publica</strong>: eso lo hace
          el equipo del programa, y podés enviarla igual sin cambiar nada.
        </p>
      )}
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
