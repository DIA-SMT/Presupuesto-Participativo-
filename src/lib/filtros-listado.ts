/**
 * Lo que hacen los filtros del listado de /proyectos (src/components/Filtros.tsx)
 * cuando la persona escribe, elige un selector o toca "Limpiar filtros": que URL
 * pedir y cuando. Vive aparte del componente para poder probarlo sin navegador
 * (scripts/tests/filtros-listado.test.ts). Es logica pura: sin React ni Next.
 *
 * Dos cosas que el componente hacia mal y por las que esto existe:
 *
 *  - La busqueda por texto espera a que la persona deje de escribir. Antes esa
 *    espera la programaba un efecto que dependia solo del texto, con los
 *    parametros del render en que se creo: "Limpiar filtros" (que pone el texto
 *    en blanco) disparaba una busqueda vacia sobre la URL vieja y, a los 350 ms,
 *    los demas filtros volvian solos. Aca la espera es un temporizador que se
 *    cancela antes de cualquier otra navegacion.
 *  - Cada cambio partia de `useSearchParams`, que recien cambia cuando la
 *    navegacion termina (Next la hace en una transicion que espera al
 *    servidor). Elegir un filtro mientras la anterior seguia en camino partia
 *    de la URL de antes y la pisaba. Aca cada cambio parte de la ultima URL
 *    pedida, y la URL confirmada (el boton de atras, un enlace, la navegacion
 *    propia que termino) se avisa con `sincronizar`.
 *
 * Y una tercera: el campo Buscar leia `q` una sola vez, al montar. Next no
 * vuelve a montar la pagina cuando solo cambian los parametros, asi que el link
 * "Proyectos" del encabezado o el boton de atras dejaban "plaza" escrito sobre
 * un listado sin buscar, y el filtro siguiente salia sin `q`. Lo que tiene que
 * mostrar el campo con cada URL confirmada lo dice `textoParaMostrar`.
 */
import { PARAMETRO_EDICION } from "./ediciones";

/** Lo que se espera a que la persona deje de escribir, en milisegundos. */
export const DEMORA_BUSQUEDA = 350;

const RUTA = "/proyectos";

/** Un valor vacio saca el parametro; cualquier otro lo pone o lo reemplaza. */
export function aplicarCambios(consulta: string, cambios: Record<string, string>): string {
  const siguientes = new URLSearchParams(consulta);
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor) siguientes.set(clave, valor);
    else siguientes.delete(clave);
  }
  return siguientes.toString();
}

export type FiltrosDelListado = ReturnType<typeof crearFiltrosDelListado>;

/**
 * `consultaInicial` es la de la URL al montar (sin el `?`). `reemplazar` recibe
 * la direccion entera a la que ir (`/proyectos?...`) y es quien navega.
 */
export function crearFiltrosDelListado(
  consultaInicial: string,
  reemplazar: (href: string) => void,
) {
  // La consulta de la ultima navegacion pedida, o la de la URL confirmada si
  // cambio despues. Es de donde parte cualquier cambio.
  let vigente = consultaInicial;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  // Lo escrito que todavia no llego a la URL porque la espera no vencio.
  let textoPendiente: string | null = null;

  function cancelar() {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    textoPendiente = null;
  }

  function ir(consulta: string) {
    // Ir a donde ya se esta (o a donde ya se pidio ir) solo repetiria la
    // consulta al servidor: pasa si se borra y se vuelve a escribir la misma
    // letra antes de que venza la espera.
    if (consulta === vigente) return;
    vigente = consulta;
    reemplazar(consulta ? `${RUTA}?${consulta}` : RUTA);
  }

  return {
    /** La URL confirmada cambio: la navegacion propia termino, o vino de afuera. */
    sincronizar(consulta: string) {
      vigente = consulta;
    },

    /**
     * Lo que tiene que mostrar Buscar cuando llega una URL confirmada: su `q`, o
     * `null` si la persona escribio algo que todavia espera (pisarlo le borraria
     * letras; cuando la espera venza, ese texto va a la URL). Sin espera, la URL
     * confirmada es la ultima pedida o una que la reemplazo (Next descarta la
     * navegacion en camino cuando llega otra), asi que su `q` es lo que se ve.
     * Solo lee: el componente lo llama durante el render, no en un efecto.
     */
    textoParaMostrar(consulta: string): string | null {
      if (textoPendiente !== null) return null;
      return new URLSearchParams(consulta).get("q") ?? "";
    },

    /** La persona escribio en Buscar: se busca cuando deja de escribir. */
    buscar(texto: string) {
      cancelar();
      textoPendiente = texto;
      temporizador = setTimeout(() => {
        temporizador = null;
        textoPendiente = null;
        ir(aplicarCambios(vigente, { q: texto }));
      }, DEMORA_BUSQUEDA);
    },

    /**
     * Un selector o la casilla de ganadores. Lo que se habia escrito y todavia
     * esperaba viaja con el filtro: elegir un distrito al toque de escribir
     * "club" no pierde ni el distrito ni la busqueda.
     */
    filtrar(cambios: Record<string, string>) {
      const conTexto = textoPendiente === null ? cambios : { q: textoPendiente, ...cambios };
      cancelar();
      ir(aplicarCambios(vigente, conTexto));
    },

    /**
     * "Limpiar filtros". La edicion no es un filtro: limpiar los filtros de la
     * 2025 deja la 2025 entera, no salta a la edicion activa.
     */
    limpiar() {
      cancelar();
      const edicion = new URLSearchParams(vigente).get(PARAMETRO_EDICION);
      ir(edicion ? new URLSearchParams({ [PARAMETRO_EDICION]: edicion }).toString() : "");
    },

    /** Al desmontar: una busqueda que vence despues traeria a la persona de vuelta. */
    cancelar,
  };
}
