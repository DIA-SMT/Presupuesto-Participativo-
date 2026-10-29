/**
 * El recorrido guiado del panel (src/app/admin/recorrido): que cada paso
 * apunte a algo que existe, que cada rol vea solo lo que puede usar, y que el
 * cartel caiga siempre adentro de la ventana.
 *
 * Lo que no se prueba aca es el dibujo en el navegador (el recorte, el foco,
 * la navegacion entre pantallas): eso se miro a mano. Lo de aca es lo que se
 * rompe sin que nadie lo vea: un `data-recorrido` que se borra al rehacer una
 * pantalla deja al paso centrado y sin señalar nada, y ningun error lo avisa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PASOS, pasosPara, textoPara } from "../../src/app/admin/recorrido/pasos";
import {
  ANCHO_FLOTANTE,
  MARGEN,
  anchoDelCartel,
  ubicarCartel,
} from "../../src/app/admin/recorrido/ubicacion";

const RAIZ_PANEL = join("src", "app", "admin");
const ROLES = ["lector", "moderador", "admin"] as const;

/** Todo el codigo de las pantallas del panel, para buscar las anclas. */
function codigoDelPanel(): string {
  const partes: string[] = [];
  const recorrer = (carpeta: string) => {
    for (const nombre of readdirSync(carpeta)) {
      const ruta = join(carpeta, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (ruta.endsWith(".tsx")) partes.push(readFileSync(ruta, "utf8"));
    }
  };
  recorrer(RAIZ_PANEL);
  return partes.join("\n");
}

test("cada ancla de cada paso esta en alguna pantalla del panel", () => {
  const codigo = codigoDelPanel();
  for (const paso of PASOS) {
    for (const ancla of paso.anclas) {
      assert.ok(
        codigo.includes(`data-recorrido="${ancla}"`),
        `el paso "${paso.id}" apunta a data-recorrido="${ancla}", que no esta en ${RAIZ_PANEL}`,
      );
    }
  }
});

test("cada ruta de un paso es una pantalla del panel", () => {
  for (const paso of PASOS) {
    if (paso.ruta === null) continue;
    assert.match(paso.ruta, /^\/admin(\/[a-z-]+)*$/, `ruta rara en "${paso.id}"`);
    const pagina = join("src", "app", ...paso.ruta.slice(1).split("/"), "page.tsx");
    assert.ok(existsSync(pagina), `el paso "${paso.id}" va a ${paso.ruta}, y no existe ${pagina}`);
  }
});

test("los ids no se repiten", () => {
  const ids = PASOS.map((paso) => paso.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("todos los roles empiezan por la bienvenida y terminan en su cuenta", () => {
  for (const rol of ROLES) {
    const pasos = pasosPara(rol);
    assert.equal(pasos[0].id, "bienvenida", rol);
    assert.equal(pasos.at(-1)?.id, "cuenta", rol);
  }
});

test("el administrador ve todos los pasos", () => {
  assert.equal(pasosPara("admin").length, PASOS.length);
});

test("Equipo es solo del administrador, como en el menu", () => {
  // navegacion.tsx los marca `soloAdmin`: el recorrido no puede llevar a otro
  // rol a una pantalla que no tiene en el menu.
  for (const rol of ["lector", "moderador"] as const) {
    const rutas = pasosPara(rol).map((paso) => paso.ruta);
    assert.ok(!rutas.includes("/admin/equipo"), rol);
  }
});

test("al lector no se le muestra nada que solo sirve para escribir", () => {
  const ids = pasosPara("lector").map((paso) => paso.id);
  // "Cargar una idea" ni siquiera se dibuja para el lector, y la edicion nueva
  // es solo del administrador.
  assert.ok(!ids.includes("bandeja-cargar"));
  assert.ok(!ids.includes("ediciones-nueva"));
});

test("cada rol tiene texto propio donde su permiso cambia", () => {
  // La ficha y la etapa son donde mas cambia lo que cada uno puede hacer: un
  // texto compartido le prometeria al lector lo que no puede.
  for (const id of ["bandeja-ficha", "ediciones-etapa"]) {
    const paso = PASOS.find((p) => p.id === id);
    assert.ok(paso, id);
    const textos = ROLES.map((rol) => textoPara(paso, rol));
    assert.equal(new Set(textos).size, ROLES.length, `${id}: los tres roles leen lo mismo`);
  }
});

test("ningun texto cuenta como funciona Migue por dentro", () => {
  const prohibido = /modelo|openrouter|claude|anthropic|sonnet|token|herramienta|proveedor|prompt/i;
  for (const paso of PASOS) {
    for (const rol of ROLES) {
      const texto = textoPara(paso, rol);
      if (texto === null) continue;
      assert.doesNotMatch(`${paso.titulo} ${texto}`, prohibido, `${paso.id} (${rol})`);
    }
  }
});

test("ningun texto señala con el dedo: el paso puede quedar sin resaltar", () => {
  for (const paso of PASOS) {
    for (const rol of ROLES) {
      const texto = textoPara(paso, rol);
      if (texto === null) continue;
      assert.doesNotMatch(texto, /\bacá\b|\baquí\b|este botón/i, `${paso.id} (${rol})`);
    }
  }
});

// ---------------------------------------------------------------------------
// Donde va el cartel
// ---------------------------------------------------------------------------

const VENTANA = { ancho: 1280, alto: 800 };
const CARTEL = { ancho: 384, alto: 220 };

test("el cartel va debajo del elemento si entra", () => {
  const lugar = ubicarCartel({ top: 100, left: 200, width: 300, height: 60 }, CARTEL, VENTANA);
  assert.ok(lugar.top > 160);
});

test("si abajo no entra, va arriba", () => {
  const lugar = ubicarCartel({ top: 600, left: 200, width: 300, height: 120 }, CARTEL, VENTANA);
  assert.ok(lugar.top + CARTEL.alto < 600);
});

test("si el elemento ocupa la ventana, el cartel va abajo a la derecha", () => {
  const lugar = ubicarCartel({ top: 10, left: 10, width: 1200, height: 780 }, CARTEL, VENTANA);
  assert.deepEqual(lugar, {
    left: VENTANA.ancho - MARGEN - CARTEL.ancho,
    top: VENTANA.alto - MARGEN - CARTEL.alto,
  });
});

test("nunca se sale por los costados", () => {
  const izquierda = ubicarCartel({ top: 100, left: 0, width: 40, height: 40 }, CARTEL, VENTANA);
  const derecha = ubicarCartel({ top: 100, left: 1260, width: 20, height: 40 }, CARTEL, VENTANA);
  assert.equal(izquierda.left, MARGEN);
  assert.equal(derecha.left, VENTANA.ancho - CARTEL.ancho - MARGEN);
});

test("sin elemento, va centrado", () => {
  const lugar = ubicarCartel(null, CARTEL, VENTANA);
  assert.equal(lugar.left, (VENTANA.ancho - CARTEL.ancho) / 2);
  assert.equal(lugar.top, (VENTANA.alto - CARTEL.alto) / 2);
});

test("en una ventana angosta va al pie, con o sin elemento, y a lo ancho", () => {
  const celular = { ancho: 375, alto: 812 };
  assert.ok(celular.ancho < ANCHO_FLOTANTE);
  const ancho = anchoDelCartel(celular);
  assert.equal(ancho, 375 - 2 * MARGEN);
  const cartel = { ancho, alto: 320 };
  const esperado = { left: MARGEN, top: 812 - MARGEN - 320 };
  assert.deepEqual(ubicarCartel(null, cartel, celular), esperado);
  assert.deepEqual(
    ubicarCartel({ top: 100, left: 20, width: 300, height: 60 }, cartel, celular),
    esperado,
  );
});

test("el cartel nunca es mas ancho que la ventana", () => {
  assert.equal(anchoDelCartel({ ancho: 1280, alto: 800 }), 384);
  for (const ancho of [320, 375, 414, 600]) {
    assert.ok(anchoDelCartel({ ancho, alto: 800 }) + 2 * MARGEN <= ancho, String(ancho));
  }
});
