import Link from "next/link";
import type { Metadata } from "next";
import { Aviso, Cartel } from "@/components/ui";
import { getEdicionActiva, getTextos } from "@/db/queries";
import { REGLAS_CONFIRMADAS } from "@/lib/contenido-del-programa";
import { formatearRango } from "@/lib/formato";
import CuerpoReglamento, { parrafosDelReglamento } from "./cuerpo";

export const metadata: Metadata = {
  title: "Reglamento",
  description:
    "Reglas del Presupuesto Participativo de San Miguel de Tucumán: la Ordenanza 5.027/19, su Decreto Reglamentario 0981/S.Gral./2024, quién puede participar, cómo se presentan las ideas y cómo se vota.",
};

/**
 * Arriba, como funciona el programa en pocas reglas (las mismas que dice Migue:
 * src/lib/contenido-del-programa.ts). Abajo, el texto oficial, que vive en la
 * base (`textos`, clave `reglamento-cuerpo`); sin el, el aviso de
 * `reglamento-aviso`.
 */
export default async function Reglamento() {
  const [textos, edicion] = await Promise.all([getTextos(), getEdicionActiva()]);
  // Se decide por los parrafos y no por el texto crudo: un cuerpo con solo
  // espacios o renglones en blanco no es un reglamento, y antes dejaba la
  // pagina sin el texto y sin el aviso.
  const parrafos = parrafosDelReglamento(textos["reglamento-cuerpo"]);

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Reglamento</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          El Presupuesto Participativo se rige por la Ordenanza N.º 5.027/19 y por el Decreto
          Reglamentario N.º 0981/S.Gral./2024.
        </p>
      </header>

      <section className="mt-8 max-w-3xl">
        <h2 className="text-xl font-bold">Cómo funciona</h2>
        <ul className="mt-5 space-y-4">
          {REGLAS_CONFIRMADAS.map((regla) => (
            <li key={regla.titulo} className="superficie rounded-2xl p-5">
              <h3 className="text-base font-semibold">{regla.titulo}</h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                {regla.texto}
              </p>
            </li>
          ))}
        </ul>

        {edicion && (edicion.ideasDesde || edicion.votacionDesde) && (
          <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
            {[
              edicion.ideasDesde &&
                `Presentación de propuestas: ${formatearRango(edicion.ideasDesde, edicion.ideasHasta)}`,
              edicion.votacionDesde &&
                `Votación: ${formatearRango(edicion.votacionDesde, edicion.votacionHasta)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      <section className="mt-12 max-w-3xl">
        <h2 className="text-xl font-bold">Texto oficial</h2>
        {parrafos.length > 0 ? (
          <CuerpoReglamento parrafos={parrafos} />
        ) : (
          <div className="mt-4">
            <Aviso tono="atencion">
              {textos["reglamento-aviso"] ??
                "El texto oficial del reglamento todavía no está publicado en este sitio."}
            </Aviso>
          </div>
        )}
      </section>

      <Cartel tono="consejo" icono="consejo" titulo="¿Te quedó una duda?" className="mt-10 max-w-3xl">
        <p className="mt-2 text-sm">
          <Link href="/acerca-de" className="font-semibold underline">
            Mirá las preguntas frecuentes
          </Link>{" "}
          o preguntale a Migue.
        </p>
      </Cartel>
    </div>
  );
}
