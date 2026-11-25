/**
 * urlDelPedido (src/lib/sitio.ts): detras de nginx, request.url dice
 * http://localhost:3011 y la vuelta de CIDITUC mandaba a la persona ahi.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { urlDelPedido } from "../../src/lib/sitio";

const pedido = (url: string, cabeceras: Record<string, string> = {}) =>
  new Request(url, { headers: cabeceras });

test("detras de nginx manda el dominio que pone el proxy", () => {
  const url = urlDelPedido(
    pedido("http://localhost:3011/auth/cidituc/callback?auth=x", {
      "x-forwarded-host": "presupuestoparticipativo.smt.gob.ar",
      "x-forwarded-proto": "https",
    }),
  );
  assert.equal(url.origin, "https://presupuestoparticipativo.smt.gob.ar");
  assert.equal(url.pathname, "/auth/cidituc/callback");
  assert.equal(new URL("/ideas/nueva", url).href, "https://presupuestoparticipativo.smt.gob.ar/ideas/nueva");
});

test("sin proxy (npm run dev) queda la URL del pedido, con su puerto", () => {
  assert.equal(urlDelPedido(pedido("http://localhost:3190/x")).origin, "http://localhost:3190");
});

test("un host con forma rara no se usa", () => {
  const url = urlDelPedido(
    pedido("http://localhost:3011/x", { "x-forwarded-host": "evil.com/@otro", "x-forwarded-proto": "https" }),
  );
  assert.equal(url.origin, "http://localhost:3011");
});
