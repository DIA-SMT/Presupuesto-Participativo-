"use client";

/**
 * Formulario de carga de una idea.
 *
 * La diferencia central con el sitio anterior: la ubicacion no se escribe, se
 * marca en el mapa. El formulario manda lat/lon numericos y el servidor deriva
 * el distrito con PostGIS, asi que no hay forma de cargar una coordenada
 * invalida ni de asignar mal el distrito.
 *
 * Datos personales: el telefono ya no se pide (la columna no existe) y el
 * correo es facultativo, detras de una casilla desmarcada. Sin la casilla el
 * campo del correo ni siquiera se envia, y el aviso de como sigue la idea se
 * resuelve con el codigo de seguimiento que devuelve /api/ideas.
 *
 * UN solo boton de inteligencia artificial
 * ----------------------------------------
 * Hubo cuatro: uno al pie de cada campo largo mas la revision. El jefe del
 * programa lo dijo sin vueltas —eran demasiados— y tenia razon: cada uno abria
 * su propio panel con su propio aceptar y descartar, y la persona tomaba cuatro
 * decisiones sobre pedazos sueltos sin ver nunca el conjunto.
 *
 * Ahora hay uno, "Mejorar con IA", y vive en el panel del documento, no al lado
 * de un campo: ahi se ve el resultado. Una sola llamada a
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
import DocumentoIdea, { type BloqueActivo } from "@/components/DocumentoIdea";
import Mapa from "@/components/Mapa";
import type { RespuestaAsistente } from "@/app/api/ideas/asistente/route";

type Categoria = { slug: string; nombre: string; descripcion: string };

type Estado =
  | { tipo: "editando" }
  | { tipo: "revisando" }
  | { tipo: "enviando" }
  | { tipo: "listo"; numero: number; distrito: number; codigo: string }
  | { tipo: "error"; mensaje: string };

const LARGOS = {
  titulo: 140,
  problema: 3000,
  solucion: 4000,
  beneficios: 3000,
} as const;

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
 * El titulo y la categoria van en el ULTIMO paso y no en el primero, que es el
 * cambio menos obvio de la lista: pedirle un titulo que resuma la propuesta a
 * alguien que todavia no la escribio es la parte mas dificil del formulario, y
 * en el ultimo paso ya tiene todo escrito para poder resumirlo.
 */
const PASOS: ReadonlyArray<{ corto: string; titulo: string; opcional?: boolean }> = [
  { corto: "Dónde", titulo: "¿Dónde sería?" },
  { corto: "Qué", titulo: "¿Qué querés proponer?" },
  { corto: "Por qué", titulo: "¿Por qué hace falta?" },
  { corto: "Quiénes", titulo: "¿Quiénes se benefician?", opcional: true },
  { corto: "Revisar", titulo: "Revisá y enviá" },
];

const ULTIMO = PASOS.length;

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
  solucion: "¿Qué querés proponer?",
  problema: "¿Por qué hace falta?",
  beneficios: "¿Quiénes se benefician?",
  titulo: "Título de la idea",
  categoria: "Categoría",
};

export default function FormularioIdea({
  categorias,
  abierta,
  conIA,
  anio,
}: {
  categorias: Categoria[];
  abierta: boolean;
  /** Año de la edición activa, para el encabezado del documento. */
  anio: number;
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
  const [estado, setEstado] = useState<Estado>({ tipo: "editando" });
  /** Consentimiento para guardar el correo. Arranca en false, siempre. */
  const [avisos, setAvisos] = useState(false);

  /** Ultima respuesta del asistente, o null si todavia no se pidio ninguna. */
  const [revision, setRevision] = useState<RespuestaAsistente | null>(null);
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
    categoria: "",
    barrio: "",
    problema: "",
    solucion: "",
    beneficios: "",
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
  /** En que paso esta la persona. Arranca en 1: primero el lugar. */
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
    if (n === 1) {
      if (!punto) return "Marcá en el mapa dónde sería la obra.";
      if (!distrito) return "Ese punto queda fuera de los 20 distritos. Marcá más cerca.";
      return null;
    }
    if (n === 2) {
      return largos.solucion >= MINIMOS.solucion
        ? null
        : `Contá un poco más qué querés proponer: necesita al menos ${MINIMOS.solucion} caracteres.`;
    }
    if (n === 3) {
      return largos.problema >= MINIMOS.problema
        ? null
        : `Contá un poco más por qué hace falta: necesita al menos ${MINIMOS.problema} caracteres.`;
    }
    if (n === 4) return null; // opcional
    if (!valores.titulo.trim() || valores.titulo.trim().length < MINIMOS.titulo) {
      return `El título es muy corto: necesita al menos ${MINIMOS.titulo} caracteres.`;
    }
    if (!valores.categoria) return "Elegí una categoría.";
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
  const refCategoria = useRef<HTMLSelectElement>(null);
  const refBarrio = useRef<HTMLInputElement>(null);
  const refProblema = useRef<HTMLTextAreaElement>(null);
  const refSolucion = useRef<HTMLTextAreaElement>(null);
  const refBeneficios = useRef<HTMLTextAreaElement>(null);
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
   */
  async function elegirPunto(nuevo: { lat: number; lon: number }) {
    setPunto(nuevo);
    setDistrito(null);
    setUbicando(true);
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      const cuerpo = (await respuesta.json()) as {
        distrito: number | null;
        barrio: string | null;
      };
      setDistrito(cuerpo.distrito);

      const campo = refBarrio.current;
      const escritoAMano = campo && campo.value.trim() && campo.value !== barrioPuesto.current;
      if (campo && cuerpo.barrio && !escritoAMano) {
        campo.value = cuerpo.barrio;
        barrioPuesto.current = cuerpo.barrio;
        setBarrioAutomatico(true);
        anotarValor("barrio", cuerpo.barrio);
      }
      if (cuerpo.distrito) void cargarPoligono(cuerpo.distrito);
    } catch {
      setDistrito(null);
    } finally {
      setUbicando(false);
    }
  }

  /**
   * El contorno del distrito, para el mapita del documento.
   *
   * Sale del mismo /geo/distritos.geojson que ya bajo el mapa grande, asi que
   * en la practica lo sirve el cache. Si falla no se avisa nada: el documento
   * dibuja solo el punto y las coordenadas van en texto igual, asi que no se
   * pierde informacion.
   */
  async function cargarPoligono(numero: number) {
    try {
      const geo = (await (await fetch("/geo/distritos.geojson")).json()) as {
        features: Array<{
          properties: { numero: number };
          geometry: { coordinates: number[][][][] };
        }>;
      };
      const f = geo.features.find((x) => x.properties.numero === numero);
      // El anillo exterior del primer poligono alcanza para dibujar el contorno.
      setPoligono(f?.geometry.coordinates?.[0]?.[0] ?? null);
    } catch {
      setPoligono(null);
    }
  }

  /**
   * "Usar mi ubicacion". Deja un punto que se puede corregir, no una respuesta
   * final: el vecino puede estar en su casa proponiendo una obra a tres cuadras.
   * Nunca se dispara solo, siempre lo aprieta la persona, y no guarda su
   * ubicacion en ningun lado: lo unico que se guarda es el punto de la
   * propuesta, que ya se guardaba y que ademas es publico porque se dibuja en el
   * mapa del sitio.
   */
  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setEstado({
        tipo: "error",
        mensaje: "Este navegador no puede darnos tu ubicación. Marcá el lugar en el mapa.",
      });
      return;
    }
    setBuscandoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscandoGps(false);
        setPuntoPorGps(true);
        void elegirPunto({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setBuscandoGps(false);
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
   */
  async function alEnviarFormulario(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
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
   * El unico pedido de IA de toda la pantalla.
   *
   * Devuelve de una vez el texto formalizado de cada campo que tenga contenido,
   * un titulo sugerido, que le falta a la propuesta, si ya hay una parecida en
   * el distrito y los aspectos de obra para tildar. Nada se aplica solo: queda
   * a la vista y la persona acepta o descarta.
   *
   * Nunca bloquea el envio: si falla, avisa y el formulario sigue andando.
   */
  async function pedirAyuda(agregar?: string[]) {
    setEstado({ tipo: "revisando" });
    try {
      const respuesta = await fetch("/api/ideas/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: valores.titulo || null,
          categoria: valores.categoria || null,
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
        throw new Error(cuerpo?.error ?? "No se pudo generar la ayuda.");
      }

      setRevision((await respuesta.json()) as RespuestaAsistente);
      setElegidos([]);
      setEstado({ tipo: "editando" });
    } catch (causa) {
      setRevision({
        modo: "basico",
        faltantes: [],
        parecidas: [],
        senalamientos: [],
        propuesta: null,
        detalles: [],
        aviso:
          causa instanceof Error
            ? causa.message
            : "No se pudo generar la ayuda. Podés enviar tu idea igual.",
      });
      setEstado({ tipo: "editando" });
    }
  }

  /**
   * Aplica el texto propuesto a los campos. Solo se llama si la persona acepta,
   * y escribe unicamente lo que la IA devolvio: lo que vino null no se toca.
   */
  function aplicarPropuesta() {
    const p = revision?.propuesta;
    if (!p) return;
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
    setRevision({ ...revision!, propuesta: null });
  }

  /** Un campo cambio: se espeja en estado para redibujar el documento. */
  function anotarValor(campo: keyof typeof valores, valor: string) {
    setValores((previo) => (previo[campo] === valor ? previo : { ...previo, [campo]: valor }));
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
          categoria: datos.get("categoria"),
          barrio: datos.get("barrio") || null,
          problema: datos.get("problema"),
          solucion: datos.get("solucion"),
          beneficios: datos.get("beneficios") || null,
          lat: punto.lat,
          lon: punto.lon,
          autorNombre: datos.get("autorNombre") || null,
          // Sin la casilla marcada el correo no viaja: no hay consentimiento.
          autorEmail: avisos ? datos.get("autorEmail") || null : null,
          autorAvisos: avisos,
        }),
      });

      const cuerpo = (await respuesta.json()) as {
        numero?: number;
        distrito?: number;
        codigo?: string;
        error?: string;
      };

      if (!respuesta.ok || !cuerpo.numero || !cuerpo.codigo) {
        throw new Error(cuerpo.error ?? "No se pudo enviar la idea.");
      }
      setEstado({
        tipo: "listo",
        numero: cuerpo.numero,
        distrito: cuerpo.distrito ?? distrito,
        codigo: cuerpo.codigo,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (causa) {
      setEstado({
        tipo: "error",
        mensaje: causa instanceof Error ? causa.message : "No se pudo enviar la idea.",
      });
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
              Número de tu idea
            </p>
            <p className="mt-1 font-mono text-2xl font-bold">#{estado.numero}</p>
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
          Anotá los dos datos o sacale una foto a esta pantalla.
        </p>
        <p className="mt-1 max-w-prose text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          El código no se vuelve a mostrar y no lo podés recuperar desde el sitio. Con el número y el
          código consultás cuando quieras en qué etapa está tu idea y leés la devolución del equipo,
          sin depender de que te escribamos.
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

  return (
    <form
      onSubmit={alEnviarFormulario}
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
          style={{ color: "var(--color-marca-900)", textWrap: "balance" }}
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
      {/* --- Paso 1: el lugar ---------------------------------------------- */}
      <section className={paso === 1 ? "" : "hidden"}>
        <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
          Tocá el mapa en el lugar de la obra. El distrito y el barrio se completan solos.
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
            color: "var(--color-marca-700)",
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
          {punto && !ubicando && !distrito && (
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
            className={paso === 2 ? "text-sm leading-relaxed" : "hidden"}
            style={{ color: "var(--texto-suave)" }}
          >
            Escribilo con tus palabras, como puedas.{" "}
            {conIA ? (
              <>
                Después revisamos qué le falta, vos completás esos datos, y al final la IA te
                ordena el texto.
              </>
            ) : (
              <>Después revisamos qué le falta y vos decidís qué corregir.</>
            )}
          </p>

          <div className={paso === ULTIMO ? "" : "hidden"}>
          <Campo etiqueta="Título de la idea" ayuda="Una línea que resuma la propuesta.">
            <input
              ref={refTitulo}
              name="titulo"
              maxLength={LARGOS.titulo}
              disabled={!abierta || ocupado}
              onInput={(evento) => anotarValor("titulo", evento.currentTarget.value)}
              placeholder="Puesta en valor de la plaza del barrio…"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            />
          </Campo>

          <Campo etiqueta="Categoría">
            <select
              ref={refCategoria}
              name="categoria"
              disabled={!abierta || ocupado}
              onChange={(evento) => anotarValor("categoria", evento.currentTarget.value)}
              defaultValue=""
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={campoEstilo}
            >
              <option value="" disabled>
                Elegí una categoría
              </option>
              {categorias.map((categoria) => (
                <option key={categoria.slug} value={categoria.slug}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
            <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--texto-suave)" }}>
              {categorias.map((categoria) => (
                <li key={categoria.slug}>
                  <strong>{categoria.nombre}:</strong> {categoria.descripcion}
                </li>
              ))}
            </ul>
          </Campo>
          </div>

          {/* El barrio va con el lugar: lo completa el mapa. */}
          <div className={paso === 1 ? "" : "hidden"}>
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
            El orden de estas dos preguntas esta invertido respecto de las
            columnas de la base, y es a proposito (pedido de Lucas, 26/08/2026):
            la gente llega con "quiero una plaza", no con "el problema es la
            carencia de espacios verdes". Primero se le pregunta QUE quiere
            (columna `solucion`) y despues POR QUE hace falta (columna
            `problema`). Las columnas siguen significando lo mismo que siempre;
            lo unico que cambia es el orden en pantalla y como se pregunta.
          */}
          <div className={paso === 2 ? "" : "hidden"}>
            <Campo
              etiqueta="¿Qué querés proponer?"
              ayuda="Contá qué obra o mejora querés para tu barrio. Con tus palabras alcanza."
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

          <div className={paso === 3 ? "" : "hidden"}>
            <Campo
              etiqueta="¿Por qué hace falta?"
              ayuda="¿Qué pasa hoy en el barrio? ¿A quiénes afecta?"
            >
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
          <div className={paso === 4 ? "" : "hidden"}>
            <Campo
              etiqueta="¿Quiénes se benefician?"
              ayuda="Opcional. La IA puede escribirlo a partir de lo que contaste arriba."
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
          <h3 className="text-base font-bold">Tus datos (opcionales)</h3>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Ninguno de estos datos se publica. Al enviar la idea te vamos a dar un{" "}
            <strong>código de seguimiento</strong>: con ese código y el número de tu idea podés ver
            cuando quieras cómo sigue, sin dejarnos ningún dato de contacto.
          </p>

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

          {/* Consentimiento del correo: casilla desmarcada y finalidad declarada. */}
          <div
            className="rounded-xl px-4 py-4"
            style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
          >
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={avisos}
                onChange={(evento) => setAvisos(evento.target.checked)}
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
        </section>

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
                  color: "var(--color-marca-700)",
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
        </div>

        {paso === ULTIMO && !revision && !revisando && (
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            Antes de enviar podés pedirnos una revisión: te decimos qué le falta para que se
            entienda mejor y si ya hay una propuesta parecida en tu distrito. No es obligatorio.
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
                disabled={!abierta || ocupado || (!largos.solucion && !largos.problema)}
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
                color: "var(--color-marca-700)",
              }}
            >
              Descargar PDF
            </button>
          </div>
        </div>

        {conIA && !revision && !revisando && (
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Escribí con tus palabras y después pedí «Mejorar con IA»: ordena tu texto, te dice qué
            le falta y te ofrece detalles de obra para elegir. Nada se aplica sin que lo aceptes.
          </p>
        )}

        <div className="mt-3">
          <DocumentoIdea
            anio={anio}
            poligono={poligono}
            activo={bloqueActivo}
            datos={{
              titulo: valores.titulo,
              // El nombre de la categoria, no el slug: esto lo lee una persona.
              categoria:
                categorias.find((c) => c.slug === valores.categoria)?.nombre ?? "",
              barrio: valores.barrio,
              distrito,
              punto,
              solucion: valores.solucion,
              problema: valores.problema,
              beneficios: valores.beneficios,
            }}
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
          style={{ color: "var(--color-marca-700)" }}
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
                color: "var(--color-marca-700)",
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
            anio={anio}
            poligono={poligono}
            activo={bloqueActivo}
            datos={{
              titulo: valores.titulo,
              categoria: categorias.find((c) => c.slug === valores.categoria)?.nombre ?? "",
              barrio: valores.barrio,
              distrito,
              punto,
              solucion: valores.solucion,
              problema: valores.problema,
              beneficios: valores.beneficios,
            }}
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
  elegidos,
  onTildar,
  onAgregar,
  onAplicar,
  onDescartar,
  ocupado,
}: {
  revision: RespuestaAsistente;
  elegidos: string[];
  onTildar: (nombre: string) => void;
  onAgregar: () => void;
  onAplicar: () => void;
  onDescartar: () => void;
  ocupado: boolean;
}) {
  const { modo, faltantes, parecidas, senalamientos, propuesta, detalles, aviso } = revision;
  const hayPropuesta =
    propuesta &&
    (propuesta.titulo || propuesta.solucion || propuesta.problema || propuesta.beneficios);
  const todoBien =
    !faltantes.length && !parecidas.length && !senalamientos.length && !hayPropuesta && !aviso;

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
          <div
            className="mt-2.5 space-y-2.5 rounded-xl p-4 text-sm leading-relaxed"
            style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
          >
            {propuesta.titulo && (
              <p>
                <span className="font-semibold">Título: </span>
                {propuesta.titulo}
              </p>
            )}
            {propuesta.solucion && (
              <p>
                <span className="font-semibold">{PREGUNTA_DEL_CAMPO.solucion} </span>
                {propuesta.solucion}
              </p>
            )}
            {propuesta.problema && (
              <p>
                <span className="font-semibold">{PREGUNTA_DEL_CAMPO.problema} </span>
                {propuesta.problema}
              </p>
            )}
            {propuesta.beneficios && (
              <p>
                <span className="font-semibold">{PREGUNTA_DEL_CAMPO.beneficios} </span>
                {propuesta.beneficios}
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAplicar}
              disabled={ocupado}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              Usar este texto
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
        </div>
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

      {senalamientos.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold">Para que se entienda mejor:</p>
          {/* La pregunta la pone el formulario, no el modelo: asi el nombre que
              lee la persona es siempre el que tiene arriba en la pantalla. */}
          <ul className="mt-1.5 space-y-1.5 pl-4 text-sm">
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
        </>
      )}

      {/* --- 3. Los aspectos de obra -------------------------------------- */}
      {detalles.length > 0 && (
        <div
          className="mt-4 rounded-xl p-3"
          style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
        >
          <p className="text-xs font-semibold">¿Querés agregar alguno de estos? Los elegís vos</p>
          <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
            Son cosas que el municipio suele pedir para una obra así y que no escribiste. Abajo de
            cada una dice para qué sirve. Tildá solo las que quieras.
          </p>
          {/* Cada opcion con su explicacion: sin eso la IA las enumera y la
              persona tilda a ciegas. La explicacion es para decidir y NO entra
              en el texto de la propuesta. */}
          <ul className="mt-2.5 grid gap-2.5">
            {detalles.map((detalle) => (
              <li key={detalle.nombre}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={elegidos.includes(detalle.nombre)}
                    onChange={() => onTildar(detalle.nombre)}
                    disabled={ocupado}
                  />
                  <span>
                    <span className="block text-xs font-semibold">{detalle.nombre}</span>
                    <span
                      className="mt-0.5 block text-xs leading-relaxed"
                      style={{ color: "var(--texto-suave)" }}
                    >
                      {detalle.porQue}
                    </span>
                  </span>
                </label>
              </li>
            ))}
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
                color: "var(--color-marca-700)",
              }}
            >
              Agregar {elegidos.length === 1 ? "lo elegido" : `los ${elegidos.length} elegidos`}
            </button>
          )}
        </div>
      )}

      {/* --- 4. Propuestas parecidas -------------------------------------- */}
      {parecidas.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">
            Ya hay {parecidas.length === 1 ? "una propuesta parecida" : "propuestas parecidas"} en
            tu distrito
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
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
                    style={{ color: "var(--color-marca-600)" }}
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
        </div>
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
