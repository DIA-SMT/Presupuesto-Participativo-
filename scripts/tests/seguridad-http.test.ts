/**
 * Pruebas de las defensas HTTP de los POST con sesion y de los nombres de las
 * cookies. Se corren con `npm test` y no necesitan base ni servidor: lo que se
 * prueba es la decision, con pedidos armados a mano como los que manda el
 * navegador.
 *
 * El caso que motivo todo esto es el del subdominio hermano: `gob.ar` esta en
 * la Public Suffix List, asi que para el navegador cualquier `*.smt.gob.ar` es
 * el mismo sitio y la cookie Lax viaja. Por eso las pruebas usan hosts
 * `*.smt.gob.ar` y no dominios inventados que el navegador ya separaria solo.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { esJson, exigirMismoOrigen, mismoOrigen } from "../../src/lib/origen";
import { atributosCookie, borradoCookie, nombreCookie } from "../../src/lib/cookies";

const SITIO = "https://presupuesto.smt.gob.ar";

/** Un POST como el que arma el navegador; los encabezados se pisan a gusto. */
function pedido(
  url: string,
  encabezados: Record<string, string> = {},
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      host: new URL(url).host,
      "content-type": "application/json",
      ...encabezados,
    },
    body: JSON.stringify({ slug: "plaza" }),
  });
}

/** SITE_URL y NODE_ENV se tocan en varias pruebas: se restauran siempre. */
function conEntorno<T>(valores: Record<string, string | undefined>, prueba: () => T): T {
  const entorno = process.env as Record<string, string | undefined>;
  const antes = Object.fromEntries(Object.keys(valores).map((k) => [k, entorno[k]]));
  try {
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor === undefined) delete entorno[clave];
      else entorno[clave] = valor;
    }
    return prueba();
  } finally {
    for (const [clave, valor] of Object.entries(antes)) {
      if (valor === undefined) delete entorno[clave];
      else entorno[clave] = valor;
    }
  }
}

// --- Origen -----------------------------------------------------------------

test("un fetch del propio sitio pasa", () => {
  conEntorno({ SITE_URL: undefined }, () => {
    const req = pedido(`${SITIO}/api/votos`, { origin: SITIO });
    assert.equal(mismoOrigen(req), true);
    assert.equal(exigirMismoOrigen(req), null);
  });
});

test("en desarrollo, localhost con su puerto pasa", () => {
  conEntorno({ SITE_URL: undefined }, () => {
    const req = pedido("http://localhost:3000/api/votos", { origin: "http://localhost:3000" });
    assert.equal(exigirMismoOrigen(req), null);
  });
});

test("un subdominio hermano de smt.gob.ar NO pasa, aunque sea el mismo sitio", async () => {
  const rechazo = conEntorno({ SITE_URL: undefined }, () => {
    const req = () => pedido(`${SITIO}/api/votos`, { origin: "https://tramites.smt.gob.ar" });
    assert.equal(mismoOrigen(req()), false);
    return exigirMismoOrigen(req());
  });
  assert.ok(rechazo, "tenia que devolver una respuesta de rechazo");
  assert.equal(rechazo.status, 403);
  const cuerpo = (await rechazo.json()) as { error?: string };
  assert.match(cuerpo.error ?? "", /no lo procesamos/);
});

test("sin Origin, o con Origin null, no pasa", () => {
  conEntorno({ SITE_URL: undefined }, () => {
    assert.equal(mismoOrigen(pedido(`${SITIO}/api/votos`)), false);
    assert.equal(mismoOrigen(pedido(`${SITIO}/api/votos`, { origin: "null" })), false);
    assert.equal(mismoOrigen(pedido(`${SITIO}/api/votos`, { origin: "no es una url" })), false);
  });
});

test("otro puerto del mismo host es otro origen", () => {
  conEntorno({ SITE_URL: undefined }, () => {
    const req = pedido("http://localhost:3000/api/votos", { origin: "http://localhost:3001" });
    assert.equal(mismoOrigen(req), false);
  });
});

test("detras de un proxy que termina el TLS: se compara el host, no el esquema", () => {
  // El servidor ve http:// y un host interno; el navegador estaba en https.
  conEntorno({ SITE_URL: undefined }, () => {
    const req = new Request("http://127.0.0.1:3000/api/votos", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        "x-forwarded-host": "presupuesto.smt.gob.ar",
        origin: SITIO,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(mismoOrigen(req), true);
  });
});

test("con SITE_URL, su host tambien cuenta como propio", () => {
  const interno = () =>
    new Request("http://127.0.0.1:3000/api/votos", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", origin: SITIO, "content-type": "application/json" },
      body: "{}",
    });
  conEntorno({ SITE_URL: undefined }, () => assert.equal(mismoOrigen(interno()), false));
  conEntorno({ SITE_URL: `${SITIO}/` }, () => assert.equal(mismoOrigen(interno()), true));
});

// --- Content-Type -----------------------------------------------------------

test("un formulario text/plain no pasa aunque el cuerpo sea un JSON valido", () => {
  // Es el truco: <form enctype="text/plain"> con un campo bien elegido arma
  // `{"slug":"plaza","x":"="}` y request.json() lo acepta. Va con el Origin
  // correcto a proposito, para probar la segunda llave sola: es la que queda
  // si en algun navegador la primera no alcanza.
  conEntorno({ SITE_URL: undefined }, () => {
    const req = () =>
      pedido(`${SITIO}/api/votos`, { origin: SITIO, "content-type": "text/plain" });
    assert.equal(esJson(req()), false);
    assert.equal(exigirMismoOrigen(req())?.status, 403);
  });
});

test("application/json con charset pasa; urlencoded y multipart no", () => {
  const con = (tipo: string) =>
    esJson(pedido(`${SITIO}/api/ideas`, { origin: SITIO, "content-type": tipo }));
  assert.equal(con("application/json; charset=utf-8"), true);
  assert.equal(con("Application/JSON"), true);
  assert.equal(con("application/x-www-form-urlencoded"), false);
  assert.equal(con("multipart/form-data; boundary=x"), false);
});

test("el formulario de Salir pide solo el origen, no JSON", () => {
  conEntorno({ SITE_URL: undefined }, () => {
    const formulario = pedido(`${SITIO}/api/auth/salir`, {
      origin: SITIO,
      "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(exigirMismoOrigen(formulario, { json: false }), null);
    assert.equal(exigirMismoOrigen(formulario)?.status, 403);

    const ajeno = pedido(`${SITIO}/api/auth/salir`, {
      origin: "https://tramites.smt.gob.ar",
      "content-type": "application/x-www-form-urlencoded",
    });
    assert.equal(exigirMismoOrigen(ajeno, { json: false })?.status, 403);
  });
});

// --- Cookies ----------------------------------------------------------------

test("en produccion las cookies llevan __Host- y los atributos que el prefijo exige", () => {
  conEntorno({ NODE_ENV: "production" }, () => {
    assert.equal(nombreCookie("pp_votante"), "__Host-pp_votante");
    const atributos = atributosCookie();
    // Sin cualquiera de estos tres, el navegador descarta la cookie en silencio.
    assert.equal(atributos.secure, true);
    assert.equal(atributos.path, "/");
    assert.equal("domain" in atributos, false);
  });
});

test("en desarrollo va el nombre pelado y sin Secure (http://localhost)", () => {
  conEntorno({ NODE_ENV: "development" }, () => {
    assert.equal(nombreCookie("pp_votante"), "pp_votante");
    assert.equal(atributosCookie().secure, false);
  });
});

test("el borrado lleva los mismos atributos que la escritura", () => {
  // Un borrado de __Host- sin Secure el navegador lo ignora y la sesion queda viva.
  conEntorno({ NODE_ENV: "production" }, () => {
    const borrado = borradoCookie("__Host-pp_votante");
    assert.equal(borrado.name, "__Host-pp_votante");
    assert.equal(borrado.secure, true);
    assert.equal(borrado.path, "/");
  });
});
