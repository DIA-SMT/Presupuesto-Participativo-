/**
 * Lo que escribe /admin/contenido (src/app/admin/contenido/escritura.ts),
 * probado contra una base de verdad con las migraciones reales.
 *
 * Las acciones del panel no se pueden llamar aca (leen la cookie de sesion), y
 * por eso la escritura vive aparte, igual que la del voto: recibe la
 * autorizacion ya resuelta. Lo que se afirma es lo que importa del contenido
 * publico: que cada cambio deje su fila en `bitacora_sistema` con el antes y el
 * despues, que guardar lo mismo no deje ninguna, y que lo despublicado no le
 * llegue ni a la pagina ni al chat (`getFaq` es lo que recibe el chat entero en
 * cada consulta).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { asc, eq } from "drizzle-orm";
import { crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";
import type { Autorizacion } from "../../src/app/admin/comun";

let base: BaseDePrueba;
let escritura: typeof import("../../src/app/admin/contenido/escritura");
let consultas: typeof import("../../src/db/queries");
let sesion: Autorizacion;

test.before(async () => {
  base = await crearBaseDePrueba("contenido");
  const [admin] = await base.db
    .insert(base.schema.admins)
    .values({ email: "ana@smt.gob.ar", nombre: "Ana Admin", passwordHash: "x", rol: "admin" })
    .returning({ id: base.schema.admins.id });
  sesion = { adminId: admin.id, email: "ana@smt.gob.ar", nombre: "Ana Admin", rol: "admin" };
  // Despues de crear la base: src/db elige el driver al importarse.
  escritura = await import("../../src/app/admin/contenido/escritura");
  consultas = await import("../../src/db/queries");
});

test.after(async () => {
  await base.cerrar();
});

async function bitacora() {
  const { bitacoraSistema } = base.schema;
  return base.db.select().from(bitacoraSistema).orderBy(asc(bitacoraSistema.id));
}

async function ultimaFila() {
  const filas = await bitacora();
  return filas[filas.length - 1];
}

async function valorDe(clave: string) {
  const { textos } = base.schema;
  const [fila] = await base.db.select().from(textos).where(eq(textos.clave, clave));
  return fila?.valor;
}

/** Afirma que la escritura salio bien y dice si cambio algo. */
function cambio(resultado: Awaited<ReturnType<typeof escritura.escribirTexto>>): boolean {
  assert.equal(resultado.ok, true, resultado.ok ? "" : resultado.error);
  return resultado.ok && resultado.cambio;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

test("el reglamento se crea aunque no este en la base, sin \\r y con su fila de bitacora", async () => {
  const filas = (await bitacora()).length;
  assert.equal(await valorDe("reglamento-cuerpo"), undefined);

  const resultado = await escritura.escribirTexto(sesion, {
    clave: "reglamento-cuerpo",
    valor: "Artículo 1. Objeto.\r\n\r\nArtículo 2. Alcance.\r\n",
  });
  assert.equal(cambio(resultado), true);
  assert.equal(await valorDe("reglamento-cuerpo"), "Artículo 1. Objeto.\n\nArtículo 2. Alcance.");

  const fila = await ultimaFila();
  assert.equal((await bitacora()).length, filas + 1);
  assert.equal(fila.accion, "texto_guardado");
  assert.equal(fila.entidad, "texto");
  assert.equal(fila.entidadEtiqueta, "reglamento-cuerpo");
  assert.equal(fila.valorAnterior, null, "un alta no tiene ANTES");
  assert.equal(fila.adminNombre, "Ana Admin");
});

test("guardar un texto igual no escribe ni deja fila", async () => {
  const filas = (await bitacora()).length;
  const resultado = await escritura.escribirTexto(sesion, {
    clave: "reglamento-cuerpo",
    // Mismo contenido, con los saltos y espacios que agrega un formulario.
    valor: "  Artículo 1. Objeto.\r\n\r\nArtículo 2. Alcance. ",
  });
  assert.equal(cambio(resultado), false);
  assert.equal((await bitacora()).length, filas);
});

test("una clave que nadie lee no se crea", async () => {
  const resultado = await escritura.escribirTexto(sesion, { clave: "clave-inventada", valor: "x" });
  assert.equal(resultado.ok, false);
  assert.equal(await valorDe("clave-inventada"), undefined);
});

test("un titulo no puede quedar vacio; una bajada si", async () => {
  // Vacio, la pagina no vuelve al texto del codigo: el `??` solo cae con la
  // clave ausente. Un <h1> en blanco en /votar no es "sin cambios".
  const titulo = await escritura.escribirTexto(sesion, { clave: "votacion-titulo", valor: "   " });
  assert.equal(titulo.ok, false);
  assert.match(titulo.ok ? "" : titulo.error, /No puede quedar vacío/);
  assert.equal(await valorDe("votacion-titulo"), undefined);

  assert.equal(cambio(await escritura.escribirTexto(sesion, { clave: "votacion-subtitulo", valor: "Bajada." })), true);
  assert.equal(cambio(await escritura.escribirTexto(sesion, { clave: "votacion-subtitulo", valor: "" })), true);
  assert.equal(await valorDe("votacion-subtitulo"), "");
});

test("un texto mas largo que su tope se rechaza con el numero, sin escribir", async () => {
  const resultado = await escritura.escribirTexto(sesion, {
    clave: "aviso-urgente",
    valor: "a".repeat(401),
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.ok ? "" : resultado.error, /401/);
  assert.equal(await valorDe("aviso-urgente"), undefined);
});

test("el aviso urgente: quitarlo sin haberlo publicado no escribe; publicarlo y quitarlo, si", async () => {
  const filas = (await bitacora()).length;
  assert.equal(cambio(await escritura.escribirTexto(sesion, { clave: "aviso-urgente", valor: "" })), false);
  assert.equal(await valorDe("aviso-urgente"), undefined, "no se crea una fila vacia");
  assert.equal((await bitacora()).length, filas);

  assert.equal(
    cambio(
      await escritura.escribirTexto(sesion, {
        clave: "aviso-urgente",
        valor: "La votación se extiende\nhasta el viernes.",
      }),
    ),
    true,
  );
  assert.equal(await valorDe("aviso-urgente"), "La votación se extiende hasta el viernes.");

  assert.equal(cambio(await escritura.escribirTexto(sesion, { clave: "aviso-urgente", valor: "  " })), true);
  assert.equal(await valorDe("aviso-urgente"), "");
  const fila = await ultimaFila();
  assert.equal(fila.valorAnterior, "La votación se extiende hasta el viernes.");
  assert.equal(fila.valorNuevo, "(vacío)");
});

// ---------------------------------------------------------------------------
// Preguntas frecuentes
// ---------------------------------------------------------------------------

/** Las preguntas como las ve el panel y como las ven la pagina y el chat. */
async function preguntas() {
  const todas = await consultas.listarFaqAdmin();
  const publicas = await consultas.getFaq();
  return {
    panel: todas.map((fila) => fila.pregunta),
    ordenes: todas.map((fila) => fila.orden),
    publicas: publicas.map((fila) => fila.pregunta),
  };
}

async function idDe(pregunta: string): Promise<number> {
  const fila = (await consultas.listarFaqAdmin()).find((f) => f.pregunta === pregunta);
  assert.ok(fila, `no esta la pregunta "${pregunta}"`);
  return fila.id;
}

test("las preguntas nuevas van al final, y la despublicada no le llega al chat", async () => {
  const altas = [
    { pregunta: "¿Qué es el programa?", respuesta: "Un mecanismo de participación.", publicada: true },
    { pregunta: "¿Cómo voto?", respuesta: "Con tu cuenta de CIDITUC, una vez.", publicada: true },
    { pregunta: "¿Hay premios?", respuesta: "No, es una pregunta en borrador.", publicada: false },
  ];
  for (const alta of altas) {
    const resultado = await escritura.crearFaq(sesion, alta);
    assert.equal(resultado.ok && resultado.cambio, true);
  }

  assert.deepEqual(await preguntas(), {
    panel: ["¿Qué es el programa?", "¿Cómo voto?", "¿Hay premios?"],
    ordenes: [1, 2, 3],
    // getFaq es lo que usan /acerca-de y el chat.
    publicas: ["¿Qué es el programa?", "¿Cómo voto?"],
  });

  const fila = await ultimaFila();
  assert.equal(fila.accion, "faq_guardada");
  assert.equal(fila.entidad, "faq");
  assert.equal(fila.valorAnterior, null);
  assert.match(fila.valorNuevo ?? "", /^Posición 3 de 3 · sin publicar · ¿Hay premios\?/);
});

test("una pregunta sin texto suficiente no se crea", async () => {
  const resultado = await escritura.crearFaq(sesion, {
    pregunta: "¿?",
    respuesta: "Una respuesta cualquiera.",
    publicada: true,
  });
  assert.equal(resultado.ok, false);
  assert.equal((await preguntas()).panel.length, 3);
});

test("publicar y despublicar cambia lo que recibe el chat, y repetirlo no deja fila", async () => {
  const id = await idDe("¿Hay premios?");
  assert.equal((await escritura.publicarFaq(sesion, { id, publicada: true })).ok, true);
  assert.deepEqual((await preguntas()).publicas, [
    "¿Qué es el programa?",
    "¿Cómo voto?",
    "¿Hay premios?",
  ]);
  const fila = await ultimaFila();
  assert.equal(fila.valorAnterior, "sin publicar");
  assert.equal(fila.valorNuevo, "publicada");

  const filas = (await bitacora()).length;
  const repetido = await escritura.publicarFaq(sesion, { id, publicada: true });
  assert.equal(repetido.ok && repetido.cambio, false);
  assert.equal((await bitacora()).length, filas);
});

test("subir una pregunta la cambia de lugar en la pagina y en el chat", async () => {
  const id = await idDe("¿Hay premios?");
  const resultado = await escritura.moverFaq(sesion, { id, direccion: "arriba" });
  assert.equal(resultado.ok && resultado.cambio, true);
  assert.deepEqual(await preguntas(), {
    panel: ["¿Qué es el programa?", "¿Hay premios?", "¿Cómo voto?"],
    ordenes: [1, 2, 3],
    publicas: ["¿Qué es el programa?", "¿Hay premios?", "¿Cómo voto?"],
  });
  const fila = await ultimaFila();
  assert.equal(fila.valorAnterior, "Posición 3 de 3");
  assert.equal(fila.valorNuevo, "Posición 2 de 3");

  // La primera no sube mas: no es un error, pero no cambia nada.
  const primera = await escritura.moverFaq(sesion, { id: await idDe("¿Qué es el programa?"), direccion: "arriba" });
  assert.equal(primera.ok && primera.cambio, false);
});

test("con ordenes repetidos, mover igual mueve y deja la lista numerada", async () => {
  // Como quedaban las cargadas a mano: todas con el mismo orden. El orden real
  // es entonces el del id, que es el desempate de getFaq.
  await base.db.update(base.schema.faq).set({ orden: 0 });
  assert.deepEqual((await preguntas()).panel, ["¿Qué es el programa?", "¿Cómo voto?", "¿Hay premios?"]);

  await escritura.moverFaq(sesion, { id: await idDe("¿Cómo voto?"), direccion: "arriba" });
  assert.deepEqual(await preguntas(), {
    panel: ["¿Cómo voto?", "¿Qué es el programa?", "¿Hay premios?"],
    ordenes: [1, 2, 3],
    publicas: ["¿Cómo voto?", "¿Qué es el programa?", "¿Hay premios?"],
  });
});

test("editar una pregunta deja el antes y el despues; guardarla igual, nada", async () => {
  const id = await idDe("¿Cómo voto?");
  const resultado = await escritura.editarFaq(sesion, {
    id,
    pregunta: "¿Cómo voto?",
    respuesta: "Con tu cuenta de **CIDITUC**, una sola vez,\r\nen tu distrito.",
  });
  assert.equal(resultado.ok && resultado.cambio, true);
  const fila = await ultimaFila();
  assert.equal(fila.accion, "faq_guardada");
  assert.equal(fila.valorAnterior, "¿Cómo voto? — Con tu cuenta de CIDITUC, una vez.");
  assert.equal(fila.valorNuevo, "¿Cómo voto? — Con tu cuenta de **CIDITUC**, una sola vez,\nen tu distrito.");

  const filas = (await bitacora()).length;
  const igual = await escritura.editarFaq(sesion, {
    id,
    pregunta: " ¿Cómo voto? ",
    respuesta: "Con tu cuenta de **CIDITUC**, una sola vez,\nen tu distrito.",
  });
  assert.equal(igual.ok && igual.cambio, false);
  assert.equal((await bitacora()).length, filas);
});

test("borrar una pregunta la saca del chat y la bitacora guarda como era", async () => {
  const id = await idDe("¿Hay premios?");
  assert.equal((await escritura.borrarFaq(sesion, { id })).ok, true);
  assert.deepEqual((await preguntas()).publicas, ["¿Cómo voto?", "¿Qué es el programa?"]);

  const fila = await ultimaFila();
  assert.equal(fila.accion, "faq_borrada");
  assert.equal(fila.entidadId, id);
  assert.equal(fila.valorNuevo, null, "un borrado no tiene DESPUES");
  assert.match(fila.valorAnterior ?? "", /^Posición 3 de 3 · publicada · ¿Hay premios\?/);

  // Una pregunta que ya no existe no se puede editar, mover ni borrar.
  assert.equal((await escritura.borrarFaq(sesion, { id })).ok, false);
  assert.equal((await escritura.moverFaq(sesion, { id, direccion: "abajo" })).ok, false);
  assert.equal(
    (await escritura.editarFaq(sesion, { id, pregunta: "¿Hay premios?", respuesta: "Ya no existe." })).ok,
    false,
  );
});

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

async function portada() {
  return (await consultas.getNovedades(3)).map((novedad) => novedad.titulo);
}

test("una novedad sin publicar no llega a la portada, y el cuerpo no es obligatorio", async () => {
  const publicada = await escritura.crearNovedad(sesion, {
    titulo: "Asamblea del distrito 7",
    fecha: "2026-09-20",
    copete: "Sábado 10 h en la plaza.",
    cuerpo: "",
    publicada: true,
  });
  assert.equal(publicada.ok, true);
  const borrador = await escritura.crearNovedad(sesion, {
    titulo: "Cambio de fecha",
    fecha: "2026-09-25",
    copete: "",
    cuerpo: "Todavía no se confirma.",
    publicada: false,
  });
  assert.equal(borrador.ok, true);

  assert.deepEqual(await portada(), ["Asamblea del distrito 7"]);
  assert.deepEqual(
    (await consultas.listarNovedadesAdmin()).map((novedad) => novedad.titulo),
    ["Cambio de fecha", "Asamblea del distrito 7"],
  );
  const fila = await ultimaFila();
  assert.equal(fila.accion, "novedad_creada");
  assert.match(fila.valorNuevo ?? "", /^sin publicar · Fecha 2026-09-25 · Cambio de fecha/);
});

test("una fecha que no existe no se guarda", async () => {
  const resultado = await escritura.crearNovedad(sesion, {
    titulo: "Fecha imposible",
    fecha: "2026-02-31",
    copete: "",
    cuerpo: "",
    publicada: true,
  });
  assert.equal(resultado.ok, false);
});

test("editar una novedad no le cambia el slug y deja novedad_editada", async () => {
  const [antes] = (await consultas.listarNovedadesAdmin()).filter((n) => n.titulo === "Asamblea del distrito 7");
  const resultado = await escritura.editarNovedad(sesion, {
    id: antes.id,
    titulo: "Asamblea del distrito 7, en el club",
    fecha: antes.fecha,
    copete: "Sábado 10 h en el club del barrio.",
    cuerpo: "",
  });
  assert.equal(resultado.ok && resultado.cambio, true);

  const [despues] = (await consultas.listarNovedadesAdmin()).filter((n) => n.id === antes.id);
  assert.equal(despues.slug, antes.slug);
  const fila = await ultimaFila();
  assert.equal(fila.accion, "novedad_editada");
  assert.equal(fila.valorAnterior, "Fecha 2026-09-20 · Asamblea del distrito 7 · Sábado 10 h en la plaza.");
  assert.equal(fila.entidadEtiqueta, "Asamblea del distrito 7, en el club");
});

test("publicar una novedad la pone en la portada por fecha; con la misma fecha, la ultima cargada primero", async () => {
  const [borrador] = (await consultas.listarNovedadesAdmin()).filter((n) => n.titulo === "Cambio de fecha");
  assert.equal((await escritura.publicarNovedad(sesion, { id: borrador.id, publicada: true })).ok, true);
  assert.deepEqual(await portada(), ["Cambio de fecha", "Asamblea del distrito 7, en el club"]);
  const fila = await ultimaFila();
  assert.equal(fila.accion, "novedad_editada");
  assert.equal(fila.valorAnterior, "sin publicar");

  // Dos del mismo dia: la portada ya no depende de como devuelva la base el empate.
  await escritura.crearNovedad(sesion, {
    titulo: "Otra del mismo día",
    fecha: "2026-09-25",
    copete: "",
    cuerpo: "",
    publicada: true,
  });
  assert.deepEqual(await portada(), [
    "Otra del mismo día",
    "Cambio de fecha",
    "Asamblea del distrito 7, en el club",
  ]);
});
