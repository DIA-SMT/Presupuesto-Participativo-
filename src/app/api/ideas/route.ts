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
import { codigoSeguimiento, VERSION_CONSENTIMIENTO } from "@/lib/avisos";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import {
  normalizar,
  normalizarBarrio,
  normalizarParrafo,
  normalizarTitulo,
  slugificar,
} from "@/lib/texto";
import { altaIdea } from "@/lib/idea-esquema";
import { puedeCargarFueraDeEtapa } from "@/lib/modo-prueba";

export const runtime = "nodejs";

// Los minimos y los largos viven en src/lib/idea-esquema.ts, compartidos con
// el asistente de carga: si cada uno tuviera los suyos, el asistente podria
// aprobar un texto que esta ruta rechaza.
const esquema = altaIdea;

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
  // Fuera de la ventana del reglamento el alta esta cerrada, salvo para el
  // equipo o con MODO_PRUEBA_IDEAS=1, que es como se muestra el circuito
  // completo con el programa en seguimiento (ver src/lib/modo-prueba.ts).
  if (edicion.etapa !== "ideas" && !(await puedeCargarFueraDeEtapa())) {
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

  // Sin casilla marcada no hay consentimiento, y sin consentimiento no se
  // guarda el contacto (el zod ya rechaza mail sin casilla).
  const quiereAvisos = Boolean(datos.autorAvisos && datos.autorEmail);

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
        // El contacto entra SOLO con la casilla marcada. Sin consentimiento el
        // dato no se guarda, y queda registrada la version del texto aceptado.
        autorEmail: quiereAvisos ? datos.autorEmail || null : null,
        autorAvisos: quiereAvisos,
        autorAvisosEn: quiereAvisos ? new Date() : null,
        autorAvisosVersion: quiereAvisos ? VERSION_CONSENTIMIENTO : null,
        // Se publica cuando el equipo la revisa.
        publicada: false,
        fecha: new Date().toISOString().slice(0, 10),
      })
      .returning({ id: ideas.id, numero: ideas.numero });

    // El codigo de seguimiento es lo unico que le permite a la persona ver
    // despues como sigue su idea: la pantalla de "idea recibida" lo muestra y
    // pide anotarlo. No se guarda en la base, se recalcula desde el id.
    return Response.json(
      {
        numero: creada.numero,
        distrito,
        codigo: codigoSeguimiento(creada.id),
      },
      { status: 201 },
    );
  } catch (causa) {
    console.error("[ideas] alta fallida", causa);
    return Response.json(
      { error: "No se pudo guardar la idea. Probá de nuevo en un momento." },
      { status: 500 },
    );
  }
}
