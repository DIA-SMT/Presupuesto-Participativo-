"use client";

/**
 * Ultima red: el error del layout raiz.
 *
 * src/app/error.tsx cubre todas las paginas, pero no al layout que las
 * envuelve; lo que falle AHI (el encabezado, el pie, el chat) cae aca. Sin este
 * archivo, esa falla mostraba la pantalla generica de Next, en ingles. Esta
 * descripto en
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
 * ("Global Error").
 *
 * Lo que cambia respecto de una pagina comun, segun esa guia:
 *  - Reemplaza al layout raiz, asi que dibuja su propio <html> y <body>, y el
 *    CSS global se importa aca: sin el import, la pagina sale sin estilos.
 *  - No puede exportar `metadata` (es un componente cliente): el titulo va con
 *    un <title> de React.
 *  - El `data-theme` que el layout escribe antes del primer pintado no llega.
 *    Los tokens de globals.css ya siguen al tema del sistema; si la persona
 *    eligio uno a mano con el boton, se aplica en el efecto de abajo, con la
 *    misma clave que usa src/components/BotonTema.tsx.
 *
 * Es deliberadamente austera: si llegamos aca, algo de la estructura del sitio
 * esta roto, y cuantas menos piezas dependan de ella, mas chances de que esta
 * pantalla si se vea. Por eso el "Volver al inicio" es un <a> comun y no un
 * <Link>: una navegacion completa vuelve a pedir todo desde cero.
 */
import { useEffect } from "react";
import { CLAVE_TEMA } from "@/components/BotonTema";
import "./globals.css";

export default function ErrorGlobal({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Ver src/app/error.tsx: se prefiere a `reset` porque vuelve a consultar. */
  retry?: () => void;
}) {
  useEffect(() => {
    console.error("[sitio] fallo el layout raiz", error);
  }, [error]);

  useEffect(() => {
    // Con try/catch por lo mismo que en BotonTema: en una ventana privada leer
    // localStorage puede tirar, y esta pantalla no puede ser la que se cae.
    try {
      const tema = localStorage.getItem(CLAVE_TEMA);
      if (tema === "claro") document.documentElement.dataset.theme = "light";
      else if (tema === "oscuro") document.documentElement.dataset.theme = "dark";
    } catch {
      // Sin preferencia guardada, manda el tema del sistema.
    }
  }, []);

  const reintentar = retry ?? reset;

  return (
    <html lang="es-AR">
      <body>
        <title>Algo no anduvo bien · Presupuesto Participativo SMT</title>
        <main className="contenedor flex min-h-screen flex-col items-start justify-center py-20">
          <div role="alert" className="max-w-xl">
            <p
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--texto-suave)" }}
            >
              Presupuesto Participativo · San Miguel de Tucumán
            </p>
            <h1 className="mt-3 text-3xl font-bold">El sitio no se pudo cargar</h1>
            <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              No es algo que hayas hecho vos: tuvimos un problema para armar la página. Probá de
              nuevo en unos segundos; si sigue igual, volvé en un rato.
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
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a proposito: ver el comentario de arriba sobre <Link> */}
              <a
                href="/"
                className="rounded-xl px-5 py-3 text-sm font-semibold hover:brightness-95"
                style={{
                  background: "var(--fondo-tarjeta)",
                  border: "1px solid var(--borde-control)",
                  color: "var(--texto)",
                }}
              >
                Volver al inicio
              </a>
            </div>

            {error.digest && (
              <p className="mt-6 text-xs" style={{ color: "var(--texto-suave)" }}>
                Si el problema sigue y nos escribís, pasanos este código:{" "}
                <code>{error.digest}</code>. Nos sirve para encontrar el error; no dice nada de
                tus datos.
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
