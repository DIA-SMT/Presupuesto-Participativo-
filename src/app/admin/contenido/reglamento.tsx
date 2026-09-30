"use client";

/**
 * Solapa "Reglamento": el texto completo que publica /reglamento, con un editor
 * grande y una vista previa que dibuja el MISMO componente que la pagina
 * (src/app/reglamento/cuerpo.tsx), y el aviso que se ve mientras no hay texto.
 *
 * Es la razon principal por la que volvio esta pantalla: sin ella el
 * reglamento solo se podia cargar con SQL contra produccion, y /reglamento
 * mostraba un aviso escrito para el equipo.
 *
 * Un reglamento puede ser largo (decenas de paginas). Tres cosas lo cuidan:
 *  - la vista previa y los avisos se calculan con `useDeferredValue`: repartir
 *    cien mil caracteres en parrafos en cada tecla trababa el campo;
 *  - el campo no tiene `maxLength` (cortaria en silencio lo pegado de mas) y el
 *    contador dice cuanto sobra;
 *  - con cambios sin guardar, cerrar o recargar la pestaña pide confirmacion.
 *    Navegar con un enlace del panel no la pide: el router de Next no avisa.
 */
import { useActionState, useDeferredValue, useEffect, useState } from "react";
import CuerpoReglamento, { parrafosDelReglamento } from "@/app/reglamento/cuerpo";
import { formatearNumero } from "@/lib/formato";
import { guardarTexto } from "./acciones";
import {
  avisosDeFormato,
  CLAVE_REGLAMENTO_CUERPO,
  largoDe,
  maximoDe,
  normalizarValor,
  type TextoDelPanel,
} from "./catalogo";
import {
  AvisosFormato,
  claseBotonPrincipal,
  Contador,
  estiloBotonPrincipal,
  estiloCampo,
  Marca,
  MensajeAccion,
} from "./comunes";
import { FormularioTexto } from "./textos";

export default function SeccionReglamento({
  cuerpo,
  aviso,
}: {
  cuerpo: TextoDelPanel;
  aviso: TextoDelPanel;
}) {
  const publicados = parrafosDelReglamento(cuerpo.valor).length;

  return (
    <section aria-labelledby="titulo-reglamento">
      <h2 id="titulo-reglamento" className="text-xl font-bold">
        Reglamento
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        El texto de acá es el que publica{" "}
        <a href="/reglamento" target="_blank" rel="noopener" className="underline">
          /reglamento
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
        . Cada renglón con texto es un párrafo; los renglones en blanco no cuentan. No se interpreta
        HTML ni markdown: se publica como texto.
      </p>

      <p
        className="mt-4 rounded-2xl px-4 py-3 text-sm"
        style={{
          background: "var(--fondo-suave)",
          border: "1px solid var(--borde)",
        }}
      >
        {publicados > 0 ? (
          <>
            <strong>Hoy /reglamento muestra el texto cargado</strong>: {formatearNumero(publicados)}{" "}
            {publicados === 1 ? "párrafo" : "párrafos"}
            {cuerpo.actualizado ? `, guardado el ${cuerpo.actualizado}` : ""}.
          </>
        ) : (
          <>
            <strong>Hoy /reglamento no tiene el texto</strong>: muestra el aviso de más abajo y la
            lista de reglas confirmadas. Pegá el texto oficial acá y guardalo para publicarlo.
          </>
        )}
      </p>

      <EditorReglamento cuerpo={cuerpo} />

      <section aria-labelledby="titulo-aviso-reglamento" className="mt-12 max-w-3xl">
        <h3 id="titulo-aviso-reglamento" className="text-lg font-bold">
          Mientras no haya reglamento
        </h3>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Este aviso lo lee el vecino cuando el texto de arriba está vacío, arriba de las reglas
          confirmadas. Escribilo para él, no para el equipo.
          {publicados > 0 && " Hoy no se ve: hay un reglamento publicado."}
        </p>
        <div className="mt-3">
          <FormularioTexto
            texto={aviso}
            exito={
              publicados > 0
                ? "Guardado. Se va a ver si algún día el reglamento queda vacío."
                : "Guardado: ya se ve en /reglamento."
            }
          />
        </div>
      </section>
    </section>
  );
}

function EditorReglamento({ cuerpo }: { cuerpo: TextoDelPanel }) {
  const [estado, accion, pendiente] = useActionState(guardarTexto, null);
  const [borrador, setBorrador] = useState(cuerpo.valor);

  // Mismo criterio que FormularioTexto: si cambia lo guardado y no habia nada
  // sin guardar, el editor acompaña; si habia, se respeta.
  const [base, setBase] = useState(cuerpo.valor);
  if (cuerpo.valor !== base) {
    if (normalizarValor(CLAVE_REGLAMENTO_CUERPO, borrador) === base) setBorrador(cuerpo.valor);
    setBase(cuerpo.valor);
  }

  const normalizado = normalizarValor(CLAVE_REGLAMENTO_CUERPO, borrador);
  const sucio = normalizado !== cuerpo.valor;
  const maximo = maximoDe(CLAVE_REGLAMENTO_CUERPO);
  const largo = largoDe(normalizado);

  const diferido = useDeferredValue(normalizado);
  const parrafos = parrafosDelReglamento(diferido);
  const avisos = avisosDeFormato(diferido, "llano", "largo");
  const vacia = sucio && normalizado === "" && cuerpo.valor !== "";

  // Recargar o cerrar la pestaña con un reglamento a medio pegar lo perdia
  // entero. preventDefault es lo que piden los navegadores de hoy; returnValue,
  // los anteriores.
  useEffect(() => {
    if (!sucio) return;
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  return (
    <div className="mt-6 grid gap-6 2xl:grid-cols-2 2xl:items-start">
      {/*
        Lado a lado recien desde 1536 px: por debajo, la columna de la vista
        previa quedaba mas angosta que la pagina de verdad (max-w-3xl) y los
        renglones cortaban en otro lugar. Apilada, la vista previa tiene el ancho
        real.
      */}
      <form action={accion}>
        <input type="hidden" name="clave" value={CLAVE_REGLAMENTO_CUERPO} />
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="reglamento-cuerpo" className="text-sm font-semibold">
            Texto del reglamento
          </label>
          {sucio && <Marca>cambios sin guardar</Marca>}
        </div>
        <textarea
          id="reglamento-cuerpo"
          name="valor"
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          rows={24}
          aria-describedby={`reglamento-contador${avisos.length ? " reglamento-avisos" : ""}`}
          placeholder="Pegá acá el texto oficial. Un párrafo por renglón."
          className="mt-2 w-full resize-y rounded-xl px-3 py-2 text-sm leading-relaxed"
          style={estiloCampo}
        />
        <AvisosFormato id="reglamento-avisos" avisos={avisos} />
        {vacia && (
          <p className="mt-2 text-sm" style={{ color: "var(--acento-texto)" }}>
            Vas a vaciar el reglamento: /reglamento vuelve a mostrar el aviso y las reglas
            confirmadas.
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            type="submit"
            disabled={pendiente || largo > maximo}
            className={claseBotonPrincipal}
            style={estiloBotonPrincipal}
          >
            {pendiente ? "Guardando…" : cuerpo.valor ? "Guardar el reglamento" : "Publicar el reglamento"}
          </button>
          {sucio && (
            <button
              type="button"
              onClick={() => setBorrador(cuerpo.valor)}
              className="text-sm underline"
            >
              Descartar cambios
            </button>
          )}
          <Contador id="reglamento-contador" largo={largo} maximo={maximo} />
          <MensajeAccion
            resultado={estado}
            exito={cuerpo.valor ? "Guardado: /reglamento ya muestra este texto." : "Guardado."}
          />
        </div>
      </form>

      <div>
        <p className="text-sm font-semibold">
          Vista previa{" "}
          <span className="font-normal" style={{ color: "var(--texto-suave)" }}>
            · {formatearNumero(parrafos.length)} {parrafos.length === 1 ? "párrafo" : "párrafos"}, como
            en /reglamento
          </span>
        </p>
        {/*
          Region con scroll propio, enfocable con el teclado (si no, quien no usa
          mouse no puede recorrerla) y con nombre para el lector de pantalla.
        */}
        <div
          role="region"
          aria-label="Vista previa del reglamento"
          tabIndex={0}
          className="mt-2 max-h-[75vh] overflow-y-auto rounded-2xl px-5 py-6 sm:px-8"
          style={{ background: "var(--fondo)", border: "1px solid var(--borde)" }}
        >
          {/* No es un h1: la pantalla ya tiene el suyo. Se ve igual que el de la pagina. */}
          <p className="text-3xl font-bold sm:text-4xl" aria-hidden="true">
            Reglamento
          </p>
          {parrafos.length > 0 ? (
            <CuerpoReglamento parrafos={parrafos} />
          ) : (
            <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
              Con el texto vacío, /reglamento muestra el aviso de más abajo y las reglas confirmadas.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
