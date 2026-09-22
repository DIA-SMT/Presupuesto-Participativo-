/**
 * La propuesta, mostrada como el documento que va a leer el municipio.
 *
 * Por que existe: hasta ahora el vecino cargaba campos sueltos y recien veia su
 * propuesta despues de enviarla. El jefe del programa lo dijo sin vueltas: el
 * formulario era "poco predictivo". Este componente es la respuesta, y su regla
 * de oro es que **no piensa**: toma el texto que la persona escribio y lo
 * muestra formateado, al instante, sin llamar a ningun modelo. Esa es
 * exactamente la razon por la que se puede confiar en el: lo que se ve es lo
 * que se envia, siempre, sin esperar nada.
 *
 * Se usa en dos lugares y a proposito es el MISMO componente:
 *
 *  1. Como previsualizacion, al lado del formulario, mientras se escribe.
 *  2. Como PDF, via la hoja de impresion de globals.css.
 *
 * De ahi que el PDF no pueda desincronizarse de lo que la persona vio: no hay
 * dos plantillas que alguien tenga que acordarse de cambiar a la vez. Tampoco
 * hace falta una libreria de PDF: el navegador ya sabe imprimir HTML, y su
 * "Guardar como PDF" produce un PDF de verdad tanto en computadora como en
 * telefono.
 */
import { useId, type ReactNode } from "react";

export type DatosDocumento = {
  titulo: string;
  /** Nombre de la categoria, no el slug: esto lo lee una persona. */
  categoria: string;
  barrio: string;
  distrito: number | null;
  punto: { lat: number; lon: number } | null;
  solucion: string;
  problema: string;
  beneficios: string;
};

/**
 * Datos que solo existen despues de enviar. Con esto el PDF sirve de
 * comprobante: hoy la pantalla de "idea recibida" le pide al vecino que le
 * saque una foto para no perder el codigo.
 */
export type Comprobante = {
  numero: number;
  codigo: string;
  fecha: string;
};

/** Cual de los tres bloques se esta editando, para marcarlo. */
export type BloqueActivo = "solucion" | "problema" | "beneficios" | null;

/** Los campos del documento que se escriben. El distrito y el punto salen del mapa. */
export type CampoEditable = "titulo" | "barrio" | "solucion" | "problema" | "beneficios";

/**
 * Lo que hace falta para que el documento se pueda escribir encima.
 *
 * Sin esta prop el componente dibuja EXACTAMENTE lo de hoy: texto y nada mas. Asi
 * sigue sirviendo de comprobante puro en la pantalla de "idea recibida", que no
 * tiene nada que editar.
 *
 * `topes` viaja como prop en lugar de duplicar los maximos aca: los define
 * FormularioIdea, que es el que valida.
 */
export type EdicionDocumento = {
  onEscribir: (campo: CampoEditable, valor: string) => void;
  onElegirCategoria: (slug: string) => void;
  onFocoBloque: (bloque: BloqueActivo) => void;
  categorias: ReadonlyArray<{ slug: string; nombre: string }>;
  categoriaSlug: string;
  topes: Record<CampoEditable, number>;
  deshabilitado: boolean;
};

export default function DocumentoIdea({
  datos,
  anio,
  poligono,
  activo = null,
  comprobante = null,
  edicion = null,
}: {
  datos: DatosDocumento;
  anio: number;
  /**
   * Contorno del distrito en coordenadas geograficas, para el mapita. Es el
   * poligono oficial, no una imagen: dibujado como SVG entra en el PDF sin
   * depender de que el navegador imprima un canvas ni de bajar teselas.
   */
  poligono?: number[][] | null;
  activo?: BloqueActivo;
  comprobante?: Comprobante | null;
  edicion?: EdicionDocumento | null;
}) {
  // Un id por instancia: el documento se dibuja DOS veces en el formulario (el
  // panel de al lado y la ventana del telefono), asi que los `aria-labelledby`
  // de los rotulos no pueden ser constantes o quedarian duplicados.
  const id = useId();
  return (
    <article className="documento-idea">
      <header className="doc-cabecera">
        <p className="doc-programa">
          Presupuesto Participativo · Edición {anio} · San Miguel de Tucumán
        </p>
        {edicion ? (
          <h2 className="doc-titulo">
            <CampoDoc
              campo="titulo"
              valor={datos.titulo}
              vacio="Sin título todavía"
              clase="doc-titulo-texto"
              unaLinea
              ariaLabel="Título de la idea"
              edicion={edicion}
            />
          </h2>
        ) : (
          <h2 className={datos.titulo.trim() ? "doc-titulo" : "doc-titulo doc-vacio"}>
            {datos.titulo.trim() || "Sin título todavía"}
          </h2>
        )}

        <dl className="doc-meta">
          {/* El distrito no se edita: sale de donde se toca el mapa. */}
          <Dato etiqueta="Distrito">
            {datos.distrito ? String(datos.distrito) : "sin marcar"}
          </Dato>
          {/*
            El editable va ADENTRO del <dd>, no en lugar del <dd>: el par dt/dd
            es lo que relaciona el rotulo con el dato (1.3.1), y reemplazarlo
            dejaba el "Barrio" sin nada que etiquetar.
          */}
          <Dato etiqueta="Barrio">
            {edicion ? (
              <CampoDoc
                campo="barrio"
                valor={datos.barrio}
                vacio="sin indicar"
                clase="doc-meta-texto"
                unaLinea
                ariaLabel="Barrio"
                edicion={edicion}
              />
            ) : (
              datos.barrio.trim() || "sin indicar"
            )}
          </Dato>
          <Dato etiqueta="Categoría">
            {edicion ? (
              <CategoriaDoc edicion={edicion} nombre={datos.categoria} />
            ) : (
              datos.categoria.trim() || "sin elegir"
            )}
          </Dato>
        </dl>

        {datos.punto && (
          <div className="doc-mapa">
            <MapitaDistrito poligono={poligono} punto={datos.punto} />
            <p>
              Ubicación marcada en el mapa
              <br />
              <span className="doc-coord">
                {datos.punto.lat.toFixed(5)}, {datos.punto.lon.toFixed(5)}
              </span>
            </p>
          </div>
        )}
      </header>

      {/* El orden es el de las preguntas del formulario, no el de las columnas
          de la base: primero que se propone, despues por que hace falta. */}
      <Bloque
        titulo="Qué se propone"
        activo={activo === "solucion"}
        campo="solucion"
        valor={datos.solucion}
        idRotulo={`${id}-solucion`}
        edicion={edicion}
      >
        {datos.solucion.trim() || null}
      </Bloque>
      <Bloque
        titulo="Por qué hace falta"
        activo={activo === "problema"}
        campo="problema"
        valor={datos.problema}
        idRotulo={`${id}-problema`}
        edicion={edicion}
      >
        {datos.problema.trim() || null}
      </Bloque>
      <Bloque
        titulo="Quiénes se benefician"
        activo={activo === "beneficios"}
        vacio="Opcional. Todavía sin completar."
        campo="beneficios"
        valor={datos.beneficios}
        idRotulo={`${id}-beneficios`}
        edicion={edicion}
      >
        {datos.beneficios.trim() || null}
      </Bloque>

      {comprobante ? (
        <footer className="doc-comprobante">
          <div>
            <p className="doc-rotulo">Número de la idea</p>
            <p className="doc-dato-grande">#{comprobante.numero}</p>
          </div>
          <div>
            <p className="doc-rotulo">Código de seguimiento</p>
            <p className="doc-dato-grande doc-codigo">{comprobante.codigo}</p>
          </div>
          <div>
            <p className="doc-rotulo">Presentada</p>
            <p className="doc-dato-grande doc-fecha">{comprobante.fecha}</p>
          </div>
        </footer>
      ) : (
        <footer className="doc-pie">
          Presentada por una vecina o un vecino · El equipo del programa la revisa antes de
          publicarla · Este documento no es una resolución
        </footer>
      )}

      <style>{estilos}</style>
    </article>
  );
}

// ---------------------------------------------------------------------------

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Bloque({
  titulo,
  activo,
  vacio = "Todavía no lo contaste.",
  children,
  campo,
  valor,
  idRotulo,
  edicion,
}: {
  titulo: string;
  activo: boolean;
  vacio?: string;
  children: ReactNode;
  /** Con `campo` y `edicion`, el cuerpo del bloque se escribe en lugar de leerse. */
  campo?: CampoEditable;
  valor?: string;
  idRotulo?: string;
  edicion?: EdicionDocumento | null;
}) {
  return (
    <section className={activo ? "doc-bloque doc-bloque-activo" : "doc-bloque"}>
      <h3 className="doc-rotulo" id={idRotulo}>
        {titulo}
      </h3>
      {edicion && campo ? (
        <CampoDoc
          campo={campo}
          valor={valor ?? ""}
          vacio={vacio}
          clase="doc-cuerpo"
          idRotulo={idRotulo}
          edicion={edicion}
        />
      ) : (
        <p className={children ? "doc-cuerpo" : "doc-cuerpo doc-vacio"}>{children ?? vacio}</p>
      )}
    </section>
  );
}

/**
 * Un pedazo del documento que se escribe encima.
 *
 * COMO FUNCIONA, porque no se adivina leyendo el JSX: son DOS nodos apilados en
 * la misma celda de una grilla de 1x1. Abajo, un <span> con el mismo texto que
 * le da el ALTO a la celda; arriba, un <textarea> transparente que ocupa esa
 * celda entera. La persona ve el span; escribe en el textarea.
 *
 * Por que asi y no un contentEditable, que seria lo obvio: el caret. Un textarea
 * controlado por React no mueve nunca el cursor, porque React solo escribe el
 * DOM cuando el valor del render difiere del que el nodo ya tiene, y cuando la
 * tecla la recibio ese mismo campo ya coinciden. Un contentEditable hay que
 * reescribirlo a mano cada vez que el texto llega de afuera —y acá llega de
 * afuera dos veces: cuando el asistente aplica su propuesta y cuando el mapa
 * completa el barrio—, y cada reescritura manda el cursor al final. Ademas el
 * textarea trae gratis el pegado en texto plano, el deshacer del navegador, el
 * teclado del telefono y los acentos del teclado español.
 *
 * El alto tampoco se mide: lo pone el span en la misma pasada de layout que la
 * tecla. Sin `scrollHeight`, sin `style.height`, sin un frame con el alto viejo.
 *
 * DOS INVARIANTES DE CSS, y las dos rompen el PDF si alguien las cambia:
 *   1. El espejo se esconde SOLO con `visibility: hidden`. La hoja de impresion
 *      destapa con `visibility: visible !important`, asi que con `opacity` o
 *      `clip-path` el papel saldria vacio.
 *   2. El textarea se esconde al imprimir SOLO con `display: none`. Con
 *      `visibility` lo destaparia ese mismo `!important` y el texto saldria dos
 *      veces, uno encima del otro.
 */
function CampoDoc({
  campo,
  valor,
  vacio,
  clase,
  unaLinea = false,
  idRotulo,
  ariaLabel,
  edicion,
}: {
  campo: CampoEditable;
  valor: string;
  vacio: string;
  clase: string;
  unaLinea?: boolean;
  idRotulo?: string;
  ariaLabel?: string;
  edicion: EdicionDocumento;
}) {
  const bloque: BloqueActivo =
    campo === "solucion" || campo === "problema" || campo === "beneficios" ? campo : null;

  return (
    <div className={unaLinea ? "doc-campo doc-campo-corto" : "doc-campo"}>
      {/*
        El espejo lleva el texto REAL (sin trim) y el de ejemplo cuando esta
        vacio, para que la celda tenga alto desde el primer momento. El ​ del
        final es un espacio de ancho cero: sin el, un texto que termina en salto
        de linea deja el ultimo renglon sin medir y el campo se corta.
      */}
      <span className={`doc-espejo ${clase}${valor ? "" : " doc-vacio"}`} aria-hidden="true">
        {valor || vacio}
        {"​"}
      </span>
      <textarea
        className={`doc-campo-entrada ${clase}`}
        value={valor}
        rows={1}
        placeholder={vacio}
        maxLength={edicion.topes[campo]}
        disabled={edicion.deshabilitado}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : idRotulo}
        onChange={(evento) => edicion.onEscribir(campo, evento.target.value)}
        onFocus={() => edicion.onFocoBloque(bloque)}
        onBlur={() => edicion.onFocoBloque(null)}
        /*
          Sin `name`: este documento se dibuja dos veces DENTRO del mismo <form>
          que los campos de la izquierda, asi que un name repetido haria que
          FormData.get() devuelva el primero que encuentre en el DOM y descarte
          en silencio lo que la persona escribio en el otro.
        */
      />
    </div>
  );
}

/**
 * La categoria dentro del documento.
 *
 * Es lo unico que no se escribe: son tres opciones fijas. Va un <select> NATIVO
 * pintado como el texto de al lado, y no un menu propio, porque el nativo trae
 * hecho todo lo que habria que reimplementar: el menu del sistema en la
 * computadora, la rueda en Android, el rotor de VoiceOver, las flechas, Home y
 * End, y escribir la inicial para saltar a una opcion.
 *
 * Trabaja con SLUGS aunque muestre nombres: el formulario guarda el slug, y si
 * de aca saliera el nombre la validacion no encontraria la categoria y el envio
 * fallaria con "Elegí una categoría" sin que se entienda por que.
 *
 * Para el papel no se imprime el <select> —cada navegador dibuja distinto uno
 * con `appearance: none`— sino el <span> de al lado, que vive escondido en
 * pantalla y aparece solo en la hoja.
 */
function CategoriaDoc({
  edicion,
  nombre,
}: {
  edicion: EdicionDocumento;
  nombre: string;
}) {
  return (
    <span className="doc-cat">
      <select
        className={`doc-cat-select${edicion.categoriaSlug ? "" : " doc-vacio"}`}
        value={edicion.categoriaSlug}
        disabled={edicion.deshabilitado}
        aria-label="Categoría"
        onChange={(evento) => edicion.onElegirCategoria(evento.target.value)}
        /* Sin `name`, por lo mismo que el textarea de CampoDoc. */
      >
        <option value="">sin elegir</option>
        {edicion.categorias.map((categoria) => (
          <option key={categoria.slug} value={categoria.slug}>
            {categoria.nombre}
          </option>
        ))}
      </select>
      <span className="doc-cat-papel">{nombre.trim() || "sin elegir"}</span>
    </span>
  );
}

/**
 * El contorno del distrito con el punto encima, en SVG.
 *
 * Sin teselas y sin canvas: el mapa grande del formulario ya muestra la ciudad
 * con calles, y este de aca solo tiene que responder "en que parte del distrito
 * cae". Dibujado asi entra en el PDF, pesa nada y no le pide un byte a
 * OpenStreetMap.
 *
 * Si todavia no llego el poligono se dibuja solo el punto: el dato importante
 * (las coordenadas y el distrito) va en texto al lado, asi que el documento
 * nunca queda sin decir donde es.
 */
function MapitaDistrito({
  poligono,
  punto,
}: {
  poligono?: number[][] | null;
  punto: { lat: number; lon: number };
}) {
  const ANCHO = 132;
  const ALTO = 88;
  const MARGEN = 6;

  if (!poligono || poligono.length < 4) {
    return (
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="doc-mapita" aria-hidden="true">
        <rect width={ANCHO} height={ALTO} rx="4" className="doc-mapita-fondo" />
        <circle cx={ANCHO / 2} cy={ALTO / 2} r="9" className="doc-mapita-halo" />
        <circle cx={ANCHO / 2} cy={ALTO / 2} r="3.4" className="doc-mapita-punto" />
      </svg>
    );
  }

  const lones = poligono.map((p) => p[0]);
  const lats = poligono.map((p) => p[1]);
  const lonMin = Math.min(...lones);
  const lonMax = Math.max(...lones);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);

  // Una escala para los dos ejes, para que el distrito no salga estirado. La
  // latitud crece hacia arriba y la Y del SVG hacia abajo: de ahi la resta.
  const escala = Math.min(
    (ANCHO - MARGEN * 2) / (lonMax - lonMin || 1),
    (ALTO - MARGEN * 2) / (latMax - latMin || 1),
  );
  const desplazarX = (ANCHO - (lonMax - lonMin) * escala) / 2;
  const desplazarY = (ALTO - (latMax - latMin) * escala) / 2;
  const x = (lon: number) => (lon - lonMin) * escala + desplazarX;
  const y = (lat: number) => (latMax - lat) * escala + desplazarY;

  const trazo = poligono
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="doc-mapita" aria-hidden="true">
      <rect width={ANCHO} height={ALTO} rx="4" className="doc-mapita-fondo" />
      <path d={`${trazo} Z`} className="doc-mapita-distrito" />
      <circle cx={x(punto.lon)} cy={y(punto.lat)} r="9" className="doc-mapita-halo" />
      <circle cx={x(punto.lon)} cy={y(punto.lat)} r="3.4" className="doc-mapita-punto" />
    </svg>
  );
}

/**
 * Estilos del documento y, sobre todo, la hoja de impresion.
 *
 * Van adentro del componente igual que en Mapa y HeroInicio: un style suelto es
 * CSS global, asi que las reglas de impresion valen para la pagina entera, y de
 * paso los estilos viajan con el componente en lugar de quedar sueltos en
 * globals.css esperando que alguien recuerde que van juntos.
 *
 * El documento usa la serif del sitio (Noto Serif, ya cargada en el layout) y
 * la interfaz alrededor sigue en Poppins. No es decoracion: la serif dice "esto
 * es lo que estoy produciendo" y la sans dice "esto es la herramienta". Se
 * distinguen sin leer una palabra.
 *
 * Ojo con los backticks: esto es un template literal y un backtick adentro de
 * un comentario CSS lo corta.
 */
const estilos = `
.documento-idea {
  position: relative;
  background: var(--fondo-tarjeta);
  border: 1px solid var(--borde);
  border-radius: 0.75rem;
  padding: 1.5rem 1.5rem 1.75rem;
  font-family: var(--font-serif);
  box-shadow: 0 2px 12px -8px rgba(10, 36, 80, 0.2);
}

.doc-cabecera {
  border-bottom: 2px solid var(--color-marca-900);
  padding-bottom: 0.875rem;
}
.doc-programa {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--marca-texto);
}
.doc-titulo {
  margin: 0.4375rem 0 0;
  font-family: var(--font-serif);
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--marca-texto);
  text-wrap: balance;
}

.doc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 1.25rem;
  margin: 0.75rem 0 0;
  font-family: var(--font-sans);
}
.doc-meta dt {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--texto-suave);
}
.doc-meta dd {
  margin: 0.0625rem 0 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--texto);
}

.doc-mapa {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  align-items: center;
  margin-top: 0.875rem;
  padding: 0.5rem 0.625rem;
  background: var(--fondo-suave);
  border: 1px solid var(--borde);
  border-radius: 0.5rem;
}
.doc-mapa p {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  line-height: 1.5;
  color: var(--texto-suave);
}
.doc-coord {
  font-variant-numeric: tabular-nums;
  color: var(--texto);
  font-weight: 600;
}
.doc-mapita { display: block; width: 8.25rem; height: 5.5rem; }
.doc-mapita-fondo { fill: #eaf0f8; }
.doc-mapita-distrito {
  fill: color-mix(in srgb, var(--color-marca-500) 16%, transparent);
  stroke: var(--color-marca-500);
  stroke-width: 1.4;
}
.doc-mapita-halo { fill: var(--color-marca-700); opacity: 0.18; }
.doc-mapita-punto { fill: var(--color-marca-700); }

.doc-bloque { position: relative; margin-top: 1.25rem; }
.doc-rotulo {
  margin: 0 0 0.3125rem;
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--marca-texto);
}
.doc-cuerpo {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--texto);
  white-space: pre-wrap;
}
.doc-vacio {
  color: color-mix(in srgb, var(--texto-suave) 62%, #fff);
  font-style: italic;
  font-weight: 400;
}

/* ---------------------------------------------------------------------------
 * El documento escrito encima. Ver el comentario de CampoDoc para el mecanismo.
 *
 * Los dos hijos comparten UNA sola regla a proposito: si el espejo y el campo
 * pudieran divergir en tipografia, interlineado o corte de linea, el alto de la
 * celda dejaria de coincidir con el texto y el ultimo renglon quedaria tapado.
 * --------------------------------------------------------------------------- */
.doc-campo {
  display: grid;
  border-bottom: 1px dotted var(--borde-control);
}
.doc-campo > * {
  grid-area: 1 / 1 / 2 / 2;
  /* Un textarea NO hereda la fuente: sin esto sale en la sans del sistema y
     todo el efecto se cae de un vistazo. */
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  color: inherit;
  margin: 0;
  padding: 0;
  border: 0;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  /* globals.css pone text-wrap: pretty en el body y balance en los titulos. El
     span los hereda y el textarea no, asi que cortarian distinto. Se neutralizan
     en pantalla y se devuelven solo al imprimir, sobre el espejo. */
  text-wrap: wrap;
}
.doc-espejo {
  visibility: hidden;
}
.doc-campo-entrada {
  background: none;
  resize: none;
  overflow: hidden;
  width: 100%;
  min-height: 1.7em;
}
.doc-campo-entrada::placeholder {
  color: color-mix(in srgb, var(--texto-suave) 62%, #fff);
  font-style: italic;
  opacity: 1;
}
/* iOS agrisa el texto de un campo deshabilitado. El documento tiene que seguir
   leyendose igual con la edicion cerrada. */
.doc-campo-entrada:disabled {
  color: var(--texto);
  -webkit-text-fill-color: var(--texto);
  opacity: 1;
}
.doc-titulo .doc-campo,
.doc-meta .doc-campo {
  border-bottom-color: color-mix(in srgb, var(--marca-texto) 45%, transparent);
}
.doc-titulo-texto {
  color: var(--marca-texto);
}
.doc-meta-texto {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--marca-texto);
}

.doc-cat {
  display: inline-block;
}
.doc-cat-select {
  appearance: none;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--marca-texto);
  background: none;
  border: 0;
  border-bottom: 1px dotted var(--borde-control);
  padding: 0;
  min-height: 1.5rem;
  max-width: 100%;
}
.doc-cat-select:disabled {
  color: var(--marca-texto);
  -webkit-text-fill-color: var(--marca-texto);
  opacity: 1;
}
/* Solo para el papel: en pantalla manda el <select>. Se esconde con display y
   no con visibility, o el !important de la hoja de impresion lo destaparia. */
.doc-cat-papel {
  display: none;
}

/* El zoom automatico de iOS se dispara abajo de 16px. Va en los DOS hijos, o el
   espejo mediria un alto que el campo no tiene. Nada de maximum-scale=1 en el
   viewport: eso rompe el criterio 1.4.4. */
@media (pointer: coarse) {
  .doc-campo > *,
  .doc-cat-select {
    font-size: 1rem;
  }
}

/* El bloque que se esta editando, marcado con el amarillo del logo. Es la
   pista de que lo que se escribe a la izquierda es esto de aca. */
.doc-bloque-activo::before {
  content: "";
  position: absolute;
  left: -1.5rem;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 999px;
  background: var(--color-sol);
}

.doc-pie {
  margin-top: 1.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--borde);
  font-family: var(--font-sans);
  font-size: 0.6875rem;
  line-height: 1.5;
  color: var(--texto-suave);
}

.doc-comprobante {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  margin-top: 1.5rem;
  padding-top: 0.875rem;
  border-top: 2px solid var(--color-marca-900);
}
.doc-dato-grande {
  margin: 0.125rem 0 0;
  font-family: var(--font-sans);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--marca-texto);
  font-variant-numeric: tabular-nums;
}
.doc-codigo { letter-spacing: 0.1em; }
.doc-fecha { font-size: 0.9375rem; }

/* ------------------------------------------------------------------------- */
/* El PDF                                                                     */
/* ------------------------------------------------------------------------- */

/*
 * No hay libreria de PDF: el navegador ya sabe imprimir HTML y su "Guardar como
 * PDF" produce un PDF de verdad, en computadora y en telefono. Lo que hace la
 * hoja es dejar en la hoja SOLO el documento.
 *
 * Se usa visibility y no display:none porque el documento esta anidado varios
 * niveles adentro de la pagina: con display:none en los ancestros desaparece el
 * documento tambien, mientras que visibility se hereda y se puede volver a
 * prender en el nodo que interesa.
 */
@media print {
  @page { margin: 16mm; }

  /*
   * El papel es siempre blanco, asi que el documento se imprime con la paleta
   * clara aunque quien imprime tenga el sistema en oscuro. Sin esto, desde un
   * equipo en tema oscuro salia texto claro sobre papel blanco: ilegible y con
   * el cartucho gastado al reves.
   */
  :root {
    --fondo: #ffffff;
    --fondo-suave: #f5f8fc;
    --fondo-tarjeta: #ffffff;
    --borde: #e2e8f0;
    --texto: #16202e;
    --texto-suave: #55627a;
    --marca-texto: #084fc4;
    --acento-texto: #92400e;
    --color-cat-ambiental: #2f9e5f;
    --color-cat-deportivo: #d2621f;
    --color-cat-urbana: #7141a8;
  }

  body { background: #fff; }
  body * { visibility: hidden !important; }
  .documento-idea,
  .documento-idea * { visibility: visible !important; }

  .documento-idea {
    position: absolute !important;
    inset: 0 auto auto 0;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    /* Que el papel conserve la regla del encabezado y los rotulos azules. */
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  /* La marca del bloque en edicion es una ayuda de la pantalla, no del papel. */
  .doc-bloque-activo::before { display: none !important; }

  /*
   * El papel lleva el espejo, que es el span con el texto; lo que se esconde es
   * lo que sirve para escribir. Con display:none y no con visibility: el
   * "visibility: visible !important" de arriba destaparia el campo y el texto
   * saldria dos veces, uno encima del otro.
   */
  .doc-campo-entrada, .doc-cat-select { display: none !important; }
  .doc-campo { border-bottom: 0 !important; }
  .doc-cat-papel { display: inline !important; }

  /* El corte de linea que se neutralizo en pantalla vuelve para el papel, asi
     la hoja sale igual que antes de que el documento fuera editable. */
  .doc-espejo.doc-titulo-texto { text-wrap: balance; }
  .doc-espejo.doc-cuerpo { text-wrap: pretty; }

  /* Un bloque no se parte entre dos hojas. */
  .doc-bloque, .doc-comprobante { break-inside: avoid; }
}
`;
