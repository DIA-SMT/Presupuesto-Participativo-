/**
 * Identidad visual.
 *
 * `LogoFlor` es el isotipo municipal (dos hojas y el sol) y `SelloDireccionIA`
 * el bloque de autoria de la Direccion de IA que cierra todas las paginas.
 *
 * Los dos salen de los archivos OFICIALES de `public/marca/`, entregados por el
 * municipio. Antes eran un SVG redibujado a ojo, y estaba mal en la forma (las
 * hojas eran medialunas y el sol quedaba corrido a la derecha) y en los tres
 * colores. Habia ademas tres copias divergentes del dibujo: este archivo,
 * `src/app/icon.svg` y una marca de agua inline en `src/app/page.tsx`.
 *
 * Pendiente: el municipio tiene el logo en vector (SVG o AI) en su manual de
 * marca. Cuando llegue se cambia el `<Image>` por el SVG y se gana nitidez a
 * cualquier tamano; el resto del codigo no se toca. Mientras tanto el PNG
 * oficial es fiel, y a 30-40 px se ve nitido incluso en pantallas retina: la
 * fuente son 235 px de lado.
 */
import Image from "next/image";
import isotipo from "../../public/marca/logo-muni-iso.png";
import selloIA from "../../public/marca/logo-ia.png";

export function LogoFlor({
  tamano = 40,
  titulo,
}: {
  tamano?: number;
  titulo?: string;
}) {
  return (
    <Image
      src={isotipo}
      alt={titulo ?? ""}
      width={tamano}
      height={tamano}
      // El isotipo es chico y aparece en el encabezado de todas las paginas:
      // conviene que no espere al lazy load.
      priority
      aria-hidden={titulo ? undefined : true}
      style={{ width: tamano, height: tamano }}
    />
  );
}

/**
 * El isotipo como marca de agua de la portada: la misma forma oficial, pasada
 * a silueta blanca con un filtro CSS (`brightness(0) invert(1)` deja todo el
 * pixel opaco en blanco y respeta la transparencia). Se usa asi, y no en
 * color, porque va sobre el degrade azul oscuro de la portada, donde los
 * azules del logo desaparecerian.
 */
export function MarcaDeAguaFlor({ className }: { className?: string }) {
  return (
    <Image
      src={isotipo}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ filter: "brightness(0) invert(1)" }}
    />
  );
}

/**
 * Sello de autoria: se muestra al pie de todas las paginas. Es el lockup
 * oficial completo (isotipo mas "Direccion de IA"), asi que no hace falta
 * componer el texto a mano como antes.
 */
export function SelloDireccionIA() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <a
        href="https://smt.gob.ar"
        rel="noreferrer"
        className="inline-flex items-center"
        aria-label="Dirección de Inteligencia Artificial, Municipalidad de San Miguel de Tucumán"
      >
        <Image
          src={selloIA}
          alt="Dirección de Inteligencia Artificial"
          width={166}
          height={69}
          className="h-[3.25rem] w-auto"
        />
      </a>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Sitio desarrollado por la Dirección de Inteligencia Artificial
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Municipalidad de San Miguel de Tucumán</span>
      </p>
    </div>
  );
}
