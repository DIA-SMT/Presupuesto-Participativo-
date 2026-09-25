/**
 * Pruebas de los nombres y atributos de las cookies propias. Se corren con
 * `npm test` y no necesitan base ni servidor: lo que se prueba es la decision.
 *
 * El caso que motivo todo esto es el del subdominio hermano: `gob.ar` esta en
 * la Public Suffix List, asi que para el navegador cualquier `*.smt.gob.ar` es
 * el mismo sitio y puede escribir cookies que despues llegan aca con el mismo
 * nombre que las nuestras.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { atributosCookie, borradoCookie, nombreCookie } from "../../src/lib/cookies";

/** NODE_ENV se toca en varias pruebas: se restaura siempre. */
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
