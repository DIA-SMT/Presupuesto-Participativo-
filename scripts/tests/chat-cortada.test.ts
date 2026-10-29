/**
 * Una respuesta del chat que se corto a mitad (src/lib/chat-cortada.ts). Antes
 * el widget guardaba cada trozo tal cual en sessionStorage y, si la pagina se
 * recargaba mientras llegaba (un enlace de la misma respuesta es un `<a href>`
 * comun), al volver la lista a medias aparecia como una respuesta completa.
 * No tocan la base ni la red.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AVISO_CORTADA, cerrarCortada, quedoCortada } from "../../src/lib/chat-cortada";
import { historialParaEnviar } from "../../src/lib/chat-historial";

type Mensaje = {
  rol: "usuario" | "asistente";
  texto: string;
  error?: boolean;
  modo?: "ia" | "buscador";
  firma?: string;
};

const PARCIAL = "Encontré estas ideas en el distrito 7:\n\n- **[Plaza del barrio](/proyectos/plaza)**\n- ";

test("solo queda cortada una respuesta con texto que no cerro con `fin` ni `error`", () => {
  assert.equal(quedoCortada({ rol: "asistente", texto: PARCIAL }), true);
  assert.equal(quedoCortada({ rol: "asistente", texto: "Entera.", modo: "ia" }), false);
  assert.equal(quedoCortada({ rol: "asistente", texto: "Del buscador.", modo: "buscador" }), false);
  assert.equal(quedoCortada({ rol: "asistente", texto: "No se pudo.", error: true }), false);
  assert.equal(quedoCortada({ rol: "usuario", texto: "¿Qué ideas hay en el distrito 7?" }), false);
  // El globo vacio de una respuesta en curso no es una respuesta cortada: no se guarda.
  assert.equal(quedoCortada({ rol: "asistente", texto: "  \n" }), false);
});

test("la respuesta cortada queda como aviso de error, con lo que llego y el aviso una sola vez", () => {
  const cerrada = cerrarCortada<Mensaje>({ rol: "asistente", texto: PARCIAL });
  assert.equal(cerrada.error, true);
  assert.equal(cerrada.texto, `${PARCIAL.trimEnd()}\n\n${AVISO_CORTADA}`);
  // Se aplica al guardar y otra vez al leer lo guardado: no repite el aviso.
  assert.deepEqual(cerrarCortada(cerrada), cerrada);
});

test("una respuesta terminada, un aviso de error y una pregunta vuelven iguales", () => {
  const entera: Mensaje = { rol: "asistente", texto: "Entera.", modo: "ia", firma: "f" };
  const aviso: Mensaje = { rol: "asistente", texto: "No llegó ninguna respuesta.", error: true };
  const pregunta: Mensaje = { rol: "usuario", texto: "¿Y en el 5?" };
  assert.equal(cerrarCortada(entera), entera);
  assert.equal(cerrarCortada(aviso), aviso);
  assert.equal(cerrarCortada(pregunta), pregunta);
});

test("guardada a mitad del stream, al recargar no vuelve como completa ni viaja como contexto", () => {
  // Lo que el widget tenia en memoria cuando la persona toco el enlace.
  const enMemoria: Mensaje[] = [
    { rol: "usuario", texto: "¿Qué hay en el distrito 3?" },
    { rol: "asistente", texto: "En el distrito 3 hay dos ideas.", modo: "ia", firma: "f" },
    { rol: "usuario", texto: "¿Qué ideas hay en el distrito 7?" },
    { rol: "asistente", texto: PARCIAL },
  ];

  // Lo que hace el widget: guarda cerrado y vuelve a cerrar al leer.
  const guardado = JSON.stringify(enMemoria.filter((m) => m.texto.trim()).map(cerrarCortada));
  const recuperado = (JSON.parse(guardado) as Mensaje[]).map(cerrarCortada);

  const ultimo = recuperado.at(-1)!;
  assert.equal(ultimo.error, true);
  assert.ok(ultimo.texto.endsWith(AVISO_CORTADA));
  assert.equal(ultimo.texto.split(AVISO_CORTADA).length, 2);
  // La respuesta anterior, terminada, no se toca.
  assert.deepEqual(recuperado[1], enMemoria[1]);

  // La pregunta siguiente lleva las dos preguntas y la respuesta firmada, no la cortada.
  const enviado = historialParaEnviar([...recuperado, { rol: "usuario", texto: "¿Y cuál tiene más votos?" }]);
  assert.deepEqual(
    enviado.map((m) => m.texto),
    [
      "¿Qué hay en el distrito 3?",
      "En el distrito 3 hay dos ideas.",
      "¿Qué ideas hay en el distrito 7?",
      "¿Y cuál tiene más votos?",
    ],
  );
});
