/**
 * Andamiaje para las pruebas que SI necesitan base de datos.
 *
 * Levanta una PGlite descartable, le aplica las migraciones reales de
 * ./drizzle y carga los datos minimos para probar una regla. Nada de esto toca
 * la base configurada en .env.local: cada archivo de prueba usa su propia
 * carpeta temporal, porque PGlite es de proceso unico y el runner de node corre
 * los archivos en paralelo.
 *
 * Que las migraciones sean las de verdad no es un detalle: cada corrida verifica
 * que el esquema versionado se aplique desde cero, ademas de la regla que se
 * este probando.
 *
 * Uso:
 *
 *   const base = await crearBaseDePrueba("votacion");
 *   const { db, consultar, schema } = base;
 *   ...
 *   await base.cerrar();
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type BaseDePrueba = Awaited<ReturnType<typeof crearBaseDePrueba>>;

/**
 * `src/db` decide el driver al importarse, leyendo DATABASE_URL. Por eso la
 * variable se setea ANTES del import dinamico, y por eso el modulo se importa
 * una sola vez por proceso: el segundo import devuelve la misma instancia.
 */
export async function crearBaseDePrueba(nombre: string) {
  const carpeta = mkdtempSync(join(tmpdir(), `pp-prueba-${nombre}-`));
  process.env.DATABASE_URL = `pglite:${carpeta}`;
  // SESSION_SECRET lo piden los modulos que hashean (empadronamiento, avisos).
  process.env.SESSION_SECRET ??= "secreto-de-prueba-con-mas-de-32-caracteres";

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../../src/db/schema");

  // Las migraciones corren con un cliente propio, que se CIERRA antes de seguir.
  // PGlite es de proceso unico por carpeta: si este cliente quedara abierto, el
  // que abre src/db al importarse esperaria el lock para siempre y la prueba se
  // colgaria sin decir por que. Se aprendio por las malas.
  const migrador = new PGlite(carpeta);
  await migrate(drizzle(migrador, { schema }), { migrationsFolder: "./drizzle" });
  await migrador.close();

  // Desde aca la conexion es la de la aplicacion: las pruebas ejercitan el mismo
  // src/db que usan las paginas, no una copia parecida.
  const { consultar, db } = await import("../../src/db");
  const { sql } = await import("drizzle-orm");

  return {
    db,
    schema,
    sql,
    /** SQL crudo, con el tag `sql` de drizzle, para afirmar sobre el catalogo. */
    consultar,
    async cerrar() {
      // src/db no expone un cierre: la conexion vive lo que vive el proceso, y
      // el proceso de la prueba termina enseguida. Borrar la carpeta puede
      // fallar en Windows si el archivo quedo tomado, y no es motivo para
      // marcar la prueba en rojo.
      try {
        rmSync(carpeta, { recursive: true, force: true });
      } catch {
        // La carpeta temporal la limpia el sistema operativo.
      }
    },
  };
}

/**
 * Predicado para `assert.rejects` que busca el texto en TODA la cadena de
 * causas, no solo en el mensaje.
 *
 * Hace falta porque drizzle envuelve el error del driver: el mensaje de arriba
 * es "Failed query: insert into ..." y el nombre del constraint violado aparece
 * recien en un `cause`. Con una expresion regular suelta, `assert.rejects` no lo
 * encuentra y la prueba falla aunque la base haya hecho exactamente lo que se
 * esperaba. Es el mismo pozo que resuelve `mensajeDeError` en
 * src/app/admin/acciones.ts.
 */
export function violacionDe(patron: RegExp) {
  return (error: unknown) => {
    let texto = "";
    for (let actual: unknown = error; actual instanceof Error; actual = actual.cause) {
      texto += ` ${actual.message}`;
    }
    assert.match(texto, patron);
    return true;
  };
}

/**
 * Datos minimos para probar reglas: una edicion, dos distritos, una categoria.
 * A proposito NO usa el seed real: el seed carga las 100 ideas de 2025 y tarda,
 * y una prueba tiene que poder afirmar sobre un universo que entra en la cabeza.
 */
export async function cargarMinimo(
  base: BaseDePrueba,
  opciones: { etapa?: "ideas" | "evaluacion" | "votacion" | "seguimiento" | "cerrada" } = {},
) {
  const { db, schema } = base;

  const [edicion] = await db
    .insert(schema.ediciones)
    .values({ anio: 2026, etapa: opciones.etapa ?? "votacion", activa: true })
    .returning({ id: schema.ediciones.id });

  // Los distritos llevan id asignado a mano (no serial) y geojson obligatorio.
  for (const numero of [1, 2]) {
    await db.insert(schema.distritos).values({
      id: numero,
      numero,
      nombre: `Distrito ${numero}`,
      geojson: { type: "MultiPolygon", coordinates: [] },
      centroideLat: "-26.8",
      centroideLon: "-65.2",
    });
  }

  const [categoria] = await db
    .insert(schema.categorias)
    .values({
      slug: "urbana",
      nombre: "Urbana",
      descripcion: "Obras urbanas",
      color: "#7141a8",
      orden: 1,
    })
    .returning({ id: schema.categorias.id });

  return { edicionId: edicion.id, categoriaId: categoria.id };
}

/** Una idea, con lo justo para que sea valida. */
export async function crearIdea(
  base: BaseDePrueba,
  datos: {
    edicionId: number;
    distrito: number;
    titulo: string;
    slug: string;
    numero?: number;
    estado?: "borrador" | "pendiente" | "factible" | "no_factible" | "integrado" | "ganador";
    publicada?: boolean;
    votos?: number;
    ganador?: boolean;
  },
) {
  const [fila] = await base.db
    .insert(base.schema.ideas)
    .values({
      edicionId: datos.edicionId,
      distritoId: datos.distrito,
      numero: datos.numero ?? null,
      titulo: datos.titulo,
      slug: datos.slug,
      estado: datos.estado ?? "factible",
      publicada: datos.publicada ?? true,
      votos: datos.votos ?? 0,
      ganador: datos.ganador ?? false,
    })
    .returning({ id: base.schema.ideas.id });
  return fila.id;
}

/** Un votante empadronado, con el DNI hasheado como en produccion. */
export async function crearVotante(
  base: BaseDePrueba,
  datos: { dni: string; distrito: number | null },
) {
  const { hashearDni } = await import("../../src/lib/empadronamiento");
  const [fila] = await base.db
    .insert(base.schema.votantes)
    .values({
      dniHash: hashearDni(datos.dni),
      dniCola: datos.dni.slice(-3),
      distritoId: datos.distrito,
      proveedor: "dev",
      verificado: true,
    })
    .returning({ id: base.schema.votantes.id });
  return fila.id;
}
