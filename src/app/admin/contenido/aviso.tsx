"use client";

/**
 * Solapa "Aviso urgente": el texto de la banda que sale arriba de todas las
 * paginas publicas (src/components/AvisoUrgente.tsx). Es un texto mas de la
 * tabla `textos` (clave `aviso-urgente`); quitarlo es guardarlo vacio, y las
 * dos cosas quedan en la bitacora como `texto_guardado`.
 *
 * La vista previa es el mismo componente que usa el sitio (`BandaAviso`), en
 * el ancho del panel y en el de un telefono: un aviso de tres renglones en la
 * computadora puede ser de ocho en el celular, arriba del encabezado.
 */
import { useActionState, useState } from "react";
import { BandaAviso } from "@/components/AvisoUrgente";
import { CLAVE_AVISO_URGENTE } from "@/lib/aviso-urgente";
import { guardarTexto } from "./acciones";
import {
  avisosDeFormato,
  largoDe,
  maximoDe,
  normalizarValor,
  type TextoDelPanel,
} from "./catalogo";
import {
  AvisosFormato,
  claseBotonPrincipal,
  claseBotonSecundario,
  Contador,
  estiloBotonSecundario,
  estiloCampo,
  Marca,
  MensajeAccion,
} from "./comunes";

export default function SeccionAviso({ aviso }: { aviso: TextoDelPanel }) {
  const [estado, accion, pendiente] = useActionState(guardarTexto, null);
  const [estadoQuitar, quitar, quitando] = useActionState(guardarTexto, null);
  const [borrador, setBorrador] = useState(aviso.valor);

  // Mismo criterio que FormularioTexto: si cambia lo guardado (tambien al
  // quitarlo) y aca no habia nada sin guardar, el campo acompaña.
  const [base, setBase] = useState(aviso.valor);
  if (aviso.valor !== base) {
    if (normalizarValor(CLAVE_AVISO_URGENTE, borrador) === base) setBorrador(aviso.valor);
    setBase(aviso.valor);
  }

  const publicado = aviso.valor !== "";
  const normalizado = normalizarValor(CLAVE_AVISO_URGENTE, borrador);
  const sucio = normalizado !== aviso.valor;
  const maximo = maximoDe(CLAVE_AVISO_URGENTE);
  const largo = largoDe(normalizado);
  const avisos = avisosDeFormato(normalizado, "aviso", "linea");

  return (
    <section aria-labelledby="titulo-aviso" className="max-w-5xl">
      <h2 id="titulo-aviso" className="text-xl font-bold">
        Aviso urgente
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Una banda arriba de todas las páginas del sitio (no en el panel), para lo que el vecino
        tiene que saber ya: “la votación se extiende hasta el viernes por la caída de CIDITUC”, “el
        sitio va a estar en mantenimiento el sábado de 8 a 12”. Quien la cierra no la vuelve a ver
        en esa visita; si cambiás el texto, le aparece de nuevo.
      </p>

      <p
        className="mt-4 rounded-2xl px-4 py-3 text-sm"
        style={
          publicado
            ? {
                background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }
            : { background: "var(--fondo-suave)", border: "1px solid var(--borde)" }
        }
      >
        {publicado ? (
          <>
            <strong>Hay un aviso publicado</strong>
            {aviso.actualizado ? ` desde el ${aviso.actualizado}` : ""}: se ve arriba de todas las
            páginas. Cuando deje de hacer falta, quitalo.
          </>
        ) : (
          <>
            <strong>No hay ningún aviso publicado.</strong> El sitio se ve sin banda.
          </>
        )}
      </p>

      <form action={accion} className="mt-6">
        <input type="hidden" name="clave" value={CLAVE_AVISO_URGENTE} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="aviso-urgente" className="text-sm font-semibold">
            Texto del aviso
          </label>
          {sucio && <Marca>cambios sin guardar</Marca>}
        </div>
        <textarea
          id="aviso-urgente"
          name="valor"
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          rows={3}
          aria-describedby={`aviso-ayuda aviso-contador${avisos.length ? " aviso-avisos" : ""}`}
          placeholder="La votación se extiende hasta el viernes 3 de octubre. Más información en /votar"
          className="mt-2 w-full resize-y rounded-xl px-3 py-2 text-sm leading-relaxed"
          style={estiloCampo}
        />
        <p id="aviso-ayuda" className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
          Corto y concreto: qué pasa, hasta cuándo y qué tiene que hacer el vecino. Va en un solo
          párrafo (los saltos de línea se juntan). Un enlace se escribe entero (https://…) o como
          ruta del sitio (/votar) y se ve tal cual, para que se sepa a dónde lleva.
        </p>
        <AvisosFormato id="aviso-avisos" avisos={avisos} />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="submit"
            disabled={pendiente || normalizado === "" || largo > maximo}
            className={claseBotonPrincipal}
            style={{ background: "var(--color-acento-600)" }}
          >
            {pendiente ? "Publicando…" : publicado ? "Guardar el aviso" : "Publicar el aviso"}
          </button>
          {sucio && (
            <button type="button" onClick={() => setBorrador(aviso.valor)} className="text-sm underline">
              Descartar cambios
            </button>
          )}
          <Contador id="aviso-contador" largo={largo} maximo={maximo} />
          <MensajeAccion resultado={estado} exito="Publicado: ya se ve arriba de todas las páginas." />
        </div>
      </form>

      {publicado && (
        <form action={quitar} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="clave" value={CLAVE_AVISO_URGENTE} />
          <input type="hidden" name="valor" value="" />
          <button
            type="submit"
            disabled={quitando}
            className={claseBotonSecundario}
            style={estiloBotonSecundario}
          >
            {quitando ? "Quitando…" : "Quitar el aviso"}
          </button>
          <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Lo saca del sitio en el acto. El texto queda en la bitácora.
          </span>
        </form>
      )}
      {/* Fuera del formulario de arriba, que desaparece al quitar el aviso. */}
      <p className="mt-2">
        <MensajeAccion resultado={estadoQuitar} exito="Aviso quitado: el sitio ya se ve sin banda." />
      </p>

      <h3 className="mt-10 text-sm font-semibold">Vista previa</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
        Así se ve arriba del encabezado, con el tema que tengas puesto: el botón de tema del
        encabezado muestra el otro. Los enlaces se abren en otra pestaña, para probarlos sin perder
        lo escrito.
      </p>
      {normalizado === "" ? (
        <p
          className="mt-3 rounded-2xl px-4 py-6 text-center text-sm"
          style={{
            background: "var(--fondo-suave)",
            border: "1px dashed var(--borde)",
            color: "var(--texto-suave)",
          }}
        >
          Sin texto no aparece ninguna banda.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_375px] lg:items-start">
          <MarcoDeVistaPrevia titulo="En la computadora">
            <BandaAviso texto={normalizado} />
          </MarcoDeVistaPrevia>
          {/* 375 px: el ancho del telefono chico de referencia del sitio. */}
          <MarcoDeVistaPrevia titulo="En un teléfono" ancho={375}>
            <BandaAviso texto={normalizado} />
          </MarcoDeVistaPrevia>
        </div>
      )}
    </section>
  );
}

/** Un recorte del sitio: la banda y, debajo, la franja del encabezado. */
function MarcoDeVistaPrevia({
  titulo,
  ancho,
  children,
}: {
  titulo: string;
  ancho?: number;
  children: React.ReactNode;
}) {
  return (
    <figure style={ancho ? { width: "100%", maxWidth: ancho } : undefined}>
      <figcaption className="mb-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </figcaption>
      <div
        className="overflow-hidden rounded-xl"
        style={{ border: "1px solid var(--borde)", background: "var(--fondo)" }}
      >
        {children}
        <div
          aria-hidden="true"
          className="px-5 py-3 text-xs"
          style={{ borderBottom: "1px solid var(--borde)", color: "var(--texto-suave)" }}
        >
          Presupuesto Participativo · encabezado del sitio
        </div>
        <div aria-hidden="true" className="h-10" />
      </div>
    </figure>
  );
}
