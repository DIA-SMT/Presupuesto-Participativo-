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
 *  - tope de 10 intentos por IP cada 10 minutos en `ingresarAdmin`,
 *  - hash con scrypt (src/lib/password.ts), que hace lento el ataque offline,
 *  - las cuentas creadas desde el panel o desde scripts/crear-admin.ts nacen
 *    con una provisoria aleatoria de 16 caracteres.
 *
 * Este es el unico lugar donde cambiarlo: lo leen la accion del servidor y el
 * formulario.
 */
export const MINIMO_PASSWORD = 6;
