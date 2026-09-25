"use client";

/**
 * Panel de votacion: eleccion del proyecto del propio distrito y confirmacion
 * del voto. Solo se dibuja con sesion de votante: sin ella, /votar manda a
 * /ingresar, que es donde se entra con CIDITUC (o con el login de prueba).
 *
 * Los proyectos llegan en orden alfabetico (lo pide /votar a listarIdeas) y
 * aca no se reordenan: cualquier otro orden le da ventaja a alguien.
 *
 * En los tres estados con sesion —boleta, falta el distrito y ya voto— hay un
 * boton "Salir". La sesion dura horas y sobrevive a cerrar el navegador: en una
 * tablet de asamblea, sin ese boton la persona que sigue votaba con la
 * identidad de la anterior. Al votar la sesion se cierra sola en el servidor
 * (POST /api/votos); el boton queda igual en la pantalla de "Gracias", que
 * dice a quien se voto: en un equipo compartido, "Salir" la saca de la vista
 * de la persona que sigue.
 */
import { useState } from "react";
import { colorCategoria } from "@/lib/formato";

/** La ruta que cierra la sesion (src/app/api/auth/salir/route.ts). */
const RUTA_SALIR = "/api/auth/salir";

type Proyecto = {
  slug: string;
  titulo: string;
  barrio: string | null;
  categoriaSlug: string | null;
  categoriaNombre: string | null;
  categoriaColor: string | null;
};

type Props = {
  sesion: { distrito: number | null; nombre: string | null };
  proyectos: Proyecto[];
  yaVoto: boolean;
};

export default function PanelVotacion({
  sesion,
  proyectos,
  yaVoto,
}: Props) {
  const [elegido, setElegido] = useState<Proyecto | null>(null);
  const [estado, setEstado] = useState<
    | { tipo: "inicial" }
    | { tipo: "confirmando" }
    | { tipo: "enviando" }
    /**
     * `sesionCerrada`: si el servidor ya borro la cookie. Pasa al registrar el
     * voto y al rebotar uno repetido; NO cuando /votar dibuja esta pantalla
     * porque la persona volvio a entrar despues de haber votado (ahi la sesion
     * sigue abierta hasta que apriete "Salir").
     */
    | { tipo: "votado"; proyecto: string; sesionCerrada: boolean }
    /** `reingresar`: la sesion ya no existe, y la salida es volver a entrar. */
    | { tipo: "error"; mensaje: string; reingresar?: boolean }
  >(yaVoto ? { tipo: "votado", proyecto: "", sesionCerrada: false } : { tipo: "inicial" });

  /** Con el nombre, si CIDITUC lo dio: en una tablet es lo que se reconoce. */
  const preguntaSalir = sesion.nombre ? `¿No sos ${sesion.nombre}?` : "¿No sos vos?";

  async function votar() {
    if (!elegido) return;
    setEstado({ tipo: "enviando" });
    try {
      const respuesta = await fetch("/api/votos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: elegido.slug }),
      });
      // Si la respuesta no es JSON (un 500 del servidor, un proxy caido) se
      // sigue con el mensaje propio y no con el "Unexpected token" del parser.
      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        ok?: boolean;
        proyecto?: string;
        error?: string;
        yaVoto?: boolean;
      };
      // Ya habia votado (en otra pestaña u otro dispositivo): no es un error
      // para reintentar, es la pantalla de "ya votaste". El servidor ya le
      // cerro la sesion, asi que la boleta no le serviria de nada.
      if (cuerpo.yaVoto) {
        setEstado({ tipo: "votado", proyecto: "", sesionCerrada: true });
        return;
      }
      // Sin sesion (la cerro "Salir" o un voto en otra pestaña, o vencio):
      // reintentar desde esta boleta no puede andar nunca.
      if (respuesta.status === 401) {
        setEstado({
          tipo: "error",
          mensaje: cuerpo.error ?? "Tu sesión se cerró. Ingresá de nuevo para votar.",
          reingresar: true,
        });
        return;
      }
      if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo registrar el voto.");
      setEstado({
        tipo: "votado",
        proyecto: cuerpo.proyecto ?? elegido.titulo,
        sesionCerrada: true,
      });
    } catch (causa) {
      setEstado({
        tipo: "error",
        mensaje: causa instanceof Error ? causa.message : "No se pudo registrar el voto.",
      });
    }
  }

  // --- Ya voto ---------------------------------------------------------------
  if (estado.tipo === "votado") {
    return (
      <div className="superficie mt-8 max-w-xl rounded-2xl p-8">
        <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
          Voto registrado
        </p>
        <h2 className="mt-2 text-2xl font-bold">Gracias por participar</h2>
        <p className="mt-3 text-[0.9375rem] leading-relaxed">
          {estado.proyecto
            ? `Tu voto para “${estado.proyecto}” quedó registrado.`
            : "Ya usaste tu voto en esta edición."}{" "}
          Es un voto por persona: no se puede votar de nuevo.
        </p>
        {estado.sesionCerrada && (
          <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
            Por seguridad ya cerramos tu sesión en este dispositivo: la próxima persona que lo use
            tiene que ingresar con su propia cuenta. Si es un equipo compartido, tocá “Salir” para
            que no vea esta pantalla.
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          {/* "y las obras" salio del texto: no hay ni un avance de obra cargado y
              la pagina ya no los muestra. Prometerselo justo despues de votar es
              donde mas se nota. */}
          <a href="/transparencia" className="text-sm font-semibold underline">
            Ver los proyectos ganadores
          </a>
          {/* Con la sesion abierta, la pregunta: quien encuentra esta pantalla
              en una tablet puede no ser quien voto. */}
          <BotonSalir pregunta={estado.sesionCerrada ? undefined : preguntaSalir} />
        </div>
      </div>
    );
  }

  // --- Con sesion pero sin distrito ------------------------------------------
  if (!sesion.distrito) {
    return (
      <div className="superficie mt-8 max-w-xl rounded-2xl p-8">
        <h2 className="text-xl font-bold">Falta tu distrito</h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Tu empadronamiento no tiene un distrito asignado, y el voto se emite en el distrito donde
          vivís. Acercate a una asamblea participativa para completarlo.
        </p>
        <div className="mt-5">
          <BotonSalir pregunta={preguntaSalir} />
        </div>
      </div>
    );
  }

  // --- Boleta -----------------------------------------------------------------
  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-2xl text-sm" style={{ color: "var(--texto-suave)" }}>
          {sesion.nombre ? `Hola, ${sesion.nombre}. ` : ""}Estás empadronado en el{" "}
          <strong>Distrito {sesion.distrito}</strong>. Estos son los proyectos factibles de tu
          distrito, en orden alfabético; elegí uno.
        </p>
        <BotonSalir pregunta="¿No sos vos?" />
      </div>

      {proyectos.length === 0 ? (
        <div className="superficie mt-5 max-w-xl rounded-2xl p-8">
          <p className="text-sm">
            Tu distrito no tiene proyectos factibles para votar en esta edición.
          </p>
        </div>
      ) : (
        <>
          <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Proyectos de tu distrito</legend>
            {proyectos.map((proyecto) => {
              const seleccionado = elegido?.slug === proyecto.slug;
              const colorDeCategoria = colorCategoria(
                proyecto.categoriaSlug,
                proyecto.categoriaColor,
              );
              const colorDelMarco = seleccionado ? "var(--color-marca-600)" : "var(--borde)";
              return (
                <label
                  key={proyecto.slug}
                  className="superficie cursor-pointer rounded-2xl p-5 transition"
                  // Cada lado por separado: mezclar `borderColor` con el atajo
                  // `borderLeft` hacia que React avisara al elegir un proyecto
                  // (cambiaba uno y no el otro) y el borde podia quedar mal.
                  style={{
                    borderStyle: "solid",
                    borderWidth: "2px 2px 2px 4px",
                    borderTopColor: colorDelMarco,
                    borderRightColor: colorDelMarco,
                    borderBottomColor: colorDelMarco,
                    borderLeftColor: colorDeCategoria ?? "var(--borde)",
                  }}
                >
                  <input
                    type="radio"
                    name="proyecto"
                    value={proyecto.slug}
                    checked={seleccionado}
                    onChange={() => {
                      setElegido(proyecto);
                      setEstado({ tipo: "confirmando" });
                    }}
                    className="sr-only"
                  />
                  <p className="text-base font-semibold leading-snug">{proyecto.titulo}</p>
                  <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                    {[proyecto.barrio && `B° ${proyecto.barrio}`, proyecto.categoriaNombre]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {seleccionado && (
                    <p className="mt-2 text-xs font-semibold" style={{ color: "var(--marca-texto)" }}>
                      Seleccionado
                    </p>
                  )}
                </label>
              );
            })}
          </fieldset>

          {estado.tipo === "error" && (
            <p
              role="alert"
              className="mt-4 max-w-xl rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              {estado.mensaje}
              {estado.reingresar && (
                <>
                  {" "}
                  <a href="/ingresar" className="font-semibold underline">
                    Ingresar de nuevo
                  </a>
                </>
              )}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={!elegido || estado.tipo === "enviando"}
              onClick={votar}
              className="rounded-xl px-6 py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ background: "var(--color-acento-600)" }}
            >
              {estado.tipo === "enviando"
                ? "Registrando el voto…"
                : elegido
                  ? `Votar “${elegido.titulo.slice(0, 40)}${elegido.titulo.length > 40 ? "…" : ""}”`
                  : "Elegí un proyecto para votar"}
            </button>
            <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Tenés un solo voto y no se puede cambiar después de confirmarlo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Cierra la sesion del votante y vuelve a /ingresar.
 *
 * Es un formulario HTML comun (POST a la ruta, que responde con una
 * redireccion) y no un fetch: la cookie es httpOnly y solo la puede borrar el
 * servidor, y asi el boton anda aunque el JavaScript de la pagina no haya
 * terminado de cargar. Va POST porque cerrar la sesion es una accion: un GET lo
 * dispararia cualquier enlace o precarga.
 *
 * Borde con --borde-control y no --borde: es un control, y WCAG 1.4.11 pide
 * 3:1 para lo que delimita un boton (ver globals.css).
 */
function BotonSalir({ pregunta }: { pregunta?: string }) {
  return (
    <form method="post" action={RUTA_SALIR} className="flex items-center gap-2.5">
      {pregunta && (
        <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
          {pregunta}
        </span>
      )}
      <button
        type="submit"
        className="rounded-xl px-4 py-2 text-sm font-semibold transition hover:brightness-95"
        style={{
          background: "var(--fondo-tarjeta)",
          border: "1px solid var(--borde-control)",
          color: "var(--texto)",
        }}
      >
        Salir
      </button>
    </form>
  );
}
