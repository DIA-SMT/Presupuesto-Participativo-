/**
 * Los filtros del listado de /proyectos (src/lib/filtros-listado.ts): que URL
 * piden y cuando. Logica pura: sin base ni navegador; el tiempo es el reloj
 * simulado de node:test.
 *
 * Los dos casos de arriba son los que fallaban: "Limpiar filtros" que a los
 * 350 ms traia de vuelta el distrito, y el distrito elegido al toque de
 * escribir que la busqueda pisaba al vencer la espera.
 */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DEMORA_BUSQUEDA, crearFiltrosDelListado } from "../../src/lib/filtros-listado";

function armar(t: TestContext, consultaInicial = "") {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pedidas: string[] = [];
  const filtros = crearFiltrosDelListado(consultaInicial, (href) => pedidas.push(href));
  return { filtros, pedidas, esperar: (ms: number) => t.mock.timers.tick(ms) };
}

test("Limpiar filtros deja el listado limpio y nada lo vuelve a filtrar despues", (t) => {
  const { filtros, pedidas, esperar } = armar(t, "q=plaza&distrito=5");
  // La persona habia empezado a escribir otra cosa y se arrepintio.
  filtros.buscar("plazas");
  esperar(100);
  filtros.limpiar();
  esperar(DEMORA_BUSQUEDA * 3);
  assert.deepEqual(pedidas, ["/proyectos"]);
});

test("elegir un filtro antes de que venza la espera no pierde el filtro ni lo escrito", (t) => {
  const { filtros, pedidas, esperar } = armar(t);
  filtros.buscar("club");
  esperar(100);
  filtros.filtrar({ distrito: "3" });
  esperar(DEMORA_BUSQUEDA * 3);
  assert.deepEqual(pedidas, ["/proyectos?q=club&distrito=3"]);
});

test("la busqueda parte de la ultima navegacion pedida, aunque la URL no haya cambiado todavia", (t) => {
  const { filtros, pedidas, esperar } = armar(t);
  filtros.filtrar({ distrito: "3" });
  // Sin `sincronizar`: el servidor todavia no contesto y useSearchParams sigue
  // con la URL de antes.
  filtros.buscar("club");
  esperar(DEMORA_BUSQUEDA);
  filtros.filtrar({ categoria: "deporte" });
  assert.deepEqual(pedidas, [
    "/proyectos?distrito=3",
    "/proyectos?distrito=3&q=club",
    "/proyectos?distrito=3&q=club&categoria=deporte",
  ]);
});

test("limpiar conserva la edicion que se esta mirando", (t) => {
  const { filtros, pedidas } = armar(t, "edicion=2025&q=plaza&distrito=5");
  filtros.limpiar();
  assert.deepEqual(pedidas, ["/proyectos?edicion=2025"]);
});

test("la espera se reinicia con cada tecla y no navega si el texto vuelve al de la URL", (t) => {
  const { filtros, pedidas, esperar } = armar(t, "q=plaza");
  filtros.buscar("plaz");
  esperar(DEMORA_BUSQUEDA - 1);
  filtros.buscar("plaza");
  esperar(DEMORA_BUSQUEDA * 3);
  assert.deepEqual(pedidas, []);

  filtros.buscar("plazo");
  esperar(DEMORA_BUSQUEDA - 1);
  assert.deepEqual(pedidas, []);
  esperar(1);
  assert.deepEqual(pedidas, ["/proyectos?q=plazo"]);
});

test("borrar todo el texto saca la busqueda de la URL", (t) => {
  const { filtros, pedidas, esperar } = armar(t, "q=plaza&distrito=5");
  filtros.buscar("");
  esperar(DEMORA_BUSQUEDA);
  assert.deepEqual(pedidas, ["/proyectos?distrito=5"]);
});

test("la URL que cambia por afuera (boton de atras, un enlace) es la base del cambio siguiente", (t) => {
  const { filtros, pedidas } = armar(t, "distrito=3");
  filtros.sincronizar("estado=ganador&vista=lista");
  filtros.filtrar({ categoria: "deporte" });
  assert.deepEqual(pedidas, ["/proyectos?estado=ganador&vista=lista&categoria=deporte"]);
});

test("la URL que cambia por afuera trae su busqueda al campo Buscar", (t) => {
  // El caso que fallaba: en /proyectos?q=plaza, el link "Proyectos" del
  // encabezado lleva a /proyectos sin volver a montar el componente. El campo
  // seguia diciendo "plaza" y el distrito elegido despues salia sin `q`.
  const { filtros, pedidas } = armar(t, "q=plaza");
  filtros.sincronizar("");
  assert.equal(filtros.textoParaMostrar(""), "");
  filtros.filtrar({ distrito: "3" });
  assert.deepEqual(pedidas, ["/proyectos?distrito=3"]);

  // Atras, a una URL con otra busqueda: el campo muestra esa.
  filtros.sincronizar("q=club&distrito=2");
  assert.equal(filtros.textoParaMostrar("q=club&distrito=2"), "club");
});

test("la URL que llega mientras la persona escribe no le pisa el texto", (t) => {
  const { filtros, pedidas, esperar } = armar(t, "q=plaza");
  filtros.buscar("pla");
  filtros.sincronizar("distrito=3");
  assert.equal(filtros.textoParaMostrar("distrito=3"), null);

  // Al vencer la espera, lo escrito va a la URL y, cuando esa llega, el campo
  // ya muestra lo mismo.
  esperar(DEMORA_BUSQUEDA);
  assert.deepEqual(pedidas, ["/proyectos?distrito=3&q=pla"]);
  assert.equal(filtros.textoParaMostrar("distrito=3&q=pla"), "pla");
});

test("desmontado, una busqueda que esperaba no navega", (t) => {
  const { filtros, pedidas, esperar } = armar(t);
  filtros.buscar("club");
  filtros.cancelar();
  esperar(DEMORA_BUSQUEDA * 3);
  assert.deepEqual(pedidas, []);
});
