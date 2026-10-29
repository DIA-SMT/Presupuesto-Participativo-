/**
 * La columna "Ingresó" de la bandeja cuenta dias de calendario de Tucuman, no
 * bloques de 24 h: "hoy" tiene que coincidir con la fecha que muestra el title.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diasDeCalendarioEnTucuman } from "../../src/lib/formato";

// Tucuman es UTC-3 fijo.
const tuc = (iso: string) => new Date(`${iso}-03:00`);

test("una idea de anoche vista a la manana es de ayer, no de hoy", () => {
  assert.equal(
    diasDeCalendarioEnTucuman(tuc("2026-10-27T23:40:00"), tuc("2026-10-28T09:00:00")),
    1,
  );
});

test("el mismo dia local da 0 aunque en UTC ya sea manana", () => {
  // 21:30 en Tucuman es 00:30 UTC del dia siguiente.
  assert.equal(
    diasDeCalendarioEnTucuman(tuc("2026-10-28T08:00:00"), tuc("2026-10-28T21:30:00")),
    0,
  );
});

test("casi dos dias de reloj entre fechas contiguas siguen siendo 1 o 2 segun el calendario", () => {
  assert.equal(
    diasDeCalendarioEnTucuman(tuc("2026-10-26T00:10:00"), tuc("2026-10-27T23:50:00")),
    1,
  );
  assert.equal(
    diasDeCalendarioEnTucuman(tuc("2026-10-26T23:50:00"), tuc("2026-10-28T00:10:00")),
    2,
  );
});
