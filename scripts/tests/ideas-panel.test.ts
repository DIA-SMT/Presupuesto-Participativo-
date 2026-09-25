/**
 * Las ideas que el equipo carga, corrige y descarta desde el panel
 * (src/app/admin/ideas/operaciones.ts), probadas contra una base de verdad.
 *
 * Las server actions (acciones.ts) no se pueden invocar sin contexto de pedido
 * (leen la cookie de sesion), pero no deciden nada: autorizan y llaman a estas
 * operaciones con la sesion ya resuelta. Asi que probar las operaciones es
 * probar lo que el panel hace.
 *
 * Lo que se fija aca:
 *  - la carga sale igual que una del formulario (pendiente, sin publicar,
 *    numero correlativo, codigo de seguimiento) y deja su fila "alta";
 *  - dos cargas a la vez no repiten el numero (el bug del max()+1 suelto);
 *  - la politica de etapas vale adentro de la transaccion;
 *  - una correccion no cambia el slug, deja el antes y el despues, y no muda de
 *    distrito una idea con votos;
 *  - una descartada no cuenta en ningun numero, ni publico ni del panel, aunque
 *    alguien la publicara a mano.
 *
 * Lo que no se prueba: la espera entre dos transacciones a la vez. PGlite
 * atiende de a una, asi que las cargas "simultaneas" de abajo se serializan
 * solas. Lo que si muestran es que el numero y el slug se calculan adentro de
 * la transaccion que inserta: con el calculo afuera, como era antes, la segunda
 * carga leia el mismo max() que la primera.
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
let operaciones: typeof import("../../src/app/admin/ideas/operaciones");
let consultas: typeof import("../../src/db/queries");
let alta: typeof import("../../src/lib/alta-idea");
let comun: typeof import("../../src/app/admin/comun");
let avisos: typeof import("../../src/lib/avisos");
let sesion: {
  adminId: number;
  email: string;
  nombre: string;
  rol: "admin" | "moderador" | "lector";
};

/** Un dia fijo, para que la validacion de la fecha no dependa de cuando corre. */
const HOY = "2026-09-25";

/** Puntos de verdad sobre la geometria oficial (public/geo/distritos.geojson). */
const PUNTO = {
  d1: { lat: "-26.7965902", lon: "-65.2515113" },
  d1b: { lat: "-26.7968000", lon: "-65.2518000" },
  d2: { lat: "-26.7968201", lon: "-65.2398858" },
  d5: { lat: "-26.8040748", lon: "-65.2058781" },
  fuera: { lat: "-26.7000000", lon: "-65.0000000" },
};

test.before(async () => {
  base = await crearBaseDePrueba("ideas-panel");
  const minimo = await cargarMinimo(base, { etapa: "ideas" });
  edicionId = minimo.edicionId;

  // cargarMinimo trae los distritos 1 y 2; el punto de una idea puede caer en
  // cualquiera de los 20, y la clave foranea los pide a todos.
  for (let numero = 3; numero <= 20; numero += 1) {
    await base.db.insert(base.schema.distritos).values({
      id: numero,
      numero,
      nombre: `Distrito ${numero}`,
      geojson: { type: "MultiPolygon", coordinates: [] },
      centroideLat: "-26.8",
      centroideLon: "-65.2",
    });
  }
  await base.db.insert(base.schema.categorias).values({
    slug: "socio-ambiental",
    nombre: "Socio-ambiental",
    descripcion: "Plazas y espacios verdes",
    color: "#2f9e5f",
    orden: 2,
  });

  // La fila de `revisiones` apunta a la cuenta que hizo el cambio.
  const [cuenta] = await base.db
    .insert(base.schema.admins)
    .values({
      email: "equipo@smt.gob.ar",
      nombre: "Equipo de prueba",
      passwordHash: "no-se-usa",
      rol: "moderador",
    })
    .returning({ id: base.schema.admins.id });
  sesion = { adminId: cuenta.id, email: "equipo@smt.gob.ar", nombre: "Equipo de prueba", rol: "moderador" };

  // Despues de crear la base: src/db elige el driver al importarse.
  operaciones = await import("../../src/app/admin/ideas/operaciones");
  consultas = await import("../../src/db/queries");
  alta = await import("../../src/lib/alta-idea");
  comun = await import("../../src/app/admin/comun");
  avisos = await import("../../src/lib/avisos");
});

test.after(async () => {
  await base.cerrar();
});

/** Lo que manda el formulario del panel, con todo en regla. */
function formulario(cambios: Record<string, string> = {}): Record<string, string> {
  return {
    canal: "asamblea",
    canalDetalle: "Asamblea del distrito 1, 12/09/2026",
    fecha: "2026-09-12",
    autorNombre: "Juana Pérez",
    titulo: "Iluminación de la plaza del barrio",
    categoria: "urbana",
    barrio: "Villa Luján",
    solucion: "Poner luminarias LED en todo el perímetro de la plaza y en los senderos.",
    problema: "La plaza queda a oscuras de noche y los vecinos dejaron de usarla.",
    beneficios: "",
    ...PUNTO.d1,
    ...cambios,
  };
}

async function etapa(nueva: "ideas" | "evaluacion" | "votacion" | "seguimiento" | "cerrada") {
  const { eq } = await import("drizzle-orm");
  await base.db
    .update(base.schema.ediciones)
    .set({ etapa: nueva })
    .where(eq(base.schema.ediciones.id, edicionId));
}

async function filaDe(id: number) {
  const { eq } = await import("drizzle-orm");
  const [fila] = await base.db
    .select()
    .from(base.schema.ideas)
    .where(eq(base.schema.ideas.id, id));
  return fila;
}

async function historialDe(id: number) {
  const { asc, eq } = await import("drizzle-orm");
  return base.db
    .select()
    .from(base.schema.revisiones)
    .where(eq(base.schema.revisiones.ideaId, id))
    .orderBy(asc(base.schema.revisiones.id));
}

async function cuantasIdeas(): Promise<number> {
  const [fila] = await base.consultar<{ total: number }>(
    base.sql`SELECT count(*)::int AS total FROM ideas`,
  );
  return Number(fila.total);
}

/** Carga con el formulario y devuelve la idea, o falla la prueba. */
async function cargar(cambios: Record<string, string> = {}) {
  const resultado = await operaciones.registrarAlta(formulario(cambios), sesion, HOY);
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.error);
  return resultado.idea;
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

test("el panel carga una idea igual que el formulario, con su canal, su fecha y su fila de alta", async () => {
  const idea = await cargar();

  assert.equal(idea.distrito, 1, "el distrito sale del punto, no lo elige nadie");
  assert.ok(avisos.codigoValido(idea.id, idea.codigo), "el codigo es el de seguimiento de esa idea");
  assert.equal(idea.anio, 2026);

  const fila = await filaDe(idea.id);
  assert.equal(fila.estado, "pendiente");
  assert.equal(fila.publicada, false, "entra sin publicar, como las del formulario");
  assert.equal(fila.canal, "asamblea");
  assert.equal(fila.canalDetalle, "Asamblea del distrito 1, 12/09/2026");
  assert.equal(fila.fecha, "2026-09-12", "la fecha es la del papel, no la de la carga");
  assert.equal(fila.cargadoPor, "Equipo de prueba");
  assert.equal(fila.autorNombre, "Juana Pérez");
  assert.equal(fila.autorEmail, null, "el panel no pide ni guarda correo");
  assert.equal(fila.autorAvisos, false);
  assert.equal(fila.ubicacionAproximada, false);
  assert.equal(fila.beneficios, null, "un campo opcional vacio queda en nulo");

  const historial = await historialDe(idea.id);
  assert.equal(historial.length, 1);
  assert.equal(historial[0].accion, "alta");
  assert.equal(historial[0].estadoNuevo, "pendiente");
  assert.equal(historial[0].adminId, sesion.adminId);
  assert.match(historial[0].nota ?? "", /Llegó por una asamblea: Asamblea del distrito 1/);
  assert.match(historial[0].nota ?? "", /Presentada el 12\/09\/2026/);
  // El historial no se borra nunca y la purga de contactos si borra el nombre:
  // copiarlo aca lo haria sobrevivir a la purga.
  assert.ok(!(historial[0].nota ?? "").includes("Juana"), "el nombre del autor no va al historial");
});

test("un correo que llegue igual en el formulario del panel no se guarda", async () => {
  const idea = await cargar({
    autorEmail: "vecina@example.com",
    autorAvisos: "1",
    titulo: "Veredas nuevas frente a la escuela",
  });
  const fila = await filaDe(idea.id);
  assert.equal(fila.autorEmail, null);
  assert.equal(fila.autorAvisos, false);
});

test("el punto aproximado queda marcado, y el titulo se normaliza como en el formulario", async () => {
  const idea = await cargar({
    aproximada: "1",
    titulo: "PLAYON DEPORTIVO DEL BARRIO",
    barrio: "b° villa luján",
  });
  const fila = await filaDe(idea.id);
  assert.equal(fila.ubicacionAproximada, true);
  assert.equal(fila.titulo, "Playón Deportivo del Barrio");
  assert.equal(idea.titulo, fila.titulo, "el comprobante muestra lo que quedo guardado");
  assert.equal(fila.barrio, "Villa luján", "sin el prefijo, como normaliza el formulario");
  const historial = await historialDe(idea.id);
  assert.match(historial[0].nota ?? "", /El punto marcado es aproximado/);
});

test("cargas simultaneas del panel y del formulario no repiten el numero ni el slug", async () => {
  const antes = await cuantasIdeas();
  const titulo = "Arbolado de la avenida principal";

  // Cinco del panel y dos del formulario publico, todas a la vez y con el
  // mismo titulo: el numero y el slug salen de la misma transaccion.
  const resultados = await Promise.all([
    ...Array.from({ length: 5 }, () =>
      operaciones.registrarAlta(formulario({ titulo }), sesion, HOY),
    ),
    ...Array.from({ length: 2 }, () =>
      alta.crearIdea(
        {
          edicionId,
          titulo,
          categoria: "urbana",
          problema: "Faltan árboles y en verano no se puede caminar por la avenida.",
          solucion: "Plantar especies nativas a lo largo de toda la avenida principal.",
          lat: Number(PUNTO.d2.lat),
          lon: Number(PUNTO.d2.lon),
          canal: "web",
          fecha: HOY,
        },
        { etapaPermitida: () => null },
      ),
    ),
  ]);

  const numeros: number[] = [];
  for (const resultado of resultados) {
    if (!resultado.ok) assert.fail("error" in resultado ? resultado.error : resultado.mensaje);
    numeros.push("idea" in resultado ? resultado.idea.numero : resultado.numero);
  }
  assert.equal(new Set(numeros).size, 7, `numeros repetidos: ${numeros.join(", ")}`);
  assert.equal(await cuantasIdeas(), antes + 7);

  const slugs = await base.consultar<{ slug: string }>(base.sql`
    SELECT slug FROM ideas WHERE titulo = ${titulo} ORDER BY id
  `);
  assert.equal(new Set(slugs.map((f) => f.slug)).size, 7, "los siete slugs son distintos");
  assert.equal(slugs[0].slug, "arbolado-de-la-avenida-principal");
  assert.equal(slugs[1].slug, "arbolado-de-la-avenida-principal-2");
});

test("el numero sigue al mas alto de la edicion, aunque haya huecos", async () => {
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Una idea con un numero alto",
    slug: "una-idea-con-un-numero-alto",
    numero: 500,
    estado: "pendiente",
  });
  const idea = await cargar({ titulo: "La que viene despues del quinientos" });
  assert.equal(idea.numero, 501);
});

test("el slug no choca aunque la cuenta de siempre diera uno ya tomado", async () => {
  // "Plaza del sol 2" es un titulo propio: su slug es plaza-del-sol-2. La
  // cuenta vieja, para una "Plaza del sol" nueva, contaba ese slug como un
  // "plaza-del-sol-N" y proponia plaza-del-sol-2 otra vez: el indice unico lo
  // rechazaba y el vecino veia "no se pudo guardar la idea".
  await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Plaza del sol 2",
    slug: "plaza-del-sol-2",
    estado: "pendiente",
  });
  const primera = await cargar({ titulo: "Plaza del sol" });
  const [fila] = await base.consultar<{ slug: string }>(
    base.sql`SELECT slug FROM ideas WHERE id = ${primera.id}`,
  );
  assert.equal(fila.slug, "plaza-del-sol-3");
});

test("la carga valida lo mismo que el formulario publico, con mensajes que dicen que falta", async () => {
  const antes = await cuantasIdeas();
  const casos: Array<[string, Record<string, string>, RegExp]> = [
    ["sin punto", { lat: "", lon: "" }, /Marcá en el mapa/],
    ["fuera del ejido", PUNTO.fuera, /fuera de los 20 distritos/],
    ["titulo corto", { titulo: "Plaza" }, /El título tiene que tener entre 8/],
    ["solucion corta", { solucion: "Luces." }, /“Qué se propone” tiene que tener entre 30/],
    ["problema corto", { problema: "Oscuro." }, /“Por qué hace falta” tiene que tener entre 30/],
    ["sin categoria", { categoria: "" }, /Elegí una categoría/],
    ["categoria inventada", { categoria: "deportes-extremos" }, /Categoría desconocida/],
    ["canal web", { canal: "web" }, /Elegí por dónde llegó la idea/],
    ["sin de donde vino", { canalDetalle: "" }, /Contá de dónde vino/],
    ["fecha futura", { fecha: "2026-09-26" }, /no puede ser posterior a hoy/],
    ["fecha inexistente", { fecha: "2026-02-31" }, /no existe/],
    ["fecha vieja", { fecha: "2024-12-31" }, /anterior a 2025/],
  ];
  for (const [nombre, cambios, esperado] of casos) {
    const resultado = await operaciones.registrarAlta(formulario(cambios), sesion, HOY);
    assert.equal(resultado.ok, false, nombre);
    if (!resultado.ok) assert.match(resultado.error, esperado, nombre);
  }
  assert.equal(await cuantasIdeas(), antes, "ningun rechazo escribio nada");
});

test("la carga del panel sigue la politica de etapas: hasta la evaluacion si, desde la votacion no", async () => {
  try {
    await etapa("evaluacion");
    const tardia = await cargar({ titulo: "Idea de una asamblea tardía" });
    assert.equal((await filaDe(tardia.id)).estado, "pendiente");

    for (const cerrada of ["votacion", "seguimiento", "cerrada"] as const) {
      await etapa(cerrada);
      const antes = await cuantasIdeas();
      const resultado = await operaciones.registrarAlta(formulario(), sesion, HOY);
      assert.equal(resultado.ok, false, cerrada);
      if (!resultado.ok) assert.match(resultado.error, /edición siguiente/, cerrada);
      assert.equal(await cuantasIdeas(), antes, `${cerrada}: no se escribio nada`);
    }
  } finally {
    await etapa("ideas");
  }
});

test("la etapa se vuelve a mirar adentro de la transaccion, no solo antes", async () => {
  // Es el caso de alguien que abre la votacion mientras otra persona carga:
  // la lectura de afuera vio "ideas", la de adentro ve la etapa nueva.
  const antes = await cuantasIdeas();
  const resultado = await alta.crearIdea(
    {
      edicionId,
      titulo: "La que llega con la etapa cambiada",
      categoria: "urbana",
      problema: "Un texto de problema con el largo suficiente para pasar.",
      solucion: "Un texto de solucion con el largo suficiente para pasar.",
      lat: Number(PUNTO.d1.lat),
      lon: Number(PUNTO.d1.lon),
      canal: "asamblea",
      fecha: HOY,
    },
    { etapaPermitida: () => "La etapa cambió." },
  );
  assert.deepEqual(resultado, { ok: false, motivo: "etapa", mensaje: "La etapa cambió." });
  assert.equal(await cuantasIdeas(), antes);
});

// ---------------------------------------------------------------------------
// Correccion
// ---------------------------------------------------------------------------

/** El formulario de correccion con los valores que la idea tiene hoy. */
async function correccion(id: number, cambios: Record<string, string> = {}) {
  const fila = await filaDe(id);
  const [categoria] = await base.consultar<{ slug: string }>(
    base.sql`SELECT slug FROM categorias WHERE id = ${fila.categoriaId}`,
  );
  return {
    id: String(id),
    titulo: fila.titulo,
    categoria: categoria?.slug ?? "urbana",
    barrio: fila.barrio ?? "",
    problema: fila.problema ?? "",
    solucion: fila.solucion ?? "",
    beneficios: fila.beneficios ?? "",
    lat: fila.lat ?? "",
    lon: fila.lon ?? "",
    aproximada: fila.ubicacionAproximada ? "1" : "",
    integradaEn: fila.integradaEnId === null ? "" : String(fila.integradaEnId),
    ...cambios,
  };
}

test("corregir cambia el texto sin tocar el slug, y deja el antes y el despues", async () => {
  const idea = await cargar({ titulo: "Iluminacion de la plazita" });
  const antes = await filaDe(idea.id);

  const resultado = await operaciones.aplicarCorreccion(
    await correccion(idea.id, {
      titulo: "Iluminación de la plaza Belgrano",
      categoria: "socio-ambiental",
      barrio: "  Villa   Alem ",
      beneficios: "Las familias que usan la plaza a la tarde y a la noche.",
    }),
    sesion,
  );
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.error);

  const despues = await filaDe(idea.id);
  assert.equal(despues.slug, antes.slug, "el slug no cambia: los enlaces siguen andando");
  assert.equal(despues.titulo, "Iluminación de la plaza Belgrano");
  assert.equal(despues.barrio, "Villa Alem", "solo se sacan los espacios de mas");
  assert.equal(despues.barrioNormalizado, "villa alem");
  assert.equal(despues.estado, "pendiente", "corregir no toca el estado");
  assert.equal(despues.publicada, false);

  const historial = await historialDe(idea.id);
  const fila = historial.at(-1)!;
  assert.equal(fila.accion, "correccion");
  assert.equal(fila.estadoAnterior, null);
  assert.match(fila.nota ?? "", /Título: “Iluminacion de la plazita” → “Iluminación de la plaza Belgrano”/);
  assert.match(fila.nota ?? "", /Categoría: Urbana → Socio-ambiental/);
  assert.match(fila.nota ?? "", /Barrio: “Villa Luján” → “Villa Alem”/);
  assert.match(fila.nota ?? "", /Quiénes se benefician: \(vacío\) → “Las familias/);
});

test("la correccion no normaliza el titulo: la sigla que arregla una persona queda arreglada", async () => {
  const idea = await cargar({ titulo: "Playon del club Unsta" });
  const resultado = await operaciones.aplicarCorreccion(
    await correccion(idea.id, { titulo: "Playón del club UNSTA" }),
    sesion,
  );
  assert.ok(resultado.ok);
  assert.equal((await filaDe(idea.id)).titulo, "Playón del club UNSTA");
});

test("una correccion sin cambios no escribe una fila que diga de X a X", async () => {
  const idea = await cargar({ titulo: "Idea que nadie cambia al final" });
  const filas = (await historialDe(idea.id)).length;
  const resultado = await operaciones.aplicarCorreccion(await correccion(idea.id), sesion);
  assert.deepEqual(resultado, { ok: true, mensaje: "No hubo cambios para guardar." });
  assert.equal((await historialDe(idea.id)).length, filas);
});

test("los textos largos van recortados en el historial, no enteros", async () => {
  const idea = await cargar({ titulo: "Idea con un texto muy largo" });
  const largo = `${"Una solución muy detallada. ".repeat(40)}Fin.`;
  const resultado = await operaciones.aplicarCorreccion(
    await correccion(idea.id, { solucion: largo }),
    sesion,
  );
  assert.ok(resultado.ok);
  const nota = (await historialDe(idea.id)).at(-1)!.nota ?? "";
  assert.match(nota, /recortado: \d+ caracteres en total/);
  assert.ok(nota.length < 800, `la nota mide ${nota.length}`);
  assert.equal((await filaDe(idea.id)).solucion, largo.trim(), "la idea si guarda el texto entero");
});

test("mover el punto dentro del mismo distrito no pide confirmacion", async () => {
  const idea = await cargar({ titulo: "Idea que se corre unos metros" });
  const resultado = await operaciones.aplicarCorreccion(await correccion(idea.id, PUNTO.d1b), sesion);
  assert.ok(resultado.ok, resultado.ok ? "" : resultado.error);
  const fila = await filaDe(idea.id);
  assert.equal(Number(fila.lat).toFixed(7), PUNTO.d1b.lat);
  assert.equal(fila.distritoId, 1);
  assert.match((await historialDe(idea.id)).at(-1)!.nota ?? "", /\(Distrito 1\) → .*\(Distrito 1\)/);
});

test("mudar de distrito pide la confirmacion de la pantalla, y con ella se muda", async () => {
  const idea = await cargar({ titulo: "Idea con el punto mal marcado" });

  const sinConfirmar = await operaciones.aplicarCorreccion(await correccion(idea.id, PUNTO.d5), sesion);
  assert.equal(sinConfirmar.ok, false);
  if (!sinConfirmar.ok) assert.match(sinConfirmar.error, /queda en el Distrito 5 y la idea está en el Distrito 1/);
  assert.equal((await filaDe(idea.id)).distritoId, 1, "sin confirmar no se mudo");

  const confirmada = await operaciones.aplicarCorreccion(
    await correccion(idea.id, { ...PUNTO.d5, confirmaDistrito: "1" }),
    sesion,
  );
  assert.ok(confirmada.ok, confirmada.ok ? "" : confirmada.error);
  assert.equal((await filaDe(idea.id)).distritoId, 5);
  assert.match((await historialDe(idea.id)).at(-1)!.nota ?? "", /\(Distrito 1\) → .*\(Distrito 5\)/);
});

test("una idea con votos no se muda de distrito, ni con confirmacion ni despues de votar", async () => {
  const conVotos = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Proyecto votado en el distrito 1",
    slug: "proyecto-votado-d1",
    estado: "factible",
    votos: 40,
  });
  const { eq } = await import("drizzle-orm");
  await base.db
    .update(base.schema.ideas)
    .set({ lat: PUNTO.d1.lat, lon: PUNTO.d1.lon })
    .where(eq(base.schema.ideas.id, conVotos));

  try {
    await etapa("seguimiento");
    const resultado = await operaciones.aplicarCorreccion(
      await correccion(conVotos, { ...PUNTO.d5, confirmaDistrito: "1" }),
      sesion,
    );
    assert.equal(resultado.ok, false);
    if (!resultado.ok) assert.match(resultado.error, /tiene 40 votos de vecinos del Distrito 1/);
    assert.equal((await filaDe(conVotos)).distritoId, 1);

    // Dentro de su distrito si se corrige: el texto y el punto.
    const dentro = await operaciones.aplicarCorreccion(
      await correccion(conVotos, { ...PUNTO.d1b, titulo: "Proyecto votado del distrito 1" }),
      sesion,
    );
    assert.ok(dentro.ok, dentro.ok ? "" : dentro.error);
  } finally {
    await etapa("ideas");
  }
});

test("un ganador no se muda de distrito aunque su contador este en cero", async () => {
  const ganador = await crearIdea(base, {
    edicionId,
    distrito: 2,
    titulo: "Ganador del distrito 2",
    slug: "ganador-d2",
    estado: "ganador",
    ganador: true,
    votos: 0,
  });
  const resultado = await operaciones.aplicarCorreccion(
    await correccion(ganador, { ...PUNTO.d5, confirmaDistrito: "1" }),
    sesion,
  );
  assert.equal(resultado.ok, false);
  if (!resultado.ok) assert.match(resultado.error, /es el proyecto ganador del Distrito 2/);
});

test("con la votacion abierta no se corrige una idea que se vota, y si una que no", async () => {
  const votable = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Proyecto en la boleta",
    slug: "proyecto-en-la-boleta",
    estado: "factible",
    publicada: true,
  });
  const noVotable = await cargar({ titulo: "Idea que no llego a la boleta" });

  try {
    await etapa("votacion");
    const enBoleta = await operaciones.aplicarCorreccion(
      await correccion(votable, { titulo: "Proyecto en la boleta, corregido" }),
      sesion,
    );
    assert.equal(enBoleta.ok, false);
    if (!enBoleta.ok) assert.match(enBoleta.error, /esta idea se está votando/);
    assert.equal((await filaDe(votable)).titulo, "Proyecto en la boleta");

    const fuera = await operaciones.aplicarCorreccion(
      await correccion(noVotable.id, { titulo: "Idea que no llegó a la boleta" }),
      sesion,
    );
    assert.ok(fuera.ok, fuera.ok ? "" : fuera.error);
  } finally {
    await etapa("ideas");
  }
});

test("la integracion apunta a una idea final de la misma edicion", async () => {
  const principal = await cargar({ titulo: "Plaza nueva en el barrio norte" });
  const repetida = await cargar({ titulo: "Otra plaza en el barrio norte" });
  const tercera = await cargar({ titulo: "Una tercera plaza en el norte" });

  // A si misma no.
  const aSiMisma = await operaciones.aplicarCorreccion(
    await correccion(repetida.id, { integradaEn: String(repetida.id) }),
    sesion,
  );
  assert.equal(aSiMisma.ok, false);

  // En la principal, si, y queda nombrada en el historial.
  const integrada = await operaciones.aplicarCorreccion(
    await correccion(repetida.id, { integradaEn: String(principal.id) }),
    sesion,
  );
  assert.ok(integrada.ok, integrada.ok ? "" : integrada.error);
  assert.equal((await filaDe(repetida.id)).integradaEnId, principal.id);
  assert.match(
    (await historialDe(repetida.id)).at(-1)!.nota ?? "",
    new RegExp(`Integrada en: ninguna → #${principal.numero} “Plaza nueva en el barrio norte”`),
  );

  // En una que ya esta integrada en otra, no: se apunta a la final.
  const enCadena = await operaciones.aplicarCorreccion(
    await correccion(tercera.id, { integradaEn: String(repetida.id) }),
    sesion,
  );
  assert.equal(enCadena.ok, false);
  if (!enCadena.ok) assert.match(enCadena.error, /ya está integrada en otra/);

  // La principal, con una integrada adentro, no se integra en otra.
  const principalEnOtra = await operaciones.aplicarCorreccion(
    await correccion(principal.id, { integradaEn: String(tercera.id) }),
    sesion,
  );
  assert.equal(principalEnOtra.ok, false);
  if (!principalEnOtra.ok) assert.match(principalEnOtra.error, /Hay una idea integrada en esta/);

  // Ni en una de otra edicion.
  const [otraEdicion] = await base.db
    .insert(base.schema.ediciones)
    .values({ anio: 2027, etapa: "ideas", activa: false })
    .returning({ id: base.schema.ediciones.id });
  const ajena = await crearIdea(base, {
    edicionId: otraEdicion.id,
    distrito: 1,
    titulo: "Idea de la edicion siguiente",
    slug: "idea-de-la-siguiente",
  });
  const deOtraEdicion = await operaciones.aplicarCorreccion(
    await correccion(tercera.id, { integradaEn: String(ajena) }),
    sesion,
  );
  assert.equal(deOtraEdicion.ok, false);
  if (!deOtraEdicion.ok) assert.match(deOtraEdicion.error, /misma edición/);

  // Sacarle la integracion siempre se puede.
  const suelta = await operaciones.aplicarCorreccion(
    await correccion(repetida.id, { integradaEn: "" }),
    sesion,
  );
  assert.ok(suelta.ok);
  assert.equal((await filaDe(repetida.id)).integradaEnId, null);
});

// ---------------------------------------------------------------------------
// Descarte y su marcha atras
// ---------------------------------------------------------------------------

test("descartar una pendiente la despublica, y deshacerlo la vuelve a pendiente", async () => {
  const idea = await cargar({ titulo: "Prueba del equipo, no es una idea" });
  const { eq } = await import("drizzle-orm");
  // Publicada, para ver que el descarte la saca del sitio.
  await base.db
    .update(base.schema.ideas)
    .set({ publicada: true })
    .where(eq(base.schema.ideas.id, idea.id));

  const corto = await operaciones.aplicarDescarte({ id: String(idea.id), motivo: "prueba" }, sesion);
  assert.equal(corto.ok, false, "el motivo es obligatorio");

  const descarte = await operaciones.aplicarDescarte(
    { id: String(idea.id), motivo: "Era una prueba del equipo." },
    sesion,
  );
  assert.ok(descarte.ok, descarte.ok ? "" : descarte.error);
  let fila = await filaDe(idea.id);
  assert.equal(fila.estado, "descartado");
  assert.equal(fila.publicada, false);
  let ultima = (await historialDe(idea.id)).at(-1)!;
  assert.equal(ultima.accion, "descarte");
  assert.equal(ultima.estadoAnterior, "pendiente");
  assert.equal(ultima.estadoNuevo, "descartado");
  assert.match(ultima.nota ?? "", /Era una prueba del equipo\. \(Estaba publicada: salió del sitio\.\)/);

  // Descartada, no se corrige ni se vuelve a descartar.
  const corregir = await operaciones.aplicarCorreccion(
    await correccion(idea.id, { titulo: "Un titulo nuevo para la descartada" }),
    sesion,
  );
  assert.equal(corregir.ok, false);
  if (!corregir.ok) assert.match(corregir.error, /Esta idea está descartada/);

  const restaurada = await operaciones.aplicarRestauracion(
    { id: String(idea.id), motivo: "Se descartó por error: era real." },
    sesion,
  );
  assert.ok(restaurada.ok, restaurada.ok ? "" : restaurada.error);
  fila = await filaDe(idea.id);
  assert.equal(fila.estado, "pendiente");
  assert.equal(fila.publicada, false, "deshacer el descarte no la publica");
  ultima = (await historialDe(idea.id)).at(-1)!;
  assert.equal(ultima.accion, "reapertura");
  assert.equal(ultima.estadoAnterior, "descartado");
  assert.equal(ultima.estadoNuevo, "pendiente");
  assert.match(ultima.nota ?? "", /^Deshace el descarte: Se descartó por error/);
});

test("no se descarta lo que ya se evaluo, ni se deshace el descarte de lo que no esta descartado", async () => {
  const factible = await crearIdea(base, {
    edicionId,
    distrito: 1,
    titulo: "Proyecto ya evaluado",
    slug: "proyecto-ya-evaluado",
    estado: "factible",
  });
  const descarte = await operaciones.aplicarDescarte(
    { id: String(factible), motivo: "Spam que se evaluó por error." },
    sesion,
  );
  assert.equal(descarte.ok, false);
  if (!descarte.ok) assert.match(descarte.error, /Solo se descarta una idea que nadie evaluó/);
  assert.equal((await filaDe(factible)).estado, "factible");

  const restaurar = await operaciones.aplicarRestauracion(
    { id: String(factible), motivo: "No debería poder hacerse." },
    sesion,
  );
  assert.equal(restaurar.ok, false);
});

test("una idea con otras integradas no se descarta: quedarian apuntando a la nada", async () => {
  const principal = await cargar({ titulo: "Principal con una integrada" });
  const integrada = await cargar({ titulo: "Integrada en la principal" });
  const integrar = await operaciones.aplicarCorreccion(
    await correccion(integrada.id, { integradaEn: String(principal.id) }),
    sesion,
  );
  assert.ok(integrar.ok);
  const descarte = await operaciones.aplicarDescarte(
    { id: String(principal.id), motivo: "Carga repetida por error." },
    sesion,
  );
  assert.equal(descarte.ok, false);
  if (!descarte.ok) assert.match(descarte.error, /Hay una idea integrada en esta/);
});

test("la accion de publicar rebota una descartada: la politica la frena con la fila bloqueada", async () => {
  const idea = await cargar({ titulo: "Spam que alguien quiere publicar" });
  await operaciones.aplicarDescarte({ id: String(idea.id), motivo: "Spam: no es una propuesta." }, sesion);

  // Es la pregunta que hacen publicarIdea, evaluarIdea y reabrirRevision
  // (src/app/admin/acciones.ts) adentro de su transaccion.
  for (const cambio of [
    { accion: "publicar" } as const,
    { accion: "evaluar", estado: "factible" } as const,
    { accion: "reabrir" } as const,
  ]) {
    const motivo = await base.db.transaction((tx) => comun.bloqueoPorEtapa(tx, idea.id, cambio));
    assert.match(motivo ?? "", /Esta idea está descartada/, JSON.stringify(cambio));
  }
});

// ---------------------------------------------------------------------------
// Una descartada no cuenta en ningun lado
// ---------------------------------------------------------------------------

test("una descartada no cuenta en ningun numero del panel ni aparece en la bandeja por defecto", async () => {
  // Una edicion aparte, para que las cuentas se lean enteras.
  const [edicion] = await base.db
    .insert(base.schema.ediciones)
    .values({ anio: 2030, etapa: "ideas", activa: false })
    .returning({ id: base.schema.ediciones.id });
  const valida = await crearIdea(base, {
    edicionId: edicion.id,
    distrito: 1,
    titulo: "Idea valida de 2030",
    slug: "idea-valida-2030",
    numero: 1,
    estado: "pendiente",
    publicada: false,
  });
  const spam = await crearIdea(base, {
    edicionId: edicion.id,
    distrito: 1,
    titulo: "Spam de 2030",
    slug: "spam-2030",
    numero: 2,
    estado: "pendiente",
    publicada: false,
  });
  const { eq } = await import("drizzle-orm");
  await base.db
    .update(base.schema.ideas)
    .set({ categoriaId: 1, fecha: "2030-03-01" })
    .where(eq(base.schema.ideas.edicionId, edicion.id));
  const descarte = await operaciones.aplicarDescarte(
    { id: String(spam), motivo: "Spam: no es una propuesta." },
    sesion,
  );
  assert.ok(descarte.ok);

  const bandeja = await consultas.getResumenBandeja(edicion.id);
  assert.equal(bandeja.total, 1, "la solapa Todas no cuenta la descartada");
  assert.equal(bandeja.porEstado.descartado, 1, "la solapa Descartadas si");
  assert.equal(bandeja.porEstado.pendiente, 1);

  const pagina = await consultas.listarIdeasBandeja({ edicionId: edicion.id });
  assert.deepEqual(pagina.filas.map((f) => f.id), [valida]);
  assert.equal(pagina.total, 1);
  const buscando = await consultas.listarIdeasBandeja({ edicionId: edicion.id, texto: "Spam" });
  assert.equal(buscando.total, 0, "buscar por texto tampoco las mezcla");
  const solapa = await consultas.listarIdeasBandeja({ edicionId: edicion.id, estado: "descartado" });
  assert.deepEqual(solapa.filas.map((f) => f.id), [spam]);

  const resumen = await consultas.getResumenAdmin(edicion.id);
  assert.equal(resumen.ideas, 1);
  assert.equal(resumen.sinPublicar, 1);
  assert.equal(resumen.porCanal.web, 1);
  assert.equal(resumen.porEstado.descartado, 1);

  const porDistrito = await consultas.getEstadisticasPorDistrito(edicion.id);
  assert.equal(porDistrito.find((d) => d.numero === 1)?.ideas, 1);
  assert.equal(porDistrito.find((d) => d.numero === 1)?.pendientes, 1);

  const matriz = await consultas.getMatrizDistritoCategoria(edicion.id);
  assert.equal(matriz.reduce((suma, celda) => suma + celda.ideas, 0), 1);

  const serie = await consultas.getSerieIdeas(edicion.id);
  assert.deepEqual(serie, [{ dia: "2030-03-01", cantidad: 1 }]);

  const ediciones = await consultas.getEdiciones();
  assert.equal(ediciones.find((e) => e.id === edicion.id)?.ideas, 1);

  const parecidas = await consultas.getIdeasParaComparar(edicion.id, 1);
  assert.deepEqual(parecidas.map((p) => p.id), [valida], "el asistente no compara contra un spam");

  const candidatas = await consultas.getCandidatasIntegracion(edicion.id, valida);
  assert.deepEqual(candidatas, [], "no se integra en una descartada");
});

test("una descartada no aparece en nada publico, aunque alguien la publicara a mano", async () => {
  const idea = await cargar({ titulo: "Carga repetida de la plaza" });
  await operaciones.aplicarDescarte(
    { id: String(idea.id), motivo: "Carga repetida de la idea anterior." },
    sesion,
  );
  // El descarte la dejo sin publicar. Se la publica por fuera de la aplicacion
  // (una edicion a mano en la base) para probar la segunda barrera.
  const { eq } = await import("drizzle-orm");
  await base.db
    .update(base.schema.ideas)
    .set({ publicada: true })
    .where(eq(base.schema.ideas.id, idea.id));
  const fila = await filaDe(idea.id);

  const edicion = await consultas.getEdicionActiva();
  assert.ok(edicion);
  const lista = await consultas.listarIdeas({ edicionId, texto: "Carga repetida" });
  assert.equal(lista.length, 0, "no sale en /proyectos, ni en los datos abiertos, ni en el chat");
  assert.equal(await consultas.getIdea(fila.slug), null, "su ficha publica da 404");

  const estadisticas = await consultas.getEstadisticas(edicion);
  const publicadasDe = await base.consultar<{ total: number }>(base.sql`
    SELECT count(*)::int AS total FROM ideas
     WHERE edicion_id = ${edicionId} AND publicada AND estado <> 'descartado'
  `);
  assert.equal(estadisticas.ideas, Number(publicadasDe[0].total));
  assert.equal(estadisticas.porEstado.descartado, undefined);

  const distritosPublicos = await consultas.getDistritos(edicionId);
  const [enD1] = await base.consultar<{ total: number }>(base.sql`
    SELECT count(*)::int AS total FROM ideas
     WHERE edicion_id = ${edicionId} AND distrito_id = 1 AND publicada AND estado <> 'descartado'
  `);
  assert.equal(distritosPublicos.find((d) => d.numero === 1)?.ideas, Number(enD1.total));
});
