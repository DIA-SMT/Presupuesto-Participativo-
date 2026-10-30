/**
 * El chat con dos ediciones cargadas: la 2026 recien abierta y la 2025
 * terminada (el escenario de apoyo-ediciones.ts).
 *
 * Antes las herramientas leian solo la edicion activa: con la 2026 recien
 * abierta, "¿quiénes ganaron?" daba cero y los 19 ganadores 2025 (las obras que
 * se estan ejecutando) no aparecian; y `ubicar_barrio` buscaba el barrio en las
 * ideas de la activa, asi que cualquier barrio daba "no figura". Se prueban las
 * herramientas del modelo, lo que el prompt le dice sobre la edicion y el
 * buscador sin IA.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { puntoEnBarrio, ubicarBarrio } from "../../src/lib/barrios";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";
import { cargarDosEdiciones } from "./apoyo-ediciones";

let base: BaseDePrueba;
let id2025: number;
let consultas: typeof import("../../src/db/queries");
let herramientas: typeof import("../../src/lib/chat-herramientas");
let sinIA: typeof import("../../src/lib/chat-sin-ia");
let vigente: NonNullable<Awaited<ReturnType<typeof consultas.getEdicionActiva>>>;

/**
 * Un punto adentro del poligono de VILLA URQUIZA en la capa oficial, buscado en
 * una grilla sobre su caja. No sirve cualquier punto del distrito 5: el del
 * Club Sargento Cabral, por ejemplo, cae en el distrito pero fuera del barrio.
 */
function puntoEnVillaUrquiza(): { lat: string; lon: string } {
  const [urquiza] = ubicarBarrio("villa urquiza");
  const anillo = urquiza.feature.geometry.coordinates[0][0];
  const lons = anillo.map((p) => p[0]);
  const lats = anillo.map((p) => p[1]);
  for (let i = 1; i < 20; i += 1) {
    for (let j = 1; j < 20; j += 1) {
      const lon = Math.min(...lons) + ((Math.max(...lons) - Math.min(...lons)) * i) / 20;
      const lat = Math.min(...lats) + ((Math.max(...lats) - Math.min(...lats)) * j) / 20;
      if (puntoEnBarrio({ lat, lon }, urquiza.feature)) {
        return { lat: lat.toFixed(7), lon: lon.toFixed(7) };
      }
    }
  }
  throw new Error("no se encontro un punto adentro de VILLA URQUIZA");
}

test.before(async () => {
  base = await crearBaseDePrueba("chat-ediciones");
  const { db, schema, sql } = base;
  const escenario = await cargarDosEdiciones(base);
  id2025 = escenario.id2025;

  // La idea 2025 de Villa Urquiza tiene punto y NO tiene el barrio escrito:
  // tiene que contar por el punto. La 2026 tiene el barrio escrito y no tiene
  // punto: tiene que contar por el nombre.
  await db
    .update(schema.ideas)
    .set(puntoEnVillaUrquiza())
    .where(sql`${schema.ideas.id} = ${escenario.ideas.urquiza2025}`);
  await db
    .update(schema.ideas)
    .set({ barrio: "B° Villa Urquiza", barrioNormalizado: "b° villa urquiza" })
    .where(sql`${schema.ideas.id} = ${escenario.ideas.urquiza2026}`);

  process.env.CHAT_RATE_LIMIT = "1000";
  consultas = await import("../../src/db/queries");
  herramientas = await import("../../src/lib/chat-herramientas");
  sinIA = await import("../../src/lib/chat-sin-ia");
  const activa = await consultas.getEdicionActiva();
  assert.ok(activa);
  vigente = activa;
});

test.after(async () => {
  await base.cerrar();
});

/** El contenido de una herramienta, ya parseado. */
async function herramienta(nombre: string, entrada: object) {
  const resultado = await herramientas.ejecutarHerramienta(nombre, entrada, vigente);
  return { ...resultado, datos: JSON.parse(resultado.contenido) };
}

// ---------------------------------------------------------------------------
// Herramientas del modelo
// ---------------------------------------------------------------------------

test("con la 2026 recien abierta, los ganadores que ofrece el chat son los de 2025", async () => {
  const { datos, sinDatos, referencias } = await herramienta("buscar_proyectos", {
    solo_ganadores: true,
  });
  assert.equal(datos.encontrados, 0);
  assert.match(datos.aviso, /2026 todavia no tiene proyectos ganadores/);
  assert.equal(datos.resultados_de_otra_edicion.edicion, 2025);
  assert.deepEqual(
    datos.resultados_de_otra_edicion.proyectos.map((p: { slug: string }) => p.slug).sort(),
    ["plaza-del-barrio", "solo-en-2025"],
  );
  // Cada proyecto dice su edicion: el slug se repite y detalle_proyecto la necesita.
  assert.ok(
    datos.resultados_de_otra_edicion.proyectos.every((p: { edicion: number }) => p.edicion === 2025),
  );
  assert.ok(referencias.every((r) => r.url.endsWith("?edicion=2025")));
  assert.ok(!sinDatos, "trajo datos, aunque de otra edicion");
});

test("con edicion pedida el chat usa esa, y un año que no existe se dice", async () => {
  const de2025 = await herramienta("buscar_proyectos", { solo_ganadores: true, edicion: 2025 });
  assert.equal(de2025.datos.edicion, 2025);
  assert.equal(de2025.datos.encontrados, 2);

  const inexistente = await herramienta("buscar_proyectos", { edicion: 1999 });
  assert.equal(inexistente.sinDatos, true);
  assert.match(inexistente.datos.aviso, /No hay una edicion 1999/);
  assert.match(inexistente.datos.aviso, /2026, 2025/, "dice cuales hay, sin la 2027 vacia");
});

test("detalle_proyecto distingue el slug repetido por edicion", async () => {
  const actual = await herramienta("detalle_proyecto", { slug: "plaza-del-barrio" });
  assert.equal(actual.datos.anio, 2026);
  assert.equal(actual.datos.url, "/proyectos/plaza-del-barrio");

  const anterior = await herramienta("detalle_proyecto", { slug: "plaza-del-barrio", edicion: 2025 });
  assert.equal(anterior.datos.anio, 2025);
  assert.equal(anterior.datos.es_de_la_edicion_vigente, false);
  assert.equal(anterior.datos.url, "/proyectos/plaza-del-barrio?edicion=2025");
  assert.equal(anterior.datos.etapa_obra, "En obra");
});

test("resumen_distrito no dice 'sin ganador' antes de votar, y ofrece el de 2025", async () => {
  const { datos } = await herramienta("resumen_distrito", { numero: 1 });
  assert.equal(datos.edicion, 2026);
  assert.match(datos.ganador, /todavia no tiene ganador/);
  assert.equal(datos.ganador_en_la_ultima_edicion_que_voto.edicion, 2025);
  assert.equal(
    datos.ganador_en_la_ultima_edicion_que_voto.url,
    "/proyectos/plaza-del-barrio?edicion=2025",
  );
});

test("ubicar_barrio usa la capa oficial aunque la edicion no tenga ideas ahi", async () => {
  // Jardin no tiene ninguna idea en ninguna edicion: antes daba "no figura".
  const jardin = await herramienta("ubicar_barrio", { barrio: "barrio Jardín" });
  assert.ok(!jardin.sinDatos);
  assert.equal(jardin.datos.fuente, "capa oficial de barrios del municipio");
  assert.equal(jardin.datos.barrios[0].distrito, 3);
  assert.equal(jardin.datos.barrios[0].ideas_en_el_barrio, 0);

  // En Villa Urquiza la 2026 tiene una idea, que cuenta por el barrio escrito.
  const urquiza = await herramienta("ubicar_barrio", { barrio: "Villa Urquiza" });
  assert.equal(urquiza.datos.barrios[0].distrito, 5);
  assert.equal(urquiza.datos.barrios[0].ideas_en_el_barrio, 1);
  assert.deepEqual(urquiza.datos.barrios[0].ideas_en_el_distrito, [{ distrito: 5, ideas: 1 }]);

  // En la 2025, la idea de Villa Urquiza cuenta por su punto en el mapa.
  const urquiza2025 = await herramienta("ubicar_barrio", { barrio: "Villa Urquiza", edicion: 2025 });
  assert.equal(urquiza2025.datos.barrios[0].ideas_en_el_barrio, 1);
  assert.equal(urquiza2025.datos.barrios[0].url, "/distritos/5?edicion=2025");
});

test("ubicar_barrio no le da un solo distrito a un barrio repartido", async () => {
  const { datos, referencias } = await herramienta("ubicar_barrio", { barrio: "Villa 9 de Julio" });
  const [villa] = datos.barrios;
  assert.match(villa.barrio, /^villa 9 de julio$/i);
  // Con el distrito de mas superficie en `distrito` el dato decia "queda en el
  // 6", contra el aviso que pide no elegir uno.
  assert.equal(villa.distrito, undefined);
  assert.deepEqual(
    villa.repartido_entre_distritos.map((p: { distrito: number }) => p.distrito),
    [6, 5, 8],
  );
  assert.equal(villa.url, "/distritos", "la url es el mapa, donde se ubica la cuadra");
  assert.match(datos.aviso, /No elegir uno/);
  assert.ok(referencias.some((r) => r.url === "/distritos"));

  // En otra edicion, el mapa de esa edicion.
  const de2025 = await herramienta("ubicar_barrio", { barrio: "Villa 9 de Julio", edicion: 2025 });
  assert.equal(de2025.datos.barrios[0].url, "/distritos?edicion=2025");
});

test("un barrio que no esta en la capa se busca en lo que escribieron los vecinos", async () => {
  // Solo en las ideas publicadas: el barrio de una idea en moderacion es un dato de ella.
  await base.db
    .update(base.schema.ideas)
    .set({ barrio: "Parque Oculto", barrioNormalizado: "parque oculto" })
    .where(base.sql`${base.schema.ideas.slug} = 'sin-publicar-2025'`);
  const oculto = await herramienta("ubicar_barrio", { barrio: "Parque Oculto" });
  assert.equal(oculto.sinDatos, true);

  await base.db
    .update(base.schema.ideas)
    .set({ barrio: "Parque 9 de Julio", barrioNormalizado: "parque 9 de julio" })
    .where(
      base.sql`${base.schema.ideas.slug} = 'solo-en-2025' AND ${base.schema.ideas.edicionId} = ${id2025}`,
    );
  const parque = await herramienta("ubicar_barrio", { barrio: "Parque 9 de Julio" });
  assert.match(parque.datos.fuente, /escrito por quienes presentaron ideas/);
  assert.equal(parque.datos.coincidencias[0].distrito, 2);

  // Un % no es un comodin: sin escaparlo, "%%" traia todos los barrios.
  assert.ok((await consultas.buscarBarriosEnIdeas(["parque"])).length > 0);
  assert.deepEqual(await consultas.buscarBarriosEnIdeas(["%%"]), []);
});

test("estadisticas de una edicion que no voto traen los ganadores de la anterior", async () => {
  const { datos, referencias } = await herramienta("estadisticas", {});
  assert.equal(datos.edicion, 2026);
  assert.equal(typeof datos.distritos_sin_ganador, "string", "no una lista de los 20 distritos");
  assert.equal(datos.ganadores_de_la_ultima_edicion_que_voto.edicion, 2025);
  assert.ok(referencias.some((r) => r.url === "/transparencia?edicion=2025"));
});

test("en la etapa de ideas el chat cuenta publicadas, no 'presentadas'", async () => {
  // La 2026 tiene tres ideas y una sin publicar (la del distrito 2, en
  // moderacion): el numero publico es 2. Llamarlo "presentadas" era decir que
  // al distrito 2 no llego ninguna, como pasaba en la portada y en /distritos/N.
  const totales = await herramienta("estadisticas", {});
  assert.equal(totales.datos.ideas_publicadas, 2);
  assert.equal(totales.datos.ideas_presentadas, undefined);
  const distrito2 = await herramienta("resumen_distrito", { numero: 2 });
  assert.equal(distrito2.datos.ideas_publicadas, 0);
  assert.equal(distrito2.datos.ideas_presentadas, undefined);

  const sinIATotales = await sinIA.responderSinIA("¿Cuántas ideas se presentaron?", vigente);
  assert.match(sinIATotales.texto, /2 ideas publicadas/);
  assert.doesNotMatch(sinIATotales.texto, /presentada/);
  const sinIADistrito = await sinIA.responderSinIA("distrito 2", vigente);
  assert.match(sinIADistrito.texto, /0 ideas publicadas/);
  assert.doesNotMatch(sinIADistrito.texto, /presentada/);
});

test("el prompt dice como pedir otra edicion, y antes de votar no cuenta distritos 'sin ganador'", async () => {
  // Se captura el pedido al proveedor, que se reemplaza en fetch como en
  // chat-respaldo.test.ts: ninguna prueba sale a la red.
  const { POST } = await import("../../src/app/api/chat/route");
  process.env.OPENROUTER_API_KEY = "clave-de-mentira";
  process.env.OPENROUTER_MODELO = "proveedor/modelo-de-prueba";
  let sistema = "";
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body ?? "{}"));
    sistema = cuerpo.messages?.[0]?.content ?? "";
    const trozo = {
      id: "x",
      object: "chat.completion.chunk",
      created: 0,
      model: "proveedor/modelo-de-prueba",
      choices: [{ index: 0, delta: { role: "assistant", content: "Listo." }, finish_reason: "stop" }],
    };
    return new Response(`data: ${JSON.stringify(trozo)}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;
  try {
    const respuesta = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ mensajes: [{ rol: "usuario", texto: "¿qué ganó?" }] }),
      }),
    );
    await respuesta.text();
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.OPENROUTER_API_KEY;
  }

  assert.match(sistema, /Edición vigente: 2026/);
  // Lo mismo que la portada: el numero es de publicadas, no de presentadas.
  assert.match(sistema, /Ideas publicadas: 2 /);
  assert.doesNotMatch(sistema, /Ideas presentadas:/);
  assert.match(sistema, /pasales `edicion` con el año/);
  assert.match(sistema, /\/archivo/);
  // Con la 2026 en ideas, los 20 distritos "sin ganador" no son un resultado.
  assert.doesNotMatch(sistema, /Sin proyecto ganador en esta edición/);
});

// ---------------------------------------------------------------------------
// El buscador sin IA
// ---------------------------------------------------------------------------

/**
 * Si al texto le queda un asterisco fuera de las negritas. El widget (enLinea,
 * src/components/Chat.tsx) entiende `**negrita**` y enlaces, nada mas: la
 * *italica* del buscador le llegaba al vecino con los asteriscos a la vista.
 */
function asteriscosSueltos(texto: string) {
  return texto.replace(/\*\*[^*\n]+\*\*/g, "").includes("*");
}

test("sin IA: 'ganadores' con la 2026 recien abierta ofrece los de 2025", async () => {
  const { texto, referencias } = await sinIA.responderSinIA("¿Quiénes ganaron?", vigente);
  assert.match(texto, /2026 todavía no tiene proyectos ganadores/);
  assert.match(texto, /edición 2025/);
  assert.match(texto, /Plaza del barrio/);
  assert.match(texto, /obra: en obra/, "el estado de obra, solo el informado");
  assert.deepEqual(referencias.map((r) => r.url), ["/transparencia?edicion=2025"]);
});

test("sin IA: un año en la pregunta cambia de edicion", async () => {
  const de2025 = await sinIA.responderSinIA("ganadores 2025", vigente);
  assert.match(de2025.texto, /Proyectos ganadores 2025/);

  // Un año que no esta cargado se dice; no se contesta con la vigente como si
  // fuera ese.
  const inexistente = await sinIA.responderSinIA("ganadores 2019", vigente);
  assert.match(inexistente.texto, /No hay datos de una edición 2019/);
  assert.match(inexistente.texto, /2026 y 2025/);
});

test("sin IA: el barrio se ubica con la capa oficial, y el numero del barrio no es un distrito", async () => {
  const urquiza = await sinIA.responderSinIA("¿En qué distrito queda Villa Urquiza?", vigente);
  assert.match(urquiza.texto, /Villa Urquiza\*\* queda en el distrito 5/);

  // El 9 es parte del nombre: antes contestaba con el distrito 9.
  const nueveDeJulio = await sinIA.responderSinIA("¿En qué distrito queda Villa 9 de Julio?", vigente);
  assert.match(nueveDeJulio.texto, /repartido entre los distritos 6, 5 y 8/);
});

test("sin IA: las sugerencias del widget siguen contestando lo suyo con dos ediciones", async () => {
  // "mi distrito" cuenta como pregunta por un lugar: que ningun barrio de la
  // capa se robe la sugerencia, y que conteste con los ganadores de 2025.
  const ganador = await sinIA.responderSinIA("¿Qué ganó en mi distrito?", vigente);
  assert.match(ganador.texto, /2026 todavía no tiene proyectos ganadores/);
  assert.match(ganador.texto, /Los últimos ganadores son los de la edición 2025/);

  const totales = await sinIA.responderSinIA("¿Cuántas ideas se presentaron?", vigente);
  assert.match(totales.texto, /\*\*Edición 2026\*\*/);
  assert.match(totales.texto, /preguntá por «ganadores 2025»/);
  assert.ok(!asteriscosSueltos(totales.texto), totales.texto);
  assert.doesNotMatch(totales.texto, /Sin proyecto ganador/, "antes de votar no es un resultado");
  assert.ok(totales.referencias.some((r) => r.url === "/transparencia?edicion=2025"));

  // Con la 2026 en etapa de ideas, dice que la carga esta abierta y adonde ir.
  const participar = await sinIA.responderSinIA("¿Cómo presento una idea?", vigente);
  assert.match(participar.texto, /presentación de ideas de la edición 2026 está abierta/);
  assert.ok(participar.referencias.some((r) => r.url === "/ideas/nueva"));
});

test("sin IA: el distrito antes de votar no dice 'sin ganador' y nombra el de 2025", async () => {
  const { texto } = await sinIA.responderSinIA("distrito 1", vigente);
  assert.match(texto, /Todavía no hay ganador/);
  assert.match(texto, /En la edición 2025 ganó \*\*Plaza del barrio\*\*/);
});

test("sin IA: lo que se encuentra en otra edicion cuenta como consulta resuelta", async () => {
  // La respuesta abria con "En la edición 2026 no encontré nada con eso." y el
  // clasificador del panel, que con el buscador decide por la primera oracion,
  // la mandaba a "Lo que Migue no pudo contestar" con las ideas a la vista. Se
  // clasifica con las mismas senales con que la registra src/app/api/chat/route.ts.
  const { clasificarConsulta } = await import("../../src/lib/chat-temas");
  const pregunta = "fuente de agua para el comedor comunitario";
  const resuelta = (texto: string) =>
    clasificarConsulta({ pregunta, respuesta: texto, herramientas: ["buscador-local"] }).resuelta;

  // Sin nada en ninguna edicion, sigue sin resolver.
  const nada = await sinIA.responderSinIA(pregunta, vigente);
  assert.match(nada.texto, /No encontré nada/);
  assert.equal(resuelta(nada.texto), false);
  // La respuesta de respaldo mas frecuente: las consultas de ejemplo, sin
  // asteriscos a la vista.
  assert.match(nada.texto, /«distrito 7»/);
  assert.ok(!asteriscosSueltos(nada.texto), nada.texto);

  const fijarSolucion = (solucion: string | null) =>
    base.db
      .update(base.schema.ideas)
      .set({ solucion })
      .where(
        base.sql`${base.schema.ideas.slug} = 'club-villa-urquiza' AND ${base.schema.ideas.edicionId} = ${id2025}`,
      );
  await fijarSolucion("Una fuente de agua para el comedor comunitario del club.");
  try {
    const { texto, referencias } = await sinIA.responderSinIA(pregunta, vigente);
    assert.match(texto, /Club de Villa Urquiza/);
    assert.match(texto, /^Resultados de la edición 2025/, "dice de entrada de que edicion son");
    assert.match(texto, /en la 2026 todavía no hay ideas publicadas que coincidan/);
    assert.deepEqual(
      referencias.map((r) => r.url),
      ["/proyectos/club-villa-urquiza?edicion=2025"],
    );
    assert.equal(resuelta(texto), true, "trajo datos, aunque de otra edicion");
  } finally {
    await fijarSolucion(null);
  }
});

// ---------------------------------------------------------------------------
// Votos: los de la edicion y los de los ganadores
// ---------------------------------------------------------------------------

test("estadisticas separa los votos de la edicion de los de los ganadores", async () => {
  // `votos` era solo la suma de los ganadores y la portada y Migue lo daban
  // como el total. Una idea que no gano tambien tiene votos, y una sin
  // publicar no cuenta en ningun numero publico.
  const { sql } = base;
  const fijarVotos = (slug: string, votos: number) =>
    base.consultar(sql`
      UPDATE ideas SET votos = ${votos} WHERE edicion_id = ${id2025} AND slug = ${slug}
    `);
  await fijarVotos("club-villa-urquiza", 15);
  await fijarVotos("sin-publicar-2025", 1000);
  try {
    const edicion2025 = await consultas.getEdicionParaVer(2025);
    assert.ok(edicion2025);
    const stats = await consultas.getEstadisticas(edicion2025);
    assert.equal(stats.votosGanadores, 300 + 120);
    assert.equal(stats.votosTotales, 300 + 120 + 15);

    const terminada = await herramienta("estadisticas", { edicion: 2025 });
    assert.equal(terminada.datos.votos_totales, 435);
    assert.equal(terminada.datos.votos_de_los_ganadores, 420);

    // La 2026 todavia no voto: no hay total que dar, ni un cero que lo parezca.
    const abierta = await herramienta("estadisticas", {});
    assert.equal(typeof abierta.datos.votos_totales, "string");
    assert.equal(abierta.datos.votos_de_los_ganadores, undefined);
  } finally {
    await fijarVotos("club-villa-urquiza", 0);
    await fijarVotos("sin-publicar-2025", 0);
  }
});
