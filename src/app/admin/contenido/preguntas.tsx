"use client";

/**
 * Solapa "Preguntas frecuentes": alta, edicion, orden, publicacion y baja.
 *
 * Lo que hay que tener presente al tocar cualquiera, y por eso la pantalla lo
 * dice arriba: se ven en "Cómo participar" (/acerca-de) en este orden, y el
 * chat recibe TODAS las publicadas, completas, en cada consulta (ver
 * `construirSistema` en src/app/api/chat/route.ts). Una respuesta equivocada no
 * queda en una pagina que lee poca gente: Migue la repite.
 *
 * Despublicar saca una pregunta de la pagina y del chat sin perderla; borrar
 * es definitivo. Cada cosa deja su fila en la bitacora (faq_guardada o
 * faq_borrada).
 */
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { FaqAdmin } from "@/db/queries";
import { formatearNumero, recortar } from "@/lib/formato";
import { aTextoLlano } from "@/lib/texto";
import type { Resultado } from "../comun";
import {
  borrarPregunta,
  crearPregunta,
  editarPregunta,
  moverPregunta,
  publicarPregunta,
} from "./acciones";
import {
  avisosDeFormato,
  largoDe,
  MAXIMO_PREGUNTA,
  MAXIMO_RESPUESTA,
  normalizarBloque,
  normalizarLinea,
} from "./catalogo";
import {
  AvisosFormato,
  claseBotonPrincipal,
  claseBotonSecundario,
  colorExito,
  Contador,
  estiloBotonPrincipal,
  estiloBotonSecundario,
  estiloCampo,
  Marca,
  MensajeAccion,
} from "./comunes";

export default function SeccionPreguntas({ preguntas }: { preguntas: FaqAdmin[] }) {
  // La fila de una pregunta borrada desaparece con su mensaje adentro: el
  // aviso de que se borro vive aca, en una region que no se va.
  const [borrada, setBorrada] = useState("");

  const publicadas = preguntas.filter((pregunta) => pregunta.publicada);
  const caracteresDelChat = publicadas.reduce(
    (suma, pregunta) => suma + largoDe(pregunta.pregunta) + largoDe(pregunta.respuesta),
    0,
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <section aria-labelledby="titulo-preguntas">
        <h2 id="titulo-preguntas" className="text-xl font-bold">
          Preguntas frecuentes
        </h2>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
          Se ven en{" "}
          <a href="/acerca-de" target="_blank" rel="noopener" className="underline">
            “Cómo participar”
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>{" "}
          en este orden, y el chat las recibe todas, completas, en cada consulta que le hacen: lo
          que diga una respuesta, Migue lo repite. Una pregunta sin publicar no la ve nadie, ni la
          página ni el chat.
        </p>
        <p className="mt-2 text-sm">
          {preguntas.length === 1 ? "1 pregunta" : `${preguntas.length} preguntas`} ·{" "}
          {publicadas.length === 1 ? "1 publicada" : `${publicadas.length} publicadas`}
          {publicadas.length > 0 && (
            <span style={{ color: "var(--texto-suave)" }}>
              {" "}
              · el chat lee {formatearNumero(caracteresDelChat)} caracteres de preguntas frecuentes en
              cada consulta
            </span>
          )}
        </p>

        <p role="status" className="mt-2 text-sm" style={{ color: colorExito }}>
          {borrada}
        </p>

        {preguntas.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
            Todavía no hay preguntas cargadas: “Cómo participar” no muestra ninguna y el chat no
            recibe ninguna.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {preguntas.map((pregunta, indice) => (
              <li key={pregunta.id}>
                <FilaPregunta
                  pregunta={pregunta}
                  indice={indice}
                  total={preguntas.length}
                  alBorrar={() => setBorrada(`Se borró la pregunta “${pregunta.pregunta}”.`)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <aside>
        <FormularioNuevaPregunta />
      </aside>
    </div>
  );
}

function FilaPregunta({
  pregunta,
  indice,
  total,
  alBorrar,
}: {
  pregunta: FaqAdmin;
  indice: number;
  total: number;
  alBorrar: () => void;
}) {
  const [modo, setModo] = useState<"editar" | "borrar" | null>(null);
  const [estadoMover, mover, moviendo] = useActionState(moverPregunta, null);
  const [estadoPublicar, publicar, publicando] = useActionState(publicarPregunta, null);
  const idTitulo = useId();

  // Al bajar, React mueve el nodo de la fila en el DOM y el navegador le saca
  // el foco al boton: quien usa teclado quedaba al principio de la pagina. Se le
  // devuelve al mismo boton, o al otro si este quedo deshabilitado (la pregunta
  // llego a la punta).
  const botonSubir = useRef<HTMLButtonElement>(null);
  const botonBajar = useRef<HTMLButtonElement>(null);
  const ultimaDireccion = useRef<"arriba" | "abajo" | null>(null);
  useEffect(() => {
    if (!estadoMover?.ok || !ultimaDireccion.current) return;
    const [preferido, otro] =
      ultimaDireccion.current === "arriba"
        ? [botonSubir.current, botonBajar.current]
        : [botonBajar.current, botonSubir.current];
    (preferido && !preferido.disabled ? preferido : otro)?.focus();
  }, [estadoMover]);

  const claseAccion = "px-1.5 py-1.5 text-xs underline disabled:no-underline disabled:opacity-40";

  return (
    <article className="superficie rounded-2xl" aria-labelledby={idTitulo}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
        {/* El numero es para el ojo: la lista es un <ol> y el lector ya dice "1 de 7". */}
        <span
          className="min-w-6 pt-0.5 text-sm font-semibold tabular-nums"
          style={{ color: "var(--texto-suave)" }}
          aria-hidden="true"
        >
          {indice + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={idTitulo} className="text-sm font-semibold">
            {pregunta.pregunta}
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            {recortar(aTextoLlano(pregunta.respuesta), 180)}
          </p>
          {!pregunta.publicada && (
            <p className="mt-1.5">
              <Marca tono="atencion">Sin publicar: no la ven ni la página ni el chat</Marca>
            </p>
          )}
        </div>

        {/* -my-1.5: el relleno de los botones (24 px de alto, WCAG 2.5.8) no agranda la fila. */}
        <div className="-my-1.5 flex flex-wrap items-center gap-x-1">
          <form action={mover} className="flex items-center gap-x-1">
            <input type="hidden" name="id" value={pregunta.id} />
            <button
              ref={botonSubir}
              type="submit"
              name="direccion"
              value="arriba"
              disabled={indice === 0 || moviendo}
              onClick={() => (ultimaDireccion.current = "arriba")}
              aria-describedby={idTitulo}
              className={claseAccion}
            >
              Subir
            </button>
            <button
              ref={botonBajar}
              type="submit"
              name="direccion"
              value="abajo"
              disabled={indice === total - 1 || moviendo}
              onClick={() => (ultimaDireccion.current = "abajo")}
              aria-describedby={idTitulo}
              className={claseAccion}
            >
              Bajar
            </button>
          </form>
          <button
            type="button"
            onClick={() => setModo(modo === "editar" ? null : "editar")}
            aria-expanded={modo === "editar"}
            aria-describedby={idTitulo}
            className={claseAccion}
          >
            {modo === "editar" ? "Cerrar" : "Editar"}
          </button>
          <form action={publicar}>
            <input type="hidden" name="id" value={pregunta.id} />
            <input type="hidden" name="publicada" value={pregunta.publicada ? "0" : "1"} />
            <button
              type="submit"
              disabled={publicando}
              aria-describedby={idTitulo}
              className={claseAccion}
            >
              {pregunta.publicada ? "Despublicar" : "Publicar"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setModo(modo === "borrar" ? null : "borrar")}
            aria-expanded={modo === "borrar"}
            aria-describedby={idTitulo}
            className={claseAccion}
            style={{ color: "var(--acento-texto)" }}
          >
            {modo === "borrar" ? "Cerrar" : "Borrar"}
          </button>
        </div>
      </div>

      {/* Los dos mensajes estan siempre montados (ver MensajeAccion); vacios no ocupan alto. */}
      <div className={`flex flex-wrap gap-x-3 px-4 ${estadoMover || estadoPublicar ? "pb-3" : ""}`}>
        <MensajeAccion resultado={estadoMover} exito="Movida." />
        <MensajeAccion
          resultado={estadoPublicar}
          exito={
            pregunta.publicada
              ? "Publicada: ya se ve en “Cómo participar” y el chat la usa."
              : "Despublicada: ya no la ven ni la página ni el chat."
          }
        />
      </div>

      {modo === "editar" && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--borde)" }}>
          <FormularioPregunta pregunta={pregunta} />
        </div>
      )}
      {modo === "borrar" && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--borde)" }}>
          <ConfirmacionBorrar
            pregunta={pregunta}
            alCancelar={() => setModo(null)}
            alBorrar={alBorrar}
          />
        </div>
      )}
    </article>
  );
}

/**
 * Los dos campos de una pregunta, con su contador y sus avisos. Controlados:
 * un error al guardar no puede borrar lo escrito (ver FormularioTexto).
 */
function CamposPregunta({
  id,
  pregunta,
  respuesta,
  alCambiarPregunta,
  alCambiarRespuesta,
}: {
  id: string;
  pregunta: string;
  respuesta: string;
  alCambiarPregunta: (valor: string) => void;
  alCambiarRespuesta: (valor: string) => void;
}) {
  const largoPregunta = largoDe(normalizarLinea(pregunta));
  const largoRespuesta = largoDe(normalizarBloque(respuesta));
  const avisos = avisosDeFormato(normalizarBloque(respuesta), "negritas", "parrafo");

  return (
    <>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Pregunta</span>
        <input
          name="pregunta"
          value={pregunta}
          onChange={(evento) => alCambiarPregunta(evento.target.value)}
          aria-describedby={`${id}-contador-pregunta`}
          placeholder="¿Cómo me empadrono para votar?"
          className="rounded-xl px-3 py-2"
          style={estiloCampo}
        />
        <Contador id={`${id}-contador-pregunta`} largo={largoPregunta} maximo={MAXIMO_PREGUNTA} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Respuesta</span>
        <textarea
          name="respuesta"
          value={respuesta}
          onChange={(evento) => alCambiarRespuesta(evento.target.value)}
          rows={6}
          aria-describedby={`${id}-ayuda ${id}-contador-respuesta${avisos.length ? ` ${id}-avisos` : ""}`}
          className="resize-y rounded-xl px-3 py-2 leading-relaxed"
          style={estiloCampo}
        />
        <span id={`${id}-ayuda`} className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Se muestra en un solo párrafo. Para resaltar una parte, escribila entre dos asteriscos de
          cada lado: **así**.
        </span>
        <Contador id={`${id}-contador-respuesta`} largo={largoRespuesta} maximo={MAXIMO_RESPUESTA} />
      </label>
      <AvisosFormato id={`${id}-avisos`} avisos={avisos} />
    </>
  );
}

function FormularioPregunta({ pregunta }: { pregunta: FaqAdmin }) {
  const [estado, accion, pendiente] = useActionState(editarPregunta, null);
  const [textoPregunta, setTextoPregunta] = useState(pregunta.pregunta);
  const [respuesta, setRespuesta] = useState(pregunta.respuesta);
  const id = useId();

  return (
    <form action={accion} className="mt-3 grid gap-3">
      <input type="hidden" name="id" value={pregunta.id} />
      <CamposPregunta
        id={id}
        pregunta={textoPregunta}
        respuesta={respuesta}
        alCambiarPregunta={setTextoPregunta}
        alCambiarRespuesta={setRespuesta}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendiente} className={claseBotonPrincipal} style={estiloBotonPrincipal}>
          {pendiente ? "Guardando…" : "Guardar la pregunta"}
        </button>
        <MensajeAccion
          resultado={estado}
          exito={
            pregunta.publicada
              ? "Guardada: ya se ve así en “Cómo participar” y el chat la usa."
              : "Guardada. Está sin publicar: todavía no la ve nadie."
          }
        />
      </div>
    </form>
  );
}

/**
 * Borrado con confirmacion. Es definitivo, y la confirmacion ofrece la salida
 * que casi siempre alcanza: despublicarla.
 */
function ConfirmacionBorrar({
  pregunta,
  alCancelar,
  alBorrar,
}: {
  pregunta: FaqAdmin;
  alCancelar: () => void;
  alBorrar: () => void;
}) {
  // Aca si se envuelve la accion: al borrar, esta fila desaparece en el mismo
  // render que trae el resultado, y un efecto no llegaria a correr. El aviso a
  // la lista sale desde adentro de la accion. No pierde nada sin JavaScript: la
  // confirmacion solo se abre con un clic.
  const [estado, accion, pendiente] = useActionState(
    async (previo: Resultado | null, datos: FormData) => {
      const resultado = await borrarPregunta(previo, datos);
      if (resultado.ok) alBorrar();
      return resultado;
    },
    null,
  );

  return (
    <form
      action={accion}
      className="mt-3 rounded-xl p-3"
      style={{
        background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-acento-600) 40%, transparent)",
      }}
    >
      <input type="hidden" name="id" value={pregunta.id} />
      <p className="text-sm font-semibold">Vas a borrar la pregunta “{pregunta.pregunta}”.</p>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        {pregunta.publicada
          ? "Desaparece de “Cómo participar” y el chat deja de usarla. "
          : "Está sin publicar, así que hoy no la ve nadie. "}
        No se puede deshacer: si la necesitás de nuevo hay que cargarla otra vez. Si solo querés
        sacarla un tiempo, despublicala.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className={claseBotonPrincipal}
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Borrando…" : "Sí, borrar la pregunta"}
        </button>
        <button type="button" onClick={alCancelar} className="text-sm underline">
          Cancelar
        </button>
        <MensajeAccion resultado={estado} exito="Borrada." />
      </div>
    </form>
  );
}

/**
 * Alta de una pregunta. Dos botones en lugar de una casilla "publicar": la
 * casilla se olvidaba tildada, y asi la decision queda en el boton que se
 * aprieta. Con Enter en el campo de la pregunta se usa el primero, que publica.
 */
function FormularioNuevaPregunta() {
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const id = useId();
  // La accion va directa, sin envolverla en una funcion del cliente: asi el
  // formulario tambien se puede mandar antes de que cargue el JavaScript, como
  // los demas del panel.
  const [estado, accion, pendiente] = useActionState(crearPregunta, null);

  // Con cada resultado nuevo que salio bien, los campos se vacian; con un
  // error, lo escrito queda. Se ajusta en el render, sin efecto: es el patron
  // de React para reaccionar a un valor que cambio.
  const [resultadoVisto, setResultadoVisto] = useState(estado);
  if (estado !== resultadoVisto) {
    setResultadoVisto(estado);
    if (estado?.ok) {
      setPregunta("");
      setRespuesta("");
    }
  }

  return (
    <form action={accion} className="superficie grid gap-3 rounded-2xl p-6">
      <h3 className="text-lg font-bold">Agregar una pregunta</h3>
      <p className="-mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Se agrega al final de la lista. Después la podés subir.
      </p>
      <CamposPregunta
        id={id}
        pregunta={pregunta}
        respuesta={respuesta}
        alCambiarPregunta={setPregunta}
        alCambiarRespuesta={setRespuesta}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="publicada"
          value="1"
          disabled={pendiente}
          className={claseBotonPrincipal}
          style={estiloBotonPrincipal}
        >
          Agregar y publicar
        </button>
        <button
          type="submit"
          name="publicada"
          value="0"
          disabled={pendiente}
          className={claseBotonSecundario}
          style={estiloBotonSecundario}
        >
          Agregar sin publicar
        </button>
      </div>
      <MensajeAccion resultado={estado} exito="Agregada." />
    </form>
  );
}
