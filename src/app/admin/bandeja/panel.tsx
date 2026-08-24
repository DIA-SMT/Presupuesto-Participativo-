"use client";

/**
 * Bandeja de revision: la parte interactiva.
 *
 * Los datos llegan ya consultados desde page.tsx; aca viven los formularios de
 * revision (useActionState) y el contador de la devolucion, que avisa antes de
 * enviar cuando el estado elegido exige explicarle al vecino.
 *
 * Dato sensible: el mail del autor NUNCA llega a esta pantalla. De la base sale
 * solo `tieneContacto`, asi que la bandeja puede decir si hay con quien
 * comunicarse, pero no cual es el dato.
 */
import Link from "next/link";
import { useActionState, useState } from "react";
import { Chip, ChipEstado } from "@/components/ui";
import type {
  AccionRevision,
  EstadoIdea,
  FilaBandeja,
  FilaRevision,
  IdeaAdmin,
  ResumenBandeja,
  RolAdmin,
} from "@/db/queries";
import { ETIQUETA_ESTADO, formatearNumero, formatearPesos } from "@/lib/formato";
import {
  despublicarIdea,
  evaluarIdea,
  proclamarGanador,
  publicarIdea,
  reabrirRevision,
} from "../acciones";

/** Mismo minimo que valida evaluarIdea en el servidor. */
const MINIMO_DEVOLUCION = 40;
/** Mismo minimo que piden despublicarIdea y reabrirRevision. */
const MINIMO_MOTIVO = 10;

/** Los cuatro estados que se pueden fijar evaluando: "ganador" se proclama. */
const ESTADOS_EVALUACION: EstadoIdea[] = ["pendiente", "factible", "no_factible", "integrado"];

/** Estados del filtro de la cabecera, en el orden en que se trabajan. */
const ESTADOS_FILTRO: EstadoIdea[] = [
  "pendiente",
  "factible",
  "no_factible",
  "integrado",
  "ganador",
  "borrador",
];

const ETIQUETA_ACCION: Record<AccionRevision, string> = {
  evaluacion: "Evaluación",
  publicacion: "Publicación",
  despublicacion: "Despublicación",
  proclamacion: "Proclamación",
  reapertura: "Reapertura",
};

const ETIQUETA_CANAL: Record<IdeaAdmin["canal"], string> = {
  web: "Formulario del sitio",
  asamblea: "Asamblea barrial",
  municipio: "Carga del municipio",
  migracion: "Migración de 2025",
};

/** Lo que devuelven las server actions. El tipo original vive en acciones.ts. */
type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string };

type Filtros = { estado: string; distrito: string; q: string };

/** Fechas con hora en la zona de Tucumán: el historial se lee por minuto. */
const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

/**
 * Antiguedad en palabras. El "ahora" lo fija el server component y viaja por
 * props: si cada lado usara su propio reloj, el HTML del servidor y el del
 * cliente podrian no coincidir.
 */
function antiguedad(desde: Date, ahora: number): string {
  const dias = Math.floor((ahora - desde.getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  if (dias < 60) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `hace ${meses} meses`;
}

/** Enlace a la misma pantalla cambiando algunos parametros. */
function armarEnlace(filtros: Filtros, cambios: Partial<Filtros & { idea: string }>): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...cambios })) {
    if (valor) parametros.set(clave, valor);
  }
  const consulta = parametros.toString();
  return consulta ? `/admin/bandeja?${consulta}` : "/admin/bandeja";
}

/** Una idea que dice "no" sin devolucion escrita es deuda con el vecino. */
function faltaDevolucion(estado: EstadoIdea, tieneDevolucion: boolean): boolean {
  return (estado === "no_factible" || estado === "integrado") && !tieneDevolucion;
}

export default function PanelBandeja({
  anio,
  resumen,
  filas,
  tope,
  distritos,
  filtros,
  ficha,
  historial,
  rol,
  ahora,
}: {
  anio: number;
  resumen: ResumenBandeja;
  filas: FilaBandeja[];
  tope: number;
  distritos: { numero: number; nombre: string }[];
  filtros: Filtros;
  ficha: IdeaAdmin | null;
  historial: FilaRevision[];
  rol: RolAdmin;
  ahora: number;
}) {
  const soloLectura = rol === "lector";
  const deuda = resumen.noFactiblesSinDevolucion;

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">Bandeja de revisión · Edición {anio}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Las pendientes van primero y, dentro de cada grupo, las más antiguas arriba: la fila se
          atiende por antigüedad. Tocá una idea para abrir su ficha, evaluarla y ver su historial.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Contador
          valor={resumen.total}
          etiqueta="Ideas de la edición"
          href={armarEnlace(filtros, { estado: "" })}
          activo={!filtros.estado}
        />
        {/* "Borrador" solo se muestra si existe: casi nunca hay ideas en ese estado. */}
        {ESTADOS_FILTRO.filter(
          (estado) => estado !== "borrador" || resumen.porEstado.borrador > 0,
        ).map((estado) => (
          <Contador
            key={estado}
            valor={resumen.porEstado[estado]}
            etiqueta={ETIQUETA_ESTADO[estado] ?? estado}
            href={armarEnlace(filtros, { estado })}
            activo={filtros.estado === estado}
          />
        ))}
      </div>

      {deuda > 0 ? (
        <div
          className="mt-3 rounded-2xl px-5 py-4"
          style={{
            background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-acento-600) 40%, transparent)",
          }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-acento-700)" }}>
            {formatearNumero(deuda)} {deuda === 1 ? "idea no factible" : "ideas no factibles"} sin
            devolución escrita
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Es la deuda del equipo con los vecinos: a cada una se le dijo que no sin explicarle por
            qué. Abrilas y escribí la devolución, que es el texto que se publica en la ficha del
            proyecto.
          </p>
          <Link
            href={armarEnlace(filtros, { estado: "no_factible" })}
            className="mt-2 inline-block text-sm font-medium underline"
            style={{ color: "var(--color-acento-700)" }}
          >
            Ver las no factibles
          </Link>
        </div>
      ) : (
        <p className="mt-3 text-sm" style={{ color: "var(--color-cat-ambiental)" }}>
          Todas las ideas no factibles tienen su devolución escrita.
        </p>
      )}

      <form
        method="get"
        action="/admin/bandeja"
        key={`${filtros.estado}|${filtros.distrito}|${filtros.q}`}
        className="mt-5 flex flex-wrap items-end gap-3"
      >
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Estado</span>
          <select
            name="estado"
            defaultValue={filtros.estado}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          >
            <option value="">Todos</option>
            {ESTADOS_FILTRO.map((estado) => (
              <option key={estado} value={estado}>
                {ETIQUETA_ESTADO[estado] ?? estado}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Distrito</span>
          <select
            name="distrito"
            defaultValue={filtros.distrito}
            style={estiloCampo}
            className="rounded-xl px-3 py-2"
          >
            <option value="">Todos</option>
            {distritos.map((distrito) => (
              <option key={distrito.numero} value={distrito.numero}>
                {distrito.nombre || `Distrito ${distrito.numero}`}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium">Buscar</span>
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="Título o barrio (con o sin tildes)…"
            style={estiloCampo}
            className="w-64 rounded-xl px-3 py-2"
          />
        </label>

        <button
          type="submit"
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: "var(--color-marca-700)" }}
        >
          Filtrar
        </button>
        {(filtros.estado || filtros.distrito || filtros.q) && (
          <Link href="/admin/bandeja" className="pb-1 text-sm underline">
            Limpiar filtros
          </Link>
        )}
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <section>
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            {filas.length === 0
              ? "Ninguna idea coincide con estos filtros."
              : `${formatearNumero(filas.length)} ${filas.length === 1 ? "idea" : "ideas"} en el listado`}
            {filas.length === tope && ` (tope de ${tope}: afiná los filtros)`}
          </p>

          <ul className="mt-3 space-y-2">
            {filas.map((fila) => {
              const abierta = ficha?.id === fila.id;
              return (
                <li key={fila.id}>
                  <Link
                    href={`${armarEnlace(filtros, { idea: String(fila.id) })}#ficha`}
                    aria-current={abierta ? "true" : undefined}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3"
                    style={
                      abierta
                        ? {
                            background: "var(--fondo-suave)",
                            border: "1px solid var(--color-marca-500)",
                          }
                        : { background: "var(--fondo-tarjeta)", border: "1px solid var(--borde)" }
                    }
                  >
                    <span
                      className="w-10 shrink-0 text-xs font-semibold"
                      style={{ color: "var(--texto-suave)" }}
                    >
                      {fila.numero === null ? "—" : `#${fila.numero}`}
                    </span>

                    <span className="min-w-[11rem] flex-1">
                      <span className="block text-sm font-medium">{fila.titulo}</span>
                      <span className="mt-0.5 block text-xs" style={{ color: "var(--texto-suave)" }}>
                        {fila.distrito === null ? "Sin distrito" : `D${fila.distrito}`}
                        {fila.barrio && ` · ${fila.barrio}`}
                        {fila.categoria && ` · ${fila.categoria}`}
                        {` · ingresó ${antiguedad(fila.createdAt, ahora)}`}
                        {fila.votos > 0 && ` · ${formatearNumero(fila.votos)} votos`}
                      </span>
                    </span>

                    <span className="flex flex-wrap items-center gap-1.5">
                      <ChipEstado estado={fila.estado} />
                      {!fila.publicada && <Chip color="var(--color-acento-600)">sin publicar</Chip>}
                      {faltaDevolucion(fila.estado, fila.tieneDevolucion) ? (
                        <Chip color="var(--color-acento-600)">falta devolución</Chip>
                      ) : fila.tieneDevolucion ? (
                        <Chip color="var(--color-cat-ambiental)">con devolución</Chip>
                      ) : null}
                      <span
                        title={
                          fila.tieneContacto
                            ? "El autor dejó un mail para recibir avisos. La bandeja nunca muestra el dato de contacto."
                            : "No hay forma de avisarle al autor por mail."
                        }
                      >
                        <Chip>{fila.tieneContacto ? "✉ con contacto" : "sin contacto"}</Chip>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* La ficha queda fija al costado, con scroll propio: el historial de una
            idea trabajada puede ser mas alto que la pantalla. */}
        <section
          id="ficha"
          className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          {ficha ? (
            <Ficha
              key={ficha.id}
              ficha={ficha}
              historial={historial}
              rol={rol}
              soloLectura={soloLectura}
            />
          ) : (
            <div
              className="rounded-2xl px-5 py-6 text-sm"
              style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
            >
              <p className="font-medium">Ninguna idea abierta.</p>
              <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
                Elegí una del listado para ver su ficha, evaluarla, publicarla o revisar su
                historial.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Contador({
  valor,
  etiqueta,
  href,
  activo,
}: {
  valor: number;
  etiqueta: string;
  href: string;
  activo: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? "true" : undefined}
      className="rounded-2xl px-4 py-3"
      style={{
        background: activo ? "var(--fondo-suave)" : "var(--fondo-tarjeta)",
        border: `1px solid ${activo ? "var(--color-marca-500)" : "var(--borde)"}`,
      }}
    >
      <p className="text-2xl font-bold tracking-tight">{formatearNumero(valor)}</p>
      <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
        {etiqueta}
      </p>
    </Link>
  );
}

function Ficha({
  ficha,
  historial,
  rol,
  soloLectura,
}: {
  ficha: IdeaAdmin;
  historial: FilaRevision[];
  rol: RolAdmin;
  soloLectura: boolean;
}) {
  return (
    <div className="superficie rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            {ficha.numero === null ? "Sin número asignado" : `Idea #${ficha.numero}`} ·{" "}
            {ETIQUETA_CANAL[ficha.canal]}
          </p>
          <h2 className="mt-0.5 text-lg font-bold">{ficha.titulo}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ChipEstado estado={ficha.estado} />
          <Chip color={ficha.publicada ? "var(--color-cat-ambiental)" : "var(--color-acento-600)"}>
            {ficha.publicada ? "publicada" : "sin publicar"}
          </Chip>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <DatoFicha etiqueta="Distrito">
          {ficha.distritoNombre ?? "Sin distrito asignado"}
        </DatoFicha>
        <DatoFicha etiqueta="Barrio">{ficha.barrio ?? "Sin barrio"}</DatoFicha>
        <DatoFicha etiqueta="Categoría">{ficha.categoriaNombre ?? "Sin categoría"}</DatoFicha>
        <DatoFicha etiqueta="Votos">{formatearNumero(ficha.votos)}</DatoFicha>
        <DatoFicha etiqueta="Autor">{ficha.autorNombre ?? "Sin nombre cargado"}</DatoFicha>
        <DatoFicha etiqueta="Contacto del autor">
          {ficha.tieneContacto
            ? ficha.autorAvisos
              ? "Dejó mail y aceptó recibir avisos"
              : "Dejó mail, sin consentimiento de avisos"
            : "No dejó contacto"}
        </DatoFicha>
        <DatoFicha etiqueta="Presupuesto cargado">
          {formatearPesos(ficha.presupuestoTotal)}
        </DatoFicha>
        <DatoFicha etiqueta="Ingresó">{fechaHora.format(ficha.createdAt)}</DatoFicha>
        <DatoFicha etiqueta="Último cambio de estado">
          {ficha.estadoActualizadoEn ? fechaHora.format(ficha.estadoActualizadoEn) : "Nunca"}
        </DatoFicha>
        <DatoFicha etiqueta="Revisó">{ficha.revisadoPor ?? "Nadie todavía"}</DatoFicha>
      </dl>

      <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
        El mail del autor no sale de la base: el panel solo sabe si hay contacto, nunca cuál es.
      </p>

      {(ficha.problema || ficha.solucion || ficha.beneficios) && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Texto de la propuesta</summary>
          <div className="mt-2 space-y-2 text-sm" style={{ color: "var(--texto-suave)" }}>
            {ficha.problema && (
              <p>
                <strong>Problema:</strong> {ficha.problema}
              </p>
            )}
            {ficha.solucion && (
              <p>
                <strong>Solución:</strong> {ficha.solucion}
              </p>
            )}
            {ficha.beneficios && (
              <p>
                <strong>Beneficios:</strong> {ficha.beneficios}
              </p>
            )}
          </div>
        </details>
      )}

      {ficha.notasMigracion.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Limpieza de la migración ({ficha.notasMigracion.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs" style={{ color: "var(--texto-suave)" }}>
            {ficha.notasMigracion.map((nota, indice) => (
              <li key={indice}>{nota}</li>
            ))}
            {ficha.tituloOriginal && <li>Título original: {ficha.tituloOriginal}</li>}
            {ficha.coordenadasOriginales && (
              <li>Coordenadas originales: {ficha.coordenadasOriginales}</li>
            )}
          </ul>
        </details>
      )}

      <div className="mt-4 rounded-xl px-4 py-3" style={{ background: "var(--fondo-suave)" }}>
        <p className="text-xs font-medium">Devolución que se publica hoy</p>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          {ficha.motivoEstado?.trim() ? ficha.motivoEstado : "Todavía no hay devolución escrita."}
        </p>
      </div>

      <a
        href={`/proyectos/${ficha.slug}`}
        className="mt-3 inline-block text-sm underline"
        target="_blank"
        rel="noreferrer"
      >
        Ver la ficha pública
      </a>

      {soloLectura ? (
        <p className="mt-5 text-sm" style={{ color: "var(--texto-suave)" }}>
          Tu rol es de lectura: podés ver la bandeja, pero no cambiar el estado ni la publicación.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {ficha.ganador ? (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-estado-ganador) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-estado-ganador) 40%, transparent)",
              }}
            >
              Está proclamada como proyecto ganador. Para cambiarle el estado hay que reabrir la
              revisión primero, y eso lo puede hacer solo un administrador.
            </div>
          ) : (
            <FormularioEvaluacion ficha={ficha} />
          )}

          <FormularioPublicacion ficha={ficha} />

          {rol === "admin" && !ficha.ganador && <FormularioProclamacion ficha={ficha} />}

          <FormularioReapertura ficha={ficha} rol={rol} />
        </div>
      )}

      <Historial historial={historial} />
    </div>
  );
}

function DatoFicha({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--texto-suave)" }}>
        {etiqueta}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function FormularioEvaluacion({ ficha }: { ficha: IdeaAdmin }) {
  const [resultado, accion, pendiente] = useActionState(evaluarIdea, null);
  const inicial: EstadoIdea = ESTADOS_EVALUACION.includes(ficha.estado)
    ? ficha.estado
    : "pendiente";
  const [estado, setEstado] = useState<EstadoIdea>(inicial);
  const [devolucion, setDevolucion] = useState(ficha.motivoEstado ?? "");

  const exige = estado === "no_factible" || estado === "integrado";
  const escritos = devolucion.trim().length;
  const falta = exige && escritos < MINIMO_DEVOLUCION;

  return (
    <form action={accion} className="grid gap-3">
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="text-sm font-bold">Evaluar la idea</h3>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Estado</span>
        <select
          name="estado"
          value={estado}
          onChange={(evento) => setEstado(evento.target.value as EstadoIdea)}
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        >
          {ESTADOS_EVALUACION.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_ESTADO[valor] ?? valor}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          Devolución técnica (la lee el vecino en la ficha pública)
        </span>
        <textarea
          name="devolucion"
          rows={4}
          maxLength={5000}
          value={devolucion}
          onChange={(evento) => setDevolucion(evento.target.value)}
          placeholder="Por qué la idea es factible o no, en palabras que se entiendan sin ser técnico."
          style={estiloCampo}
          className="resize-y rounded-xl px-3 py-2"
        />
        <span
          className="text-xs"
          style={{ color: falta ? "var(--color-acento-700)" : "var(--texto-suave)" }}
        >
          {exige
            ? `“${ETIQUETA_ESTADO[estado]}” exige devolución: mínimo ${MINIMO_DEVOLUCION} caracteres (escribiste ${escritos}).`
            : `${escritos} caracteres. Si lo dejás vacío se conserva la devolución anterior.`}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-marca-700)" }}
        >
          {pendiente ? "Guardando…" : "Guardar evaluación"}
        </button>
        <MensajeAccion resultado={resultado} exito="Evaluación guardada." />
      </div>
    </form>
  );
}

function FormularioPublicacion({ ficha }: { ficha: IdeaAdmin }) {
  const [resultado, accion, pendiente] = useActionState(
    ficha.publicada ? despublicarIdea : publicarIdea,
    null,
  );

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">
        {ficha.publicada ? "Sacar del sitio público" : "Publicar en el sitio"}
      </h3>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">
          {ficha.publicada
            ? `Motivo (obligatorio, mínimo ${MINIMO_MOTIVO} caracteres)`
            : "Motivo (opcional)"}
        </span>
        <input
          name="motivo"
          maxLength={5000}
          minLength={ficha.publicada ? MINIMO_MOTIVO : undefined}
          required={ficha.publicada}
          placeholder={
            ficha.publicada
              ? "Por qué se saca algo que los vecinos ya vieron publicado."
              : "Queda en el historial de la idea."
          }
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{
            background: ficha.publicada ? "var(--color-acento-600)" : "var(--color-marca-700)",
          }}
        >
          {pendiente ? "Guardando…" : ficha.publicada ? "Despublicar" : "Publicar"}
        </button>
        {/* El texto de exito es generico a proposito: cuando la accion sale bien
            la ficha se relee y este formulario ya muestra la accion contraria. */}
        <MensajeAccion resultado={resultado} exito="Listo, quedó en el historial." />
      </div>
    </form>
  );
}

function FormularioProclamacion({ ficha }: { ficha: IdeaAdmin }) {
  const [resultado, accion, pendiente] = useActionState(proclamarGanador, null);

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">Proclamar proyecto ganador</h3>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Solo se puede proclamar la idea más votada del distrito entre las factibles y publicadas. Si
        no es la más votada, si hay empate en el primer puesto o si el distrito ya tiene ganador, la
        acción lo explica y no cambia nada.
      </p>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Nota para el historial (opcional)</span>
        <input
          name="nota"
          maxLength={5000}
          placeholder="Si la dejás vacía se guarda el distrito y la cantidad de votos."
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--color-estado-ganador)", color: "#fff" }}
        >
          {pendiente ? "Proclamando…" : "Proclamar ganador"}
        </button>
        <MensajeAccion resultado={resultado} exito="Proyecto proclamado ganador." />
      </div>
    </form>
  );
}

function FormularioReapertura({ ficha, rol }: { ficha: IdeaAdmin; rol: RolAdmin }) {
  const [resultado, accion, pendiente] = useActionState(reabrirRevision, null);

  return (
    <form action={accion} className="grid gap-3" style={{ borderTop: "1px solid var(--borde)" }}>
      <input type="hidden" name="id" value={ficha.id} />
      <h3 className="mt-4 text-sm font-bold">Reabrir la revisión</h3>
      <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
        Vuelve la idea a “En evaluación”. Es la marcha atrás de una evaluación o de una
        proclamación equivocada.
        {ficha.ganador &&
          rol !== "admin" &&
          " Esta idea está proclamada: dar marcha atrás lo puede hacer solo un administrador."}
      </p>

      <label className="grid gap-1 text-sm">
        <span className="font-medium">Motivo (obligatorio, mínimo {MINIMO_MOTIVO} caracteres)</span>
        <input
          name="motivo"
          required
          minLength={MINIMO_MOTIVO}
          maxLength={5000}
          placeholder="Por qué se reabre."
          style={estiloCampo}
          className="rounded-xl px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          {pendiente ? "Reabriendo…" : "Reabrir revisión"}
        </button>
        <MensajeAccion resultado={resultado} exito="Revisión reabierta." />
      </div>
    </form>
  );
}

function MensajeAccion({
  resultado,
  exito,
}: {
  resultado: Resultado | null;
  exito: string;
}) {
  if (!resultado) return null;
  return (
    <span
      role="status"
      className="text-sm"
      style={{ color: resultado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-700)" }}
    >
      {resultado.ok ? (resultado.mensaje ?? exito) : resultado.error}
    </span>
  );
}

function Historial({ historial }: { historial: FilaRevision[] }) {
  return (
    <div className="mt-6" style={{ borderTop: "1px solid var(--borde)" }}>
      <h3 className="mt-4 text-sm font-bold">Historial de revisiones</h3>
      {historial.length === 0 ? (
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay movimientos registrados para esta idea.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {historial.map((fila) => (
            <li key={fila.id} className="rounded-xl px-4 py-3" style={{ background: "var(--fondo-suave)" }}>
              <p className="text-sm font-medium">
                {ETIQUETA_ACCION[fila.accion]}
                {fila.estadoNuevo && (
                  <span className="font-normal" style={{ color: "var(--texto-suave)" }}>
                    {" · "}
                    {fila.estadoAnterior ? `${ETIQUETA_ESTADO[fila.estadoAnterior]} → ` : ""}
                    {ETIQUETA_ESTADO[fila.estadoNuevo]}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                {fila.adminNombre} · {fechaHora.format(fila.createdAt)}
              </p>
              {fila.nota && <p className="mt-1 text-sm">{fila.nota}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
