"use client";

/**
 * Aviso urgente: la banda que aparece arriba de todas las paginas publicas
 * mientras el texto `aviso-urgente` no este vacio. Lo carga un administrador en
 * /admin/contenido (solapa "Aviso urgente"), que usa `BandaAviso` para la vista
 * previa: lo que se ve ahi es este mismo componente.
 *
 * DONDE VA: en src/app/layout.tsx, justo despues del enlace "Saltar al
 * contenido" y antes del encabezado. El salto sigue siendo lo primero que
 * encuentra el teclado, y la banda queda FUERA del encabezado pegajoso: se va
 * con el scroll en lugar de comerse alto de pantalla en cada pagina.
 *
 * NO SALE EN EL PANEL: el layout raiz envuelve tambien /admin, y el layout no
 * puede saber la ruta (se renderiza una vez y no vuelve a correr al navegar).
 * Por eso este componente es de cliente y mira `usePathname`, que si cambia en
 * cada navegacion. Igual se dibuja en el HTML del servidor: un componente de
 * cliente tambien se renderiza ahi, asi que el aviso esta aunque no cargue el
 * JavaScript.
 *
 * LECTORES DE PANTALLA, sin ser invasivo:
 *  - La banda es una region con nombre ("Aviso importante"): aparece en la
 *    lista de regiones y es lo primero que se lee despues del salto.
 *  - NO es role="alert": un alert interrumpe lo que la persona este
 *    escuchando, y este aviso esta en todas las paginas.
 *  - El contenedor de afuera es aria-live="polite" y esta SIEMPRE en el DOM,
 *    vacio si no hay aviso: una region viva tiene que existir antes de que le
 *    llegue el contenido para que el lector lo anuncie. Asi, si el aviso
 *    aparece sin recargar (por ejemplo al volver del panel al sitio), se
 *    anuncia una vez, sin cortar nada. Al cargar una pagina no se anuncia: ya
 *    esta en el orden de lectura, primero.
 *
 * CERRARLO vale para esa visita: queda en sessionStorage, que se borra al
 * cerrar la pestaña, y no en una cookie (la politica de privacidad dice que el
 * sitio usa solo cookies necesarias, y esta no lo es). Se guarda el TEXTO
 * cerrado: si el equipo cambia el aviso, le aparece de nuevo a quien habia
 * cerrado el anterior. Con sessionStorage bloqueado se cierra igual, hasta
 * recargar. Quien lo cerro y recarga la pagina lo ve un instante hasta que
 * hidrata el JavaScript: el servidor no conoce el sessionStorage.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useId, useSyncExternalStore } from "react";
import { trozosDelAviso } from "@/lib/aviso-urgente";

/** Mismo prefijo que el tema (`pp-smt:tema`, src/components/BotonTema.tsx). */
const CLAVE_CERRADO = "pp-smt:aviso-cerrado";

/** El cierre de esta pagina, por si sessionStorage no se deja escribir. */
let cerradoEnMemoria: string | null = null;
const oyentes = new Set<() => void>();

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function leerCerrado(): string | null {
  if (cerradoEnMemoria !== null) return cerradoEnMemoria;
  try {
    return sessionStorage.getItem(CLAVE_CERRADO);
  } catch {
    return null;
  }
}

function cerrar(texto: string) {
  cerradoEnMemoria = texto;
  try {
    sessionStorage.setItem(CLAVE_CERRADO, texto);
  } catch {
    // Sin poder guardarlo se cierra igual en esta pagina y vuelve al recargar.
  }
  for (const oyente of oyentes) oyente();
}

/** El panel del equipo: ahi no se muestra, se edita. */
function esDelPanel(ruta: string): boolean {
  return ruta === "/admin" || ruta.startsWith("/admin/");
}

export default function AvisoUrgente({ texto }: { texto?: string | null }) {
  const ruta = usePathname();
  // En el servidor y al hidratar vale "nada cerrado", asi los dos HTML
  // coinciden; enseguida despues React lee el sessionStorage.
  const cerrado = useSyncExternalStore(suscribir, leerCerrado, () => null);
  const aviso = (texto ?? "").trim();
  const visible = aviso !== "" && !esDelPanel(ruta) && cerrado !== aviso;

  return (
    <div aria-live="polite">
      {visible && <BandaAviso texto={aviso} alCerrar={() => cerrar(aviso)} />}
    </div>
  );
}

/**
 * La banda en si. Sin `alCerrar` es la vista previa del panel: el boton de
 * cerrar se dibuja igual (para que se vea como va a quedar) pero no hace nada y
 * queda fuera del teclado y del lector.
 */
export function BandaAviso({ texto, alCerrar }: { texto: string; alCerrar?: () => void }) {
  const idTitulo = useId();
  const esVistaPrevia = !alCerrar;
  // En el sitio es una region con nombre. En la vista previa del panel no: hay
  // dos (computadora y telefono) y serian dos regiones iguales en la lista del
  // lector de pantalla, que no son un aviso de verdad.
  const Contenedor = esVistaPrevia ? "div" : "section";

  return (
    <Contenedor
      aria-labelledby={esVistaPrevia ? undefined : idTitulo}
      style={{
        // Tokens del sitio: el acento se mezcla con el fondo del tema, asi que en
        // oscuro queda un ambar apagado y no una franja clara. El texto es el del
        // tema (mas de 12:1 en los dos) y la etiqueta usa --acento-texto, que es
        // el acento pensado para letra y se aclara en oscuro.
        background: "color-mix(in srgb, var(--color-acento-600) 12%, var(--fondo))",
        borderBottom: "1px solid color-mix(in srgb, var(--color-acento-600) 45%, transparent)",
        color: "var(--texto)",
      }}
    >
      <div className="contenedor flex items-start gap-3 py-2.5">
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          className="mt-0.5 shrink-0"
          style={{ color: "var(--acento-texto)" }}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 2 20h20L12 3z" />
          <path d="M12 10v4M12 17.5v.01" />
        </svg>
        {/*
          overflow-wrap: una url larga no tiene donde cortar y, sin esto, en un
          telefono empujaba la pagina entera hacia los costados.
        */}
        <p className="min-w-0 flex-1 text-sm leading-relaxed" style={{ overflowWrap: "anywhere" }}>
          <strong id={idTitulo} style={{ color: "var(--acento-texto)" }}>
            Aviso importante.
          </strong>{" "}
          {trozosDelAviso(texto).map((trozo, indice) => {
            if (trozo.tipo === "texto") return <Fragment key={indice}>{trozo.texto}</Fragment>;
            const clases = "font-semibold underline underline-offset-2";
            // Subrayado siempre: el enlace no se distingue solo por el color.
            if (trozo.interno && !esVistaPrevia) {
              return (
                <Link key={indice} href={trozo.href} className={clases}>
                  {trozo.texto}
                </Link>
              );
            }
            // En la vista previa todo enlace abre otra pestaña: seguirlo desde el
            // panel dejaba atras el aviso a medio escribir.
            return (
              <a
                key={indice}
                href={trozo.href}
                className={clases}
                {...(esVistaPrevia ? { target: "_blank", rel: "noopener" } : {})}
              >
                {trozo.texto}
                {esVistaPrevia && <span className="sr-only"> (se abre en otra pestaña)</span>}
              </a>
            );
          })}
        </p>
        {/*
          32x32: por arriba de los 24x24 que pide WCAG 2.2 (2.5.8) para un
          control suelto. El icono va en --texto-suave, que da mas de 3:1 contra
          la banda en los dos temas (1.4.11).
        */}
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar el aviso"
          title={esVistaPrevia ? "En el sitio, este botón cierra el aviso para esa visita" : "Cerrar el aviso"}
          aria-hidden={esVistaPrevia || undefined}
          tabIndex={esVistaPrevia ? -1 : undefined}
          className="-my-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-[var(--fondo-suave)]"
          style={{ color: "var(--texto-suave)" }}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </Contenedor>
  );
}
