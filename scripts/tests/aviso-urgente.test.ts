/**
 * Pruebas de los enlaces del aviso urgente (src/lib/aviso-urgente.ts): que
 * convierte en enlace y que deja como texto. No tocan la base.
 *
 * El aviso sale en TODAS las paginas publicas, asi que el criterio es
 * conservador: solo una url completa, que se ve tal cual, o una ruta del sitio.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { trozosDelAviso, type TrozoAviso } from "../../src/lib/aviso-urgente";

/** Solo los enlaces, como [texto, href]. */
function enlaces(texto: string): [string, string][] {
  return trozosDelAviso(texto)
    .filter((trozo): trozo is Extract<TrozoAviso, { tipo: "enlace" }> => trozo.tipo === "enlace")
    .map((trozo) => [trozo.texto, trozo.href]);
}

/** Lo que se lee, uniendo texto y enlaces: no se puede perder ni duplicar nada. */
function leido(texto: string): string {
  return trozosDelAviso(texto)
    .map((trozo) => trozo.texto)
    .join("");
}

test("un texto sin enlaces queda entero, en un solo trozo", () => {
  const texto = "La votación se extiende hasta el viernes por la caída de CIDITUC.";
  assert.deepEqual(trozosDelAviso(texto), [{ tipo: "texto", texto }]);
});

test("una ruta del sitio es un enlace interno, sin el punto final", () => {
  const texto = "Más información en /votar.";
  assert.deepEqual(enlaces(texto), [["/votar", "/votar"]]);
  const [, enlace] = trozosDelAviso(texto);
  assert.equal(enlace.tipo === "enlace" && enlace.interno, true);
  assert.equal(leido(texto), texto);
});

test("una url completa es un enlace externo que se ve tal cual se escribio", () => {
  const texto = "Consultá https://cidituc.smt.gob.ar/ayuda, ahí está el paso a paso.";
  assert.deepEqual(enlaces(texto), [
    ["https://cidituc.smt.gob.ar/ayuda", "https://cidituc.smt.gob.ar/ayuda"],
  ]);
  assert.equal(leido(texto), texto);
});

test("los parentesis de la frase no entran en el enlace, los de la url si", () => {
  assert.deepEqual(enlaces("(ver /reglamento)"), [["/reglamento", "/reglamento"]]);
  assert.deepEqual(enlaces("Ver https://es.wikipedia.org/wiki/Tucumán_(provincia) y listo"), [
    [
      "https://es.wikipedia.org/wiki/Tucumán_(provincia)",
      "https://es.wikipedia.org/wiki/Tucum%C3%A1n_(provincia)",
    ],
  ]);
  assert.equal(leido("(ver /reglamento)"), "(ver /reglamento)");
});

test("una barra en medio de una palabra no es una ruta", () => {
  for (const texto of [
    "Atención 24/7 en la oficina",
    "Traé DNI y/o constancia",
    "Del 10/10 al 17/10",
    "Uno / otro",
  ]) {
    assert.deepEqual(enlaces(texto), [], texto);
    assert.equal(leido(texto), texto, texto);
  }
});

test("lo que puede llevar a otro sitio sin que se note queda como texto", () => {
  for (const texto of [
    // Usuario adelante del host: se lee como el sitio del municipio.
    "Entrá a https://smt.gob.ar@otro.sitio/votar",
    // Relativa al protocolo, y la barra invertida que el navegador toma como barra.
    "Entrá a //otro.sitio/votar",
    "Entrá a /\\otro.sitio",
    // Otros esquemas: nunca.
    "javascript:alert(1)",
    "Escribí a mailto:alguien@smt.gob.ar",
    // Sin punto en el host no es una direccion publica.
    "https://intranet/avisos",
  ]) {
    assert.deepEqual(enlaces(texto), [], texto);
    assert.equal(leido(texto), texto, texto);
  }
});

test("el formato de markdown no se interpreta: se ve tal cual", () => {
  // El vecino no veria a donde lo lleva el enlace, y la banda sale en todo el
  // sitio. El panel avisa antes de guardar.
  const texto = "Mirá [el cronograma](/acerca-de) actualizado";
  assert.deepEqual(enlaces(texto), []);
  assert.equal(leido(texto), texto);
});

test("varios enlaces y espacios raros no pierden ni duplican texto", () => {
  const texto = "Votá en /votar o consultá https://smt.gob.ar/pp.  Gracias.";
  assert.deepEqual(enlaces(texto), [
    ["/votar", "/votar"],
    ["https://smt.gob.ar/pp", "https://smt.gob.ar/pp"],
  ]);
  assert.equal(leido(texto), texto);
});
