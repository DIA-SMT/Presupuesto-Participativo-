import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { consultar, db } from "@/db";
import { chatConsultas } from "@/db/schema";
import { getSesionAdmin } from "@/lib/sesion";
import { formatearNumero } from "@/lib/formato";

/**
 * Que pregunta la gente en el chat. Es insumo directo para el equipo: si todos
 * preguntan lo mismo, eso falta en el sitio.
 */

/**
 * De donde salio cada consulta. Son los tres valores del enum `origen_consulta`
 * (src/db/schema.ts): el chat publico del sitio, el asistente que ayuda al
 * vecino a escribir su idea, y el informe de impacto que se genera desde el
 * panel. Cuestan y significan cosas distintas, y hasta ahora se veian iguales.
 */
const ETIQUETA_ORIGEN: Record<string, string> = {
  chat: "Chat del sitio",
  asistente: "Asistente de carga",
  informe: "Informe del panel",
};
export default async function AdminConsultas() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const [resumen] = await consultar<{ total: number; con_error: number; ms_promedio: number | null }>(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE NOT ok)::int AS con_error,
           avg(ms)::int AS ms_promedio
      FROM chat_consultas
     WHERE created_at > now() - interval '30 days'
  `);

  const ultimas = await db
    .select({
      id: chatConsultas.id,
      // `origen` existe justamente para que esta pantalla no mezcle el chat
      // publico con el asistente de carga y con los informes del panel (lo dice
      // el comentario de la columna en src/db/schema.ts), pero el listado no lo
      // traia, asi que las tres cosas se veian como si fueran todas del chat.
      origen: chatConsultas.origen,
      pregunta: chatConsultas.pregunta,
      respuesta: chatConsultas.respuesta,
      herramientas: chatConsultas.herramientas,
      modelo: chatConsultas.modelo,
      ms: chatConsultas.ms,
      ok: chatConsultas.ok,
      createdAt: chatConsultas.createdAt,
    })
    .from(chatConsultas)
    .orderBy(desc(chatConsultas.createdAt))
    .limit(80);

  const total = Number(resumen?.total ?? 0);
  const conError = Number(resumen?.con_error ?? 0);
  const msPromedio = resumen?.ms_promedio ? Number(resumen.ms_promedio) : null;

  return (
    <div>
      <h1 className="text-2xl font-bold">Consultas del chat</h1>
      {/*
        La segunda frase no es de relleno: la pantalla se llama "del chat" pero
        la lista trae tambien las llamadas del asistente de carga y de los
        informes del panel, que es lo que guarda la tabla. Se dice acá y con una
        etiqueta en cada fila, en lugar de renombrar la pantalla, que es el
        nombre con el que el equipo la conoce.
      */}
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Una pregunta que se repite es contenido que le falta al sitio. Además del chat público,
        acá aparece cada vez que el panel o el asistente de carga le hablan al modelo.
      </p>

      {/*
        --- Resumen de los ultimos 30 dias --------------------------------
        Antes los tres numeros iban en una oracion con comas, y con el promedio
        en null la frase terminaba en ",." — pasa hoy mismo, porque todavia no
        hay consultas registradas. Ahora cada dato va suelto y la frase no se
        arma pegando puntuacion: sin consultas es una sola linea que lo dice.
      */}
      <div className="mt-4">
        <p className="text-xs uppercase tracking-wide" style={{ color: "var(--texto-suave)" }}>
          Últimos 30 días
        </p>
        {total === 0 ? (
          <p className="mt-0.5 text-sm" style={{ color: "var(--texto-suave)" }}>
            Ninguna consulta en los últimos 30 días.
          </p>
        ) : (
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-4 text-sm">
            <span>
              <strong>{formatearNumero(total)}</strong>{" "}
              {total === 1 ? "consulta" : "consultas"}
            </span>
            <span style={conError > 0 ? { color: "var(--color-acento-700)" } : undefined}>
              {conError === 0 ? (
                "sin errores"
              ) : (
                <>
                  <strong>{formatearNumero(conError)}</strong> con error
                </>
              )}
            </span>
            {msPromedio !== null && (
              <span style={{ color: "var(--texto-suave)" }}>
                {formatearNumero(msPromedio)} ms de respuesta promedio
              </span>
            )}
          </p>
        )}
      </div>

      {/*
        La lista NO respeta los 30 dias del resumen: son las ultimas 80 de
        cualquier fecha. Sin decirlo, un resumen en cero arriba de ochenta filas
        se lee como una contradiccion.
      */}
      <h2 className="mt-8 text-lg font-bold">
        {ultimas.length === 0
          ? "Todavía no hay consultas"
          : `Las ${
              ultimas.length === 1 ? "última" : `últimas ${ultimas.length}`
            }, de cualquier fecha`}
      </h2>

      {ultimas.length === 0 && (
        <p
          className="superficie mt-3 rounded-2xl px-5 py-6 text-sm"
          style={{ color: "var(--texto-suave)" }}
        >
          Nadie le preguntó nada al chat todavía. Cada consulta que hagan los vecinos desde el
          botón “Consultas” del sitio va a quedar registrada acá con su pregunta, la respuesta y
          las herramientas que usó. De la persona que pregunta no se guarda nada más que su IP
          hasheada, que esta pantalla no muestra.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {ultimas.map((consulta) => (
          <li key={consulta.id} className="superficie rounded-2xl px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-medium">
                {/*
                  De donde salio la consulta, adelante de la pregunta: la pantalla
                  se llama "Consultas del chat" pero la tabla guarda tambien las
                  del asistente de carga y las de los informes del panel, que
                  tienen otro uso y otro costo.
                */}
                <span
                  className="mr-2 rounded-md px-1.5 py-0.5 text-xs font-semibold"
                  style={{
                    background: "var(--fondo-suave)",
                    border: "1px solid var(--borde)",
                    color: "var(--texto-suave)",
                  }}
                >
                  {ETIQUETA_ORIGEN[consulta.origen] ?? consulta.origen}
                </span>
                {consulta.pregunta}
              </p>
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                {/* El error primero: es lo unico de esta linea que pide acción. */}
                {!consulta.ok && (
                  <strong style={{ color: "var(--color-acento-700)" }}>error · </strong>
                )}
                {consulta.createdAt.toLocaleString("es-AR", {
                  timeZone: "America/Argentina/Tucuman",
                })}
                {" · "}
                {consulta.modelo ?? "buscador sin IA"}
                {consulta.ms ? ` · ${consulta.ms} ms` : ""}
              </p>
            </div>
            {consulta.respuesta && (
              <p className="mt-2 line-clamp-3 text-sm" style={{ color: "var(--texto-suave)" }}>
                {consulta.respuesta}
              </p>
            )}
            {consulta.herramientas && consulta.herramientas.length > 0 && (
              <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                Herramientas: {consulta.herramientas.join(", ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
