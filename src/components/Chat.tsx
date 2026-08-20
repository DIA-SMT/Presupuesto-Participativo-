"use client";

/**
 * Widget de consultas.
 *
 * El texto que llega del modelo se renderiza construyendo elementos de React a
 * partir de un markdown muy reducido (negritas, listas y enlaces internos). No
 * se usa dangerouslySetInnerHTML en ningun punto: la respuesta de un modelo es
 * contenido no confiable y no debe poder inyectar HTML en la pagina.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

type Referencia = { titulo: string; url: string };

type Mensaje = {
  rol: "usuario" | "asistente";
  texto: string;
  referencias?: Referencia[];
  error?: boolean;
};

const SUGERENCIAS = [
  "¿Qué ganó en mi distrito?",
  "¿Cómo presento una idea?",
  "Proyectos de plazas y espacios verdes",
  "¿Cuántas ideas se presentaron?",
];

const CLAVE_SESION = "pp-chat";

export default function Chat({ bienvenida }: { bienvenida: string }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [borrador, setBorrador] = useState("");
  const [cargando, setCargando] = useState(false);
  const [herramienta, setHerramienta] = useState<string | null>(null);

  const fin = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const abortar = useRef<AbortController | null>(null);

  // Recupera la conversacion al volver a abrir el sitio en la misma pestaña.
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(CLAVE_SESION);
      if (guardado) setMensajes(JSON.parse(guardado) as Mensaje[]);
    } catch {
      // sessionStorage puede estar bloqueado: no es critico.
    }
  }, []);

  useEffect(() => {
    try {
      if (mensajes.length) {
        sessionStorage.setItem(CLAVE_SESION, JSON.stringify(mensajes.slice(-12)));
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
        body: JSON.stringify({
          mensajes: historial.slice(-8).map((m) => ({ rol: m.rol, texto: m.texto })),
        }),
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
    } catch (causa) {
      if (causa instanceof DOMException && causa.name === "AbortError") return;
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
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="pp-chat-panel"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 focus-visible:outline-offset-4"
        style={{ background: "var(--color-marca-700)" }}
      >
        <IconoChat />
        <span className="hidden sm:inline">{abierto ? "Cerrar" : "Consultas"}</span>
      </button>

      {abierto && (
        <div
          id="pp-chat-panel"
          ref={panel}
          role="dialog"
          aria-modal="false"
          aria-label="Consultas sobre el Presupuesto Participativo"
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[min(34rem,78vh)] flex-col overflow-hidden rounded-2xl shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[26rem]"
          style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
        >
          <header
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--borde)" }}
          >
            <div>
              <p className="text-sm font-semibold">Consultas</p>
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Sobre proyectos, distritos y cómo participar
              </p>
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
                className="rounded-lg px-2 py-1 text-xs underline"
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
                {mensaje.referencias?.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {mensaje.referencias.map((referencia) => (
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

/** Negritas y enlaces. Solo se permiten rutas internas del sitio. */
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
      partes.push(
        <a
          key={partes.length}
          href={coincidencia[3]}
          className="font-medium underline"
          style={{ color: "var(--color-marca-600)" }}
        >
          {coincidencia[2]}
        </a>,
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
