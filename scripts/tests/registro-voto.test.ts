/**
 * La transaccion del voto (src/app/api/votos/registrar.ts), probada contra una
 * base de verdad.
 *
 * /api/votos controla la etapa y la idea con lecturas comunes y despues abre
 * la transaccion. Si el equipo cierra la votacion o saca la idea de la boleta
 * en ese instante, el control ya paso: lo que lo frena es que la transaccion
 * vuelva a mirar antes del INSERT. Estas pruebas arman exactamente eso, el
 * mundo que cambio DESPUES del control, y verifican que el voto no entre y que
 * el contador no se mueva.
 *
 * Lo que no se prueba aca es la espera entre dos transacciones a la vez (el
 * voto frenado por el UPDATE de la etapa): PGlite atiende de a una, asi que
 * nunca se solapan. Eso lo garantiza el bloqueo, y esta explicado en el
 * comentario de registrar.ts.
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
let registrar: typeof import("../../src/app/api/votos/registrar");

test.before(async () => {
  base = await crearBaseDePrueba("registro-voto");
  const minimo = await cargarMinimo(base, { etapa: "votacion" });
  edicionId = minimo.edicionId;
  // Despues de crear la base: src/db elige el driver al importarse.
  registrar = await import("../../src/app/api/votos/registrar");
});

test.after(async () => {
  await base.cerrar();
});

/** Votos registrados y contador de la idea, para afirmar que nada se movio. */
async function estadoDe(ideaId: number) {
  const [fila] = await base.consultar<{ votos: number; filas: number }>(base.sql`
    SELECT i.votos,
           (SELECT count(*)::int FROM votos v WHERE v.idea_id = i.id) AS filas
      FROM ideas i
     WHERE i.id = ${ideaId}
  `);
  return { contador: Number(fila.votos), filas: Number(fila.filas) };
}

/** Pone la edicion como estaba si una prueba la toco, pase lo que pase. */
async function conEdicion(
  cambios: { etapa?: "evaluacion" | "votacion"; activa?: boolean },
  prueba: () => Promise<void>,
) {
  const { ediciones } = base.schema;
  const { eq } = await import("drizzle-orm");
  await base.db.update(ediciones).set(cambios).where(eq(ediciones.id, edicionId));
  try {
    await prueba();
  } finally {
    await base.db
      .update(ediciones)
      .set({ etapa: "votacion", activa: true })
      .where(eq(ediciones.id, edicionId));
  }
}

test("con todo en regla el voto entra y el contador sube", async () => {
  const votanteId = await crearVotante(base, { dni: "40111222", distrito: 1 });
  const ideaId = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Plaza de juegos",
    slug: "plaza-de-juegos",
  });

  const resultado = await registrar.registrarVoto({
    edicionId,
    votanteId,
    ideaId,
    distritoId: 1,
    ipHash: "prueba",
  });

  assert.deepEqual(resultado, { ok: true });
  assert.deepEqual(await estadoDe(ideaId), { contador: 1, filas: 1 });
});

test("si la votacion se cerro despues del control, el voto no entra", async () => {
  const votanteId = await crearVotante(base, { dni: "40333444", distrito: 1 });
  const ideaId = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Cordon cuneta",
    slug: "cordon-cuneta",
  });

  // Es el caso de la nota: el panel vuelve la votacion atras (o la cierra)
  // entre el control de la ruta y la transaccion.
  await conEdicion({ etapa: "evaluacion" }, async () => {
    const resultado = await registrar.registrarVoto({
      edicionId,
      votanteId,
      ideaId,
      distritoId: 1,
      ipHash: "prueba",
    });
    assert.deepEqual(resultado, { ok: false, motivo: "votacion-cerrada" });
  });

  assert.deepEqual(await estadoDe(ideaId), { contador: 0, filas: 0 });
});

test("si la edicion dejo de ser la activa, tampoco entra aunque diga votacion", async () => {
  const votanteId = await crearVotante(base, { dni: "40555666", distrito: 1 });
  const ideaId = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Refugio de colectivo",
    slug: "refugio-de-colectivo",
  });

  await conEdicion({ activa: false }, async () => {
    const resultado = await registrar.registrarVoto({
      edicionId,
      votanteId,
      ideaId,
      distritoId: 1,
      ipHash: "prueba",
    });
    assert.deepEqual(resultado, { ok: false, motivo: "votacion-cerrada" });
  });

  assert.deepEqual(await estadoDe(ideaId), { contador: 0, filas: 0 });
});

test("si la idea salio de la boleta despues del control, el voto no entra", async () => {
  const votanteId = await crearVotante(base, { dni: "40777888", distrito: 1 });
  const { eq } = await import("drizzle-orm");
  const { ideas } = base.schema;

  // Tres maneras de salir de la boleta: dejar de ser factible, despublicarse y
  // mudarse de distrito (el control de la ruta se hizo contra el distrito viejo).
  const casos: Array<[nombre: string, cambio: Partial<typeof ideas.$inferInsert>]> = [
    ["no factible", { estado: "no_factible" }],
    ["despublicada", { publicada: false }],
    ["de otro distrito", { distritoId: 2 }],
  ];

  for (const [nombre, cambio] of casos) {
    const ideaId = await crearIdea(base, {
      edicionId,
      distrito: 1,
      titulo: `Idea ${nombre}`,
      slug: `idea-${nombre.replaceAll(" ", "-")}`,
    });
    await base.db.update(ideas).set(cambio).where(eq(ideas.id, ideaId));

    const resultado = await registrar.registrarVoto({
      edicionId,
      votanteId,
      ideaId,
      distritoId: 1,
      ipHash: "prueba",
    });
    assert.deepEqual(resultado, { ok: false, motivo: "proyecto-no-disponible" }, nombre);
    assert.deepEqual(await estadoDe(ideaId), { contador: 0, filas: 0 }, nombre);
  }

  // Y la persona sigue pudiendo votar otra: el rechazo no le gasto el voto.
  const otra = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Idea que sigue en la boleta",
    slug: "idea-que-sigue",
  });
  const resultado = await registrar.registrarVoto({
    edicionId,
    votanteId,
    ideaId: otra,
    distritoId: 1,
    ipHash: "prueba",
  });
  assert.deepEqual(resultado, { ok: true });
});

test("el segundo voto de la misma persona rebota en la base y no infla el contador", async () => {
  const votanteId = await crearVotante(base, { dni: "40999000", distrito: 2 });
  const ideaId = await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Arbolado del boulevard",
    slug: "arbolado-del-boulevard",
  });
  const voto = {
    edicionId,
    votanteId,
    ideaId,
    distritoId: 2,
    ipHash: "prueba",
  };

  assert.deepEqual(await registrar.registrarVoto(voto), { ok: true });
  // La ruta reconoce este error por el nombre de la restriccion y responde
  // "ya usaste tu voto": tiene que seguir llegando asi, como error.
  await assert.rejects(
    () => registrar.registrarVoto(voto),
    violacionDe(/votos_una_persona_un_voto/i),
  );
  assert.deepEqual(await estadoDe(ideaId), { contador: 1, filas: 1 });
});
