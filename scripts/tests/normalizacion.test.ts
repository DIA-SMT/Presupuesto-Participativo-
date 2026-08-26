/**
 * Pruebas de la normalizacion de datos. Se corren con `npm test`.
 * Los casos salen de filas reales del CSV de 2025: son los que fallaban.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizarBarrio,
  normalizarTitulo,
  similitud,
  slugificar,
  valorODefecto,
} from "../../src/lib/texto";
import { distritoDelPunto, parsearCoordenada, type ColeccionDistritos } from "../../src/lib/geo";
import { readFileSync } from "node:fs";

test("normalizarTitulo saca marcas internas y mayuscula sostenida", () => {
  assert.equal(
    normalizarTitulo("PUESTA EN VALOR DE LA GRUTA DE LA VIRGEN DEL ROSARIO DE SAN NICOLAS *"),
    "Puesta en Valor de la Gruta de la Virgen del Rosario de San Nicolás",
  );
  assert.equal(normalizarTitulo("SALON DE USOS MULTIPLES S/DATOS"), "Salón de Usos Múltiples");
  assert.equal(normalizarTitulo("CAC N° 11 Inclusivo- No factible"), "CAC N° 11 Inclusivo");
  assert.equal(normalizarTitulo("Club de Adulto Mayores- S/DATOS"), "Club de Adulto Mayores");
  // Ya tiene minusculas: la capitalizacion es intencional, no se toca.
  assert.equal(
    normalizarTitulo("Puesta en Valor Plaza Democracia- Barrio Casino-Zenón Santillan-"),
    "Puesta en Valor Plaza Democracia- Barrio Casino-Zenón Santillan",
  );
});

test("normalizarTitulo restituye tildes solo en palabras gritadas", () => {
  assert.equal(
    normalizarTitulo("PLAYON DEPORTIVO BARRIO 11 DE ENERO"),
    "Playón Deportivo Barrio 11 de Enero",
  );
  assert.equal(
    normalizarTitulo("REVALORIZACION Y EXPANSION COMUNITARIA PLAZA TERCER CENTENARIO"),
    "Revalorización y Expansión Comunitaria Plaza Tercer Centenario",
  );
  assert.equal(
    normalizarTitulo("Puesta en valor plaza santísima Trinidad-villa Alem"),
    "Puesta en valor plaza santísima Trinidad-villa Alem",
  );
  // "Playón" ya venia acentuado: no se toca.
  assert.equal(
    normalizarTitulo('Playón deportivo comunitario "Plaza Viluco"'),
    'Playón deportivo comunitario "Plaza Viluco"',
  );
  // Un titulo que empieza con numero no capitaliza la preposicion siguiente.
  assert.equal(normalizarTitulo("11 de febrero"), "11 de febrero");
});

test("normalizarTitulo conserva siglas", () => {
  assert.match(normalizarTitulo("REVALORIZACION DE PLAZA-BARRIO SMATA III"), /SMATA III/);
  assert.match(normalizarTitulo("PLAZA BARRANCAS DEL SALI- BARRIO AGEF I y II"), /AGEF/);
});

test("normalizarBarrio quita el prefijo Barrio y los vacios", () => {
  assert.equal(normalizarBarrio("BARRIO GENERAL SAN MARTIN"), "General San Martín");
  assert.equal(normalizarBarrio("barrio AGET II"), "AGET II");
  assert.equal(normalizarBarrio("sin identificar"), null);
  assert.equal(normalizarBarrio("S/DATOS"), null);
  assert.equal(normalizarBarrio(""), null);
});

test("valorODefecto reconoce los marcadores de dato faltante", () => {
  assert.equal(valorODefecto("S/DATOS"), null);
  assert.equal(valorODefecto("  "), null);
  assert.equal(valorODefecto("Villa Urquiza"), "Villa Urquiza");
});

test("slugificar produce urls limpias y estables", () => {
  assert.equal(
    slugificar("Puesta en Valor Plaza Democracia- Barrio Casino-Zenón Santillan-"),
    "puesta-en-valor-plaza-democracia-barrio-casino-zenon-santillan",
  );
});

test("similitud detecta los duplicados reales de 2025", () => {
  assert.ok(
    similitud(
      "ESCUELA FORMATIVA DEFENSORES DEL SUR",
      "ESCUELA FORMATIVA DEFENSORES DEL SUR-BARRIO MANANTIAL SUR",
    ) > 0.7,
  );
  assert.ok(
    similitud("Playón deportivo comunitario Plaza Viluco", "Centro Cultural y Comunitario DIZA") <
      0.3,
  );
});

test("parsearCoordenada cubre los cuatro formatos del sitio anterior", () => {
  // 1. par decimal correcto
  const ok = parsearCoordenada("-26.797050, -65.207859");
  assert.deepEqual(ok.punto, { lat: -26.79705, lon: -65.207859 });
  assert.equal(ok.nota, null);

  // 2. latitud con el signo invertido
  const signo = parsearCoordenada("26.795635, -65.254633");
  assert.equal(signo.punto?.lat, -26.795635);
  assert.match(signo.nota ?? "", /signo/);

  // 3. grados, minutos y segundos
  const gms = parsearCoordenada('26 51 20.7 S 65 15 21.0 W');
  assert.ok(gms.punto);
  assert.ok(Math.abs(gms.punto!.lat + 26.8557) < 0.01);
  assert.ok(Math.abs(gms.punto!.lon + 65.2558) < 0.01);

  // 4. Gauss-Kruger faja 3: se reproyecta desde que el municipio confirmo el
  //    sistema. Es la coordenada real de la idea #91 de 2025, que hasta
  //    entonces se descartaba y quedaba en el centroide de su distrito.
  const faja = parsearCoordenada("3576679.46555, 7028253.17743");
  assert.ok(faja.punto, "la coordenada de la faja 3 tiene que convertirse");
  assert.ok(Math.abs(faja.punto!.lat - -26.872285) < 1e-4, "latitud reproyectada");
  assert.ok(Math.abs(faja.punto!.lon - -65.228333) < 1e-4, "longitud reproyectada");
  assert.match(faja.nota ?? "", /faja 3/);

  // Un par de siete cifras que NO cae en el ejido sigue descartandose: el rango
  // que habilita la conversion es el de la ciudad, no el de la faja entera.
  const lejos = parsearCoordenada("3400000, 6900000");
  assert.equal(lejos.punto, null);
  assert.match(lejos.nota ?? "", /proyectado/);

  assert.deepEqual(parsearCoordenada(null), { punto: null, nota: null });
  assert.deepEqual(parsearCoordenada(""), { punto: null, nota: null });
});

test("point-in-polygon ubica los puntos conocidos en su distrito", () => {
  const distritos = JSON.parse(
    readFileSync("public/geo/distritos.geojson", "utf8"),
  ) as ColeccionDistritos;
  assert.equal(distritos.features.length, 20);

  // Club Sargento Cabral, Villa Urquiza -> Distrito 5 (proyecto mas votado)
  assert.equal(
    distritoDelPunto({ lat: -26.796955750589746, lon: -65.20086511853114 }, distritos),
    5,
  );
  // Plaza Democracia, B° Casino -> Distrito 2
  assert.equal(distritoDelPunto({ lat: -26.800276, lon: -65.236695 }, distritos), 2);
  // Barrio Lincoln -> Distrito 13
  assert.equal(distritoDelPunto({ lat: -26.838791, lon: -65.250745 }, distritos), 13);
  // Buenos Aires: fuera del ejido
  assert.equal(distritoDelPunto({ lat: -34.6, lon: -58.4 }, distritos), null);
});
