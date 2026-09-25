/**
 * Que es "dato de prueba" antes del lanzamiento, y como se borra.
 *
 * La logica vive aca y la consola en scripts/limpiar-pruebas.ts, para poder
 * probarla contra una PGlite descartable (scripts/tests/limpieza-pruebas.test.ts)
 * sin tocar ninguna base de verdad.
 *
 * Que se considera de prueba
 * --------------------------
 * - Votantes del login de prueba: proveedor "dev" o sin verificar. Nunca son
 *   personas verificadas por CIDITUC. Los de CIDITUC (la gente del equipo que
 *   probo el ingreso real) solo entran con `incluirCidituc`, porque son
 *   personas reales y su fila es la unica prueba de su empadronamiento.
 * - Ideas CREADAS EN ESTE SITIO hasta la fecha de corte: las que no tienen
 *   rastro de migracion. OJO: no alcanza con el canal. Las 100 ideas 2025 se
 *   migraron con su canal real (89 "asamblea", 10 "municipio", 1 "migracion"),
 *   asi que "todo lo que no es web" se llevaba puestas 99 ideas reales. Lo que
 *   distingue a una migrada es que el ETL le deja `titulo_original` y
 *   `notas_migracion`; una cargada aca (formulario o panel) no tiene ninguno.
 * - Los votos de esos votantes o sobre esas ideas. Al borrar un voto se le
 *   resta al contador de la idea (`ideas.votos`), que es lo que muestra el
 *   sitio: sin eso, una idea real quedaba con un voto de prueba sumado.
 * - El registro del chat y los informes de impacto hasta la fecha de corte
 *   (todo lo que hubo es del equipo probando), y la tabla de limites por IP
 *   entera (es efimera).
 *
 * Que NO se toca nunca: las ediciones, los distritos, las cuentas del panel y
 * las tres bitacoras. Que alguien cambio la etapa en una demo es historia del
 * sistema, y la auditoria no se borra.
 */
import { eq, inArray, lte, or, sql } from "drizzle-orm";

type Consultar = <T extends Record<string, unknown>>(consulta: ReturnType<typeof sql>) => Promise<T[]>;

export type OpcionesLimpieza = {
  /** AAAA-MM-DD, inclusive. Sin fecha, ideas, chat e informes no se borran. */
  hasta: string | null;
  incluirCidituc: boolean;
};

export type VotantePrueba = {
  id: number;
  proveedor: string;
  verificado: boolean;
  distrito: number | null;
  creado: string;
  votos: number;
};

export type IdeaPrueba = {
  id: number;
  anio: number;
  numero: number | null;
  titulo: string;
  canal: string;
  estado: string;
  publicada: boolean;
  creada: string;
  votos: number;
};

export type PlanLimpieza = {
  opciones: OpcionesLimpieza;
  votantes: VotantePrueba[];
  ideas: IdeaPrueba[];
  /** Votos que se van (de los votantes de prueba o sobre las ideas de prueba). */
  votos: number;
  chat: number;
  informes: number;
  limites: number;
};

/** Una fecha AAAA-MM-DD valida, o null. */
export function fechaDeCorte(valor: string | undefined | null): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor ? null : valor;
}

/** Fin del dia de corte, en Tucuman (UTC-3): "hasta el 30" incluye el 30 entero. */
function finDelDia(fecha: string): string {
  return `${fecha}T23:59:59.999-03:00`;
}

/** Lee que se borraria. No escribe nada. */
export async function armarPlan(consultar: Consultar, opciones: OpcionesLimpieza): Promise<PlanLimpieza> {
  const votantes = await consultar<VotantePrueba>(sql`
    SELECT v.id, v.proveedor, v.verificado, v.distrito_id AS distrito,
           to_char(v.created_at, 'YYYY-MM-DD HH24:MI') AS creado,
           (SELECT count(*) FROM votos o WHERE o.votante_id = v.id)::int AS votos
      FROM votantes v
     WHERE v.proveedor = 'dev'
        OR NOT v.verificado
        OR (${opciones.incluirCidituc} AND v.proveedor = 'cidituc')
     ORDER BY v.id
  `);

  const ideas = opciones.hasta
    ? await consultar<IdeaPrueba>(sql`
        SELECT i.id, e.anio, i.numero, left(i.titulo, 60) AS titulo, i.canal, i.estado,
               i.publicada, to_char(i.created_at, 'YYYY-MM-DD HH24:MI') AS creada, i.votos
          FROM ideas i
          JOIN ediciones e ON e.id = i.edicion_id
         WHERE i.titulo_original IS NULL
           AND (i.notas_migracion IS NULL OR jsonb_array_length(i.notas_migracion) = 0)
           AND i.created_at <= ${finDelDia(opciones.hasta)}::timestamptz
         ORDER BY e.anio, i.numero
      `)
    : [];

  const idsVotantes = votantes.map((v) => v.id);
  const idsIdeas = ideas.map((i) => i.id);
  const [votos] = await consultar<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM votos
     WHERE votante_id = ANY(${`{${idsVotantes.join(",")}}`}::int[])
        OR idea_id = ANY(${`{${idsIdeas.join(",")}}`}::int[])
  `);

  const conCorte = async (tabla: "chat_consultas" | "informes_impacto") => {
    if (!opciones.hasta) return 0;
    const [fila] = await consultar<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM ${sql.identifier(tabla)}
       WHERE created_at <= ${finDelDia(opciones.hasta)}::timestamptz
    `);
    return Number(fila?.n ?? 0);
  };
  const [limites] = await consultar<{ n: number }>(sql`SELECT count(*)::int AS n FROM rate_limit`);

  return {
    opciones,
    votantes,
    ideas,
    votos: Number(votos?.n ?? 0),
    chat: await conCorte("chat_consultas"),
    informes: await conCorte("informes_impacto"),
    limites: Number(limites?.n ?? 0),
  };
}

export type ResultadoLimpieza = {
  votos: number;
  contadoresCorregidos: number;
  ideas: number;
  votantes: number;
  chat: number;
  informes: number;
  limites: number;
};

type BaseConTablas = {
  // Se tipa laxo a proposito: sirve igual con el db de la app y con el de las pruebas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
};

/**
 * Borra lo del plan, TODO en una transaccion: si algo falla no queda nada a
 * medias. Los ids salen del plan que la persona vio; la fecha de corte se
 * vuelve a aplicar adentro para el chat y los informes.
 */
export async function aplicarPlan({ db, schema }: BaseConTablas, plan: PlanLimpieza): Promise<ResultadoLimpieza> {
  const { votos, ideas, votantes, chatConsultas, informesImpacto, rateLimit } = schema;
  const idsVotantes = plan.votantes.map((v) => v.id);
  const idsIdeas = plan.ideas.map((i) => i.id);

  return db.transaction(async (tx: typeof db) => {
    const condiciones = [];
    if (idsVotantes.length) condiciones.push(inArray(votos.votanteId, idsVotantes));
    if (idsIdeas.length) condiciones.push(inArray(votos.ideaId, idsIdeas));
    const borrados: Array<{ ideaId: number }> = condiciones.length
      ? await tx.delete(votos).where(or(...condiciones)).returning({ ideaId: votos.ideaId })
      : [];

    // El contador de cada idea que sobrevive baja lo que se le borro.
    const porIdea = new Map<number, number>();
    for (const { ideaId } of borrados) {
      if (!idsIdeas.includes(ideaId)) porIdea.set(ideaId, (porIdea.get(ideaId) ?? 0) + 1);
    }
    for (const [ideaId, cantidad] of porIdea) {
      await tx
        .update(ideas)
        .set({ votos: sql`greatest(${ideas.votos} - ${cantidad}, 0)` })
        .where(eq(ideas.id, ideaId));
    }

    // Las revisiones, los informes y los avances de esas ideas se van en cascada.
    const ideasBorradas = idsIdeas.length
      ? await tx.delete(ideas).where(inArray(ideas.id, idsIdeas)).returning({ id: ideas.id })
      : [];
    const votantesBorrados = idsVotantes.length
      ? await tx.delete(votantes).where(inArray(votantes.id, idsVotantes)).returning({ id: votantes.id })
      : [];

    let chat = 0;
    let informes = 0;
    if (plan.opciones.hasta) {
      const corte = new Date(finDelDia(plan.opciones.hasta));
      chat = (await tx.delete(chatConsultas).where(lte(chatConsultas.createdAt, corte)).returning({ id: chatConsultas.id })).length;
      informes = (await tx.delete(informesImpacto).where(lte(informesImpacto.createdAt, corte)).returning({ id: informesImpacto.id })).length;
    }
    const limites = (await tx.delete(rateLimit).returning({ clave: rateLimit.clave })).length;

    return {
      votos: borrados.length,
      contadoresCorregidos: porIdea.size,
      ideas: ideasBorradas.length,
      votantes: votantesBorrados.length,
      chat,
      informes,
      limites,
    };
  });
}
