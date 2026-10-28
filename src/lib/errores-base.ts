/**
 * Lo que se registra en los logs de un error de escritura, sin los datos que
 * se estaban escribiendo.
 *
 * drizzle envuelve toda falla de una consulta en un DrizzleQueryError cuyo
 * mensaje es "Failed query: <sql>\nparams: <valores>", y ademas guarda los
 * `params` en el objeto. Un `console.error(etiqueta, causa)` vuelca todo eso
 * (el stack lleva el mensaje) en los logs del hosting, que tienen otros
 * lectores y otra retencion que la base y que purgar-contactos no alcanza. En
 * el alta de una idea los valores son el nombre de la cuenta de CIDITUC, el id
 * en el padron y el punto del mapa; en el voto, que persona voto que proyecto;
 * en el alta de una cuenta del panel, el correo y el hash de la contrasena.
 *
 * Se conserva lo que sirve para diagnosticar: el nombre de cada error de la
 * cadena de causas, el codigo (de Postgres o de la conexion, como ECONNRESET)
 * y el constraint. Los mensajes no, ni siquiera los de Postgres: algunos
 * (`invalid input syntax for type integer: "..."`) repiten el valor. Es el
 * mismo criterio que `errorSinDatosPersonales` de src/lib/empadronamiento.ts.
 */
export function resumenDeError(causa: unknown): string {
  const nombres: string[] = [];
  let codigo: string | undefined;
  let restriccion: string | undefined;
  for (let actual: unknown = causa; actual instanceof Error; actual = actual.cause) {
    const conDatos = actual as Error & { code?: unknown; constraint?: unknown };
    // DrizzleQueryError no se pone `name` y queda "Error": la clase dice mas.
    nombres.push(actual.name === "Error" ? actual.constructor.name || "Error" : actual.name);
    if (typeof conDatos.code === "string") codigo ??= conDatos.code;
    if (typeof conDatos.constraint === "string") restriccion ??= conDatos.constraint;
    // Una cadena circular no deja colgado al registro.
    if (nombres.length >= 10) break;
  }
  if (nombres.length === 0) return `error no estandar (${typeof causa})`;
  const datos = [
    `codigo ${codigo ?? "desconocido"}`,
    ...(restriccion ? [`constraint ${restriccion}`] : []),
  ];
  return `${nombres.join(" > ")} (${datos.join(", ")})`;
}
