/**
 * Pruebas del clasificador de temas de las consultas de Migue
 * (src/lib/chat-temas.ts). No tocan la base ni la red: el modulo es puro, asi
 * que estas pruebas van en la tanda `test:puras`.
 *
 * Las preguntas de ejemplo estan escritas como las escribe un vecino: en
 * minuscula, con faltas y sin tildes. Las que si llevan tildes estan a
 * proposito, para fijar que la comparacion es sobre el texto normalizado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  claveDePregunta,
  clasificarConsulta,
  consultaResuelta,
  ETIQUETA_TEMA,
  TEMA_POR_HERRAMIENTA,
  TEMAS,
  temaDeConsulta,
} from "../../src/lib/chat-temas";

/** Respuesta tal como la escribe el buscador deterministico sin clave. */
const SIN_RESULTADOS = "No encontré nada con esa consulta. Probá con:";

// ---------------------------------------------------------------------------
// Tema: la senal de las herramientas manda
// ---------------------------------------------------------------------------

test("la herramienta que uso Migue gana sobre las palabras de la pregunta", () => {
  // La pregunta menciona la votacion y una fecha, pero Migue entendio que era
  // por una zona y llamo a resumen_distrito: eso es lo que vale.
  assert.equal(
    temaDeConsulta("cuando cierra la votacion en mi zona", ["resumen_distrito"]),
    "distrito",
  );
  // "obras" apuntaria a proyectos; ubicar_barrio dice que preguntaba por su barrio.
  assert.equal(temaDeConsulta("que obras hay por casa", ["ubicar_barrio"]), "distrito");
  // Sin la herramienta, la misma pregunta cae donde dicen las palabras.
  assert.equal(temaDeConsulta("cuando cierra la votacion en mi zona"), "votar");
});

test("entre varias herramientas manda la mas especifica", () => {
  assert.equal(
    temaDeConsulta("quiero una plaza en mi barrio", ["buscar_proyectos", "como_presentar_idea"]),
    "presentar_idea",
  );
  assert.equal(
    temaDeConsulta("que hay en el distrito 5", ["buscar_proyectos", "ubicar_barrio"]),
    "distrito",
  );
  assert.equal(
    temaDeConsulta("contame de la plaza democracia", ["buscar_proyectos", "detalle_proyecto"]),
    "proyectos",
  );
});

test("estadisticas es una senal floja y cede ante las palabras", () => {
  // Con los totales se contesta cualquiera de las dos, asi que deciden las palabras.
  assert.equal(temaDeConsulta("cuanta plata se puso en total", ["estadisticas"]), "presupuesto");
  // Si las palabras no dicen nada, recien ahi vale el tema de la herramienta.
  assert.equal(temaDeConsulta("cual es el mas votado", ["estadisticas"]), "proyectos");
  // Y siempre pierde contra una herramienta firme.
  assert.equal(
    temaDeConsulta("dame los numeros", ["estadisticas", "resumen_distrito"]),
    "distrito",
  );
});

test("una herramienta que no esta en el catalogo no aporta tema", () => {
  // "buscador-local" es lo que registra el modo sin clave: se ignora entero.
  assert.equal(temaDeConsulta("hola, todo bien?", ["buscador-local"]), "otro");
  assert.equal(temaDeConsulta("como me empadrono", ["buscador-local"]), "votar");
});

// ---------------------------------------------------------------------------
// Tema: el respaldo por palabras
// ---------------------------------------------------------------------------

test("sin herramientas el tema sale de las palabras de la pregunta", () => {
  assert.equal(temaDeConsulta("hasta cuando puedo presentar una idea"), "presentar_idea");
  assert.equal(temaDeConsulta("como me empadrono para votar"), "votar");
  assert.equal(temaDeConsulta("cuando empieza la etapa que viene"), "cronograma");
  assert.equal(temaDeConsulta("cuanto sale hacer un playon"), "presupuesto");
  assert.equal(temaDeConsulta("a que distrito pertenece villa 9 de julio"), "distrito");
  assert.equal(temaDeConsulta("que proyectos ganaron el año pasado"), "proyectos");
});

test("primero la intencion y despues el recorte: presentar gana a cuando", () => {
  // La persona vino a presentar una idea; el "cuando" es un detalle de eso.
  assert.equal(temaDeConsulta("hasta cuando puedo presentar una idea"), "presentar_idea");
  assert.equal(temaDeConsulta("que fecha vence para cargar mi idea"), "presentar_idea");
  // Sin la intencion, la misma fecha es una pregunta de cronograma.
  assert.equal(temaDeConsulta("que fecha vence"), "cronograma");
});

test("nombrar una idea es querer presentarla, salvo que se pregunte el resultado", () => {
  // Sin decir que quiere hacer con ella: se la quiere presentar.
  assert.equal(temaDeConsulta("tengo una idea para la plaza del barrio"), "presentar_idea");
  assert.equal(temaDeConsulta("mi idea es poner luces en la cancha"), "presentar_idea");
  // Con una palabra de resultado, la misma mencion pregunta por el proyecto.
  assert.equal(temaDeConsulta("mi idea salio ganadora?"), "proyectos");
  assert.equal(temaDeConsulta("una idea que presente el año pasado gano?"), "proyectos");
  assert.equal(temaDeConsulta("mi idea fue rechazada?"), "proyectos");
  // Pero un verbo de intencion explicito manda igual: la mencion suelta cede y
  // el recorrido de marcadores lo agarra mas abajo.
  assert.equal(
    temaDeConsulta("quiero presentar mi idea, gano algo con eso?"),
    "presentar_idea",
  );
});

test("el nombre del programa no cuenta como pregunta de plata", () => {
  assert.equal(temaDeConsulta("que es el presupuesto participativo"), "otro");
  assert.equal(temaDeConsulta("para que sirve el presupuesto participativo?"), "otro");
  // La palabra sola, sin el nombre del programa, si es una pregunta de montos.
  assert.equal(temaDeConsulta("de cuanto es el presupuesto de este año"), "presupuesto");
});

test("los marcadores se comparan como palabra completa, no como prefijo", () => {
  // "presentaron" no es "presentar": pregunta por lo que se presento, no por como.
  assert.equal(temaDeConsulta("cuantas ideas se presentaron"), "proyectos");
  // "votos" y "votado" no son "voto": el mas votado es una pregunta por proyectos.
  assert.equal(temaDeConsulta("cuantos votos tuvo la plaza"), "proyectos");
  assert.equal(temaDeConsulta("cual fue el proyecto mas votado"), "proyectos");
  // Las formas que si estan siguen cayendo en votar.
  assert.equal(temaDeConsulta("donde voto"), "votar");
});

test("las palabras se comparan sin tildes ni mayusculas", () => {
  assert.equal(temaDeConsulta("¿Cuándo es la votación?"), temaDeConsulta("cuando es la votacion"));
  assert.equal(temaDeConsulta("¿Cuándo es la votación?"), "votar");
  assert.equal(temaDeConsulta("como es la PRESENTACIÓN de ideas"), "presentar_idea");
  assert.equal(temaDeConsulta("cuánta inversión hubo"), "presupuesto");
  assert.equal(temaDeConsulta("en qué DISTRITO vivo"), "distrito");
});

test("lo que no encaja cae en el cajon y no en un tema al azar", () => {
  assert.equal(temaDeConsulta("hola"), "otro");
  assert.equal(temaDeConsulta("gracias!!"), "otro");
  assert.equal(temaDeConsulta(""), "otro");
  assert.equal(temaDeConsulta("   "), "otro");
  assert.equal(temaDeConsulta("quien es el intendente"), "otro");
  // Un reclamo puntual: el sitio no lo cubre, y que se acumule es el dato.
  assert.equal(temaDeConsulta("se puede arreglar el alumbrado de mi cuadra?"), "otro");
});

test("preguntas como las escribe un vecino caen donde tienen que caer", () => {
  assert.equal(
    temaDeConsulta("ola queria saber asta cuando puedo presentar mi idea para el barrio"),
    "presentar_idea",
  );
  assert.equal(temaDeConsulta("en q distrito estoy si vivo en villa 9 de julio"), "distrito");
  assert.equal(
    temaDeConsulta("kiero saber si me tengo q empadronar para votar la plaza"),
    "votar",
  );
  assert.equal(temaDeConsulta("cuanta plata le dieron a la cancha del bº sur"), "presupuesto");
  assert.equal(temaDeConsulta("q dia cierra todo esto"), "cronograma");
  assert.equal(temaDeConsulta("se hizo algo en el playon de mi zona?", ["ubicar_barrio"]), "distrito");
});

// ---------------------------------------------------------------------------
// Resuelta o no
// ---------------------------------------------------------------------------

test("una consulta cortada por un error nunca cuenta como resuelta", () => {
  assert.equal(
    consultaResuelta({
      herramientas: ["buscar_proyectos"],
      respuesta: "Hubo un problema para responderte. Probá de nuevo en un rato.",
      huboError: true,
    }),
    false,
  );
  // El error manda incluso cuando la herramienta ya habia traido datos.
  assert.equal(
    consultaResuelta({ herramientas: ["estadisticas"], sinDatos: [], huboError: true }),
    false,
  );
});

test("una respuesta que admite que no encontro nada no cuenta como resuelta", () => {
  // El buscador deterministico: su nombre no esta en el catalogo, decide el texto.
  assert.equal(
    consultaResuelta({ herramientas: ["buscador-local"], respuesta: SIN_RESULTADOS }),
    false,
  );
  assert.equal(consultaResuelta({ respuesta: "No tengo ese dato cargado todavía." }), false);
  assert.equal(consultaResuelta({ respuesta: "El monto no está publicado." }), false);
  // Sin herramientas y con una respuesta que si contesta, queda resuelta.
  assert.equal(
    consultaResuelta({
      herramientas: ["buscador-local"],
      respuesta: "Encontré 3 ideas de la categoría Espacios verdes:",
    }),
    true,
  );
});

test("una respuesta vacia no cuenta como resuelta", () => {
  assert.equal(consultaResuelta({ respuesta: "" }), false);
  assert.equal(consultaResuelta({ respuesta: "   \n " }), false);
  assert.equal(consultaResuelta({ respuesta: null }), false);
  // El texto vacio manda por encima de la herramienta que trajo datos.
  assert.equal(consultaResuelta({ herramientas: ["estadisticas"], respuesta: "  " }), false);
  // Que no se pase respuesta no es lo mismo que que llegue vacia.
  assert.equal(consultaResuelta({}), true);
});

test("si una herramienta trajo datos la consulta esta resuelta aunque falte un dato", () => {
  assert.equal(
    consultaResuelta({
      herramientas: ["resumen_distrito"],
      sinDatos: [],
      respuesta: "El distrito 5 tiene 12 proyectos. El monto todavía no está publicado.",
    }),
    true,
  );
  // Con dos herramientas alcanza que una haya traido datos.
  assert.equal(
    consultaResuelta({
      herramientas: ["ubicar_barrio", "buscar_proyectos"],
      sinDatos: ["buscar_proyectos"],
      respuesta: "Villa Urquiza está en el distrito 5, pero todavía no hay ideas cargadas ahí.",
    }),
    true,
  );
});

test("si todas las herramientas avisaron que no hay datos, no esta resuelta", () => {
  assert.equal(
    consultaResuelta({
      herramientas: ["buscar_proyectos"],
      sinDatos: ["buscar_proyectos"],
      respuesta: "Busqué en las ideas cargadas y no encontré ninguna sobre eso.",
    }),
    false,
  );
  assert.equal(
    consultaResuelta({
      herramientas: ["ubicar_barrio", "resumen_distrito"],
      sinDatos: ["ubicar_barrio", "resumen_distrito"],
      respuesta: "Ese barrio no figura en el listado que tengo.",
    }),
    false,
  );
});

test("una herramienta que no esta en el catalogo no puede dejar la consulta sin resolver", () => {
  assert.equal(
    consultaResuelta({
      herramientas: ["buscador-local"],
      sinDatos: ["buscador-local"],
      respuesta: "Estas son las ideas del distrito 3:",
    }),
    true,
  );
});

// ---------------------------------------------------------------------------
// Clave para agrupar preguntas
// ---------------------------------------------------------------------------

test("dos formas de escribir la misma pregunta comparten clave", () => {
  assert.equal(claveDePregunta("¿Cómo voto?"), claveDePregunta("como voto"));
  assert.equal(claveDePregunta("¿Cómo voto?"), "como voto");
  assert.equal(
    claveDePregunta("  ¿Hasta CUÁNDO puedo presentar mi idea??  "),
    "hasta cuando puedo presentar mi idea",
  );
  assert.equal(claveDePregunta("como   voto"), "como voto");
  assert.equal(claveDePregunta("¿¿??"), "");
  // Los numeros se conservan: no es lo mismo el distrito 3 que el 5.
  assert.equal(claveDePregunta("Distrito 5?"), "distrito 5");
});

// ---------------------------------------------------------------------------
// Las dos decisiones juntas
// ---------------------------------------------------------------------------

test("clasificarConsulta resuelve tema y resuelta en una sola pasada", () => {
  assert.deepEqual(
    clasificarConsulta({
      pregunta: "ola, en q distrito queda villa 9 de julio?",
      herramientas: ["ubicar_barrio"],
      sinDatos: [],
      respuesta: "Villa 9 de Julio está en el distrito 8.",
    }),
    { tema: "distrito", resuelta: true },
  );
  // La pregunta que mas importa del panel: tema claro y sin resolver.
  assert.deepEqual(
    clasificarConsulta({
      pregunta: "puedo presentar una idea para el parque?",
      herramientas: ["como_presentar_idea"],
      sinDatos: ["como_presentar_idea"],
      respuesta: "Ese dato no está cargado. Mirá /acerca-de.",
    }),
    { tema: "presentar_idea", resuelta: false },
  );
  // Camino sin clave: no hay herramientas del catalogo y decide el texto.
  assert.deepEqual(
    clasificarConsulta({
      pregunta: "cuanto cuesta arreglar la vereda de mi cuadra",
      herramientas: ["buscador-local"],
      respuesta: SIN_RESULTADOS,
    }),
    { tema: "presupuesto", resuelta: false },
  );
});

// ---------------------------------------------------------------------------
// Coherencia de las listas
// ---------------------------------------------------------------------------

test("cada tema tiene etiqueta visible y cada herramienta apunta a un tema real", () => {
  assert.deepEqual(Object.keys(ETIQUETA_TEMA).sort(), [...TEMAS].sort());
  for (const tema of TEMAS) {
    assert.ok(ETIQUETA_TEMA[tema].trim().length, `falta la etiqueta de ${tema}`);
  }
  for (const [herramienta, tema] of Object.entries(TEMA_POR_HERRAMIENTA)) {
    assert.ok(
      (TEMAS as readonly string[]).includes(tema),
      `${herramienta} apunta a un tema que no existe: ${tema}`,
    );
  }
  // "otro" es el cajon: ninguna herramienta puede clasificar ahi.
  assert.ok(!Object.values(TEMA_POR_HERRAMIENTA).includes("otro"));
});

test("una salvedad al pie no hunde una respuesta que si contesto", () => {
  // El prompt de sistema le PIDE agregar esa salvedad ("Si no aparece, mandalo
  // al mapa"), asi que buscar la frase en toda la respuesta penalizaba justo la
  // conducta que se le exige. Se mira la primera oracion: una respuesta que no
  // tiene el dato lo dice de entrada, no en una nota al final.
  assert.equal(
    consultaResuelta({
      respuesta:
        "Sí, podés votar: tenés un voto en tu distrito. Si tu nombre no aparece en el padrón, empadronate con CIDITUC desde la web municipal.",
    }),
    true,
  );
  assert.equal(
    consultaResuelta({
      respuesta:
        "El plazo para presentar ideas cierra el 30 de septiembre. Si tu barrio no figura en el listado, mirá el mapa en /distritos.",
    }),
    true,
  );
  // Y lo que tiene que seguir detectando: la respuesta que admite de entrada.
  assert.equal(consultaResuelta({ respuesta: "No encontré nada con esa consulta. Probá con:" }), false);
  assert.equal(
    consultaResuelta({ respuesta: "No tengo ese dato cargado todavía. Mirá el cronograma en /acerca-de." }),
    false,
  );
  // Una sola oracion larga que admite: el corte a 160 caracteres la agarra.
  assert.equal(
    consultaResuelta({
      respuesta:
        "No está cargado el monto de esa obra en el sistema, así que no te lo puedo dar y conviene que consultes en la municipalidad",
    }),
    false,
  );
});
