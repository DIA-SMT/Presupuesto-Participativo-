/**
 * La frase de los distritos sin ganador (`distritosConVerbo`, src/lib/formato.ts).
 *
 * /transparencia decia "el distrito 2, 10, 13 no eligió proyecto", en singular
 * y sin conjuncion, cuando la portada ya lo habia corregido por su lado. Las
 * dos paginas arman ahora la frase con la misma funcion.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { distritosConVerbo } from "../../src/lib/formato";

test("con un solo distrito, singular", () => {
  assert.equal(distritosConVerbo([7], "no eligió", "no eligieron"), "el distrito 7 no eligió");
});

test("con varios, plural y con la conjuncion", () => {
  assert.equal(
    distritosConVerbo([2, 10, 13], "no eligió", "no eligieron"),
    "los distritos 2, 10 y 13 no eligieron",
  );
  assert.equal(distritosConVerbo([4, 9], "quedó", "quedaron"), "los distritos 4 y 9 quedaron");
});
