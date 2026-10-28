/**
 * Presentar una idea con CIDITUC: a donde vuelve el ingreso, cuando deja
 * entrar, y que la idea quede atada a la persona del padron.
 *
 * Lo que se fija:
 *  - el destino del ingreso es una lista blanca: lo que no es "ideas" vuelve a
 *    votar, nunca a una URL que traiga el pedido; y la salida y la vuelta de
 *    CIDITUC, cuando llegan sin destino, toman el de la etapa;
 *  - la etapa decide si hay ingreso: votar solo en la votacion, ideas solo en
 *    la etapa de ideas (o en modo prueba);
 *  - la idea guarda `votante_id`, el panel lo ve como "verificado con
 *    CIDITUC" sin recibir el id, y si la fila del padron se borra la idea
 *    queda (con el vinculo en null).
 *
 * Lo que no se prueba aca: la ruta /api/ideas y el callback, que leen cookies y
 * solo existen dentro de un pedido de Next. Lo que deciden esta en estas
 * funciones y en la base.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  cargarMinimo,
  crearBaseDePrueba,
  crearVotante,
  type BaseDePrueba,
} from "./apoyo-base";
import {
  PANTALLA_DEL_DESTINO,
  destinoDeIngreso,
  destinoDelIngreso,
  esDestinoDeIngreso,
  etapaDejaIngresar,
  otroDestino,
  puertaDeIngreso,
} from "../../src/lib/ingreso-vecino";

test("el destino del ingreso es una lista blanca", () => {
  assert.equal(destinoDeIngreso("ideas"), "ideas");
  for (const otro of [null, undefined, "", "votar", "IDEAS", "/admin", "https://otro.sitio", "ideas/../admin"]) {
    assert.equal(destinoDeIngreso(otro), "votar", `"${otro}" tiene que volver a votar`);
  }
  assert.equal(PANTALLA_DEL_DESTINO.ideas, "/ideas/nueva");
  assert.equal(PANTALLA_DEL_DESTINO.votar, "/votar");
  assert.equal(puertaDeIngreso("votar"), "/ingresar", "la puerta de votar sigue siendo la de siempre");
  assert.equal(puertaDeIngreso("ideas"), "/ingresar?para=ideas");
});

test("la etapa decide si hay ingreso, para cada destino", () => {
  const etapas = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;
  for (const etapa of etapas) {
    assert.equal(etapaDejaIngresar("votar", etapa), etapa === "votacion", `votar en ${etapa}`);
    assert.equal(etapaDejaIngresar("ideas", etapa), etapa === "ideas", `ideas en ${etapa}`);
    // El modo prueba abre las ideas con la etapa cerrada, y nunca la votacion.
    assert.equal(etapaDejaIngresar("ideas", etapa, true), true, `ideas en ${etapa} en modo prueba`);
    assert.equal(etapaDejaIngresar("votar", etapa, true), etapa === "votacion");
  }
  assert.equal(etapaDejaIngresar("ideas", null), false, "sin edicion activa no se entra");
  assert.equal(etapaDejaIngresar("votar", undefined), false);
});

test("un ingreso sin destino (cookie vencida, enlace pelado) toma el de la etapa", () => {
  const etapas = ["ideas", "evaluacion", "votacion", "seguimiento", "cerrada"] as const;
  for (const etapa of etapas) {
    // Lo pedido manda, aunque la etapa diga otra cosa: la puerta cerrada lo
    // explica con su propio cartel.
    assert.equal(destinoDelIngreso("ideas", etapa), "ideas");
    assert.equal(destinoDelIngreso("votar", etapa), "votar");

    // Sin pedido, o con uno que no esta en la lista, la etapa. Nunca la URL.
    for (const sinDestino of [null, undefined, "", "IDEAS", "/admin", "https://otro.sitio"]) {
      assert.equal(
        destinoDelIngreso(sinDestino, etapa),
        etapa === "ideas" ? "ideas" : "votar",
        `"${sinDestino}" en ${etapa}`,
      );
    }

    // Es el caso del hallazgo: en la etapa de ideas, la vuelta sin cookie caia
    // en la puerta de votar, cerrada. Ahora, si alguna puerta esta abierta, es
    // la deducida; las dos ventanas no se superponen.
    const deducido = destinoDelIngreso(null, etapa);
    const algunaAbierta = etapaDejaIngresar("ideas", etapa) || etapaDejaIngresar("votar", etapa);
    assert.equal(etapaDejaIngresar(deducido, etapa), algunaAbierta, `deducido en ${etapa}`);
  }
  assert.equal(destinoDelIngreso(null, null), "votar", "sin edicion activa, la puerta de siempre");
  assert.equal(puertaDeIngreso(destinoDelIngreso(undefined, "ideas")), "/ingresar?para=ideas");

  assert.equal(esDestinoDeIngreso("ideas"), true);
  assert.equal(esDestinoDeIngreso("votar"), true);
  assert.equal(esDestinoDeIngreso("Votar"), false);
  assert.equal(esDestinoDeIngreso(undefined), false);
});

test("la otra puerta es la del otro destino, y esta abierta cuando la pedida no", () => {
  assert.equal(otroDestino("votar"), "ideas");
  assert.equal(otroDestino("ideas"), "votar");
  // En la etapa de ideas, quien llega a /ingresar pelado ve la puerta de
  // votar cerrada y el enlace a la de ideas, abierta.
  assert.equal(etapaDejaIngresar("votar", "ideas"), false);
  assert.equal(etapaDejaIngresar(otroDestino("votar"), "ideas"), true);
  assert.equal(etapaDejaIngresar("ideas", "votacion"), false);
  assert.equal(etapaDejaIngresar(otroDestino("ideas"), "votacion"), true);
});

let base: BaseDePrueba;
let edicionId: number;
let alta: typeof import("../../src/lib/alta-idea");
let consultas: typeof import("../../src/db/queries");

/** Un punto del distrito 1 sobre la geometria oficial (public/geo/distritos.geojson). */
const PUNTO_D1 = { lat: -26.7965902, lon: -65.2515113 };

test.before(async () => {
  base = await crearBaseDePrueba("ingreso-ideas");
  edicionId = (await cargarMinimo(base, { etapa: "ideas" })).edicionId;
  // Despues de crear la base: src/db elige el driver al importarse.
  alta = await import("../../src/lib/alta-idea");
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

async function presentar(titulo: string, votanteId: number | null) {
  const creada = await alta.crearIdea(
    {
      edicionId,
      titulo,
      categoria: "urbana",
      problema: "La plaza no tiene luz y a la noche nadie la puede usar.",
      solucion: "Poner luminarias LED en todo el perimetro y en los senderos internos.",
      lat: PUNTO_D1.lat,
      lon: PUNTO_D1.lon,
      canal: "web",
      autorNombre: votanteId ? "Vecina de Prueba" : null,
      votanteId,
      fecha: "2026-10-13",
    },
    { etapaPermitida: () => null },
  );
  if (!creada.ok) assert.fail(`no se creo la idea: ${JSON.stringify(creada)}`);
  return creada.id;
}

test("la idea queda atada a la persona, y el panel solo ve que es verificada", async () => {
  const votanteId = await crearVotante(base, { dni: "30222333", distrito: null });
  const conCidituc = await presentar("Luminarias en la plaza del barrio", votanteId);
  const sinCidituc = await presentar("Luminarias en la plaza de enfrente", null);

  const [fila] = await base.consultar<{ votante_id: number | null; autor_nombre: string | null }>(
    base.sql`SELECT votante_id, autor_nombre FROM ideas WHERE id = ${conCidituc}`,
  );
  assert.equal(fila.votante_id, votanteId);
  assert.equal(fila.autor_nombre, "Vecina de Prueba");

  const ficha = await consultas.getIdeaAdmin(conCidituc);
  assert.equal(ficha?.autorConCidituc, true);
  assert.ok(ficha && !("votanteId" in ficha), "el id del padron no llega a la pantalla");
  assert.equal((await consultas.getIdeaAdmin(sinCidituc))?.autorConCidituc, false);
});

test("si la fila del padron se borra, la idea queda y pierde solo el vinculo", async () => {
  const votanteId = await crearVotante(base, { dni: "30222444", distrito: null });
  const idea = await presentar("Bancos y cestos en la plaza", votanteId);

  const { eq } = await import("drizzle-orm");
  await base.db.delete(base.schema.votantes).where(eq(base.schema.votantes.id, votanteId));

  const [fila] = await base.consultar<{ votante_id: number | null; titulo: string }>(
    base.sql`SELECT votante_id, titulo FROM ideas WHERE id = ${idea}`,
  );
  assert.equal(fila.titulo, "Bancos y cestos en la plaza", "la idea no se borra con la persona");
  assert.equal(fila.votante_id, null);
});

test("una sesion de una persona que ya no esta en el padron no deja guardar la idea", async () => {
  const votanteId = await crearVotante(base, { dni: "30222555", distrito: null });
  const { eq } = await import("drizzle-orm");
  await base.db.delete(base.schema.votantes).where(eq(base.schema.votantes.id, votanteId));

  // Es lo que pasa cuando la sesion (que dura horas) sobrevive a su fila: la
  // clave foranea rebota el alta y /api/ideas lo contesta como sesion vencida.
  await assert.rejects(
    () => presentar("Idea de alguien que ya no esta", votanteId),
    (causa: unknown) => {
      let texto = "";
      for (let error: unknown = causa; error instanceof Error; error = error.cause) {
        texto += ` ${error.message}`;
      }
      return texto.includes("ideas_votante_id_votantes_id_fk");
    },
  );
});
