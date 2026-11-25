/**
 * BASE_DE_PRODUCCION=1 (scripts/produccion.ts): en la VPS el Postgres de
 * produccion esta en 127.0.0.1, y sin la marca el candado lo tomaba por una base
 * de desarrollo. Con la marca, una URL local cuenta como produccion para todos
 * los candados.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  baseMarcadaComoProduccion,
  destinoDeLaBase,
  evaluarDrizzleKit,
  evaluarEscritura,
  FLAG_PRODUCCION,
} from "../produccion";

const VPS = "postgresql://presupuesto:clave@127.0.0.1:5432/presupuesto";

/** Corre `cuerpo` con BASE_DE_PRODUCCION puesta, y la deja como estaba. */
function conMarca(valor: string | undefined, cuerpo: () => void) {
  const antes = process.env.BASE_DE_PRODUCCION;
  if (valor === undefined) delete process.env.BASE_DE_PRODUCCION;
  else process.env.BASE_DE_PRODUCCION = valor;
  try {
    cuerpo();
  } finally {
    if (antes === undefined) delete process.env.BASE_DE_PRODUCCION;
    else process.env.BASE_DE_PRODUCCION = antes;
  }
}

test("solo '1' marca la base", () => {
  assert.equal(baseMarcadaComoProduccion("1"), true);
  assert.equal(baseMarcadaComoProduccion(" 1 "), true);
  for (const valor of [undefined, "", "0", "true", "si"]) {
    assert.equal(baseMarcadaComoProduccion(valor), false, String(valor));
  }
});

test("sin la marca, la base de la VPS sigue siendo local", () => {
  assert.equal(destinoDeLaBase(VPS, false).tipo, "postgres-local");
});

test("con la marca, la base local es de produccion y lo dice", () => {
  const destino = destinoDeLaBase(VPS, true);
  assert.equal(destino.tipo, "remota");
  assert.match(destino.descripcion, /127\.0\.0\.1:5432\/presupuesto/);
  assert.match(destino.descripcion, /BASE_DE_PRODUCCION=1/);
  assert.doesNotMatch(destino.descripcion, /clave/);
});

test("con la marca y sin Postgres no se escribe en ningun lado", () => {
  for (const url of [undefined, "", "pglite:./data/pg"]) {
    assert.equal(destinoDeLaBase(url, true).tipo, "desconocida", String(url));
  }
});

test("con la marca, los scripts piden --produccion y la base local no lo rechaza", () => {
  conMarca("1", () => {
    const sinFlag = evaluarEscritura({ url: VPS, argumentos: [], comando: "npm run seed" });
    assert.equal(sinFlag.permitido, false);
    const conFlagPuesto = evaluarEscritura({ url: VPS, argumentos: [FLAG_PRODUCCION], comando: "npm run seed" });
    assert.deepEqual(
      conFlagPuesto.permitido && { produccion: conFlagPuesto.produccion },
      { produccion: true },
    );
  });
  conMarca(undefined, () => {
    assert.equal(evaluarEscritura({ url: VPS, argumentos: [], comando: "npm run seed" }).permitido, true);
  });
});

test("con la marca, drizzle-kit no abre la base sin pedirlo y push no corre", () => {
  conMarca("1", () => {
    assert.equal(evaluarDrizzleKit({ url: VPS, argumentos: ["studio"], permiso: undefined }).permitido, false);
    assert.equal(evaluarDrizzleKit({ url: VPS, argumentos: ["push"], permiso: "1" }).permitido, false);
    assert.equal(evaluarDrizzleKit({ url: VPS, argumentos: ["generate"], permiso: undefined }).permitido, true);
  });
});
