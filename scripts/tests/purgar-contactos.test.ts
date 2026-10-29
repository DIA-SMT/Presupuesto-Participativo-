/**
 * La purga de contactos (scripts/purga-contactos.ts) contra una PGlite
 * descartable: que un pedido de supresion borre UNA idea y nada mas.
 *
 * El caso que importa es el de la edicion abierta. Antes, `--anio` se
 * presentaba como la herramienta para un pedido de supresion puntual y borraba
 * el nombre de todos los autores de la edicion, en cualquier etapa: con la 2026
 * en etapa ideas, el equipo se quedaba sin saber quien presento cada una.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { cargarMinimo, crearBaseDePrueba, type BaseDePrueba } from "./apoyo-base";
import { aplicarPurga, armarPurga, leerOpciones, type OpcionesPurga } from "../purga-contactos";

let base: BaseDePrueba;
let abierta: number;
let cerrada: number;
const ids: Record<string, number> = {};

test.before(async () => {
  base = await crearBaseDePrueba("purga");
  // La 2026 en curso (etapa ideas, como produccion hoy) y una 2025 cerrada.
  ({ edicionId: abierta } = await cargarMinimo(base, { etapa: "ideas" }));
  const [anterior] = await base.db
    .insert(base.schema.ediciones)
    .values({ anio: 2025, etapa: "cerrada", activa: false })
    .returning({ id: base.schema.ediciones.id });
  cerrada = anterior.id;

  const [votante] = await base.db
    .insert(base.schema.votantes)
    .values({ dniHash: "hash-de-prueba", proveedor: "cidituc", proveedorSub: "sub-1", verificado: true, nombre: "Ana" })
    .returning({ id: base.schema.votantes.id });

  const idea = async (clave: string, datos: { edicionId: number; numero: number; votanteId?: number }) => {
    const [fila] = await base.db
      .insert(base.schema.ideas)
      .values({
        edicionId: datos.edicionId,
        distritoId: 1,
        numero: datos.numero,
        titulo: `Idea ${clave}`,
        slug: clave,
        autorNombre: `Autor ${clave}`,
        autorEmail: `${clave}@ejemplo.com`,
        autorAvisos: true,
        votanteId: datos.votanteId ?? null,
      })
      .returning({ id: base.schema.ideas.id });
    ids[clave] = fila.id;
  };

  // El numero 12 existe en las dos ediciones: por eso --idea pide --anio.
  await idea("abierta-12", { edicionId: abierta, numero: 12, votanteId: votante.id });
  await idea("abierta-13", { edicionId: abierta, numero: 13 });
  await idea("abierta-14", { edicionId: abierta, numero: 14 });
  await idea("cerrada-12", { edicionId: cerrada, numero: 12 });
});

test.after(async () => {
  await base.cerrar();
});

/** Las ideas que todavia tienen nombre de autor, por clave. */
async function conNombre(): Promise<string[]> {
  const filas = await base.consultar<{ slug: string }>(base.sql`
    SELECT slug FROM ideas WHERE autor_nombre IS NOT NULL ORDER BY slug
  `);
  return filas.map((f) => f.slug);
}

function opciones(argumentos: string[]): OpcionesPurga {
  const lectura = leerOpciones(argumentos);
  assert.ok(lectura.ok, lectura.ok ? "" : lectura.error);
  return lectura.opciones;
}

test("los argumentos: --idea pide --anio, y --edicion-entera no va con --idea", () => {
  assert.deepEqual(leerOpciones(["--anio", "2026", "--idea", "12", "--confirmar"]), {
    ok: true,
    opciones: { anio: 2026, idea: 12, edicionEntera: false },
    confirmar: true,
  });
  assert.deepEqual(leerOpciones([]), {
    ok: true,
    opciones: { anio: null, idea: null, edicionEntera: false },
    confirmar: false,
  });

  const rechazos = [
    ["--idea", "12"],
    ["--anio"],
    ["--anio", "dos mil"],
    ["--anio", "12"],
    ["--anio", "2026", "--idea", "0"],
    ["--anio", "2026", "--idea", "-3"],
    ["--edicion-entera"],
    ["--anio", "2026", "--idea", "12", "--edicion-entera"],
  ];
  for (const argumentos of rechazos) {
    assert.equal(leerOpciones(argumentos).ok, false, argumentos.join(" "));
  }
});

test("--anio solo se niega con la edicion abierta, y el UPDATE tampoco la toca", async () => {
  const pedido = opciones(["--anio", "2026"]);
  const plan = await armarPurga(base.consultar, pedido);
  assert.match(plan.negativa ?? "", /no cerrada/);
  assert.match(plan.negativa ?? "", /--idea <numero>/);

  // Aunque alguien llamara a la escritura sin mirar la negativa, la condicion
  // repite la regla de la etapa.
  assert.deepEqual(await aplicarPurga(base.consultar, pedido), []);
  assert.deepEqual(await conNombre(), ["abierta-12", "abierta-13", "abierta-14", "cerrada-12"]);
});

test("una edicion o una idea que no existen se niegan", async () => {
  assert.match((await armarPurga(base.consultar, opciones(["--anio", "2031"]))).negativa ?? "", /no existe/);
  assert.match(
    (await armarPurga(base.consultar, opciones(["--anio", "2026", "--idea", "99"]))).negativa ?? "",
    /no tiene una idea #99/,
  );
});

test("--idea purga una sola fila, aunque la edicion este abierta", async () => {
  const pedido = opciones(["--anio", "2026", "--idea", "12"]);
  const plan = await armarPurga(base.consultar, pedido);
  assert.equal(plan.negativa, null);
  assert.equal(plan.total, 1);
  assert.equal(plan.idea?.titulo, "Idea abierta-12", "la vista previa muestra cual es");
  assert.equal(plan.idea?.conVotante, true, "avisa que el nombre tambien esta en el padron");

  assert.deepEqual(await aplicarPurga(base.consultar, pedido), [ids["abierta-12"]]);
  // La 12 de 2025 tiene el mismo numero y no se toca.
  assert.deepEqual(await conNombre(), ["abierta-13", "abierta-14", "cerrada-12"]);

  const [purgada] = await base.consultar<{
    autor_email: string | null;
    autor_avisos: boolean;
    purgada: boolean;
    con_votante: boolean;
  }>(base.sql`
    SELECT autor_email, autor_avisos, contacto_purgado_en IS NOT NULL AS purgada,
           votante_id IS NOT NULL AS con_votante
      FROM ideas WHERE id = ${ids["abierta-12"]}
  `);
  assert.deepEqual(purgada, { autor_email: null, autor_avisos: false, purgada: true, con_votante: true });

  // Repetir el pedido no hace nada: ya no queda contacto en esa idea.
  assert.equal((await armarPurga(base.consultar, pedido)).total, 0);
});

test("sin --anio se purgan solo las ediciones cerradas", async () => {
  const pedido = opciones([]);
  const plan = await armarPurga(base.consultar, pedido);
  assert.deepEqual(plan.ediciones, [{ anio: 2025, etapa: "cerrada", conContacto: 1 }]);
  assert.deepEqual(await aplicarPurga(base.consultar, pedido), [ids["cerrada-12"]]);
  assert.deepEqual(await conNombre(), ["abierta-13", "abierta-14"]);
});

test("--edicion-entera purga la edicion abierta solo si se lo pide", async () => {
  const pedido = opciones(["--anio", "2026", "--edicion-entera"]);
  const plan = await armarPurga(base.consultar, pedido);
  assert.equal(plan.negativa, null);
  assert.equal(plan.total, 2);
  assert.deepEqual(
    (await aplicarPurga(base.consultar, pedido)).sort((a, b) => a - b),
    [ids["abierta-13"], ids["abierta-14"]].sort((a, b) => a - b),
  );
  assert.deepEqual(await conNombre(), []);
});
