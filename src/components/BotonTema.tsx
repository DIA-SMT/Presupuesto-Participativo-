"use client";

/**
 * Boton para cambiar entre tema claro y oscuro.
 *
 * Por defecto el sitio sigue al sistema (`prefers-color-scheme`). Este boton
 * guarda una eleccion explicita, que le gana al sistema en las dos direcciones:
 * escribe `data-theme` en el <html> y los bloques de globals.css estan escritos
 * con `:root:not([data-theme="light"])` justamente para eso.
 *
 * Dos decisiones que evitan los problemas tipicos de un boton de tema:
 *
 *  - EL ICONO LO ELIGE EL CSS, no React (ver `.icono-tema-*` en globals.css). Si
 *    lo eligiera React habria que saber el tema en el primer render, y el
 *    servidor no lo sabe: o se manda un desajuste de hidratacion, o se pinta un
 *    icono equivocado por un instante. Asi el markup es identico en las dos
 *    puntas y el navegador ya sabe cual mostrar antes de que corra un solo JS.
 *  - LA ETIQUETA NO NOMBRA EL ESTADO ("Cambiar a oscuro"), porque por lo mismo
 *    en el primer render no se conoce. Dice que hace, no en que estado esta, y
 *    el estado lo comunica el icono.
 *
 * localStorage va con try/catch: en una ventana privada o con los datos de sitio
 * bloqueados el acceso puede tirar excepcion, y un boton de tema no puede ser el
 * motivo de que el encabezado no se dibuje.
 */
export const CLAVE_TEMA = "pp-smt:tema";

/** Lo que se guarda. `null` (sin clave) significa "seguir al sistema". */
export type TemaElegido = "claro" | "oscuro";

function leerElegido(): TemaElegido | null {
  try {
    const valor = localStorage.getItem(CLAVE_TEMA);
    return valor === "claro" || valor === "oscuro" ? valor : null;
  } catch {
    return null;
  }
}

function aplicar(tema: TemaElegido) {
  document.documentElement.dataset.theme = tema === "oscuro" ? "dark" : "light";
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin poder guardar, el cambio vale para esta pagina y se pierde al recargar.
    // Es peor no cambiar nada que no poder recordarlo.
  }
}

export default function BotonTema() {
  function alternar() {
    const elegido = leerElegido();
    // Sin eleccion previa se invierte lo que este mostrando el sistema, que es
    // lo que la persona esta viendo cuando aprieta.
    const oscuroAhora =
      elegido === "oscuro" ||
      (elegido === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
    aplicar(oscuroAhora ? "claro" : "oscuro");
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label="Cambiar entre tema claro y oscuro"
      title="Cambiar entre tema claro y oscuro"
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition hover:brightness-95"
      style={{
        border: "1px solid var(--borde-control)",
        color: "var(--texto)",
        background: "var(--fondo-tarjeta)",
      }}
    >
      {/* Los dos iconos viajan siempre; el CSS muestra uno. aria-hidden porque
          la etiqueta del boton ya dice todo lo que hace falta. */}
      <svg
        className="icono-tema-claro"
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </svg>
      <svg
        className="icono-tema-oscuro"
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
