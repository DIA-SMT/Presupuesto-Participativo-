"use client";

/**
 * Widget de consultas.
 *
 * El texto que llega del modelo se renderiza construyendo elementos de React a
 * partir de un markdown muy reducido (negritas, listas y enlaces internos). No
 * se usa dangerouslySetInnerHTML en ningun punto: la respuesta de un modelo es
 * contenido no confiable y no debe poder inyectar HTML en la pagina.
 *
 * El widget se puede mover: estaba fijo abajo a la derecha y tapaba contenido
 * (en el panel de administracion, justo los botones de las fichas). El lanzador
 * cerrado y la cabecera del panel abierto son zonas de agarre; el resto del
 * panel no arrastra, asi que escribir y scrollear la conversacion siguen igual.
 * Toda la mecanica vive en usar-arrastre.ts, que tambien explica que se hace en
 * pantallas angostas y con prefers-reduced-motion.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { rutaInterna } from "@/lib/chat-enlaces";
import { historialParaEnviar } from "@/lib/chat-historial";
import { usarArrastre } from "./usar-arrastre";

type Referencia = { titulo: string; url: string };

/** Quien escribio una respuesta. Lo dice el evento `fin` del servidor. */
type Modo = "ia" | "buscador";

type Mensaje = {
  rol: "usuario" | "asistente";
  texto: string;
  referencias?: Referencia[];
  error?: boolean;
  /** Decide que dice el pie del panel. Ver `PIE`. */
  modo?: Modo;
  /**
   * La firma que el servidor le puso a la respuesta (src/lib/chat-firma.ts).
   * Sin ella la respuesta no viaja como contexto de la pregunta siguiente.
   */
  firma?: string;
};

/**
 * El pie del panel, segun quien contesto la ultima respuesta.
 *
 * Decia "generadas con inteligencia artificial" siempre, tambien cuando
 * respondia el buscador (sin clave, con el tope del dia pasado o con el
 * proveedor caido): el aviso que tiene que estar a la vista al decidir si
 * creerle a una respuesta decia algo falso sobre esa respuesta. Antes de la
 * primera respuesta no se sabe quien va a contestar, y el pie lo dice asi.
 */
const PIE: Record<Modo | "sin-respuestas", string> = {
  ia: "Respuestas generadas con inteligencia artificial sobre los datos publicados. Pueden tener errores y no son una respuesta oficial del municipio.",
  buscador:
    "Respuestas del buscador del sitio, armadas con los datos publicados y sin inteligencia artificial. No son una respuesta oficial del municipio.",
  "sin-respuestas":
    "Las respuestas salen de los datos publicados y pueden estar generadas con inteligencia artificial: pueden tener errores y no son una respuesta oficial del municipio.",
};

const SIN_RESPUESTA = "No llegó ninguna respuesta. Probá de nuevo.";

const SUGERENCIAS = [
  "¿Qué ganó en mi distrito?",
  "¿Cómo presento una idea?",
  "Proyectos de plazas y espacios verdes",
  "¿Cuántas ideas se presentaron?",
];

const CLAVE_SESION = "pp-chat";
/** Donde queda la posicion elegida. La conversacion vive en sessionStorage; el
 *  lugar del widget en localStorage, porque es una preferencia y se recuerda
 *  entre visitas. */
const CLAVE_POSICION = "pp-chat-posicion";
/** Instrucciones para lector de pantalla, compartidas por las dos zonas de agarre. */
const ID_AYUDA_MOVER = "pp-chat-ayuda-mover";

export default function Chat({ bienvenida }: { bienvenida: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [borrador, setBorrador] = useState("");
  const [cargando, setCargando] = useState(false);
  const [herramienta, setHerramienta] = useState<string | null>(null);

  const fin = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const abortar = useRef<AbortController | null>(null);

  // El lanzador y el panel se mueven juntos: los dos se registran en el hook,
  // que mide la caja de los dos para no dejar nada fuera de la pantalla.
  const arrastre = usarArrastre({ clave: CLAVE_POSICION, abierto });

  // Recupera la conversacion al volver a abrir el sitio en la misma pestaña.
  // Lo guardado se filtra: una version anterior del widget dejaba globos vacios
  // y el servidor rechazaba la conversacion entera por uno de ellos.
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_SESION);
      if (guardado) setMensajes(leerGuardados(JSON.parse(guardado)));
    } catch {
      // sessionStorage puede estar bloqueado: no es critico.
    }
  }, []);

  useEffect(() => {
    try {
      // El globo vacio de una respuesta en curso no se guarda: si la pestaña se
      // cierra antes de que llegue, quedaria vacio para siempre.
      const guardables = mensajes.filter((m) => m.texto.trim());
      if (guardables.length) {
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify(guardables.slice(-12)));
      }
    } catch {
      /* sin persistencia */
    }
  }, [mensajes]);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes, cargando, herramienta]);

  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [abierto]);

  async function enviar(texto: string) {
    const consulta = texto.trim();
    if (!consulta || cargando) return;

    const historial: Mensaje[] = [...mensajes, { rol: "usuario", texto: consulta }];
    setMensajes([...historial, { rol: "asistente", texto: "" }]);
    setBorrador("");
    setCargando(true);
    setHerramienta(null);

    abortar.current?.abort();
    const controlador = new AbortController();
    abortar.current = controlador;

    try {
      const respuesta = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controlador.signal,
        // Sin vacios, sin avisos de error y sin respuestas que el servidor no
        // firmo: el mismo criterio con el que el servidor recorta.
        body: JSON.stringify({ mensajes: historialParaEnviar(historial) }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(cuerpo?.error ?? "No se pudo consultar en este momento.");
      }
      if (!respuesta.body) throw new Error("Respuesta vacía del servidor.");

      const lector = respuesta.body.getReader();
      const decodificador = new TextDecoder();
      let resto = "";

      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += decodificador.decode(value, { stream: true });

        const bloques = resto.split("\n\n");
        resto = bloques.pop() ?? "";

        for (const bloque of bloques) {
          const linea = bloque.split("\n").find((l) => l.startsWith("data: "));
          if (!linea) continue;
          const evento = JSON.parse(linea.slice(6));

          if (evento.tipo === "texto") {
            setMensajes((previos) => reemplazarUltimo(previos, (m) => ({
              ...m,
              texto: m.texto + evento.delta,
            })));
            setHerramienta(null);
          } else if (evento.tipo === "herramienta") {
            setHerramienta(evento.nombre);
          } else if (evento.tipo === "referencias") {
            setMensajes((previos) =>
              reemplazarUltimo(previos, (m) => ({ ...m, referencias: evento.items })),
            );
          } else if (evento.tipo === "descartar") {
            // El proveedor fallo a mitad de la respuesta: lo que sigue es la del
            // buscador, entera, y reemplaza a lo que se venia mostrando.
            setMensajes((previos) =>
              reemplazarUltimo(previos, (m) => ({ ...m, texto: "", referencias: undefined })),
            );
          } else if (evento.tipo === "fin") {
            setMensajes((previos) =>
              reemplazarUltimo(previos, (m) => ({
                ...m,
                modo: evento.modo === "buscador" ? "buscador" : "ia",
                firma: typeof evento.firma === "string" ? evento.firma : undefined,
              })),
            );
          } else if (evento.tipo === "error") {
            setMensajes((previos) =>
              reemplazarUltimo(previos, (m) => ({
                ...m,
                texto: m.texto || evento.mensaje,
                error: true,
              })),
            );
          }
        }
      }

      // Un stream que termina sin texto ni error dejaba el globo vacio. Ahora
      // dice que no llego nada, y como aviso de error no viaja como contexto.
      setMensajes((previos) =>
        reemplazarUltimo(previos, (m) =>
          m.texto.trim() ? m : { ...m, texto: SIN_RESPUESTA, error: true },
        ),
      );
    } catch (causa) {
      if (causa instanceof DOMException && causa.name === "AbortError") {
        // Si la corto una consulta nueva, el ultimo globo es el de la nueva.
        if (abortar.current !== controlador) return;
        // Se corto a proposito: el globo que quedo esperando no tiene que quedar.
        setMensajes((previos) => {
          const ultimo = previos.at(-1);
          return ultimo?.rol === "asistente" && !ultimo.texto.trim()
            ? previos.slice(0, -1)
            : previos;
        });
        return;
      }
      setMensajes((previos) =>
        reemplazarUltimo(previos, (m) => ({
          ...m,
          texto:
            m.texto ||
            (causa instanceof Error ? causa.message : "No se pudo consultar en este momento."),
          error: true,
        })),
      );
    } finally {
      setCargando(false);
      setHerramienta(null);
    }
  }

  return (
    <>
      {/* Una sola explicacion para las dos zonas de agarre: las dos la apuntan
          con aria-describedby, asi que el lector de pantalla la lee al enfocar. */}
      <p id={ID_AYUDA_MOVER} className="sr-only">
        Podés mover el chat de consultas: arrastralo desde acá, o con este control enfocado usá las
        flechas del teclado (con Shift, pasos más grandes) y la tecla Inicio para devolverlo a su
        lugar.
      </p>

      <button
        type="button"
        ref={arrastre.registrar}
        {...arrastre.propsAgarre}
        onClick={() => {
          // Si el gesto fue un arrastre no abre ni cierra: el umbral del hook ya
          // distinguio el clic del movimiento.
          if (arrastre.fueArrastre()) return;
          setAbierto((v) => !v);
        }}
        aria-expanded={abierto}
        aria-controls="pp-chat-panel"
        aria-label={abierto ? "Cerrar las consultas" : "Consultas"}
        aria-describedby={ID_AYUDA_MOVER}
        title="Arrastrame para moverme"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus-visible:outline-offset-4"
        style={{
          background: "var(--color-marca-700)",
          ...arrastre.estiloMovil,
          ...arrastre.estiloAgarre,
        }}
      >
        <span className="opacity-60" aria-hidden="true">
          <IconoAgarre />
        </span>
        <IconoChat />
        <span className="hidden sm:inline">{abierto ? "Cerrar" : "Consultas"}</span>
      </button>

      {abierto && (
        <div
          id="pp-chat-panel"
          ref={arrastre.registrar}
          role="dialog"
          aria-modal="false"
          aria-label="Consultas sobre el Presupuesto Participativo"
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[min(34rem,78vh)] flex-col overflow-hidden rounded-2xl shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[26rem]"
          style={{
            background: "var(--fondo-tarjeta)",
            border: "1px solid var(--borde)",
            ...arrastre.estiloMovil,
          }}
        >
          <header
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--borde)" }}
          >
            {/* Zona de agarre del panel abierto: el asa y el titulo. El boton de
                limpiar queda afuera, y el resto del panel tampoco arrastra. Las
                teclas del asa llegan hasta aca por burbujeo. */}
            <div
              {...arrastre.propsAgarre}
              style={arrastre.estiloAgarre}
              className="-my-1 flex min-w-0 flex-1 items-center gap-2 py-1"
            >
              <button
                type="button"
                aria-label="Mover el chat de consultas"
                aria-describedby={ID_AYUDA_MOVER}
                title="Arrastrá para mover el chat; con el teclado, las flechas"
                className="shrink-0 rounded-lg p-1 opacity-60 transition hover:opacity-100"
                style={{ color: "var(--texto-suave)", cursor: "inherit" }}
              >
                <IconoAgarre />
              </button>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Consultas</p>
                <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                  Sobre proyectos, distritos y cómo participar
                </p>
              </div>
            </div>
            {mensajes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMensajes([]);
                  try {
                    sessionStorage.removeItem(CLAVE_SESION);
                  } catch {
                    /* sin persistencia */
                  }
                }}
                className="shrink-0 rounded-lg px-2 py-1 text-xs underline"
                style={{ color: "var(--texto-suave)" }}
              >
                Limpiar
              </button>
            )}
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {mensajes.length === 0 && (
              <>
                <Burbuja rol="asistente">{renderizar(bienvenida)}</Burbuja>
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGERENCIAS.map((sugerencia) => (
                    <button
                      key={sugerencia}
                      type="button"
                      onClick={() => enviar(sugerencia)}
                      className="rounded-full px-3 py-1.5 text-xs transition hover:brightness-95"
                      style={{
                        background: "var(--fondo-suave)",
                        border: "1px solid var(--borde)",
                      }}
                    >
                      {sugerencia}
                    </button>
                  ))}
                </div>
              </>
            )}

            {mensajes.map((mensaje, indice) => (
              <Burbuja key={indice} rol={mensaje.rol} error={mensaje.error}>
                {mensaje.texto ? (
                  renderizar(mensaje.texto)
                ) : cargando && indice === mensajes.length - 1 ? (
                  <Escribiendo herramienta={herramienta} />
                ) : null}
                {referenciasInternas(mensaje.referencias).length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {referenciasInternas(mensaje.referencias).map((referencia) => (
                      <a
                        key={referencia.url}
                        href={referencia.url}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium underline decoration-dotted"
                        style={{
                          background: "var(--fondo-suave)",
                          border: "1px solid var(--borde)",
                        }}
                      >
                        {referencia.titulo}
                      </a>
                    ))}
                  </div>
                ) : null}
              </Burbuja>
            ))}
            <div ref={fin} />
          </div>

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              enviar(borrador);
            }}
            className="flex items-end gap-2 px-3 py-3"
            style={{ borderTop: "1px solid var(--borde)" }}
          >
            <label className="sr-only" htmlFor="pp-chat-campo">
              Escribí tu consulta
            </label>
            <textarea
              id="pp-chat-campo"
              ref={campo}
              rows={1}
              value={borrador}
              maxLength={800}
              placeholder="Escribí tu consulta…"
              onChange={(evento) => setBorrador(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter" && !evento.shiftKey) {
                  evento.preventDefault();
                  enviar(borrador);
                }
              }}
              className="max-h-24 flex-1 resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: "var(--fondo-suave)",
                border: "1px solid var(--borde)",
                color: "var(--texto)",
              }}
            />
            <button
              type="submit"
              disabled={cargando || !borrador.trim()}
              className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: "var(--color-marca-700)" }}
            >
              Enviar
            </button>
          </form>

          {/* La advertencia va aca abajo, no en la bienvenida: la bienvenida se
              lee una vez y despues sube y se pierde, y este aviso tiene que
              estar a la vista en el momento en que la persona decide creerle a
              una respuesta. El enlace apunta al bloque de IA del aviso legal
              (#aviso-ia: la ventana del pie escucha ese hash, se abre y
              scrollea hasta el bloque) y cierra el panel del chat, que si no
              queda abajo de la ventana. El texto depende de quien contesto la
              ultima respuesta (ver PIE). */}
          <p
            className="px-4 pb-3 text-center text-[0.6875rem] leading-snug"
            style={{ color: "var(--texto-suave)" }}
          >
            {PIE[modoDelPie(mensajes)]}{" "}
            <a
              href="#aviso-ia"
              onClick={() => setAbierto(false)}
              className="underline"
              style={{ color: "inherit" }}
            >
              Aviso legal
            </a>
          </p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function reemplazarUltimo(
  mensajes: Mensaje[],
  transformar: (mensaje: Mensaje) => Mensaje,
): Mensaje[] {
  if (!mensajes.length) return mensajes;
  const copia = [...mensajes];
  copia[copia.length - 1] = transformar(copia[copia.length - 1]);
  return copia;
}

/**
 * Lo que se recupera de sessionStorage, validado mensaje por mensaje. Es texto
 * que cualquier script de la pagina o una version vieja del widget pudo
 * escribir: lo que no tiene la forma esperada, o no tiene texto, no entra.
 */
function leerGuardados(crudo: unknown): Mensaje[] {
  if (!Array.isArray(crudo)) return [];
  const mensajes: Mensaje[] = [];
  for (const item of crudo as unknown[]) {
    if (!item || typeof item !== "object") continue;
    const m = item as Record<string, unknown>;
    if ((m.rol !== "usuario" && m.rol !== "asistente") || typeof m.texto !== "string") continue;
    if (!m.texto.trim()) continue;
    mensajes.push({
      rol: m.rol,
      texto: m.texto,
      error: m.error === true || undefined,
      modo: m.modo === "ia" || m.modo === "buscador" ? m.modo : undefined,
      firma: typeof m.firma === "string" ? m.firma : undefined,
      referencias: Array.isArray(m.referencias)
        ? (m.referencias as unknown[]).filter(
            (r): r is Referencia =>
              Boolean(r) &&
              typeof (r as Referencia).titulo === "string" &&
              typeof (r as Referencia).url === "string",
          )
        : undefined,
    });
  }
  return mensajes;
}

/** Quien contesto la ultima respuesta que lo dijo. Los avisos de error no lo dicen. */
function modoDelPie(mensajes: Mensaje[]): Modo | "sin-respuestas" {
  for (let i = mensajes.length - 1; i >= 0; i -= 1) {
    const modo = mensajes[i].modo;
    if (mensajes[i].rol === "asistente" && modo) return modo;
  }
  return "sin-respuestas";
}

/**
 * Las referencias vienen de las herramientas del servidor, no del texto del
 * modelo, pero pasan por sessionStorage: se les aplica el mismo filtro que a
 * los enlaces de la respuesta.
 */
function referenciasInternas(referencias: Referencia[] | undefined): Referencia[] {
  return (referencias ?? []).filter((r) => rutaInterna(r.url) !== null);
}

function Burbuja({
  rol,
  error,
  children,
}: {
  rol: "usuario" | "asistente";
  error?: boolean;
  children: ReactNode;
}) {
  const propio = rol === "usuario";
  return (
    <div className={propio ? "flex justify-end" : "flex justify-start"}>
      <div
        className="max-w-[92%] rounded-2xl px-3.5 py-2.5 leading-relaxed"
        style={
          propio
            ? { background: "var(--color-marca-700)", color: "#fff" }
            : {
                background: "var(--fondo-suave)",
                border: `1px solid ${error ? "var(--color-acento-600)" : "var(--borde)"}`,
              }
        }
      >
        {children}
      </div>
    </div>
  );
}

const NOMBRE_HERRAMIENTA: Record<string, string> = {
  buscar_proyectos: "Buscando proyectos",
  detalle_proyecto: "Leyendo el proyecto",
  resumen_distrito: "Revisando el distrito",
  ubicar_barrio: "Ubicando el barrio",
  estadisticas: "Sacando los totales",
};

function Escribiendo({ herramienta }: { herramienta: string | null }) {
  return (
    <p className="flex items-center gap-2 text-xs" style={{ color: "var(--texto-suave)" }}>
      <span className="inline-flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full"
            style={{
              background: "var(--texto-suave)",
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </span>
      {herramienta ? `${NOMBRE_HERRAMIENTA[herramienta] ?? "Consultando"}…` : "Pensando…"}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Markdown reducido: parrafos, listas, negritas y enlaces internos.
// ---------------------------------------------------------------------------

function renderizar(texto: string): ReactNode {
  const bloques: ReactNode[] = [];
  const lineas = texto.split("\n");
  let lista: ReactNode[] = [];

  const cerrarLista = () => {
    if (!lista.length) return;
    bloques.push(
      <ul key={`ul-${bloques.length}`} className="my-1.5 space-y-1 pl-4">
        {lista.map((item, i) => (
          <li key={i} className="list-disc">
            {item}
          </li>
        ))}
      </ul>,
    );
    lista = [];
  };

  for (const linea of lineas) {
    const item = linea.match(/^\s*[-*•]\s+(.*)$/);
    if (item) {
      lista.push(enLinea(item[1]));
      continue;
    }
    cerrarLista();
    if (!linea.trim()) continue;
    bloques.push(
      <p key={`p-${bloques.length}`} className="my-1.5 first:mt-0 last:mb-0">
        {enLinea(linea)}
      </p>,
    );
  }
  cerrarLista();
  return bloques;
}

/**
 * Negritas y enlaces. Solo se permiten rutas internas del sitio, y el patron no
 * alcanza para decidirlo: "//otro.com" tambien empieza con "/" y el navegador
 * lo abre en otro dominio. Lo decide `rutaInterna` (src/lib/chat-enlaces.ts);
 * un enlace que no pasa queda como su texto, sin la url.
 */
function enLinea(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const patron = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)|(https?:\/\/\S+)/g;
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(texto)) !== null) {
    if (coincidencia.index > ultimo) {
      partes.push(texto.slice(ultimo, coincidencia.index));
    }
    if (coincidencia[1]) {
      partes.push(<strong key={partes.length}>{coincidencia[1]}</strong>);
    } else if (coincidencia[2] && coincidencia[3]) {
      const destino = rutaInterna(coincidencia[3]);
      partes.push(
        destino ? (
          <a
            key={partes.length}
            href={destino}
            className="font-medium underline"
            style={{ color: "var(--marca-texto)" }}
          >
            {coincidencia[2]}
          </a>
        ) : (
          coincidencia[2]
        ),
      );
    } else if (coincidencia[4]) {
      // Una url externa se muestra como texto: el asistente no deberia
      // proponer salir del sitio, y asi no se convierte en un enlace clickeable.
      partes.push(coincidencia[4]);
    }
    ultimo = patron.lastIndex;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

/**
 * Asa de arrastre: los seis puntos de siempre. Es el unico adorno nuevo del
 * widget y usa currentColor, asi que hereda el color de donde este (blanco en el
 * lanzador, --texto-suave en la cabecera) y no suma colores al tema.
 */
function IconoAgarre() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <circle cx="3" cy={y} r="1.3" />
          <circle cx="7" cy={y} r="1.3" />
        </g>
      ))}
    </svg>
  );
}

function IconoChat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
