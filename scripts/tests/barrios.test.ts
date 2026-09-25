/**
 * La capa oficial de barrios como fuente de "en que distrito queda mi barrio"
 * (src/lib/barrios.ts), probada contra los archivos reales de public/geo.
 *
 * Los distritos esperados salen de la geometria y coinciden con los de las
 * ideas 2025 de esos barrios (Villa Urquiza en el 5, Jardin en el 3): si una
 * capa nueva los mueve, esta prueba avisa antes que un vecino.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  barriosEnFrase,
  buscarBarrios,
  claveDeBarrio,
  distritosDelBarrio,
  ideasDelBarrio,
  puntoEnBarrio,
  ubicarBarrio,
  ubicarBarriosEnFrase,
} from "../../src/lib/barrios";
import type { ColeccionBarrios, ColeccionDistritos, FeatureBarrio } from "../../src/lib/geo";

const barrios = JSON.parse(
  readFileSync("public/geo/barrios.geojson", "utf8"),
) as ColeccionBarrios;
const distritos = JSON.parse(
  readFileSync("public/geo/distritos.geojson", "utf8"),
) as ColeccionDistritos;

const nombres = (lista: FeatureBarrio[]) => lista.map((b) => b.properties.nombre);

function barrio(nombre: string): FeatureBarrio {
  const encontrado = barrios.features.find((b) => b.properties.nombre === nombre);
  assert.ok(encontrado, `la capa tiene que tener ${nombre}`);
  return encontrado;
}

/** Un punto adentro del barrio, buscado en una grilla sobre su caja. */
function puntoAdentro(feature: FeatureBarrio) {
  const anillo = feature.geometry.coordinates[0][0];
  const lons = anillo.map((p) => p[0]);
  const lats = anillo.map((p) => p[1]);
  const [lonMin, lonMax, latMin, latMax] = [
    Math.min(...lons),
    Math.max(...lons),
    Math.min(...lats),
    Math.max(...lats),
  ];
  for (let i = 1; i < 20; i += 1) {
    for (let j = 1; j < 20; j += 1) {
      const punto = {
        lon: lonMin + ((lonMax - lonMin) * i) / 20,
        lat: latMin + ((latMax - latMin) * j) / 20,
      };
      if (puntoEnBarrio(punto, feature)) return punto;
    }
  }
  throw new Error(`no se encontro un punto adentro de ${feature.properties.nombre}`);
}

test("la clave de un barrio ignora tildes, puntos, signos y el prefijo", () => {
  assert.equal(claveDeBarrio("Villa Urquiza"), "villa urquiza");
  assert.equal(claveDeBarrio("B° Jardín"), "jardin");
  assert.equal(claveDeBarrio("barrio Jardín"), "jardin");
  assert.equal(claveDeBarrio("Bº San Martín"), "san martin");
  // La capa escribe siglas con puntos y numeros con el signo de grado.
  assert.equal(claveDeBarrio("Y.P.F."), "ypf");
  assert.equal(claveDeBarrio("S.M.A.T.A. II"), "smata ii");
  assert.equal(claveDeBarrio("1°  DE JULIO"), "1 de julio");
  assert.equal(claveDeBarrio("VILLA MUÑECAS"), "villa munecas");
});

test("buscarBarrios: exacto primero, despues los que lo contienen", () => {
  assert.deepEqual(nombres(buscarBarrios("villa urquiza", barrios)), ["VILLA URQUIZA"]);
  assert.deepEqual(nombres(buscarBarrios("YPF", barrios)), ["Y.P.F."]);

  const ciudadela = nombres(buscarBarrios("ciudadela", barrios));
  assert.equal(ciudadela[0], "CIUDADELA", "el nombre exacto va primero");
  assert.ok(ciudadela.includes("AMPLIACION CIUDADELA"));
  assert.ok(ciudadela.includes("CIUDADELA SUR"));

  // Por palabras enteras: "sur" no es el comienzo de otra palabra.
  assert.ok(
    nombres(buscarBarrios("sur", barrios)).every((n) => claveDeBarrio(n).split(" ").includes("sur")),
  );
});

test("buscarBarrios encuentra el barrio dentro de lo que escribio la persona", () => {
  assert.deepEqual(nombres(buscarBarrios("Villa Urquiza, Tucumán", barrios)), ["VILLA URQUIZA"]);
  // El nombre de la ciudad contiene a SAN MIGUEL, que no es lo que se pregunto.
  assert.deepEqual(
    nombres(buscarBarrios("Villa Urquiza, San Miguel de Tucumán", barrios)),
    ["VILLA URQUIZA"],
  );
  // Pero el barrio San Miguel se sigue encontrando por su nombre.
  assert.equal(buscarBarrios("barrio San Miguel", barrios)[0]?.properties.nombre, "SAN MIGUEL");
  // Algo que no es un barrio no encuentra nada.
  assert.deepEqual(buscarBarrios("xyzzy", barrios), []);
  assert.deepEqual(buscarBarrios("a", barrios), []);
});

test("barriosEnFrase no confunde la ciudad ni palabras sueltas con un barrio", () => {
  assert.deepEqual(
    nombres(barriosEnFrase("¿en qué distrito queda el barrio Jardín?", barrios)),
    ["JARDIN"],
  );
  assert.deepEqual(nombres(barriosEnFrase("villa urquiza", barrios)), ["VILLA URQUIZA"]);
  // "San Miguel de Tucumán" contiene a SAN MIGUEL, que es un barrio.
  assert.deepEqual(
    barriosEnFrase("¿qué es el presupuesto participativo de San Miguel de Tucumán?", barrios),
    [],
  );
  // Una palabra suelta que tambien es un barrio no cuenta sin "barrio" delante.
  assert.deepEqual(barriosEnFrase("¿en qué distrito queda la avenida Mate de Luna?", barrios), []);
  assert.deepEqual(nombres(barriosEnFrase("soy del barrio norte", barrios)), ["NORTE"]);
  // El nombre mas largo se come al que tiene adentro.
  assert.deepEqual(
    nombres(barriosEnFrase("vivo en ampliación villa alem", barrios)),
    ["AMPLIACION VILLA ALEM"],
  );
});

test("un barrio entero en un distrito da ese distrito, al 100%", () => {
  assert.deepEqual(distritosDelBarrio(barrio("VILLA URQUIZA"), distritos), [
    { distrito: 5, porcentaje: 100 },
  ]);
  assert.deepEqual(distritosDelBarrio(barrio("JARDIN"), distritos), [
    { distrito: 3, porcentaje: 100 },
  ]);
});

test("un barrio repartido da todos sus distritos, del mayor al menor", () => {
  const partes = distritosDelBarrio(barrio("VILLA 9 DE JULIO"), distritos);
  assert.deepEqual(
    partes.map((p) => p.distrito),
    [6, 5, 8],
  );
  assert.ok(partes.every((p) => p.porcentaje >= 10), "las partes chicas se descartan");
});

test("ningun barrio de la capa queda sin distrito", () => {
  for (const feature of barrios.features) {
    assert.ok(
      distritosDelBarrio(feature, distritos).length > 0,
      `${feature.properties.nombre} tiene que caer en algun distrito`,
    );
  }
});

test("las ideas de un barrio: por el punto o por el barrio escrito, no por parecido", () => {
  const urquiza = barrio("VILLA URQUIZA");
  const adentro = puntoAdentro(urquiza);
  const ideas = [
    // El punto cae en el barrio, aunque quien la cargo no escribio el barrio.
    { lat: adentro.lat, lon: adentro.lon, ubicacionAproximada: false, barrio: null },
    // Sin punto, pero con el barrio escrito como en la capa.
    { lat: null, lon: null, ubicacionAproximada: false, barrio: "B° Villa Urquiza" },
    // El centro del distrito no dice nada del barrio.
    { lat: adentro.lat, lon: adentro.lon, ubicacionAproximada: true, barrio: null },
    // Parecido no es igual.
    { lat: null, lon: null, ubicacionAproximada: false, barrio: "Villa Urquiza Norte" },
  ];
  assert.equal(ideasDelBarrio(urquiza, ideas).length, 2);
});

test("con las capas del sitio, ubicarBarrio arma el nombre para mostrar", () => {
  const [urquiza] = ubicarBarrio("villa urquiza");
  assert.equal(urquiza.nombre, "Villa Urquiza");
  assert.deepEqual(urquiza.distritos, [{ distrito: 5, porcentaje: 100 }]);
  assert.equal(urquiza.sectores, 1);

  // SAN MARTIN son dos barrios homonimos en la capa.
  const [sanMartin] = ubicarBarrio("San Martín");
  assert.equal(sanMartin.nombreOficial, "SAN MARTIN");
  assert.equal(sanMartin.sectores, 2);
  assert.ok(sanMartin.distritos.length > 1);

  assert.deepEqual(
    ubicarBarriosEnFrase("en que distrito queda villa 9 de julio").map((b) => b.nombreOficial),
    ["VILLA 9 DE JULIO"],
  );
});
