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
import type { ReactNode } from "react";

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

export default function DocumentoIdea({
  datos,
  anio,
  poligono,
  activo = null,
  comprobante = null,
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
}) {
  return (
    <article className="documento-idea">
      <header className="doc-cabecera">
        <p className="doc-programa">
          Presupuesto Participativo · Edición {anio} · San Miguel de Tucumán
        </p>
        <h2 className={datos.titulo.trim() ? "doc-titulo" : "doc-titulo doc-vacio"}>
          {datos.titulo.trim() || "Sin título todavía"}
        </h2>

        <dl className="doc-meta">
          <Dato etiqueta="Distrito">
            {datos.distrito ? String(datos.distrito) : "sin marcar"}
          </Dato>
          <Dato etiqueta="Barrio">{datos.barrio.trim() || "sin indicar"}</Dato>
          <Dato etiqueta="Categoría">{datos.categoria.trim() || "sin elegir"}</Dato>
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
      <Bloque titulo="Qué se propone" activo={activo === "solucion"}>
        {datos.solucion.trim() || null}
      </Bloque>
      <Bloque titulo="Por qué hace falta" activo={activo === "problema"}>
        {datos.problema.trim() || null}
      </Bloque>
      <Bloque
        titulo="Quiénes se benefician"
        activo={activo === "beneficios"}
        vacio="Opcional. Todavía sin completar."
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
}: {
  titulo: string;
  activo: boolean;
  vacio?: string;
  children: ReactNode;
}) {
  return (
    <section className={activo ? "doc-bloque doc-bloque-activo" : "doc-bloque"}>
      <h3 className="doc-rotulo">{titulo}</h3>
      <p className={children ? "doc-cuerpo" : "doc-cuerpo doc-vacio"}>{children ?? vacio}</p>
    </section>
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
  color: var(--color-marca-700);
}
.doc-titulo {
  margin: 0.4375rem 0 0;
  font-family: var(--font-serif);
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--color-marca-950);
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
  color: var(--color-marca-700);
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
  color: var(--color-marca-900);
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

  /* Un bloque no se parte entre dos hojas. */
  .doc-bloque, .doc-comprobante { break-inside: avoid; }
}
`;
