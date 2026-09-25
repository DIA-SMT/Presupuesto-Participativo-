import Link from "next/link";
import { redirect } from "next/navigation";
import { getCategorias, getEdicionActiva } from "@/db/queries";
import { puedeCargarIdea } from "@/lib/etapas";
import { ETIQUETA_ETAPA } from "@/lib/formato";
import { getSesionAdmin } from "@/lib/sesion";
import { urlDelSitio } from "@/lib/sitio";
import { limitesDeLaIdea } from "../limites";
import { hoyEnTucuman } from "../operaciones";
import FormularioCarga from "./formulario";

export const metadata = { title: "Cargar una idea" };

/**
 * Carga de una idea por el equipo: lo que llego de una asamblea, por mail o en
 * papel a la oficina. Hasta la Fase 2 la unica via era el formulario publico,
 * que fija el canal "web", no registra quien cargo y aplica el tope de 5 por
 * hora por IP tambien al equipo (en 2025, 89 de las 100 ideas entraron por
 * asamblea).
 *
 * La pagina decide que mostrar (el rol, la etapa), pero no autoriza nada: eso
 * lo hace la accion `cargarIdea`, que relee el rol y la etapa de la base.
 *
 * Los largos y minimos viajan como props (ver ../limites.ts): son los que
 * valida el servidor, sin traer zod al navegador.
 */
export default async function CargarIdea() {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const edicion = await getEdicionActiva();
  const volver = (
    <Link href="/admin" className="text-sm underline" style={{ color: "var(--marca-texto)" }}>
      ← Volver a Propuestas
    </Link>
  );

  if (!edicion) {
    return (
      <div>
        {volver}
        <h1 className="mt-3 text-2xl font-bold">Cargar una idea</h1>
        <p className="mt-2 text-sm">No hay una edición activa. Activá una antes de cargar ideas.</p>
      </div>
    );
  }

  const encabezado = (
    <header>
      {volver}
      <h1 className="mt-3 text-2xl font-bold">Cargar una idea · Edición {edicion.anio}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        Para lo que llegó de una asamblea, por mail o en papel a la oficina. Entra igual que una del
        formulario del sitio: <strong>en evaluación y sin publicar</strong>, con su número y su
        código de seguimiento para el vecino. No se pide ni se guarda el correo de nadie.
      </p>
    </header>
  );

  // El rol del JWT alcanza para decidir que se muestra; la accion relee el de
  // la base antes de escribir.
  if (sesion.rol === "lector") {
    return (
      <div>
        {encabezado}
        <p className="mt-6 text-sm">
          Tu rol es de lectura: podés ver las propuestas, pero no cargar ideas nuevas.
        </p>
      </div>
    );
  }

  const porEtapa = puedeCargarIdea(edicion.etapa);
  if (!porEtapa.permitido) {
    return (
      <div>
        {encabezado}
        <div
          className="mt-6 max-w-3xl rounded-2xl px-5 py-4 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-acento-600) 35%, transparent)",
          }}
        >
          <p className="font-semibold">
            En la etapa “{ETIQUETA_ETAPA[edicion.etapa] ?? edicion.etapa}” no se cargan ideas
            nuevas.
          </p>
          <p className="mt-1">{porEtapa.motivo}</p>
        </div>
      </div>
    );
  }

  const categorias = await getCategorias();

  return (
    <div>
      {encabezado}
      <FormularioCarga
        anio={edicion.anio}
        enEvaluacion={edicion.etapa === "evaluacion"}
        categorias={categorias.map((categoria) => ({
          slug: categoria.slug,
          nombre: categoria.nombre,
          descripcion: categoria.descripcion,
        }))}
        hoy={hoyEnTucuman()}
        limites={limitesDeLaIdea()}
        sitio={urlDelSitio().replace(/^https?:\/\//, "")}
      />
    </div>
  );
}
