/**
 * Politica de contrasenas del backoffice.
 *
 * Vive en su propio modulo, sin dependencias de Node, porque la comparten el
 * servidor (src/app/admin/acciones.ts, que es "use server" y ahi solo se pueden
 * exportar funciones async) y la pantalla de cambio de contrasena, que es un
 * componente cliente. Poner la constante en src/lib/password.ts arrastraria
 * node:crypto al bundle del navegador.
 */

/**
 * Largo minimo de la contrasena, definido por el equipo del municipio.
 *
 * Es corto para lo que este login protege: da acceso al padron y a los datos de
 * contacto de los vecinos. Lo que sostiene la seguridad es el resto de la
 * cadena, no el largo:
 *  - los topes de `ingresarAdmin` (src/lib/tope-ingreso-admin.ts): 10 intentos
 *    por IP cada 10 minutos y 50 por hora contra una misma cuenta. El de la IP
 *    solo no alcanzaba: quien rota IP con un pool de proxies probaba miles de
 *    contraseñas por minuto contra la misma cuenta. El de la cuenta es el que
 *    acota un diccionario, y aun asi una contraseña de las mas comunes cae en
 *    los primeros cientos de intentos: el largo no protege de eso.
 *  - hash con scrypt (src/lib/password.ts), que hace lento el ataque offline,
 *  - las cuentas creadas desde el panel o desde scripts/crear-admin.ts nacen
 *    con una provisoria aleatoria de 16 caracteres.
 *
 * Este es el unico lugar donde cambiarlo: lo leen la accion del servidor y el
 * formulario.
 */
export const MINIMO_PASSWORD = 6;
