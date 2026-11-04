"use client";

/**
 * Formulario de carga de una idea.
 *
 * La diferencia central con el sitio anterior: la ubicacion no se escribe, se
 * marca en el mapa. El formulario manda lat/lon numericos y el servidor deriva
 * el distrito con PostGIS, asi que no hay forma de cargar una coordenada
 * invalida ni de asignar mal el distrito.
 *
 * Las preguntas y su orden son las del formulario de papel 2026
 * (PREGUNTAS_DE_LA_IDEA, src/lib/contenido-del-programa.ts): primero el
 * problema, despues donde ocurre, que mejorar, a quienes beneficia y, al final,
 * el nombre de la propuesta, la organizacion y un telefono opcional. La
 * categoria ya no se pide: la asigna el equipo al evaluar.
 *
 * Datos personales: el telefono volvio con el formulario 2026, opcional, solo
 * para el equipo y borrado al cerrar la edicion. El correo HOY NO se pide: la
 * casilla "Quiero dejar mi correo..." esta apagada con
 * AVISO_POR_MAIL_HABILITADO (src/lib/aviso-por-mail.ts) porque el envio de
 * avisos no existe todavia. El codigo de la casilla queda, listo para cuando
 * exista: desmarcada por defecto y, sin marcarla, el correo ni siquiera se
 * envia. Mientras tanto, como sigue la idea se consulta con el codigo de
 * seguimiento que devuelve /api/ideas, que no necesita ningun contacto.
 *
 * UN solo boton de inteligencia artificial
 * ----------------------------------------
 * Hubo cuatro: uno al pie de cada campo largo mas la revision. El jefe del
 * programa lo dijo sin vueltas —eran demasiados— y tenia razon: cada uno abria
 * su propio panel con su propio aceptar y descartar, y la persona tomaba cuatro
 * decisiones sobre pedazos sueltos sin ver nunca el conjunto.
 *
 * Ahora hay uno, "Mejorar con IA", y vive en el panel del documento, no al lado
 * de un campo: ahi se ve el resultado. En el telefono ese panel no se dibuja, y
 * el mismo boton aparece en el ultimo paso, junto a "Enviar mi idea" (nunca los
 * dos a la vez). Una sola llamada a
 * /api/ideas/asistente devuelve todo junto —el texto ordenado de cada campo que
 * tenga contenido, un titulo sugerido, que le sigue faltando, si ya hay una
 * propuesta parecida en el distrito y los aspectos de obra para tildar— y la
 * persona acepta o descarta UNA vez, mirando la propuesta entera.
 *
 * La regla de fondo no cambio: en `problema` y `solucion` la IA no escribe desde
 * cero. Si el campo esta vacio, la ruta no lo toca y lo dice como algo que
 * falta. Eso se aplica en el servidor, no en el navegador.
 *
 * Nada de esto es obligatorio: el boton de enviar esta siempre disponible, la
 * ayuda se puede ignorar, y si el modelo falla o no hay clave el envio no se
 * entera.
 *
 * La pantalla: formulario a la izquierda, documento a la derecha
 * --------------------------------------------------------------
 * A la derecha estaba el mapa. Se movio porque el jefe del programa dijo que el
 * formulario era "poco predictivo": se cargaban campos sueltos y la propuesta
 * recien se veia despues de enviarla. Ahora la derecha la ocupa
 * DocumentoIdea, que dibuja la propuesta mientras se escribe, sin IA y sin
 * esperar nada, y que es el mismo componente que sale impreso en el PDF. El
 * mapa quedo como primera pregunta a la izquierda, que es donde ya estaba
 * numerado ("1. ¿Dónde sería?").
 *
 * Los campos siguen SIN ser controlados: nadie les pasa `value`, asi que el
 * cursor no puede saltar. Lo que hay es un espejo en estado (`valores`) que se
 * actualiza en cada tecla y es lo que dibuja el documento. Antes ese espejo
 * guardaba solo el largo del texto, que alcanzaba para habilitar los botones de
 * IA; ahora guarda el texto entero, porque hay que mostrarlo.
 */
import { useEffect, useRef, useState } from "react";
import DocumentoIdea, {
  type BloqueActivo,
  type CampoEditable,
  type EdicionDocumento,
} from "@/components/DocumentoIdea";
import Mapa from "@/components/Mapa";
import type { PropuestaIA, RespuestaAsistente } from "@/app/api/ideas/asistente/route";
import { AVISO_POR_MAIL_HABILITADO } from "@/lib/aviso-por-mail";
import {
  ACLARACION_DE_LA_PROPUESTA,
  PREGUNTAS_DE_LA_IDEA,
} from "@/lib/contenido-del-programa";

type Estado =
  | { tipo: "editando" }
  | { tipo: "revisando" }
  | { tipo: "enviando" }
  | { tipo: "listo"; numero: number; distrito: number; propuesta: string; codigo: string }
  | { tipo: "error"; mensaje: string };

const LARGOS = {
  titulo: 140,
  problema: 3000,
  solucion: 4000,
  beneficios: 3000,
  referenciasUbicacion: 1000,
} as const;

/** El barrio no esta en LARGOS porque no es un campo de redaccion. */
const LARGO_BARRIO = 120;
/** Los de src/lib/idea-esquema.ts, copiados por lo mismo que MINIMOS. */
const LARGO_ORGANIZACION = 160;
const LARGO_TELEFONO = 30;

/**
 * El telefono, con la misma regla que el servidor (`telefono` en
 * idea-esquema.ts): numeros con espacios, guiones o parentesis, entre 6 y 15
 * digitos. Vacio vale: es opcional.
 */
function telefonoValido(valor: string): boolean {
  const limpio = valor.trim();
  if (!limpio) return true;
  if (!/^\+?[\d\s()\-/.]+$/.test(limpio)) return false;
  const digitos = limpio.replace(/\D/g, "").length;
  return digitos >= 6 && digitos <= 15;
}

/** Los tres campos largos, los unicos con ayuda de redaccion. */
type CampoLargo = "problema" | "solucion" | "beneficios";

/**
 * Los minimos del alta, copiados de MINIMOS en src/lib/idea-esquema.ts por la
 * misma razon que los de arriba: ese modulo importa zod y traerlo al navegador
 * solo para leer tres numeros no vale el peso. El que manda sigue siendo el
 * servidor; esto es para poder avisar antes de enviar.
 */
const MINIMOS = { titulo: 8, problema: 30, solucion: 30 } as const;

/**
 * Los cinco pasos, en el orden en que se preguntan.
 *
 * Una pregunta a la vez (pedido del jefe del programa, 26/08/2026): con seis
 * campos vacios en pantalla la persona no sabe donde esta ni cuanto le falta.
 *
 * El orden es el del formulario de papel 2026, que se reparte en las asambleas:
 * quien llena el papel y quien entra a la web contestan lo mismo en el mismo
 * orden. El nombre de la propuesta va en el ULTIMO paso, igual que en el papel:
 * pedirle un titulo a alguien que todavia no escribio la propuesta es la parte
 * mas dificil, y al final ya tiene todo escrito para poder resumirlo.
 */
const PASOS: ReadonlyArray<{ corto: string; titulo: string; opcional?: boolean }> = [
  { corto: "Problema", titulo: PREGUNTAS_DE_LA_IDEA.problema.pregunta },
  { corto: "Dónde", titulo: PREGUNTAS_DE_LA_IDEA.referenciasUbicacion.pregunta },
  { corto: "Mejora", titulo: PREGUNTAS_DE_LA_IDEA.solucion.pregunta },
  { corto: "Quiénes", titulo: PREGUNTAS_DE_LA_IDEA.beneficios.pregunta, opcional: true },
  { corto: "Enviar", titulo: PREGUNTAS_DE_LA_IDEA.titulo.pregunta },
];

/** En que paso esta cada cosa: los numeros se usan en varios lugares. */
const PASO = { problema: 1, lugar: 2, solucion: 3, beneficios: 4 } as const;

const ULTIMO = PASOS.length;

/**
 * Cuando /api/distrito no contesto. Lo dicen el recuadro del paso 1 y su
 * validacion, con el mismo texto.
 */
const SIN_RESPUESTA_DEL_DISTRITO =
  "No pudimos consultar el distrito de ese punto. Revisá tu conexión y tocá el mapa de nuevo.";

/**
 * Un error cuyo texto se le puede mostrar a la persona tal cual: lo escribimos
 * nosotros o lo mando el servidor, en castellano.
 *
 * Existe por lo que NO es. Cuando `fetch` no llega al servidor (se corto la
 * señal, el celular se quedo sin datos) rechaza con un TypeError del navegador,
 * que tambien es un Error, con el texto "Failed to fetch", "Load failed" o
 * "NetworkError when attempting to fetch resource." segun el navegador. Los
 * catch mostraban el `message` de cualquier Error, y ese ingles le llegaba a la
 * persona justo al mandar su propuesta. Ahora se muestra solo el de estos; para
 * lo demas, un texto propio (ver `textoParaMostrar`).
 */
class ErrorParaMostrar extends Error {}

const SIN_CONEXION = "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.";

/** El texto de un error si es nuestro; si no, `siNoEsNuestro`. */
function textoParaMostrar(causa: unknown, siNoEsNuestro: string): string {
  return causa instanceof ErrorParaMostrar ? causa.message : siNoEsNuestro;
}

/**
 * Los campos de una linea del ultimo paso, que son los unicos desde donde un
 * Enter envia la idea (ver `cortarEnterQueEnvia`).
 */
const CAMPOS_QUE_ENVIAN_CON_ENTER = new Set([
  "titulo",
  "organizacion",
  "autorTelefono",
  "autorNombre",
  "autorEmail",
]);

/**
 * Como se llama cada campo EN PANTALLA.
 *
 * El asistente devuelve la clave de la columna (`problema`, `solucion`) y aca se
 * traduce a la pregunta que la persona tiene delante. Antes el modelo escribia
 * el nombre del campo dentro de la observacion y decia cosas como "no
 * completaste el campo de beneficios", una etiqueta que ya no existe en el
 * formulario. Ahora el modelo dice QUE falta y el formulario dice DONDE.
 */
const PREGUNTA_DEL_CAMPO: Record<string, string> = {
  problema: PREGUNTAS_DE_LA_IDEA.problema.pregunta,
  solucion: PREGUNTAS_DE_LA_IDEA.solucion.pregunta,
  beneficios: PREGUNTAS_DE_LA_IDEA.beneficios.pregunta,
  titulo: "Nombre de la propuesta",
};

/** Los campos que la IA puede reescribir, en el orden en que se muestran. */
type CampoPropuesta = "titulo" | "solucion" | "problema" | "beneficios";
const CAMPOS_PROPUESTA: Array<{ campo: CampoPropuesta; etiqueta: string }> = [
  { campo: "problema", etiqueta: PREGUNTA_DEL_CAMPO.problema },
  { campo: "solucion", etiqueta: PREGUNTA_DEL_CAMPO.solucion },
  { campo: "beneficios", etiqueta: PREGUNTA_DEL_CAMPO.beneficios },
  { campo: "titulo", etiqueta: PREGUNTA_DEL_CAMPO.titulo },
];

export default function FormularioIdea({
  abierta,
  conIA,
  autor,
}: {
  abierta: boolean;
  /**
   * La persona que ingreso con CIDITUC, o null en modo prueba. Con autor, el
   * nombre no se pide: el servidor lo toma de la sesion (y descarta el que
   * venga en el formulario), asi que pedirlo seria un campo que no se usa.
   */
  autor: { nombre: string | null } | null;
  /**
   * Si hay clave del modelo. Sin ella los botones de redaccion no se dibujan:
   * la regla del proyecto es que nada se rompe por falta de clave, y el aviso
   * legal ya promete que estas funciones "simplemente no aparecen".
   */
  conIA: boolean;
}) {
  const [punto, setPunto] = useState<{ lat: number; lon: number } | null>(null);
  const [distrito, setDistrito] = useState<number | null>(null);
  const [ubicando, setUbicando] = useState(false);
  /**
   * La consulta del distrito del ultimo punto fallo (la red, un 500). Es aparte
   * de "fuera del ejido" porque se arregla distinto: un punto fuera de los 20
   * distritos se corrige marcando otro, y esto, tocando de nuevo. Antes las dos
   * cosas eran `distrito` null y la pantalla decia que un punto valido quedaba
   * fuera de la ciudad.
   */
  const [sinRespuestaDelDistrito, setSinRespuestaDelDistrito] = useState(false);
  /**
   * Cuantos puntos se eligieron. Cada `elegirPunto` toma el suyo y, despues de
   * cada espera, sigue solo si nadie eligio otro mientras tanto. Ver
   * `elegirPunto` y `usarMiUbicacion`.
   */
  const pedidoUbicacion = useRef(0);
  const [estado, setEstado] = useState<Estado>({ tipo: "editando" });
  /** Consentimiento para guardar el correo. Arranca en false, siempre. */
  const [casillaAvisos, setCasillaAvisos] = useState(false);
  /**
   * Lo que vale de verdad: la casilla solo cuenta si los avisos existen. Con el
   * interruptor apagado la casilla no se dibuja y esto es false siempre, asi
   * que ni la validacion del ultimo paso ni el envio miran el correo.
   */
  const avisos = AVISO_POR_MAIL_HABILITADO && casillaAvisos;

  /** Ultima respuesta del asistente, o null si todavia no se pidio ninguna. */
  const [revision, setRevision] = useState<RespuestaAsistente | null>(null);
  /**
   * Que campos aplico la persona de la ultima propuesta.
   *
   * Existe para que aplicar deje rastro. Antes el bloque de la propuesta
   * simplemente desaparecia: la persona apretaba y no quedaba nada que
   * dijera que se habia escrito ni donde mirarlo.
   */
  const [aplicados, setAplicados] = useState<string[] | null>(null);
  /** Aspectos de obra que la persona tildo de la lista que se le ofrecio. */
  const [elegidos, setElegidos] = useState<string[]>([]);

  /**
   * El texto de cada campo, espejado en estado.
   *
   * Los campos siguen sin ser controlados (nadie les pasa `value`), asi que no
   * hay riesgo de que el cursor salte. Lo que se guarda aca es una copia que se
   * actualiza en cada tecla, y existe por una razon nueva: el documento de la
   * derecha se dibuja con esto. Antes alcanzaba con el largo del texto para
   * habilitar los botones de IA; ahora hace falta el texto entero para poder
   * mostrarlo mientras se escribe.
   */
  const [valores, setValores] = useState({
    titulo: "",
    barrio: "",
    referenciasUbicacion: "",
    problema: "",
    solucion: "",
    beneficios: "",
    /** "" sin contestar, "si" o "no": "¿En nombre de una organización?". */
    conOrganizacion: "",
    organizacion: "",
    autorTelefono: "",
    autorNombre: "",
    autorEmail: "",
  });
  const largos: Record<CampoLargo, number> = {
    problema: valores.problema.trim().length,
    solucion: valores.solucion.trim().length,
    beneficios: valores.beneficios.trim().length,
  };

  /**
   * Contorno del distrito activo, para el mapita del documento. Se pide una vez
   * y se queda: es el mismo archivo que ya bajo el mapa grande, asi que sale
   * del cache del navegador.
   */
  const [poligono, setPoligono] = useState<number[][] | null>(null);
  /** Mientras el navegador pregunta por la ubicacion. */
  const [buscandoGps, setBuscandoGps] = useState(false);
  /** Si el punto lo puso el GPS, para poder avisar que se puede corregir. */
  const [puntoPorGps, setPuntoPorGps] = useState(false);
  /** Que bloque del documento se esta editando, para marcarlo alla. */
  const [bloqueActivo, setBloqueActivo] = useState<BloqueActivo>(null);
  /** En que paso esta la persona. Arranca en 1: primero el problema. */
  const [paso, setPaso] = useState(1);
  /** En el telefono el documento se abre a pantalla completa. */
  const ventanaDoc = useRef<HTMLDialogElement>(null);

  /**
   * Que le falta a cada paso para estar completo, o null si esta listo.
   *
   * Es la misma validacion que hace el servidor (los minimos de
   * src/lib/idea-esquema.ts), traida aca para poder decir QUE falta y llevar a
   * la persona AL PASO donde se arregla, en lugar de rechazarle el envio al
   * final con un mensaje suelto.
   *
   * Reemplaza a los `required` del HTML, que con los pasos ocultos no servian:
   * un campo `required` con display:none hace que el navegador aborte el envio
   * con "an invalid form control is not focusable" y sin decirle nada a nadie.
   */
  function faltaEnElPaso(n: number): string | null {
    if (n === PASO.problema) {
      return largos.problema >= MINIMOS.problema
        ? null
        : `Contá un poco más cuál es el problema: necesita al menos ${MINIMOS.problema} caracteres.`;
    }
    if (n === PASO.lugar) {
      if (!punto) return "Marcá en el mapa dónde ocurre.";
      // Mientras se consulta, `distrito` es null: sin esto, quien apretaba
      // "Siguiente" en ese momento leia que su punto quedaba fuera de la ciudad.
      if (ubicando) return "Esperá un momento: estamos ubicando el punto en el mapa.";
      if (sinRespuestaDelDistrito) return SIN_RESPUESTA_DEL_DISTRITO;
      if (!distrito) return "Ese punto queda fuera de los 20 distritos. Marcá más cerca.";
      return null;
    }
    if (n === PASO.solucion) {
      return largos.solucion >= MINIMOS.solucion
        ? null
        : `Contá un poco más qué les gustaría mejorar o cambiar: necesita al menos ${MINIMOS.solucion} caracteres.`;
    }
    if (n === PASO.beneficios) return null; // opcional
    if (!valores.titulo.trim() || valores.titulo.trim().length < MINIMOS.titulo) {
      return `El nombre de la propuesta es muy corto: necesita al menos ${MINIMOS.titulo} caracteres.`;
    }
    if (valores.conOrganizacion === "si" && !valores.organizacion.trim()) {
      return "Escribí el nombre de la organización, o marcá que no la presentás en nombre de una.";
    }
    if (!telefonoValido(valores.autorTelefono)) {
      return "Revisá el teléfono: entre 6 y 15 números, con espacios o guiones si querés. Es opcional.";
    }
    if (avisos && !valores.autorEmail.trim()) {
      return "Dejaste marcada la casilla del correo: escribilo o desmarcala.";
    }
    return null;
  }

  /**
   * Si un paso ya se puede dar por hecho, para el tilde del riel.
   *
   * No es lo mismo que "se puede avanzar": el paso de los beneficios es
   * opcional, asi que nunca falta nada y se puede pasar de largo, pero mostrarlo
   * tildado antes de que la persona lo mire seria decirle que ya lo hizo. Un
   * paso opcional se tilda cuando tiene contenido, no cuando esta permitido
   * saltearlo.
   */
  const pasoCompleto = (n: number) => {
    if (faltaEnElPaso(n) !== null) return false;
    if (PASOS[n - 1].opcional) return largos.beneficios > 0;
    return true;
  };

  function irAlPaso(n: number) {
    setPaso(Math.min(Math.max(n, 1), ULTIMO));
    setEstado({ tipo: "editando" });
  }

  // Referencias a los campos de contenido: se leen para revisar y para armar el
  // contexto de la ayuda, y se escriben al aceptar un texto generado, sin
  // volver controlado el formulario.
  const refTitulo = useRef<HTMLInputElement>(null);
  const refBarrio = useRef<HTMLInputElement>(null);
  const refReferencias = useRef<HTMLTextAreaElement>(null);
  const refProblema = useRef<HTMLTextAreaElement>(null);
  const refSolucion = useRef<HTMLTextAreaElement>(null);
  const refBeneficios = useRef<HTMLTextAreaElement>(null);
  /** Los campos que el documento puede escribir, para espejarlos de este lado. */
  const REF_DEL_CAMPO = {
    titulo: refTitulo,
    barrio: refBarrio,
    referenciasUbicacion: refReferencias,
    solucion: refSolucion,
    problema: refProblema,
    beneficios: refBeneficios,
  } as const;
  /**
   * El ultimo barrio que puso el mapa. Sirve para distinguir "esto lo completo
   * un clic" de "esto lo escribio la persona": si el valor del campo coincide
   * con esto, es nuestro y se puede reemplazar; si no, es suyo y no se toca.
   */
  const barrioPuesto = useRef<string | null>(null);
  /** Si el barrio del campo lo puso el mapa, para poder decirlo en pantalla. */
  const [barrioAutomatico, setBarrioAutomatico] = useState(false);

  /**
   * Al marcar un punto se le pregunta al servidor el distrito y el barrio.
   *
   * El barrio se AUTOCOMPLETA pero no se impone: solo se escribe si el campo
   * esta vacio o si lo habia puesto un clic anterior. Si la persona lo escribio
   * a mano, gana ella: conoce su barrio mejor que una capa de 2022, y contra las
   * ideas ya cargadas la capa acierta en 23 de 34 casos, no en todos.
   *
   * Solo vale la respuesta del ULTIMO punto. Quien toca A y enseguida B puede
   * recibir la de A despues de la de B, y antes esa respuesta vieja pisaba el
   * distrito y el barrio: el marcador quedaba en B con el distrito y el barrio
   * de A, y el servidor guardaba el distrito de B (lo deriva del punto) con el
   * barrio de A. Tambien el `finally` de A apagaba el "Buscando el distrito…"
   * con la consulta de B todavia en curso. Ahora cada llamada toma un numero
   * de `pedidoUbicacion` y, si al volver ya hay otro, no toca nada.
   */
  async function elegirPunto(nuevo: { lat: number; lon: number }) {
    const mio = ++pedidoUbicacion.current;
    const sigueSiendoElUltimo = () => mio === pedidoUbicacion.current;
    setPunto(nuevo);
    setDistrito(null);
    setSinRespuestaDelDistrito(false);
    setUbicando(true);
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      // Un 500 no dice nada del punto: es "no pudimos consultar", no "fuera
      // de la ciudad". Solo un 200 trae un distrito (o su ausencia) que creer.
      if (!respuesta.ok) throw new Error(`/api/distrito respondio ${respuesta.status}`);
      const cuerpo = (await respuesta.json()) as {
        distrito: number | null;
        barrio: string | null;
      };
      if (!sigueSiendoElUltimo()) return;
      setDistrito(cuerpo.distrito);

      const campo = refBarrio.current;
      const escritoAMano = campo && campo.value.trim() && campo.value !== barrioPuesto.current;
      if (campo && cuerpo.barrio && !escritoAMano) {
        campo.value = cuerpo.barrio;
        barrioPuesto.current = cuerpo.barrio;
        setBarrioAutomatico(true);
        anotarValor("barrio", cuerpo.barrio);
      } else if (campo && !cuerpo.barrio && !escritoAMano && campo.value) {
        // El punto nuevo no cae en ningun barrio de la capa (una plaza, una
        // avenida) o queda fuera del ejido: el barrio que habia puesto el punto
        // anterior ya no es de este, y quedaba al lado del distrito nuevo con la
        // ayuda diciendo que salio del mapa. Se vacia, como si nunca se hubiera
        // completado; lo escrito a mano no se toca.
        campo.value = "";
        barrioPuesto.current = null;
        setBarrioAutomatico(false);
        anotarValor("barrio", "");
      }
      if (cuerpo.distrito) void cargarPoligono(cuerpo.distrito, sigueSiendoElUltimo);
    } catch {
      if (!sigueSiendoElUltimo()) return;
      setDistrito(null);
      setSinRespuestaDelDistrito(true);
    } finally {
      if (sigueSiendoElUltimo()) setUbicando(false);
    }
  }

  /**
   * El contorno del distrito, para el mapita del documento.
   *
   * Sale del mismo /geo/distritos.geojson que ya bajo el mapa grande, asi que
   * en la practica lo sirve el cache. Si falla no se avisa nada: el documento
   * dibuja solo el punto y las coordenadas van en texto igual, asi que no se
   * pierde informacion.
   *
   * `vigente` es la misma guarda de `elegirPunto`: si mientras bajaba el
   * archivo se eligio otro punto, este contorno ya no es el del distrito que
   * se muestra.
   */
  async function cargarPoligono(numero: number, vigente: () => boolean) {
    try {
      const geo = (await (await fetch("/geo/distritos.geojson")).json()) as {
        features: Array<{
          properties: { numero: number };
          geometry: { coordinates: number[][][][] };
        }>;
      };
      if (!vigente()) return;
      const f = geo.features.find((x) => x.properties.numero === numero);
      // El anillo exterior del primer poligono alcanza para dibujar el contorno.
      setPoligono(f?.geometry.coordinates?.[0]?.[0] ?? null);
    } catch {
      if (vigente()) setPoligono(null);
    }
  }

  /**
   * "Usar mi ubicacion". Deja un punto que se puede corregir, no una respuesta
   * final: el vecino puede estar en su casa proponiendo una obra a tres cuadras.
   * Nunca se dispara solo, siempre lo aprieta la persona, y no guarda su
   * ubicacion en ningun lado: lo unico que se guarda es el punto de la
   * propuesta, que ya se guardaba y que ademas es publico porque se dibuja en el
   * mapa del sitio.
   *
   * El GPS de alta precision puede tardar hasta 10 segundos, y el mapa sigue
   * aceptando toques mientras tanto. Si la persona marca un punto a mano en ese
   * rato, ese punto gana: la posicion que llega despues se descarta. Antes la
   * reemplazaba sin aviso, y la idea podia terminar guardada en la casa de quien
   * la presentaba en lugar de en la plaza que habia marcado. Se sabe por
   * `pedidoUbicacion`: si cambio desde que se apreto el boton, hubo un toque.
   */
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setEstado({
        tipo: "error",
        mensaje: "Este navegador no puede darnos tu ubicación. Marcá el lugar en el mapa.",
      });
      return;
    }
    const alApretar = pedidoUbicacion.current;
    const huboUnToque = () => pedidoUbicacion.current !== alApretar;
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoGps(false);
        if (huboUnToque()) return;
        setPuntoPorGps(true);
        void elegirPunto({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setBuscandoGps(false);
        // Si ya marco el lugar a mano, que el GPS haya fallado no le importa.
        if (huboUnToque()) return;
        setEstado({
          tipo: "error",
          mensaje:
            "No pudimos obtener tu ubicación. Puede que el navegador no tenga permiso. Marcá el lugar en el mapa.",
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  /**
   * El submit decide: si todavia no se reviso, revisa; si ya se reviso, envia.
   *
   * El FormData se arma en la PRIMERA linea sincronica a proposito. React
   * recicla el evento apenas hay un await, y `evento.currentTarget` pasa a ser
   * null: cualquier lectura despues del primer await se pierde.
   */
  /**
   * El submit ENVIA, siempre. Nada de decidir entre revisar y enviar segun el
   * estado: el boton dice "Enviar mi idea" y eso es lo que hace.
   *
   * Antes de enviar recorre los pasos y, si a alguno le falta algo, lleva a la
   * persona A ESE paso con el motivo. Es lo que reemplaza a los `required` del
   * HTML, que con los pasos ocultos abortaban el envio en silencio.
   *
   * Fuera del ultimo paso no envia nada. El boton de enviar sigue en el DOM con
   * display:none, y el navegador lo usa igual para el envio implicito de un
   * Enter (no mira si se dibuja): sin este corte, un Enter en el barrio desde
   * el paso 1 mandaba la idea sin pasar por "Revisá y enviá". El que frena el
   * Enter es `cortarEnterQueEnvia`; esto queda para lo que se le escape, como
   * un teclado de celular que no avise la tecla.
   */
  async function alEnviarFormulario(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (paso !== ULTIMO) return;
    const datos = new FormData(evento.currentTarget);

    for (let n = 1; n <= ULTIMO; n += 1) {
      const falta = faltaEnElPaso(n);
      if (falta) {
        setPaso(n);
        setEstado({ tipo: "error", mensaje: falta });
        return;
      }
    }

    await enviar(datos);
  }

  /**
   * Corta el Enter que enviaria la idea sin que nadie apretara "Enviar mi idea".
   *
   * En un campo de una linea, Enter hace el envio implicito del formulario, y
   * el navegador aprieta el boton de enviar aunque este oculto. Dos casos lo
   * hacian dañino: el barrio del paso 1, que se corrige y se cierra con "Ir" en
   * el teclado del celular, y el titulo que propone la IA en modo edicion, que
   * se confirma con Enter como cualquier edicion en linea y mandaba la idea con
   * el titulo VIEJO, porque la propuesta todavia no estaba aplicada.
   *
   * Enter solo envia desde los campos propios del ultimo paso, que es donde se
   * ve el boton y donde enviar es lo que se espera. El campo de la propuesta
   * no tiene `name` (no viaja en el envio), asi que queda afuera aunque el
   * panel se dibuje en el ultimo paso.
   */
  function cortarEnterQueEnvia(evento: React.KeyboardEvent<HTMLFormElement>) {
    // El Enter que cierra una composicion (teclados con IME) no envia nada y
    // cortarlo podria trabar la composicion.
    if (evento.key !== "Enter" || evento.nativeEvent.isComposing) return;
    const campo = evento.target;
    if (!(campo instanceof HTMLInputElement)) return;
    if (paso === ULTIMO && CAMPOS_QUE_ENVIAN_CON_ENTER.has(campo.name)) return;
    evento.preventDefault();
  }

  /**
   * El unico pedido de IA de toda la pantalla.
   *
   * Devuelve de una vez el texto formalizado de cada campo que tenga contenido,
   * un titulo sugerido, que le falta a la propuesta, si ya hay una parecida en
   * el distrito y los aspectos de obra para tildar. El texto reescrito queda a
   * la vista y la persona acepta o descarta campo por campo; los detalles que
   * ella misma tildo entran derecho (ver el comentario de mas abajo, donde se
   * decide cual de los dos caminos es).
   *
   * Nunca bloquea el envio: si falla, avisa y el formulario sigue andando.
   */
  async function pedirAyuda(agregar?: string[]) {
    setAplicados(null);
    setEstado({ tipo: "revisando" });
    try {
      const respuesta = await fetch("/api/ideas/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: valores.titulo || null,
          barrio: valores.barrio || null,
          problema: valores.problema || null,
          solucion: valores.solucion || null,
          beneficios: valores.beneficios || null,
          distrito,
          ...(agregar?.length ? { agregar } : {}),
          // Ni nombre ni correo: el asistente no necesita saber quien escribe.
        }),
      });

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new ErrorParaMostrar(cuerpo?.error ?? "No se pudo generar la ayuda.");
      }

      // Un 200 que no es JSON (una pagina de error de un proxy, por ejemplo)
      // tiraba un SyntaxError con su texto en ingles.
      const datos = (await respuesta.json().catch(() => {
        throw new ErrorParaMostrar("No se pudo generar la ayuda. Podés enviar tu idea igual.");
      })) as RespuestaAsistente;

      /*
       * Los detalles elegidos entran DERECHO al texto, sin una segunda
       * confirmacion.
       *
       * "Nada se aplica sin que lo aceptes" sigue valiendo: lo que cambia es
       * DONDE se acepta. Cuando alguien tilda "pavimento definitivo" y aprieta
       * "Agregar los 3 elegidos", ya eligio dos veces; volver a mostrarle los
       * mismos textos para que los apruebe campo por campo es preguntarle lo
       * mismo una tercera vez, y el boton ya prometia agregarlos.
       *
       * El otro camino —"Mejorar con IA" a secas— SI conserva la revision campo
       * por campo, y ahi corresponde: la IA reescribio lo que la persona habia
       * escrito, sin que nadie se lo pidiera renglon por renglon.
       *
       * Lo aplicado no queda invisible: `setAplicados` deja el resumen de que
       * campos se tocaron, y el texto se sigue pudiendo editar en el formulario
       * o en el documento mismo.
       *
       * Lo que entra derecho es SOLO la solucion, que es donde van los
       * aspectos. Antes se escribian los cuatro campos de la respuesta: el
       * problema reformulado, los beneficios redactados aunque estuvieran
       * vacios y un titulo nuevo, sin que la persona los viera, y aunque
       * acabara de rechazarlos con "Dejar el mio". La ruta ya no los pide en
       * este caso. Si quedaba una propuesta de la vuelta anterior sin decidir,
       * sigue ahi para revisarla campo por campo, menos la solucion, que se
       * acaba de reescribir.
       */
      if (agregar?.length) {
        const solucion = datos.propuesta?.solucion ?? null;
        const anterior = revision?.propuesta ?? null;
        if (solucion) {
          escribirPropuesta({ titulo: null, solucion, problema: null, beneficios: null });
          setRevision({ ...datos, propuesta: anterior && { ...anterior, solucion: null } });
          setElegidos([]);
        } else {
          // La solucion no volvio: los aspectos no se sumaron. La lista y lo
          // tildado se quedan, para poder probar de nuevo con un clic.
          setRevision({
            ...datos,
            propuesta: anterior,
            detalles: revision?.detalles ?? [],
            aviso:
              datos.aviso ??
              "No pudimos sumar los aspectos que elegiste. Probá de nuevo en un rato.",
          });
        }
      } else {
        setRevision(datos);
        setElegidos([]);
      }

      setEstado({ tipo: "editando" });
    } catch (causa) {
      // Lo que no es nuestro es que `fetch` no llego: el texto lo dice en
      // castellano y recuerda que la ayuda no es necesaria para enviar.
      const aviso = textoParaMostrar(causa, `${SIN_CONEXION} Podés enviar tu idea igual.`);
      // Si se estaban agregando aspectos, la revision que habia se conserva:
      // reemplazarla por el aviso solo borraba la lista que la persona tildo.
      if (agregar?.length && revision) {
        setRevision({ ...revision, aviso });
        setEstado({ tipo: "editando" });
        return;
      }
      setRevision({
        modo: "basico",
        faltantes: [],
        parecidas: [],
        senalamientos: [],
        propuesta: null,
        detalles: [],
        aviso,
      });
      setEstado({ tipo: "editando" });
    }
  }

  /**
   * Escribe en el formulario los campos de una propuesta. Lo que viene null no
   * se toca: puede ser un campo que la IA no reescribio o uno que ella quito.
   *
   * Esta separado de `aplicarPropuesta` porque hay dos caminos que terminan
   * escribiendo, y solo uno pide confirmacion. Ver el comentario de `pedirAyuda`.
   */
  function escribirPropuesta(p: PropuestaIA) {
    const escribir = (
      ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
      campo: keyof typeof valores,
      texto: string | null,
    ) => {
      if (!texto) return;
      if (ref.current) ref.current.value = texto;
      anotarValor(campo, texto);
    };
    escribir(refTitulo, "titulo", p.titulo);
    escribir(refSolucion, "solucion", p.solucion);
    escribir(refProblema, "problema", p.problema);
    escribir(refBeneficios, "beneficios", p.beneficios);
    setAplicados(
      CAMPOS_PROPUESTA.filter(({ campo }) => p[campo]).map(({ etiqueta }) => etiqueta),
    );
  }

  /**
   * Aplica al formulario los campos que la persona eligio quedarse, ya con los
   * retoques que les haya hecho (ver CampoPropuesto).
   */
  function aplicarPropuesta(p: PropuestaIA) {
    escribirPropuesta(p);
    setRevision({ ...revision!, propuesta: null });
  }

  /**
   * Un campo cambio: se espeja en estado para redibujar el documento.
   *
   * ACA NO SE TRANSFORMA EL TEXTO. Ni `trim()`, ni normalizar comillas, ni
   * colapsar espacios. Desde que el documento se escribe encima (ver CampoDoc en
   * DocumentoIdea.tsx), este estado alimenta un textarea controlado: si el valor
   * que vuelve difiere del que el nodo tiene, React reescribe el nodo y el
   * cursor se va al final en CADA tecla. Es un sintoma rarisimo de rastrear
   * hasta acá, asi que queda dicho donde se rompe.
   */
  function anotarValor(campo: keyof typeof valores, valor: string) {
    setValores((previo) => (previo[campo] === valor ? previo : { ...previo, [campo]: valor }));
  }

  /**
   * Lo que se escribe en el documento de la derecha.
   *
   * Espeja en el campo de la izquierda, que sigue sin estar controlado (ver el
   * encabezado del archivo), y anota el valor. No hay ciclo: asignar `.value`
   * desde JavaScript no dispara `input`, y `anotarValor` corta cuando el valor
   * no cambio.
   */
  function escribirDesdeDocumento(campo: CampoEditable, valor: string) {
    // El tope del campo hay que aplicarlo a mano: `maxLength` frena a quien
    // escribe, pero no a una asignacion por codigo, y el servidor rechazaria un
    // texto largo sin que nadie haya visto un aviso.
    const tope = campo === "barrio" ? LARGO_BARRIO : LARGOS[campo];
    // El titulo y el barrio son de un renglon, pero en el documento se escriben
    // en un textarea: un texto pegado de dos renglones trae saltos. Al copiarlo
    // al <input> de la izquierda (el que viaja en el envio) el navegador borra
    // el salto SIN dejar un espacio, y se guardaria "Plaza delbarrio Oeste"
    // mientras el documento y el PDF muestran dos renglones. Se cambia por un
    // espacio aca, antes de anotar, para que lo que se ve sea lo que se envia.
    // Es la unica transformacion permitida en este camino (ver `anotarValor`):
    // solo pasa cuando hay un salto, que es justo cuando no se lo puede dejar.
    const limpio = campo === "titulo" || campo === "barrio" ? valor.replace(/[\r\n]+/g, " ") : valor;
    const texto = limpio.slice(0, tope);

    const ref = REF_DEL_CAMPO[campo].current;
    // Escribirle `.value` a un campo enfocado le manda el cursor al final. En la
    // practica el foco esta en el documento, pero la guarda va igual.
    if (ref && ref !== document.activeElement) ref.value = texto;

    // Si lo toca la persona, el barrio deja de ser "lo que puso el mapa": si no,
    // la ayuda de la izquierda seguiria diciendo que lo completo un clic.
    if (campo === "barrio") setBarrioAutomatico(false);

    anotarValor(campo, texto);
  }

  async function enviar(datos: FormData) {
    if (!punto || !distrito) return;
    setEstado({ tipo: "enviando" });

    try {
      const respuesta = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: datos.get("titulo"),
          barrio: datos.get("barrio") || null,
          referenciasUbicacion: datos.get("referenciasUbicacion") || null,
          problema: datos.get("problema"),
          solucion: datos.get("solucion"),
          beneficios: datos.get("beneficios") || null,
          // La organizacion viaja solo si se contesto "Sí": un nombre escrito y
          // despues cambiado a "No" queda en el campo, oculto, y no tiene que ir.
          organizacion:
            valores.conOrganizacion === "si" ? datos.get("organizacion") || null : null,
          autorTelefono: datos.get("autorTelefono") || null,
          lat: punto.lat,
          lon: punto.lon,
          // Con sesion el servidor usa el nombre de la cuenta de CIDITUC.
          autorNombre: autor ? null : datos.get("autorNombre") || null,
          // Sin la casilla marcada el correo no viaja: no hay consentimiento.
          autorEmail: avisos ? datos.get("autorEmail") || null : null,
          autorAvisos: avisos,
        }),
      });

      // Un 500 sin cuerpo (la base caida, por ejemplo) no trae JSON: sin el
      // catch, la persona leia el error crudo del navegador, en ingles, justo
      // al mandar su propuesta. Asi cae al mensaje de abajo.
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        numero?: number;
        distrito?: number;
        propuesta?: string;
        codigo?: string;
        error?: string;
      };

      if (!respuesta.ok || !cuerpo.numero || !cuerpo.codigo) {
        throw new ErrorParaMostrar(cuerpo.error ?? "No se pudo enviar la idea.");
      }
      setEstado({
        tipo: "listo",
        numero: cuerpo.numero,
        distrito: cuerpo.distrito ?? distrito,
        propuesta: cuerpo.propuesta ?? `P${String(cuerpo.numero).padStart(3, "0")}`,
        codigo: cuerpo.codigo,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (causa) {
      // Lo que no es nuestro es el `fetch` que no llego (ver ErrorParaMostrar).
      // Queda un caso que el texto no resuelve: si la conexion se corto DESPUES
      // de que el servidor guardo la idea, la persona no ve el numero ni el
      // codigo y al reintentar la carga dos veces. Evitarlo de verdad pide una
      // clave de idempotencia en el alta, que es un cambio de esquema; mientras
      // tanto, la duplicada se descarta desde la bandeja.
      setEstado({ tipo: "error", mensaje: textoParaMostrar(causa, SIN_CONEXION) });
    }
  }

  if (estado.tipo === "listo") {
    return (
      <div className="superficie mt-8 rounded-2xl p-8">
        <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
          Idea recibida
        </p>
        <h2 className="mt-2 text-2xl font-bold">Gracias por participar</h2>
        <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed">
          Tu idea quedó registrada en el <strong>Distrito {estado.distrito}</strong>. El equipo del
          Presupuesto Participativo la va a revisar y evaluar técnicamente. Cuando esté publicada vas
          a poder verla en el listado de proyectos de tu distrito.
        </p>

        {/* Numero y codigo: los dos datos que se necesitan para el seguimiento. */}
        <div className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
          >
            <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
              Código de tu propuesta
            </p>
            <p className="mt-1 font-mono text-2xl font-bold">{estado.propuesta}</p>
          </div>
          <div
            className="rounded-2xl px-5 py-4"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
              border: "1px solid var(--color-acento-600)",
            }}
          >
            <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
              Código de seguimiento
            </p>
            <p className="mt-1 font-mono text-2xl font-bold" style={{ letterSpacing: "0.12em" }}>
              {estado.codigo}
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-prose text-[0.9375rem] font-semibold leading-relaxed">
          Anotá los dos códigos o sacale una foto a esta pantalla.
        </p>
        <p className="mt-1 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          El código de seguimiento no se vuelve a mostrar y no lo podés recuperar desde el sitio. Con
          los dos consultás cuando quieras en qué etapa está tu propuesta y leés la devolución del
          equipo, sin depender de que te llamemos.
        </p>
        <p className="mt-3 max-w-prose text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {ACLARACION_DE_LA_PROPUESTA}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/ideas/seguimiento"
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ background: "var(--color-marca-700)" }}
          >
            Seguir mi idea
          </a>
          <a
            href={`/distritos/${estado.distrito}`}
            className="superficie rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Ver el Distrito {estado.distrito}
          </a>
          <a
            href="/ideas/nueva"
            className="superficie rounded-xl px-5 py-3 text-sm font-semibold"
          >
            Cargar otra idea
          </a>
        </div>
      </div>
    );
  }

  const enviando = estado.tipo === "enviando";
  const revisando = estado.tipo === "revisando";
  const ocupado = enviando || revisando;
  /**
   * El "Mejorar con IA" (hay dos, uno por pantalla). Pide texto para trabajar.
   * Sin punto marcado se puede apretar igual y el asistente lo dice como algo
   * que falta; mientras se ubica un punto no, porque el distrito todavia es
   * null y le diria que marque un lugar que ya marco.
   */
  const iaDeshabilitada =
    !abierta || ocupado || ubicando || (!largos.solucion && !largos.problema);

  /**
   * Todo lo que el documento necesita para dejarse escribir encima. Es el MISMO
   * objeto para las dos instancias —el panel de al lado y la ventana del
   * telefono—: las dos escriben en el mismo estado, asi que da igual en cual se
   * escriba. Va acá abajo y no con las otras funciones porque necesita
   * `ocupado`, que se calcula recien en estas lineas.
   */
  const edicionDelDocumento: EdicionDocumento = {
    onEscribir: escribirDesdeDocumento,
    onFocoBloque: setBloqueActivo,
    topes: { ...LARGOS, barrio: LARGO_BARRIO },
    deshabilitado: !abierta || ocupado,
  };

  /** Lo que dibuja el documento, igual en el panel de al lado y en el telefono. */
  const datosDelDocumento = {
    titulo: valores.titulo,
    barrio: valores.barrio,
    distrito,
    punto,
    referenciasUbicacion: valores.referenciasUbicacion,
    solucion: valores.solucion,
    problema: valores.problema,
    beneficios: valores.beneficios,
    organizacion: valores.conOrganizacion === "si" ? valores.organizacion : "",
  };

  return (
    <form
      onSubmit={alEnviarFormulario}
      onKeyDown={cortarEnterQueEnvia}
      className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr] lg:items-start"
    >
      {/*
        La izquierda es TODO el formulario y la derecha es el documento. Antes la
        derecha era el mapa: se movio porque el mapa es una pregunta mas ("dónde
        sería") y el lugar de la derecha lo necesitaba algo que no existia, que
        es ver lo que se va a presentar. El mapa quedo como primera pregunta,
        que ademas es el orden en que ya estaba numerado.
      */}
      <div className="space-y-5">
      <RielDePasos
        paso={paso}
        completo={pasoCompleto}
        onIr={irAlPaso}
        deshabilitado={!abierta || ocupado}
      />

      <div>
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Paso {paso} de {ULTIMO}
          {PASOS[paso - 1].opcional && " · se puede saltar"}
        </p>
        <h2
          className="mt-1 text-xl font-bold leading-tight sm:text-2xl"
          style={{ color: "var(--marca-texto)", textWrap: "balance" }}
        >
          {PASOS[paso - 1].titulo}
        </h2>
      </div>

      {/*
        Los pasos inactivos se OCULTAN, no se desmontan. Asi los campos
        conservan su texto, las referencias siguen valiendo y el FormData del
        envio los levanta a todos. El precio es que los `required` del HTML no
        sirven (un campo required con display:none hace que el navegador aborte
        el envio con "an invalid form control is not focusable", sin decirle nada
        a nadie), y por eso la validacion la hace faltaEnElPaso.
      */}
      {/* --- Paso 2: el lugar ---------------------------------------------- */}
      <section className={paso === PASO.lugar ? "space-y-1" : "hidden"}>
        <Campo
          etiqueta="Las referencias del lugar"
          ayuda={`${PREGUNTAS_DE_LA_IDEA.referenciasUbicacion.ayuda} Es opcional: lo que vale es el punto del mapa.`}
        >
          <textarea
            ref={refReferencias}
            name="referenciasUbicacion"
            rows={2}
            maxLength={LARGOS.referenciasUbicacion}
            disabled={!abierta || ocupado}
            placeholder="En la esquina de… frente a la escuela…"
            onInput={(evento) => anotarValor("referenciasUbicacion", evento.currentTarget.value)}
            onFocus={() => setBloqueActivo("referenciasUbicacion")}
            className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
            style={campoEstilo}
          />
        </Campo>
        <p className="pt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Y marcalo en el mapa: tocá el lugar. El distrito y el barrio se completan solos.
        </p>

        {/* En el telefono marcar un punto con el dedo es incomodo, y el vecino
            suele estar cerca de donde propone la obra. */}
        <button
          type="button"
          onClick={usarMiUbicacion}
          disabled={!abierta || ocupado || buscandoGps}
          className="mt-3 inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition disabled:opacity-50"
          style={{
            background: "var(--fondo-tarjeta)",
            border: "1px solid var(--borde-control)",
            color: "var(--marca-texto)",
          }}
        >
          <IconoMira />
          {buscandoGps ? "Buscando tu ubicación…" : "Usar mi ubicación"}
        </button>

        <div className="mt-3">
          <Mapa
            modo="seleccionar"
            onSeleccionar={(p) => {
              // Un clic a mano deja de ser "el punto del GPS".
              setPuntoPorGps(false);
              void elegirPunto(p);
            }}
            puntoElegido={punto}
            distritoActivo={distrito ?? undefined}
            distritos={Array.from({ length: 20 }, (_, i) => ({
              numero: i + 1,
              nombre: `Distrito ${i + 1}`,
              ideas: 0,
              color: null,
              etiquetaGanador: null,
            }))}
            alto="24rem"
          />
        </div>

        <div
          className="mt-3 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "var(--fondo-suave)",
            border: `1px solid ${
              punto && !distrito && !ubicando ? "var(--color-acento-600)" : "var(--borde)"
            }`,
          }}
          aria-live="polite"
        >
          {!punto && "Todavía no marcaste el lugar."}
          {punto && ubicando && "Buscando el distrito…"}
          {punto && !ubicando && distrito && (
            <>
              Punto marcado en el <strong>Distrito {distrito}</strong>.{" "}
              <span style={{ color: "var(--texto-suave)" }}>
                {punto.lat.toFixed(5)}, {punto.lon.toFixed(5)}
              </span>
              {puntoPorGps && (
                <>
                  {" "}
                  <span style={{ color: "var(--texto-suave)" }}>
                    Te ubicamos ahí. Si la obra es en otro lugar, tocá el mapa y se corrige.
                  </span>
                </>
              )}
            </>
          )}
          {punto && !ubicando && !distrito && sinRespuestaDelDistrito && (
            <>{SIN_RESPUESTA_DEL_DISTRITO}</>
          )}
          {punto && !ubicando && !distrito && !sinRespuestaDelDistrito && (
            <>Ese punto queda fuera de los 20 distritos de la ciudad. Probá marcar más cerca.</>
          )}
        </div>
      </section>

      {/* --- Los campos, cada uno en su paso -------------------------------- */}
      <div className="space-y-6">
        <section className="space-y-4">
          {/*
            El orden importa y no es obvio. La revision pide datos que la IA
            tiene prohibido inventar (cuanta gente, desde cuando), asi que
            formalizar antes de contestarlos deja un texto prolijo al que le
            sigue faltando lo mismo. Se dice una vez, cuando empieza a escribir.
          */}
          <p
            className={paso === PASO.problema ? "text-sm leading-relaxed" : "hidden"}
            style={{ color: "var(--texto-suave)" }}
          >
            Escribilo con tus palabras, como puedas.{" "}
            {conIA ? (
              <>
                Después revisamos qué le falta, vos completás esos datos, y al final la IA te
                ordena el texto.
              </>
            ) : (
              // Sin IA no hay revision que pedir: lo unico que se revisa son
              // los minimos de cada paso, al avanzar y al enviar.
              <>Si le falta algo, te avisamos antes de enviar.</>
            )}
          </p>

          {/* La categoria ya no se pide: la asigna el equipo al evaluar. */}
          <div className={paso === ULTIMO ? "" : "hidden"}>
          <Campo etiqueta="Nombre de la propuesta" ayuda={PREGUNTAS_DE_LA_IDEA.titulo.ayuda}>
            <input
              ref={refTitulo}
              name="titulo"
              maxLength={LARGOS.titulo}
              disabled={!abierta || ocupado}
              onInput={(evento) => anotarValor("titulo", evento.currentTarget.value)}
              placeholder="Una plaza para el barrio…"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>
          </div>

          {/* El barrio va con el lugar: lo completa el mapa. */}
          <div className={paso === PASO.lugar ? "" : "hidden"}>
          <Campo
            etiqueta="Barrio"
            ayuda={
              barrioAutomatico
                ? "Lo completamos con el punto que marcaste en el mapa. Si no es ese, corregilo."
                : "Opcional. Se completa solo cuando marcás el lugar en el mapa."
            }
          >
            <input
              ref={refBarrio}
              name="barrio"
              maxLength={120}
              disabled={!abierta || ocupado}
              // Si lo edita a mano deja de ser nuestro y el mapa no lo pisa mas.
              onInput={(evento) => {
                setBarrioAutomatico(false);
                anotarValor("barrio", evento.currentTarget.value);
              }}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>
          </div>

          {/* La ayuda va FUERA del <Campo>: Campo es un <label>, y un <button>
              adentro de un label es contenido interactivo anidado, que roba el
              clic del campo etiquetado. El <div> mantiene al par junto pese al
              space-y de la seccion. */}
          {/*
            El orden es el del papel 2026: primero el problema (columna
            `problema`) y despues que mejorar (columna `solucion`). Del 26/08 al
            formulario 2026 fue al reves, primero "¿Qué querés proponer?": el
            papel que se reparte en las asambleas pregunta primero por el
            problema, y la web lo sigue para que las dos vias pidan lo mismo.
          */}
          <div className={paso === PASO.solucion ? "" : "hidden"}>
            <Campo
              etiqueta="Qué les gustaría mejorar o cambiar"
              ayuda={PREGUNTAS_DE_LA_IDEA.solucion.ayuda}
            >
              <textarea
                ref={refSolucion}
                name="solucion"
                rows={5}
                maxLength={LARGOS.solucion}
                disabled={!abierta || ocupado}
                placeholder="Una canchita para que los chicos jueguen…"
                onInput={(evento) => anotarValor("solucion", evento.currentTarget.value)}
                onFocus={() => setBloqueActivo("solucion")}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
          </div>

          <div className={paso === PASO.problema ? "" : "hidden"}>
            <Campo etiqueta="El problema" ayuda={PREGUNTAS_DE_LA_IDEA.problema.ayuda}>
              <textarea
                ref={refProblema}
                name="problema"
                rows={5}
                maxLength={LARGOS.problema}
                disabled={!abierta || ocupado}
                placeholder="Hoy no hay ningún lugar donde jugar…"
                onInput={(evento) => anotarValor("problema", evento.currentTarget.value)}
                onFocus={() => setBloqueActivo("problema")}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
          </div>

          {/*
            El unico campo donde la IA puede escribir con el campo vacio, porque
            es opcional y porque no lo saca de la nada: lo deduce del problema y
            la solucion que la persona ya escribio. De ahi que el boton pida esos
            dos campos y no este.
          */}
          <div className={paso === PASO.beneficios ? "" : "hidden"}>
            <Campo
              etiqueta="A quiénes beneficiaría"
              ayuda={`${PREGUNTAS_DE_LA_IDEA.beneficios.ayuda} Es opcional${conIA ? ": la IA puede escribirlo a partir de lo que contaste" : ""}.`}
            >
              <textarea
                ref={refBeneficios}
                name="beneficios"
                rows={3}
                maxLength={LARGOS.beneficios}
                disabled={!abierta || ocupado}
                onInput={(evento) => anotarValor("beneficios", evento.currentTarget.value)}
                onFocus={() => setBloqueActivo("beneficios")}
                className="w-full resize-y rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
          </div>
        </section>

        <section className={paso === ULTIMO ? "space-y-4" : "hidden"}>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{PREGUNTAS_DE_LA_IDEA.organizacion.pregunta}</legend>
            <div className="flex gap-5 text-sm">
              {(["si", "no"] as const).map((opcion) => (
                <label key={opcion} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="conOrganizacion"
                    value={opcion}
                    checked={valores.conOrganizacion === opcion}
                    disabled={!abierta || ocupado}
                    onChange={() => anotarValor("conOrganizacion", opcion)}
                  />
                  {opcion === "si" ? "Sí" : "No, la presento yo"}
                </label>
              ))}
            </div>
            {valores.conOrganizacion === "si" && (
              <Campo etiqueta="Nombre de la organización" ayuda={PREGUNTAS_DE_LA_IDEA.organizacion.ayuda}>
                <input
                  name="organizacion"
                  maxLength={LARGO_ORGANIZACION}
                  disabled={!abierta || ocupado}
                  onInput={(evento) => anotarValor("organizacion", evento.currentTarget.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={campoEstilo}
                />
              </Campo>
            )}
          </fieldset>

          <h3 className="pt-2 text-base font-bold">{autor ? "Tus datos" : "Tus datos (opcionales)"}</h3>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Ninguno de estos datos se publica. Al enviar la idea te vamos a dar un{" "}
            <strong>código de seguimiento</strong>: con ese código y el de tu propuesta podés ver
            cuando quieras cómo sigue.
          </p>

          <Campo
            etiqueta="Teléfono de contacto (opcional)"
            ayuda="Por si el equipo necesita consultarte algo de la propuesta. Solo lo ve el equipo y se borra cuando cierra el proceso."
          >
            <input
              name="autorTelefono"
              type="tel"
              autoComplete="tel"
              maxLength={LARGO_TELEFONO}
              disabled={!abierta || ocupado}
              onInput={(evento) => anotarValor("autorTelefono", evento.currentTarget.value)}
              placeholder="381 555-1234"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          {autor ? (
            /*
              Con CIDITUC el autor es la cuenta con la que se ingreso: el nombre
              no se escribe. Para cambiar de cuenta esta el "Salir" de la
              cabecera de la pagina (src/app/ideas/nueva/page.tsx), afuera de
              este formulario: un form no puede ir adentro de otro.
            */
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
            >
              <p className="text-sm">
                Presentás la idea como <strong>{autor.nombre ?? "la cuenta con la que ingresaste"}</strong>,
                con tu cuenta de CIDITUC. Solo lo ve el equipo que evalúa la propuesta.
              </p>
            </div>
          ) : (
            <Campo etiqueta="Tu nombre" ayuda="Opcional. Solo lo ve el equipo que evalúa la propuesta.">
              <input
                name="autorNombre"
                maxLength={120}
                onInput={(evento) => anotarValor("autorNombre", evento.currentTarget.value)}
                disabled={!abierta || ocupado}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={campoEstilo}
              />
            </Campo>
          )}

          {/* Consentimiento del correo: casilla desmarcada y finalidad declarada.
              Apagado mientras no exista el envio de avisos (ver
              src/lib/aviso-por-mail.ts): ofrecerlo era pedir un dato para una
              promesa que nadie iba a cumplir. */}
          {AVISO_POR_MAIL_HABILITADO && (
            <div
              className="rounded-xl px-4 py-4"
              style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
            >
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={casillaAvisos}
                  onChange={(evento) => setCasillaAvisos(evento.target.checked)}
                  disabled={!abierta || ocupado}
                  className="mt-0.5"
                />
                <span className="text-sm font-medium">
                  Quiero dejar mi correo para que me avisen cómo sigue mi idea.
                </span>
              </label>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                Lo usamos solo para contarte cómo sigue tu idea: no lo publicamos, no lo damos a nadie
                y no te vamos a mandar otra cosa. Es opcional, y{" "}
                <strong>no dar el correo no afecta la evaluación de tu propuesta</strong>: se evalúa
                igual. Podés pedir que lo borremos cuando quieras. Cómo tratamos tus datos está
                explicado en la{" "}
                <a href="/privacidad" className="underline">
                  política de privacidad
                </a>
                .
              </p>

              {avisos && (
                <div className="mt-4">
                  <Campo etiqueta="Correo electrónico">
                    <input
                      name="autorEmail"
                      type="email"
                      maxLength={160}
                      onInput={(evento) => anotarValor("autorEmail", evento.currentTarget.value)}
                      disabled={!abierta || ocupado}
                      placeholder="tunombre@ejemplo.com"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={campoEstilo}
                    />
                  </Campo>
                </div>
              )}
            </div>
          )}
        </section>

        {/* La aclaracion del pie del papel, con las mismas palabras, antes de enviar. */}
        {paso === ULTIMO && (
          <p
            className="rounded-xl px-4 py-3 text-xs leading-relaxed"
            style={{ background: "var(--fondo-suave)", color: "var(--texto-suave)" }}
          >
            {ACLARACION_DE_LA_PROPUESTA}
          </p>
        )}

        {estado.tipo === "error" && (
          <p
            role="alert"
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
              border: "1px solid var(--color-acento-600)",
            }}
          >
            {estado.mensaje}
          </p>
        )}

        {/* El resultado del asistente. Sin condicionar al paso: el boton esta
            en el panel del documento y se puede apretar en cualquier momento, y
            en el telefono ese panel no se dibuja. */}
        {revision && (
          <PanelRevision
            revision={revision}
            aplicados={aplicados}
            elegidos={elegidos}
            onTildar={(nombre) =>
              setElegidos((previo) =>
                previo.includes(nombre)
                  ? previo.filter((d) => d !== nombre)
                  : [...previo, nombre],
              )
            }
            onAgregar={() => void pedirAyuda(elegidos)}
            onAplicar={aplicarPropuesta}
            onDescartar={() => setRevision({ ...revision, propuesta: null })}
            ocupado={ocupado}
          />
        )}

        {/* --- Navegación entre pasos ---------------------------------------- */}
        {paso < ULTIMO && (
          <div className="flex flex-wrap items-center gap-3">
            {paso > 1 && (
              <button
                type="button"
                onClick={() => irAlPaso(paso - 1)}
                disabled={!abierta || ocupado}
                className="rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50"
                style={{
                  background: "var(--fondo-tarjeta)",
                  border: "1px solid var(--borde-control)",
                  color: "var(--marca-texto)",
                }}
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                // No se traba a nadie: si falta algo se avisa y se sigue.
                const falta = faltaEnElPaso(paso);
                if (falta) setEstado({ tipo: "error", mensaje: falta });
                else irAlPaso(paso + 1);
              }}
              disabled={!abierta || ocupado}
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              Siguiente
            </button>
            {PASOS[paso - 1].opcional && (
              <button
                type="button"
                onClick={() => irAlPaso(paso + 1)}
                disabled={!abierta || ocupado}
                className="text-sm underline disabled:opacity-50"
                style={{ color: "var(--texto-suave)" }}
              >
                Saltar este paso
              </button>
            )}
          </div>
        )}

        {/*
          El boton principal SIEMPRE envia y siempre dice lo mismo.
          Antes cambiaba de funcion solo: la primera vez decia "Revisar mi idea"
          y no enviaba, la segunda decia "Enviar mi idea" y si. Quien lo apretaba
          dos veces seguidas enviaba sin querer, y eso es exactamente lo que el
          jefe del programa llamo "poco predictivo". Revisar paso a ser una
          accion aparte, disponible siempre y todas las veces que haga falta.
        */}
        <div
          className={
            paso === ULTIMO
              ? "flex flex-wrap items-center gap-x-4 gap-y-3"
              : "hidden"
          }
        >
          <button
            type="submit"
            disabled={!abierta || ocupado}
            className="w-full rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition disabled:opacity-50 sm:w-auto"
            style={{ background: "var(--color-acento-600)" }}
          >
            {enviando ? "Enviando…" : "Enviar mi idea"}
          </button>
          {/*
            El mismo "Mejorar con IA" del panel del documento, para abajo de lg.
            Ese panel no se dibuja en el telefono, y cuando se sacaron los
            botones de cada campo el pedido quedo solo ahi: desde el celular,
            que es por donde entra el vecino, no habia forma de pedir la ayuda
            que el texto de abajo promete. Sigue siendo uno solo en pantalla:
            este se esconde justo donde aparece el otro.
          */}
          {conIA && (
            <button
              type="button"
              onClick={() => void pedirAyuda()}
              disabled={iaDeshabilitada}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3.5 text-sm font-semibold transition disabled:opacity-50 sm:w-auto lg:hidden"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--marca-texto)",
              }}
            >
              <IconoChispa />
              {revisando ? "Trabajando…" : revision ? "Volver a pedir" : "Mejorar con IA"}
            </button>
          )}
        </div>

        {/* Solo con IA: sin clave (o con el gasto del dia pasado) no hay boton
            en ninguna pantalla, y el texto prometia una revision que no existia. */}
        {conIA && paso === ULTIMO && !revision && !revisando && (
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Antes de enviar podés pedirnos una revisión con «Mejorar con IA»: te decimos qué le
            falta para que se entienda mejor y si ya hay una propuesta parecida en tu distrito. No
            es obligatorio.
          </p>
        )}
      </div>
      </div>

      {/*
        --- El documento -------------------------------------------------------
        En pantalla grande vive a la derecha y se queda pegado al hacer scroll.
        En el telefono no hay derecha: se esconde y lo reemplaza una barra fija
        abajo que lo abre a pantalla completa. Es el riesgo que quedo anotado en
        la maqueta —la herramienta que inspiro esto es de escritorio y el vecino
        entra del celular— y por eso el telefono no hereda la solucion, tiene la
        suya.

        Ojo con el PDF: en el telefono el <aside> esta en display:none, y lo que
        no se dibuja no se imprime. Por eso el boton de descargar aparece
        adentro de la ventana, que es la copia visible cuando se imprime desde
        un telefono.
      */}
      <aside className="panel-doc hidden lg:sticky lg:top-24 lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="text-xs font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--texto-suave)" }}
          >
            Así se va a presentar
          </p>
          <div className="flex items-center gap-2">
            {/*
              EL boton de IA. Uno solo en toda la pantalla, y esta acá y no al
              lado de un campo porque acá se ve el resultado: la propuesta que
              devuelve aparece en el documento de abajo y la persona la acepta o
              la descarta una vez, mirando el conjunto.
            */}
            {conIA && (
              <button
                type="button"
                onClick={() => void pedirAyuda()}
                disabled={iaDeshabilitada}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-50"
                style={{ background: "var(--color-marca-700)" }}
              >
                <IconoChispa />
                {revisando ? "Trabajando…" : revision ? "Volver a pedir" : "Mejorar con IA"}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg px-3 py-2 text-xs font-semibold transition"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--marca-texto)",
              }}
            >
              Descargar PDF
            </button>
          </div>
        </div>

        {conIA && !revision && !revisando && (
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Escribí con tus palabras y después pedí «Mejorar con IA»: ordena tu texto, te dice qué
            le falta y te ofrece detalles de obra para elegir. El texto que reescribe lo aceptás
            vos campo por campo; los detalles que tildes entran derecho.
          </p>
        )}

        <div className="mt-3">
          <DocumentoIdea
            poligono={poligono}
            activo={bloqueActivo}
            edicion={edicionDelDocumento}
            datos={datosDelDocumento}
          />
        </div>

        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Se arma con lo que escribís, sin inteligencia artificial y sin esperar nada. El PDF que
          se descarga es este mismo documento.
        </p>
      </aside>

      {/* --- El documento en el teléfono ------------------------------------ */}
      <div className="barra-doc">
        <button
          type="button"
          onClick={() => ventanaDoc.current?.showModal()}
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--marca-texto)" }}
        >
          Ver cómo queda
          <span aria-hidden="true">▲</span>
        </button>
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          Paso {paso} de {ULTIMO}
        </span>
      </div>

      <dialog
        ref={ventanaDoc}
        className="ventana-doc"
        aria-label="Así se va a presentar tu idea"
        onClick={(evento) => {
          if (evento.target === ventanaDoc.current) ventanaDoc.current?.close();
        }}
      >
        <div className="ventana-doc-jefe">
          <p className="text-sm font-bold">Así se va a presentar</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--marca-texto)",
              }}
            >
              Descargar PDF
            </button>
            <button
              type="button"
              onClick={() => ventanaDoc.current?.close()}
              aria-label="Cerrar"
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--texto-suave)",
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
        <div className="ventana-doc-cuerpo">
          <DocumentoIdea
            poligono={poligono}
            activo={bloqueActivo}
            edicion={edicionDelDocumento}
            datos={datosDelDocumento}
          />
        </div>
      </dialog>

      <style>{estilosPasos}</style>
    </form>
  );
}

/**
 * Lo poco que no se puede escribir con utilidades: la barra fija del telefono y
 * la ventana del documento. Mismo patron que Mapa, HeroInicio y DocumentoIdea.
 *
 * La barra deja aire abajo del formulario con padding en el body, para que no
 * tape el ultimo boton. Ojo con los backticks adentro de los comentarios: esto
 * es un template literal.
 */
const estilosPasos = `
/*
 * La barra existe SOLO abajo de lg, y quien lo decide es esta consulta de medio
 * y nada mas. Con la utilidad lg:hidden de Tailwind no alcanzaba: son dos
 * selectores de una clase cada uno, o sea la misma especificidad, y este bloque
 * va despues en el documento, asi que le ganaba y la barra aparecia tambien en
 * la compu.
 */
.barra-doc {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  background: color-mix(in srgb, var(--fondo) 94%, transparent);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--borde);
}

@media (max-width: 63.999rem) {
  .barra-doc { display: flex; }
  /* Que la barra no tape el ultimo control del formulario. */
  body { padding-bottom: 4rem; }
}

.ventana-doc {
  margin: auto;
  width: min(44rem, calc(100vw - 1.5rem));
  max-height: min(92dvh, 56rem);
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--borde);
  border-radius: 1rem;
  background: var(--fondo-suave);
  color: var(--texto);
}
.ventana-doc[open] { display: flex; }
.ventana-doc::backdrop {
  background: color-mix(in srgb, var(--color-marca-950) 45%, transparent);
}
.ventana-doc-jefe {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid var(--borde);
  background: var(--fondo-tarjeta);
}
.ventana-doc-cuerpo {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1rem;
}

/* Con la ventana abierta la pagina de atras no scrollea. */
body:has(.ventana-doc[open]) { overflow: hidden; }

/*
 * Al imprimir desde el telefono la copia visible es la de la ventana. La regla
 * de impresion de DocumentoIdea ya deja solo el documento; esto saca de la hoja
 * el marco de la ventana y la barra.
 */
@media print {
  .barra-doc { display: none !important; }
  .ventana-doc {
    position: static !important;
    max-height: none !important;
    border: 0 !important;
    background: #fff !important;
  }
  .ventana-doc-jefe { display: none !important; }
  .ventana-doc-cuerpo { overflow: visible !important; padding: 0 !important; }

  /*
   * En el telefono el panel de la derecha esta en display:none, y lo que no se
   * dibuja no se imprime: sin esta regla, un Ctrl+P (o el "imprimir" del menu
   * del navegador) con la ventana cerrada sacaba una hoja en blanco.
   *
   * La condicion importa: se muestra el panel SOLO si la ventana esta cerrada.
   * Si estuviera abierta y ademas mostraramos el panel, en la hoja saldria el
   * documento dos veces.
   */
  body:not(:has(.ventana-doc[open])) .panel-doc { display: block !important; }
}
`;

function IconoChispa() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
      <path d="M18 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </svg>
  );
}

/**
 * Todo lo que devuelve el asistente, en un solo lugar.
 *
 * El orden no es casual, va de lo mas accionable a lo mas informativo:
 *
 *  1. El texto propuesto, con aceptar o descartar. Es lo que la persona vino a
 *     buscar cuando apreto el boton.
 *  2. Que le sigue faltando, con la pregunta del formulario al frente.
 *  3. Los aspectos de obra para tildar, cada uno con para que sirve.
 *  4. Si ya hay una propuesta parecida en el distrito.
 *
 * Lo determinístico y lo generado estan separados a proposito: los minimos y las
 * propuestas parecidas salen de codigo comun y estan siempre; el resto lo dice
 * un modelo, y el pie lo aclara.
 */
function PanelRevision({
  revision,
  aplicados,
  elegidos,
  onTildar,
  onAgregar,
  onAplicar,
  onDescartar,
  ocupado,
}: {
  revision: RespuestaAsistente;
  /** Etiquetas de los campos que ya se aplicaron, o null si todavia no. */
  aplicados: string[] | null;
  elegidos: string[];
  onTildar: (nombre: string) => void;
  onAgregar: () => void;
  /** Recibe SOLO los campos que la persona dejo, ya con sus retoques. */
  onAplicar: (elegido: PropuestaIA) => void;
  onDescartar: () => void;
  ocupado: boolean;
}) {
  const { modo, faltantes, parecidas, senalamientos, propuesta, detalles, aviso } = revision;
  const hayPropuesta =
    propuesta &&
    (propuesta.titulo || propuesta.solucion || propuesta.problema || propuesta.beneficios);
  const todoBien =
    !faltantes.length && !parecidas.length && !senalamientos.length && !hayPropuesta && !aviso;

  /**
   * Lo que la persona retoco y lo que decidio no usar, por campo.
   *
   * Vive aca y no en el formulario porque muere con la revision: cuando llega
   * una propuesta nueva se arranca de cero. La `key` del efecto es el texto
   * mismo de la propuesta y no su identidad de objeto, porque el objeto se
   * recrea en cada render del padre.
   */
  const [borradores, setBorradores] = useState<Partial<Record<CampoPropuesta, string>>>({});
  const [descartados, setDescartados] = useState<Partial<Record<CampoPropuesta, boolean>>>({});
  const huella = JSON.stringify(propuesta);
  useEffect(() => {
    setBorradores({});
    setDescartados({});
  }, [huella]);

  /** Lo que se va a escribir en el formulario: lo no descartado, ya editado. */
  const aAplicar: PropuestaIA = {
    titulo: null,
    solucion: null,
    problema: null,
    beneficios: null,
  };
  if (propuesta) {
    for (const { campo } of CAMPOS_PROPUESTA) {
      const original = propuesta[campo];
      if (!original || descartados[campo]) continue;
      const texto = (borradores[campo] ?? original).trim();
      // Un campo que quedo vacio de tanto borrar no se aplica: escribirlo
      // vaciaria lo que la persona ya tenia.
      if (texto) aAplicar[campo] = texto;
    }
  }
  const cuantosVanAAplicarse = CAMPOS_PROPUESTA.filter(({ campo }) => aAplicar[campo]).length;

  return (
    <section
      aria-live="polite"
      className="rounded-2xl p-5"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--color-marca-600)" }}
    >
      <h3 className="text-base font-bold">Lo que encontró el asistente</h3>

      {todoBien && (
        <p className="mt-2 text-sm leading-relaxed">
          Tu propuesta se entiende y está completa. Podés enviarla.
        </p>
      )}

      {aviso && (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {aviso}
        </p>
      )}

      {/* --- 1. El texto propuesto ---------------------------------------- */}
      {hayPropuesta && propuesta && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Tu texto, ordenado</p>
          <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
            A partir de lo que escribiste, sin agregar datos nuevos. Si no te representa, dejá el
            tuyo.
          </p>
          {/* Un campo por vez, no todo junto. Antes eran los cuatro en un solo
              bloque con "usar" o "descartar": si el titulo estaba bien pero la
              reescritura del problema no gustaba, no habia salida. */}
          <div className="mt-2.5 grid gap-2">
            {CAMPOS_PROPUESTA.map(({ campo, etiqueta }) => {
              const original = propuesta[campo];
              if (!original) return null;
              return (
                <CampoPropuesto
                  key={campo}
                  etiqueta={etiqueta}
                  original={original}
                  texto={borradores[campo] ?? original}
                  descartado={Boolean(descartados[campo])}
                  minimo={MINIMOS[campo as keyof typeof MINIMOS]}
                  maximo={LARGOS[campo]}
                  enUnaLinea={campo === "titulo"}
                  ocupado={ocupado}
                  onEscribir={(valor) => setBorradores((p) => ({ ...p, [campo]: valor }))}
                  onRestaurar={() =>
                    setBorradores((p) => {
                      const { [campo]: _fuera, ...resto } = p;
                      return resto;
                    })
                  }
                  onQuitar={() => setDescartados((p) => ({ ...p, [campo]: true }))}
                  onVolverAIncluir={() =>
                    setDescartados((p) => {
                      const { [campo]: _fuera, ...resto } = p;
                      return resto;
                    })
                  }
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAplicar(aAplicar)}
              disabled={ocupado || cuantosVanAAplicarse === 0}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              {cuantosVanAAplicarse === 1
                ? "Aplicar el campo elegido"
                : `Aplicar los ${cuantosVanAAplicarse} campos`}
            </button>
            <button
              type="button"
              onClick={onDescartar}
              disabled={ocupado}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--texto-suave)",
              }}
            >
              Dejar el mío
            </button>
          </div>
          {cuantosVanAAplicarse === 0 && (
            <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
              Quitaste todos los campos, así que no hay nada para aplicar.
            </p>
          )}
        </div>
      )}

      {/* Aplicar deja rastro: el bloque no desaparece, queda plegado diciendo
          que campos se escribieron. Sin esto la persona apretaba y no le
          quedaba nada que confirmara que habia pasado algo. */}
      {aplicados && aplicados.length > 0 && (
        <Seccion
          titulo="Aplicamos el texto a tu propuesta"
          resumen={aplicados.length === 1 ? "1 campo" : `${aplicados.length} campos`}
          estado="hecho"
          abierta={false}
        >
          <ul className="space-y-1 pl-4 text-sm">
            {aplicados.map((etiqueta) => (
              <li key={etiqueta} className="list-disc">
                {etiqueta}
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Quedaron escritos en los campos del formulario y los podés seguir editando a mano.
          </p>
        </Seccion>
      )}

      {/* --- 2. Que le falta ---------------------------------------------- */}
      {faltantes.length > 0 && (
        <ul className="mt-4 space-y-1.5 pl-4 text-sm">
          {faltantes.map((texto) => (
            <li key={texto} className="list-disc">
              {texto}
            </li>
          ))}
        </ul>
      )}

      {/* Plegado por defecto: son sugerencias para que se entienda mejor, no
          cosas que bloqueen el envio. Los "faltantes" de arriba SI quedan
          siempre a la vista, porque sin ellos la propuesta no se puede enviar. */}
      {senalamientos.length > 0 && (
        <Seccion
          titulo="Para que se entienda mejor"
          resumen={
            senalamientos.length === 1 ? "1 sugerencia" : `${senalamientos.length} sugerencias`
          }
          estado="info"
          abierta={false}
        >
          {/* La pregunta la pone el formulario, no el modelo: asi el nombre que
              lee la persona es siempre el que tiene arriba en la pantalla. */}
          <ul className="space-y-1.5 pl-4 text-sm">
            {senalamientos.map((senalamiento, indice) => (
              <li key={indice} className="list-disc">
                {PREGUNTA_DEL_CAMPO[senalamiento.campo] && (
                  <span className="font-semibold">
                    {PREGUNTA_DEL_CAMPO[senalamiento.campo]}:{" "}
                  </span>
                )}
                {senalamiento.texto}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed">
            Completá esos datos en los campos y volvé a pedir la ayuda.
          </p>
        </Seccion>
      )}

      {/* --- 3. Los aspectos de obra -------------------------------------- */}
      {detalles.length > 0 && (
        <div
          className="mt-4 rounded-xl p-3"
          style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
        >
          <p className="text-xs font-semibold">¿Querés agregar alguno de estos? Los elegís vos</p>
          <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
            Son cosas que el municipio suele pedir para una obra así y que no escribiste. De cada
            una dice para qué sirve y qué gana tu propuesta si la incluís. Tildá solo las que
            quieras.
          </p>
          {/* Cada opcion con su explicacion: sin eso la IA las enumera y la
              persona tilda a ciegas. La explicacion es para decidir y NO entra
              en el texto de la propuesta. */}
          {/* Cada opcion es una tarjeta con las DOS explicaciones separadas.
              Antes era una linea de 12px con una sola frase generica, que es el
              texto mas chico de la pantalla justo donde hay que decidir. Y la
              frase generica servia para cualquier obra: no decia que gana ESTA
              propuesta, asi que la gente tildaba a ciegas o no tildaba nada. */}
          <ul className="mt-3 grid gap-2.5">
            {detalles.map((detalle) => {
              const tildado = elegidos.includes(detalle.nombre);
              return (
                <li key={detalle.nombre}>
                  <label
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl p-3.5 transition"
                    style={{
                      background: "var(--fondo)",
                      border: `1px solid ${tildado ? "var(--marca-texto)" : "var(--borde)"}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={tildado}
                      onChange={() => onTildar(detalle.nombre)}
                      disabled={ocupado}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{detalle.nombre}</span>
                      <span
                        className="mt-1.5 block text-[13px] leading-relaxed"
                        style={{ color: "var(--texto-suave)" }}
                      >
                        <span className="font-semibold" style={{ color: "var(--texto)" }}>
                          Para qué sirve.{" "}
                        </span>
                        {detalle.porQue}
                      </span>
                      <span
                        className="mt-1 block text-[13px] leading-relaxed"
                        style={{ color: "var(--texto-suave)" }}
                      >
                        <span className="font-semibold" style={{ color: "var(--marca-texto)" }}>
                          Qué gana tu propuesta.{" "}
                        </span>
                        {detalle.mejora}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {elegidos.length > 0 && (
            <button
              type="button"
              onClick={onAgregar}
              disabled={ocupado}
              className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--marca-texto)",
              }}
            >
              Agregar {elegidos.length === 1 ? "lo elegido" : `los ${elegidos.length} elegidos`}
            </button>
          )}
        </div>
      )}

      {/* --- 4. Propuestas parecidas -------------------------------------- */}
      {/* Plegado: es un dato bueno de saber y no cambia nada de lo que la
          persona tiene que hacer. Puede enviar la suya igual. */}
      {parecidas.length > 0 && (
        <Seccion
          titulo={
            parecidas.length === 1
              ? "Ya hay una propuesta parecida en tu distrito"
              : "Ya hay propuestas parecidas en tu distrito"
          }
          resumen={parecidas.length === 1 ? "1 propuesta" : `${parecidas.length} propuestas`}
          estado="info"
          abierta={false}
        >
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Podés presentar la tuya igual. Si son lo mismo, el equipo las integra en un solo
            proyecto.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {parecidas.map((parecida, indice) => (
              <li key={indice}>
                {parecida.url && parecida.titulo ? (
                  <a
                    href={parecida.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                    style={{ color: "var(--marca-texto)" }}
                  >
                    {parecida.titulo}
                  </a>
                ) : (
                  <span style={{ color: "var(--texto-suave)" }}>
                    Una propuesta que todavía está en evaluación.
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      {/* El miedo razonable de quien lee esto es que la maquina este puntuando
          su idea, y el lugar para desmentirlo es el pie. Solo en modo "ia": en
          modo basico no intervino ningun modelo y decir que si seria
          atribuirle algo que no hizo. */}
      {modo === "ia" ? (
        <p
          className="mt-5 border-t pt-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--borde)", color: "var(--texto-suave)" }}
        >
          Esto lo hace un asistente de inteligencia artificial y puede equivocarse.{" "}
          <strong>No evalúa tu propuesta ni decide si se publica</strong>: eso lo hace el equipo
          del programa, y podés enviarla igual sin aplicar ningún cambio.{" "}
          <a href="#aviso-ia" className="underline" style={{ color: "inherit" }}>
            Aviso legal
          </a>
        </p>
      ) : (
        <p
          className="mt-5 border-t pt-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--borde)", color: "var(--texto-suave)" }}
        >
          Esto son chequeos automáticos sobre lo que cargaste, sin inteligencia artificial.{" "}
          <strong>No evalúa tu propuesta ni decide si se publica</strong>: eso lo hace el equipo
          del programa, y podés enviarla igual sin cambiar nada.
        </p>
      )}
    </section>
  );
}
const campoEstilo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{etiqueta}</span>
      {ayuda && (
        <span className="mt-0.5 block text-xs" style={{ color: "var(--texto-suave)" }}>
          {ayuda}
        </span>
      )}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

/** Mira de puntería: el gesto de "ubicarme" sin depender del color. */
function IconoMira() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

/**
 * El riel de pasos: donde estoy, cuanto falta, y que ya quedo listo.
 *
 * Es la pieza que hace que "una pregunta a la vez" no se sienta como un tunel:
 * se puede saltar a cualquier paso, tambien para atras, y los pasos completos
 * quedan con un tilde. Sin esto la persona no sabe si le quedan dos preguntas o
 * diez, que es justo la sensacion que habia que sacarse de encima.
 *
 * En pantallas chicas queda solo el numero: cinco etiquetas no entran en 390 px
 * sin encimarse, y el numero mas el titulo grande de abajo alcanzan para saber
 * donde esta uno.
 */
function RielDePasos({
  paso,
  completo,
  onIr,
  deshabilitado,
}: {
  paso: number;
  completo: (n: number) => boolean;
  onIr: (n: number) => void;
  deshabilitado: boolean;
}) {
  return (
    <nav aria-label="Pasos del formulario" className="flex flex-wrap items-center gap-1.5">
      {PASOS.map((p, i) => {
        const n = i + 1;
        const actual = n === paso;
        const hecho = !actual && completo(n);
        return (
          <button
            key={p.corto}
            type="button"
            onClick={() => onIr(n)}
            disabled={deshabilitado}
            aria-current={actual ? "step" : undefined}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition disabled:opacity-50"
            style={{
              color: actual ? "var(--color-marca-900)" : "var(--texto-suave)",
              fontWeight: actual ? 600 : 400,
              background: actual ? "var(--color-marca-50)" : "transparent",
            }}
          >
            <span
              aria-hidden="true"
              className="grid h-5.5 w-5.5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold"
              style={{
                width: "1.375rem",
                height: "1.375rem",
                background: actual
                  ? "var(--color-marca-700)"
                  : hecho
                    ? "var(--color-cat-ambiental)"
                    : "var(--borde)",
                color: actual || hecho ? "#fff" : "var(--texto-suave)",
              }}
            >
              {hecho ? "✓" : n}
            </span>
            <span className="hidden sm:inline">{p.corto}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Un campo de la propuesta de la IA, con sus tres estados: como vino, en
 * edicion, o quitado.
 *
 * El contador del modo edicion muestra el minimo del campo a proposito: es
 * exactamente lo que reclaman los "faltantes" de mas arriba, y asi la persona lo
 * ve mientras escribe en lugar de enterarse cuando envia.
 */
function CampoPropuesto({
  etiqueta,
  original,
  texto,
  descartado,
  minimo,
  maximo,
  enUnaLinea,
  ocupado,
  onEscribir,
  onRestaurar,
  onQuitar,
  onVolverAIncluir,
}: {
  etiqueta: string;
  /** Lo que devolvio la IA, para poder volver a el. */
  original: string;
  texto: string;
  descartado: boolean;
  /** `undefined` en los campos que no tienen minimo, como beneficios. */
  minimo: number | undefined;
  maximo: number;
  enUnaLinea: boolean;
  ocupado: boolean;
  onEscribir: (valor: string) => void;
  onRestaurar: () => void;
  onQuitar: () => void;
  onVolverAIncluir: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const retocado = texto !== original;
  const largo = texto.trim().length;
  const cortoDeMas = minimo !== undefined && largo < minimo;

  if (descartado) {
    return (
      <div
        className="rounded-xl px-3.5 py-3"
        style={{ background: "var(--fondo)", border: "1px dashed var(--borde)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
          {etiqueta}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Este campo queda como lo escribiste vos.
          <button
            type="button"
            onClick={onVolverAIncluir}
            disabled={ocupado}
            className="font-semibold underline underline-offset-2 disabled:opacity-50"
            style={{ color: "var(--marca-texto)" }}
          >
            Volver a incluirlo
          </button>
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{
        background: "var(--fondo)",
        border: `1px solid ${editando ? "var(--marca-texto)" : "var(--borde)"}`,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
          {etiqueta}
          {retocado && (
            <span className="ml-2 normal-case" style={{ color: "var(--marca-texto)" }}>
              retocado por vos
            </span>
          )}
        </p>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            disabled={ocupado}
            className="underline underline-offset-2 disabled:opacity-50"
            style={{ color: "var(--marca-texto)" }}
          >
            {editando ? "Listo" : "Editar"}
          </button>
          <button
            type="button"
            onClick={onQuitar}
            disabled={ocupado}
            className="underline underline-offset-2 disabled:opacity-50"
            style={{ color: "var(--texto-suave)" }}
          >
            Quitar
          </button>
        </div>
      </div>

      {editando ? (
        <>
          {enUnaLinea ? (
            <input
              type="text"
              value={texto}
              onChange={(e) => onEscribir(e.target.value)}
              // Enter confirma la edicion, como el "Listo". El formulario ya le
              // corta el envio (ver cortarEnterQueEnvia).
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) setEditando(false);
              }}
              maxLength={maximo}
              disabled={ocupado}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--texto)",
              }}
            />
          ) : (
            <textarea
              value={texto}
              onChange={(e) => onEscribir(e.target.value)}
              maxLength={maximo}
              rows={5}
              disabled={ocupado}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm leading-relaxed"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "1px solid var(--borde-control)",
                color: "var(--texto)",
              }}
            />
          )}
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <span style={{ color: cortoDeMas ? "var(--acento-texto)" : "var(--texto-suave)" }}>
              {largo} de {maximo} caracteres
              {minimo !== undefined &&
                (cortoDeMas
                  ? ` · le faltan ${minimo - largo} para el mínimo de ${minimo}`
                  : ` · pasa el mínimo de ${minimo}`)}
            </span>
            {retocado && (
              <button
                type="button"
                onClick={onRestaurar}
                disabled={ocupado}
                className="font-semibold underline underline-offset-2 disabled:opacity-50"
                style={{ color: "var(--texto-suave)" }}
              >
                Volver al texto de la IA
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed">{texto}</p>
      )}
    </div>
  );
}

/**
 * Un bloque plegable del panel.
 *
 * Es <details>/<summary> y no estado de React a proposito: se pliega y se abre
 * con el teclado sin que escribamos nada, no puede desincronizarse, y no hay
 * riesgo de desajuste de hidratacion por abrir segun algo que el servidor no
 * sabe. `abierta` es solo el valor INICIAL: despues manda la persona.
 *
 * El resumen del encabezado es lo que hace que plegar no sea esconder. Un bloque
 * cerrado tiene que decir cuanto hay adentro ("3 observaciones"), porque si no
 * la persona no sabe que se esta perdiendo y no lo abre nunca.
 */
function Seccion({
  titulo,
  resumen,
  estado,
  abierta,
  children,
}: {
  titulo: string;
  resumen: string;
  estado: "hecho" | "atencion" | "info";
  abierta: boolean;
  children: React.ReactNode;
}) {
  const color =
    estado === "hecho"
      ? "var(--color-cat-ambiental)"
      : estado === "atencion"
        ? "var(--acento-texto)"
        : "var(--marca-texto)";
  return (
    <details
      open={abierta}
      className="group mt-2.5 rounded-xl"
      style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        {estado === "hecho" ? (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            className="shrink-0"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d={estado === "atencion" ? "M12 8v4M12 16h.01" : "M12 16v-4M12 8h.01"} />
          </svg>
        )}
        <span className="min-w-0 flex-grow text-sm">
          <span className="font-semibold">{titulo}</span>
          <span style={{ color: "var(--texto-suave)" }}> · {resumen}</span>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--texto-suave)"
          strokeWidth="2"
          strokeLinecap="round"
          className="shrink-0 transition group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className="px-3.5 pb-3.5">{children}</div>
    </details>
  );
}
