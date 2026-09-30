"use client";

/**
 * Pagina de error del sitio publico: el error boundary de la raiz.
 *
 * Hasta ahora solo el panel tenia el suyo (src/app/admin/error.tsx). Si se caia
 * la base, el vecino veia la pantalla generica de Next, en ingles y sin salida.
 *
 * Envuelve a todas las paginas, pero NO al layout raiz del mismo segmento
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 * Eso esta bien asi: el layout ya se banca solo que falle la base (sus tres
 * consultas van con `.catch`), de modo que esta pantalla sale con el
 * encabezado, el pie y el chat de siempre, y la persona puede seguir
 * navegando. Si lo que falla es el layout mismo, lo agarra
 * src/app/global-error.tsx.
 *
 * Adentro de /admin gana el boundary mas cercano, el del panel, que le habla
 * al equipo y no al vecino.
 *
 * Igual que en el panel, el detalle tecnico no se muestra: en produccion Next
 * reemplaza el mensaje de un error del servidor por un identificador, y este
 * componente tampoco imprime `error.message`. Se muestra el `digest`, que no
 * dice nada de los datos y sirve para encontrar el error en los registros.
 */
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorDelSitio({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * Vuelve a pedirle la pagina al servidor; es lo que recomienda la guia de
   * Next 16.3 en lugar de `reset`, que solo limpia el estado del boundary sin
   * volver a consultar (y con la base caida mostraria lo mismo). Opcional por
   * la misma razon que en src/app/admin/error.tsx.
   */
  retry?: () => void;
}) {
  useEffect(() => {
    console.error("[sitio] fallo una pagina", error);
  }, [error]);

  const reintentar = retry ?? reset;

  return (
    <div className="contenedor flex min-h-[50vh] flex-col items-start justify-center py-20">
      <div role="alert" className="max-w-xl">
        <p className="text-sm font-semibold" style={{ color: "var(--acento-texto)" }}>
          Algo no anduvo bien
        </p>
        <h1 className="mt-2 text-3xl font-bold">No pudimos mostrar esta página</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          No es algo que hayas hecho vos: puede ser un problema momentáneo de conexión con la base
          de datos o un error del sitio. Probá de nuevo en unos segundos; si sigue igual, volvé
          en un rato.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reintentar()}
            className="rounded-xl px-5 py-3 text-sm font-semibold text-white"
            style={{ background: "var(--color-marca-700)" }}
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-xl px-5 py-3 text-sm font-semibold hover:brightness-95"
            style={{
              background: "var(--fondo-tarjeta)",
              border: "1px solid var(--borde-control)",
              color: "var(--texto)",
            }}
          >
            Volver al inicio
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 text-xs" style={{ color: "var(--texto-suave)" }}>
            Si el problema sigue y nos escribís, pasanos este código:{" "}
            <code>{error.digest}</code>. Nos sirve para encontrar el error; no dice nada de tus
            datos.
          </p>
        )}
      </div>
    </div>
  );
}
