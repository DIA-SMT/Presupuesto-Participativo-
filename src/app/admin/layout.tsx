import { unstable_rethrow } from "next/navigation";
import { getSesionAdmin, type SesionAdmin } from "@/lib/sesion";
import { salirAdmin } from "./acciones";
import CabeceraPanel from "./navegacion";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * El marco del panel: la cabecera con las secciones y la cuenta.
 *
 * La sesion sale de `getSesionAdmin`, la misma validacion contra la base que
 * usan las paginas y las acciones: una cuenta desactivada, o una sesion
 * cortada por un cambio de rol o de contrasena, no tiene cabecera. Y el nombre
 * viene de esa misma fila: antes era una consulta aparte (`getAdminPorId`) en
 * cada render; ahora `cache` de React hace que el layout, la pagina y el layout
 * raiz compartan una sola lectura por pedido.
 *
 * Este layout NO redirige a /admin/ingresar: envuelve tambien a esa pantalla, y
 * un layout no sabe en que ruta esta (ni se vuelve a renderizar al navegar,
 * ver node_modules/next/dist/docs/01-app/02-guides/authentication.md, "Layouts
 * and auth checks"). Quien manda al ingreso es cada pagina con su
 * `getSesionAdmin()`. Por lo mismo pasa `permitirPasswordProvisoria`: si
 * redirigiera a /admin/password, esa pantalla tambien quedaria redirigiendo.
 *
 * Si la base no contesta, el layout sigue en pie sin cabecera: este layout no
 * esta cubierto por error.tsx (el boundary envuelve las paginas y los layouts
 * de abajo, no el layout de su mismo segmento). La pagina, que pide la misma
 * lectura, cae en ese boundary y muestra el error adentro del marco.
 * `unstable_rethrow` deja pasar lo que Next lanza a proposito (una redireccion,
 * el corte de un render estatico por leer cookies), que no es un error.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesionAdmin({ permitirPasswordProvisoria: true }).catch(
    (causa: unknown) => {
      unstable_rethrow(causa);
      console.error("[admin] no se pudo validar la sesion del panel", causa);
      return null;
    },
  );

  return (
    <div className="contenedor-panel py-8">
      {/* Sin sesion no hay cabecera: /admin/ingresar se dibuja sola. */}
      {sesion &&
        (sesion.debeCambiarPassword ? (
          <CabeceraProvisoria sesion={sesion} />
        ) : (
          <CabeceraPanel nombre={nombreVisible(sesion)} email={sesion.email} rol={sesion.rol} />
        ))}
      {children}
    </div>
  );
}

function nombreVisible(sesion: SesionAdmin): string {
  return sesion.nombre.trim() || sesion.email;
}

/**
 * Cabecera de una cuenta que todavia tiene la contrasena provisoria: la cuenta
 * y Salir, sin las secciones. Todas mandarian de vuelta a /admin/password
 * (ver `getSesionAdmin` en src/lib/sesion.ts), y ofrecer enlaces que no llevan
 * a ningun lado confunde mas de lo que ayuda. Cuando la persona elige su
 * contrasena, la accion reemite la cookie y Next vuelve a dibujar el arbol
 * entero, este layout incluido: aparece la cabecera completa sin recargar.
 *
 * Mismo formato que el bloque de la cuenta de CabeceraPanel (navegacion.tsx),
 * con el mismo relleno en Salir para llegar a los 24 px de WCAG 2.5.8.
 */
function CabeceraProvisoria({ sesion }: { sesion: SesionAdmin }) {
  return (
    <div
      className="mb-6 flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 pb-2 text-xs"
      style={{ borderBottom: "1px solid var(--borde)" }}
    >
      <section aria-label="Tu cuenta" className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm font-semibold">{nombreVisible(sesion)}</span>
        <span style={{ color: "var(--texto-suave)" }}>{sesion.email}</span>
        <form action={salirAdmin} className="-my-1.5">
          <button
            type="submit"
            className="px-1 py-1.5 underline"
            style={{ color: "var(--texto-suave)" }}
          >
            Salir
          </button>
        </form>
      </section>
    </div>
  );
}
