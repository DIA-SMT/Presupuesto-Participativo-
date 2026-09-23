import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import PanelVotacion from "@/components/PanelVotacion";
import { Aviso } from "@/components/ui";
import { db } from "@/db";
import { votos } from "@/db/schema";
import { getEdicionActiva, getTextos, listarIdeas } from "@/db/queries";
import { getSesionVotante } from "@/lib/sesion";
import { formatearRango } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Votar",
  description:
    "Votación del Presupuesto Participativo de San Miguel de Tucumán: un voto por persona, en un proyecto del distrito donde vivís.",
};

export const dynamic = "force-dynamic";

export default async function Votar() {
  const edicion = await getEdicionActiva();
  const textos = await getTextos();

  if (!edicion) {
    return (
      <div className="contenedor py-20">
        <Aviso tono="atencion">Todavía no hay una edición activa.</Aviso>
      </div>
    );
  }

  const abierta = edicion.etapa === "votacion";
  const sesion = abierta ? await getSesionVotante() : null;

  /*
   * Para votar hay que haber entrado con CIDITUC. Sin sesion la boleta no se
   * muestra: se manda a /ingresar, que explica el ingreso y tiene el boton.
   * Con la votacion cerrada no se manda a ningun lado: no hay nada que
   * ingresar, y el aviso de abajo dice cuando se vota.
   */
  if (abierta && !sesion) redirect("/ingresar");

  const proyectos =
    abierta && sesion?.distrito
      ? await listarIdeas({
          edicionId: edicion.id,
          distrito: sesion.distrito,
          estado: "factible",
        })
      : [];

  const yaVoto =
    abierta && sesion
      ? (
          await db
            .select({ id: votos.id })
            .from(votos)
            .where(
              and(eq(votos.edicionId, edicion.id), eq(votos.votanteId, sesion.votanteId)),
            )
            .limit(1)
        ).length > 0
      : false;

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">
          {textos["votacion-titulo"] ?? "Votación del Presupuesto Participativo"}
        </h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          {textos["votacion-subtitulo"] ??
            "Tenés 1 voto disponible y podés votar un proyecto del distrito donde vivís."}
        </p>
      </header>

      {abierta && sesion ? (
        <PanelVotacion
          sesion={{ distrito: sesion.distrito, nombre: sesion.nombre }}
          proyectos={proyectos.map((p) => ({
            slug: p.slug,
            titulo: p.titulo,
            barrio: p.barrio,
            categoriaSlug: p.categoriaSlug,
            categoriaNombre: p.categoriaNombre,
            categoriaColor: p.categoriaColor,
          }))}
          yaVoto={yaVoto}
        />
      ) : (
        <div className="mt-6 max-w-3xl">
          <Aviso tono="atencion">
            <strong>La votación no está abierta en este momento.</strong>{" "}
            {edicion.votacionDesde && (
              <>
                En la edición {edicion.anio} la votación{" "}
                {new Date(edicion.votacionHasta ?? "") < new Date() ? "fue" : "será"}{" "}
                {formatearRango(edicion.votacionDesde, edicion.votacionHasta)}.
              </>
            )}{" "}
            Mientras tanto podés ver qué proyecto ganó en cada distrito en{" "}
            <a href="/transparencia" className="font-semibold underline">
              Transparencia
            </a>
            .
          </Aviso>
        </div>
      )}
    </div>
  );
}
