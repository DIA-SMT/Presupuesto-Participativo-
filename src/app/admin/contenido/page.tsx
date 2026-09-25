import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getNovedades,
  listarFaqAdmin,
  listarNovedadesAdmin,
  listarTextosAdmin,
  NOVEDADES_EN_PORTADA,
} from "@/db/queries";
import { CLAVE_AVISO_URGENTE } from "@/lib/aviso-urgente";
import { getSesionAdmin } from "@/lib/sesion";
import { exigirAdmin } from "../comun";
import SeccionAviso from "./aviso";
import {
  agruparTextos,
  CLAVE_REGLAMENTO_AVISO,
  CLAVE_REGLAMENTO_CUERPO,
  type TextoDelPanel,
} from "./catalogo";
import SeccionNovedades from "./novedades";
import SeccionPreguntas from "./preguntas";
import SeccionReglamento from "./reglamento";
import { enlaceSeccion, SECCIONES, seccionValida, type SeccionContenido } from "./secciones";
import SeccionTextos from "./textos";

/**
 * Contenido del sitio: los textos de cada pagina, el reglamento, las preguntas
 * frecuentes (que el chat usa enteras), las novedades de la portada y el aviso
 * urgente.
 *
 * Se habia sacado en 98d0f8d y volvio en la Fase 2: sin esta pantalla el
 * reglamento, una pregunta frecuente o un aviso se cambiaban con SQL contra
 * produccion.
 *
 * SOLO ADMIN. La cabecera esconde el enlace a los otros roles, pero eso es
 * cosmetico: la pagina relee el rol de la base con `exigirAdmin("admin")`
 * (el JWT de la cookie puede tener un rol viejo durante 12 horas) y cada accion
 * lo vuelve a hacer. A un moderador o lector que llega por la URL no se le
 * muestra nada de adentro.
 *
 * Los datos salen de src/db/queries.ts y se piden solo los de la solapa
 * abierta, salvo los textos, que se necesitan siempre para los avisos de
 * arriba (el aviso urgente publicado, el reglamento vacio).
 */
export const metadata: Metadata = { title: "Contenido" };

type Props = { searchParams: Promise<{ seccion?: string }> };

/** Fecha y hora en Tucuman, como las muestra el resto del panel. */
const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

/** "YYYY-MM-DD" de hoy en Tucuman (en-CA escribe las fechas asi). */
const fechaIso = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

export default async function AdminContenido({ searchParams }: Props) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const autorizacion = await exigirAdmin("admin");
  if (!autorizacion) return <SoloAdministradores />;

  const seccion = seccionValida((await searchParams).seccion);

  const filas = await listarTextosAdmin();
  // La fecha se formatea aca y viaja hecha: si la formateara el navegador con su
  // propio reloj y huso, el HTML del servidor y el del cliente podrian no coincidir.
  const grupos = agruparTextos(
    filas.map((fila) => ({
      clave: fila.clave,
      valor: fila.valor,
      descripcion: fila.descripcion,
      actualizado: fechaHora.format(fila.actualizado),
    })),
  );
  const todos = grupos.flatMap((grupo) => grupo.textos);
  const texto = (clave: string): TextoDelPanel => todos.find((t) => t.clave === clave)!;

  const aviso = texto(CLAVE_AVISO_URGENTE);
  const cuerpo = texto(CLAVE_REGLAMENTO_CUERPO);

  return (
    <div>
      <h1 className="text-2xl font-bold">Contenido del sitio</h1>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Lo que el vecino lee en las páginas públicas y lo que el chat sabe del programa. Cada cambio
        se ve en el sitio al instante y queda registrado con tu nombre.
      </p>

      {/*
        Los dos avisos que valen en cualquier solapa: un aviso urgente olvidado
        sigue en todas las paginas, y el reglamento vacio es la razon por la que
        volvio esta pantalla.
      */}
      {aviso.valor !== "" && seccion !== "aviso" && (
        <p
          className="mt-4 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
            border: "1px solid var(--color-acento-600)",
          }}
        >
          <strong>Hay un aviso urgente publicado en todas las páginas:</strong> “{aviso.valor}”.{" "}
          <Link href={enlaceSeccion("aviso")} className="font-semibold underline">
            Editarlo o quitarlo
          </Link>
        </p>
      )}
      {cuerpo.valor === "" && seccion !== "reglamento" && (
        <p
          className="mt-4 rounded-2xl px-4 py-3 text-sm"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          El reglamento todavía no está cargado: /reglamento muestra un aviso en su lugar.{" "}
          <Link href={enlaceSeccion("reglamento")} className="font-semibold underline">
            Cargarlo
          </Link>
        </p>
      )}

      <nav
        aria-label="Secciones del contenido"
        className="mt-6 flex flex-wrap items-end"
        style={{ borderBottom: "1px solid var(--borde)" }}
      >
        <ul className="-mb-px flex flex-wrap items-end">
          {SECCIONES.map((opcion) => (
            <li key={opcion.valor}>
              <Link
                href={enlaceSeccion(opcion.valor)}
                aria-current={opcion.valor === seccion ? "page" : undefined}
                className="solapa"
              >
                {opcion.titulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        <Solapa seccion={seccion} grupos={grupos} cuerpo={cuerpo} aviso={aviso} texto={texto} />
      </div>
    </div>
  );
}

async function Solapa({
  seccion,
  grupos,
  cuerpo,
  aviso,
  texto,
}: {
  seccion: SeccionContenido;
  grupos: ReturnType<typeof agruparTextos>;
  cuerpo: TextoDelPanel;
  aviso: TextoDelPanel;
  texto: (clave: string) => TextoDelPanel;
}) {
  switch (seccion) {
    case "reglamento":
      return <SeccionReglamento cuerpo={cuerpo} aviso={texto(CLAVE_REGLAMENTO_AVISO)} />;
    case "preguntas":
      return <SeccionPreguntas preguntas={await listarFaqAdmin()} />;
    case "novedades": {
      // La portada decide cuales se ven con getNovedades: se pregunta lo mismo,
      // con el mismo numero, en lugar de adivinarlo con otra consulta.
      const [novedades, enPortada] = await Promise.all([
        listarNovedadesAdmin(),
        getNovedades(NOVEDADES_EN_PORTADA),
      ]);
      return (
        <SeccionNovedades
          novedades={novedades}
          enPortada={enPortada.map((novedad) => novedad.id)}
          cuantasEnPortada={NOVEDADES_EN_PORTADA}
          hoy={fechaIso.format(new Date())}
        />
      );
    }
    case "aviso":
      return <SeccionAviso aviso={aviso} />;
    default:
      // Sin los grupos que tienen solapa propia: SeccionTextos no los dibuja, y
      // pasarlos igual mandaba al navegador el reglamento entero (hasta 200.000
      // caracteres) en cada visita a esta solapa.
      return (
        <SeccionTextos
          grupos={grupos.filter((grupo) => grupo.grupo !== "reglamento" && grupo.grupo !== "aviso")}
        />
      );
  }
}

function SoloAdministradores() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Contenido del sitio</h1>
      <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
        Esta pantalla es solo para administradores: cambia lo que lee todo el sitio y lo que el chat
        le contesta a la gente. Si hay que corregir un texto, una pregunta frecuente o publicar un
        aviso, pedíselo a un administrador del panel.
      </p>
      <p className="mt-4 text-sm">
        <Link href="/admin" className="font-semibold underline">
          Volver a las propuestas
        </Link>
      </p>
    </div>
  );
}
