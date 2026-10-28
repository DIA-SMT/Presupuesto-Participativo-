"use client";

/**
 * El recorrido guiado del panel: un cartel por paso que resalta una parte de
 * la pantalla y cuenta para que sirve, segun el rol de la cuenta. Los pasos y
 * sus textos viven en ./pasos.ts.
 *
 * Se abre solo la primera vez que se entra al panel desde este navegador
 * (despues de elegir la contrasena: con la provisoria el layout no lo monta) y
 * se vuelve a ver con el
 * boton "Recorrido" de la cabecera, que avisa por un evento de `window`: la
 * cabecera y esto son hermanos en el layout y no comparten estado.
 *
 * POR QUE PROPIO Y NO UNA LIBRERIA: el recorrido cruza pantallas. Cada paso
 * dice en que ruta vive; si la persona esta en otra, se navega con el router y
 * se espera a que el elemento aparezca. Eso habia que escribirlo igual, y lo
 * demas (un recorte iluminado y un cartel) son pocas lineas. Asi tambien usa
 * los colores del sitio en los dos temas sin pelear con estilos ajenos.
 *
 * Como funciona en la pantalla:
 *  - Una capa fija tapa la pagina y se come los clicks: mientras el recorrido
 *    esta abierto no se aprieta nada sin querer. El recorte iluminado es un
 *    div del tamaño del elemento con una sombra enorme alrededor, que es lo que
 *    oscurece el resto.
 *  - El elemento se busca por `data-recorrido`, probando las anclas del paso
 *    en orden. Si ninguna aparece en ESPERA_MS (la idea no esta abierta, la
 *    edicion esta plegada), el cartel va centrado y sin recorte: los textos
 *    estan escritos para leerse igual.
 *  - El cartel va debajo del elemento si entra, arriba si no, y si el elemento
 *    ocupa toda la pantalla, en la esquina. En el celular va abajo, a lo ancho.
 *  - Es un dialogo modal: el foco entra al titulo en cada paso, Tab da vueltas
 *    adentro del cartel, Escape lo cierra, y al cerrar el foco vuelve a donde
 *    estaba.
 *
 * Cerrarlo de cualquier forma (terminar, saltear, Escape) lo anota como visto
 * en el almacenamiento del navegador (CLAVE_VISTO), y nada mas: no se guarda
 * en la base ni se le avisa a nadie. A proposito: el equipo no necesita saber
 * quien lo hizo, y asi no hace falta ninguna columna ni migracion. Si el
 * almacenamiento no anda (ventana privada, sitio bloqueado), el recorrido se
 * abre en cada carga y se cierra con "Ahora no": molesto, pero nada se rompe.
 */
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { RolAdmin } from "@/db/queries";
import { pasosPara } from "./pasos";
import { AIRE, anchoDelCartel, ubicarCartel, type Caja } from "./ubicacion";

/** Donde el navegador anota que ya mostro el recorrido. */
const CLAVE_VISTO = "pp-smt:recorrido-visto";

/** El evento con el que la cabecera pide abrir el recorrido. */
export const EVENTO_RECORRIDO = "pp-smt:recorrido";

/** Cuanto se espera a que un elemento aparezca despues de navegar. */
const ESPERA_MS = 2500;
/** Aire entre la cabecera fija del sitio y el elemento señalado. */
const AIRE_ARRIBA = 24;

export default function RecorridoPanel({ rol }: { rol: RolAdmin }) {
  const pasos = useMemo(() => pasosPara(rol), [rol]);
  const router = useRouter();
  const pathname = usePathname();

  // Arranca abierto si este navegador todavia no lo mostro. Se decide una vez,
  // al montar: el layout no se vuelve a montar al navegar. En el servidor no
  // hay almacenamiento, pero ahi tampoco se dibuja nada (ver `enNavegador`).
  const [abierto, setAbierto] = useState(() => typeof window !== "undefined" && !yaVisto());
  const [indice, setIndice] = useState(0);
  const [objetivo, setObjetivo] = useState<Caja | null>(null);
  // El portal necesita `document`: en el servidor y al hidratar no se dibuja.
  const enNavegador = useSyncExternalStore(
    suscribirNada,
    () => true,
    () => false,
  );

  const elemento = useRef<HTMLElement | null>(null);
  const foco = useRef<HTMLElement | null>(null);

  const abrir = useCallback(() => {
    foco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    irA(0);
    setAbierto(true);
  }, []);

  /** Cambia de paso. El recorte del paso anterior se va en el mismo render. */
  function irA(nuevo: number) {
    elemento.current = null;
    setObjetivo(null);
    setIndice(nuevo);
  }

  const cerrar = useCallback(() => {
    setAbierto(false);
    setObjetivo(null);
    elemento.current = null;
    anotarVisto();
    foco.current?.focus();
  }, []);

  useEffect(() => {
    window.addEventListener(EVENTO_RECORRIDO, abrir);
    return () => window.removeEventListener(EVENTO_RECORRIDO, abrir);
  }, [abrir]);

  // Escape cierra desde cualquier lado, no solo con el foco en el cartel: un
  // click en la capa de atras se lo puede haber llevado al body.
  useEffect(() => {
    if (!abierto) return;
    const alApretar = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      cerrar();
    };
    document.addEventListener("keydown", alApretar);
    return () => document.removeEventListener("keydown", alApretar);
  }, [abierto, cerrar]);

  const paso = abierto ? pasos[indice] : null;

  // Llevar a la pantalla del paso y buscar su elemento.
  useEffect(() => {
    if (!paso) return;

    if (paso.ruta !== null && pathname !== paso.ruta) {
      router.push(paso.ruta);
      return; // el efecto vuelve a correr cuando cambie `pathname`
    }
    if (paso.anclas.length === 0) return;

    const tope = Date.now() + ESPERA_MS;
    let temporizador: number | undefined;
    const buscar = () => {
      const encontrado = buscarAncla(paso.anclas);
      if (encontrado) {
        elemento.current = encontrado;
        // El elemento sube cerca del borde de arriba, para que abajo quede
        // lugar para el cartel. Centrado, uno de 400 px dejaba 250 de cada lado
        // y el cartel terminaba encima. Si los dos no entran juntos, el cartel
        // va a la esquina (ubicacion.ts).
        // De un salto y no suave: el html tiene `scroll-behavior: smooth`, y
        // con el desplazamiento animado el recorte y el cartel se median a
        // mitad de camino. "instant" le gana a esa regla; "auto" no.
        // Se cuenta desde lo que se ve (ver ventanaVisible): la cabecera solo
        // tapa la parte que cae adentro de la ventana visible.
        const caja = encontrado.getBoundingClientRect();
        const ventana = ventanaVisible();
        const tapa = Math.max(0, bordeDeLaCabecera() - ventana.y);
        window.scrollTo({
          top: Math.max(0, window.scrollY + caja.top - ventana.y - tapa - AIRE_ARRIBA),
          behavior: "instant",
        });
        setObjetivo(cajaDe(encontrado));
        return;
      }
      if (Date.now() < tope) temporizador = window.setTimeout(buscar, 100);
    };
    // Un turno despues: recien navegado, la pantalla nueva puede no estar.
    temporizador = window.setTimeout(buscar, 0);
    return () => window.clearTimeout(temporizador);
  }, [paso, pathname, router]);

  // El recorte sigue al elemento cuando la pagina se mueve: la persona que hace
  // scroll, la ventana que cambia de tamaño, una imagen que termina de cargar.
  useEffect(() => {
    if (!abierto) return;
    let cuadro = 0;
    const seguir = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        if (elemento.current) setObjetivo(cajaDe(elemento.current));
        else setObjetivo(null);
      });
    };
    window.addEventListener("scroll", seguir, { capture: true, passive: true });
    window.addEventListener("resize", seguir);
    window.visualViewport?.addEventListener("resize", seguir);
    window.visualViewport?.addEventListener("scroll", seguir);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("scroll", seguir, { capture: true });
      window.removeEventListener("resize", seguir);
      window.visualViewport?.removeEventListener("resize", seguir);
      window.visualViewport?.removeEventListener("scroll", seguir);
    };
  }, [abierto]);

  if (!enNavegador || !paso) return null;

  const ultimo = indice === pasos.length - 1;
  return createPortal(
    <>
      {/* La capa que se come los clicks. Sin recorte, tambien oscurece. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[60]"
        style={{ background: objetivo ? "transparent" : "var(--velo-recorrido)" }}
      />
      {objetivo && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[61] rounded-2xl"
          style={{
            top: objetivo.top - AIRE,
            left: objetivo.left - AIRE,
            width: objetivo.width + 2 * AIRE,
            height: objetivo.height + 2 * AIRE,
            boxShadow: "0 0 0 9999px var(--velo-recorrido)",
            outline: "3px solid var(--marca-texto)",
          }}
        />
      )}
      <Cartel
        key={paso.id}
        seccion={paso.seccion}
        titulo={paso.titulo}
        texto={paso.textoDelRol}
        numero={indice + 1}
        total={pasos.length}
        objetivo={objetivo}
        onAnterior={indice > 0 ? () => irA(indice - 1) : null}
        onSiguiente={ultimo ? cerrar : () => irA(indice + 1)}
        onCerrar={cerrar}
      />
    </>,
    document.body,
  );
}

/** El cartel de un paso. Se monta de nuevo en cada paso (`key`), y eso le lleva el foco. */
function Cartel({
  seccion,
  titulo,
  texto,
  numero,
  total,
  objetivo,
  onAnterior,
  onSiguiente,
  onCerrar,
}: {
  seccion: string;
  titulo: string;
  texto: string;
  numero: number;
  total: number;
  objetivo: Caja | null;
  onAnterior: (() => void) | null;
  onSiguiente: () => void;
  onCerrar: () => void;
}) {
  const cartel = useRef<HTMLDivElement>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const [lugar, setLugar] = useState<{ top: number; left: number } | null>(null);
  // Se lee en cada render: solo se dibuja en el navegador (el portal espera).
  const ancho = anchoDelCartel(ventanaVisible());

  const primero = numero === 1;
  const ultimo = numero === total;

  // El foco entra al titulo recien cuando el cartel ya esta ubicado: mientras
  // se mide va con `visibility: hidden`, y un elemento oculto no toma el foco.
  const enfocado = useRef(false);
  useEffect(() => {
    if (!lugar || enfocado.current) return;
    enfocado.current = true;
    encabezado.current?.focus();
  }, [lugar]);

  // Se mide el cartel ya dibujado y se lo ubica antes de pintar: sin esto
  // aparecia un instante en la esquina. La cuenta es en la ventana visible
  // (ubicacion.ts explica por que) y al final se le suma su corrimiento,
  // porque `position: fixed` se mide desde el area entera de la pagina.
  useLayoutEffect(() => {
    const nodo = cartel.current;
    if (!nodo) return;
    const ubicar = () => {
      const ventana = ventanaVisible();
      const enVentana = objetivo && {
        ...objetivo,
        top: objetivo.top - ventana.y,
        left: objetivo.left - ventana.x,
      };
      const { top, left } = ubicarCartel(
        enVentana,
        { ancho: nodo.offsetWidth, alto: nodo.offsetHeight },
        ventana,
      );
      setLugar({ top: top + ventana.y, left: left + ventana.x });
    };
    ubicar();
    // El alto cambia con el ancho (el texto se acomoda): se vuelve a ubicar.
    const observador = new ResizeObserver(ubicar);
    observador.observe(nodo);
    window.addEventListener("resize", ubicar);
    window.visualViewport?.addEventListener("resize", ubicar);
    window.visualViewport?.addEventListener("scroll", ubicar);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", ubicar);
      window.visualViewport?.removeEventListener("resize", ubicar);
      window.visualViewport?.removeEventListener("scroll", ubicar);
    };
  }, [objetivo]);

  function teclas(evento: React.KeyboardEvent) {
    if (evento.key !== "Tab" || !cartel.current) return;
    // Tab da vueltas adentro del cartel: la pagina de atras esta tapada.
    const enfocables = Array.from(cartel.current.querySelectorAll<HTMLElement>("button"));
    if (enfocables.length === 0) return;
    const primerBoton = enfocables[0];
    const ultimoBoton = enfocables[enfocables.length - 1];
    const actual = document.activeElement;
    if (evento.shiftKey && (actual === primerBoton || actual === encabezado.current)) {
      evento.preventDefault();
      ultimoBoton.focus();
    } else if (!evento.shiftKey && actual === ultimoBoton) {
      evento.preventDefault();
      primerBoton.focus();
    }
  }

  return (
    <div
      ref={cartel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recorrido-titulo"
      aria-describedby="recorrido-texto"
      onKeyDown={teclas}
      className="fixed z-[62] rounded-2xl p-5"
      style={{
        ...(lugar ?? { visibility: "hidden" }),
        width: ancho,
        background: "var(--fondo-tarjeta)",
        color: "var(--texto)",
        border: "1px solid var(--borde)",
        boxShadow: "0 12px 32px rgba(8, 12, 20, 0.28)",
      }}
    >
      <p className="text-xs font-semibold" style={{ color: "var(--marca-texto)" }}>
        {seccion}
        <span style={{ color: "var(--texto-suave)", fontWeight: 400 }}>
          {" "}
          · paso {numero} de {total}
        </span>
      </p>
      <h2
        id="recorrido-titulo"
        ref={encabezado}
        tabIndex={-1}
        className="mt-1 text-base font-bold outline-none"
      >
        {titulo}
      </h2>
      <p id="recorrido-texto" className="mt-1.5 text-sm leading-relaxed">
        {texto}
      </p>

      {/* El avance, para saber cuanto falta. Decorativo: el numero ya lo dice. */}
      <div
        aria-hidden="true"
        className="mt-4 h-1 overflow-hidden rounded-full"
        style={{ background: "var(--fondo-suave)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${(numero / total) * 100}%`, background: "var(--marca-texto)" }}
        />
      </div>

      {/* En una fila aun en el celular: con "Saltar el recorrido" no entraba y
          Siguiente caia solo al renglon de abajo. */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onCerrar}
          className="mr-auto px-1 py-2 text-sm underline"
          style={{ color: "var(--texto-suave)" }}
        >
          {primero ? "Ahora no" : "Saltar"}
        </button>
        {onAnterior && (
          <button
            type="button"
            onClick={onAnterior}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold"
            style={{ border: "1px solid var(--borde-control)", background: "transparent" }}
          >
            Anterior
          </button>
        )}
        <button
          type="button"
          onClick={onSiguiente}
          className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          {primero ? "Empezar" : ultimo ? "Terminar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

/**
 * El boton de la cabecera que vuelve a abrir el recorrido. Va en el bloque de
 * la cuenta, con el mismo estilo que "Mi contraseña" y Salir.
 */
export function BotonRecorrido() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_RECORRIDO))}
      className="boton-cuenta"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5z" />
      </svg>
      Recorrido
    </button>
  );
}

/**
 * Si este navegador ya mostro el recorrido. Todo acceso al almacenamiento va
 * en try/catch: en una ventana privada o con el sitio bloqueado, leerlo tira.
 */
function yaVisto(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_VISTO) !== null;
  } catch {
    return false;
  }
}

function anotarVisto() {
  try {
    window.localStorage.setItem(CLAVE_VISTO, "1");
  } catch {
    // Sin almacenamiento, el recorrido vuelve a abrirse en la proxima carga.
  }
}

/** Para `useSyncExternalStore`: "estar en el navegador" no cambia nunca. */
function suscribirNada() {
  return () => {};
}

/**
 * La parte de la pagina que se ve, y su corrimiento dentro del area de la
 * pagina. Casi siempre coincide con la ventana; en el celular, con una pagina
 * mas ancha que la pantalla, `innerWidth` mide el area agrandada y no lo que
 * se ve.
 */
function ventanaVisible(): { ancho: number; alto: number; x: number; y: number } {
  const visual = window.visualViewport;
  if (!visual) return { ancho: window.innerWidth, alto: window.innerHeight, x: 0, y: 0 };
  return { ancho: visual.width, alto: visual.height, x: visual.offsetLeft, y: visual.offsetTop };
}

/**
 * Hasta donde tapa la cabecera del sitio, que queda pegada arriba (`sticky`)
 * al hacer scroll: sin descontarla, lo señalado quedaba debajo de ella.
 */
function bordeDeLaCabecera(): number {
  const cabecera = document.querySelector<HTMLElement>("header");
  if (!cabecera) return 0;
  const posicion = getComputedStyle(cabecera).position;
  if (posicion !== "sticky" && posicion !== "fixed") return 0;
  return Math.max(0, cabecera.getBoundingClientRect().bottom);
}

/** El primer elemento visible de la lista de anclas, o null. */
function buscarAncla(anclas: string[]): HTMLElement | null {
  for (const ancla of anclas) {
    const encontrado = document.querySelector<HTMLElement>(`[data-recorrido="${ancla}"]`);
    if (!encontrado) continue;
    const caja = encontrado.getBoundingClientRect();
    // Un elemento sin tamaño (los graficos ocultos dejan su contenedor vacio)
    // no sirve para señalar: se prueba la siguiente ancla.
    if (caja.width > 0 && caja.height > 0) return encontrado;
  }
  return null;
}

function cajaDe(elemento: HTMLElement): Caja {
  const { top, left, width, height } = elemento.getBoundingClientRect();
  return { top, left, width, height };
}
