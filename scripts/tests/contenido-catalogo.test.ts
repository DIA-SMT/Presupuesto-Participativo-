/**
 * El catalogo de textos del panel (src/app/admin/contenido/catalogo.ts) contra
 * el codigo de verdad, y las reglas puras del contenido. No tocan la base.
 *
 * El panel le dice al equipo en que pagina se ve cada texto. La pantalla que se
 * borro en 98d0f8d lo deducia por el prefijo de la clave y mentia: decia que
 * los `home-hero-*` se veian en la portada cuando la portada ya tenia su texto
 * en el codigo. Esta prueba recorre src/ y compara: si alguien lee un texto
 * nuevo en una pagina, o deja de leerlo, el catalogo tiene que enterarse.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import {
  agruparTextos,
  avisosDeFormato,
  CATALOGO,
  entradaDe,
  normalizarValor,
} from "../../src/app/admin/contenido/catalogo";
import { parrafosDelReglamento } from "../../src/app/reglamento/cuerpo";
import { NOVEDADES_EN_PORTADA } from "../../src/db/queries";

const RAIZ = join(__dirname, "..", "..");

/** Los archivos de src/ que pueden leer textos. El panel de contenido no cuenta: los edita. */
function archivosDelSitio(carpeta = join(RAIZ, "src")): string[] {
  const archivos: string[] = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) archivos.push(...archivosDelSitio(ruta));
    else if (/\.tsx?$/.test(entrada.name)) archivos.push(ruta);
  }
  return archivos.filter(
    (ruta) => !relative(RAIZ, ruta).split(sep).join("/").startsWith("src/app/admin/contenido/"),
  );
}

/**
 * Donde se lee cada clave: `textos["clave"]` en todo el sitio, y el
 * `t("clave")` de la portada (src/app/page.tsx), que es un atajo local.
 */
function lecturasEnElCodigo(): Map<string, Set<string>> {
  const lecturas = new Map<string, Set<string>>();
  const patrones = [
    /textos\[\s*["']([a-z0-9-]+)["']\s*\]/g,
    /\bt\(\s*["']([a-z0-9]+(?:-[a-z0-9]+)+)["']/g,
  ];
  for (const ruta of archivosDelSitio()) {
    const codigo = readFileSync(ruta, "utf8");
    const archivo = relative(RAIZ, ruta).split(sep).join("/");
    for (const patron of patrones) {
      for (const [, clave] of codigo.matchAll(patron)) {
        if (!lecturas.has(clave)) lecturas.set(clave, new Set());
        lecturas.get(clave)!.add(archivo);
      }
    }
  }
  return lecturas;
}

test("cada clave del catalogo aparece una sola vez", () => {
  const claves = CATALOGO.map((entrada) => entrada.clave);
  assert.deepEqual([...new Set(claves)].sort(), [...claves].sort());
});

test("toda clave que el sitio lee esta en el catalogo, con los archivos donde se lee", () => {
  const lecturas = lecturasEnElCodigo();
  assert.ok(lecturas.size > 20, "la busqueda no encontro casi nada: cambio la forma de leer textos?");

  for (const [clave, archivos] of lecturas) {
    const entrada = entradaDe(clave);
    assert.ok(
      entrada,
      `${[...archivos].join(", ")} lee textos["${clave}"] y el catalogo del panel no lo conoce: sumalo a src/app/admin/contenido/catalogo.ts`,
    );
    assert.deepEqual(
      [...archivos].sort(),
      [...entrada.archivos].sort(),
      `"${clave}": el catalogo dice que se lee en otros archivos`,
    );
  }
});

test("lo que el catalogo dice que se ve, se lee en el codigo; lo que dice que no, no", () => {
  const lecturas = lecturasEnElCodigo();
  for (const entrada of CATALOGO) {
    if (entrada.grupo === "sin-uso") {
      assert.equal(entrada.archivos.length, 0, `"${entrada.clave}" esta en sin-uso con archivos`);
      assert.ok(
        !lecturas.has(entrada.clave),
        `"${entrada.clave}" figura como que no lo lee nadie, y lo lee ${[...(lecturas.get(entrada.clave) ?? [])].join(", ")}`,
      );
    } else {
      assert.ok(
        entrada.archivos.length > 0 && lecturas.has(entrada.clave),
        `"${entrada.clave}" figura en "${entrada.grupo}" y ningun archivo lo lee`,
      );
    }
  }
});

test("todo texto que carga el seed esta en el catalogo", () => {
  // Si el seed suma una clave nueva, el panel tiene que saber donde se ve (o
  // que no se ve), y no mostrarla como "desconocida".
  const contenido = JSON.parse(
    readFileSync(join(RAIZ, "data", "contenido-sitio.json"), "utf8"),
  ) as { textos: Record<string, string> };
  for (const clave of Object.keys(contenido.textos)) {
    assert.ok(entradaDe(clave), `el seed carga "${clave}" y el catalogo no lo conoce`);
  }
});

test("el panel marca las novedades de la portada con el mismo numero que usa la portada", () => {
  const portada = readFileSync(join(RAIZ, "src", "app", "page.tsx"), "utf8");
  assert.match(
    portada,
    new RegExp(`getNovedades\\(${NOVEDADES_EN_PORTADA}\\)`),
    "src/app/page.tsx pide otra cantidad de novedades: actualizar NOVEDADES_EN_PORTADA",
  );
});

test("una linea se guarda en un renglon; un texto largo conserva sus renglones sin \\r", () => {
  assert.equal(normalizarValor("home-mapa-titulo", "  Los 20\r\n  distritos \t"), "Los 20 distritos");
  assert.equal(
    normalizarValor("reglamento-cuerpo", "\r\nArtículo 1.\r\n\r\nArtículo 2.\r\n  "),
    "Artículo 1.\n\nArtículo 2.",
  );
  // El aviso urgente es una banda: los saltos se juntan.
  assert.equal(normalizarValor("aviso-urgente", "Votación\nextendida"), "Votación extendida");
});

test("los parrafos del reglamento salen iguales con saltos de Windows o de Unix", () => {
  const unix = "Artículo 1. Objeto.\n\nArtículo 2. Alcance.\n   \nArtículo 3.";
  const windows = unix.replace(/\n/g, "\r\n");
  const esperado = ["Artículo 1. Objeto.", "Artículo 2. Alcance.", "Artículo 3."];
  assert.deepEqual(parrafosDelReglamento(unix), esperado);
  assert.deepEqual(parrafosDelReglamento(windows), esperado);
  // Solo espacios y renglones vacios no es un reglamento: la pagina muestra el aviso.
  assert.deepEqual(parrafosDelReglamento(" \r\n \n"), []);
  assert.deepEqual(parrafosDelReglamento(null), []);
});

test("avisa del HTML pegado, pero no de un signo menor en un texto legal", () => {
  assert.equal(avisosDeFormato("<p>Artículo 1</p><br>", "llano", "largo").length, 1);
  assert.deepEqual(avisosDeFormato("Si el monto es < 100 y > 10, se aprueba.", "llano", "largo"), []);
});

test("avisa del markdown solo donde la pagina no lo entiende", () => {
  const conNegrita = "Hay **tres** categorías.";
  assert.equal(avisosDeFormato(conNegrita, "llano", "parrafo").length, 1);
  // Las respuestas de las preguntas frecuentes y el chat si dibujan negritas.
  assert.deepEqual(avisosDeFormato(conNegrita, "negritas", "parrafo"), []);
  assert.deepEqual(avisosDeFormato(conNegrita, "chat", "parrafo"), []);

  // El chat dibuja [texto](/ruta) hacia el sitio, pero no hacia afuera.
  assert.deepEqual(avisosDeFormato("Mirá [el mapa](/distritos)", "chat", "parrafo"), []);
  assert.equal(avisosDeFormato("Mirá [esto](https://otro.sitio)", "chat", "parrafo").length, 1);
  // En el aviso urgente, ningun [texto](url): el enlace se escribe entero.
  assert.equal(avisosDeFormato("Mirá [el mapa](/distritos)", "aviso", "linea").length, 1);
});

test("en el aviso urgente avisa que un http:// no va a ser enlace, y no molesta con https://", () => {
  // La banda enlaza solo https:// (src/lib/aviso-urgente.ts): el http:// se
  // publica como texto sin clic, y eso se tiene que saber antes de guardar.
  assert.equal(avisosDeFormato("Más datos en http://smt.gob.ar/pp", "aviso", "linea").length, 1);
  assert.deepEqual(avisosDeFormato("Más datos en https://smt.gob.ar/pp", "aviso", "linea"), []);
  // En los otros textos una url no es enlace de ninguna forma: no hay nada que avisar.
  assert.deepEqual(avisosDeFormato("Más datos en http://smt.gob.ar/pp", "llano", "linea"), []);
});

test("avisa que un salto de linea no se ve donde la pagina lo muestra en un parrafo", () => {
  assert.equal(avisosDeFormato("Primera.\nSegunda.", "llano", "parrafo").length, 1);
  // En el chat cada renglon es un parrafo: ahi el salto si se ve.
  assert.deepEqual(avisosDeFormato("Hola.\nPreguntame.", "chat", "parrafo"), []);
});

test("reconoce un reglamento copiado de un PDF, y no un texto con incisos", () => {
  const cortado = [
    "Artículo 1. El presente reglamento establece las",
    "normas que rigen el Presupuesto Participativo de la",
    "ciudad de San Miguel de Tucumán, en todas sus",
    "etapas y para todos los distritos de la ciudad.",
    "Artículo 2. Pueden participar las personas que",
    "vivan en la ciudad y tengan dieciséis años o más.",
  ].join("\n");
  assert.equal(avisosDeFormato(cortado, "llano", "largo").length, 1);

  const bienArmado = [
    "Artículo 1. Objeto. El presente reglamento establece las normas del programa.",
    "Artículo 2. Participantes. Pueden participar las personas que viven en la ciudad:",
    "a) mayores de dieciséis años;",
    "b) con domicilio en el distrito.",
    "Artículo 3. Etapas. El programa tiene cuatro etapas.",
    "Artículo 4. Votación. Cada persona tiene un voto.",
  ].join("\n");
  assert.deepEqual(avisosDeFormato(bienArmado, "llano", "largo"), []);
});

test("agrupa por pagina, muestra lo que falta cargar y manda lo desconocido a sin-uso", () => {
  const grupos = agruparTextos([
    { clave: "home-mapa-titulo", valor: "Los 20 distritos", descripcion: null, actualizado: "hoy" },
    { clave: "sitio-nombre", valor: "Presupuesto Participativo", descripcion: null, actualizado: null },
    { clave: "clave-que-nadie-lee", valor: "x", descripcion: "vieja", actualizado: null },
  ]);
  const grupo = (nombre: string) => grupos.find((g) => g.grupo === nombre)?.textos ?? [];

  const mapa = grupo("portada").find((texto) => texto.clave === "home-mapa-titulo");
  assert.equal(mapa?.existe, true);
  // Una clave que el sitio lee y la base no tiene aparece igual, para poder cargarla.
  const bloque = grupo("portada").find((texto) => texto.clave === "home-bloque1-titulo");
  assert.equal(bloque?.existe, false);
  assert.equal(grupo("reglamento").some((texto) => texto.clave === "reglamento-cuerpo"), true);
  assert.equal(grupo("aviso").some((texto) => texto.clave === "aviso-urgente"), true);

  // En sin-uso: la que esta en la base, y la desconocida. Las de sin-uso que la
  // base no tiene no aparecen: no hay nada que mostrar.
  assert.deepEqual(
    grupo("sin-uso").map((texto) => texto.clave),
    ["sitio-nombre", "clave-que-nadie-lee"],
  );
  assert.equal(grupo("sin-uso")[1].entrada, null);
});
