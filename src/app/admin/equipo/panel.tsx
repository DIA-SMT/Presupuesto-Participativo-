"use client";

/**
 * Equipo del panel: alta de cuentas, cambio de rol, baja, contrasena
 * provisoria y la bitacora de todo eso.
 *
 * Las contrasenas provisorias llegan UNA sola vez, dentro del Resultado de
 * `crearAdmin` o de `restablecerPasswordAdmin`: en la base queda solo el hash,
 * asi que la pantalla la muestra en el momento y despues no hay forma de
 * recuperarla.
 *
 * Lo que esta pantalla no ofrece (tocar tu propia cuenta) es para no mostrar
 * botones que la accion igual va a rechazar: las reglas viven en ./cuentas.ts y
 * las decide el servidor, dentro de cada transaccion.
 *
 * Volvio en la Fase 2 con el estilo de hoy: los colores de texto son los
 * tokens que se leen en los dos temas (--acento-texto, --marca-texto) y los
 * controles llevan --borde-control (WCAG 1.4.11), donde la version de 98d0f8d^
 * usaba la rampa --color-acento-600 como color de letra.
 */
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Chip } from "@/components/ui";
import type { AccionEquipo, RolAdmin } from "@/db/queries";
import { ETIQUETA_ROL, formatearNumero } from "@/lib/formato";
import type { Resultado } from "../comun";
import { activarAdmin, cambiarRolAdmin, crearAdmin, restablecerPasswordAdmin } from "./acciones";

/*
 * useActionState le pasa a la accion su resultado anterior como primer
 * argumento, y con una accion del servidor ese argumento viaja en el pedido. En
 * el alta y en el restablecimiento ese resultado trae la provisoria: el envio
 * siguiente del mismo formulario se la mandaba de vuelta al servidor, que no la
 * usa, y `next dev` la imprimia en la terminal al loguear la llamada (visto:
 * `crearAdmin({..."passwordProvisoria":"..."}, {})`). Estas dos la cambian por
 * null antes de que salga del navegador.
 *
 * Lo que se pierde es el envio sin JavaScript, que con una funcion del cliente
 * de por medio no existe. Solo lo tenia el alta (las confirmaciones y "Ya la
 * copié" ya necesitaban JavaScript), y por ese camino la provisoria volvia dos
 * veces en el HTML: a la vista y en el campo oculto con el estado del
 * formulario, que "Ya la copié" no borra.
 */
function crearSinArrastrar(_previo: Resultado | null, formulario: FormData) {
  return crearAdmin(null, formulario);
}

function restablecerSinArrastrar(_previo: Resultado | null, formulario: FormData) {
  return restablecerPasswordAdmin(null, formulario);
}

export type CuentaEnPantalla = {
  id: number;
  email: string;
  nombre: string;
  rol: RolAdmin;
  activo: boolean;
  debeCambiarPassword: boolean;
  /** Ya formateado en el servidor. null = nunca ingreso. */
  ultimoIngreso: string | null;
  alta: string | null;
};

export type MovimientoEnPantalla = {
  id: number;
  adminNombre: string;
  objetivoEmail: string;
  accion: AccionEquipo;
  /** La persona cambio SU contrasena (y no se la restablecio otra). */
  propia: boolean;
  rolAnterior: RolAdmin | null;
  rolNuevo: RolAdmin | null;
  cuando: string;
};

/**
 * Lo que puede cada rol, dicho a partir del rol minimo que exige cada accion
 * (`exigirAdmin` en ../acciones.ts y en las acciones de cada carpeta). Si una
 * accion cambia de rol, este texto tiene que acompanarla. Solo lo que tiene
 * pantalla: el presupuesto y los avances de obra tienen acciones pero ninguna
 * pantalla las usa, y prometerlos aca era mandar a buscar algo que no existe.
 */
const ROLES: { valor: RolAdmin; etiqueta: string; detalle: string }[] = [
  {
    valor: "admin",
    etiqueta: "Administrador",
    detalle:
      "Todo lo del moderador, y además cambia la etapa del proceso, maneja las ediciones, proclama los proyectos ganadores, edita el contenido del sitio y administra las cuentas del equipo.",
  },
  {
    valor: "moderador",
    etiqueta: "Moderador",
    detalle:
      "Evalúa las propuestas y escribe la devolución, las publica o las despublica, carga las que llegan por otro canal, las corrige o las descarta, y carga el cronograma. No cambia la etapa ni proclama ganadores.",
  },
  {
    valor: "lector",
    etiqueta: "Lector",
    detalle: "Solo mira: entra al panel y consulta todo, pero no puede guardar ningún cambio.",
  },
];

const ETIQUETA_ACCION: Record<AccionEquipo, string> = {
  alta: "Alta de cuenta",
  cambio_rol: "Cambio de rol",
  desactivacion: "Desactivación",
  reactivacion: "Reactivación",
  cambio_password: "Cambio de contraseña",
};

/**
 * `cambio_password` es una sola accion en la tabla, y en la pantalla son dos:
 * quien cambio la suya, o quien le restablecio la contrasena a otra persona.
 */
function queHizo(fila: MovimientoEnPantalla): string {
  if (fila.accion === "cambio_password") {
    return fila.propia ? "Cambió su contraseña" : "Restableció la contraseña";
  }
  return ETIQUETA_ACCION[fila.accion];
}

function etiquetaRol(rol: RolAdmin): string {
  return ETIQUETA_ROL[rol] ?? rol;
}

/**
 * El rol de un movimiento: "antes → despues" cuando cambio, y si no el que
 * tenia. scripts/crear-admin.ts registra tambien el rol en un cambio de
 * contrasena, con el mismo valor en las dos columnas: "Lector → Lector" no dice
 * nada.
 */
function rolDelMovimiento(fila: MovimientoEnPantalla): string {
  if (fila.rolAnterior && fila.rolNuevo && fila.rolAnterior !== fila.rolNuevo) {
    return `${etiquetaRol(fila.rolAnterior)} → ${etiquetaRol(fila.rolNuevo)}`;
  }
  if (fila.rolNuevo) return etiquetaRol(fila.rolNuevo);
  return "—";
}

export default function PanelEquipo({
  yoId,
  cuentas,
  bitacora,
  limiteBitacora,
}: {
  yoId: number;
  cuentas: CuentaEnPantalla[];
  bitacora: MovimientoEnPantalla[];
  limiteBitacora: number;
}) {
  const activas = cuentas.filter((cuenta) => cuenta.activo).length;
  const administradores = cuentas.filter(
    (cuenta) => cuenta.activo && cuenta.rol === "admin",
  ).length;
  const pendientes = cuentas.filter(
    (cuenta) => cuenta.activo && cuenta.debeCambiarPassword,
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-bold">Equipo del panel</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        Cada alta, cambio de rol, baja o contraseña restablecida queda registrada en la bitácora de
        más abajo.
      </p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-4 text-sm">
        <span>
          <strong>{formatearNumero(cuentas.length)}</strong>{" "}
          {cuentas.length === 1 ? "cuenta" : "cuentas"}
        </span>
        <span style={{ color: "var(--texto-suave)" }}>
          {activas === cuentas.length
            ? "todas activas"
            : `${formatearNumero(activas)} ${activas === 1 ? "activa" : "activas"}`}
        </span>
        <span style={{ color: "var(--texto-suave)" }}>
          {administradores === 1
            ? "1 administrador activo"
            : `${formatearNumero(administradores)} administradores activos`}
        </span>
        {pendientes > 0 && (
          <span style={{ color: "var(--texto-suave)" }}>
            {pendientes === 1
              ? "1 con la contraseña provisoria sin cambiar"
              : `${formatearNumero(pendientes)} con la contraseña provisoria sin cambiar`}
          </span>
        )}
      </p>

      <section className="mt-6" aria-labelledby="titulo-roles">
        <h2 id="titulo-roles" className="text-lg font-bold">
          Qué puede hacer cada rol
        </h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {ROLES.map((rol) => (
            <li key={rol.valor} className="superficie rounded-2xl p-4">
              <p className="text-sm font-semibold">{rol.etiqueta}</p>
              <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
                {rol.detalle}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <section aria-labelledby="titulo-cuentas">
          <h2 id="titulo-cuentas" className="text-lg font-bold">
            Cuentas
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Para sacarle el acceso a alguien, desactivá la cuenta: así se conserva el historial de lo
            que revisó. No hay borrado de cuentas. Cambiar el rol, desactivar o restablecer la
            contraseña le cierra a esa persona las sesiones que tenga abiertas: tiene que volver a
            ingresar.
          </p>
          <ul className="mt-4 space-y-2">
            {cuentas.map((cuenta) => (
              <li key={cuenta.id}>
                <TarjetaCuenta cuenta={cuenta} esMiCuenta={cuenta.id === yoId} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="superficie rounded-2xl p-6" aria-labelledby="titulo-alta">
          <h2 id="titulo-alta" className="text-lg font-bold">
            Nueva cuenta
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Usá el correo institucional de la persona. La contraseña la genera el sistema: nadie
            elige la contraseña de otra persona.
          </p>
          <FormularioAlta />
        </aside>
      </div>

      <section className="mt-12" aria-labelledby="titulo-bitacora">
        <h2 id="titulo-bitacora" className="text-lg font-bold">
          Bitácora del equipo
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Los movimientos sobre las cuentas, de lo más nuevo a lo más viejo
          {bitacora.length >= limiteBitacora ? ` (se muestran los últimos ${limiteBitacora})` : ""}.
          No se puede editar ni borrar.
        </p>

        {bitacora.length === 0 ? (
          <p
            className="superficie mt-4 rounded-2xl px-5 py-4 text-sm"
            style={{ color: "var(--texto-suave)" }}
          >
            Todavía no hay movimientos registrados.
          </p>
        ) : (
          <div className="superficie mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full text-sm">
              {/* Como las otras tablas del panel: el titulo de la seccion no
                  llega a quien entra a la tabla con el lector de pantalla. */}
              <caption className="sr-only">
                Movimientos sobre las cuentas del equipo, del más nuevo al más viejo
              </caption>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--borde)" }}>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Cuándo
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Quién
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Qué hizo
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Sobre la cuenta
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Rol
                  </th>
                </tr>
              </thead>
              <tbody>
                {bitacora.map((fila) => (
                  <tr key={fila.id} style={{ borderTop: "1px solid var(--borde)" }}>
                    <td
                      className="whitespace-nowrap px-4 py-2.5"
                      style={{ color: "var(--texto-suave)" }}
                    >
                      {fila.cuando}
                    </td>
                    <td className="px-4 py-2.5">{fila.adminNombre}</td>
                    <td className="px-4 py-2.5">{queHizo(fila)}</td>
                    <td className="px-4 py-2.5">{fila.objetivoEmail}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--texto-suave)" }}>
                      {rolDelMovimiento(fila)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

type AccionDeTarjeta = "rol" | "activo" | "clave";

function TarjetaCuenta({
  cuenta,
  esMiCuenta,
}: {
  cuenta: CuentaEnPantalla;
  esMiCuenta: boolean;
}) {
  const [estadoRol, accionRol, guardandoRol] = useActionState(cambiarRolAdmin, null);
  const [estadoActivo, accionActivo, guardandoActivo] = useActionState(activarAdmin, null);
  const [estadoClave, accionClave, generandoClave] = useActionState(
    restablecerSinArrastrar,
    null,
  );

  // La desactivacion y el restablecimiento piden un segundo click: los dos le
  // cortan las sesiones a la otra persona, y el segundo le cambia la
  // contrasena que usa hoy. El cambio de rol no, porque se deshace igual.
  const [confirmando, setConfirmando] = useState<"baja" | "clave" | null>(null);
  // Tres acciones en la misma tarjeta: se muestra el resultado de la ultima
  // que se uso, no uno viejo de otra.
  const [ultima, setUltima] = useState<AccionDeTarjeta | null>(null);
  const [provisoriaOculta, setProvisoriaOculta] = useState<Resultado | null>(null);

  // El nombre de la persona describe cada control de la tarjeta: con varias
  // tarjetas, un lector de pantalla leia "Rol", "Cambiar rol" o "Desactivar
  // cuenta" iguales en todas, sin decir de quien.
  const idNombre = useId();

  // A donde va el foco cuando lo que lo tenia desaparece: el Cancelar de una
  // confirmacion, "Ya la copié", o el boton que se apreto (se deshabilita
  // mientras guarda, o se va con su confirmacion). Sin esto el foco caia al
  // principio de la pagina y quien usa teclado perdia el lugar.
  const botonBaja = useRef<HTMLButtonElement>(null);
  const botonClave = useRef<HTMLButtonElement>(null);
  const aviso = useRef<HTMLDivElement>(null);

  // Cada resultado nuevo se lleva el foco. Solo cambian cuando termina una
  // accion de ESTA tarjeta: la revalidacion que dispara otra tarjeta no los
  // toca.
  useEffect(() => {
    if (estadoRol || estadoActivo || estadoClave) aviso.current?.focus();
  }, [estadoRol, estadoActivo, estadoClave]);

  function enviar(accion: AccionDeTarjeta) {
    setUltima(accion);
    setConfirmando(null);
  }

  function cancelar() {
    (confirmando === "baja" ? botonBaja : botonClave).current?.focus();
    setConfirmando(null);
  }

  function ocultarProvisoria() {
    setProvisoriaOculta(estadoClave);
    botonClave.current?.focus();
  }

  const resultado =
    ultima === "rol" ? estadoRol : ultima === "activo" ? estadoActivo : ultima === "clave" ? estadoClave : null;
  const provisoria =
    ultima === "clave" && estadoClave?.ok && estadoClave.passwordProvisoria && provisoriaOculta !== estadoClave
      ? estadoClave.passwordProvisoria
      : null;

  return (
    <div className="superficie rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          {/* Un encabezado por tarjeta: con un lector de pantalla se salta de
              una cuenta a la otra. */}
          <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            <span id={idNombre}>{cuenta.nombre}</span>
            {esMiCuenta && <Chip color="var(--marca-texto)">tu cuenta</Chip>}
            {!cuenta.activo && <Chip color="var(--acento-texto)">desactivada</Chip>}
            {cuenta.activo && cuenta.debeCambiarPassword && (
              <Chip>contraseña provisoria sin cambiar</Chip>
            )}
          </h3>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            {cuenta.email}
          </p>
        </div>
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {cuenta.ultimoIngreso ? `último ingreso ${cuenta.ultimoIngreso}` : "nunca ingresó"}
          {cuenta.alta && ` · alta ${cuenta.alta}`}
        </p>
      </div>

      {esMiCuenta ? (
        <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
          Sos {etiquetaRol(cuenta.rol).toLowerCase()}. Desde acá no podés cambiarte el rol,
          desactivarte ni restablecer tu contraseña: así el panel nunca se queda sin nadie que lo
          administre. El rol te lo cambia otro administrador, y tu contraseña la cambiás vos desde{" "}
          <Link href="/admin/password" className="underline">
            Mi contraseña
          </Link>
          .
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
          <form action={accionRol} onSubmit={() => enviar("rol")} className="flex items-end gap-2">
            <input type="hidden" name="id" value={cuenta.id} />
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
                Rol
              </span>
              <select
                name="rol"
                defaultValue={cuenta.rol}
                aria-describedby={idNombre}
                className="rounded-xl px-3 py-2 text-sm"
                style={ESTILO_CAMPO}
              >
                {ROLES.map((rol) => (
                  <option key={rol.valor} value={rol.valor}>
                    {rol.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={guardandoRol}
              aria-describedby={idNombre}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              {guardandoRol ? "Guardando…" : "Cambiar rol"}
            </button>
          </form>

          {cuenta.activo ? (
            <button
              ref={botonBaja}
              type="button"
              onClick={() => setConfirmando(confirmando === "baja" ? null : "baja")}
              aria-expanded={confirmando === "baja"}
              aria-describedby={idNombre}
              disabled={guardandoActivo}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
              style={ESTILO_SECUNDARIO}
            >
              {guardandoActivo ? "Desactivando…" : "Desactivar cuenta"}
            </button>
          ) : (
            <form action={accionActivo} onSubmit={() => enviar("activo")}>
              <input type="hidden" name="id" value={cuenta.id} />
              <input type="hidden" name="activo" value="true" />
              <button
                type="submit"
                disabled={guardandoActivo}
                aria-describedby={idNombre}
                className="rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
                style={ESTILO_SECUNDARIO}
              >
                {guardandoActivo ? "Reactivando…" : "Reactivar cuenta"}
              </button>
            </form>
          )}

          <button
            ref={botonClave}
            type="button"
            onClick={() => setConfirmando(confirmando === "clave" ? null : "clave")}
            aria-expanded={confirmando === "clave"}
            aria-describedby={idNombre}
            disabled={generandoClave}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
            style={ESTILO_SECUNDARIO}
          >
            {generandoClave ? "Generando…" : "Restablecer contraseña"}
          </button>
        </div>
      )}

      {!esMiCuenta && confirmando === "baja" && (
        <Confirmacion
          texto={`Si desactivás la cuenta, a ${cuenta.nombre} se le cierran en el momento las sesiones abiertas y no puede volver a ingresar hasta que alguien la reactive. Lo que revisó queda en el historial.`}
          onCancelar={cancelar}
        >
          <form action={accionActivo} onSubmit={() => enviar("activo")}>
            <input type="hidden" name="id" value={cuenta.id} />
            <input type="hidden" name="activo" value="false" />
            <button
              type="submit"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--color-acento-600)" }}
            >
              Sí, desactivar
            </button>
          </form>
        </Confirmacion>
      )}

      {!esMiCuenta && confirmando === "clave" && (
        <Confirmacion
          texto={`Se genera una contraseña provisoria nueva para ${cuenta.nombre}: la que usa hoy deja de andar, se le cierran las sesiones abiertas y al ingresar tiene que elegir una propia. La provisoria se muestra una sola vez.`}
          onCancelar={cancelar}
        >
          <form action={accionClave} onSubmit={() => enviar("clave")}>
            <input type="hidden" name="id" value={cuenta.id} />
            <button
              type="submit"
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white"
              style={{ background: "var(--color-acento-600)" }}
            >
              Sí, restablecer
            </button>
          </form>
        </Confirmacion>
      )}

      <div ref={aviso} tabIndex={-1}>
        {provisoria && estadoClave?.ok ? (
          <ContrasenaProvisoria
            valor={provisoria}
            mensaje={estadoClave.mensaje}
            onOcultar={ocultarProvisoria}
          />
        ) : (
          resultado && (
            <p
              role={resultado.ok ? "status" : "alert"}
              className="mt-3 text-sm"
              style={{ color: resultado.ok ? "var(--color-cat-ambiental)" : "var(--acento-texto)" }}
            >
              {resultado.ok ? (resultado.mensaje ?? "Listo.") : resultado.error}
            </p>
          )
        )}
      </div>
    </div>
  );
}

/**
 * El segundo paso de una accion que le corta las sesiones a otra persona.
 *
 * Al abrirse se lleva el foco a su texto: se dibuja despues de todos los
 * botones de la tarjeta, y sin esto el Tab siguiente pasaba por los otros
 * botones antes de llegar aca, sin que un lector de pantalla dijera que se
 * habia abierto. Asi se escucha que va a pasar, y el boton que lo confirma
 * queda a un Tab.
 */
function Confirmacion({
  texto,
  onCancelar,
  children,
}: {
  texto: string;
  onCancelar: () => void;
  children: React.ReactNode;
}) {
  const aviso = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    aviso.current?.focus();
  }, []);

  return (
    <div
      className="mt-3 rounded-xl px-4 py-3"
      style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
    >
      <p ref={aviso} tabIndex={-1} className="text-sm">
        {texto}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-xl px-3.5 py-2 text-sm font-semibold"
          style={ESTILO_SECUNDARIO}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * La provisoria, a la vista una sola vez. `select-all`: un click la selecciona
 * entera para copiarla. "Ya la copié" la saca de la pantalla, que puede quedar
 * abierta en una oficina.
 */
function ContrasenaProvisoria({
  valor,
  mensaje,
  onOcultar,
}: {
  valor: string;
  mensaje?: string;
  onOcultar?: () => void;
}) {
  return (
    <div
      role="status"
      className="mt-4 rounded-2xl p-4"
      style={{
        background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
        border: "1px solid var(--color-acento-600)",
      }}
    >
      <p className="text-sm font-semibold">Contraseña provisoria</p>
      {mensaje && <p className="mt-1 text-sm">{mensaje}</p>}
      <code
        className="mt-2 block select-all break-all rounded-xl px-3 py-2 text-base font-semibold"
        style={{
          background: "var(--fondo-suave)",
          border: "1px solid var(--borde)",
          color: "var(--texto)",
        }}
      >
        {valor}
      </code>
      <p className="mt-2 text-sm">
        Copiala ahora y entregala en mano: <strong>no se vuelve a mostrar</strong> y en la base
        queda solo un hash, así que nadie puede recuperarla. Al ingresar, el panel le pide que elija
        una propia antes de dejarle hacer cualquier otra cosa.
      </p>
      {onOcultar && (
        <button
          type="button"
          onClick={onOcultar}
          className="mt-3 rounded-xl px-3.5 py-2 text-sm font-semibold"
          style={ESTILO_SECUNDARIO}
        >
          Ya la copié, ocultarla
        </button>
      )}
    </div>
  );
}

function FormularioAlta() {
  const [estado, accion, pendiente] = useActionState(crearSinArrastrar, null);
  const [provisoriaOculta, setProvisoriaOculta] = useState<Resultado | null>(null);

  // Como en las tarjetas: el boton se deshabilita mientras crea, asi que el
  // resultado se lleva el foco; y al ocultar la provisoria el foco vuelve al
  // correo, listo para la proxima alta.
  const campoCorreo = useRef<HTMLInputElement>(null);
  const aviso = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (estado) aviso.current?.focus();
  }, [estado]);

  function ocultarProvisoria() {
    setProvisoriaOculta(estado);
    campoCorreo.current?.focus();
  }

  return (
    <>
      <form action={accion} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Correo</span>
          <input
            ref={campoCorreo}
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="nombre@smt.gob.ar"
            className="rounded-xl px-3 py-2 text-sm"
            style={ESTILO_CAMPO}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Nombre y apellido</span>
          <input
            name="nombre"
            required
            minLength={3}
            maxLength={120}
            autoComplete="off"
            className="rounded-xl px-3 py-2 text-sm"
            style={ESTILO_CAMPO}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Rol</span>
          <select
            name="rol"
            defaultValue="lector"
            className="rounded-xl px-3 py-2 text-sm"
            style={ESTILO_CAMPO}
          >
            {ROLES.map((rol) => (
              <option key={rol.valor} value={rol.valor}>
                {rol.etiqueta}
              </option>
            ))}
          </select>
          <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
            Arranca en lector: el rol se sube cuando haga falta.
          </span>
        </label>

        <button
          type="submit"
          disabled={pendiente}
          className="mt-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      <div ref={aviso} tabIndex={-1}>
        {estado && !estado.ok && (
          <p role="alert" className="mt-3 text-sm" style={{ color: "var(--acento-texto)" }}>
            {estado.error}
          </p>
        )}

        {estado?.ok && estado.passwordProvisoria && provisoriaOculta !== estado && (
          <ContrasenaProvisoria
            valor={estado.passwordProvisoria}
            mensaje={estado.mensaje}
            onOcultar={ocultarProvisoria}
          />
        )}
      </div>
    </>
  );
}

/** Un campo o un select: es un control, va con --borde-control (WCAG 1.4.11). */
const ESTILO_CAMPO: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde-control)",
  color: "var(--texto)",
};

const ESTILO_SECUNDARIO: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde-control)",
  color: "var(--texto)",
};
