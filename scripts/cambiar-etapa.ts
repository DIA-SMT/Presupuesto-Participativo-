/**
 * Cambia la etapa de la edicion activa desde la terminal.
 *
 * El camino normal es /admin/ediciones. Esto es para pruebas locales:
 *
 *   npx tsx scripts/cambiar-etapa.ts              -> muestra la etapa actual
 *   npx tsx scripts/cambiar-etapa.ts votacion     -> la cambia
 *
 * Tres cosas cambiaron respecto de la version anterior, las tres por el mismo
 * motivo (esto mueve lo que ve todo el sitio: pasar a "votacion" abre la
 * votacion publica):
 *
 *  - Deja rastro en `bitacora_sistema`, igual que `cambiarEtapa` del panel
 *    (src/app/admin/acciones.ts): mismo formato de fila, en la misma
 *    transaccion que el UPDATE. Antes la etapa se podia mover sin que quedara
 *    quien, cuando ni desde donde.
 *  - Pasa por el candado de scripts/produccion.ts: contra una base remota exige
 *    `--produccion`.
 *  - Usa src/db en lugar de postgres.js directo. La version anterior le pasaba
 *    DATABASE_URL a postgres.js, que sin URL busca un Postgres en localhost: es
 *    decir que el script "para pruebas locales" solo funcionaba contra la base
 *    de produccion.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { bitacoraSistema, ediciones } from "../src/db/schema";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

const ETAPAS = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;
type Etapa = (typeof ETAPAS)[number];

/** Quien figura en la bitacora: el cambio no salio del panel sino de la consola. */
const AUTOR = "consola (scripts/cambiar-etapa)";

async function edicionActiva() {
  const [edicion] = await db
    .select({ id: ediciones.id, anio: ediciones.anio, etapa: ediciones.etapa })
    .from(ediciones)
    .where(eq(ediciones.activa, true))
    .limit(1);
  return edicion;
}

async function main() {
  const [pedida] = sinFlagProduccion(process.argv.slice(2));

  if (!pedida) {
    // Solo lectura: no hace falta el flag, pero se dice contra que base es.
    console.log(`Base: ${destinoDeLaBase(process.env.DATABASE_URL).descripcion}`);
    const edicion = await edicionActiva();
    console.log(
      edicion
        ? `edicion activa: ${edicion.anio} en etapa "${edicion.etapa}"`
        : "no hay ninguna edicion activa",
    );
    console.log(`etapas posibles: ${ETAPAS.join(", ")}`);
    return;
  }

  if (!ETAPAS.includes(pedida as Etapa)) {
    console.error(`Etapa desconocida: ${pedida}. Posibles: ${ETAPAS.join(", ")}`);
    process.exit(1);
  }
  const destino = pedida as Etapa;

  await exigirPermisoDeEscritura(`npx tsx scripts/cambiar-etapa.ts ${destino}`);

  const edicion = await edicionActiva();
  if (!edicion) {
    console.error("No hay ninguna edicion activa: no hay a que cambiarle la etapa.");
    process.exit(1);
  }

  // Sin cambio no se escribe, igual que en el panel: una fila de bitacora que
  // dice "de X a X" no audita nada.
  if (edicion.etapa === destino) {
    console.log(`La edicion ${edicion.anio} ya estaba en la etapa "${destino}".`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx.update(ediciones).set({ etapa: destino }).where(eq(ediciones.id, edicion.id));
    await tx.insert(bitacoraSistema).values({
      adminId: null,
      adminNombre: AUTOR,
      accion: "cambio_etapa",
      entidad: "edicion",
      entidadId: edicion.id,
      entidadEtiqueta: `Edición ${edicion.anio}`,
      valorAnterior: `Etapa ${edicion.etapa}`,
      valorNuevo: `Etapa ${destino}`,
    });
  });

  console.log(`edicion ${edicion.anio}: "${edicion.etapa}" -> "${destino}" (queda en la bitacora)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exit(1);
  });
