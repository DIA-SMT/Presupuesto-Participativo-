import Link from "next/link";
import type { ReactNode } from "react";
import type { IdeaVista } from "@/db/queries";
import { conEdicion } from "@/lib/ediciones";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  colorCategoria,
  formatearNumero,
  recortar,
} from "@/lib/formato";

export function Chip({
  children,
  color,
  suave = true,
}: {
  children: ReactNode;
  color?: string;
  suave?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={
        suave
          ? {
              background: color ? `color-mix(in srgb, ${color} 14%, transparent)` : "var(--fondo-suave)",
              color: color ?? "var(--texto-suave)",
              border: `1px solid ${color ? `color-mix(in srgb, ${color} 35%, transparent)` : "var(--borde)"}`,
            }
          : { background: color ?? "var(--color-marca-700)", color: "#fff" }
      }
    >
      {children}
    </span>
  );
}

export function ChipEstado({ estado }: { estado: string }) {
  return (
    <Chip color={COLOR_ESTADO[estado]}>
      {estado === "ganador" && <span aria-hidden="true">★</span>}
      {ETIQUETA_ESTADO[estado] ?? estado}
    </Chip>
  );
}

export function Boton({
  href,
  children,
  variante = "principal",
}: {
  href: string;
  children: ReactNode;
  variante?: "principal" | "secundario";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition";
  if (variante === "principal") {
    return (
      <Link
        href={href}
        className={`${base} text-white hover:brightness-110`}
        style={{ background: "var(--color-marca-700)" }}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`${base} hover:brightness-95`}
      style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
    >
      {children}
    </Link>
  );
}

export function Seccion({
  titulo,
  bajada,
  children,
  accion,
  id,
}: {
  titulo: string;
  bajada?: string;
  children: ReactNode;
  accion?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="py-12 sm:py-16">
      <div className="contenedor">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold sm:text-3xl">{titulo}</h2>
            {bajada && (
              <p className="mt-2 text-base" style={{ color: "var(--texto-suave)" }}>
                {bajada}
              </p>
            )}
          </div>
          {accion}
        </div>
        {children}
      </div>
    </section>
  );
}

export function Dato({
  valor,
  etiqueta,
  detalle,
}: {
  valor: string;
  etiqueta: string;
  detalle?: string;
}) {
  return (
    <div className="superficie rounded-2xl p-5">
      <p className="text-3xl font-bold tracking-tight sm:text-4xl">{valor}</p>
      <p className="mt-1 text-sm font-medium">{etiqueta}</p>
      {detalle && (
        <p className="mt-1 text-xs" style={{ color: "var(--texto-suave)" }}>
          {detalle}
        </p>
      )}
    </div>
  );
}

export function TarjetaProyecto({
  idea,
  edicionEnEnlaces = null,
}: {
  idea: IdeaVista;
  /**
   * El año que lleva el enlace a la ficha mientras se recorre una edicion que
   * no es la activa (ver `conEdicion`). Sin el, el clic en una tarjeta de 2025
   * abria la ficha buscando el slug primero en la activa.
   */
  edicionEnEnlaces?: number | null;
}) {
  const resumen = idea.problema ?? idea.solucion ?? idea.beneficios;
  const colorDeCategoria = colorCategoria(idea.categoriaSlug, idea.categoriaColor);
  return (
    <article
      className="superficie flex h-full flex-col rounded-2xl p-5 transition hover:shadow-lg"
      style={{
        borderLeft: `4px solid ${colorDeCategoria ?? "var(--borde)"}`,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip>Distrito {idea.distrito}</Chip>
        <ChipEstado estado={idea.estado} />
        {idea.ganador && idea.votos > 0 && (
          <Chip color="var(--ganador-texto)">
            {formatearNumero(idea.votos)} votos
          </Chip>
        )}
      </div>

      <h3 className="text-lg font-semibold leading-snug">
        <Link href={conEdicion(`/proyectos/${idea.slug}`, edicionEnEnlaces)} className="hover:underline">
          {idea.titulo}
        </Link>
      </h3>

      {idea.barrio && (
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          B° {idea.barrio}
        </p>
      )}

      {resumen && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {recortar(resumen, 180)}
        </p>
      )}

      <div
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs"
        style={{ borderTop: "1px solid var(--borde)", color: "var(--texto-suave)" }}
      >
        {/*
          Al pie iba tambien "· Obra en preparación", en TODA tarjeta de un
          proyecto ganador: la portada, /proyectos, cada distrito y las
          relacionadas. Ese estado no lo informaba nadie, lo ponia el ETL por
          defecto (ver scripts/etl.ts). Con el dato corregido la frase quedaba
          "Obra sin presupuesto asignado", que ya no es falsa pero mezcla la obra
          con la plata y no le sirve a nadie en una tarjeta. La etapa de una obra
          se ve en su ficha, y solo cuando el municipio informo un avance.
        */}
        {idea.categoriaNombre && <span>{idea.categoriaNombre}</span>}
      </div>
    </article>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center text-sm"
      style={{
        background: "color-mix(in srgb, var(--marca-texto) 5%, var(--fondo-suave))",
        border: "1px dashed color-mix(in srgb, var(--marca-texto) 30%, var(--borde))",
        color: "var(--texto-suave)",
      }}
    >
      <span
        className="grid h-10 w-10 place-items-center rounded-full"
        style={{
          color: "var(--marca-texto)",
          background: "color-mix(in srgb, var(--marca-texto) 12%, transparent)",
        }}
      >
        <IconoCartel icono="vacio" />
      </span>
      <div>{children}</div>
    </div>
  );
}

export type TonoCartel = "info" | "consejo" | "atencion" | "destacado";
export type NombreIcono =
  | "info"
  | "consejo"
  | "atencion"
  | "destacado"
  | "candado"
  | "telefono"
  | "documento"
  | "llave"
  | "voto"
  | "lapiz"
  | "vacio";

/** El icono por defecto de cada tono. */
const ICONO_DEL_TONO: Record<TonoCartel, NombreIcono> = {
  info: "info",
  consejo: "consejo",
  atencion: "atencion",
  destacado: "destacado",
};

/**
 * Los iconos de los carteles: trazos simples de 24x24 que toman el color del
 * texto. Decorativos: lo que dice el cartel ya lo dice su texto.
 */
export function IconoCartel({ icono }: { icono: NombreIcono }) {
  const trazos: Record<NombreIcono, ReactNode> = {
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.5v.5" />
      </>
    ),
    consejo: (
      <>
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" />
      </>
    ),
    atencion: (
      <>
        <path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9.5v4M12 16.5v.5" />
      </>
    ),
    destacado: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
    candado: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    telefono: (
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
    ),
    documento: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </>
    ),
    llave: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m11 12 9-9M17 6l3 3M14 9l2 2" />
      </>
    ),
    voto: (
      <>
        <path d="M4 13h16v7H4z" />
        <path d="m8 9 3 3 5-6" />
      </>
    ),
    lapiz: (
      <>
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    vacio: (
      <>
        <path d="M3 13h5l1.5 3h5L16 13h5" />
        <path d="M5.5 6h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6l2.5-7Z" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {trazos[icono]}
    </svg>
  );
}

/**
 * Un cartel de informacion: una caja tenida del color de lo que dice, con un
 * icono y, si lo tiene, un titulo. Los tonos:
 *  - info: como funciona algo, donde encontrar un dato.
 *  - consejo: lo que conviene hacer (anotar el codigo, revisar los datos).
 *  - atencion: algo que no se puede hacer todavia, o que salio mal.
 *  - destacado: lo que se quiere que se vea primero (un llamado a participar).
 * El estilo vive en globals.css (`.cartel`).
 */
export function Cartel({
  tono = "info",
  icono,
  titulo,
  nivelTitulo = "h2",
  children,
  className = "",
}: {
  tono?: TonoCartel;
  icono?: NombreIcono;
  titulo?: ReactNode;
  nivelTitulo?: "h2" | "h3";
  children?: ReactNode;
  className?: string;
}) {
  const Titulo = nivelTitulo;
  return (
    <div className={`cartel p-5 sm:p-6 ${className}`} data-tono={tono}>
      <span className="cartel-icono">
        <IconoCartel icono={icono ?? ICONO_DEL_TONO[tono]} />
      </span>
      <div className="min-w-0 flex-1">
        {titulo && <Titulo className="cartel-titulo text-base font-semibold">{titulo}</Titulo>}
        {children}
      </div>
    </div>
  );
}

/** El aviso corto, de una o dos lineas, dentro de una pagina. */
export function Aviso({ children, tono = "info" }: { children: ReactNode; tono?: "info" | "atencion" }) {
  return (
    <div className="cartel items-center px-4 py-3 text-sm" data-tono={tono} data-compacto="">
      <span className="cartel-icono">
        <IconoCartel icono={tono} />
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Marcador visible de un dato que el municipio todavia tiene que confirmar.
 * Se usa en los textos legales (privacidad y aviso legal): preferimos que se
 * vea lo que falta antes que publicar un dato inventado. Vive aca, y no en una
 * de las dos paginas, porque las dos lo dibujan igual.
 */
export function Pendiente({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-block rounded-lg px-2.5 py-1 text-sm"
      style={{
        background: "color-mix(in srgb, var(--color-acento-600) 14%, transparent)",
        border: "1px dashed var(--color-acento-600)",
        color: "var(--texto)",
      }}
    >
      <strong style={{ color: "var(--acento-texto)" }}>PENDIENTE CONFIRMAR:</strong> {children}
    </span>
  );
}

/**
 * La flecha que dice que una fila se abre.
 *
 * Las filas plegables del panel (las obras y las ediciones) siempre fueron
 * botones con `aria-expanded`, asi que un lector de pantalla ya anunciaba que se
 * plegaban, pero en pantalla no habia NADA que lo dijera: eran filas de texto
 * que resultaba que se podian tocar. Y plegarlas es la unica forma de llegar a
 * lo que hay adentro.
 *
 * Vive aca, y no en una de las dos pantallas, porque las dos la dibujan igual.
 * `aria-hidden` porque no agrega informacion: que el boton se abre o se cierra
 * ya lo dice `aria-expanded`, y repetirlo seria escucharlo dos veces.
 */
export function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className="shrink-0"
      style={{
        color: "var(--texto-suave)",
        transform: abierto ? "rotate(90deg)" : "none",
        transition: "transform 120ms",
      }}
    >
      <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
