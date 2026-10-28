/**
 * Que contactos borra `npm run purgar-contactos`, y como.
 *
 * La logica vive aca y la consola en scripts/purgar-contactos.ts, para poder
 * probarla contra una PGlite descartable (scripts/tests/purgar-contactos.test.ts)
 * sin tocar ninguna base de verdad. Este modulo no importa src/db ni carga el
 * entorno: recibe la funcion de consulta.
 *
 * Hay dos usos, y no se confunden:
 *
 * - La purga por edicion (sin --idea): borra el contacto de TODAS las ideas de
 *   las ediciones cerradas, o de la edicion de --anio. Es la que cumple lo que
 *   promete /privacidad (el contacto se borra cuando cierra la edicion).
 * - La supresion de una persona (--anio + --idea): borra el contacto de UNA
 *   idea, la que nombra el pedido que llega por /privacidad (seccion 6). El
 *   numero de idea se repite entre ediciones, por eso pide el anio.
 *
 * Antes --anio solo se presentaba como la herramienta para un pedido de
 * supresion puntual, y borraba el nombre de todos los autores de la edicion,
 * en cualquier etapa: con la edicion abierta, el equipo se quedaba sin saber
 * quien presento cada idea justo cuando las evalua, sin vuelta atras. Por eso
 * --anio sin --idea se niega con una edicion que no esta cerrada, salvo que se
 * lo pida con --edicion-entera, y la condicion del UPDATE repite esa regla: si
 * la etapa cambia entre la vista previa y la escritura, no se pasa de largo.
 */
import { sql, type SQL } from "drizzle-orm";

type Consultar = <T extends Record<string, unknown>>(consulta: SQL) => Promise<T[]>;

export type OpcionesPurga = {
  /** Sin anio: las ediciones cerradas. */
  anio: number | null;
  /** Numero de la idea dentro de la edicion de `anio`: un pedido de supresion. */
  idea: number | null;
  /** Con `anio` y sin `idea`: purgar toda una edicion que todavia no cerro. */
  edicionEntera: boolean;
};

export type LecturaDeOpciones =
  | { ok: true; opciones: OpcionesPurga; confirmar: boolean }
  | { ok: false; error: string };

export type EdicionAlcanzada = { anio: number; etapa: string; conContacto: number };

export type IdeaAlcanzada = {
  id: number;
  numero: number;
  titulo: string;
  estado: string;
  /** Tiene nombre o correo sin purgar: lo que el UPDATE borraria. */
  conContacto: boolean;
  /** Se presento ingresando con CIDITUC: el nombre tambien esta en el padron. */
  conVotante: boolean;
};

export type PlanPurga = {
  opciones: OpcionesPurga;
  ediciones: EdicionAlcanzada[];
  /** Solo con --idea: la fila del pedido, para que quien lo corre la reconozca. */
  idea: IdeaAlcanzada | null;
  /** Ideas a las que se les borraria el contacto. */
  total: number;
  /** Por que no se hace, si no se hace. Con negativa no se escribe nada. */
  negativa: string | null;
};

/** Un entero positivo escrito tal cual (`--anio 2025`, `--idea 12`), o null. */
function enteroPositivo(valor: string | undefined): number | null {
  if (!valor || !/^\d{1,9}$/.test(valor)) return null;
  const numero = Number(valor);
  return numero > 0 ? numero : null;
}

/** Lee los argumentos (ya sin --produccion). No toca la base. */
export function leerOpciones(argumentos: readonly string[]): LecturaDeOpciones {
  const valorDe = (flag: string): string | null => {
    const indice = argumentos.indexOf(flag);
    return indice === -1 ? null : (argumentos[indice + 1] ?? "");
  };

  const textoAnio = valorDe("--anio");
  const textoIdea = valorDe("--idea");
  const edicionEntera = argumentos.includes("--edicion-entera");
  const confirmar = argumentos.includes("--confirmar");

  const anio = textoAnio === null ? null : enteroPositivo(textoAnio);
  if (textoAnio !== null && (anio === null || anio < 2000 || anio > 2100)) {
    return { ok: false, error: "El valor de --anio tiene que ser un año, por ejemplo: --anio 2025" };
  }

  const idea = textoIdea === null ? null : enteroPositivo(textoIdea);
  if (textoIdea !== null && idea === null) {
    return { ok: false, error: "El valor de --idea tiene que ser el numero de la idea, por ejemplo: --idea 12" };
  }
  if (idea !== null && anio === null) {
    return {
      ok: false,
      error:
        "--idea necesita --anio: el numero de idea se repite entre ediciones.\n" +
        "Por ejemplo: npm run purgar-contactos -- --anio 2026 --idea 12",
    };
  }
  if (edicionEntera && (anio === null || idea !== null)) {
    return {
      ok: false,
      error: "--edicion-entera va solo con --anio (y sin --idea): es para purgar toda esa edicion.",
    };
  }

  return { ok: true, opciones: { anio, idea, edicionEntera }, confirmar };
}

/**
 * El universo de la purga, como condicion sobre `ideas i` y `ediciones e`. La
 * misma para contar y para borrar: lo que se muestra es lo que se escribe.
 */
function condicionDe(opciones: OpcionesPurga): SQL {
  if (opciones.anio === null) return sql`e.etapa = 'cerrada'`;
  if (opciones.idea !== null) return sql`e.anio = ${opciones.anio} AND i.numero = ${opciones.idea}`;
  if (opciones.edicionEntera) return sql`e.anio = ${opciones.anio}`;
  return sql`e.anio = ${opciones.anio} AND e.etapa = 'cerrada'`;
}

/** Lee que se borraria. No escribe nada. */
export async function armarPurga(consultar: Consultar, opciones: OpcionesPurga): Promise<PlanPurga> {
  const plan: PlanPurga = { opciones, ediciones: [], idea: null, total: 0, negativa: null };

  if (opciones.anio !== null) {
    const [edicion] = await consultar<{ etapa: string }>(sql`
      SELECT etapa FROM ediciones WHERE anio = ${opciones.anio}
    `);
    if (!edicion) return { ...plan, negativa: `La edicion ${opciones.anio} no existe.` };

    if (opciones.idea === null && !opciones.edicionEntera && edicion.etapa !== "cerrada") {
      return {
        ...plan,
        negativa: [
          `La edicion ${opciones.anio} esta en etapa "${edicion.etapa}", no cerrada.`,
          "Borrar ahora el contacto de todas sus ideas deja al equipo sin saber quien",
          "presento cada una, y no se puede deshacer.",
          "",
          "Para un pedido de supresion de una persona, nombrá su idea:",
          `  npm run purgar-contactos -- --anio ${opciones.anio} --idea <numero>`,
          "",
          "Si de verdad hay que purgar toda la edicion antes de cerrarla, agregá",
          "--edicion-entera.",
        ].join("\n"),
      };
    }
  }

  const condicion = condicionDe(opciones);

  if (opciones.idea !== null) {
    const [fila] = await consultar<{
      id: number;
      numero: number;
      titulo: string;
      estado: string;
      con_contacto: boolean;
      con_votante: boolean;
    }>(sql`
      SELECT i.id, i.numero, left(i.titulo, 80) AS titulo, i.estado,
             (i.contacto_purgado_en IS NULL
               AND (i.autor_email IS NOT NULL OR i.autor_nombre IS NOT NULL)) AS con_contacto,
             i.votante_id IS NOT NULL AS con_votante
        FROM ideas i
        JOIN ediciones e ON e.id = i.edicion_id
       WHERE ${condicion}
    `);
    if (!fila) {
      return { ...plan, negativa: `La edicion ${opciones.anio} no tiene una idea #${opciones.idea}.` };
    }
    plan.idea = {
      id: Number(fila.id),
      numero: Number(fila.numero),
      titulo: fila.titulo,
      estado: fila.estado,
      conContacto: Boolean(fila.con_contacto),
      conVotante: Boolean(fila.con_votante),
    };
  }

  const ediciones = await consultar<{ anio: number; etapa: string; con_contacto: number }>(sql`
    SELECT e.anio,
           e.etapa,
           count(*) FILTER (
             WHERE i.contacto_purgado_en IS NULL
               AND (i.autor_email IS NOT NULL OR i.autor_nombre IS NOT NULL)
           )::int AS con_contacto
      FROM ediciones e
      JOIN ideas i ON i.edicion_id = e.id
     WHERE ${condicion}
     GROUP BY e.anio, e.etapa
     ORDER BY e.anio
  `);
  plan.ediciones = ediciones.map((fila) => ({
    anio: Number(fila.anio),
    etapa: fila.etapa,
    conContacto: Number(fila.con_contacto),
  }));
  plan.total = plan.ediciones.reduce((suma, fila) => suma + fila.conContacto, 0);
  return plan;
}

/**
 * Borra el contacto del universo de `opciones`. Devuelve los ids purgados.
 *
 * Deja `votante_id` como esta: es el vinculo con el padron, no un dato de
 * contacto, y el nombre que guarda `votantes` no es de esta purga. Si un pedido
 * de supresion tiene que alcanzar tambien al padron es otra decision.
 */
export async function aplicarPurga(consultar: Consultar, opciones: OpcionesPurga): Promise<number[]> {
  const borradas = await consultar<{ id: number }>(sql`
    UPDATE ideas i
       SET autor_email = NULL,
           autor_nombre = NULL,
           autor_avisos = false,
           contacto_purgado_en = now(),
           updated_at = now()
      FROM ediciones e
     WHERE e.id = i.edicion_id
       AND ${condicionDe(opciones)}
       AND i.contacto_purgado_en IS NULL
       AND (i.autor_email IS NOT NULL OR i.autor_nombre IS NOT NULL)
    RETURNING i.id
  `);
  return borradas.map((fila) => Number(fila.id));
}
