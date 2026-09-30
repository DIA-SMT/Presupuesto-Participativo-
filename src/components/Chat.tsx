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
 *
 * El lanzador es Migue, la mascota del programa, saliendo de un circulo: la
 * imagen ya viene recortada para eso (scripts/migue-burbuja.mjs) y el circulo lo
 * dibuja el CSS de abajo, asi toma los colores del tema. En pantallas anchas lo
 * acompaña un globo con el llamado; en el telefono va solo el circulo.
 */
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import migueBurbuja from "../../public/images/presupuesto-participativo/migue-burbuja.webp";
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

const CLAVE_SESION = "pp-chat";
/** Donde queda la posicion elegida. La conversacion vive en sessionStorage; el
 *  lugar del widget en localStorage, porque es una preferencia y se recuerda
 *  entre visitas. */
const CLAVE_POSICION = "pp-chat-posicion";
/** Instrucciones para lector de pantalla, compartidas por las dos zonas de agarre. */
const ID_AYUDA_MOVER = "pp-chat-ayuda-mover";

/**
 * `sugerencias`: las preguntas que se ofrecen al abrir, segun la etapa (las
 * elige el servidor, ver src/lib/chat-sugerencias.ts).
 */
export default function Chat({
  bienvenida,
  sugerencias,
}: {
  bienvenida: string;
  sugerencias: string[];
}) {
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
        aria-label={abierto ? "Cerrar las consultas" : "Consultas: preguntale a Migue"}
        aria-describedby={ID_AYUDA_MOVER}
        title="Arrastrame para moverme"
        className="pp-lanzador fixed bottom-4 right-4 z-40 rounded-3xl focus-visible:outline-offset-4"
        style={{ ...arrastre.estiloMovil, ...arrastre.estiloAgarre }}
      >
        {/* El globo repite lo que ya dice aria-label: para el lector de
            pantalla va oculto, si no leeria el llamado dos veces. */}
        <span className="pp-lanzador-globo" aria-hidden="true">
          <span className="pp-lanzador-agarre">
            <IconoAgarre />
          </span>
          {abierto ? (
            <strong>Cerrar</strong>
          ) : (
            <span>
              ¿Tenés una consulta?
              <strong>Preguntale a Migue</strong>
            </span>
          )}
        </span>
        <AvatarMigue className="pp-lanzador-migue">
          {abierto && (
            <span className="pp-lanzador-cruz" aria-hidden="true">
              <IconoCerrar />
            </span>
          )}
        </AvatarMigue>
      </button>

      {abierto && (
        <div
          id="pp-chat-panel"
          ref={arrastre.registrar}
          role="dialog"
          aria-modal="false"
          aria-label="Consultas sobre el Presupuesto Participativo"
          className="fixed inset-x-3 bottom-24 z-40 flex max-h-[min(34rem,74vh)] flex-col overflow-hidden rounded-2xl shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[26rem]"
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
              <AvatarMigue className="pp-cabecera-migue" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Migue</p>
                <p className="truncate text-xs" style={{ color: "var(--texto-suave)" }}>
                  Presupuesto Participativo
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
            {/* Cerrar tambien desde aca: con el lanzador corrido o tapado por
                el teclado del telefono, era la unica forma ademas de Escape. */}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar las consultas"
              className="shrink-0 rounded-lg p-1.5 transition hover:brightness-95"
              style={{ color: "var(--texto-suave)", background: "var(--fondo-suave)" }}
            >
              <IconoCerrar />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {mensajes.length === 0 && (
              <>
                <Burbuja rol="asistente">{renderizar(bienvenida)}</Burbuja>
                <div className="flex flex-wrap gap-2 pt-1">
                  {sugerencias.map((sugerencia) => (
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

      <style>{estilos}</style>
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
  consultar_reglamento: "Leyendo el reglamento",
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
// Markdown reducido: parrafos, listas (con viñetas o numeradas), negritas y
// enlaces internos.
// ---------------------------------------------------------------------------

function renderizar(texto: string): ReactNode {
  const bloques: ReactNode[] = [];
  const lineas = texto.split("\n");
  let lista: ReactNode[] = [];
  // Los pasos para votar llegan numerados ("1. Ingresá..."): antes salian como
  // parrafos sueltos que empezaban con el numero.
  let numerada = false;

  const cerrarLista = () => {
    if (!lista.length) return;
    const items = lista.map((item, i) => (
      <li key={i} className={numerada ? "list-decimal" : "list-disc"}>
        {item}
      </li>
    ));
    bloques.push(
      numerada ? (
        <ol key={`ol-${bloques.length}`} className="my-1.5 space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${bloques.length}`} className="my-1.5 space-y-1 pl-4">
          {items}
        </ul>
      ),
    );
    lista = [];
  };

  for (const linea of lineas) {
    const item = linea.match(/^\s*[-*•]\s+(.*)$/);
    const numero = item ? null : linea.match(/^\s*\d{1,2}[.)]\s+(.*)$/);
    if (item || numero) {
      // Una lista de otro tipo cierra la anterior.
      if (lista.length && numerada !== Boolean(numero)) cerrarLista();
      numerada = Boolean(numero);
      lista.push(enLinea((item ?? numero)![1]));
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
 *
 * Dos casos que se veian con los corchetes a la vista: un enlace dentro de
 * negritas (`**[titulo](/ruta)**`, como el modelo nombra un proyecto), que ahora
 * se interpreta adentro; y un enlace markdown a una url completa (el modelo
 * llego a inventarle un dominio a una ruta del sitio), que queda como su texto.
 */
function enLinea(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const patron =
    /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/\S+)/g;
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = patron.exec(texto)) !== null) {
    if (coincidencia.index > ultimo) {
      partes.push(texto.slice(ultimo, coincidencia.index));
    }
    if (coincidencia[1]) {
      partes.push(<strong key={partes.length}>{enLinea(coincidencia[1])}</strong>);
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
    } else if (coincidencia[4] && coincidencia[5]) {
      // Enlace a una url completa: se muestra el texto, sin la url ni el clic.
      partes.push(coincidencia[4]);
    } else if (coincidencia[6]) {
      // Una url externa se muestra como texto: el asistente no deberia
      // proponer salir del sitio, y asi no se convierte en un enlace clickeable.
      partes.push(coincidencia[6]);
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

function IconoCerrar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Migue saliendo de su circulo. El tamaño lo da la variable --pp-migue de la
 * clase que se le pase (el lanzador y la cabecera usan tamaños distintos), y el
 * alto sale de la proporcion de la imagen: el circulo ocupa el ancho entero y
 * se apoya en la base, y lo que sobra arriba es el pelo que asoma.
 *
 * Es decorativo: quien lo usa ya tiene su texto o su aria-label.
 */
function AvatarMigue({ className, children }: { className: string; children?: ReactNode }) {
  return (
    <span className={`pp-migue ${className}`}>
      <span className="pp-migue-circulo" aria-hidden="true" />
      <Image src={migueBurbuja} alt="" sizes="(min-width: 40rem) 64px, 56px" className="pp-migue-imagen" />
      {children}
    </span>
  );
}

/**
 * Los estilos del lanzador y del avatar. Van aca y no en Tailwind por lo mismo
 * que los del hero: dependen de la proporcion de la imagen (384 x 440, el
 * circulo apoyado en la base) y se entienden con el comentario al lado.
 */
const estilos = `
.pp-lanzador {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  background: none;
  border: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

/* El globo del llamado: como si Migue hablara. Solo en pantallas anchas. */
.pp-lanzador-globo {
  display: none;
  position: relative;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.9rem;
  padding: 0.55rem 0.9rem 0.55rem 0.65rem;
  border-radius: 1rem;
  background: var(--fondo-tarjeta);
  border: 1px solid var(--borde);
  box-shadow: 0 12px 28px -14px rgba(15, 23, 42, 0.45), 0 2px 6px rgba(15, 23, 42, 0.08);
  color: var(--texto-suave);
  text-align: left;
  font-size: 0.75rem;
  line-height: 1.3;
  transition: transform 180ms ease-out;
}
.pp-lanzador-globo strong {
  display: block;
  font-size: 0.875rem;
  color: var(--marca-texto);
}
/* La colita del globo, que apunta a Migue. */
.pp-lanzador-globo::after {
  content: "";
  position: absolute;
  top: 50%;
  right: -6px;
  width: 11px;
  height: 11px;
  background: var(--fondo-tarjeta);
  border-top: 1px solid var(--borde);
  border-right: 1px solid var(--borde);
  transform: translateY(-50%) rotate(45deg);
}
.pp-lanzador-agarre { display: flex; opacity: 0.55; }
@media (min-width: 40rem) {
  .pp-lanzador-globo { display: flex; }
}

.pp-migue {
  position: relative;
  display: block;
  flex-shrink: 0;
  width: var(--pp-migue);
  height: calc(var(--pp-migue) * 440 / 384);
}
.pp-lanzador-migue { --pp-migue: 56px; }
@media (min-width: 40rem) {
  .pp-lanzador-migue { --pp-migue: 64px; }
}
.pp-cabecera-migue { --pp-migue: 38px; }

/* El circulo: claro en los dos temas, para que el buzo azul resalte. */
.pp-migue-circulo {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  aspect-ratio: 1;
  border-radius: 999px;
  background: radial-gradient(circle at 50% 30%, var(--color-marca-50), var(--color-marca-100));
  border: 3px solid var(--color-marca-600);
}
.pp-lanzador-migue .pp-migue-circulo {
  box-shadow: 0 12px 26px -10px rgba(1, 102, 255, 0.55), 0 3px 8px rgba(15, 23, 42, 0.18);
}
.pp-cabecera-migue .pp-migue-circulo { border-width: 2px; }

.pp-migue-imagen {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform-origin: 50% 90%;
  transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
/* Al pasar el mouse (o al enfocarlo con el teclado) Migue se inclina, como
   saludando. Con prefers-reduced-motion el bloque global de globals.css apaga
   la transicion, y aca se apaga tambien el gesto. */
.pp-lanzador:hover .pp-migue-imagen,
.pp-lanzador:focus-visible .pp-migue-imagen {
  transform: rotate(-7deg) translateY(-2px);
}
.pp-lanzador:hover .pp-lanzador-globo { transform: translateX(-2px); }
@media (prefers-reduced-motion: reduce) {
  .pp-lanzador:hover .pp-migue-imagen,
  .pp-lanzador:focus-visible .pp-migue-imagen,
  .pp-lanzador:hover .pp-lanzador-globo { transform: none; }
}

/* Con el panel abierto, una cruz sobre el circulo dice que el mismo boton cierra. */
.pp-lanzador-cruz {
  position: absolute;
  top: calc(var(--pp-migue) * 56 / 384);
  right: -4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--color-marca-700);
  color: #fff;
  box-shadow: 0 0 0 2px var(--fondo-tarjeta);
}
`;
