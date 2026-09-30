/**
 * Nombre y atributos de las cookies propias del sitio, en UN solo lugar.
 *
 * Por que el prefijo __Host-
 * -------------------------
 * `gob.ar` esta en la Public Suffix List, asi que para el navegador el "sitio"
 * es `smt.gob.ar` entero: cualquier otro sistema del municipio bajo
 * `*.smt.gob.ar` puede escribir una cookie con `Domain=smt.gob.ar` que despues
 * llega a este sitio con el mismo nombre que las nuestras. Si alguno de esos
 * sistemas tiene una falla, alguien puede plantarle a un vecino una
 * `pp_votante` propia (su sesion, en el navegador de otro) o una
 * `pp_cidituc_estado` elegida por el, que es justo el numero que ata la vuelta
 * de CIDITUC a la salida.
 *
 * Una cookie que empieza con `__Host-` el navegador la acepta solo si viene con
 * `Secure`, con `Path=/` y SIN `Domain`: o sea, solo la puede haber escrito este
 * mismo host, por HTTPS. Otro subdominio no la puede fabricar ni pisar.
 *
 * En desarrollo (http://localhost) no hay HTTPS, asi que va el nombre pelado:
 * un `__Host-` sin `Secure` el navegador lo descarta en silencio y la sesion
 * "no se guarda" sin ningun error. Por eso el nombre y el `secure` salen de la
 * MISMA condicion (`cookiesSeguras`) y no de dos que se puedan desalinear.
 *
 * Lo que NO se hace: leer tambien el nombre sin prefijo "por compatibilidad"
 * con las cookies de antes del cambio. Esa es exactamente la cookie que un
 * subdominio si puede plantar, y aceptarla anularia el prefijo. El costo es de
 * una sola vez: al desplegar, las sesiones abiertas con el nombre viejo dejan
 * de valer y hay que volver a entrar (la del votante dura 4 horas; la del
 * equipo, 12).
 *
 * Este modulo no importa nada de Next a proposito: lo usa tambien
 * src/lib/cidituc.ts, que se prueba con `npm test` sin contexto de request.
 */

/** Con HTTPS de verdad: el despliegue. `next dev` corre en http://localhost. */
export function cookiesSeguras(): boolean {
  return process.env.NODE_ENV === "production";
}

/** El nombre con el que se escribe, se lee y se borra la cookie. */
export function nombreCookie(base: string): string {
  return cookiesSeguras() ? `__Host-${base}` : base;
}

/**
 * Los atributos que exige el prefijo, mas los que ya usaba el sitio.
 *
 * Van tambien al BORRAR: borrar es escribir la misma cookie vencida, y el
 * navegador rechaza un `Set-Cookie` de `__Host-` sin `Secure` aunque sea para
 * borrarla. Con el `delete(nombre)` a secas de Next la cookie quedaba viva.
 *
 * "lax" y no "strict": la vuelta desde CIDITUC es una navegacion que viene de
 * otro sitio, y con "strict" no viajaria ni el estado ni, despues, la sesion en
 * el primer pedido a /votar.
 */
export function atributosCookie() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookiesSeguras(),
    path: "/",
  };
}

/** Lo que hay que pasarle a `cookies().delete(...)` para que el borrado valga. */
export function borradoCookie(nombre: string) {
  return { name: nombre, ...atributosCookie() };
}
