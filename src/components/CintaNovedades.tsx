/**
 * La cinta de novedades de la portada: tarjetas que pasan solas, de derecha a
 * izquierda, como un cajon que corre.
 *
 * Es CSS puro, sin JavaScript: la fila de tarjetas va dos veces seguidas y la
 * animacion la corre la mitad de su largo, asi que cuando termina la primera
 * vuelta la segunda copia esta exactamente donde empezo la primera y el salto
 * no se ve. La copia va con aria-hidden y sus enlaces fuera del orden del
 * teclado: un lector de pantalla y el Tab recorren cada tarjeta una sola vez.
 *
 * Se frena con el mouse encima o con el foco adentro, para poder leer y tocar
 * el enlace. Con "reducir movimiento" en el sistema no corre: queda una fila
 * que se desplaza a mano, sin la copia.
 */
import Link from "next/link";
import { formatearFecha } from "@/lib/formato";

export type ItemNovedad = {
  clave: string;
  fecha: string;
  /** La etiqueta de arriba: la etapa de la obra, o "Novedad". */
  etiqueta: string;
  /** El color de la etiqueta (un token). */
  tono: string;
  titulo: string;
  /** Distrito N, si la tiene. */
  distrito: number | null;
  texto: string | null;
  /** La ficha del proyecto, dentro del sitio. */
  href: string | null;
  /** La nota de prensa, afuera. */
  enlace: string | null;
};

/** Segundos que tarda cada tarjeta en pasar: lo bastante lento para leerla. */
const SEGUNDOS_POR_TARJETA = 9;

export default function CintaNovedades({ items }: { items: ItemNovedad[] }) {
  return (
    <div
      className="cinta-novedades"
      style={{ ["--duracion" as string]: `${items.length * SEGUNDOS_POR_TARJETA}s` }}
    >
      <div className="cinta-pista">
        <Fila items={items} />
        <Fila items={items} copia />
      </div>
      <style>{estilosCinta}</style>
    </div>
  );
}

function Fila({ items, copia = false }: { items: ItemNovedad[]; copia?: boolean }) {
  const fueraDelTab = copia ? -1 : undefined;
  return (
    <ul className="cinta-fila" aria-hidden={copia || undefined} data-copia={copia || undefined}>
      {items.map((item) => (
        <li key={item.clave} className="cinta-tarjeta superficie">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="etiqueta-obra"
              style={{ ["--tono" as string]: item.tono }}
            >
              {item.etiqueta}
            </span>
            <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
              {formatearFecha(item.fecha)}
              {item.distrito !== null && ` · Distrito ${item.distrito}`}
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold leading-snug">
            {item.href ? (
              <Link href={item.href} className="hover:underline" tabIndex={fueraDelTab}>
                {item.titulo}
              </Link>
            ) : (
              item.titulo
            )}
          </h3>
          {item.texto && (
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              {item.texto}
            </p>
          )}
          {item.enlace && (
            <a
              href={item.enlace}
              target="_blank"
              rel="noreferrer"
              tabIndex={fueraDelTab}
              className="mt-auto pt-3 text-sm font-semibold underline"
              style={{ color: "var(--marca-texto)" }}
            >
              Leer la nota
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

const estilosCinta = `
.cinta-novedades {
  overflow: hidden;
  /* Las puntas se desvanecen: se ve que la fila sigue. */
  mask-image: linear-gradient(to right, transparent, #000 4%, #000 96%, transparent);
}
.cinta-pista {
  display: flex;
  width: max-content;
  animation: cinta-correr var(--duracion, 60s) linear infinite;
}
.cinta-novedades:hover .cinta-pista,
.cinta-novedades:focus-within .cinta-pista {
  animation-play-state: paused;
}
.cinta-fila {
  display: flex;
  gap: 1.25rem;
  padding: 0.25rem 1.25rem 0.25rem 0;
  margin: 0;
  list-style: none;
}
.cinta-tarjeta {
  display: flex;
  flex-direction: column;
  width: min(20rem, 78vw);
  flex: none;
  border-radius: 1rem;
  padding: 1.25rem;
}
@keyframes cinta-correr {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .cinta-novedades { overflow-x: auto; mask-image: none; }
  .cinta-pista { animation: none; }
  .cinta-fila[data-copia] { display: none; }
}
`;
