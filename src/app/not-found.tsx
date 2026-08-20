import Link from "next/link";

export default function NoEncontrada() {
  return (
    <div className="contenedor flex min-h-[50vh] flex-col items-start justify-center py-20">
      <p className="text-sm font-semibold" style={{ color: "var(--texto-suave)" }}>
        Error 404
      </p>
      <h1 className="mt-2 text-3xl font-bold">Esta página no existe</h1>
      <p className="mt-3 max-w-prose text-base" style={{ color: "var(--texto-suave)" }}>
        Puede que el enlace esté mal escrito o que el proyecto que buscás sea de otra edición.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-xl px-5 py-3 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          Ir a la portada
        </Link>
        <Link href="/proyectos" className="superficie rounded-xl px-5 py-3 text-sm font-semibold">
          Ver los proyectos
        </Link>
      </div>
    </div>
  );
}
