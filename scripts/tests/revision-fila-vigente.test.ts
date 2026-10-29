/**
 * Las reglas de evaluar, publicar, reabrir y proclamar se deciden con la fila de
 * la idea releida y bloqueada adentro de la transaccion (src/app/admin/comun.ts),
 * no con la que la accion leyo antes de abrirla.
 *
 * Antes, `evaluarIdea`, `cambiarPublicacion`, `proclamarGanador` y
 * `reabrirRevision` (src/app/admin/acciones.ts) decidian si la idea era ganadora,
 * si estaba publicada o si un moderador podia deshacer una proclamacion con una
 * lectura previa, y con esa misma lectura escribian el `estadoAnterior` del
 * historial. Lo que pasaba entre esa lectura y el bloqueo quedaba sin revisar:
 * un moderador que reabria una idea justo cuando un administrador la proclamaba
 * deshacia la proclamacion, que es solo de un administrador.
 *
 * Las server actions no se pueden invocar sin contexto de pedido (leen la cookie
 * de sesion), y PGlite atiende de a una transaccion, asi que la carrera no se
 * reproduce tal cual. Lo que se fija es la pieza que la cierra: lo que se lee
 * ANTES (la ficha que vio la persona) cambia, y la decision de adentro mira la
 * fila de ahora.
 *
 * Tambien el mensaje de la proclamacion con empate (`motivoPorRanking`): con
 * dos ideas empatadas arriba, la de numero mayor recibia "el proyecto mas
 * votado es la otra", que presenta como ganadora sola a una idea empatada.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cargarMinimo,
  crearBaseDePrueba,
  crearIdea,
  type BaseDePrueba,
} from "./apoyo-base";

let base: BaseDePrueba;
let edicionId: number;
let comun: typeof import("../../src/app/admin/comun");
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("revision-fila-vigente");
  // Seguimiento: la etapa no frena ninguna de estas acciones, asi que lo que
  // rechaza es la regla propia de cada una.
  const minimo = await cargarMinimo(base, { etapa: "seguimiento" });
  edicionId = minimo.edicionId;
  // Un ganador por distrito (indice unico de la base): cada prueba que
  // proclama usa un distrito propio, y cargarMinimo trae solo el 1 y el 2.
  for (let numero = 3; numero <= 7; numero += 1) {
    await base.db.insert(base.schema.distritos).values({
      id: numero,
      numero,
      nombre: `Distrito ${numero}`,
      geojson: { type: "MultiPolygon", coordinates: [] },
      centroideLat: "-26.8",
      centroideLon: "-65.2",
    });
  }
  // Despues de crear la base: src/db elige el driver al importarse.
  comun = await import("../../src/app/admin/comun");
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

let correlativo = 0;

/** Una idea propia de cada prueba, para que ninguna dependa de otra. */
async function idea(datos: {
  estado?: "pendiente" | "factible" | "no_factible" | "ganador";
  publicada?: boolean;
  ganador?: boolean;
  distrito?: number;
  numero?: number;
  votos?: number;
  titulo?: string;
}) {
  correlativo += 1;
  return crearIdea(base, {
    edicionId,
    distrito: datos.distrito ?? 1,
    numero: datos.numero,
    titulo: datos.titulo ?? `Idea ${correlativo}`,
    slug: `idea-vigente-${correlativo}`,
    estado: datos.estado ?? "factible",
    publicada: datos.publicada ?? true,
    ganador: datos.ganador ?? false,
    votos: datos.votos ?? 0,
  });
}

/** Lo que "otra persona" escribe entre la lectura de la ficha y el bloqueo. */
async function enElMedio(
  id: number,
  cambios: { estado?: "factible" | "no_factible" | "ganador"; publicada?: boolean; ganador?: boolean },
) {
  const { eq } = await import("drizzle-orm");
  await base.db.update(base.schema.ideas).set(cambios).where(eq(base.schema.ideas.id, id));
}

async function fichaDe(id: number) {
  const { eq } = await import("drizzle-orm");
  const [fila] = await base.db
    .select({
      estado: base.schema.ideas.estado,
      publicada: base.schema.ideas.publicada,
      ganador: base.schema.ideas.ganador,
    })
    .from(base.schema.ideas)
    .where(eq(base.schema.ideas.id, id));
  return fila;
}

// ---------------------------------------------------------------------------
// La fila de adentro de la transaccion
// ---------------------------------------------------------------------------

test("leerIdeaEnJuego devuelve tambien la marca de ganador", async () => {
  const id = await idea({ estado: "ganador", ganador: true, distrito: 3 });
  const vigente = await base.db.transaction((tx) => comun.leerIdeaEnJuego(tx, id));
  assert.deepEqual(vigente, {
    etapa: "seguimiento",
    estado: "ganador",
    publicada: true,
    ganador: true,
  });
});

test("reabrir: un moderador no deshace una proclamacion que se colo despues de leer la ficha", async () => {
  const id = await idea({ estado: "factible", distrito: 4 });
  // La ficha que vio el moderador: factible, sin marca de ganador. Con esa
  // lectura la regla lo dejaba pasar.
  const vista = await fichaDe(id);
  assert.equal(comun.reglaParaReabrir(vista, "moderador"), null);

  // En el medio, un administrador la proclama.
  await enElMedio(id, { estado: "ganador", ganador: true });

  const delModerador = await base.db.transaction((tx) =>
    comun.tomarIdeaParaCambiar(tx, id, { accion: "reabrir" }, (vigente) =>
      comun.reglaParaReabrir(vigente, "moderador"),
    ),
  );
  assert.equal(delModerador.ok, false);
  if (!delModerador.ok) assert.match(delModerador.motivo, /solo un administrador/);

  // Un administrador si puede, y el estado anterior que va al historial es el
  // de la fila bloqueada ("ganador"), no el de la ficha ("factible").
  const delAdmin = await base.db.transaction((tx) =>
    comun.tomarIdeaParaCambiar(tx, id, { accion: "reabrir" }, (vigente) =>
      comun.reglaParaReabrir(vigente, "admin"),
    ),
  );
  assert.equal(delAdmin.ok, true);
  if (delAdmin.ok) {
    assert.equal(delAdmin.vigente.estado, "ganador");
    assert.equal(delAdmin.vigente.ganador, true);
  }
});

test("reabrir: una pendiente sin marca de ganador no tiene nada que reabrir", async () => {
  const id = await idea({ estado: "pendiente", publicada: false });
  const tomada = await base.db.transaction((tx) =>
    comun.tomarIdeaParaCambiar(tx, id, { accion: "reabrir" }, (vigente) =>
      comun.reglaParaReabrir(vigente, "admin"),
    ),
  );
  assert.equal(tomada.ok, false);
  if (!tomada.ok) assert.match(tomada.motivo, /ya está pendiente/);
});

test("evaluar: una idea proclamada en el medio ya no cambia de estado", async () => {
  const id = await idea({ estado: "factible", distrito: 5 });
  assert.equal(comun.reglaParaEvaluar(await fichaDe(id)), null);

  await enElMedio(id, { estado: "ganador", ganador: true });

  const tomada = await base.db.transaction((tx) =>
    comun.tomarIdeaParaCambiar(
      tx,
      id,
      { accion: "evaluar", estado: "no_factible" },
      comun.reglaParaEvaluar,
    ),
  );
  assert.equal(tomada.ok, false);
  if (!tomada.ok) assert.match(tomada.motivo, /proclamada como ganadora/);
});

test("proclamar: una idea evaluada no factible o despublicada en el medio ya no se proclama", async () => {
  const noFactible = await idea({ estado: "factible" });
  assert.equal(comun.reglaParaProclamar(await fichaDe(noFactible)), null);
  await enElMedio(noFactible, { estado: "no_factible" });
  const vigenteNoFactible = await base.db.transaction((tx) =>
    comun.leerIdeaEnJuego(tx, noFactible),
  );
  assert.ok(vigenteNoFactible);
  assert.match(comun.reglaParaProclamar(vigenteNoFactible) ?? "", /factible y publicado/);

  const despublicada = await idea({ estado: "factible" });
  await enElMedio(despublicada, { publicada: false });
  const vigenteDespublicada = await base.db.transaction((tx) =>
    comun.leerIdeaEnJuego(tx, despublicada),
  );
  assert.ok(vigenteDespublicada);
  assert.match(comun.reglaParaProclamar(vigenteDespublicada) ?? "", /factible y publicado/);

  // Y una que ya es ganadora lo dice, en lugar de hablar de factibilidad.
  const yaGanadora = await idea({ estado: "ganador", ganador: true, distrito: 6 });
  const vigenteGanadora = await base.db.transaction((tx) => comun.leerIdeaEnJuego(tx, yaGanadora));
  assert.ok(vigenteGanadora);
  assert.match(comun.reglaParaProclamar(vigenteGanadora) ?? "", /ya está proclamado/);
});

test("publicar: la segunda de dos publicaciones a la vez no deja otra fila en el historial", async () => {
  const id = await idea({ estado: "factible", publicada: false });
  // Las dos personas vieron la idea sin publicar.
  assert.equal(comun.reglaParaPublicar(await fichaDe(id), true), null);

  // La primera la publica.
  await enElMedio(id, { publicada: true });

  const motivo = await base.db.transaction((tx) =>
    comun.bloqueoPorEtapa(tx, id, { accion: "publicar" }, (vigente) =>
      comun.reglaParaPublicar(vigente, true),
    ),
  );
  assert.equal(motivo, "La idea ya está publicada.");

  // Sin regla propia, bloqueoPorEtapa sigue contestando solo por la etapa.
  const soloEtapa = await base.db.transaction((tx) =>
    comun.bloqueoPorEtapa(tx, id, { accion: "despublicar" }),
  );
  assert.equal(soloEtapa, null);
});

test("despublicar: una idea proclamada en el medio no sale del sitio sin reabrirla", async () => {
  const id = await idea({ estado: "factible", distrito: 7 });
  // La ficha que se vio: factible y publicada, sin marca de ganador.
  assert.equal(comun.reglaParaPublicar(await fichaDe(id), false), null);

  // En el medio, un administrador la proclama.
  await enElMedio(id, { estado: "ganador", ganador: true });

  // Ni un administrador la despublica directo: dejaba ganador=true sin publicar,
  // que esconde al ganador y no deja proclamar a otra del distrito.
  const motivo = await base.db.transaction((tx) =>
    comun.bloqueoPorEtapa(tx, id, { accion: "despublicar" }, (vigente) =>
      comun.reglaParaPublicar(vigente, false),
    ),
  );
  assert.match(motivo ?? "", /Reabrí la revisión/);

  // Volver a publicar un ganador que quedo sin publicar si se puede.
  await enElMedio(id, { publicada: false });
  const republicar = await base.db.transaction((tx) =>
    comun.bloqueoPorEtapa(tx, id, { accion: "publicar" }, (vigente) =>
      comun.reglaParaPublicar(vigente, true),
    ),
  );
  assert.equal(republicar, null);
});

// ---------------------------------------------------------------------------
// El mensaje de la proclamacion con empate
// ---------------------------------------------------------------------------

test("con empate arriba, proclamar cualquiera de las empatadas habla del empate", async () => {
  // Distrito 2 de la prueba: #7 y #12 empatadas en 40, #20 atras. El ranking
  // de verdad ordena el empate por numero, asi que #7 queda primera.
  const plaza = await idea({ distrito: 2, numero: 7, titulo: "Plaza", votos: 40 });
  const luminarias = await idea({ distrito: 2, numero: 12, titulo: "Luminarias", votos: 40 });
  const veredas = await idea({ distrito: 2, numero: 20, titulo: "Veredas", votos: 10 });

  const ranking = await consultas.getVotosPorIdea(edicionId, 2);
  assert.deepEqual(
    ranking.map((fila) => fila.id),
    [plaza, luminarias, veredas],
  );

  // La de numero mayor: antes leia "El proyecto más votado del Distrito 2 es
  // “Plaza”", que escondia el empate.
  const deLuminarias = comun.motivoPorRanking(ranking, luminarias, 2) ?? "";
  assert.match(deLuminarias, /Hay empate en 40 votos con “Plaza”/);
  assert.doesNotMatch(deLuminarias, /más votado/);

  const dePlaza = comun.motivoPorRanking(ranking, plaza, 2) ?? "";
  assert.match(dePlaza, /Hay empate en 40 votos con “Luminarias”/);

  // Una de atras tampoco lee que hay una sola mas votada.
  const deVeredas = comun.motivoPorRanking(ranking, veredas, 2) ?? "";
  assert.match(deVeredas, /empatado en 40 votos entre “Plaza” y “Luminarias”/);
  assert.doesNotMatch(deVeredas, /más votado del Distrito/);
});

test("sin empate, solo la mas votada pasa y las demas leen cual es", () => {
  const ranking = [
    { id: 1, titulo: "Plaza", votos: 40 },
    { id: 2, titulo: "Luminarias", votos: 30 },
  ];
  assert.equal(comun.motivoPorRanking(ranking, 1, 5), null);
  assert.equal(
    comun.motivoPorRanking(ranking, 2, 5),
    "El proyecto más votado del Distrito 5 es “Plaza” con 40 votos: no se puede proclamar otro.",
  );
  assert.match(comun.motivoPorRanking([], 1, 5) ?? "", /no tiene proyectos factibles publicados/);
});

test("un empate de tres nombra a las otras dos", () => {
  const ranking = [
    { id: 1, titulo: "A", votos: 9 },
    { id: 2, titulo: "B", votos: 9 },
    { id: 3, titulo: "C", votos: 9 },
  ];
  assert.equal(
    comun.motivoPorRanking(ranking, 2, 1),
    "Hay empate en 9 votos con “A” y “C”. El desempate lo resuelve el reglamento, no el panel.",
  );
});
