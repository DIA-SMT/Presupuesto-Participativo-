import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import PanelVotacion from "@/components/PanelVotacion";
import { Aviso } from "@/components/ui";
import { db } from "@/db";
import { votos } from "@/db/schema";
import { getEdicionActiva, getTextos, listarIdeas } from "@/db/queries";
import { ingresoHabilitado, urlDeIngreso } from "@/lib/cidituc";
import { proveedorActivo } from "@/lib/empadronamiento";
import { getSesionVotante } from "@/lib/sesion";
import { formatearRango } from "@/lib/formato";

export const metadata: Metadata = {
  title: "Votar",
  description:
    "Votación del Presupuesto Participativo de San Miguel de Tucumán: un voto por persona, en un proyecto del distrito donde vivís.",
};

export const dynamic = "force-dynamic";

/**
 * Los motivos con los que puede volver el ingreso de CIDITUC
 * (src/app/auth/cidituc/callback/route.ts). Cada uno dice algo distinto a
 * proposito: reintentar arregla "no pudimos consultar tus datos" y no arregla
 * "la votacion no esta abierta", asi que no pueden compartir el mismo cartel.
 */
const MENSAJE_ERROR_INGRESO: Record<string, string> = {
  "sin-token": "El ingreso volvió sin credencial. Probá de nuevo desde el botón.",
  "token-invalido":
    "Tu credencial de CIDITUC no es válida o ya venció. Volvé a ingresar para obtener una nueva.",
  "sin-perfil":
    "No pudimos consultar tus datos en CIDITUC en este momento. Probá de nuevo en un rato; si sigue igual, avisanos.",
  "sin-documento":
    "CIDITUC no nos devolvió tu número de documento, así que no podemos empadronarte. Escribinos para que lo revisemos.",
  "sin-padron": "No pudimos guardar tu empadronamiento. Probá de nuevo en un rato.",
  "fuera-de-etapa": "La votación no está abierta en este momento, así que no hace falta ingresar.",
  "demasiados-intentos": "Hubo demasiados intentos desde tu conexión. Esperá unos minutos.",
};

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function Votar({ searchParams }: Props) {
  const { error } = await searchParams;
  const mensajeError = error ? MENSAJE_ERROR_INGRESO[error] : undefined;
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

  let proveedor: "cidituc" | "dev" = "dev";
  try {
    proveedor = proveedorActivo();
  } catch {
    proveedor = "cidituc";
  }

  /*
   * El boton de CIDITUC solo se muestra cuando el Derivador ya tiene desplegada
   * la entrada de esta app (CIDITUC_INGRESO_HABILITADO). Antes de eso la
   * persona se autentica bien y queda varada en la pantalla de ellos: es peor
   * que no ofrecerlo.
   */
  const urlIngreso = proveedor === "cidituc" && ingresoHabilitado() ? urlDeIngreso() : null;

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

      {mensajeError && (
        <div className="mt-6 max-w-3xl">
          <Aviso tono="atencion">{mensajeError}</Aviso>
        </div>
      )}

      {abierta ? (
        <PanelVotacion
          proveedor={proveedor}
          urlIngreso={urlIngreso}
          sesion={sesion ? { distrito: sesion.distrito, nombre: sesion.nombre } : null}
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
