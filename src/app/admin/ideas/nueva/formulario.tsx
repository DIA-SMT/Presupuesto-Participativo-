"use client";

/**
 * Formulario de carga de una idea por el equipo.
 *
 * No es el formulario publico (src/components/FormularioIdea.tsx), a proposito:
 * ese es un paso a paso para un vecino que escribe su propuesta por primera vez,
 * con ayuda de IA. Aca alguien del equipo transcribe una tanda de papeles de una
 * asamblea: todo a la vista en una sola pantalla, sin pasos, y lo que es comun a
 * la tanda (por donde llego, de que asamblea, que dia) queda puesto de una idea
 * a la siguiente. Los minimos y los largos si son los mismos: vienen por props
 * de src/lib/idea-esquema.ts, que es lo que valida el servidor.
 *
 * COPIA EL PAPEL. Desde el formulario de propuesta 2026, la pantalla tiene los
 * mismos bloques que la hoja, en el mismo orden y con las mismas preguntas
 * (PREGUNTAS_DE_LA_IDEA): quien transcribe va renglon por renglon sin buscar
 * donde va cada cosa. Lo que el papel trae y el sistema NO guarda (el domicilio
 * de la persona y el de la organizacion, los dos referentes) aparece igual en su
 * lugar, como un aviso de que queda en el papel archivado: asi nadie lo tipea en
 * otro campo "para no perderlo". La categoria no se pide: la asigna quien evalua.
 *
 * Los campos son CONTROLADOS. React limpia los campos sin controlar cuando
 * termina la accion de un <form>, y aca eso borraria cinco parrafos tipeados
 * de un papel por un rechazo del servidor (la fecha, un punto fuera del ejido).
 *
 * Al terminar muestra el codigo de la propuesta (D05-P012), que se escribe en
 * el casillero "Código" del papel, el codigo de seguimiento y el comprobante
 * para imprimir y darle al vecino.
 */
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import DocumentoIdea from "@/components/DocumentoIdea";
import Mapa from "@/components/Mapa";
import { PREGUNTAS_DE_LA_IDEA } from "@/lib/contenido-del-programa";
import { codigoDePropuesta } from "@/lib/formato";
import { cargarIdea } from "../acciones";
import Comprobante from "../comprobante";
import type { Largo, Limites } from "../limites";
import { DISTRITOS_MAPA, SIN_PUNTOS } from "../mapa-ficha";
import type { IdeaCargada, ResultadoAlta } from "../operaciones";

type Punto = { lat: number; lon: number };

/** Lo de cada papel. Lo de la tanda (canal, de donde, fecha) va aparte. */
const PAPEL_VACIO = {
  autorNombre: "",
  dni: "",
  autorTelefono: "",
  /** "" sin marcar, "si" o "no": el papel tiene las dos casillas. */
  conOrganizacion: "" as "" | "si" | "no",
  organizacion: "",
  problema: "",
  referenciasUbicacion: "",
  solucion: "",
  beneficios: "",
  titulo: "",
};

type CampoPapel = Exclude<keyof typeof PAPEL_VACIO, "conOrganizacion">;

/**
 * El barrio va aparte porque lo pueden escribir dos: la persona y el mapa.
 * `delMapa` dice si el valor lo puso un clic: si es asi, el clic siguiente lo
 * reemplaza; si lo escribio la persona (del papel), no se toca.
 */
const BARRIO_VACIO = { valor: "", delMapa: false };

const CANALES = [
  {
    valor: "asamblea",
    etiqueta: "Una asamblea",
    ayuda: "Las fichas de papel de una asamblea barrial.",
  },
  {
    valor: "municipio",
    etiqueta: "El municipio",
    ayuda: "Mesa de entradas, un mail al programa, la oficina.",
  },
] as const;

export default function FormularioCarga({
  anio,
  enEvaluacion,
  hoy,
  limites,
  sitio,
}: {
  anio: number;
  /** La edicion ya cerro el formulario publico: se avisa, pero se carga igual. */
  enEvaluacion: boolean;
  /** El dia de hoy en Tucuman, AAAA-MM-DD: el tope de la fecha. */
  hoy: string;
  limites: Limites;
  /** Dominio del sitio, para las instrucciones del comprobante. */
  sitio: string;
}) {
  const [lote, setLote] = useState({ canal: "asamblea", canalDetalle: "", fecha: hoy });
  const [papel, setPapel] = useState(PAPEL_VACIO);
  const [barrio, setBarrio] = useState(BARRIO_VACIO);
  const [punto, setPunto] = useState<Punto | null>(null);
  /** undefined: sin respuesta todavia. null: el punto cae fuera de los 20 distritos. */
  const [distrito, setDistrito] = useState<number | null | undefined>(undefined);
  const [ubicando, setUbicando] = useState(false);
  const [aproximada, setAproximada] = useState(false);
  /** El anillo exterior de cada distrito, para el mapita del comprobante. */
  const [contornos, setContornos] = useState<Record<number, number[][]>>({});
  /** La ultima idea cargada: mientras hay una, se muestra su comprobante. */
  const [ultima, setUltima] = useState<IdeaCargada | null>(null);
  const [cargadas, setCargadas] = useState(0);

  /** Numero de la ultima consulta de distrito: una respuesta vieja no pisa a una nueva. */
  const consulta = useRef(0);
  const geometria = useRef<Promise<Record<number, number[][]>> | null>(null);

  /*
   * El foco, cuando la pantalla cambia entera. Al cargar, el formulario se va
   * y con el el boton que tenia el foco: sin esto quedaba en el <body>, y un
   * lector de pantalla no decia ni el codigo ni el numero. Se lleva al titulo
   * de la idea cargada, arriba de todo, adonde ya sube la pantalla.
   *
   * "Cargar otra" lo lleva al primer campo que cambia de un papel al otro, el
   * nombre de la persona de contacto: lo de la tanda queda puesto arriba de el.
   */
  const titularCargada = useRef<HTMLHeadingElement>(null);
  const campoAutor = useRef<HTMLInputElement>(null);
  const alVolverAlFormulario = useRef(false);
  useEffect(() => {
    if (ultima) {
      titularCargada.current?.focus({ preventScroll: true });
    } else if (alVolverAlFormulario.current) {
      alVolverAlFormulario.current = false;
      campoAutor.current?.focus();
    }
  }, [ultima]);

  const [resultado, accion, pendiente] = useActionState(
    async (previo: ResultadoAlta | null, datos: FormData): Promise<ResultadoAlta> => {
      const respuesta = await cargarIdea(previo, datos);
      if (respuesta.ok) {
        setUltima(respuesta.idea);
        setCargadas((cantidad) => cantidad + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return respuesta;
    },
    null,
  );

  function escribir(campo: CampoPapel, valor: string) {
    setPapel((actual) => ({ ...actual, [campo]: valor }));
  }

  /**
   * El contorno de los distritos, del mismo /geo/distritos.geojson que ya bajo
   * el mapa (lo sirve el cache del navegador). Si falla, el comprobante dibuja
   * solo el punto: las coordenadas y el distrito van en texto igual.
   */
  function cargarContornos() {
    geometria.current ??= fetch("/geo/distritos.geojson")
      .then((respuesta) => respuesta.json())
      .then(
        (geo: {
          features: Array<{ properties: { numero: number }; geometry: { coordinates: number[][][][] } }>;
        }) => {
          const anillos: Record<number, number[][]> = {};
          for (const feature of geo.features) {
            const anillo = feature.geometry.coordinates?.[0]?.[0];
            if (anillo) anillos[feature.properties.numero] = anillo;
          }
          setContornos(anillos);
          return anillos;
        },
      )
      .catch(() => ({}));
  }

  /**
   * Al marcar un punto se le pregunta al servidor el distrito y el barrio,
   * como en el formulario publico. El barrio se completa solo si el campo esta
   * vacio o lo habia puesto el mapa: lo que tipeo la persona (del papel) gana.
   */
  async function elegirPunto(nuevo: Punto) {
    const esta = ++consulta.current;
    setPunto(nuevo);
    setDistrito(undefined);
    setUbicando(true);
    cargarContornos();
    try {
      const respuesta = await fetch(
        `/api/distrito?lat=${nuevo.lat.toFixed(6)}&lon=${nuevo.lon.toFixed(6)}`,
      );
      const cuerpo = (await respuesta.json()) as { distrito: number | null; barrio: string | null };
      if (esta !== consulta.current) return;
      setDistrito(cuerpo.distrito);
      const delPunto = cuerpo.barrio;
      if (delPunto) {
        setBarrio((actual) =>
          !actual.valor.trim() || actual.delMapa ? { valor: delPunto, delMapa: true } : actual,
        );
      }
    } catch {
      if (esta === consulta.current) setDistrito(undefined);
    } finally {
      if (esta === consulta.current) setUbicando(false);
    }
  }

  function cargarOtra() {
    alVolverAlFormulario.current = true;
    setUltima(null);
    setPapel(PAPEL_VACIO);
    setBarrio(BARRIO_VACIO);
    setPunto(null);
    setDistrito(undefined);
    setAproximada(false);
    // Sin scroll a mano: el foco en el nombre (ver el efecto de arriba) ya deja
    // la pantalla ahi, y un scroll suave lo peleaba.
  }

  // --- Terminada: el codigo, el numero y el comprobante ----------------------
  if (ultima) {
    const propuesta = codigoDePropuesta(ultima.distrito, ultima.numero);
    return (
      <div className="mt-6 space-y-6">
        <section
          className="rounded-2xl px-5 py-5"
          style={{
            background: "color-mix(in srgb, var(--color-cat-ambiental) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-cat-ambiental) 40%, transparent)",
          }}
          aria-live="polite"
        >
          <p className="text-sm font-semibold" style={{ color: "var(--color-cat-ambiental)" }}>
            Propuesta cargada{cargadas > 1 ? ` · ${cargadas} en esta tanda` : ""}
          </p>
          <h2 ref={titularCargada} tabIndex={-1} className="mt-1 text-xl font-bold">
            {propuesta} · {ultima.titulo}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Distrito {ultima.distrito} · En evaluación, sin publicar, sin categoría hasta que la
            evalúen.
          </p>

          <div className="mt-4 grid max-w-2xl gap-3 sm:grid-cols-2">
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "var(--fondo-tarjeta)",
                border: "2px solid var(--color-marca-600)",
              }}
            >
              <p className="text-xs font-semibold" style={{ color: "var(--marca-texto)" }}>
                Escribilo en el casillero “Código” del papel
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold">{propuesta}</p>
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 8%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
                Código de seguimiento, para el vecino
              </p>
              <p className="mt-0.5 font-mono text-2xl font-bold" style={{ letterSpacing: "0.12em" }}>
                {ultima.codigo}
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed">
            Imprimí el comprobante y dáselo a quien presentó la idea: con el código de la propuesta
            y el de seguimiento consulta cómo sigue en <strong>{sitio}/ideas/seguimiento</strong>.{" "}
            <strong>El código de seguimiento no se vuelve a mostrar</strong>: si no se imprime ahora,
            anotalo.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--color-marca-700)" }}
            >
              Imprimir comprobante
            </button>
            <button
              type="button"
              onClick={cargarOtra}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ background: "var(--fondo-tarjeta)", border: "1px solid var(--borde-control)" }}
            >
              Cargar el papel siguiente
            </button>
            <Link
              href={`/admin?idea=${ultima.id}#ficha`}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold underline"
            >
              Ver su ficha en Propuestas
            </Link>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--texto-suave)" }}>
            “Cargar el papel siguiente” deja puesto de dónde vino y la fecha (
            {lote.canalDetalle || "sin detalle"}, {lote.fecha}), para seguir con la tanda.
          </p>
        </section>

        <div className="max-w-3xl">
          <Comprobante idea={ultima} poligono={contornos[ultima.distrito] ?? null} sitio={sitio} />
        </div>
      </div>
    );
  }

  // --- El formulario ---------------------------------------------------------
  const largo = (valor: string) => valor.trim().length;
  const dniEscrito = papel.dni.replace(/[.\s-]/g, "");
  const faltantes: string[] = [];
  if (largo(lote.canalDetalle) < limites.canalDetalle.minimo) faltantes.push("de dónde vino");
  if (!lote.fecha) faltantes.push("la fecha en que se presentó");
  if (dniEscrito && !/^\d{7,8}$/.test(dniEscrito)) faltantes.push("un DNI de 7 u 8 números");
  if (papel.conOrganizacion === "si" && !papel.organizacion.trim()) {
    faltantes.push("el nombre de la organización");
  }
  if (largo(papel.problema) < limites.problema.minimo) faltantes.push("el problema");
  if (!punto) faltantes.push("el lugar en el mapa");
  else if (distrito === null) faltantes.push("un punto dentro de los 20 distritos");
  if (largo(papel.solucion) < limites.solucion.minimo) faltantes.push("qué les gustaría mejorar");
  if (largo(papel.titulo) < limites.titulo.minimo) faltantes.push("el nombre de la propuesta");

  const bloqueado = pendiente || ubicando || faltantes.length > 0;

  /*
   * Con preventDefault React no resetea nada (como en equipo/panel.tsx): ante un
   * rechazo del servidor, lo tipeado queda. La action queda puesta para que,
   * antes de que cargue React, no se mande solo por GET.
   */
  function enviar(evento: React.SubmitEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    startTransition(() => accion(datos));
  }

  return (
    <form
      action={accion}
      onSubmit={enviar}
      className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start"
    >
      <div className="space-y-8">
        {enEvaluacion && (
          <p
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-marca-600) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-marca-600) 28%, transparent)",
            }}
          >
            La edición {anio} ya está en evaluación técnica: el formulario del sitio está cerrado,
            pero lo que se presentó por otra vía se sigue cargando acá y se evalúa con las demás.
          </p>
        )}

        {/* --- La tanda: no esta en el papel, es del equipo ------------------ */}
        <fieldset className="space-y-4">
          <legend className="text-lg font-bold">De dónde viene la tanda</legend>
          <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
            No está en el papel: queda puesto para el papel siguiente, así la tanda de una misma
            asamblea se carga de corrido.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {CANALES.map((canal) => (
              <label
                key={canal.valor}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm"
                style={{
                  background: lote.canal === canal.valor ? "var(--fondo-suave)" : "var(--fondo-tarjeta)",
                  border: `1px solid ${lote.canal === canal.valor ? "var(--color-marca-500)" : "var(--borde)"}`,
                }}
              >
                <input
                  type="radio"
                  name="canal"
                  value={canal.valor}
                  checked={lote.canal === canal.valor}
                  onChange={() => setLote((actual) => ({ ...actual, canal: canal.valor }))}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">{canal.etiqueta}</span>
                  <span className="block text-xs" style={{ color: "var(--texto-suave)" }}>
                    {canal.ayuda}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Campo
              etiqueta="De dónde vino exactamente"
              ayuda="Por ejemplo “Asamblea del distrito 7, 12/10/2026” o “Mesa de entradas”. No es público."
            >
              <input
                name="canalDetalle"
                required
                minLength={limites.canalDetalle.minimo}
                maxLength={limites.canalDetalle.maximo}
                value={lote.canalDetalle}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setLote((actual) => ({ ...actual, canalDetalle: valor }));
                }}
                placeholder="Asamblea del distrito 7, 12/10/2026"
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={estiloCampo}
              />
            </Campo>
            <Campo etiqueta="Fecha en que se presentó" ayuda="La del papel, no la de hoy.">
              <input
                type="date"
                name="fecha"
                required
                max={hoy}
                value={lote.fecha}
                onChange={(evento) => {
                  const valor = evento.target.value;
                  setLote((actual) => ({ ...actual, fecha: valor }));
                }}
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={estiloCampo}
              />
            </Campo>
          </div>
        </fieldset>

        {/* --- El papel, en su orden ------------------------------------------ */}
        <div className="hoja-papel space-y-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--marca-texto)" }}>
            Formulario de propuesta · Presupuesto Participativo {anio}
          </p>

          <fieldset className="space-y-4">
            <legend className="titulo-papel">Persona de contacto</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre y apellido" ayuda="Opcional. Solo lo ve el equipo.">
                <input
                  ref={campoAutor}
                  name="autorNombre"
                  maxLength={limites.autorNombre.maximo}
                  value={papel.autorNombre}
                  onChange={(evento) => escribir("autorNombre", evento.target.value)}
                  autoComplete="off"
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={estiloCampo}
                />
              </Campo>
              <Campo
                etiqueta="DNI"
                ayuda="Opcional. No se guarda: se usa, cifrado, para unir la idea con el padrón de la persona."
              >
                <input
                  name="dni"
                  inputMode="numeric"
                  maxLength={12}
                  value={papel.dni}
                  onChange={(evento) => escribir("dni", evento.target.value)}
                  autoComplete="off"
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={estiloCampo}
                />
              </Campo>
              <Campo
                etiqueta="Teléfono"
                ayuda="Opcional. Solo lo ve el equipo y se borra al cerrar la edición."
              >
                <input
                  name="autorTelefono"
                  type="tel"
                  maxLength={limites.autorTelefono.maximo}
                  value={papel.autorTelefono}
                  onChange={(evento) => escribir("autorTelefono", evento.target.value)}
                  autoComplete="off"
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={estiloCampo}
                />
              </Campo>
              <QuedaEnElPapel etiqueta="Domicilio" />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium" id="pregunta-organizacion">
                {PREGUNTAS_DE_LA_IDEA.organizacion.pregunta}
              </p>
              <div className="flex gap-5 text-sm" role="radiogroup" aria-labelledby="pregunta-organizacion">
                {(["si", "no"] as const).map((opcion) => (
                  <label key={opcion} className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="conOrganizacion"
                      value={opcion === "si" ? "1" : "0"}
                      checked={papel.conOrganizacion === opcion}
                      onChange={() => setPapel((actual) => ({ ...actual, conOrganizacion: opcion }))}
                    />
                    {opcion === "si" ? "Sí" : "No"}
                  </label>
                ))}
              </div>
              {papel.conOrganizacion === "si" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Organización">
                    <input
                      name="organizacion"
                      maxLength={limites.organizacion.maximo}
                      value={papel.organizacion}
                      onChange={(evento) => escribir("organizacion", evento.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-sm"
                      style={estiloCampo}
                    />
                  </Campo>
                  <QuedaEnElPapel etiqueta="Domicilio de la organización" />
                </div>
              )}
            </div>
          </fieldset>

          <Pregunta clave="problema">
            <AreaTexto
              name="problema"
              valor={papel.problema}
              largo={limites.problema}
              filas={4}
              onCambio={(valor) => escribir("problema", valor)}
            />
          </Pregunta>

          <Pregunta clave="referenciasUbicacion">
            <AreaTexto
              name="referenciasUbicacion"
              valor={papel.referenciasUbicacion}
              largo={limites.referenciasUbicacion}
              filas={2}
              onCambio={(valor) => escribir("referenciasUbicacion", valor)}
              etiqueta="Las referencias, como están en el papel"
            />
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              Con esas referencias, tocá el mapa en el lugar. El distrito y el barrio se completan
              solos. Si no se puede saber el lugar exacto, marcá lo más cerca que puedas y tildá
              “aproximado”.
            </p>
            <Mapa
              modo="seleccionar"
              onSeleccionar={(nuevo) => void elegirPunto(nuevo)}
              puntoElegido={punto}
              distritoActivo={distrito ?? undefined}
              distritos={DISTRITOS_MAPA}
              puntos={SIN_PUNTOS}
              alto="20rem"
            />
            {/* El punto viaja en campos ocultos: el mapa no es un campo de formulario. */}
            <input type="hidden" name="lat" value={punto ? String(punto.lat) : ""} />
            <input type="hidden" name="lon" value={punto ? String(punto.lon) : ""} />

            <p
              className="rounded-xl px-4 py-3 text-sm"
              aria-live="polite"
              style={{
                background: "var(--fondo-suave)",
                border: `1px solid ${punto && distrito === null ? "var(--color-acento-600)" : "var(--borde)"}`,
              }}
            >
              {!punto && "Todavía no se marcó el lugar."}
              {punto && ubicando && "Buscando el distrito…"}
              {punto && !ubicando && distrito && (
                <>
                  Punto en el <strong>Distrito {distrito}</strong>.{" "}
                  <span style={{ color: "var(--texto-suave)" }}>
                    {punto.lat.toFixed(5)}, {punto.lon.toFixed(5)}
                  </span>
                </>
              )}
              {punto && !ubicando && distrito === null && (
                <>Ese punto queda fuera de los 20 distritos de la ciudad. Marcá uno más cerca.</>
              )}
              {punto && !ubicando && distrito === undefined && (
                <>No se pudo averiguar el distrito ahora. Se calcula igual al guardar.</>
              )}
            </p>

            <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
              <Campo
                etiqueta="Barrio"
                ayuda={barrio.delMapa && barrio.valor ? "Lo completó el mapa. Si es otro, corregilo." : "Opcional."}
              >
                <input
                  name="barrio"
                  maxLength={limites.barrio.maximo}
                  value={barrio.valor}
                  onChange={(evento) => setBarrio({ valor: evento.target.value, delMapa: false })}
                  className="w-full rounded-xl px-3 py-2.5 text-sm"
                  style={estiloCampo}
                />
              </Campo>
              <label className="flex items-center gap-2 pb-6 text-sm">
                <input
                  type="checkbox"
                  name="aproximada"
                  value="1"
                  checked={aproximada}
                  onChange={(evento) => setAproximada(evento.target.checked)}
                />
                El punto es aproximado
              </label>
            </div>
          </Pregunta>

          <Pregunta clave="solucion">
            <AreaTexto
              name="solucion"
              valor={papel.solucion}
              largo={limites.solucion}
              filas={4}
              onCambio={(valor) => escribir("solucion", valor)}
            />
          </Pregunta>

          <Pregunta clave="beneficios">
            <AreaTexto
              name="beneficios"
              valor={papel.beneficios}
              largo={limites.beneficios}
              filas={3}
              onCambio={(valor) => escribir("beneficios", valor)}
            />
          </Pregunta>

          <Pregunta clave="titulo">
            <input
              name="titulo"
              required
              aria-label={PREGUNTAS_DE_LA_IDEA.titulo.pregunta}
              maxLength={limites.titulo.maximo}
              value={papel.titulo}
              onChange={(evento) => escribir("titulo", evento.target.value)}
              placeholder="Una plaza para el barrio"
              className="w-full rounded-xl px-3 py-2.5 text-sm"
              style={estiloCampo}
            />
            <Contador valor={papel.titulo} largo={limites.titulo} />
            <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
              Si viene en mayúsculas se acomoda solo al guardar; después se puede corregir desde la
              ficha.
            </p>
          </Pregunta>

          <fieldset className="space-y-2">
            <legend className="titulo-papel">Personas de referencia</legend>
            <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
              Los dos referentes <strong>no se cargan</strong>: quedan en el papel, que se archiva
              con el código de la propuesta.
            </p>
          </fieldset>
        </div>

        <div className="space-y-2" style={{ borderTop: "1px solid var(--borde)" }}>
          <div className="flex flex-wrap items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={bloqueado}
              className="rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-marca-700)" }}
            >
              {pendiente ? "Cargando…" : "Cargar la propuesta"}
            </button>
            {faltantes.length > 0 && (
              <span className="text-sm" style={{ color: "var(--texto-suave)" }}>
                Falta: {faltantes.join(", ")}.
              </span>
            )}
          </div>
          {resultado && !resultado.ok && (
            <p
              role="alert"
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-acento-600) 10%, transparent)",
                border: "1px solid var(--color-acento-600)",
              }}
            >
              {resultado.error}
            </p>
          )}
        </div>
      </div>

      {/* --- La vista previa: asi sale el comprobante ----------------------- */}
      <aside className="space-y-2 xl:sticky xl:top-4">
        <p className="text-xs font-medium" style={{ color: "var(--texto-suave)" }}>
          Así va a salir el comprobante (los códigos aparecen al cargarla).
        </p>
        <DocumentoIdea
          datos={{
            titulo: papel.titulo,
            barrio: barrio.valor,
            distrito: distrito ?? null,
            punto,
            referenciasUbicacion: papel.referenciasUbicacion,
            solucion: papel.solucion,
            problema: papel.problema,
            beneficios: papel.beneficios,
            organizacion: papel.conOrganizacion === "si" ? papel.organizacion : "",
          }}
          anio={anio}
          poligono={distrito ? (contornos[distrito] ?? null) : null}
        />
      </aside>

      <style>{estilos}</style>
    </form>
  );
}

/** Un bloque del papel: la pregunta en el encabezado azul y la ayuda en cursiva. */
function Pregunta({
  clave,
  children,
}: {
  clave: Exclude<keyof typeof PREGUNTAS_DE_LA_IDEA, "organizacion">;
  children: React.ReactNode;
}) {
  const { pregunta, ayuda } = PREGUNTAS_DE_LA_IDEA[clave];
  return (
    <section className="space-y-2">
      <h3 className="titulo-papel">{pregunta}</h3>
      <p className="text-xs italic" style={{ color: "var(--texto-suave)" }}>
        {ayuda}
      </p>
      {children}
    </section>
  );
}

/** Un campo largo del papel, con su contador. */
function AreaTexto({
  name,
  valor,
  largo,
  filas,
  onCambio,
  etiqueta,
}: {
  name: CampoPapel;
  valor: string;
  largo: Largo;
  filas: number;
  onCambio: (valor: string) => void;
  /** Para el lector de pantalla, si la pregunta sola no alcanza. */
  etiqueta?: string;
}) {
  return (
    <>
      <textarea
        name={name}
        rows={filas}
        aria-label={etiqueta ?? PREGUNTAS_DE_LA_IDEA[name as keyof typeof PREGUNTAS_DE_LA_IDEA]?.pregunta}
        maxLength={largo.maximo}
        value={valor}
        onChange={(evento) => onCambio(evento.target.value)}
        className="w-full resize-y rounded-xl px-3 py-2.5 text-sm"
        style={estiloCampo}
      />
      <Contador valor={valor} largo={largo} />
    </>
  );
}

/** Cuanto lleva escrito un campo, y si le falta para el minimo. */
function Contador({ valor, largo }: { valor: string; largo: Largo }) {
  const escritos = valor.trim().length;
  const falta = largo.minimo > 0 && escritos < largo.minimo;
  return (
    <p
      className="text-right text-xs tabular-nums"
      style={{ color: falta ? "var(--acento-texto)" : "var(--texto-suave)" }}
    >
      {falta
        ? `${escritos} de al menos ${largo.minimo} caracteres`
        : `${escritos} / ${largo.maximo}`}
    </p>
  );
}

/** Un renglon del papel que el sistema no guarda: se dice en su lugar. */
function QuedaEnElPapel({ etiqueta }: { etiqueta: string }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <span
        className="rounded-xl px-3 py-2.5 text-xs"
        style={{ border: "1px dashed var(--borde)", color: "var(--texto-suave)" }}
      >
        No se carga: queda en el papel archivado.
      </span>
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{etiqueta}</span>
      {children}
      {ayuda && (
        <span className="text-xs" style={{ color: "var(--texto-suave)" }}>
          {ayuda}
        </span>
      )}
    </label>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};

/*
 * El papel tiene encabezados en banda celeste con la pregunta en azul y
 * mayusculas: los titulos de la pantalla los imitan, para que quien transcribe
 * encuentre el renglon de un vistazo.
 */
const estilos = `
.titulo-papel {
  display: block;
  width: 100%;
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--marca-texto);
  background: color-mix(in srgb, var(--color-marca-600) 10%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-marca-600) 35%, transparent);
}
`;
