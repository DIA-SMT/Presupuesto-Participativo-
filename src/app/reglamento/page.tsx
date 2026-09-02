import Link from "next/link";
import type { Metadata } from "next";
import { Aviso } from "@/components/ui";
import { getEdicionActiva, getTextos } from "@/db/queries";
import { formatearRango } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Reglamento",
  description:
    "Reglas del Presupuesto Participativo de San Miguel de Tucumán: quién puede participar, cómo se presentan las ideas y cómo se vota.",
};

export default async function Reglamento() {
  const [textos, edicion] = await Promise.all([getTextos(), getEdicionActiva()]);
  const reglamento = textos["reglamento-cuerpo"];

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Reglamento</h1>
      </header>

      {reglamento ? (
        <div className="mt-6 max-w-3xl space-y-4 text-[0.9375rem] leading-relaxed">
          {reglamento.split("\n").filter(Boolean).map((parrafo, indice) => (
            <p key={indice}>{parrafo}</p>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 max-w-3xl">
            <Aviso tono="atencion">
              {textos["reglamento-aviso"] ??
                "El reglamento general todavía no está publicado en este sitio."}
            </Aviso>
          </div>

          <section className="mt-10 max-w-3xl">
            <h2 className="text-xl font-bold">Las reglas que sí están confirmadas</h2>
            <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
              Mientras se publica el texto oficial completo, estas son las reglas vigentes del
              programa según la información del sitio.
            </p>

            <ul className="mt-5 space-y-4">
              {[
                {
                  titulo: "Un voto por persona",
                  texto:
                    "Cada persona empadronada tiene un solo voto y lo usa en un único proyecto. El sistema lo verifica: no se puede votar dos veces.",
                },
                {
                  titulo: "Se vota en el distrito donde se vive",
                  texto:
                    "El voto solo puede aplicarse a un proyecto del distrito de residencia de la persona. La ciudad tiene 20 distritos y cada uno elige su propio proyecto.",
                },
                {
                  titulo: "Empadronamiento con CIDITUC",
                  texto:
                    "La habilitación para votar se hace con la ciudadanía digital CIDITUC, de manera virtual desde la web municipal o presencial en las asambleas participativas.",
                },
                {
                  titulo: "Tres categorías de proyecto",
                  texto:
                    "Las propuestas se encuadran en espacio socio ambiental, espacio cultural deportivo o espacio de innovación urbana.",
                },
                {
                  titulo: "Evaluación técnica previa a la votación",
                  texto:
                    "Toda idea pasa por una evaluación técnica y presupuestaria. Puede quedar como factible, no factible, o integrarse con otra propuesta parecida. Solo las factibles se votan.",
                },
                {
                  titulo: "El proyecto ganador entra al presupuesto municipal",
                  texto:
                    // Decia ademas "y su ejecución se publica en este sitio". Es
                    // una regla presentada como confirmada, y hoy el sitio no
                    // publica ninguna ejecucion.
                    "El proyecto más votado de cada distrito se incorpora al presupuesto municipal del año siguiente.",
                },
              ].map((regla) => (
                <li key={regla.titulo} className="superficie rounded-2xl p-5">
                  <h3 className="text-base font-semibold">{regla.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                    {regla.texto}
                  </p>
                </li>
              ))}
            </ul>

            {edicion && (
              <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
                Edición {edicion.anio}
                {edicion.ideasDesde && (
                  <> · Presentación de ideas: {formatearRango(edicion.ideasDesde, edicion.ideasHasta)}</>
                )}
                {edicion.votacionDesde && (
                  <> · Votación: {formatearRango(edicion.votacionDesde, edicion.votacionHasta)}</>
                )}
              </p>
            )}

            <p className="mt-6 text-sm">
              <Link href="/acerca-de" className="font-semibold underline">
                Ver las preguntas frecuentes
              </Link>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
