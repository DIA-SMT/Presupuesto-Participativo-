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
 *  1. **Con sesion del equipo que pueda escribir** (moderador o admin). Es el
 *     camino normal para una demostracion: no hay que configurar nada ni
 *     redeployar, alcanza con estar adentro. Un lector NO: el panel le promete
 *     que "solo mira" y no le deja cargar desde /admin/ideas/nueva, y la carga
 *     fuera de etapa cae en la edicion activa de verdad, asi que esta puerta
 *     no puede ser mas ancha que la del panel. Antes bastaba con cualquier
 *     cookie pp_admin valida, y una cuenta lectora podia meter ideas en una
 *     edicion en evaluacion sin que quedara de quien eran.
 *  2. **Con MODO_PRUEBA_IDEAS=1.** Para mostrarlo desde un telefono o una
 *     compu sin sesion. Es una variable de entorno y no un parametro en la
 *     URL a proposito: un `?prueba=1` lo descubre cualquiera y deja el alta
 *     abierta al publico fuera de la ventana del reglamento.
 *
 * Lo que la idea cargada asi NO tiene es un trato distinto: entra `pendiente`
 * y sin publicar, igual que una real, porque justamente lo que se quiere
 * mostrar es el circuito real. Lo unico que lleva de mas es `cargado_por` con
 * el nombre de la cuenta del equipo que la cargo, si habia una sesion (ver
 * `cargaFueraDeEtapa`): sin eso, en la bandeja se confundia con la de un
 * vecino y no quedaba rastro de quien la habia metido. No mueve ningun numero
 * publico (las estadisticas cuentan solo ideas publicadas). Despues de la demo, desde la
 * ficha del panel se DESCARTA (queda despublicada, fuera de toda cuenta y con
 * motivo, sin borrarla). Para borrarla del todo esta
 * `npx tsx scripts/ver-ideas-web.ts --borrar <numero>`, con el numero que
 * mostro la pantalla de idea recibida (sin `--confirmar` solo muestra cual
 * borraria), y antes del lanzamiento `scripts/limpiar-pruebas.ts` barre todas.
 */
import { JERARQUIA } from "@/app/admin/comun";
import { getSesionAdmin, type SesionAdmin } from "@/lib/sesion";

/** La variable de entorno, sola. Sirve para explicarle a la persona por que. */
export function modoPruebaPorEntorno(): boolean {
  return process.env.MODO_PRUEBA_IDEAS === "1";
}

/** La carga fuera de etapa esta abierta, y esto es lo que se sabe de quien carga. */
export type CargaFueraDeEtapa = {
  /**
   * El nombre de la cuenta del equipo que carga, para `ideas.cargado_por`.
   * null con MODO_PRUEBA_IDEAS=1 y sin sesion del panel: no hay cuenta que
   * nombrar.
   */
  cargadoPor: string | null;
};

/**
 * La regla, sin cookies ni base: si con esta sesion del panel y este estado de
 * MODO_PRUEBA_IDEAS se abre la carga fuera de etapa. Separada de
 * `cargaFueraDeEtapa` para poder probarla (scripts/tests/modo-prueba.test.ts);
 * el resto del codigo pasa por aquella.
 *
 * La sesion tiene que alcanzar el rol de moderador, el mismo minimo que pide la
 * carga del panel. Con la variable de entorno puede cargar cualquiera, y si
 * ademas hay una sesion del equipo (aunque sea lectora) su nombre se anota
 * igual: es quien la cargo.
 */
export function permisoFueraDeEtapa(
  sesion: SesionAdmin | null,
  porEntorno: boolean,
): CargaFueraDeEtapa | null {
  const puedeEscribir = sesion !== null && JERARQUIA[sesion.rol] >= JERARQUIA.moderador;
  if (!puedeEscribir && !porEntorno) return null;
  return { cargadoPor: sesion?.nombre ?? null };
}

/**
 * Si esta persona puede cargar una idea aunque la etapa este cerrada, y con que
 * nombre queda la carga; null si no puede.
 *
 * El `.catch` no es decoracion: `getSesionAdmin()` valida la sesion contra la
 * base, asi que tira si la base no contesta, y esto se llama desde la pagina
 * publica de carga y desde las rutas de /api/ideas. Sin el, una base caida
 * tiraria la pagina entera en lugar de dejarla cerrada, que es el estado
 * seguro. Tambien se traga la redireccion de una cuenta con la contrasena
 * provisoria sin cambiar: esa sesion no abre la carga fuera de etapa. Una
 * sesion cortada (baja, cambio de rol o de contrasena) tampoco, porque para
 * `getSesionAdmin` es lo mismo que no tener cookie.
 *
 * La sesion se mira aunque este MODO_PRUEBA_IDEAS=1, para poder anotar quien
 * carga. Sin cookie no cuesta nada: `getSesionAdmin` no consulta la base si no
 * hay token que validar.
 */
export async function cargaFueraDeEtapa(): Promise<CargaFueraDeEtapa | null> {
  const sesion = await getSesionAdmin().catch(() => null);
  return permisoFueraDeEtapa(sesion, modoPruebaPorEntorno());
}

/**
 * Lo mismo, como si o no: para las pantallas y rutas que solo deciden si la
 * puerta esta abierta (el formulario, el ingreso con CIDITUC, el asistente) y
 * no escriben la idea.
 */
export async function puedeCargarFueraDeEtapa(): Promise<boolean> {
  return (await cargaFueraDeEtapa()) !== null;
}
