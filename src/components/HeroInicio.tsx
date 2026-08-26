import Image from "next/image";
import Link from "next/link";
import heroImagen from "../../public/images/presupuesto-participativo/hero-02-distritos-y-proyectos.png";

/**
 * Portada de la home.
 *
 * Dos decisiones que explican como esta armado:
 *
 * 1. **El fondo empalma con el de la imagen.** El PNG no es transparente ni
 *    blanco: trae su propio degrade azul grisaceo (muestreado, va de #dde7fc
 *    arriba a la izquierda a #eeeff4 a la derecha, y la zona vacia donde apoya
 *    el texto es #ebeef4). Si la seccion fuera blanca o del gris del sitio
 *    (#f5f8fc) se veria el rectangulo de la imagen recortado sobre el fondo.
 *    Por eso el degrade de la seccion termina en #e9edf6, a dos puntos del
 *    color propio de la imagen: la union no se ve.
 *
 * 2. **La imagen ya trae su propio aire.** Casi la mitad izquierda del PNG esta
 *    vacia, asi que no hace falta separar las columnas con margenes grandes: ese
 *    vacio es el que deja respirar al texto.
 *
 * Es un componente de servidor: la animacion de entrada es CSS y no necesita
 * JavaScript. El mismo patron que usa el mapa para sus estilos propios.
 */

/** Los tres indicadores de abajo describen el programa; no son estadisticas. */
const INDICADORES = [
  "Propuestas por distrito",
  "Votación ciudadana",
  "Proyectos para la comunidad",
];

export default function HeroInicio() {
  return (
    <section
      aria-labelledby="hero-titulo"
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(100deg, #fbfcfe 0%, #f4f7fb 46%, #e9edf6 100%)",
      }}
    >
      <div className="contenedor grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-4 lg:py-20">
        {/* --- Texto ------------------------------------------------------- */}
        <div className="hero-entrada-texto max-w-xl">
          <p
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: "var(--color-marca-700)" }}
          >
            Presupuesto Participativo
          </p>

          <h1
            id="hero-titulo"
            className="mt-4 text-4xl font-bold leading-[1.08] sm:text-5xl"
            style={{ color: "var(--color-marca-900)" }}
          >
            Tu idea puede transformar tu distrito
          </h1>

          <p
            className="mt-5 text-base leading-relaxed sm:text-lg"
            style={{ color: "var(--texto-suave)" }}
          >
            Proponé proyectos para tu comunidad, conocé las iniciativas de otros vecinos y votá las
            que querés ver realizadas.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/ideas/nueva" className="hero-boton hero-boton-principal">
              Presentar un proyecto
            </Link>
            <Link href="/proyectos" className="hero-boton hero-boton-secundario">
              Ver proyectos y votar
            </Link>
          </div>

          {/* Los puntitos amarillos son el unico acento de color del bloque, y
              son los mismos marcadores que la imagen apoya sobre los distritos. */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {INDICADORES.map((indicador) => (
              <li
                key={indicador}
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--texto-suave)" }}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--color-sol)" }}
                />
                {indicador}
              </li>
            ))}
          </ul>
        </div>

        {/* --- Imagen ------------------------------------------------------ */}
        <div className="hero-entrada-imagen">
          <Image
            src={heroImagen}
            alt="Migue recorriendo distritos y conociendo proyectos del Presupuesto Participativo"
            priority
            placeholder="blur"
            sizes="(min-width: 1024px) 52vw, 100vw"
            className="h-auto w-full"
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>

      <style>{estilos}</style>
    </section>
  );
}

/**
 * Entrada y botones.
 *
 * La animacion corre una sola vez al cargar y nada se mueve despues. Con
 * `prefers-reduced-motion` los elementos aparecen quietos y visibles: la regla
 * anula el desplazamiento, no el contenido.
 */
const estilos = `
.hero-entrada-texto,
.hero-entrada-imagen {
  animation-duration: 700ms;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;
}
.hero-entrada-texto { animation-name: hero-sube; }
.hero-entrada-imagen { animation-name: hero-entra; animation-delay: 120ms; }

@keyframes hero-sube {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: none; }
}
@keyframes hero-entra {
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: none; }
}

.hero-boton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  padding: 0.8125rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 600;
  transition: background-color 150ms ease, border-color 150ms ease, transform 100ms ease;
}
.hero-boton:active { transform: translateY(1px); }

.hero-boton-principal {
  background: var(--color-marca-700);
  color: #fff;
}
.hero-boton-principal:hover { background: var(--color-marca-800); }

.hero-boton-secundario {
  background: var(--fondo-tarjeta);
  color: var(--color-marca-700);
  border: 1px solid var(--borde-control);
}
.hero-boton-secundario:hover { background: var(--color-marca-50); }

@media (prefers-reduced-motion: reduce) {
  .hero-entrada-texto,
  .hero-entrada-imagen {
    animation: none;
  }
  .hero-boton { transition: none; }
  .hero-boton:active { transform: none; }
}
`;
