/**
 * Alta de una idea presentada por un vecino.
 *
 * La idea entra como `pendiente` y sin publicar: aparece en el sitio despues de
 * que el equipo la revise desde el backoffice. El distrito no lo elige quien
 * carga: se deriva por point-in-polygon a partir del punto marcado en el mapa.
 */
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { consultar, db } from "@/db";
import { categorias, ideas } from "@/db/schema";
import { distritoDeCoordenada, getEdicionActiva } from "@/db/queries";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import {
  normalizar,
  normalizarBarrio,
  normalizarParrafo,
  normalizarTitulo,
  slugificar,
} from "@/lib/texto";

export const runtime = "nodejs";

const esquema = z.object({
  titulo: z.string().trim().min(8).max(140),
  categoria: z.string().trim().min(1).max(60),
  barrio: z.string().trim().max(120).nullish(),
  problema: z.string().trim().min(30).max(3000),
  solucion: z.string().trim().min(30).max(4000),
  beneficios: z.string().trim().max(3000).nullish(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  autorNombre: z.string().trim().max(120).nullish(),
  autorTelefono: z.string().trim().max(40).nullish(),
  autorEmail: z.string().trim().email().max(160).nullish().or(z.literal("")),
});

export async function POST(request: Request) {
  const ipHash = hashearIp(ipDe(request));

  // Tope generoso, pero suficiente para frenar una carga automatizada.
  const limite = await consumir(`ideas:${ipHash}`, 5, 3600);
  if (!limite.permitido) {
    return Response.json(
      {
        error: `Ya enviaste varias ideas desde esta conexión. Probá de nuevo en ${Math.ceil(
          limite.reiniciaEn / 60,
        )} minutos.`,
      },
      { status: 429 },
    );
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(await request.json());
  } catch (causa) {
    const detalle =
      causa instanceof z.ZodError
        ? causa.issues.map((i) => i.path.join(".")).join(", ")
        : null;
    return Response.json(
      {
        error: detalle
          ? `Revisá estos campos: ${detalle}.`
          : "Faltan datos o hay un campo demasiado corto.",
      },
      { status: 400 },
    );
  }

  const edicion = await getEdicionActiva();
  if (!edicion) {
    return Response.json({ error: "No hay una edición activa." }, { status: 503 });
  }
  if (edicion.etapa !== "ideas") {
    return Response.json(
      { error: "La etapa de presentación de ideas está cerrada." },
      { status: 409 },
    );
  }

  const distrito = await distritoDeCoordenada(datos.lat, datos.lon);
  if (!distrito) {
    return Response.json(
      { error: "El punto marcado queda fuera de los 20 distritos de la ciudad." },
      { status: 400 },
    );
  }

  const [categoria] = await db
    .select({ id: categorias.id })
    .from(categorias)
    .where(eq(categorias.slug, datos.categoria))
    .limit(1);
  if (!categoria) {
    return Response.json({ error: "Categoría desconocida." }, { status: 400 });
  }

  const titulo = normalizarTitulo(datos.titulo);
  const base = slugificar(titulo);
  const barrio = normalizarBarrio(datos.barrio);

  // Numero identificador correlativo dentro de la edicion.
  const [{ siguiente }] = await consultar<{ siguiente: number }>(sql`
    SELECT coalesce(max(numero), 0) + 1 AS siguiente
      FROM ideas
     WHERE edicion_id = ${edicion.id}
  `);

  // El slug tiene que ser unico por edicion.
  const [{ tomados }] = await consultar<{ tomados: number }>(sql`
    SELECT count(*)::int AS tomados
      FROM ideas
     WHERE edicion_id = ${edicion.id}
       AND (slug = ${base} OR slug LIKE ${`${base}-%`})
  `);
  const slug = Number(tomados) > 0 ? `${base}-${Number(tomados) + 1}` : base;

  try {
    const [creada] = await db
      .insert(ideas)
      .values({
        edicionId: edicion.id,
        distritoId: distrito,
        categoriaId: categoria.id,
        numero: Number(siguiente),
        titulo,
        slug,
        barrio,
        barrioNormalizado: barrio ? normalizar(barrio) : null,
        problema: normalizarParrafo(datos.problema),
        solucion: normalizarParrafo(datos.solucion),
        beneficios: normalizarParrafo(datos.beneficios),
        lat: String(datos.lat),
        lon: String(datos.lon),
        ubicacionAproximada: false,
        estado: "pendiente",
        canal: "web",
        autorNombre: datos.autorNombre || null,
        autorTelefono: datos.autorTelefono || null,
        autorEmail: datos.autorEmail || null,
        // Se publica cuando el equipo la revisa.
        publicada: false,
        fecha: new Date().toISOString().slice(0, 10),
      })
      .returning({ numero: ideas.numero });

    return Response.json({ numero: creada.numero, distrito }, { status: 201 });
  } catch (causa) {
    console.error("[ideas] alta fallida", causa);
    return Response.json(
      { error: "No se pudo guardar la idea. Probá de nuevo en un momento." },
      { status: 500 },
    );
  }
}
