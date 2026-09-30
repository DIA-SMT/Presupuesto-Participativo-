/**
 * Cargar una idea con la etapa cerrada.
 *
 * La etapa de presentacion de ideas la define la edicion activa, y fuera de
 * esa ventana el alta esta cerrada: es una regla del reglamento, no una
 * decision del sitio. Pero el programa esta hoy en seguimiento de obras y el
 * equipo necesita poder recorrer el circuito completo para mostrarlo (pedido
 * de Lucas, 26/08/2026: "al ser un proyecto de prueba tengo que poder cargar
 * una idea, mas que nada para mostrar el MVP").
 *
 * La puerta NO se abre para cualquiera. Se abre de dos maneras:
 *
 *  1. **Con sesion del equipo.** Quien tiene la cookie pp_admin es del
 *     municipio. Es el camino normal para una demostracion: no hay que
 *     configurar nada ni redeployar, alcanza con estar adentro.
 *  2. **Con MODO_PRUEBA_IDEAS=1.** Para mostrarlo desde un telefono o una
 *     compu sin sesion. Es una variable de entorno y no un parametro en la
 *     URL a proposito: un `?prueba=1` lo descubre cualquiera y deja el alta
 *     abierta al publico fuera de la ventana del reglamento.
 *
 * Lo que la idea cargada asi NO tiene es un trato distinto: entra `pendiente`
 * y sin publicar, igual que una real, porque justamente lo que se quiere
 * mostrar es el circuito real. No mueve ningun numero publico (las
 * estadisticas cuentan solo ideas publicadas). Despues de la demo, desde la
 * ficha del panel se DESCARTA (queda despublicada, fuera de toda cuenta y con
 * motivo, sin borrarla). Para borrarla del todo esta
 * `npx tsx scripts/ver-ideas-web.ts --borrar <numero>`, con el numero que
 * mostro la pantalla de idea recibida (sin `--confirmar` solo muestra cual
 * borraria), y antes del lanzamiento `scripts/limpiar-pruebas.ts` barre todas.
 */
import { getSesionAdmin } from "@/lib/sesion";

/** La variable de entorno, sola. Sirve para explicarle a la persona por que. */
export function modoPruebaPorEntorno(): boolean {
  return process.env.MODO_PRUEBA_IDEAS === "1";
}

/**
 * Si esta persona puede cargar una idea aunque la etapa este cerrada.
 *
 * El `.catch` no es decoracion: `getSesionAdmin()` valida la sesion contra la
 * base, asi que tira si la base no contesta, y esto se llama desde la pagina
 * publica de carga y desde las rutas de /api/ideas. Sin el, una base caida
 * tiraria la pagina entera en lugar de dejarla cerrada, que es el estado
 * seguro. Tambien se traga la redireccion de una cuenta con la contrasena
 * provisoria sin cambiar: esa sesion no abre la carga fuera de etapa. Una
 * sesion cortada (baja, cambio de rol o de contrasena) tampoco, porque para
 * `getSesionAdmin` es lo mismo que no tener cookie.
 */
export async function puedeCargarFueraDeEtapa(): Promise<boolean> {
  if (modoPruebaPorEntorno()) return true;
  const sesion = await getSesionAdmin().catch(() => null);
  return sesion !== null;
}
