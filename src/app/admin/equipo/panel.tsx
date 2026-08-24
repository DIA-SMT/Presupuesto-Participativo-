"use client";

/**
 * Equipo del backoffice: alta de cuentas, cambio de rol, activacion y bitacora.
 *
 * La contrasena provisoria llega UNA sola vez, dentro del Resultado de
 * crearAdmin: en la base queda solo el hash, asi que la pantalla la muestra en
 * el momento y despues no hay forma de recuperarla.
 */
import { useActionState } from "react";
import { activarAdmin, cambiarRolAdmin, crearAdmin } from "../acciones";

type Rol = "admin" | "moderador" | "lector";

export type CuentaEquipo = {
  id: number;
  email: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  /** Ya formateado en el servidor. null = nunca ingreso. */
  ultimoIngreso: string | null;
  alta: string | null;
};

export type MovimientoEquipo = {
  id: number;
  adminNombre: string;
  objetivoEmail: string;
  accion: "alta" | "cambio_rol" | "desactivacion" | "reactivacion" | "cambio_password";
  rolAnterior: Rol | null;
  rolNuevo: Rol | null;
  cuando: string;
};

const ROLES: { valor: Rol; etiqueta: string; detalle: string }[] = [
  {
    valor: "admin",
    etiqueta: "Administrador",
    detalle:
      "Puede todo: revisar y editar ideas, cambiar la etapa del proceso, proclamar los proyectos ganadores y administrar las cuentas del equipo.",
  },
  {
    valor: "moderador",
    etiqueta: "Moderador",
    detalle:
      "Revisa y edita contenido: evalúa ideas y escribe la devolución, publica o despublica, carga avances de obra, hitos, textos y novedades. No cambia la etapa ni proclama ganadores.",
  },
  {
    valor: "lector",
    etiqueta: "Lector",
    detalle: "Solo mira: entra al panel y consulta todo, pero no puede guardar ningún cambio.",
  },
];

const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  moderador: "Moderador",
  lector: "Lector",
};

const ETIQUETA_ACCION: Record<MovimientoEquipo["accion"], string> = {
  alta: "Alta de cuenta",
  cambio_rol: "Cambio de rol",
  desactivacion: "Desactivación",
  reactivacion: "Reactivación",
  cambio_password: "Cambio de contraseña",
};

export default function PanelEquipo({
  yoId,
  cuentas,
  bitacora,
}: {
  yoId: number;
  cuentas: CuentaEquipo[];
  bitacora: MovimientoEquipo[];
}) {
  const activas = cuentas.filter((cuenta) => cuenta.activo).length;
  const administradores = cuentas.filter(
    (cuenta) => cuenta.activo && cuenta.rol === "admin",
  ).length;

  return (
    <div>
      <h1 className="text-2xl font-bold">Equipo del backoffice</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
        {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"} · {activas} activas ·{" "}
        {administradores} con rol administrador. Cada alta, cambio de rol o baja queda registrada en
        la bitácora de más abajo.
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
            que revisó. No hay borrado de cuentas.
          </p>
          <ul className="mt-4 space-y-2">
            {cuentas.map((cuenta) => (
              <li key={cuenta.id}>
                <FilaCuenta cuenta={cuenta} esMiCuenta={cuenta.id === yoId} />
              </li>
            ))}
          </ul>
        </section>

        <aside className="superficie rounded-2xl p-6">
          <h2 className="text-lg font-bold">Nueva cuenta</h2>
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
          Últimos movimientos sobre las cuentas, de lo más nuevo a lo más viejo.
        </p>

        {bitacora.length === 0 ? (
          <p className="superficie mt-4 rounded-2xl px-5 py-4 text-sm" style={{ color: "var(--texto-suave)" }}>
            Todavía no hay movimientos registrados.
          </p>
        ) : (
          <div className="superficie mt-4 overflow-x-auto rounded-2xl">
            <table className="w-full text-sm">
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
                    <td className="whitespace-nowrap px-4 py-2.5" style={{ color: "var(--texto-suave)" }}>
                      {fila.cuando}
                    </td>
                    <td className="px-4 py-2.5">{fila.adminNombre}</td>
                    <td className="px-4 py-2.5">{ETIQUETA_ACCION[fila.accion]}</td>
                    <td className="px-4 py-2.5">{fila.objetivoEmail}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--texto-suave)" }}>
                      {fila.rolAnterior && fila.rolNuevo
                        ? `${ETIQUETA_ROL[fila.rolAnterior]} → ${ETIQUETA_ROL[fila.rolNuevo]}`
                        : fila.rolNuevo
                          ? ETIQUETA_ROL[fila.rolNuevo]
                          : "—"}
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

function FilaCuenta({ cuenta, esMiCuenta }: { cuenta: CuentaEquipo; esMiCuenta: boolean }) {
  const [estadoRol, accionRol, guardandoRol] = useActionState(cambiarRolAdmin, null);
  const [estadoActivo, accionActivo, guardandoActivo] = useActionState(activarAdmin, null);

  return (
    <div className="superficie rounded-2xl px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-sm font-semibold">
            {cuenta.nombre}
            {esMiCuenta && (
              <span
                className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: "color-mix(in srgb, var(--color-marca-600) 12%, transparent)",
                  color: "var(--color-marca-700)",
                }}
              >
                tu cuenta
              </span>
            )}
            {!cuenta.activo && (
              <span
                className="ml-2 rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  background: "color-mix(in srgb, var(--color-acento-600) 12%, transparent)",
                  color: "var(--color-acento-600)",
                }}
              >
                desactivada
              </span>
            )}
          </p>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            {cuenta.email}
          </p>
        </div>
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {ETIQUETA_ROL[cuenta.rol]}
          {" · "}
          {cuenta.ultimoIngreso ? `último ingreso ${cuenta.ultimoIngreso}` : "nunca ingresó"}
          {cuenta.alta && ` · alta ${cuenta.alta}`}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <form action={accionRol} className="flex items-end gap-2">
          <input type="hidden" name="id" value={cuenta.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
              Rol
            </span>
            <select
              name="rol"
              defaultValue={cuenta.rol}
              disabled={esMiCuenta}
              className="rounded-xl px-3 py-2 text-sm"
              style={estiloCampo}
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
            disabled={esMiCuenta || guardandoRol}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-marca-700)" }}
          >
            {guardandoRol ? "Guardando…" : "Cambiar rol"}
          </button>
        </form>

        <form action={accionActivo}>
          <input type="hidden" name="id" value={cuenta.id} />
          <input type="hidden" name="activo" value={cuenta.activo ? "false" : "true"} />
          <button
            type="submit"
            disabled={(esMiCuenta && cuenta.activo) || guardandoActivo}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
            style={{
              background: "var(--fondo-suave)",
              border: "1px solid var(--borde)",
              color: "var(--texto)",
            }}
          >
            {guardandoActivo
              ? "Guardando…"
              : cuenta.activo
                ? "Desactivar cuenta"
                : "Reactivar cuenta"}
          </button>
        </form>
      </div>

      {esMiCuenta && (
        <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
          No podés cambiarte el rol ni desactivar tu propia cuenta: así el panel nunca queda sin
          nadie que lo administre. Pedíselo a otro administrador.
        </p>
      )}

      {(estadoRol || estadoActivo) && (
        <p
          role="status"
          className="mt-2 text-sm"
          style={{
            color:
              (estadoRol && !estadoRol.ok) || (estadoActivo && !estadoActivo.ok)
                ? "var(--color-acento-600)"
                : "var(--color-cat-ambiental)",
          }}
        >
          {estadoRol && !estadoRol.ok
            ? estadoRol.error
            : estadoActivo && !estadoActivo.ok
              ? estadoActivo.error
              : "Listo."}
        </p>
      )}
    </div>
  );
}

function FormularioAlta() {
  const [estado, accion, pendiente] = useActionState(crearAdmin, null);

  return (
    <>
      <form action={accion} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Correo</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="nombre@smt.gob.ar"
            className="rounded-xl px-3 py-2 text-sm"
            style={estiloCampo}
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
            style={estiloCampo}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Rol</span>
          <select
            name="rol"
            defaultValue="lector"
            className="rounded-xl px-3 py-2 text-sm"
            style={estiloCampo}
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
          disabled={pendiente}
          className="mt-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Creando…" : "Crear cuenta"}
        </button>
      </form>

      {estado && !estado.ok && (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--color-acento-600)" }}>
          {estado.error}
        </p>
      )}

      {estado && estado.ok && estado.passwordProvisoria && (
        <div
          role="status"
          className="mt-4 rounded-2xl p-4"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
            border: "1px solid var(--color-acento-600)",
          }}
        >
          <p className="text-sm font-semibold">Contraseña provisoria</p>
          <code
            className="mt-2 block rounded-xl px-3 py-2 text-base font-semibold break-all"
            style={{
              background: "var(--fondo-suave)",
              border: "1px solid var(--borde)",
              color: "var(--texto)",
            }}
          >
            {estado.passwordProvisoria}
          </code>
          <p className="mt-2 text-sm">
            Copiala ahora y entregala en mano: <strong>no se vuelve a mostrar</strong> y en la base
            queda solo un hash, así que nadie puede recuperarla. Al ingresar, la persona tiene que
            cambiarla por una propia desde “Mi contraseña”; hasta que lo haga, el panel se lo va a
            pedir.
          </p>
        </div>
      )}

      {estado && estado.ok && !estado.passwordProvisoria && estado.mensaje && (
        <p role="status" className="mt-3 text-sm" style={{ color: "var(--color-cat-ambiental)" }}>
          {estado.mensaje}
        </p>
      )}
    </>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
