/**
 * Cambia las fechas de la edicion activa desde la terminal.
 *
 * El panel ya no tiene la pantalla de fechas (se saco para simplificarlo: la
 * presentacion y la votacion se abren y cierran con los interruptores), pero el
 * sitio y Migue siguen anunciando `ideas_hasta`, `votacion_desde` y
 * `votacion_hasta`. Cuando el programa corre un plazo, se cambian aca:
 *
 *   npx tsx scripts/cambiar-fechas.ts                              -> muestra las fechas
 *   npx tsx scripts/cambiar-fechas.ts --ideas-hasta 2026-12-04     -> cambia una
 *   npx tsx scripts/cambiar-fechas.ts --votacion-desde vacia       -> la borra
 *
 * Opciones: --ideas-desde, --ideas-hasta, --votacion-desde, --votacion-hasta,
 * cada una con una fecha AAAA-MM-DD o `vacia` (el sitio deja de anunciarla).
 *
 * Como `guardarEdicion` del panel (src/app/admin/acciones.ts): valida que cada
 * tramo no termine antes de empezar y deja la fila "edicion_editada" en
 * `bitacora_sistema`, en la misma transaccion. Pasa por el candado de
 * scripts/produccion.ts: contra una base remota exige `--produccion`.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { bitacoraSistema, ediciones } from "../src/db/schema";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

const AUTOR = "consola (scripts/cambiar-fechas)";

const OPCIONES = {
  "--ideas-desde": "ideasDesde",
  "--ideas-hasta": "ideasHasta",
  "--votacion-desde": "votacionDesde",
  "--votacion-hasta": "votacionHasta",
} as const;
type Campo = (typeof OPCIONES)[keyof typeof OPCIONES];
type Fechas = Record<Campo, string | null>;

function fechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [anio, mes, dia] = texto.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function resumen(f: Fechas): string {
  const t = (v: string | null) => v ?? "sin fecha";
  return `Ideas: ${t(f.ideasDesde)} → ${t(f.ideasHasta)} · Votación: ${t(f.votacionDesde)} → ${t(f.votacionHasta)}`;
}

/** Lee `--opcion valor` de los argumentos; corta con un mensaje si algo no cierra. */
function leerPedido(argumentos: string[]): Partial<Fechas> {
  const pedido: Partial<Fechas> = {};
  for (let i = 0; i < argumentos.length; i += 2) {
    const opcion = argumentos[i];
    const valor = argumentos[i + 1];
    if (!(opcion in OPCIONES)) {
      throw new Error(`Opcion desconocida: ${opcion}. Posibles: ${Object.keys(OPCIONES).join(", ")}`);
    }
    if (valor === undefined) throw new Error(`Falta el valor de ${opcion}.`);
    if (valor !== "vacia" && !fechaValida(valor)) {
      throw new Error(`${opcion}: "${valor}" no es una fecha AAAA-MM-DD que exista (o "vacia").`);
    }
    pedido[OPCIONES[opcion as keyof typeof OPCIONES]] = valor === "vacia" ? null : valor;
  }
  return pedido;
}

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));
  const pedido = leerPedido(argumentos);

  const columnas = {
    id: ediciones.id,
    anio: ediciones.anio,
    etapa: ediciones.etapa,
    ideasDesde: ediciones.ideasDesde,
    ideasHasta: ediciones.ideasHasta,
    votacionDesde: ediciones.votacionDesde,
    votacionHasta: ediciones.votacionHasta,
  };

  if (Object.keys(pedido).length === 0) {
    // Solo lectura: no hace falta el flag, pero se dice contra que base es.
    console.log(`Base: ${destinoDeLaBase(process.env.DATABASE_URL).descripcion}`);
    const [activa] = await db.select(columnas).from(ediciones).where(eq(ediciones.activa, true));
    console.log(activa ? `etapa "${activa.etapa}" · ${resumen(activa)}` : "no hay edicion activa");
    return;
  }

  await exigirPermisoDeEscritura(`npx tsx scripts/cambiar-fechas.ts ${argumentos.join(" ")}`);

  const resultado = await db.transaction(async (tx) => {
    const [edicion] = await tx
      .select(columnas)
      .from(ediciones)
      .where(eq(ediciones.activa, true))
      .for("update");
    if (!edicion) throw new Error("No hay ninguna edicion activa.");

    const antes: Fechas = {
      ideasDesde: edicion.ideasDesde,
      ideasHasta: edicion.ideasHasta,
      votacionDesde: edicion.votacionDesde,
      votacionHasta: edicion.votacionHasta,
    };
    const despues: Fechas = { ...antes, ...pedido };

    // Las fechas ISO se comparan como texto sin ambiguedad.
    if (despues.ideasDesde && despues.ideasHasta && despues.ideasDesde > despues.ideasHasta) {
      throw new Error("La presentación de ideas no puede terminar antes de empezar.");
    }
    if (despues.votacionDesde && despues.votacionHasta && despues.votacionDesde > despues.votacionHasta) {
      throw new Error("La votación no puede terminar antes de empezar.");
    }
    if (resumen(antes) === resumen(despues)) return { antes, despues, cambio: false };

    await tx.update(ediciones).set(despues).where(eq(ediciones.id, edicion.id));
    await tx.insert(bitacoraSistema).values({
      adminId: null,
      adminNombre: AUTOR,
      accion: "edicion_editada",
      entidad: "edicion",
      entidadId: edicion.id,
      entidadEtiqueta: `Edición ${edicion.anio}`,
      valorAnterior: resumen(antes),
      valorNuevo: resumen(despues),
    });
    return { antes, despues, cambio: true };
  });

  if (!resultado.cambio) {
    console.log(`Sin cambios: ${resumen(resultado.antes)}`);
    return;
  }
  console.log(`antes:   ${resumen(resultado.antes)}`);
  console.log(`despues: ${resumen(resultado.despues)} (queda en la bitacora)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exit(1);
  });
