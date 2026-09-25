/**
 * Cambia la etapa de la edicion activa desde la terminal.
 *
 * El camino normal es /admin/ediciones. Esto es para pruebas locales:
 *
 *   npx tsx scripts/cambiar-etapa.ts                    -> muestra la etapa actual
 *   npx tsx scripts/cambiar-etapa.ts votacion           -> la cambia
 *   npx tsx scripts/cambiar-etapa.ts votacion --forzar  -> ver abajo
 *
 * Cuatro cosas cambiaron respecto de la version anterior, todas por el mismo
 * motivo (esto mueve lo que ve todo el sitio: pasar a "votacion" abre la
 * votacion publica):
 *
 *  - Deja rastro en `bitacora_sistema`, igual que `cambiarEtapa` del panel
 *    (src/app/admin/acciones.ts): mismo formato de fila, en la misma
 *    transaccion que el UPDATE. Antes la etapa se podia mover sin que quedara
 *    quien, cuando ni desde donde.
 *  - Aplica la MISMA politica que el panel (`puedeCambiarEtapa`, en
 *    src/lib/etapas.ts), con la edicion bloqueada y los votos y ganadores
 *    contados dentro de la transaccion. Si no, la consola seria la puerta de
 *    atras para lo que el panel no deja: reabrir una votacion con ganadores
 *    proclamados, o volver a "ideas" con votos emitidos.
 *  - Pasa por el candado de scripts/produccion.ts: contra una base remota exige
 *    `--produccion`.
 *  - Usa src/db en lugar de postgres.js directo. La version anterior le pasaba
 *    DATABASE_URL a postgres.js, que sin URL busca un Postgres en localhost: es
 *    decir que el script "para pruebas locales" solo funcionaba contra la base
 *    de produccion.
 *
 * `--forzar` saltea la politica, y SOLO con una base local. Existe porque los
 * datos de prueba traen la edicion 2025 con sus 19 ganadores, y con la politica
 * no se podria volver a abrir su votacion para probar el flujo del vecino.
 * Contra una base remota se rechaza aunque venga `--produccion`.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { bitacoraSistema, ediciones, ideas, votos } from "../src/db/schema";
import { ETAPAS, esEtapa, puedeCambiarEtapa, votosDeLaEdicion, type Etapa } from "../src/lib/etapas";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

/** Quien figura en la bitacora: el cambio no salio del panel sino de la consola. */
const AUTOR = "consola (scripts/cambiar-etapa)";
const FLAG_FORZAR = "--forzar";

async function edicionActiva() {
  const [edicion] = await db
    .select({ id: ediciones.id, anio: ediciones.anio, etapa: ediciones.etapa })
    .from(ediciones)
    .where(eq(ediciones.activa, true))
    .limit(1);
  return edicion;
}

/** Se tiran adentro de la transaccion para que no escriba nada. */
class Rechazo extends Error {}
/** No es un error: la edicion ya estaba en esa etapa (sale con codigo 0). */
class SinCambio extends Error {}

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));
  const forzar = argumentos.includes(FLAG_FORZAR);
  const [pedida] = argumentos.filter((a) => a !== FLAG_FORZAR);

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

  if (!esEtapa(pedida)) {
    console.error(`Etapa desconocida: ${pedida}. Posibles: ${ETAPAS.join(", ")}`);
    process.exit(1);
  }
  const destino: Etapa = pedida;

  const { destino: base } = await exigirPermisoDeEscritura(
    `npx tsx scripts/cambiar-etapa.ts ${destino}${forzar ? ` ${FLAG_FORZAR}` : ""}`,
  );
  if (forzar && base.tipo !== "pglite" && base.tipo !== "postgres-local") {
    console.error(
      `${FLAG_FORZAR} solo vale con una base local, y esta es: ${base.descripcion}. ` +
        "Contra produccion la etapa se cambia desde /admin/ediciones, con las reglas del panel.",
    );
    process.exit(1);
  }

  const activa = await edicionActiva();
  if (!activa) {
    console.error("No hay ninguna edicion activa: no hay a que cambiarle la etapa.");
    process.exit(1);
  }

  let anterior: string;
  try {
    anterior = await db.transaction(async (tx) => {
      // La misma lectura que `cambiarEtapa` del panel: la edicion bloqueada y
      // las cuentas adentro, para que un voto o una proclamacion que entra en
      // el medio no cambie la respuesta de la politica.
      const [edicion] = await tx
        .select({ anio: ediciones.anio, etapa: ediciones.etapa })
        .from(ediciones)
        .where(eq(ediciones.id, activa.id))
        .for("update");
      if (!edicion) throw new Rechazo("La edicion activa dejo de existir.");

      // Sin cambio no se escribe, igual que en el panel: una fila de bitacora
      // que dice "de X a X" no audita nada.
      if (edicion.etapa === destino) {
        throw new SinCambio(`La edicion ${edicion.anio} ya estaba en la etapa "${destino}".`);
      }

      if (!forzar) {
        const [emitidos] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(votos)
          .where(eq(votos.edicionId, activa.id));
        const [enIdeas] = await tx
          .select({
            votos: sql<number>`coalesce(sum(${ideas.votos}), 0)::int`,
            ganadores: sql<number>`count(*) FILTER (WHERE ${ideas.ganador})::int`,
          })
          .from(ideas)
          .where(eq(ideas.edicionId, activa.id));
        const veredicto = puedeCambiarEtapa(edicion.etapa, destino, {
          votos: votosDeLaEdicion(Number(emitidos?.total ?? 0), Number(enIdeas?.votos ?? 0)),
          ganadores: Number(enIdeas?.ganadores ?? 0),
        });
        if (!veredicto.permitido) {
          throw new Rechazo(
            `${veredicto.motivo}\n(En una base local se puede saltear con ${FLAG_FORZAR}.)`,
          );
        }
      }

      await tx.update(ediciones).set({ etapa: destino }).where(eq(ediciones.id, activa.id));
      await tx.insert(bitacoraSistema).values({
        adminId: null,
        adminNombre: forzar ? `${AUTOR}, forzado` : AUTOR,
        accion: "cambio_etapa",
        entidad: "edicion",
        entidadId: activa.id,
        entidadEtiqueta: `Edición ${edicion.anio}`,
        valorAnterior: `Etapa ${edicion.etapa}`,
        valorNuevo: `Etapa ${destino}`,
      });
      return edicion.etapa;
    });
  } catch (causa) {
    if (causa instanceof SinCambio) {
      console.log(causa.message);
      process.exit(0);
    }
    if (causa instanceof Rechazo) {
      console.error(causa.message);
      process.exit(1);
    }
    throw causa;
  }

  console.log(
    `edicion ${activa.anio}: "${anterior}" -> "${destino}"${forzar ? " (forzado)" : ""} (queda en la bitacora)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exit(1);
  });
