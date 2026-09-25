/**
 * Interruptor de los avisos por correo a quien presenta una idea.
 *
 * El formulario ofrecia "Quiero dejar mi correo para que me avisen cómo sigue
 * mi idea", pero ese aviso no existe: no hay envio de correos (es la tanda 6,
 * que no esta hecha) y el panel del equipo tampoco muestra el correo, asi que
 * nadie lo podia usar ni a mano. Era juntar un dato personal para una finalidad
 * que no se cumple, que es lo que el principio de finalidad de la ley de datos
 * personales (25.326) pide no hacer.
 * Mientras tanto, el seguimiento se hace con el numero de idea y el codigo que
 * devuelve el alta (/ideas/seguimiento), que no necesita ningun contacto.
 *
 * Apagado:
 *  - src/components/FormularioIdea.tsx no dibuja la casilla ni el campo;
 *  - POST /api/ideas descarta `autorEmail` y `autorAvisos` ANTES de validar,
 *    aunque lleguen (una pestaña vieja, un script): no se guardan ni se piden
 *    como validos.
 *
 * Para prenderlo, cuando exista el envio: poner `true` aca y revisar que la
 * politica de privacidad (/privacidad) y VERSION_CONSENTIMIENTO
 * (src/lib/avisos.ts) digan lo que el envio hace de verdad. El resto —la
 * casilla desmarcada, el refine del consentimiento en src/lib/idea-esquema.ts y
 * las columnas de la base— quedo intacto y vuelve a funcionar solo.
 *
 * Es una constante del codigo y no una variable de entorno a proposito: que se
 * junten correos tiene que ser una decision que pasa por una revision del
 * codigo, no un valor que alguien prende en un despliegue.
 *
 * Vive en un archivo propio, sin dependencias, porque lo leen las dos puntas:
 * el formulario (que corre en el navegador) y la ruta del alta. El tipo va
 * explicito (`boolean` y no el literal `false`) para que TypeScript no de por
 * muerto el codigo de la casilla y lo siga revisando mientras esta apagada.
 */
export const AVISO_POR_MAIL_HABILITADO: boolean = false;
