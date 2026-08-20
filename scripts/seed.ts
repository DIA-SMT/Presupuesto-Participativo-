/**
 * Carga la base con la edicion 2025 completa.
 *
 * Requiere haber corrido antes:  npm run db:push && npm run etl
 * Es idempotente: se puede correr muchas veces sin duplicar nada.
 *
 * No correrlo mientras `npm run dev` esta levantado: PGlite bloquea la carpeta
 * de datos por proceso.
 */
import { config } from "dotenv";

// Los scripts corren fuera de Next: cargar .env.local (y .env como respaldo).
config({ path: [".env.local", ".env"] });
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { consultar, db } from "../src/db";
import {
  admins,
  categorias,
  distritos,
  ediciones,
  faq,
  hitos,
  ideas,
  textos,
} from "../src/db/schema";
import { hashearPassword } from "../src/lib/password";
import { normalizar } from "../src/lib/texto";
import { distritoDelPunto, type ColeccionDistritos } from "../src/lib/geo";
import type { IdeaLimpia } from "./etl";

type Contenido = {
  textos: Record<string, string>;
  faq: Array<{ pregunta: string; respuesta: string }>;
  cronograma2025: Array<{
    titulo: string;
    detalle: string;
    desde: string | null;
    hasta: string | null;
    etapa: "ideas" | "evaluacion" | "votacion" | "seguimiento" | "cerrada";
  }>;
  categorias: Array<{
    slug: string;
    nombre: string;
    descripcion: string;
    color: string;
    orden: number;
  }>;
};

const geo = JSON.parse(
  readFileSync("public/geo/distritos.geojson", "utf8"),
) as ColeccionDistritos;
const centroides = JSON.parse(
  readFileSync("data/raw/centroides_distritos.json", "utf8"),
) as Record<string, [number, number]>;
const contenido = JSON.parse(
  readFileSync("data/contenido-sitio.json", "utf8"),
) as Contenido;
const dataset = JSON.parse(
  readFileSync("data/proyectos-2025.json", "utf8"),
) as { anio: number; ideas: IdeaLimpia[] };

async function main() {
  // PGlite es de proceso unico: si `npm run dev` esta corriendo, la carpeta de
  // datos esta tomada y escribir desde aca la romperia. Se verifica primero.
  try {
    await consultar(sql`SELECT 1 AS ok`);
  } catch {
    console.error(
      "\nNo se pudo abrir la base. Si `npm run dev` esta corriendo, cerralo antes" +
        "\nde correr el seed (PGlite no admite dos procesos a la vez). Si el error" +
        "\npersiste, borra la carpeta ./data/pg y corre: npm run db:push && npm run seed\n",
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Distritos. La referencia de barrios se calcula con los barrios reales que
  // aparecen en las ideas de ese distrito: sirve para que el vecino se ubique.
  // -------------------------------------------------------------------------
  // Barrios unicos por distrito, deduplicados por su forma normalizada para
  // que "11 de Febrero" y "11 de febrero" cuenten como el mismo barrio.
  const barriosPorDistrito = new Map<number, Map<string, string>>();
  for (const idea of dataset.ideas) {
    if (!idea.barrio) continue;
    const mapa = barriosPorDistrito.get(idea.distrito) ?? new Map<string, string>();
    const clave = normalizar(idea.barrio);
    if (!mapa.has(clave)) mapa.set(clave, idea.barrio);
    barriosPorDistrito.set(idea.distrito, mapa);
  }

  console.log("Cargando distritos...");
  for (const feature of geo.features) {
    const numero = feature.properties.numero;
    const centroide = centroides[String(numero)];
    const barrios = [...(barriosPorDistrito.get(numero)?.values() ?? [])].sort();
    const valores = {
      numero,
      nombre: feature.properties.name,
      geojson: feature.geometry as unknown,
      centroideLat: String(centroide[1]),
      centroideLon: String(centroide[0]),
      referencia: barrios.length ? barrios.join(" · ") : null,
    };
    await db
      .insert(distritos)
      .values({ id: numero, ...valores })
      .onConflictDoUpdate({ target: distritos.id, set: valores });
  }
  console.log(`  ${geo.features.length} distritos`);

  // -------------------------------------------------------------------------
  // Categorias
  // -------------------------------------------------------------------------
  console.log("Cargando categorias...");
  const idCategoria = new Map<string, number>();
  for (const categoria of contenido.categorias) {
    const [fila] = await db
      .insert(categorias)
      .values(categoria)
      .onConflictDoUpdate({
        target: categorias.slug,
        set: {
          nombre: categoria.nombre,
          descripcion: categoria.descripcion,
          color: categoria.color,
          orden: categoria.orden,
        },
      })
      .returning({ id: categorias.id });
    idCategoria.set(categoria.slug, fila.id);
  }
  console.log(`  ${idCategoria.size} categorias`);

  // -------------------------------------------------------------------------
  // Ediciones: 2025 (en seguimiento, es la que se muestra) y 2026 (preparada)
  // -------------------------------------------------------------------------
  console.log("Cargando ediciones...");
  const [edicion2025] = await db
    .insert(ediciones)
    .values({
      anio: 2025,
      etapa: "seguimiento",
      ideasDesde: "2025-06-01",
      ideasHasta: "2025-09-30",
      votacionDesde: "2025-10-29",
      votacionHasta: "2025-10-30",
      activa: true,
    })
    .onConflictDoUpdate({
      target: ediciones.anio,
      set: { activa: true },
    })
    .returning({ id: ediciones.id });

  await db
    .insert(ediciones)
    .values({ anio: 2026, etapa: "ideas", activa: false })
    .onConflictDoNothing({ target: ediciones.anio });
  console.log("  2025 (activa) y 2026 (preparada)");

  // -------------------------------------------------------------------------
  // Ideas
  // -------------------------------------------------------------------------
  console.log("Cargando ideas...");
  let insertadas = 0;
  for (const idea of dataset.ideas) {
    const valores = {
      edicionId: edicion2025.id,
      distritoId: idea.distrito,
      categoriaId: idCategoria.get(idea.categoriaSlug) ?? null,
      numero: idea.numero,
      titulo: idea.titulo,
      slug: idea.slug,
      barrio: idea.barrio,
      barrioNormalizado: idea.barrio ? normalizar(idea.barrio) : null,
      problema: idea.problema,
      solucion: idea.solucion,
      beneficios: idea.beneficios,
      lat: idea.lat === null ? null : String(idea.lat),
      lon: idea.lon === null ? null : String(idea.lon),
      ubicacionAproximada: idea.ubicacionAproximada,
      estado: idea.estado,
      ganador: idea.ganador,
      votos: idea.votos,
      estadoPresupuesto: idea.estadoPresupuesto,
      canal: idea.canal,
      cargadoPor: idea.cargadoPor,
      tituloOriginal: idea.tituloOriginal,
      coordenadasOriginales: idea.coordenadasOriginales,
      notasMigracion: idea.notasMigracion,
      publicada: idea.publicada,
      fecha: idea.fecha,
    };

    await db
      .insert(ideas)
      .values(valores)
      .onConflictDoUpdate({
        target: [ideas.edicionId, ideas.slug],
        set: { ...valores, updatedAt: new Date() },
      });
    insertadas += 1;
  }
  console.log(`  ${insertadas} ideas`);

  // Enlaza las ideas repetidas con la principal que las absorbio.
  let enlazadas = 0;
  for (const idea of dataset.ideas) {
    if (!idea.duplicadoDeSlug) continue;
    const [principal] = await db
      .select({ id: ideas.id })
      .from(ideas)
      .where(
        and(eq(ideas.edicionId, edicion2025.id), eq(ideas.slug, idea.duplicadoDeSlug)),
      )
      .limit(1);
    if (!principal) continue;
    await db
      .update(ideas)
      .set({ integradaEnId: principal.id })
      .where(and(eq(ideas.edicionId, edicion2025.id), eq(ideas.slug, idea.slug)));
    enlazadas += 1;
  }
  if (enlazadas) console.log(`  ${enlazadas} repetidas enlazadas a su idea principal`);

  // -------------------------------------------------------------------------
  // Contenido editable
  // -------------------------------------------------------------------------
  console.log("Cargando textos, preguntas frecuentes y cronograma...");
  for (const [clave, valor] of Object.entries(contenido.textos)) {
    await db
      .insert(textos)
      .values({ clave, valor })
      .onConflictDoNothing({ target: textos.clave });
  }

  await db.delete(faq);
  await db.insert(faq).values(
    contenido.faq.map((item, indice) => ({
      orden: indice + 1,
      pregunta: item.pregunta,
      respuesta: item.respuesta,
    })),
  );

  await db.delete(hitos).where(eq(hitos.edicionId, edicion2025.id));
  await db.insert(hitos).values(
    contenido.cronograma2025.map((hito, indice) => ({
      edicionId: edicion2025.id,
      orden: indice + 1,
      titulo: hito.titulo,
      detalle: hito.detalle,
      desde: hito.desde,
      hasta: hito.hasta,
      etapa: hito.etapa,
    })),
  );
  console.log(
    `  ${Object.keys(contenido.textos).length} textos, ${contenido.faq.length} preguntas, ${contenido.cronograma2025.length} hitos`,
  );

  // -------------------------------------------------------------------------
  // Usuario del backoffice
  // -------------------------------------------------------------------------
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    await db
      .insert(admins)
      .values({
        email: email.toLowerCase(),
        nombre: process.env.ADMIN_NOMBRE ?? "Administrador",
        passwordHash: await hashearPassword(password),
        rol: "admin",
      })
      .onConflictDoUpdate({
        target: admins.email,
        set: { passwordHash: await hashearPassword(password), activo: true },
      });
    console.log(`Backoffice: ${email.toLowerCase()} listo.`);
  } else {
    console.log(
      "Backoffice: sin ADMIN_EMAIL / ADMIN_PASSWORD en el entorno, no se creo usuario.",
    );
  }

  // -------------------------------------------------------------------------
  // Resumen y verificacion
  // -------------------------------------------------------------------------
  const [resumen] = await consultar<{
    ideas: number;
    publicadas: number;
    ganadores: number;
    votos: number;
    con_punto: number;
  }>(sql`
    SELECT count(*)::int AS ideas,
           count(*) FILTER (WHERE publicada)::int AS publicadas,
           count(*) FILTER (WHERE ganador)::int AS ganadores,
           coalesce(sum(votos) FILTER (WHERE ganador), 0)::int AS votos,
           count(*) FILTER (WHERE NOT ubicacion_aproximada AND lat IS NOT NULL)::int AS con_punto
    FROM ideas
  `);

  // Comprobacion: el distrito guardado tiene que coincidir con el que devuelve
  // el point-in-polygon sobre la geometria oficial.
  const conPunto = await db
    .select({ lat: ideas.lat, lon: ideas.lon, distritoId: ideas.distritoId })
    .from(ideas)
    .where(and(eq(ideas.ubicacionAproximada, false), sql`${ideas.lat} IS NOT NULL`));

  const discrepancias = conPunto.filter((fila) => {
    const numero = distritoDelPunto(
      { lat: Number(fila.lat), lon: Number(fila.lon) },
      geo,
    );
    return numero !== null && numero !== fila.distritoId;
  }).length;

  console.log(`
Base lista (${process.env.DATABASE_URL?.startsWith("postgres") ? "Postgres" : "PGlite en ./data/pg"}):
  ideas ........................... ${resumen.ideas} (${resumen.publicadas} publicadas)
  ganadores ....................... ${resumen.ganadores} (${resumen.votos} votos)
  con coordenada propia ........... ${resumen.con_punto}
  puntos fuera de su distrito ..... ${discrepancias} (revisar desde el backoffice)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
