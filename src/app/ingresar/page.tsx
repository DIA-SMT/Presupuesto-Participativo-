import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginDev from "@/components/LoginDev";
import { LogoFlor } from "@/components/Logo";
import { Aviso } from "@/components/ui";
import { getEdicionActiva } from "@/db/queries";
import { RUTA_INGRESO, ingresoHabilitado } from "@/lib/cidituc";
import { proveedorActivo } from "@/lib/empadronamiento";
import { votacionTerminada } from "@/lib/ediciones";
import { mensajeDeErrorIngreso } from "@/lib/errores-ingreso";
import { formatearRango } from "@/lib/formato";
import type { Etapa } from "@/lib/etapas";
import {
  PANTALLA_DEL_DESTINO,
  destinoDeIngreso,
  etapaDejaIngresar,
  otroDestino,
  puertaDeIngreso,
  type DestinoIngreso,
} from "@/lib/ingreso-vecino";
import { puedeCargarFueraDeEtapa } from "@/lib/modo-prueba";
import { getSesionVotante } from "@/lib/sesion";

export const metadata: Metadata = {
  title: "Ingresar",
  description:
    "Ingresá con tu ciudadanía digital CIDITUC para presentar tu idea o votar en el Presupuesto Participativo de San Miguel de Tucumán.",
};

/**
 * Lo que cambia la pantalla segun para que entra la persona (ver
 * src/lib/ingreso-vecino.ts): el titulo, la explicacion, el aviso cuando la
 * etapa no esta abierta y lo que va a pasar a la vuelta.
 */
const TEXTOS_DEL_DESTINO: Record<
  DestinoIngreso,
  { titulo: string; para: string; cerrada: string; vuelta: string; pregunta: string }
> = {
  votar: {
    titulo: "Ingresá para votar",
    para: "Para votar",
    cerrada: "La votación no está abierta en este momento.",
    vuelta: "volvés acá para elegir tu proyecto",
    pregunta: "¿Venías a votar?",
  },
  ideas: {
    titulo: "Ingresá para presentar tu idea",
    para: "Para presentar una idea",
    cerrada: "La presentación de ideas no está abierta en este momento.",
    vuelta: "volvés directo al formulario para cargar tu idea",
    pregunta: "¿Venías a presentar una idea?",
  },
};

/**
 * Si la puerta de ese destino esta abierta. La misma regla que el callback y
 * que la salida a CIDITUC: si aca se ofrece el boton, a la vuelta se abre la
 * sesion.
 */
async function puertaAbierta(destino: DestinoIngreso, etapa: Etapa | undefined): Promise<boolean> {
  const fueraDeEtapa =
    destino === "ideas" && etapa !== "ideas" && (await puedeCargarFueraDeEtapa());
  return etapaDejaIngresar(destino, etapa, fueraDeEtapa);
}

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; salida?: string; para?: string }>;
};

/**
 * Puerta del vecino: el unico lugar donde se entra, para votar o (con
 * `?para=ideas`) para presentar una idea. /votar e /ideas/nueva sin sesion
 * mandan aca, y aca con sesion se sigue derecho a la pantalla del destino.
 *
 * Es la pareja publica de /admin/ingresar y se arma igual (logo, a quien va
 * dirigida, la accion y un recuadro para quien se equivoco de puerta), pero no
 * la nombra: el panel del equipo no tiene enlaces desde el sitio publico.
 *
 * Fuera de la etapa del destino no se ofrece el boton: el callback no abriria
 * sesion igual ("fuera-de-etapa"), y mandar a la persona a CIDITUC para
 * decirle eso a la vuelta es hacerle perder el tiempo.
 */
export default async function IngresarVecino({ searchParams }: Props) {
  const { error, salida, para } = await searchParams;
  const destino = destinoDeIngreso(para);
  const textos = TEXTOS_DEL_DESTINO[destino];
  // Solo un motivo conocido: `?error=constructor` tiraba la pagina entera (ver
  // `mensajeDeErrorIngreso`).
  const mensajeError =
    error === "fuera-de-etapa"
      ? `${textos.cerrada} No hace falta ingresar.`
      : mensajeDeErrorIngreso(error);
  /*
   * Vuelta del boton "Salir" del panel de votacion (POST /api/auth/salir). El
   * cartel confirma que la sesion se cerro, que es lo que necesita ver quien
   * deja la tablet de una asamblea para la persona que sigue. Menciona CIDITUC
   * porque "Salir" cierra SOLO la sesion de este sitio: si CIDITUC recuerda la
   * cuenta en ese navegador, eso no lo podemos cerrar desde aca.
   */
  const salio = salida === "1";
  const edicion = await getEdicionActiva();
  const abierta = await puertaAbierta(destino, edicion?.etapa);
  /*
   * Con esta puerta cerrada, la otra puede estar abierta: quien llega a
   * /ingresar pelado en la etapa de ideas (un enlace escrito a mano, el de
   * /admin/ingresar) venia a presentar una idea. Sin el enlace a la otra
   * puerta la pantalla no tenia ningun boton, y varios de los errores de
   * arriba dicen "entra de nuevo desde el boton".
   */
  const otra = otroDestino(destino);
  const otraAbierta = !abierta && (await puertaAbierta(otra, edicion?.etapa));

  if (abierta && (await getSesionVotante())) redirect(PANTALLA_DEL_DESTINO[destino]);

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

            <h1 className="mt-5 text-2xl font-bold">{textos.titulo}</h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
              {textos.para} entrás con tu ciudadanía digital <strong>CIDITUC</strong>, la misma
              cuenta que usás para los trámites de la Municipalidad. No hace falta crear un
              usuario nuevo ni una contraseña para este sitio.
            </p>

            {!abierta ? (
              <div className="mt-5">
                <Aviso tono="atencion">
                  <strong>{textos.cerrada}</strong>{" "}
                  {/*
                    "Fue" o "será" lo dice la etapa y no la fecha cargada: el
                    equipo puede cerrar una etapa antes de su fecha de fin, o
                    dejarla vacia, y con la fecha el aviso decia "será" de algo
                    que ya habia terminado. Las ideas son la primera etapa: con
                    su puerta cerrada, ya pasaron.
                  */}
                  {destino === "ideas" && edicion?.ideasDesde && (
                    <>
                      En la edición {edicion.anio} la presentación de ideas{" "}
                      {edicion.etapa !== "ideas" ? "fue" : "será"}{" "}
                      {formatearRango(edicion.ideasDesde, edicion.ideasHasta)}.
                    </>
                  )}
                  {destino === "votar" && edicion?.votacionDesde && (
                    <>
                      En la edición {edicion.anio} la votación{" "}
                      {votacionTerminada(edicion.etapa) ? "fue" : "será"}{" "}
                      {formatearRango(edicion.votacionDesde, edicion.votacionHasta)}.
                    </>
                  )}
                </Aviso>
                {otraAbierta && (
                  <>
                    <p className="mt-5 text-sm font-semibold">{TEXTOS_DEL_DESTINO[otra].pregunta}</p>
                    <Link
                      href={puertaDeIngreso(otra)}
                      className="mt-2 flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
                      style={{ background: "var(--color-marca-700)" }}
                    >
                      {TEXTOS_DEL_DESTINO[otra].titulo}
                    </Link>
                  </>
                )}
              </div>
            ) : habilitado ? (
              <a
                // Con el destino siempre, tambien el de votar: sin `?para` la
                // salida lo deduce de la etapa, y el boton ya sabe cual es.
                href={`${RUTA_INGRESO}?para=${destino}`}
                className="mt-6 flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
                style={{ background: "var(--color-marca-700)" }}
              >
                Ingresar con CIDITUC
              </a>
            ) : (
              error !== "ingreso-cerrado" && (
                <p className="mt-5 text-sm font-medium" style={{ color: "var(--acento-texto)" }}>
                  {mensajeDeErrorIngreso("ingreso-cerrado")}
                </p>
              )
            )}

            {abierta && habilitado && (
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--texto-suave)" }}>
                Vas a salir un momento a la página de CIDITUC y, cuando ingreses, {textos.vuelta}.
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
