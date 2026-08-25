import { getAdminPorId } from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import CabeceraPanel from "./navegacion";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesionAdmin();
  const nombre = sesion ? await nombreDeLaCuenta(sesion.adminId, sesion.email) : null;

  return (
    <div className="contenedor-panel py-8">
      {/* Sin sesion no hay cabecera: /admin/ingresar se dibuja sola. */}
      {sesion && nombre && (
        <CabeceraPanel nombre={nombre} email={sesion.email} rol={sesion.rol} />
      )}
      {children}
    </div>
  );
}

/**
 * El nombre de la persona que entro al panel. La sesion (el JWT de la cookie)
 * guarda el id, el correo y el rol, pero no el nombre, asi que sale de la base
 * por `getAdminPorId()`, la consulta tipada de src/db/queries.ts: el panel no
 * arma SQL suelto. Antes traia la tabla entera con `listarAdmins()` en cada
 * render de cada pantalla del panel para quedarse con una sola fila.
 *
 * Si la consulta falla se cae al correo y el panel sigue en pie: este layout NO
 * esta cubierto por error.tsx (el boundary envuelve las paginas y los layouts
 * de abajo, no el layout de su mismo segmento), asi que un problema leyendo un
 * dato decorativo no se puede llevar puesta la cabecera entera.
 */
async function nombreDeLaCuenta(adminId: number, email: string): Promise<string> {
  try {
    const propia = await getAdminPorId(adminId);
    return propia?.nombre.trim() || email;
  } catch (causa) {
    console.error("[admin] no se pudo leer el nombre de la cuenta", causa);
    return email;
  }
}
