"use client";

/**
 * Solapa "Novedades": alta, edicion y publicacion de lo que la portada muestra
 * en "Novedades y próximos encuentros".
 *
 * Dos cosas de la portada que la pantalla dice en palabras porque no se ven
 * desde aca:
 *  - muestra solo las ultimas publicadas por FECHA (no por cuando se cargaron),
 *    asi que una novedad con una fecha vieja puede quedar afuera. Cada fila
 *    marca si hoy se esta viendo, con la misma consulta que usa la portada;
 *  - muestra la fecha, el titulo y el copete. El cuerpo se guarda, pero no hay
 *    pagina de la novedad que lo muestre: por eso es opcional.
 *
 * No hay borrado: una novedad se despublica. Cada cambio deja fila en la
 * bitacora (novedad_creada o novedad_editada).
 */
import { useActionState, useId, useState } from "react";
import type { NovedadAdmin } from "@/db/queries";
import { formatearFecha } from "@/lib/formato";
import { crearNovedad, editarNovedad, publicarNovedad } from "./acciones";
import {
  largoDe,
  MAXIMO_COPETE,
  MAXIMO_CUERPO_NOVEDAD,
  MAXIMO_TITULO_NOVEDAD,
  normalizarBloque,
  normalizarLinea,
} from "./catalogo";
import {
  claseBotonPrincipal,
  claseBotonSecundario,
  Contador,
  estiloBotonPrincipal,
  estiloBotonSecundario,
  estiloCampo,
  Marca,
  MensajeAccion,
} from "./comunes";

export default function SeccionNovedades({
  novedades,
  enPortada,
  cuantasEnPortada,
  hoy,
}: {
  novedades: NovedadAdmin[];
  /** Ids que la portada muestra hoy, con la misma consulta que la portada. */
  enPortada: number[];
  cuantasEnPortada: number;
  /** "YYYY-MM-DD" en Tucumán, para la fecha sugerida del alta. */
  hoy: string;
}) {
  const publicadas = novedades.filter((novedad) => novedad.publicada).length;

  return (
    <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
      <section aria-labelledby="titulo-novedades">
        <h2 id="titulo-novedades" className="text-xl font-bold">
          Novedades
        </h2>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
          La{" "}
          <a href="/" target="_blank" rel="noopener" className="underline">
            portada
            <span className="sr-only"> (se abre en otra pestaña)</span>
          </a>{" "}
          muestra las {cuantasEnPortada} publicadas con la fecha más reciente, con su fecha, título y
          copete. El cuerpo se guarda, pero todavía ninguna página lo muestra. Una novedad no se
          borra: se despublica.
        </p>
        <p className="mt-2 text-sm">
          {novedades.length === 1 ? "1 novedad" : `${novedades.length} novedades`} ·{" "}
          {publicadas === 1 ? "1 publicada" : `${publicadas} publicadas`}
        </p>

        {novedades.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
            Todavía no hay novedades: la portada muestra un recuadro que dice que no hay.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {novedades.map((novedad) => (
              <li key={novedad.id}>
                <FilaNovedad novedad={novedad} seVe={enPortada.includes(novedad.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <FormularioNuevaNovedad hoy={hoy} />
      </aside>
    </div>
  );
}

function FilaNovedad({ novedad, seVe }: { novedad: NovedadAdmin; seVe: boolean }) {
  const [editando, setEditando] = useState(false);
  const [estado, publicar, publicando] = useActionState(publicarNovedad, null);
  const idTitulo = useId();
  const claseAccion = "px-1.5 py-1.5 text-xs underline disabled:opacity-40";

  return (
    <article className="superficie rounded-2xl" aria-labelledby={idTitulo}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            {formatearFecha(novedad.fecha)}
          </p>
          <h3 id={idTitulo} className="mt-0.5 text-sm font-semibold">
            {novedad.titulo}
          </h3>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            {novedad.copete || "Sin copete: la portada muestra solo la fecha y el título."}
          </p>
          <p className="mt-1.5 flex flex-wrap gap-2">
            {seVe && <Marca tono="bien">Se ve en la portada</Marca>}
            {!novedad.publicada && <Marca tono="atencion">Sin publicar</Marca>}
            {novedad.publicada && !seVe && (
              <Marca>Publicada, pero hay otras más recientes en la portada</Marca>
            )}
          </p>
        </div>
        <div className="-my-1.5 flex flex-wrap items-center gap-x-1">
          <button
            type="button"
            onClick={() => setEditando(!editando)}
            aria-expanded={editando}
            aria-describedby={idTitulo}
            className={claseAccion}
          >
            {editando ? "Cerrar" : "Editar"}
          </button>
          <form action={publicar}>
            <input type="hidden" name="id" value={novedad.id} />
            <input type="hidden" name="publicada" value={novedad.publicada ? "0" : "1"} />
            <button type="submit" disabled={publicando} aria-describedby={idTitulo} className={claseAccion}>
              {novedad.publicada ? "Despublicar" : "Publicar"}
            </button>
          </form>
        </div>
      </div>
      <div className={`px-4 ${estado ? "pb-3" : ""}`}>
        <MensajeAccion
          resultado={estado}
          exito={novedad.publicada ? "Publicada." : "Despublicada: ya no aparece en la portada."}
        />
      </div>
      {editando && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--borde)" }}>
          <FormularioEdicion novedad={novedad} />
        </div>
      )}
    </article>
  );
}

type Borrador = { titulo: string; fecha: string; copete: string; cuerpo: string };

/** Los cuatro campos, controlados: un error al guardar no borra lo escrito. */
function CamposNovedad({
  id,
  borrador,
  alCambiar,
}: {
  id: string;
  borrador: Borrador;
  alCambiar: (cambio: Partial<Borrador>) => void;
}) {
  return (
    <>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Título</span>
        <input
          name="titulo"
          value={borrador.titulo}
          onChange={(evento) => alCambiar({ titulo: evento.target.value })}
          aria-describedby={`${id}-titulo`}
          placeholder="Asamblea del distrito 7"
          className="rounded-xl px-3 py-2"
          style={estiloCampo}
        />
        <Contador
          id={`${id}-titulo`}
          largo={largoDe(normalizarLinea(borrador.titulo))}
          maximo={MAXIMO_TITULO_NOVEDAD}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Fecha</span>
        <input
          name="fecha"
          type="date"
          value={borrador.fecha}
          onChange={(evento) => alCambiar({ fecha: evento.target.value })}
          aria-describedby={`${id}-fecha`}
          className="rounded-xl px-3 py-2"
          style={estiloCampo}
        />
        <span id={`${id}-fecha`} className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Se muestra arriba del título, y la portada ordena por esta fecha.
        </span>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Copete (opcional)</span>
        <input
          name="copete"
          value={borrador.copete}
          onChange={(evento) => alCambiar({ copete: evento.target.value })}
          aria-describedby={`${id}-copete`}
          placeholder="Sábado 10 h en la plaza del barrio. Traé tu idea."
          className="rounded-xl px-3 py-2"
          style={estiloCampo}
        />
        <Contador id={`${id}-copete`} largo={largoDe(normalizarLinea(borrador.copete))} maximo={MAXIMO_COPETE} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Cuerpo (opcional, hoy no se muestra)</span>
        <textarea
          name="cuerpo"
          value={borrador.cuerpo}
          onChange={(evento) => alCambiar({ cuerpo: evento.target.value })}
          rows={4}
          aria-describedby={`${id}-cuerpo`}
          className="resize-y rounded-xl px-3 py-2 leading-relaxed"
          style={estiloCampo}
        />
        <Contador
          id={`${id}-cuerpo`}
          largo={largoDe(normalizarBloque(borrador.cuerpo))}
          maximo={MAXIMO_CUERPO_NOVEDAD}
        />
      </label>
    </>
  );
}

function FormularioEdicion({ novedad }: { novedad: NovedadAdmin }) {
  const [estado, accion, pendiente] = useActionState(editarNovedad, null);
  const [borrador, setBorrador] = useState<Borrador>({
    titulo: novedad.titulo,
    fecha: novedad.fecha,
    copete: novedad.copete ?? "",
    cuerpo: novedad.cuerpo,
  });
  const id = useId();

  return (
    <form action={accion} className="mt-3 grid gap-3">
      <input type="hidden" name="id" value={novedad.id} />
      <CamposNovedad
        id={id}
        borrador={borrador}
        alCambiar={(cambio) => setBorrador((previo) => ({ ...previo, ...cambio }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendiente} className={claseBotonPrincipal} style={estiloBotonPrincipal}>
          {pendiente ? "Guardando…" : "Guardar la novedad"}
        </button>
        <MensajeAccion resultado={estado} exito="Guardada." />
      </div>
    </form>
  );
}

/**
 * Alta. Igual que las preguntas: dos botones y no una casilla, para que
 * publicar sea una decision del momento y no algo que quedo tildado.
 */
function FormularioNuevaNovedad({ hoy }: { hoy: string }) {
  const vacio: Borrador = { titulo: "", fecha: hoy, copete: "", cuerpo: "" };
  const [borrador, setBorrador] = useState<Borrador>(vacio);
  const id = useId();
  // Accion directa, como en el alta de preguntas: funciona tambien sin JavaScript.
  const [estado, accion, pendiente] = useActionState(crearNovedad, null);

  // Si salio bien, el formulario se vacia; con un error, lo escrito queda.
  const [resultadoVisto, setResultadoVisto] = useState(estado);
  if (estado !== resultadoVisto) {
    setResultadoVisto(estado);
    if (estado?.ok) setBorrador(vacio);
  }

  return (
    <form action={accion} className="superficie grid gap-3 rounded-2xl p-6">
      <h3 className="text-lg font-bold">Nueva novedad</h3>
      <CamposNovedad
        id={id}
        borrador={borrador}
        alCambiar={(cambio) => setBorrador((previo) => ({ ...previo, ...cambio }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          name="publicada"
          value="1"
          disabled={pendiente}
          className={claseBotonPrincipal}
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Guardando…" : "Publicar"}
        </button>
        <button
          type="submit"
          name="publicada"
          value="0"
          disabled={pendiente}
          className={claseBotonSecundario}
          style={estiloBotonSecundario}
        >
          Guardar sin publicar
        </button>
      </div>
      <MensajeAccion resultado={estado} exito="Guardada." />
    </form>
  );
}
