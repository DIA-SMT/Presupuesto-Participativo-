import Link from "next/link";
import type { ReactNode } from "react";
import type { IdeaVista } from "@/db/queries";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_PRESUPUESTO,
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

export function TarjetaProyecto({ idea }: { idea: IdeaVista }) {
  const resumen = idea.problema ?? idea.solucion ?? idea.beneficios;
  return (
    <article
      className="superficie flex h-full flex-col rounded-2xl p-5 transition hover:shadow-lg"
      style={{
        borderLeft: `4px solid ${idea.categoriaColor ?? "var(--borde)"}`,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip>Distrito {idea.distrito}</Chip>
        <ChipEstado estado={idea.estado} />
        {idea.ganador && idea.votos > 0 && (
          <Chip color="var(--color-estado-ganador)">
            {formatearNumero(idea.votos)} votos
          </Chip>
        )}
      </div>

      <h3 className="text-lg font-semibold leading-snug">
        <Link href={`/proyectos/${idea.slug}`} className="hover:underline">
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
        {idea.categoriaNombre && <span>{idea.categoriaNombre}</span>}
        {idea.ganador && (
          <span>· Obra {(ETIQUETA_PRESUPUESTO[idea.estadoPresupuesto] ?? "").toLowerCase()}</span>
        )}
      </div>
    </article>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl px-6 py-10 text-center text-sm"
      style={{
        background: "var(--fondo-suave)",
        border: "1px dashed var(--borde)",
        color: "var(--texto-suave)",
      }}
    >
      {children}
    </div>
  );
}

export function Aviso({ children, tono = "info" }: { children: ReactNode; tono?: "info" | "atencion" }) {
  const color = tono === "atencion" ? "var(--color-acento-600)" : "var(--color-marca-600)";
  return (
    <p
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
    >
      {children}
    </p>
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
      <strong style={{ color: "var(--color-acento-600)" }}>PENDIENTE CONFIRMAR:</strong> {children}
    </span>
  );
}
