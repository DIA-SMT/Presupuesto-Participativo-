import Link from "next/link";
import type { Metadata } from "next";
import { Boton } from "@/components/ui";
import { getEdicionActiva, getFaq, getHitos, getTextos } from "@/db/queries";
import { ETIQUETA_ETAPA, formatearRango } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Cómo participar",
  description:
    "Preguntas frecuentes del Presupuesto Participativo de San Miguel de Tucumán: qué es, cómo presentar una idea, cómo empadronarse y cómo votar.",
};

/** Negritas simples en las respuestas cargadas desde el backoffice. */
function conNegritas(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, indice) =>
    parte.startsWith("**") && parte.endsWith("**") ? (
      <strong key={indice}>{parte.slice(2, -2)}</strong>
    ) : (
      parte
    ),
  );
}

export default async function AcercaDe() {
  const edicion = await getEdicionActiva();
  const [textos, faq, hitos] = await Promise.all([
    getTextos(),
    getFaq(),
    edicion ? getHitos(edicion.id) : Promise.resolve([]),
  ]);

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Cómo participar</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Todo lo que hay que saber sobre el Presupuesto Participativo de San Miguel de Tucumán.
          {edicion && (
            <>
              {" "}
              Hoy el programa está en la etapa{" "}
              <strong>{(ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa).toLowerCase()}</strong> de la
              edición {edicion.anio}.
            </>
          )}
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <section>
          <h2 className="text-xl font-bold">Preguntas frecuentes</h2>
          <div className="mt-4 space-y-3">
            {faq.map((item, indice) => (
              <details
                key={item.id}
                className="superficie rounded-2xl px-5 py-4"
                open={indice === 0}
              >
                <summary className="cursor-pointer text-base font-semibold">
                  {item.pregunta}
                </summary>
                <p className="mt-3 text-[0.9375rem] leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                  {conNegritas(item.respuesta)}
                </p>
              </details>
            ))}
          </div>

          {hitos.length > 0 && (
            <>
              <h2 className="mt-12 text-xl font-bold">Cronograma</h2>
              <ol className="mt-4 space-y-3">
                {hitos.map((hito) => (
                  <li key={hito.id} className="superficie rounded-2xl p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-base font-semibold">{hito.titulo}</h3>
                      <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
                        {formatearRango(hito.desde, hito.hasta)}
                      </p>
                    </div>
                    {hito.detalle && (
                      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                        {hito.detalle}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}

          {/*
            Por que no hay montos publicados.

            Este aviso vivia en /transparencia, que mostraba la ejecucion
            presupuestaria. Esa parte se saco porque no habia un solo dato real
            detras (ver el comentario de src/app/transparencia/page.tsx), pero el
            texto que RINDE CUENTAS de la ausencia no se tira: es lo unico en
            todo el sitio que le explica al vecino por que cada proyecto dice
            "Sin publicar" donde deberia ir un importe.

            Va en la pagina que explica el programa, y no en la de resultados,
            porque es una explicacion del proceso y no un dato de la edicion.
          */}
          <h2 className="mt-12 text-xl font-bold">Por qué no hay montos publicados</h2>
          <p className="mt-3 text-[0.9375rem] leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Los proyectos ganadores todavía no tienen publicado cuánto cuestan. No es un dato que
            falte cargar: el sistema anterior guardaba el presupuesto de cada idea con el valor 1,
            que era un relleno y no un importe, así que al traer los datos no se migró ningún monto
            en lugar de inventarlo. La estructura para publicarlos —el total de cada obra y el monto
            por etapa, con su historial— está hecha y espera que el municipio informe las cifras.
          </p>
        </section>

        <aside className="space-y-4">
          <div className="superficie rounded-2xl p-6">
            <h2 className="text-lg font-bold">Presentá tu idea</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              {edicion?.etapa === "ideas"
                ? "La etapa de ideas está abierta. Contanos qué problema querés resolver en tu barrio."
                : "La etapa de ideas de esta edición está cerrada, pero podés dejar tu propuesta para la próxima."}
            </p>
            <div className="mt-4">
              <Boton href="/ideas/nueva">Cargar una idea</Boton>
            </div>
          </div>

          <div className="superficie rounded-2xl p-6">
            <h2 className="text-lg font-bold">Empadronate para votar</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              Para votar necesitás la ciudadanía digital CIDITUC. Te la podés hacer de manera virtual
              desde la página de la Municipalidad, o presencial en las asambleas participativas de tu
              barrio.
            </p>
          </div>

          <div className="superficie rounded-2xl p-6">
            <h2 className="text-lg font-bold">Consultas</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              {textos["contacto-organismo"] ?? "Municipalidad de San Miguel de Tucumán"}
              <br />
              {textos["contacto-direccion"]}
              <br />
              {textos["contacto-telefono"]}
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
              También podés usar el chat de consultas, abajo a la derecha.
            </p>
          </div>

          <div className="superficie rounded-2xl p-6">
            <h2 className="text-lg font-bold">Reglamento</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              Las reglas completas del programa.
            </p>
            <Link href="/reglamento" className="mt-3 inline-block text-sm font-semibold underline">
              Ver el reglamento
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
