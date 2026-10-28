/**
 * Lo que el widget del chat le hace decir al lector de pantalla cuando Migue
 * termina de contestar (src/lib/chat-anuncio.ts). Antes no decia nada: la
 * conversacion no era una region viva y el foco se quedaba en el campo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { anuncioDeRespuesta, textoEnLlano } from "../../src/lib/chat-anuncio";

test("el markdown del widget se lee en llano: sin asteriscos, sin rutas y con pausas", () => {
  const respuesta = [
    "Encontré 2 proyectos que coinciden:",
    "",
    "- **D1** · Plaza del barrio — Factible (300 votos)",
    "- **D2** · [Solo en la 2025](/proyectos/solo-en-2025?edicion=2025)",
    "",
    "Probá con *distrito 7*",
  ].join("\n");
  assert.equal(
    textoEnLlano(respuesta),
    "Encontré 2 proyectos que coinciden: D1 · Plaza del barrio — Factible (300 votos). " +
      "D2 · Solo en la 2025. Probá con distrito 7.",
  );
});

test("los pasos numerados conservan su numero", () => {
  assert.equal(
    textoEnLlano("Cómo se vota:\n1. Ingresá con CIDITUC\n2. Elegí un proyecto."),
    "Cómo se vota: 1. Ingresá con CIDITUC. 2. Elegí un proyecto.",
  );
});

test("una respuesta se anuncia como de Migue; un aviso de error, solo", () => {
  assert.equal(
    anuncioDeRespuesta({ texto: "Se presentaron **cero** ideas." }),
    "Migue respondió: Se presentaron cero ideas.",
  );
  assert.equal(
    anuncioDeRespuesta({
      texto: "Alcanzaste el máximo de 30 consultas por hora. Probá de nuevo en 12 minutos.",
      error: true,
    }),
    "Alcanzaste el máximo de 30 consultas por hora. Probá de nuevo en 12 minutos.",
  );
  // El globo vacio de una respuesta en curso no anuncia nada.
  assert.equal(anuncioDeRespuesta({ texto: "  \n" }), "");
});
