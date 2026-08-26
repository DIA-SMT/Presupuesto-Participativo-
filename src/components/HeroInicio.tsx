import Image from "next/image";
import Link from "next/link";
import heroImagen from "../../public/images/presupuesto-participativo/hero-mapa-distritos.png";

/**
 * Portada de la home.
 *
 * Ocupa el ancho completo de la pagina y el texto se apoya ENCIMA del dibujo,
 * en el vacio que la propia imagen deja a la izquierda. Tres medidas del PNG
 * (`node scripts/analizar-imagen.mjs`) explican toda la maqueta:
 *
 * 1. **El vacio llega hasta el 39,2% del ancho.** Medido pixel por pixel: en esa
 *    franja el gris del cuerpo da 4,75:1 y el azul del titulo 8,41:1, o sea que
 *    el texto pasa AA apoyado directamente sobre la imagen. Por eso no hay
 *    ningun velo ni caja opaca detras: taparian el dibujo sin hacer falta.
 *
 * 2. **El dibujo va del 12,3% al 95,2% del alto.** Queda casi sin aire abajo,
 *    asi que la imagen no se puede recortar en vertical: `cover` en una pantalla
 *    de 1920 se comeria el 44% del alto y cortaria el mapa y a Migue. La imagen
 *    se ancla a la derecha con su proporcion intacta y su alto lo fija la banda.
 *
 * 3. **El borde izquierdo del PNG es un degrade vertical** de #f0f3f9 a #e2e8f1.
 *    El fondo de la seccion es ese mismo degrade, asi que a la izquierda de la
 *    imagen el color coincide a cualquier altura y la union no se ve: es lo que
 *    hace que se lea como una pieza sola y no como una foto pegada.
 *
 * El ancho del dibujo esta topeado en 84vw (ver `.hero-lienzo`), de modo que su
 * parte dibujada nunca empieza antes del 49% de la pantalla. El texto esta
 * topeado en 42vw y arranca dentro del contenedor, asi que nunca pasa del 44%.
 * Los dos limites no se tocan en ningun ancho: la separacion esta garantizada
 * por construccion, no por tanteo. Medida en el navegador, va de 63 px en la
 * pantalla mas apretada (1200) a 248 px en una de 1920.
 *
 * Es un componente de servidor: la animacion de entrada es CSS y no necesita
 * JavaScript. El mismo patron que usa el mapa para sus estilos propios.
 */

/** Los tres indicadores describen el programa; no son estadisticas. */
const INDICADORES = [
  "Propuestas por distrito",
  "Votación ciudadana",
  "Proyectos para la comunidad",
];

export default function HeroInicio() {
  return (
    <section aria-labelledby="hero-titulo" className="hero">
      {/*
        El texto va primero en el HTML aunque en pantalla quede encima del
        dibujo: asi un lector de pantalla escucha el titulo antes que la
        descripcion de la imagen, y en el celular las dos cosas se apilan en
        el orden correcto sin tener que reordenarlas con CSS.
      */}
      <div className="contenedor hero-contenido">
        <div className="hero-texto">
          <p className="hero-volanta">Presupuesto Participativo</p>

          <h1 id="hero-titulo" className="hero-titulo">
            Tu idea puede <span className="hero-resalte">transformar</span> tu distrito
          </h1>

          <p className="hero-bajada">
            Proponé proyectos para tu comunidad, conocé las iniciativas de otros vecinos y votá las
            que querés ver realizadas.
          </p>

          <div className="hero-acciones">
            <Link href="/ideas/nueva" className="hero-boton hero-boton-principal">
              Presentar un proyecto
            </Link>
            <Link href="/proyectos" className="hero-boton hero-boton-secundario">
              Ver proyectos y votar
            </Link>
          </div>

          {/* Los puntitos amarillos son el unico acento de color del bloque, y
              son los mismos marcadores que la imagen apoya sobre el mapa. */}
          <ul className="hero-indicadores">
            {INDICADORES.map((indicador) => (
              <li key={indicador}>
                <span aria-hidden="true" className="hero-punto" />
                {indicador}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="hero-lienzo">
        <Image
          src={heroImagen}
          alt="Migue señalando el mapa en relieve de San Miguel de Tucumán con sus 20 distritos numerados"
          priority
          placeholder="blur"
          sizes="(min-width: 75rem) 84vw, 100vw"
          className="hero-imagen"
        />
      </div>

      <style>{estilos}</style>
    </section>
  );
}

/**
 * Los estilos van en la seccion y no en clases de Tailwind porque casi todos
 * dependen de medidas de la imagen (84vw, 42vw, el degrade del borde izquierdo)
 * que no existen como utilidades y que solo se entienden con el comentario al
 * lado. La animacion corre una sola vez al cargar y nada se mueve despues.
 */
const estilos = `
.hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  /*
    El mismo degrade que tiene el PNG en su columna izquierda. Los seis topes
    NO son un degrade inventado: son el color real del borde izquierdo de la
    imagen medido a esas seis alturas en el navegador. No es una recta porque
    a media altura las ondas decoradas del dibujo cruzan el borde y lo tiran
    para el azul; con tres topes la union se notaba 8 niveles, con estos seis
    queda en 2 y desaparece.
  */
  background: linear-gradient(
    to bottom,
    #eff1f7 0%,
    #e7eefe 20%,
    #e3edf9 40%,
    #eaf0f7 60%,
    #e8edf4 80%,
    #e2e7f1 100%
  );
}

/*
  El z-index es obligatorio, no decorativo: el lienzo va DESPUES en el HTML y
  tambien esta posicionado, asi que sin esto gana el orden del documento y la
  imagen se dibuja ENCIMA del texto, tapandolo de la mitad para la derecha.
*/
.hero-contenido { position: relative; z-index: 1; width: 100%; padding-block: 3rem 3.5rem; }
.hero-texto { max-width: 34rem; }

.hero-lienzo { line-height: 0; }
.hero-imagen { width: 100%; height: auto; }

@media (min-width: 75rem) {
  .hero {
    display: flex;
    align-items: center;
    /*
      44vw NO es un numero de gusto. El dibujo mide 84vw de ancho (ver
      .hero-lienzo), o sea 47vw de alto con su proporcion. Manteniendo la
      banda por DEBAJO de esos 47vw, la imagen siempre queda limitada por el
      alto y lo llena entero. Si la banda fuera mas alta, contain la
      limitaria por el ancho y dejaria dos franjas de fondo arriba y abajo: el
      borde de arriba de la imagen es un degrade horizontal y el fondo de la
      seccion es vertical, asi que ese empalme no se puede disimular y
      aparecia una linea cruzando la banda a lo ancho.
    */
    min-height: clamp(31rem, 44vw, 44rem);
  }
  .hero-contenido { padding-block: 3.25rem; }
  /* 42vw: el texto no llega nunca al 49% donde puede empezar el dibujo. */
  .hero-texto { max-width: min(34rem, 42vw); }

  .hero-lienzo {
    position: absolute;
    inset-block: 0;
    right: 0;
    /* Tope de ancho del dibujo: con 84vw su parte dibujada nunca empieza antes
       del 49% de la pantalla. Sin el tope, una banda mas alta de lo previsto
       agranda la imagen y la corre hacia la izquierda hasta pisar el texto. */
    width: 84vw;
  }
  /* contain + right center: el dibujo se pega a la derecha y NUNCA se recorta.
     Con el min-height de arriba la imagen queda siempre limitada por el alto,
     asi que llena la banda entera y contain no llega a dejar franjas. */
  .hero-imagen {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: right center;
  }
}

@media (max-width: 74.999rem) {
  /*
    Apilado: primero el texto, abajo la imagen entera. El degrade pasa a ser
    horizontal porque aca lo que se empalma es el borde de ARRIBA de la imagen,
    que va de claro a la izquierda a oscuro a la derecha; con un degrade
    vertical se veia un escalon del lado derecho.

    El tope oscuro es #dde5f0 y no el #d0dbea real del PNG a proposito: sobre
    #d0dbea el gris del cuerpo da 4,31:1 y no pasa AA, y en el celular el texto
    SI llega hasta ese borde. Con #dde5f0 da 4,84:1, al precio de quedar 13
    niveles mas claro que la imagen. Ese desnivel lo tapa el puente de abajo.
  */
  .hero { background: linear-gradient(to right, #f2f5fa 0%, #dde5f0 100%); }

  .hero-lienzo { position: relative; }
  /*
    El puente. Repite el fondo de la seccion sobre la primera franja de la
    imagen y lo desvanece con una mascara: arriba del todo el color es
    exactamente el de la seccion, y para cuando termina ya es el de la imagen.
    Los 13 niveles de diferencia quedan repartidos en esos pixeles y el corte
    deja de verse. Va sobre el 9% de arriba, y como el dibujo recien empieza
    en el 12,3% del alto, el desvanecido cae entero sobre cielo vacio: no
    toca ni el mapa ni a Migue. Si el navegador no soporta mascaras se ve una
    franja del color del fondo, que es lo mismo que hay hoy sin el puente.
  */
  .hero-lienzo::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 9%;
    background: linear-gradient(to right, #f2f5fa 0%, #dde5f0 100%);
    -webkit-mask-image: linear-gradient(to bottom, #000, transparent);
    mask-image: linear-gradient(to bottom, #000, transparent);
    pointer-events: none;
  }
}

.hero-volanta {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--color-marca-700);
}

.hero-titulo {
  margin-top: 1rem;
  font-size: clamp(2.25rem, 3.9vw, 3.5rem);
  font-weight: 700;
  line-height: 1.06;
  letter-spacing: -0.02em;
  color: var(--color-marca-900);
}

/* Subrayado amarillo en una sola palabra: es el mismo amarillo de los
   marcadores del mapa, y ata el texto con el dibujo sin agregarle color al
   resto del bloque. Va detras de las letras, no encima. */
.hero-resalte { position: relative; z-index: 0; white-space: nowrap; }
.hero-resalte::after {
  content: "";
  position: absolute;
  z-index: -1;
  left: -0.05em;
  right: -0.05em;
  bottom: 0.04em;
  height: 0.14em;
  border-radius: 999px;
  background: var(--color-sol);
}

.hero-bajada {
  margin-top: 1.25rem;
  font-size: 1.0625rem;
  line-height: 1.65;
  color: var(--texto-suave);
}

.hero-acciones { margin-top: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem; }

.hero-boton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  padding: 0.8125rem 1.375rem;
  font-size: 0.9375rem;
  font-weight: 600;
  transition: background-color 150ms ease, box-shadow 150ms ease, transform 120ms ease;
}
.hero-boton:active { transform: translateY(1px); }

.hero-boton-principal {
  background: var(--color-marca-700);
  color: #fff;
  box-shadow: 0 1px 2px rgba(11, 66, 156, 0.2), 0 10px 22px -10px rgba(11, 66, 156, 0.55);
}
.hero-boton-principal:hover {
  background: var(--color-marca-800);
  box-shadow: 0 1px 2px rgba(11, 66, 156, 0.24), 0 14px 26px -10px rgba(11, 66, 156, 0.6);
}

.hero-boton-secundario {
  background: var(--fondo-tarjeta);
  color: var(--color-marca-700);
  border: 1px solid var(--borde-control);
}
.hero-boton-secundario:hover { background: var(--color-marca-50); }

.hero-indicadores {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}
.hero-indicadores li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--texto-suave);
}
.hero-punto {
  display: inline-block;
  width: 0.375rem;
  height: 0.375rem;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--color-sol);
}

/* --- Entrada ------------------------------------------------------------- */

.hero-texto > *,
.hero-lienzo {
  animation: hero-sube 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.hero-texto > *:nth-child(2) { animation-delay: 70ms; }
.hero-texto > *:nth-child(3) { animation-delay: 140ms; }
.hero-texto > *:nth-child(4) { animation-delay: 210ms; }
.hero-texto > *:nth-child(5) { animation-delay: 280ms; }
.hero-lienzo { animation-name: hero-entra; animation-delay: 100ms; }

@keyframes hero-sube {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
@keyframes hero-entra {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .hero-texto > *,
  .hero-lienzo { animation: none; }
  .hero-boton { transition: none; }
  .hero-boton:active { transform: none; }
}
`;
