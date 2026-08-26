"use client";

/**
 * La ventana del aviso legal.
 *
 * El aviso arranco como un <details> plegado en el pie, pero desplegado eran
 * ~300 lineas de texto empujando el sello de autoria, y la pagina quedaba
 * cargada (pedido de Lucas, 26/08/2026). Ahora el texto vive en una ventana
 * modal centrada con su propio scroll: la pagina no carga con el peso visual
 * del aviso, y el aviso sigue estando a un clic desde cualquier pagina, que
 * era la razon por la que no tiene ruta propia.
 *
 * Este componente es solo el marco: el gatillo del pie y el <dialog>. El texto
 * llega por children ya renderizado en el servidor (src/components/AvisoLegal.tsx),
 * asi que las ~300 lineas no viajan al bundle del cliente.
 *
 * Las anclas historicas siguen funcionando. El chat y el formulario de ideas
 * enlazan a #aviso-ia, y hay enlaces viejos a #aviso-legal y #aviso-legal-texto.
 * Esos destinos ahora estan adentro de un <dialog> cerrado (display: none), asi
 * que el navegador no tiene a donde scrollear; en su lugar, este componente
 * escucha el hash: si coincide con un ancla del aviso, abre la ventana,
 * scrollea su cuerpo hasta el bloque pedido y limpia el hash ahi mismo, para
 * que el mismo enlace funcione una segunda vez (sin cambio de hash no hay
 * evento). El porque de limpiarlo al abrir y no al cerrar esta en el efecto.
 *
 * Lo que da el <dialog> nativo y no hay que reimplementar: foco atrapado
 * adentro, Escape para cerrar, foco devuelto al gatillo al cerrar, y la capa
 * superior (top layer), que lo saca de cualquier overflow del pie. El clic en
 * el fondo oscurecido cierra porque el unico lugar del <dialog> que puede
 * recibir un clic directo es su ::backdrop: el contenido interno tapa todo el
 * resto.
 */

import { useCallback, useEffect, useRef, type ReactNode } from "react";

/** Los fragmentos que historicamente apuntan adentro del aviso. */
const ANCLAS = ["aviso-legal", "aviso-legal-texto", "aviso-ia"];

export default function VentanaAvisoLegal({ children }: { children: ReactNode }) {
  const ventana = useRef<HTMLDialogElement>(null);
  const cuerpo = useRef<HTMLDivElement>(null);

  const abrir = useCallback((ancla?: string) => {
    const dialogo = ventana.current;
    if (!dialogo) return;
    if (!dialogo.open) dialogo.showModal();
    if (ancla && ancla !== "aviso-legal") {
      // El scroll espera un tick: recien abierto, el dialogo todavia no midio.
      // setTimeout y no requestAnimationFrame: en una pestana en segundo plano
      // los cuadros no corren y el scroll quedaria pendiente hasta volver. La
      // segunda pasada cubre la carga en frio con el ancla en la URL, donde la
      // primera corre con la pagina todavia acomodandose (hidratacion) y el
      // contenido de arriba crece despues; si la primera ya quedo bien, la
      // segunda no mueve nada.
      const llevar = () => document.getElementById(ancla)?.scrollIntoView({ block: "start" });
      setTimeout(llevar, 0);
      setTimeout(llevar, 300);
    } else {
      cuerpo.current?.scrollTo({ top: 0 });
    }
  }, []);

  useEffect(() => {
    const porHash = () => {
      const ancla = window.location.hash.slice(1);
      if (!ANCLAS.includes(ancla)) return;
      abrir(ancla);
      // El hash se limpia apenas usado, no al cerrar. Sin limpieza, el mismo
      // enlace no reabre la ventana la segunda vez (un hash que no cambia no
      // dispara hashchange); y limpiarlo al cerrar no anda: el evento close
      // del dialogo no llega en Chrome ni con un listener nativo directo
      // (probado), asi que ningun cierre —X, Escape o fondo— puede encargarse.
      // replaceState no dispara hashchange, o sea que esto no se llama solo.
      history.replaceState(null, "", window.location.pathname + window.location.search);
    };
    porHash(); // cubre llegar con el ancla ya puesta en la URL
    window.addEventListener("hashchange", porHash);
    return () => window.removeEventListener("hashchange", porHash);
  }, [abrir]);

  return (
    <>
      {/* El gatillo vive en la lista de enlaces del pie y se viste igual que
          sus vecinos: es un enlace mas a los ojos del vecino, aunque abra una
          ventana en vez de navegar. */}
      <button
        type="button"
        onClick={() => abrir()}
        className="cursor-pointer hover:underline"
        style={{ color: "var(--texto-suave)" }}
      >
        Aviso legal y condiciones de uso
      </button>

      <dialog
        ref={ventana}
        className="ventana-aviso"
        aria-labelledby="ventana-aviso-titulo"
        onClick={(evento) => {
          if (evento.target === ventana.current) ventana.current?.close();
        }}
      >
        <header className="ventana-aviso-encabezado">
          <div>
            <h2 id="ventana-aviso-titulo" className="text-base font-bold">
              Aviso legal y condiciones de uso
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
              Qué valor tiene la información de este sitio, cómo funcionan sus asistentes de
              inteligencia artificial y qué esperamos de quien participa
            </p>
          </div>
          <button
            type="button"
            onClick={() => ventana.current?.close()}
            aria-label="Cerrar el aviso legal"
            className="ventana-aviso-cerrar"
          >
            <IconoCerrar />
          </button>
        </header>

        <div ref={cuerpo} className="ventana-aviso-cuerpo">
          {children}
        </div>
      </dialog>

      <style>{estilos}</style>
    </>
  );
}

function IconoCerrar() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

/**
 * El mismo patron de estilos propios que Mapa y HeroInicio: las medidas solo
 * tienen sentido con el comentario al lado. Ojo con los backticks: esto es un
 * template literal, un backtick en un comentario CSS lo corta.
 */
const estilos = `
.ventana-aviso {
  margin: auto;
  width: min(48rem, calc(100vw - 2.5rem));
  /* dvh y no vh: en el celular la barra del navegador achica el alto real,
     y con vh el pie de la ventana quedaba abajo de la barra. */
  max-height: min(85dvh, 52rem);
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--borde);
  border-radius: 1.25rem;
  background: var(--fondo-tarjeta);
  color: var(--texto);
  box-shadow: 0 30px 80px -20px rgba(10, 36, 80, 0.35);
}
.ventana-aviso[open] {
  display: flex;
  animation: ventana-aviso-entra 200ms ease-out;
}
.ventana-aviso::backdrop {
  background: color-mix(in srgb, var(--color-marca-950) 45%, transparent);
  backdrop-filter: blur(2px);
}

/* Mientras la ventana esta abierta, la pagina de atras no scrollea. */
body:has(.ventana-aviso[open]) {
  overflow: hidden;
}

.ventana-aviso-encabezado {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-shrink: 0;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--borde);
}

.ventana-aviso-cuerpo {
  overflow-y: auto;
  /* que la rueda no siga scrolleando la pagina al llegar al fondo */
  overscroll-behavior: contain;
  padding: 1.5rem;
}
/* Aire para las anclas (#aviso-ia y compania) al scrollear adentro. */
.ventana-aviso-cuerpo [id] {
  scroll-margin-block-start: 0.75rem;
}

.ventana-aviso-cerrar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  cursor: pointer;
  border-radius: 0.75rem;
  border: 1px solid var(--borde-control);
  background: var(--fondo-tarjeta);
  color: var(--texto-suave);
  transition: background-color 150ms ease;
}
.ventana-aviso-cerrar:hover {
  background: var(--color-marca-50);
}

@keyframes ventana-aviso-entra {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ventana-aviso[open] { animation: none; }
  .ventana-aviso-cerrar { transition: none; }
}
`;
