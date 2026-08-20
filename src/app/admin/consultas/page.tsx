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

  return (
    <div>
      <h1 className="text-2xl font-bold">Consultas del chat</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Últimos 30 días: {formatearNumero(Number(resumen.total))} consultas, {Number(resumen.con_error)} con error,
        {resumen.ms_promedio ? ` ${formatearNumero(Number(resumen.ms_promedio))} ms de respuesta promedio.` : "."}
        {" "}Las preguntas frecuentes que veas acá son contenido que le falta al sitio.
      </p>

      <ul className="mt-6 space-y-2">
        {ultimas.map((consulta) => (
          <li key={consulta.id} className="superficie rounded-2xl px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{consulta.pregunta}</p>
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                {consulta.createdAt.toLocaleString("es-AR", {
                  timeZone: "America/Argentina/Tucuman",
                })}
                {" · "}
                {consulta.modelo ?? "buscador"}
                {consulta.ms ? ` · ${consulta.ms} ms` : ""}
                {!consulta.ok && (
                  <strong style={{ color: "var(--color-acento-600)" }}> · error</strong>
                )}
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
