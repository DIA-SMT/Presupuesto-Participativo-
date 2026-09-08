/**
 * Reglas de la revision de ideas y de la proclamacion del ganador.
 *
 * A diferencia de las reglas de la votacion, estas NO las garantiza la base:
 * viven en las server actions de src/app/admin/acciones.ts, que no se pueden
 * invocar sin contexto de request (leen la cookie de sesion). Pero la accion mas
 * delicada, `proclamarGanador`, decide sobre una consulta: pide el ranking a
 * `getVotosPorIdea` y exige que la idea sea la primera. Asi que probar esa
 * consulta es probar el criterio con el que se corona un proyecto.
 *
 * Si `getVotosPorIdea` incluyera una idea que no corresponde, la validacion
 * entera de la proclamacion estaria mirando el universo equivocado.
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
let consultas: typeof import("../../src/db/queries");

test.before(async () => {
  base = await crearBaseDePrueba("revision");
  const minimo = await cargarMinimo(base, { etapa: "seguimiento" });
  edicionId = minimo.edicionId;
  // Se importa DESPUES de crear la base: src/db elige el driver al importarse.
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

test("el ranking que valida la proclamacion solo mira factibles publicadas", async () => {
  // El universo del reglamento: los proyectos factibles y publicados. Todo lo
  // demas tiene que quedar afuera aunque tenga MAS votos.
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "La mas votada pero no factible",
    slug: "no-factible-con-votos",
    estado: "no_factible",
    votos: 500,
  });
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "La mas votada pero sin publicar",
    slug: "sin-publicar-con-votos",
    estado: "factible",
    publicada: false,
    votos: 400,
  });
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "La que corresponde",
    slug: "la-que-corresponde",
    estado: "factible",
    votos: 120,
  });
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "La segunda",
    slug: "la-segunda",
    estado: "factible",
    votos: 90,
  });

  const ranking = await consultas.getVotosPorIdea(edicionId, 1);
  const titulos = ranking.map((fila) => fila.titulo);

  assert.equal(
    titulos[0],
    "La que corresponde",
    "la primera del ranking tiene que ser la mas votada ENTRE las factibles publicadas",
  );
  assert.ok(
    !titulos.includes("La mas votada pero no factible"),
    "una idea no factible no puede entrar al ranking, aunque tenga 500 votos",
  );
  assert.ok(
    !titulos.includes("La mas votada pero sin publicar"),
    "una idea sin publicar no puede entrar al ranking",
  );
  assert.equal(titulos.length, 2, "solo las dos factibles publicadas");
});

test("el ranking es por distrito: no se mezclan proyectos de otro", async () => {
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Obra del distrito 2 con muchos votos",
    slug: "obra-d2-muchos-votos",
    estado: "factible",
    votos: 999,
  });

  const ranking = await consultas.getVotosPorIdea(edicionId, 1);
  assert.ok(
    !ranking.some((fila) => fila.titulo.includes("distrito 2")),
    "el proyecto de otro distrito no puede aparecer en el ranking del distrito 1",
  );
});

test("una idea sin publicar no existe para el sitio publico ni para el chatbot", async () => {
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Recien enviada por el formulario",
    slug: "recien-enviada",
    estado: "pendiente",
    publicada: false,
  });

  const paraElSitio = await consultas.getIdea("recien-enviada");
  assert.equal(
    paraElSitio,
    null,
    "getIdea no puede devolver una idea sin publicar: ese era el bug de la tanda 1",
  );

  const paraElPanel = await consultas.getIdea("recien-enviada", {
    incluirNoPublicadas: true,
  });
  assert.ok(paraElPanel, "el backoffice si la tiene que ver, pidiendolo explicitamente");
  assert.equal(paraElPanel?.publicada, false);
});

test("el listado publico tampoco trae las ideas sin publicar", async () => {
  const publicas = await consultas.listarIdeas({ edicionId });
  assert.ok(
    publicas.every((idea) => idea.publicada),
    "listarIdeas sin incluirNoPublicadas solo devuelve publicadas",
  );

  const todas = await consultas.listarIdeas({ edicionId, incluirNoPublicadas: true });
  assert.ok(
    todas.length > publicas.length,
    "con la bandera explicita tienen que aparecer mas",
  );
});

test("la bandeja pone primero lo que necesita trabajo, no lo mas votado", async () => {
  await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Pendiente de evaluar",
    slug: "pendiente-de-evaluar",
    estado: "pendiente",
    votos: 0,
  });

  const pagina = await consultas.listarIdeasBandeja({ edicionId, limite: 50 });
  const filas = Array.isArray(pagina) ? pagina : pagina.filas;

  assert.equal(
    filas[0].estado,
    "pendiente",
    "el orden de trabajo arranca por las pendientes, aunque otras tengan cientos de votos",
  );
});

test("el resumen cuenta la deuda: los no factibles sin devolucion escrita", async () => {
  const resumen = await consultas.getResumenBandeja(edicionId);

  // En esta base hay una sola idea no factible y se creo sin motivo_estado.
  assert.equal(
    resumen.noFactiblesSinDevolucion,
    1,
    "la deuda con el vecino se cuenta: un 'no' sin explicacion",
  );

  // Y al escribirle la devolucion, deja de ser deuda.
  await base.consultar(
    base.sql`UPDATE ideas SET motivo_estado = 'La obra excede el presupuesto del distrito para esta edicion.' WHERE slug = 'no-factible-con-votos'`,
  );
  const despues = await consultas.getResumenBandeja(edicionId);
  assert.equal(
    despues.noFactiblesSinDevolucion,
    0,
    "con la devolucion escrita, la deuda baja",
  );
});
