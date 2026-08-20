import Link from "next/link";
import { getSesionAdmin } from "@/lib/sesion";
import { salirAdmin } from "./acciones";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesionAdmin();

  return (
    <div className="contenedor py-8">
      {sesion && (
        <div
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          <nav className="flex flex-wrap gap-1 text-sm font-medium" aria-label="Panel">
            {[
              { href: "/admin", texto: "Ideas" },
              { href: "/admin/obras", texto: "Obras" },
              { href: "/admin/contenido", texto: "Contenido" },
              { href: "/admin/consultas", texto: "Consultas del chat" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 hover:brightness-95"
                style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }}
              >
                {item.texto}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span style={{ color: "var(--texto-suave)" }}>
              {sesion.email} · {sesion.rol}
            </span>
            <form action={salirAdmin}>
              <button type="submit" className="underline">
                Salir
              </button>
            </form>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
