/**
 * Lleva a la base los textos del sitio y las preguntas frecuentes de
 * data/contenido-sitio.json, y el texto oficial del reglamento de
 * data/reglamento.txt (clave `reglamento-cuerpo`).
 *
 * El panel no edita esos textos (ver CLAUDE.md): se cambian en los archivos,
 * se revisan en el PR y se aplican con esto. El seed no sirve para eso: no pisa
 * un texto que ya existe.
 *
 *   npx tsx scripts/aplicar-contenido.ts                 -> muestra que cambiaria
 *   npx tsx scripts/aplicar-contenido.ts --confirmar     -> lo escribe
 *
 * Solo toca los textos que difieren, y las preguntas por su orden (la 1 del
 * archivo con la de orden 1 de la base). No borra textos ni preguntas que la
 * base tenga de mas: los muestra. Cada cambio deja su fila en
 * `bitacora_sistema`, en la misma transaccion. Contra una base remota exige
 * `--produccion` (scripts/produccion.ts).
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { readFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { db } from "../src/db";
import { bitacoraSistema, faq, textos } from "../src/db/schema";
import { destinoDeLaBase, exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

const AUTOR = "consola (scripts/aplicar-contenido)";
const FLAG_CONFIRMAR = "--confirmar";

type Contenido = {
  textos: Record<string, string>;
  faq: Array<{ pregunta: string; respuesta: string }>;
};

/** Lo que va a la bitacora: un texto largo se resume, la fila no es un archivo. */
function resumen(texto: string | null | undefined): string | null {
  if (texto == null) return null;
  return texto.length > 300 ? `${texto.slice(0, 297)}… (${texto.length} caracteres)` : texto;
}

async function main() {
  const argumentos = sinFlagProduccion(process.argv.slice(2));
  const confirmar = argumentos.includes(FLAG_CONFIRMAR);

  const contenido = JSON.parse(readFileSync("data/contenido-sitio.json", "utf8")) as Contenido;
  const deseados: Record<string, string> = {
    ...contenido.textos,
    "reglamento-cuerpo": readFileSync("data/reglamento.txt", "utf8"),
  };

  if (confirmar) {
    await exigirPermisoDeEscritura(`npx tsx scripts/aplicar-contenido.ts ${FLAG_CONFIRMAR}`);
  } else {
    console.log(`Base: ${destinoDeLaBase(process.env.DATABASE_URL).descripcion} (solo lectura)`);
  }

  const resultado = await db.transaction(async (tx) => {
    const actuales = new Map(
      (await tx.select({ clave: textos.clave, valor: textos.valor }).from(textos)).map((t) => [
        t.clave,
        t.valor,
      ]),
    );
    const textosQueCambian = Object.entries(deseados).filter(
      ([clave, valor]) => actuales.get(clave) !== valor,
    );
    const textosDeMas = [...actuales.keys()].filter((clave) => !(clave in deseados));

    const preguntas = await tx.select().from(faq).orderBy(asc(faq.orden));
    const porOrden = new Map(preguntas.map((p) => [p.orden, p]));
    const faqQueCambia = contenido.faq
      .map((item, indice) => ({ orden: indice + 1, ...item, actual: porOrden.get(indice + 1) }))
      .filter(
        (p) => !p.actual || p.actual.pregunta !== p.pregunta || p.actual.respuesta !== p.respuesta,
      );
    const faqDeMas = preguntas.filter((p) => p.orden > contenido.faq.length);

    for (const [clave, valor] of textosQueCambian) {
      console.log(`\n[texto] ${clave}`);
      console.log(`  antes:   ${resumen(actuales.get(clave)) ?? "(no existe)"}`);
      console.log(`  despues: ${resumen(valor)}`);
    }
    for (const p of faqQueCambia) {
      console.log(`\n[pregunta ${p.orden}]`);
      console.log(`  antes:   ${p.actual ? `${p.actual.pregunta} — ${resumen(p.actual.respuesta)}` : "(no existe)"}`);
      console.log(`  despues: ${p.pregunta} — ${resumen(p.respuesta)}`);
    }
    if (textosDeMas.length) console.log(`\nTextos en la base que no estan en el archivo (no se tocan): ${textosDeMas.join(", ")}`);
    if (faqDeMas.length) console.log(`Preguntas de mas en la base (no se tocan): ${faqDeMas.map((p) => p.pregunta).join(" | ")}`);

    if (!confirmar) return { textos: textosQueCambian.length, faq: faqQueCambia.length, escrito: false };

    for (const [clave, valor] of textosQueCambian) {
      await tx
        .insert(textos)
        .values({ clave, valor })
        .onConflictDoUpdate({ target: textos.clave, set: { valor, updatedAt: new Date() } });
      await tx.insert(bitacoraSistema).values({
        adminId: null,
        adminNombre: AUTOR,
        accion: "texto_guardado",
        entidad: "texto",
        entidadId: null,
        entidadEtiqueta: clave,
        valorAnterior: resumen(actuales.get(clave)),
        valorNuevo: resumen(valor),
      });
    }
    for (const p of faqQueCambia) {
      if (p.actual) {
        await tx
          .update(faq)
          .set({ pregunta: p.pregunta, respuesta: p.respuesta })
          .where(eq(faq.id, p.actual.id));
      } else {
        await tx.insert(faq).values({ orden: p.orden, pregunta: p.pregunta, respuesta: p.respuesta });
      }
      await tx.insert(bitacoraSistema).values({
        adminId: null,
        adminNombre: AUTOR,
        accion: "faq_guardada",
        entidad: "faq",
        entidadId: p.actual?.id ?? null,
        entidadEtiqueta: p.pregunta,
        valorAnterior: p.actual ? resumen(`${p.actual.pregunta} — ${p.actual.respuesta}`) : null,
        valorNuevo: resumen(`${p.pregunta} — ${p.respuesta}`),
      });
    }
    return { textos: textosQueCambian.length, faq: faqQueCambia.length, escrito: true };
  });

  console.log(
    `\n${resultado.textos} textos y ${resultado.faq} preguntas ${
      resultado.escrito ? "actualizados (quedan en la bitacora)" : `por cambiar. Para escribirlos: ${FLAG_CONFIRMAR}`
    }.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e?.message ?? e);
    process.exit(1);
  });
