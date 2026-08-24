"use client";

/**
 * Red de contencion del panel: el error boundary de /admin.
 *
 * Envuelve las pantallas de abajo (page.tsx y los layouts anidados), asi que si
 * una consulta o una accion revienta de forma inesperada el equipo ve que paso,
 * puede reintentar y volver al panel, en vez de la pantalla de error generica de
 * Next. Lo que NO cubre es el layout.tsx de este mismo segmento: la cabecera del
 * panel tiene que aguantarse sola (por eso lee el nombre de la cuenta con
 * try/catch). Esta descripto en
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 *
 * El detalle tecnico no se le muestra a nadie: los errores de un server
 * component ya llegan al cliente sin el mensaje original (Next lo reemplaza por
 * un identificador justamente para no filtrar datos de la base) y este
 * componente tampoco imprime `error.message`. Se muestra solo el `digest`, que
 * es un hash y sirve para encontrar el error en los logs del servidor. El error
 * completo se registra en la consola del navegador para poder depurar.
 */
import Link from "next/link";
import { useEffect } from "react";

/** Borde de los controles: el mismo criterio que la cabecera (WCAG 1.4.11). */
/** Borde de un control: el token vive en src/app/globals.css (WCAG 1.4.11). */
const BORDE_CONTROL = "var(--borde-control)";

export default function ErrorDelPanel({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * Vuelve a pedirle el contenido al servidor y es lo que recomienda la guia de
   * Next 16.3 ("In most cases, you should use retry() instead" de `reset`, que
   * solo limpia el estado del boundary sin volver a consultar). Se declara
   * opcional para que el boton siga funcionando con `reset` si algun dia la prop
   * no viene.
   */
  retry?: () => void;
}) {
  useEffect(() => {
    console.error("[admin] fallo una pantalla del panel", error);
  }, [error]);

  const reintentar = retry ?? reset;

  return (
    <div
      role="alert"
      className="mx-auto max-w-xl rounded-2xl px-6 py-7"
      style={{
        background: "var(--fondo-tarjeta)",
        border: "1px solid color-mix(in srgb, var(--color-acento-600) 45%, transparent)",
      }}
    >
      <h1 className="text-xl font-bold">Algo falló en el panel</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
        Esta pantalla no se pudo mostrar. No es algo que hayas hecho mal: puede ser la base de datos,
        la red o un error del sitio.
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
        Probá de nuevo con el botón de abajo. Si estabas guardando un cambio, fijate cómo quedó la
        ficha después de reintentar: puede haber quedado guardado o no. Si el error vuelve a
        aparecer, avisale al equipo técnico y pasale el código de abajo.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => reintentar()}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          Reintentar
        </button>
        <Link
          href="/admin"
          className="rounded-xl px-4 py-2.5 text-sm font-medium hover:brightness-95"
          style={{
            background: "var(--fondo-tarjeta)",
            border: `1px solid ${BORDE_CONTROL}`,
            color: "var(--texto)",
          }}
        >
          Volver al panel
        </Link>
      </div>

      {error.digest && (
        <p className="mt-5 text-xs" style={{ color: "var(--texto-suave)" }}>
          Código del error: <code>{error.digest}</code>. Es un identificador para buscarlo en los
          registros del servidor; no dice nada de los datos.
        </p>
      )}
    </div>
  );
}
