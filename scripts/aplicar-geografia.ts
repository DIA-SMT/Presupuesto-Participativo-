/**
 * Lleva la geografia oficial corregida a la base que ya esta en produccion.
 *
 * Simula por defecto y no escribe nada. Para aplicar de verdad:
 *
 *     npx tsx scripts/aplicar-geografia.ts              (simula)
 *     npx tsx scripts/aplicar-geografia.ts --aplicar    (escribe)
 *
 * Por que existe en lugar de correr el seed: el seed reconstruye la base desde
 * cero y en produccion hay 103 ideas cargadas, votos y decisiones del equipo.
 * Esto toca lo minimo indispensable:
 *
 *  1. La geometria y el centroide de los 20 distritos.
 *  2. El distrito de cada idea, recalculado sobre la geometria nueva. Los
 *     distritos 15 y 19 se corrieron unos 600 m, asi que hay ideas que
 *     legitimamente cambian de distrito.
 *  3. Las coordenadas que el ETL habia descartado por venir en un sistema
 *     proyectado que entonces no sabiamos cual era. Ahora si: son Gauss-Kruger
 *     faja 3 (ver src/lib/gauss-kruger.ts).
 *
 * Cada cambio queda anotado en `notas_migracion` de la idea, que es donde el
 * proyecto registra las transformaciones para poder auditarlas despues.
 */
import "./cargar-env";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import {
  centroideDelMultipoligono,
  distritoDelPunto,
  parsearCoordenada,
  type ColeccionDistritos,
} from "../src/lib/geo";

const APLICAR = process.argv.includes("--aplicar");
const NOTA_DISTRITO = (antes: number, ahora: number) =>
  `Distrito recalculado de ${antes} a ${ahora} con la geometria oficial corregida del municipio (26/08/2026).`;
const NOTA_COORDENADA =
  "Coordenada recuperada del relevamiento original, reproyectada desde Gauss-Kruger faja 3 (26/08/2026).";

async function main() {
  const geo = JSON.parse(
    readFileSync("public/geo/distritos.geojson", "utf8"),
  ) as ColeccionDistritos;
  if (geo.features.length !== 20) {
    throw new Error(`distritos.geojson tiene ${geo.features.length} features y deberia tener 20.`);
  }

  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  console.log(APLICAR ? "MODO: aplicando cambios\n" : "MODO: simulacion, no se escribe nada\n");

  // -------------------------------------------------------------------------
  // 1. Geometria y centroide de los distritos
  // -------------------------------------------------------------------------
  const filasDistrito = await sql<{ id: number; numero: number; centroide_lat: string; centroide_lon: string }[]>`
    SELECT id, numero, centroide_lat, centroide_lon FROM distritos ORDER BY numero`;
  const idPorNumero = new Map(filasDistrito.map((d) => [Number(d.numero), d.id]));

  console.log("--- distritos ---");
  for (const feature of geo.features) {
    const numero = feature.properties.numero;
    const id = idPorNumero.get(numero);
    if (!id) { console.log(`  D${numero}: no existe en la base, se omite`); continue; }

    const centro = centroideDelMultipoligono(feature.geometry.coordinates);
    const antes = filasDistrito.find((d) => Number(d.numero) === numero)!;
    const corrimiento = Math.round(
      Math.hypot(
        (centro.lon - Number(antes.centroide_lon)) * 111320 * Math.cos((-26.85 * Math.PI) / 180),
        (centro.lat - Number(antes.centroide_lat)) * 110574,
      ),
    );

    if (APLICAR) {
      await sql`
        UPDATE distritos
           SET geojson = ${sql.json(feature.geometry as never)},
               centroide_lat = ${centro.lat.toFixed(7)},
               centroide_lon = ${centro.lon.toFixed(7)}
         WHERE id = ${id}`;
    }
    console.log(`  D${String(numero).padStart(2)}: geometria actualizada, centroide se mueve ${corrimiento} m`);
  }

  // -------------------------------------------------------------------------
  // 2 y 3. Ideas: coordenada recuperada y distrito recalculado
  // -------------------------------------------------------------------------
  const ideas = await sql<{
    id: number; numero: number; titulo: string; lat: string | null; lon: string | null;
    distrito_id: number; distrito: number; aproximada: boolean;
    coordenadas_originales: string | null; notas_migracion: string[] | null;
  }[]>`
    SELECT i.id, i.numero, i.titulo, i.lat, i.lon, i.distrito_id,
           d.numero AS distrito, i.ubicacion_aproximada AS aproximada,
           i.coordenadas_originales, i.notas_migracion
      FROM ideas i JOIN distritos d ON d.id = i.distrito_id
     ORDER BY i.numero`;

  console.log(`\n--- ideas (${ideas.length}) ---`);
  let recuperadas = 0;
  let movidas = 0;

  for (const idea of ideas) {
    const notas = [...(idea.notas_migracion ?? [])];
    let lat = idea.lat === null ? null : Number(idea.lat);
    let lon = idea.lon === null ? null : Number(idea.lon);
    let cambioCoordenada = false;

    /*
     * 3. Coordenada en faja 3 que se habia descartado.
     *
     * La nota del descarte NO se borra: es el registro de lo que paso en la
     * migracion original y borrarla seria reescribir la historia. Lo que evita
     * repetir el trabajo (y apilar la misma nota en cada corrida) es preguntar
     * si ya se recupero.
     */
    const seDescarto = notas.some((n) => /sistema proyectado desconocido/i.test(n));
    const yaRecuperada = notas.some((n) => /reproyectada desde Gauss-Kruger/i.test(n));
    if (seDescarto && !yaRecuperada && idea.coordenadas_originales) {
      const r = parsearCoordenada(idea.coordenadas_originales);
      if (r.punto && /faja 3/.test(r.nota ?? "")) {
        const metros = lat === null || lon === null ? null : Math.round(
          Math.hypot(
            (r.punto.lon - lon) * 111320 * Math.cos((-26.85 * Math.PI) / 180),
            (r.punto.lat - lat) * 110574,
          ),
        );
        lat = r.punto.lat;
        lon = r.punto.lon;
        cambioCoordenada = true;
        recuperadas += 1;
        notas.push(NOTA_COORDENADA);
        console.log(
          `  #${idea.numero}: coordenada recuperada` +
            (metros === null ? "" : `, se mueve ${metros} m del centroide donde estaba`),
        );
      }
    }

    if (lat === null || lon === null) continue;

    // 2. Distrito sobre la geometria nueva.
    const nuevo = distritoDelPunto({ lat, lon }, geo);
    if (nuevo === null) {
      console.log(`  #${idea.numero}: ATENCION queda fuera de los 20 distritos; se deja como esta`);
      continue;
    }

    const cambiaDistrito = nuevo !== Number(idea.distrito);
    if (cambiaDistrito) {
      movidas += 1;
      notas.push(NOTA_DISTRITO(Number(idea.distrito), nuevo));
      console.log(`  #${idea.numero}: D${idea.distrito} -> D${nuevo}   ${idea.titulo.slice(0, 45)}`);
    }

    if (!cambiaDistrito && !cambioCoordenada) continue;

    if (APLICAR) {
      const nuevoId = idPorNumero.get(nuevo)!;
      await sql`
        UPDATE ideas
           SET distrito_id = ${nuevoId},
               lat = ${lat.toFixed(7)},
               lon = ${lon.toFixed(7)},
               ubicacion_aproximada = ${cambioCoordenada ? false : idea.aproximada},
               notas_migracion = ${notas}
         WHERE id = ${idea.id}`;
    }
  }

  console.log(`\nResumen`);
  console.log(`  coordenadas recuperadas: ${recuperadas}`);
  console.log(`  ideas que cambian de distrito: ${movidas}`);
  console.log(
    APLICAR
      ? "\nAplicado. Conviene revisar /distritos y el mapa de la portada."
      : "\nNada se escribio. Para aplicar: npx tsx scripts/aplicar-geografia.ts --aplicar",
  );
  await sql.end();
}

void main();
