/**
 * Reglas de la votacion, probadas contra una base de verdad.
 *
 * Estas son las reglas de las que depende la legitimidad del resultado, y hasta
 * ahora no habia ni una prueba que las cubriera. El reglamento dice:
 *
 *   1. Un voto por persona por edicion.
 *   2. Se vota solo un proyecto del propio distrito.
 *   3. Se vota solo con la edicion en etapa de votacion.
 *
 * Las tres las verifica `src/app/api/votos/route.ts`, pero ese route handler lee
 * la sesion con `cookies()` de next/headers y no se puede invocar sin un contexto
 * de request. Asi que lo que se prueba aca es lo que queda cuando el codigo
 * falla: el respaldo de la BASE, que es la unica garantia que no se puede
 * saltear por un bug, un script suelto o una carga a mano.
 *
 * Lo que la base NO garantiza queda anotado abajo, en la prueba que lo dice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cargarMinimo,
  crearBaseDePrueba,
  crearIdea,
  crearVotante,
  violacionDe,
  type BaseDePrueba,
} from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;

test.before(async () => {
  base = await crearBaseDePrueba("votacion");
  const minimo = await cargarMinimo(base, { etapa: "votacion" });
  edicionId = minimo.edicionId;
});

test.after(async () => {
  await base.cerrar();
});

test("una persona no puede votar dos veces en la misma edicion", async () => {
  const votante = await crearVotante(base, { dni: "30111222", distrito: 1 });
  const ideaA = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Plaza del barrio",
    slug: "plaza-del-barrio",
  });
  const ideaB = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Luminarias",
    slug: "luminarias",
  });

  await base.db.insert(base.schema.votos).values({
    edicionId,
    votanteId: votante,
    ideaId: ideaA,
    distritoId: 1,
  });

  // El segundo voto tiene que rebotar contra el unique, incluso votando OTRA
  // idea: la regla es una persona un voto, no una persona un voto por proyecto.
  await assert.rejects(
    () =>
      base.db.insert(base.schema.votos).values({
        edicionId,
        votanteId: votante,
        ideaId: ideaB,
        distritoId: 1,
      }),
    violacionDe(/votos_una_persona_un_voto/i),
    "la base tiene que rechazar el segundo voto de la misma persona",
  );

  const filas = await base.consultar<{ n: number }>(
    base.sql`SELECT count(*)::int AS n FROM votos WHERE votante_id = ${votante}`,
  );
  assert.equal(Number(filas[0].n), 1, "tiene que quedar un solo voto");
});

test("la misma persona si puede votar en otra edicion", async () => {
  const [otra] = await base.db
    .insert(base.schema.ediciones)
    .values({ anio: 2027, etapa: "votacion", activa: false })
    .returning({ id: base.schema.ediciones.id });

  const votante = await crearVotante(base, { dni: "30333444", distrito: 1 });
  const ideaVieja = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Vereda nueva",
    slug: "vereda-nueva",
  });
  const ideaNueva = await crearIdea(base, {
    edicionId: otra.id,
    distrito: 1,
    titulo: "Vereda nueva 2027",
    slug: "vereda-nueva-2027",
  });

  await base.db.insert(base.schema.votos).values({
    edicionId,
    votanteId: votante,
    ideaId: ideaVieja,
    distritoId: 1,
  });
  await base.db.insert(base.schema.votos).values({
    edicionId: otra.id,
    votanteId: votante,
    ideaId: ideaNueva,
    distritoId: 1,
  });

  const filas = await base.consultar<{ n: number }>(
    base.sql`SELECT count(*)::int AS n FROM votos WHERE votante_id = ${votante}`,
  );
  assert.equal(Number(filas[0].n), 2, "el limite es por edicion, no absoluto");
});

test("el voto y el contador de la idea se mueven juntos o no se mueven", async () => {
  const votante = await crearVotante(base, { dni: "30555666", distrito: 2 });
  const idea = await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Playon deportivo",
    slug: "playon-deportivo",
  });

  // Igual que /api/votos: el insert del voto y el incremento del contador van
  // en UNA transaccion.
  await base.db.transaction(async (tx) => {
    await tx.insert(base.schema.votos).values({
      edicionId,
      votanteId: votante,
      ideaId: idea,
      distritoId: 2,
    });
    await tx.execute(base.sql`UPDATE ideas SET votos = votos + 1 WHERE id = ${idea}`);
  });

  let contador = await base.consultar<{ votos: number }>(
    base.sql`SELECT votos FROM ideas WHERE id = ${idea}`,
  );
  assert.equal(Number(contador[0].votos), 1, "el contador tiene que haber subido");

  // Y ahora al reves: si el voto rebota (misma persona), el contador NO puede
  // quedar inflado. Sin transaccion, este es el bug que deja el resultado mal.
  await assert.rejects(() =>
    base.db.transaction(async (tx) => {
      await tx.insert(base.schema.votos).values({
        edicionId,
        votanteId: votante,
        ideaId: idea,
        distritoId: 2,
      });
      await tx.execute(base.sql`UPDATE ideas SET votos = votos + 1 WHERE id = ${idea}`);
    }),
  );

  contador = await base.consultar<{ votos: number }>(
    base.sql`SELECT votos FROM ideas WHERE id = ${idea}`,
  );
  assert.equal(
    Number(contador[0].votos),
    1,
    "la transaccion fallida no puede dejar el contador inflado",
  );
});

test("la base NO impide votar un proyecto de otro distrito: esa regla es solo del codigo", async () => {
  const votante = await crearVotante(base, { dni: "30777888", distrito: 1 });
  const ideaDeOtroDistrito = await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Obra del distrito 2",
    slug: "obra-del-distrito-2",
  });

  // Esto ENTRA. No es un bug del esquema: el distrito de la persona vive en su
  // sesion y en `votantes.distrito_id`, y cruzarlo con el de la idea es una
  // decision de la aplicacion (/api/votos lo valida y devuelve 403).
  //
  // La prueba existe para dejar por escrito donde esta el limite: si alguien
  // carga votos con un script o desde la consola de Supabase, la base no lo va a
  // frenar. El dia que se quiera un respaldo real, hace falta un CHECK o un
  // trigger que compare votos.distrito_id con votantes.distrito_id.
  await base.db.insert(base.schema.votos).values({
    edicionId,
    votanteId: votante,
    ideaId: ideaDeOtroDistrito,
    distritoId: 2,
  });

  const filas = await base.consultar<{ n: number }>(
    base.sql`SELECT count(*)::int AS n FROM votos WHERE votante_id = ${votante}`,
  );
  assert.equal(Number(filas[0].n), 1, "queda registrado: la base lo acepta");
});

test("no puede haber dos ediciones activas a la vez", async () => {
  // La edicion 2026 ya esta activa (la cargo cargarMinimo).
  await assert.rejects(
    () =>
      base.db
        .insert(base.schema.ediciones)
        .values({ anio: 2028, etapa: "ideas", activa: true }),
    violacionDe(/ediciones_una_activa_idx/i),
    "el indice parcial tiene que rechazar la segunda edicion activa",
  );
});

test("el numero de idea no se repite dentro de una edicion", async () => {
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Idea numerada",
    slug: "idea-numerada",
    numero: 7,
  });

  await assert.rejects(
    () =>
      crearIdea(base, {
        edicionId,
        distrito: 1,
        titulo: "Otra idea con el mismo numero",
        slug: "otra-idea-mismo-numero",
        numero: 7,
      }),
    violacionDe(/ideas_edicion_numero_idx/i),
    "el numero es el identificador que el vecino ve: no puede repetirse",
  );
});

test("un distrito no puede tener dos proyectos ganadores", async () => {
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "El ganador del distrito 1",
    slug: "ganador-d1",
    estado: "ganador",
    ganador: true,
  });

  // Otro distrito si puede tener el suyo.
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "El ganador del distrito 2",
    slug: "ganador-d2",
    estado: "ganador",
    ganador: true,
  });

  // Pero un segundo ganador en el MISMO distrito tiene que rebotar.
  await assert.rejects(
    () =>
      crearIdea(base, {
        edicionId,
        distrito: 1,
        titulo: "Un segundo ganador del distrito 1",
        slug: "segundo-ganador-d1",
        estado: "ganador",
        ganador: true,
      }),
    violacionDe(/ideas_un_ganador_por_distrito_idx/i),
    "un distrito elige UN proyecto: es la regla central del programa",
  );
});

test("el indice de ganador solo mira las ganadoras, no estorba al resto", async () => {
  // Dos ideas NO ganadoras del mismo distrito no compiten por el par
  // (edicion, distrito): el indice es parcial.
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Perdedora A",
    slug: "perdedora-a",
    estado: "factible",
  });
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Perdedora B",
    slug: "perdedora-b",
    estado: "factible",
  });

  const filas = await base.consultar<{ n: number }>(
    base.sql`SELECT count(*)::int AS n FROM ideas WHERE distrito_id = 2 AND NOT ganador`,
  );
  assert.ok(Number(filas[0].n) >= 2, "varias ideas no ganadoras conviven en el distrito");
});
