import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginDev from "@/components/LoginDev";
import { LogoFlor } from "@/components/Logo";
import { Aviso } from "@/components/ui";
import { getEdicionActiva } from "@/db/queries";
import { RUTA_INGRESO, ingresoHabilitado } from "@/lib/cidituc";
import { proveedorActivo } from "@/lib/empadronamiento";
import { formatearRango } from "@/lib/formato";
import { getSesionVotante } from "@/lib/sesion";

export const metadata: Metadata = {
  title: "Ingresar para votar",
  description:
    "Ingresá con tu ciudadanía digital CIDITUC para votar en el Presupuesto Participativo de San Miguel de Tucumán.",
};

export const dynamic = "force-dynamic";

/**
 * Los motivos con los que puede volver el ingreso de CIDITUC
 * (src/app/auth/cidituc/callback/route.ts y .../ingresar/route.ts). Cada
 * uno dice algo distinto a proposito: reintentar arregla "no pudimos consultar
 * tus datos" y no arregla "la votacion no esta abierta", asi que no pueden
 * compartir el mismo cartel.
 */
const MENSAJE_ERROR_INGRESO: Record<string, string> = {
  "sin-token": "El ingreso volvió sin credencial. Probá de nuevo desde el botón.",
  estado:
    "No pudimos confirmar que el ingreso haya empezado en este navegador, así que no lo dimos por válido. Entrá de nuevo desde el botón.",
  "token-invalido":
    "Tu credencial de CIDITUC no es válida o ya venció. Volvé a ingresar para obtener una nueva.",
  "sin-perfil":
    "No pudimos consultar tus datos en CIDITUC en este momento. Probá de nuevo en un rato; si sigue igual, avisanos.",
  "sin-documento":
    "CIDITUC no nos devolvió tu número de documento, así que no podemos empadronarte. Escribinos para que lo revisemos.",
  "sin-padron": "No pudimos guardar tu empadronamiento. Probá de nuevo en un rato.",
  "fuera-de-etapa": "La votación no está abierta en este momento, así que no hace falta ingresar.",
  "demasiados-intentos": "Hubo demasiados intentos desde tu conexión. Esperá unos minutos.",
  "ingreso-cerrado":
    "El ingreso con ciudadanía digital todavía no está habilitado. Cuando lo esté, vas a poder entrar desde acá.",
};

type Props = {
  searchParams: Promise<{ error?: string; salida?: string }>;
};

/**
 * Puerta del vecino: el unico lugar donde se entra para votar. /votar sin
 * sesion manda aca, y aca con sesion se sigue derecho a /votar.
 *
 * Es la pareja publica de /admin/ingresar y se arma igual (logo, a quien va
 * dirigida, la accion y un recuadro para quien se equivoco de puerta), pero no
 * la nombra: el panel del equipo no tiene enlaces desde el sitio publico.
 *
 * Fuera de la etapa de votacion no se ofrece el boton: el callback no abriria
 * sesion igual ("fuera-de-etapa"), y mandar a la persona a CIDITUC para
 * decirle eso a la vuelta es hacerle perder el tiempo.
 */
export default async function IngresarVecino({ searchParams }: Props) {
  const { error, salida } = await searchParams;
  const mensajeError = error ? MENSAJE_ERROR_INGRESO[error] : undefined;
  /*
   * Vuelta del boton "Salir" del panel de votacion (POST /api/auth/salir). El
   * cartel confirma que la sesion se cerro, que es lo que necesita ver quien
   * deja la tablet de una asamblea para la persona que sigue. Menciona CIDITUC
   * porque "Salir" cierra SOLO la sesion de este sitio: si CIDITUC recuerda la
   * cuenta en ese navegador, eso no lo podemos cerrar desde aca.
   */
  const salio = salida === "1";
  const edicion = await getEdicionActiva();
  const abierta = edicion?.etapa === "votacion";

  if (abierta && (await getSesionVotante())) redirect("/votar");

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
  const habilitado = ingresoHabilitado();

  return (
    <div className="contenedor py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm hover:underline"
          style={{ color: "var(--texto-suave)" }}
        >
          <span aria-hidden="true">←</span>
          Volver al inicio
        </Link>

        {salio && !mensajeError && (
          <div className="mt-4">
            <Aviso>
              <strong>Cerraste tu sesión.</strong> Si usaste una computadora o una tablet
              compartida y la página de CIDITUC te dejó la cuenta abierta, cerrala también allá
              antes de pasarle el equipo a otra persona.
            </Aviso>
          </div>
        )}

        {mensajeError && (
          <div className="mt-4">
            <Aviso tono="atencion">{mensajeError}</Aviso>
          </div>
        )}

        {abierta && proveedor === "dev" ? (
          <div className="mt-4">
            <LoginDev />
          </div>
        ) : (
          <div className="superficie mt-4 rounded-2xl p-8">
            <div className="flex items-center gap-3">
              <LogoFlor tamano={36} />
              <span
                className="text-xs font-semibold uppercase leading-tight tracking-wide"
                style={{ color: "var(--texto-suave)" }}
              >
                <span className="block">Presupuesto Participativo</span>
                <span className="block">San Miguel de Tucumán</span>
              </span>
            </div>

            <h1 className="mt-5 text-2xl font-bold">Ingresá para votar</h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              Para votar entrás con tu ciudadanía digital <strong>CIDITUC</strong>, la misma
              cuenta que usás para los trámites de la Municipalidad. No hace falta crear un
              usuario nuevo ni una contraseña para este sitio.
            </p>

            {!abierta ? (
              <div className="mt-5">
                <Aviso tono="atencion">
                  <strong>La votación no está abierta en este momento.</strong>{" "}
                  {edicion?.votacionDesde && (
                    <>
                      En la edición {edicion.anio} la votación{" "}
                      {new Date(edicion.votacionHasta ?? "") < new Date() ? "fue" : "será"}{" "}
                      {formatearRango(edicion.votacionDesde, edicion.votacionHasta)}.
                    </>
                  )}
                </Aviso>
              </div>
            ) : habilitado ? (
              <a
                href={RUTA_INGRESO}
                className="mt-6 flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
                style={{ background: "var(--color-marca-700)" }}
              >
                Ingresar con CIDITUC
              </a>
            ) : (
              error !== "ingreso-cerrado" && (
                <p className="mt-5 text-sm font-medium" style={{ color: "var(--acento-texto)" }}>
                  {MENSAJE_ERROR_INGRESO["ingreso-cerrado"]}
                </p>
              )
            )}

            {abierta && habilitado && (
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                Vas a salir un momento a la página de CIDITUC y, cuando ingreses, volvés acá
                para elegir tu proyecto.
              </p>
            )}
          </div>
        )}

        <div
          className="mt-6 rounded-2xl p-5"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          <p className="text-sm font-semibold">¿Todavía no tenés CIDITUC?</p>
          <p className="mt-1.5 text-sm" style={{ color: "var(--texto-suave)" }}>
            Te la podés hacer de manera virtual desde la página de la Municipalidad o de manera
            presencial en las asambleas participativas.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Link href="/acerca-de" className="font-medium underline">
              Cómo participar
            </Link>
            <Link href="/reglamento" className="font-medium underline">
              Reglamento
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
