/**
 * El asistente de carga (src/app/api/ideas/asistente/route.ts) mirado desde lo
 * que cuesta y desde lo que devuelve para escribir:
 *
 *  - lo que el proveedor cobro queda en `chat_consultas` aunque la salida no
 *    sirva (JSON cortado en el tope o que no pasa el zod). Es lo que suma
 *    CHAT_TOPE_TOKENS_DIA, el unico freno de gasto: si una llamada fallida
 *    quedaba en cero, el tope contaba de menos;
 *  - "Agregar lo elegido" es un pedido sobre la solucion: no reformula el
 *    problema, no redacta beneficios y no sugiere titulo, porque el formulario
 *    escribe lo que vuelve sin revision.
 *
 * Mismo andamiaje que chat-respaldo.test.ts: el route handler de verdad contra
 * una PGlite descartable, y el proveedor reemplazado en `globalThis.fetch`, que
 * es lo que usa el SDK de OpenAI. Ninguna prueba sale a la red.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cargarMinimo, crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";

let base: BaseDePrueba;
let asistente: typeof import("../../src/app/api/ideas/asistente/route");

const MODELO = "proveedor/modelo-de-prueba";
/**
 * Lo que manda el formulario: del mismo sitio y con la sesion de CIDITUC, que
 * en la etapa de ideas el asistente exige igual que el alta. La cookie se
 * firma en `before`, cuando ya hay SESSION_SECRET.
 */
const MISMO_SITIO: Record<string, string> = {
  "content-type": "application/json",
  origin: "http://localhost",
};

test.before(async () => {
  base = await crearBaseDePrueba("asistente-carga");
  await cargarMinimo(base, { etapa: "ideas" });
  process.env.OPENROUTER_API_KEY = "clave-de-prueba";
  process.env.OPENROUTER_MODELO = MODELO;
  delete process.env.CHAT_TOPE_TOKENS_DIA;
  delete process.env.MODO_PRUEBA_IDEAS;
  asistente = await import("../../src/app/api/ideas/asistente/route");
  const { firmarSesionVotante } = await import("../../src/lib/sesion");
  const { nombreCookie } = await import("../../src/lib/cookies");
  const token = await firmarSesionVotante({ votanteId: 1, distrito: null, nombre: "Vecina" });
  MISMO_SITIO.cookie = `${nombreCookie("pp_votante")}=${token}`;
});

test.after(async () => {
  delete process.env.OPENROUTER_API_KEY;
  await base.cerrar();
});

type Llamada = { messages: Array<{ role: string; content: string }> };

/** Reemplaza al proveedor mientras corre el pedido; el log del servidor se calla. */
async function conProveedor(
  responder: (llamada: Llamada) => Response,
  cuerpo: object,
): Promise<{ datos: Record<string, unknown>; llamadas: Llamada[]; log: string[] }> {
  const llamadas: Llamada[] = [];
  const log: string[] = [];
  const fetchOriginal = globalThis.fetch;
  const errorOriginal = console.error;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const llamada = JSON.parse(String(init?.body ?? "{}")) as Llamada;
    llamadas.push(llamada);
    return responder(llamada);
  }) as typeof fetch;
  console.error = (...partes: unknown[]) => {
    log.push(partes.map(String).join(" "));
  };
  try {
    const respuesta = await asistente.POST(
      new Request("http://localhost/api/ideas/asistente", {
        method: "POST",
        headers: MISMO_SITIO,
        body: JSON.stringify(cuerpo),
      }),
    );
    assert.equal(respuesta.status, 200);
    return { datos: (await respuesta.json()) as Record<string, unknown>, llamadas, log };
  } finally {
    globalThis.fetch = fetchOriginal;
    console.error = errorOriginal;
  }
}

/** Una respuesta no-stream del proveedor, con este contenido y este consumo. */
function completado(contenido: string, salida: number, motivo = "stop"): Response {
  return new Response(
    JSON.stringify({
      id: "x",
      object: "chat.completion",
      created: 0,
      model: MODELO,
      choices: [{ index: 0, message: { role: "assistant", content: contenido }, finish_reason: motivo }],
      usage: { prompt_tokens: 50, completion_tokens: salida },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/** Satisface los cuatro esquemas de salida a la vez, con un titulo distinto del actual. */
const VALIDA = JSON.stringify({
  texto: "Texto ordenado.",
  detalles: [],
  senalamientos: [],
  titulo: "Iluminación nueva para la plaza",
});
/** Lo que llega cuando la salida se corta en max_tokens: JSON a medio cerrar. */
const CORTADA = '{"texto": "Poner luminarias LED en todo el perímetro y en';

const PROPUESTA = {
  distrito: 1,
  titulo: "Luminarias en la plaza",
  problema: "La plaza del barrio está muy oscura de noche y nadie la usa.",
  solucion: "Poner luminarias LED en todo el perímetro de la plaza y en los senderos.",
};

/** La llamada de la revision es la unica cuyo pedido arranca asi. */
const esRevision = (l: Llamada) => l.messages.at(-1)?.content.startsWith("Revisá esta propuesta");

async function ultimaConsulta() {
  const [fila] = await base.consultar<{
    origen: string;
    ok: boolean;
    tokens_entrada: number | null;
    tokens_salida: number | null;
  }>(base.sql`
    SELECT origen, ok, tokens_entrada, tokens_salida
      FROM chat_consultas ORDER BY id DESC LIMIT 1
  `);
  return fila;
}

test("si las cuatro salidas no sirven, la fila fallida igual lleva lo que se cobro", async () => {
  const { datos, llamadas, log } = await conProveedor(
    () => completado(CORTADA, 2000, "length"),
    PROPUESTA,
  );
  assert.equal(llamadas.length, 4, "solucion, problema, beneficios y revision");
  assert.equal(datos.modo, "basico");

  const fila = await ultimaConsulta();
  assert.equal(fila.origen, "asistente");
  assert.equal(fila.ok, false);
  // Antes quedaba en 0 y 0: el tope diario no veia nada de esto.
  assert.equal(fila.tokens_entrada, 4 * 50);
  assert.equal(fila.tokens_salida, 4 * 2000);
  assert.ok(log.some((linea) => linea.includes("salida inválida") && linea.includes("length")));
});

test("si una sola salida sirve, la fila cuenta tambien las que no", async () => {
  const { datos } = await conProveedor(
    (llamada) => (esRevision(llamada) ? completado(VALIDA, 10) : completado(CORTADA, 2000, "length")),
    PROPUESTA,
  );
  const fila = await ultimaConsulta();
  assert.equal(fila.ok, true);
  assert.equal(fila.tokens_entrada, 4 * 50);
  assert.equal(fila.tokens_salida, 10 + 3 * 2000);

  // Las tres reescrituras fallaron y la revision vino limpia: sin aviso, el
  // panel decia "Tu propuesta se entiende y está completa".
  assert.equal(datos.modo, "ia");
  assert.match(String(datos.aviso), /No pudimos ordenar parte de tu texto/);
});

test("con todas las llamadas bien, la respuesta no lleva aviso", async () => {
  const { datos } = await conProveedor(() => completado(VALIDA, 10), PROPUESTA);
  assert.equal(datos.aviso, null);
});

test("agregar aspectos pide solo la solucion y la revision, y no devuelve otro titulo", async () => {
  const elegido = "Iluminación peatonal en los senderos";
  const { datos, llamadas } = await conProveedor(() => completado(VALIDA, 10), {
    ...PROPUESTA,
    beneficios: "",
    agregar: [elegido],
  });

  // Ni el problema ni los beneficios: el formulario escribe derecho lo que
  // vuelve, y esos campos la persona no los pidio en esta vuelta.
  assert.equal(llamadas.length, 2);
  const pedidos = llamadas.map((l) => l.messages.at(-1)?.content ?? "");
  assert.ok(pedidos.some((p) => p.includes(`<aspecto_elegido>${elegido}</aspecto_elegido>`)));
  assert.ok(!pedidos.some((p) => p.includes("Es su problema.")));
  assert.ok(!pedidos.some((p) => p.includes("beneficios_escritos_por_la_persona")));

  const propuesta = datos.propuesta as Record<string, string | null>;
  assert.equal(propuesta.solucion, "Texto ordenado.");
  assert.equal(propuesta.titulo, null, "el titulo de la revision se ignora");
  assert.equal(propuesta.problema, null);
  assert.equal(propuesta.beneficios, null);
});

test("sin punto marcado, la ayuda responde igual y dice que falta el lugar", async () => {
  // El formulario manda `distrito: null` mientras no hay punto (el riel deja
  // saltar al paso 2 sin marcar el mapa). Antes la ruta respondia 400 con "No
  // se entendió el pedido." y la persona no sabia que lo que faltaba era el mapa.
  const { datos, llamadas } = await conProveedor(() => completado(VALIDA, 10), {
    ...PROPUESTA,
    distrito: null,
  });
  assert.equal(llamadas.length, 4, "el modelo trabaja igual sobre el texto");
  assert.deepEqual(datos.parecidas, [], "sin distrito no hay con que buscar parecidas");
  const faltantes = datos.faltantes as string[];
  assert.ok(
    faltantes.some((texto) => texto.startsWith("Marcá en el mapa")),
    "el lugar aparece entre lo que falta",
  );
  const pedidos = llamadas.map((l) => l.messages.at(-1)?.content ?? "");
  assert.ok(pedidos.every((p) => !p.includes("<distrito>null</distrito>")));
  assert.ok(pedidos.some((p) => p.includes("<distrito>no indicado</distrito>")));

  // Con el punto marcado, el lugar no figura entre lo que falta.
  const conPunto = await conProveedor(() => completado(VALIDA, 10), PROPUESTA);
  assert.ok(!(conPunto.datos.faltantes as string[]).some((t) => t.startsWith("Marcá en el mapa")));
});

test("sin aspectos elegidos, la ayuda sigue proponiendo los cuatro campos", async () => {
  const { datos, llamadas } = await conProveedor(() => completado(VALIDA, 10), PROPUESTA);
  assert.equal(llamadas.length, 4);
  const propuesta = datos.propuesta as Record<string, string | null>;
  assert.equal(propuesta.titulo, "Iluminación nueva para la plaza");
  assert.equal(propuesta.problema, "Texto ordenado.");
  assert.equal(propuesta.beneficios, "Texto ordenado.");
});

test("la parte sin modelo tambien tiene tope por persona, aun sin clave del proveedor", async () => {
  // Sin clave, la ruta devuelve antes de llegar al tope del modelo; la busqueda
  // de parecidas (una consulta a la base) quedaba sin ningun limite. Otra
  // persona, para no gastarle el cupo a las pruebas de arriba.
  const { firmarSesionVotante } = await import("../../src/lib/sesion");
  const { nombreCookie } = await import("../../src/lib/cookies");
  const token = await firmarSesionVotante({ votanteId: 2, distrito: null, nombre: "Vecino" });
  const cabeceras = { ...MISMO_SITIO, cookie: `${nombreCookie("pp_votante")}=${token}` };
  const pedir = () =>
    asistente.POST(
      new Request("http://localhost/api/ideas/asistente", {
        method: "POST",
        headers: cabeceras,
        body: JSON.stringify(PROPUESTA),
      }),
    );

  const clave = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const primera = await pedir();
    assert.equal(primera.status, 200);
    assert.equal(((await primera.json()) as { modo: string }).modo, "basico");

    // El resto del cupo de la hora (TOPE_BASICO_POR_HORA, 60) de una vez.
    const { consumir } = await import("../../src/lib/rate-limit");
    for (let i = 1; i < 60; i++) await consumir("asistente-basico:v:2", 60, 3600);

    const pasada = await pedir();
    assert.equal(pasada.status, 429);
    assert.match(String(((await pasada.json()) as { error: string }).error), /a mano/);
  } finally {
    process.env.OPENROUTER_API_KEY = clave;
  }
});
