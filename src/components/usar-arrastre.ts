"use client";

/**
 * Arrastre de un widget flotante, con Pointer Events.
 *
 * Lo usa el chat de consultas (src/components/Chat.tsx), que esta fijo abajo a
 * la derecha y tapa contenido: en el panel de administracion se come justo la
 * esquina donde caen los botones de las fichas. El hook no sabe nada del chat.
 * Maneja un desplazamiento en pixeles CONTRA la posicion que ya le da el CSS
 * (por eso el lugar por defecto es siempre {x: 0, y: 0}), lo acota al viewport y
 * lo recuerda en localStorage.
 *
 * Decisiones que conviene no deshacer:
 *
 * - Pointer Events y no mouse + touch: un solo camino para mouse, lapiz y dedo.
 *   El agarre lleva `touch-action: none` para que arrastrar con el dedo mueva el
 *   widget en lugar de scrollear la pagina, y se usa captura del puntero para
 *   que el gesto siga llegando al agarre aunque el dedo se le vaya encima.
 *
 * - Umbral de UMBRAL px para separar el clic del arrastre. Si la persona solo
 *   toca el lanzador, el chat abre como siempre y no queda corrido 2 px; el
 *   consumidor pregunta `fueArrastre()` en su onClick.
 *
 * - Un solo desplazamiento para todos los elementos que se mueven (el lanzador
 *   y el panel abierto viajan juntos), y el acotado se calcula sobre la caja
 *   que los contiene a todos: el panel abierto es mucho mas alto que el
 *   lanzador, asi que abrir o cerrar puede obligar a reacomodar.
 *
 * - Menos de 40rem de ancho (el breakpoint `sm` de Tailwind 4) el panel abierto
 *   ocupa todo el ancho de la pantalla (`inset-x-3`): moverlo en horizontal solo
 *   dejaria un hueco a un costado y le rompe el layout. Ahi el arrastre es SOLO
 *   VERTICAL (el eje x se fuerza a 0), que es el movimiento que hace falta en
 *   el telefono. Consecuencia asumida: si se arrastra en angosto, el x que habia
 *   guardado una pantalla ancha se pierde.
 *
 * - La transicion del transform se apaga mientras se arrastra (si no, el
 *   elemento va atrasado del dedo) y se prende al soltar, para que el acomodado
 *   al viewport se vea suave. Con `prefers-reduced-motion` no hay animacion: el
 *   bloque global de src/app/globals.css anula toda transicion con !important, y
 *   eso tambien le gana a estos estilos en linea.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as EventoTeclado,
  type PointerEvent as EventoPuntero,
} from "react";

export type Desplazamiento = { x: number; y: number };

/** Lugar por defecto: el que le da el CSS al elemento, sin desplazar nada. */
const SIN_DESPLAZAR: Desplazamiento = { x: 0, y: 0 };

/** Pixeles que hay que recorrer para que el gesto cuente como arrastre. */
const UMBRAL = 4;

/** Paso del teclado, y el paso grande con Shift. */
const PASO = 16;
const PASO_GRANDE = 64;

/** Aire minimo que queda entre el widget y el borde de la pantalla. */
const MARGEN = 8;

/** Mismo valor que el breakpoint `sm` de Tailwind 4. */
const CONSULTA_ANCHA = "(min-width: 40rem)";

/**
 * Transicion del acomodado. Incluye `filter` porque el estilo en linea le gana
 * a la clase `transition` de Tailwind: sin esto el lanzador perderia el suavizado
 * de su `hover:brightness-110`.
 */
const TRANSICION = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), filter 150ms ease-out";

type Gesto = {
  puntero: number;
  desdeX: number;
  desdeY: number;
  origen: Desplazamiento;
  /** Ya paso el umbral: de aca en adelante es un arrastre y no un clic. */
  paso: boolean;
};

export type Arrastre = {
  /** true mientras hay un dedo o un boton apretado moviendo el widget. */
  arrastrando: boolean;
  /** `ref` de cada elemento que se mueve: se miden juntos para acotar. */
  registrar: (elemento: HTMLElement | null) => void;
  /** Estilo de los elementos que se mueven (transform y transicion). */
  estiloMovil: CSSProperties;
  /** Handlers de la zona de agarre (puntero y teclado). */
  propsAgarre: PropsAgarre;
  /** Estilo de la zona de agarre (cursor, touch-action, sin seleccion). */
  estiloAgarre: CSSProperties;
  /** Consume el ultimo gesto: true si fue arrastre, o sea que NO es un clic. */
  fueArrastre: () => boolean;
};

type PropsAgarre = {
  onPointerDown: (evento: EventoPuntero<HTMLElement>) => void;
  onPointerMove: (evento: EventoPuntero<HTMLElement>) => void;
  onPointerUp: (evento: EventoPuntero<HTMLElement>) => void;
  onPointerCancel: (evento: EventoPuntero<HTMLElement>) => void;
  onLostPointerCapture: (evento: EventoPuntero<HTMLElement>) => void;
  onKeyDown: (evento: EventoTeclado<HTMLElement>) => void;
};

/**
 * Valor acotado al rango. Si el rango viene invertido (el widget es mas grande
 * que la pantalla, algo que solo pasa en ventanas de menos de 345 px de alto) se
 * vuelve al lugar por defecto, que el CSS ya garantiza visible.
 */
function entre(valor: number, minimo: number, maximo: number): number {
  if (minimo > maximo) return 0;
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Cuanto esta desplazado AHORA el elemento en el DOM, leido del estilo aplicado.
 *
 * No se usa el desplazamiento que el hook cree que puso: React puede no haber
 * pintado todavia el ultimo cambio de estado, y durante la transicion el valor
 * aplicado es el intermedio de la animacion. Restarle ESTE valor a la caja
 * medida da la posicion que da el CSS en cualquiera de los dos casos.
 */
function desplazamientoAplicado(elemento: HTMLElement): Desplazamiento {
  const transformado = getComputedStyle(elemento).transform;
  if (!transformado || transformado === "none") return SIN_DESPLAZAR;
  try {
    const matriz = new DOMMatrixReadOnly(transformado);
    return { x: matriz.e, y: matriz.f };
  } catch {
    // Un transform que no se puede leer como matriz: se asume sin desplazar.
    return SIN_DESPLAZAR;
  }
}

/** Lee la posicion guardada. Cualquier cosa que no sea {x, y} numericos se descarta. */
function leerGuardado(clave: string): Desplazamiento | null {
  try {
    const crudo = localStorage.getItem(clave);
    if (!crudo) return null;
    const valor: unknown = JSON.parse(crudo);
    if (!valor || typeof valor !== "object") return null;
    const { x, y } = valor as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    // localStorage bloqueado o JSON roto: se arranca en el lugar por defecto.
    return null;
  }
}

export function usarArrastre({
  clave,
  abierto,
}: {
  /** Clave de localStorage. Va con el prefijo del proyecto ("pp-"). */
  clave: string;
  /**
   * Cambia el tamano del widget (el chat abierto es mucho mas alto que el
   * lanzador): cada vez que cambia se vuelve a acotar la posicion.
   */
  abierto: boolean;
}): Arrastre {
  const [desplazamiento, setDesplazamiento] = useState<Desplazamiento>(SIN_DESPLAZAR);
  const [arrastrando, setArrastrando] = useState(false);

  /** Elementos que se mueven, para medir la caja que los contiene a todos. */
  const moviles = useRef<Set<HTMLElement>>(new Set());
  /** Espejo del desplazamiento aplicado, para leerlo sin depender del render. */
  const actual = useRef<Desplazamiento>(SIN_DESPLAZAR);
  const gesto = useRef<Gesto | null>(null);
  const arrastro = useRef(false);

  const registrar = useCallback((elemento: HTMLElement | null) => {
    if (!elemento) return;
    moviles.current.add(elemento);
    // React 19 acepta una limpieza del ref callback: el panel se desmonta al
    // cerrar el chat y su caja no tiene que seguir contando para el acotado.
    return () => {
      moviles.current.delete(elemento);
    };
  }, []);

  const soloVertical = useCallback(() => !window.matchMedia(CONSULTA_ANCHA).matches, []);

  /** Acota un desplazamiento para que el widget entero quede dentro de la pantalla. */
  const acotar = useCallback(
    (pedido: Desplazamiento): Desplazamiento => {
      let izquierda = Infinity;
      let arriba = Infinity;
      let derecha = -Infinity;
      let abajo = -Infinity;

      for (const elemento of moviles.current) {
        const caja = elemento.getBoundingClientRect();
        // getBoundingClientRect ya trae el transform aplicado: se le resta para
        // razonar sobre la posicion que le da el CSS, que es la que no cambia.
        const puesto = desplazamientoAplicado(elemento);
        izquierda = Math.min(izquierda, caja.left - puesto.x);
        arriba = Math.min(arriba, caja.top - puesto.y);
        derecha = Math.max(derecha, caja.right - puesto.x);
        abajo = Math.max(abajo, caja.bottom - puesto.y);
      }
      // Todavia no hay nada montado (o nada medible): no se mueve nada.
      if (!Number.isFinite(izquierda)) return SIN_DESPLAZAR;

      // clientWidth/clientHeight y no innerWidth/innerHeight: descuentan la
      // barra de scroll clasica, que es justo lo que hace el `position: fixed`.
      const raiz = document.documentElement;
      return {
        x: soloVertical()
          ? 0
          : entre(pedido.x, MARGEN - izquierda, raiz.clientWidth - MARGEN - derecha),
        y: entre(pedido.y, MARGEN - arriba, raiz.clientHeight - MARGEN - abajo),
      };
    },
    [soloVertical],
  );

  /** Aplica el desplazamiento (redondeado, para no dejar el texto borroso). */
  const aplicar = useCallback((siguiente: Desplazamiento): Desplazamiento => {
    const limpio = { x: Math.round(siguiente.x), y: Math.round(siguiente.y) };
    actual.current = limpio;
    setDesplazamiento(limpio);
    return limpio;
  }, []);

  const guardar = useCallback(
    (valor: Desplazamiento) => {
      try {
        localStorage.setItem(clave, JSON.stringify(valor));
      } catch {
        // Sin persistencia: el arrastre igual funciona en esta visita.
      }
    },
    [clave],
  );

  // Restaura la posicion guardada. Corre despues del primer pintado, cuando el
  // widget ya se puede medir: si lo guardado no entra en esta pantalla se
  // descarta entero y el widget arranca en su lugar por defecto (no se borra la
  // clave: en una ventana mas grande vuelve a servir).
  useEffect(() => {
    const guardado = leerGuardado(clave);
    if (!guardado) return;
    const pedido = soloVertical() ? { x: 0, y: guardado.y } : guardado;
    const cabe = acotar(pedido);
    if (Math.abs(cabe.x - pedido.x) > 1 || Math.abs(cabe.y - pedido.y) > 1) return;
    aplicar(cabe);
  }, [clave, acotar, aplicar, soloVertical]);

  // Vuelve a acotar cuando cambia el tamano de la ventana y cuando el widget
  // cambia de tamano (el chat se abre o se cierra).
  useEffect(() => {
    let cuadro = 0;
    const reacomodar = () => {
      cancelAnimationFrame(cuadro);
      // Un cuadro de espera: el panel recien montado tiene que estar medido.
      cuadro = requestAnimationFrame(() => aplicar(acotar(actual.current)));
    };
    reacomodar();
    window.addEventListener("resize", reacomodar);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("resize", reacomodar);
    };
  }, [abierto, acotar, aplicar]);

  // Mientras se arrastra: nada de seleccionar texto y cursor de arrastre en toda
  // la pagina, para que el gesto no parezca una seleccion fallida.
  useEffect(() => {
    if (!arrastrando) return;
    const cuerpo = document.body.style;
    const seleccionPrevia = cuerpo.userSelect;
    const cursorPrevio = cuerpo.cursor;
    cuerpo.userSelect = "none";
    cuerpo.cursor = "grabbing";
    return () => {
      cuerpo.userSelect = seleccionPrevia;
      cuerpo.cursor = cursorPrevio;
    };
  }, [arrastrando]);

  const alBajarPuntero = useCallback((evento: EventoPuntero<HTMLElement>) => {
    // Solo el boton principal del mouse. El dedo y el lapiz reportan button 0.
    if (evento.button !== 0) return;
    gesto.current = {
      puntero: evento.pointerId,
      desdeX: evento.clientX,
      desdeY: evento.clientY,
      origen: actual.current,
      paso: false,
    };
    arrastro.current = false;
    // Con la captura, el resto del gesto llega a este mismo elemento aunque el
    // dedo se salga del agarre o de la ventana.
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }, []);

  const alMoverPuntero = useCallback(
    (evento: EventoPuntero<HTMLElement>) => {
      const enCurso = gesto.current;
      if (!enCurso || enCurso.puntero !== evento.pointerId) return;
      const dx = evento.clientX - enCurso.desdeX;
      const dy = evento.clientY - enCurso.desdeY;
      if (!enCurso.paso) {
        // Todavia puede ser un clic: no se mueve nada hasta pasar el umbral.
        if (Math.hypot(dx, dy) < UMBRAL) return;
        enCurso.paso = true;
        arrastro.current = true;
        setArrastrando(true);
      }
      aplicar(acotar({ x: enCurso.origen.x + dx, y: enCurso.origen.y + dy }));
    },
    [acotar, aplicar],
  );

  /** Fin del gesto: suelta la captura y, si hubo arrastre, guarda la posicion. */
  const alTerminar = useCallback(
    (evento: EventoPuntero<HTMLElement>) => {
      const enCurso = gesto.current;
      if (!enCurso || enCurso.puntero !== evento.pointerId) return;
      gesto.current = null;
      if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
        evento.currentTarget.releasePointerCapture(evento.pointerId);
      }
      // Fue un clic: no hay nada que acomodar ni que guardar.
      if (!enCurso.paso) return;
      setArrastrando(false);
      guardar(aplicar(acotar(actual.current)));
    },
    [acotar, aplicar, guardar],
  );

  const alTeclado = useCallback(
    (evento: EventoTeclado<HTMLElement>) => {
      // Un gesto de teclado no arrastra nada: se limpia la marca del gesto
      // anterior. Hace falta porque un arrastre que se suelta lejos del lanzador
      // no dispara el clic que la consumiria, y el Enter siguiente quedaria
      // tragado.
      arrastro.current = false;
      if (evento.key === "Home") {
        evento.preventDefault();
        guardar(aplicar(SIN_DESPLAZAR));
        return;
      }
      const paso = evento.shiftKey ? PASO_GRANDE : PASO;
      const saltos: Record<string, Desplazamiento> = {
        ArrowLeft: { x: -paso, y: 0 },
        ArrowRight: { x: paso, y: 0 },
        ArrowUp: { x: 0, y: -paso },
        ArrowDown: { x: 0, y: paso },
      };
      const salto = saltos[evento.key];
      if (!salto) return;
      // Sin preventDefault las flechas scrollean la pagina de fondo.
      evento.preventDefault();
      const desde = actual.current;
      guardar(aplicar(acotar({ x: desde.x + salto.x, y: desde.y + salto.y })));
    },
    [acotar, aplicar, guardar],
  );

  const fueArrastre = useCallback(() => {
    const hubo = arrastro.current;
    // Se consume al leerlo: un clic de teclado posterior no tiene que quedar
    // pisado por el arrastre anterior.
    arrastro.current = false;
    return hubo;
  }, []);

  return {
    arrastrando,
    registrar,
    estiloMovil: {
      transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)`,
      transition: arrastrando ? "none" : TRANSICION,
      willChange: arrastrando ? "transform" : undefined,
    },
    propsAgarre: {
      onPointerDown: alBajarPuntero,
      onPointerMove: alMoverPuntero,
      onPointerUp: alTerminar,
      onPointerCancel: alTerminar,
      onLostPointerCapture: alTerminar,
      onKeyDown: alTeclado,
    },
    estiloAgarre: {
      // El dedo sobre el agarre mueve el widget, no scrollea la pagina.
      touchAction: "none",
      cursor: arrastrando ? "grabbing" : "grab",
      userSelect: "none",
    },
    fueArrastre,
  };
}
