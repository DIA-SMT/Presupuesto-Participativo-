import Link from "next/link";
import type { VistaDeEdicion } from "@/lib/edicion-en-vista";
import { estadoDeEdicionNoActiva } from "@/lib/ediciones";

/**
 * El aviso de arriba de cada pagina publica mientras se ve una edicion que no
 * es la activa: "Estás viendo la edición 2025 (terminada). Ver la edición
 * actual".
 *
 * Existe porque las paginas de una edicion anterior se ven IGUAL que las de la
 * actual: el mismo listado, los mismos distritos, la misma tabla. Sin el aviso,
 * alguien que llega desde un buscador a un ganador de 2025 lee "Proyecto
 * ganador" y cree que es lo que se esta votando hoy.
 *
 * No dibuja nada con la activa, asi que cada pagina lo pone siempre y no tiene
 * que preguntar. "Ver la edición actual" va a la misma pagina sin el
 * parametro, y no aparece si no hay edicion activa a la que ir.
 *
 * Colores: los tokens del sitio, que cambian con el tema. El texto va con
 * --texto y --acento-texto, que llegan a AA sobre el fondo teñido en claro y en
 * oscuro; la rampa --color-acento-* solo tiñe el fondo y el borde, que es para
 * lo que alcanza (ver globals.css).
 */
export default function AvisoEdicion({
  vista,
  hrefActual,
}: {
  vista: VistaDeEdicion | null;
  /** La misma pagina en la edicion activa. */
  hrefActual: string;
}) {
  if (!vista || vista.edicion.activa) return null;
  const { anio, etapa, anioActiva } = vista.edicion;

  return (
    <div
      role="note"
      className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl px-4 py-3 text-sm"
      style={{
        background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-acento-600) 38%, transparent)",
        color: "var(--texto)",
      }}
    >
      <p>
        <strong style={{ color: "var(--acento-texto)" }}>Estás viendo la edición {anio}</strong>{" "}
        ({estadoDeEdicionNoActiva(etapa)}).
      </p>
      {anioActiva !== null && (
        <Link
          href={hrefActual}
          className="font-semibold underline underline-offset-2"
          style={{ color: "var(--marca-texto)" }}
        >
          Ver la edición actual
        </Link>
      )}
    </div>
  );
}
