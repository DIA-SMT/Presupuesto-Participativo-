/**
 * Las series diarias del tablero (/admin/tablero) cortan el dia en hora de
 * Tucuman, no en la zona de la sesion de la base.
 *
 * La sesion de Supabase esta en UTC (ver getUsoChatPorDia en
 * src/db/queries.ts): con `created_at::date`, un voto de las 22:30 caia en la
 * barra del dia siguiente, y los de la ultima noche de votacion en una barra
 * posterior al cierre. La PGlite toma la zona de la maquina, asi que en una con
 * hora argentina la prueba pasaba igual con el cast pelado: se fija UTC para que
 * no dependa de donde se corre, como en limpieza-pruebas.test.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { cargarMinimo, crearBaseDePrueba, crearIdea, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let consultas: typeof import("../../src/db/queries");

/** 22:30 del martes en Tucuman: 01:30 UTC del miercoles. */
const MARTES_A_LA_NOCHE = new Date("2026-10-13T22:30:00-03:00");
const MIERCOLES_A_LA_MANANA = new Date("2026-10-14T10:00:00-03:00");

test.before(async () => {
  base = await crearBaseDePrueba("series-tablero");
  const minimo = await cargarMinimo(base, { etapa: "votacion" });
  edicionId = minimo.edicionId;
  // Despues de crear la base: src/db elige el driver al importarse.
  consultas = await import("../../src/db/queries");
  // La PGlite es una sola conexion: el SET vale para todo lo que sigue.
  await base.consultar(base.sql`SET TIME ZONE 'UTC'`);
});

test.after(async () => {
  await base.cerrar();
});

test("un voto de las 22:30 de Tucuman cuenta en su dia, no en el siguiente", async () => {
  const idea = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Plaza del barrio",
    slug: "plaza-del-barrio",
    votos: 2,
  });

  let dni = 0;
  for (const momento of [MARTES_A_LA_NOCHE, MIERCOLES_A_LA_MANANA]) {
    dni += 1;
    const [votante] = await base.db
      .insert(base.schema.votantes)
      .values({ dniHash: `hash-${dni}`, distritoId: 1, proveedor: "dev" })
      .returning({ id: base.schema.votantes.id });
    await base.db.insert(base.schema.votos).values({
      edicionId,
      votanteId: votante.id,
      ideaId: idea,
      distritoId: 1,
      createdAt: momento,
    });
  }

  assert.deepEqual(await consultas.getSerieVotos(edicionId), [
    { dia: "2026-10-13", cantidad: 1 },
    { dia: "2026-10-14", cantidad: 1 },
  ]);
});

test("una idea sin fecha declarada cuenta en el dia de Tucuman en que se creo", async () => {
  // Una edicion aparte, para que la serie se lea entera.
  const [edicion] = await base.db
    .insert(base.schema.ediciones)
    .values({ anio: 2031, etapa: "ideas", activa: false })
    .returning({ id: base.schema.ediciones.id });

  await base.db.insert(base.schema.ideas).values([
    {
      edicionId: edicion.id,
      distritoId: 1,
      titulo: "Sin fecha, cargada a la noche",
      slug: "sin-fecha-noche",
      estado: "pendiente",
      fecha: null,
      createdAt: MARTES_A_LA_NOCHE,
    },
    {
      // La fecha declarada manda sobre `created_at`, como siempre.
      edicionId: edicion.id,
      distritoId: 1,
      titulo: "Con fecha de la asamblea",
      slug: "con-fecha-asamblea",
      estado: "pendiente",
      fecha: "2026-10-01",
      createdAt: MARTES_A_LA_NOCHE,
    },
  ]);

  assert.deepEqual(await consultas.getSerieIdeas(edicion.id), [
    { dia: "2026-10-01", cantidad: 1 },
    { dia: "2026-10-13", cantidad: 1 },
  ]);
});
