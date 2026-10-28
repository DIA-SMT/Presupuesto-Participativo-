/**
 * Donde va el cartel del recorrido, como cuenta pura: recibe las medidas y
 * devuelve la posicion. Separada del componente (./recorrido.tsx) para
 * probarla sin navegador (scripts/tests/recorrido-panel.test.ts).
 *
 * Todo se cuenta contra la parte de la pagina que SE VE (la "ventana", que en
 * el navegador es `visualViewport`), no contra `innerWidth`/`innerHeight`. En
 * el celular, una pagina mas ancha que la pantalla (la bandeja lo es) agranda
 * el area de la pagina: con 375 px a la vista, `innerWidth` daba 918 y el
 * cartel "al pie" quedaba mil pixeles mas abajo de lo que se veia. El
 * componente pasa todo en coordenadas de la ventana visible y le suma su
 * corrimiento al final.
 */

/** Un rectangulo, en px desde la esquina de la ventana visible. */
export type Caja = { top: number; left: number; width: number; height: number };

/** Lo que se ve de la pagina. */
export type Ventana = { ancho: number; alto: number };

/** Aire entre el elemento y el borde del recorte iluminado. */
export const AIRE = 6;
/** Margen del cartel con los bordes de la ventana. */
export const MARGEN = 16;
/** Desde este ancho el cartel flota junto al elemento; abajo de el, va al pie. */
export const ANCHO_FLOTANTE = 640;
/** El ancho del cartel cuando entra (24rem). */
export const ANCHO_CARTEL = 384;
/** Distancia entre el recorte y el cartel. */
const SEPARACION = 12;

/** El ancho del cartel: el suyo, o lo que deje la ventana con sus margenes. */
export function anchoDelCartel(ventana: Ventana): number {
  return Math.min(ANCHO_CARTEL, ventana.ancho - 2 * MARGEN);
}

/**
 * La esquina de arriba a la izquierda del cartel, en la ventana visible.
 *
 * Debajo del elemento si entra; si no, arriba; si el elemento ocupa casi toda
 * la ventana, abajo a la derecha, encima. Sin elemento, centrado. En una
 * ventana angosta, siempre al pie (y el ancho, `anchoDelCartel`, ya ocupa
 * todo).
 */
export function ubicarCartel(
  objetivo: Caja | null,
  cartel: { ancho: number; alto: number },
  ventana: Ventana,
): { top: number; left: number } {
  const alPie = Math.round(ventana.alto - MARGEN - cartel.alto);

  if (ventana.ancho < ANCHO_FLOTANTE) return { left: MARGEN, top: alPie };

  if (!objetivo) {
    return {
      left: Math.round((ventana.ancho - cartel.ancho) / 2),
      top: Math.round(Math.max(MARGEN, (ventana.alto - cartel.alto) / 2)),
    };
  }

  const centrado = objetivo.left + objetivo.width / 2 - cartel.ancho / 2;
  const left = Math.round(
    Math.min(Math.max(centrado, MARGEN), ventana.ancho - cartel.ancho - MARGEN),
  );

  const abajo = objetivo.top + objetivo.height + AIRE + SEPARACION;
  if (abajo + cartel.alto + MARGEN <= ventana.alto) return { left, top: Math.round(abajo) };

  const arriba = objetivo.top - AIRE - SEPARACION - cartel.alto;
  if (arriba >= MARGEN) return { left, top: Math.round(arriba) };

  return { left: Math.round(ventana.ancho - MARGEN - cartel.ancho), top: alPie };
}
