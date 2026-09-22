/**
 * Panel de Migue: que le pregunta la gente al asistente del sitio.
 *
 * NO lleva "use client": la pantalla no escribe nada y lo unico que se elige
 * (la ventana de dias) viaja en el querystring, asi que son enlaces comunes y
 * funciona sin JavaScript. Al ser un componente de servidor las fechas se
 * formatean aca mismo con el huso de Tucuman sin riesgo de que la hidratacion no
 * coincida: no hay hidratacion.
 *
 * El componente no consulta la base: recibe todo resuelto de page.tsx, que es
 * quien llama a src/db/queries.ts.
 *
 * ORDEN DE LA PANTALLA, que es la decision de diseno principal: primero las
 * consultas SIN RESOLVER y las preguntas que se repiten, despues los totales.
 * Los totales son lindos de mirar pero no se pueden accionar; una pregunta que
 * Migue no supo contestar es una tarea concreta: contenido que le falta al
 * sitio. Por eso la lista de trabajo esta arriba y los graficos abajo.
 *
 * Lo que esta pantalla NO muestra, a pedido del equipo: nada sobre como esta
 * configurado Migue por dentro. Ninguna de las consultas de queries.ts que usa
 * devuelve esos datos, asi que no se pueden filtrar ni por accidente.
 *
 * Datos personales: de la base no sale nada de quien pregunto. Se dibuja el
 * texto de la pregunta y el de la respuesta, nada mas.
 *
 * Volumen: hoy hay muy pocas consultas registradas y la pantalla se tiene que
 * ver bien igual. Cada bloque tiene su estado vacio en palabras (nunca un
 * grafico en cero), las listas vienen con limite desde la consulta, y el grafico
 * de uso por dia se dibuja con barras y no con una linea justamente porque tres
 * puntos no hacen una linea.
 */
import Link from "next/link";
import { Chip } from "@/components/ui";
import type {
  FilaConsultaChat,
  FilaTemaChat,
  PreguntaRepetidaChat,
  ResumenChat,
  UsoChatPorDia,
} from "@/db/queries";
import { ETIQUETA_TEMA } from "@/lib/chat-temas";
import { formatearFechaCorta, formatearNumero } from "@/lib/formato";
import { aTextoLlano } from "@/lib/texto";
// La barrita de una celda de tabla ya existe y hace exactamente esto: se
// importa en lugar de escribir una segunda igual. Es un modulo comun, no una
// pagina, y no tiene "use client".
import { BarraMini } from "../tablero/graficos";

/** La ruta de esta pantalla: el destino de los enlaces de la ventana. */
const RUTA = "/admin/migue";

/** Borde de un control: el token vive en src/app/globals.css (WCAG 1.4.11). */
const BORDE_CONTROL = "var(--borde-control)";

/**
 * Los dos colores de toda la pantalla. Se repiten en el grafico de temas, en el
 * de uso por dia y en las leyendas, asi que el ojo aprende una sola vez que el
 * naranja es "sin resolver".
 */
const COLOR_RESUELTA = "var(--color-marca-600)";
const COLOR_SIN_RESOLVER = "var(--color-acento-600)";
/**
 * Los mismos dos colores cuando son TEXTO. Las rampas --color-acento-* y
 * --color-marca-* estan oscurecidas para poner blanco encima, asi que como letra
 * sobre el fondo oscuro del tema no llegaban al 4.5:1 de WCAG (medido: el
 * naranja 2.96:1 en el chip y 3.30:1 en la tabla; el azul 3.43:1 sobre la
 * tarjeta). --acento-texto y --marca-texto cambian con el tema; ver el
 * comentario en globals.css. Los dos de arriba se quedan como estan: ahi son
 * relleno de barra y de pastilla, que es el rol para el que la rampa esta hecha.
 */
const COLOR_SIN_RESOLVER_TEXTO = "var(--acento-texto)";
const COLOR_RESUELTA_TEXTO = "var(--marca-texto)";

/** Tinte del color sobre el fondo, proporcional a la intensidad. */
function tinte(color: string, intensidad: number): string {
  return `color-mix(in srgb, ${color} ${intensidad}%, transparent)`;
}

/** Fechas con hora en la zona de Tucuman: una consulta se ubica por minuto. */
const fechaHora = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Tucuman",
});

/** Un decimal, para el promedio por dia (0,7 consultas por dia es un dato). */
const decimales = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const estiloEje: React.CSSProperties = { fontSize: 11 };

export type Props = {
  /** Ventana en dias que se esta mirando, ya validada por page.tsx. */
  dias: number;
  /** Ventanas entre las que se puede elegir. */
  ventanas: readonly number[];
  resumen: ResumenChat;
  temas: FilaTemaChat[];
  porDia: UsoChatPorDia[];
  sinResolver: FilaConsultaChat[];
  repetidas: PreguntaRepetidaChat[];
  ultimas: FilaConsultaChat[];
  /** Tope de la lista de sin resolver, para poder decirlo en la pantalla. */
  limiteSinResolver: number;
  /** Tope de la lista de las ultimas consultas. */
  limiteUltimas: number;
};

export default function PanelMigue({
  dias,
  ventanas,
  resumen,
  temas,
  porDia,
  sinResolver,
  repetidas,
  ultimas,
  limiteSinResolver,
  limiteUltimas,
}: Props) {
  // Nunca hubo una consulta: no hay nada que graficar ni que explicar por
  // bloque, asi que la pantalla es un solo cartel.
  const sinHistoria = ultimas.length === 0 && sinResolver.length === 0;
  // Hubo consultas, pero ninguna dentro de la ventana elegida.
  const ventanaVacia = !sinHistoria && resumen.total === 0;

  return (
    <div>
      <header>
        <h1 className="text-2xl font-bold">Migue</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
          Qué le pregunta la gente al asistente del sitio. Sirve para cuatro cosas: ver{" "}
          <strong>qué temas trae</strong>, cuál es el <strong>más demandado</strong>, cuánto se usa{" "}
          <strong>en el tiempo</strong> y —lo importante— <strong>qué está buscando y no
          encuentra</strong>.
        </p>
      </header>

      <VentanaDias dias={dias} ventanas={ventanas} />

      {sinHistoria ? (
        <div
          className="mt-6 max-w-3xl rounded-2xl px-5 py-6 text-sm"
          style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
        >
          <p className="font-semibold">Todavía no hay ninguna consulta registrada.</p>
          <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
            Esta pantalla se llena sola: cada vez que alguien le pregunta algo a Migue en el sitio,
            queda la pregunta, el tema en el que entra y si se pudo contestar. Mientras no haya
            consultas no se dibuja ningún gráfico, porque un gráfico en cero no dice nada.
          </p>
        </div>
      ) : (
        <>
          {ventanaVacia && (
            <div
              className="mt-6 max-w-3xl rounded-2xl px-5 py-4 text-sm"
              style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
            >
              <p className="font-semibold">
                No hubo consultas en los últimos {formatearNumero(dias)} días.
              </p>
              <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
                Los totales y los gráficos de abajo miran esa ventana, así que están en cero. Las
                listas de preguntas no se filtran por fecha: lo que ves ahí sigue siendo válido.
              </p>
            </div>
          )}

          <SinResolver
            filas={sinResolver}
            resumen={resumen}
            dias={dias}
            limite={limiteSinResolver}
          />

          <QueBusca filas={repetidas} dias={dias} />

          <Numeros resumen={resumen} dias={dias} />

          <PorTema filas={temas} total={resumen.total} dias={dias} />

          <PorDia puntos={porDia} dias={dias} />

          <Ultimas filas={ultimas} limite={limiteUltimas} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ventana de dias
// ---------------------------------------------------------------------------

/**
 * Selector de la ventana. Son enlaces y no un combo: se resuelve en el
 * servidor, funciona sin JavaScript y el enlace de lo que estas mirando se
 * puede pasar al resto del equipo.
 */
function VentanaDias({ dias, ventanas }: { dias: number; ventanas: readonly number[] }) {
  return (
    <nav aria-label="Ventana de tiempo" className="mt-5 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Últimos</span>
      {ventanas.map((opcion) => {
        const actual = opcion === dias;
        // El parametro va SIEMPRE, tambien en la opcion activa: con la ruta
        // pelada la pastilla marcada de 7 o de 90 dias llevaba a la ventana por
        // defecto, o sea que tocar lo que ya estabas mirando te cambiaba de
        // vista.
        return (
          <Link
            key={opcion}
            href={`${RUTA}?dias=${opcion}`}
            aria-current={actual ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              actual ? "font-semibold" : "font-medium hover:brightness-95"
            }`}
            style={
              actual
                ? {
                    background: "var(--color-marca-700)",
                    border: "1px solid var(--color-marca-700)",
                    color: "#fff",
                  }
                : {
                    background: "var(--fondo-tarjeta)",
                    border: `1px solid ${BORDE_CONTROL}`,
                    color: "var(--texto)",
                  }
            }
          >
            {formatearNumero(opcion)} días
          </Link>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// 1. Lo que Migue no pudo contestar (el bloque mas importante)
// ---------------------------------------------------------------------------

/**
 * La lista de trabajo del equipo. Va primera porque es la unica parte de la
 * pantalla que se puede accionar: cada fila es una pregunta concreta que el
 * sitio no tiene contestada.
 *
 * Esta lista NO se filtra por la ventana de dias, a proposito: una pregunta que
 * quedo sin contestar hace cinco semanas sigue sin contestada hoy.
 */
function SinResolver({
  filas,
  resumen,
  dias,
  limite,
}: {
  filas: FilaConsultaChat[];
  resumen: ResumenChat;
  dias: number;
  limite: number;
}) {
  return (
    <section className="mt-8" aria-labelledby="titulo-sin-resolver">
      <h2 id="titulo-sin-resolver" className="text-xl font-bold">
        Lo que Migue no pudo contestar
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Esto es <strong>contenido que le falta al sitio</strong>, escrito con las palabras del
        vecino. Migue no inventa: cuando el dato no está cargado lo dice y la consulta queda acá.
        Leelas de arriba abajo y preguntate dónde debería estar la respuesta: en un{" "}
        <Link href="/admin/contenido" className="underline">
          texto del sitio
        </Link>
        , en el cronograma de la edición, en una novedad, o en un dato de una idea que todavía nadie
        cargó. Cuando eso esté cargado, Migue lo contesta solo.
      </p>

      <div
        className="mt-4 rounded-2xl px-5 py-4"
        style={{
          background: tinte("var(--color-acento-600)", 6),
          border: `1px solid ${tinte("var(--color-acento-600)", 45)}`,
          borderLeftWidth: "4px",
          borderLeftColor: "var(--color-acento-600)",
        }}
      >
        <p className="text-3xl font-bold" style={{ color: COLOR_SIN_RESOLVER_TEXTO }}>
          {formatearNumero(resumen.sinResolver)}
        </p>
        <p className="mt-0.5 text-sm">
          {resumen.sinResolver === 1 ? "consulta sin resolver" : "consultas sin resolver"} sobre{" "}
          {formatearNumero(resumen.total)} en los últimos {formatearNumero(dias)} días
          {resumen.total > 0 && ` · se resolvió el ${formatearNumero(resumen.porcentajeResueltas)} %`}
          .
        </p>
      </div>

      {filas.length === 0 ? (
        <div
          className="mt-4 rounded-2xl px-5 py-6 text-sm"
          style={{ background: "var(--fondo-suave)", border: "1px dashed var(--borde)" }}
        >
          <p className="font-semibold">No quedó ninguna pregunta sin contestar.</p>
          <p className="mt-1" style={{ color: "var(--texto-suave)" }}>
            Todas las consultas registradas se pudieron responder con lo que hay cargado en el
            sitio. Vale la pena volver acá después de cada cambio de etapa: las preguntas cambian.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm" style={{ color: "var(--texto-suave)" }}>
            {filas.length === 1
              ? "La única que quedó sin contestar."
              : `Las ${formatearNumero(filas.length)} más recientes${
                  filas.length === limite ? ` (el listado corta en ${formatearNumero(limite)})` : ""
                }, de la más nueva a la más vieja.`}{" "}
            No se filtran por la ventana de arriba: una pregunta sin contestar no caduca.
          </p>
          <ol className="mt-3 space-y-3">
            {filas.map((fila) => (
              <li key={fila.id}>
                <TarjetaConsulta fila={fila} destacada />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * Una consulta: la pregunta como la escribieron, el tema, si se resolvio y lo
 * que Migue contesto. El texto de la respuesta esta a proposito: sin leerlo no
 * se sabe si falto el dato o si la pregunta era otra cosa.
 *
 * Se exporta porque el listado completo de /admin/consultas dibuja la misma
 * ficha: una consulta se lee igual en las dos pantallas y no tiene sentido
 * mantener dos fichas que se van a desfasar.
 */
export function TarjetaConsulta({
  fila,
  destacada = false,
}: {
  fila: FilaConsultaChat;
  destacada?: boolean;
}) {
  return (
    <article
      className="rounded-2xl px-5 py-4"
      style={{
        background: "var(--fondo-tarjeta)",
        border: "1px solid var(--borde)",
        // Barra al costado: la marca que sobrevive a la escala de grises.
        borderLeftWidth: "4px",
        borderLeftColor: destacada ? "var(--color-acento-600)" : "var(--borde)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="min-w-0 text-base font-semibold" style={{ overflowWrap: "anywhere" }}>
          {fila.pregunta}
        </p>
        <p className="text-xs" style={{ color: "var(--texto-suave)" }}>
          <time dateTime={fila.createdAt.toISOString()}>{fechaHora.format(fila.createdAt)}</time>
          {fila.ms !== null && ` · ${formatearNumero(fila.ms)} ms`}
        </p>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-2">
        <Chip>{ETIQUETA_TEMA[fila.tema] ?? fila.tema}</Chip>
        {fila.resuelta ? (
          <Chip color={COLOR_RESUELTA_TEXTO}>
            <span aria-hidden="true">✓</span> Se pudo contestar
          </Chip>
        ) : (
          <Chip color={COLOR_SIN_RESOLVER_TEXTO}>
            <span aria-hidden="true">▲</span> Sin resolver
          </Chip>
        )}
        {!fila.ok && (
          <Chip color="var(--color-estado-nofactible)">Se cortó por un error del sitio</Chip>
        )}
      </p>

      {fila.respuesta ? (
        <div
          className="mt-3 rounded-xl px-3.5 py-2.5"
          style={{ background: "var(--fondo-suave)", border: "1px solid var(--borde)" }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--texto-suave)" }}
          >
            Lo que leyó la persona
          </p>
          {/* En texto llano: Migue contesta en un markdown chico y el crudo
              dejaba los `**` a la vista justo debajo del rotulo que dice que
              esto es lo que leyo la persona (ver aTextoLlano). */}
          <p className="mt-1 line-clamp-4 text-sm" style={{ overflowWrap: "anywhere" }}>
            {aTextoLlano(fila.respuesta)}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm italic" style={{ color: "var(--texto-suave)" }}>
          No quedó registrada ninguna respuesta: la consulta se cortó antes.
        </p>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// 2. Que busca la gente
// ---------------------------------------------------------------------------

/**
 * Las preguntas agrupadas por lo que dicen, sin distinguir mayusculas, tildes
 * ni signos: "¿Cómo voto?" y "como voto" son la misma fila.
 *
 * Con poco volumen casi todas van a decir "1 vez" y esta bien: la tabla igual
 * sirve para leer de un tiron con que palabras habla la gente. La columna que
 * importa es la de la derecha.
 */
function QueBusca({ filas, dias }: { filas: PreguntaRepetidaChat[]; dias: number }) {
  if (filas.length === 0) {
    return (
      <section className="mt-10" aria-labelledby="titulo-que-busca">
        <h2 id="titulo-que-busca" className="text-xl font-bold">
          Qué está buscando la gente
        </h2>
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Sin consultas en los últimos {formatearNumero(dias)} días no hay preguntas que agrupar.
        </p>
      </section>
    );
  }

  const maximo = Math.max(...filas.map((fila) => fila.veces));
  const repetidas = filas.filter((fila) => fila.veces > 1).length;

  return (
    <section className="mt-10" aria-labelledby="titulo-que-busca">
      <h2 id="titulo-que-busca" className="text-xl font-bold">
        Qué está buscando la gente
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Las preguntas más frecuentes de los últimos {formatearNumero(dias)} días, agrupadas sin
        distinguir mayúsculas, tildes ni signos. Una pregunta que se repite <em>y</em> queda sin
        resolver es la que más urge:{" "}
        {repetidas === 0
          ? "por ahora ninguna se repitió, así que la lista se lee como un muestreo de con qué palabras habla la gente."
          : `${formatearNumero(repetidas)} ${
              repetidas === 1 ? "pregunta se repitió" : "preguntas se repitieron"
            } en esta ventana.`}
      </p>

      <div className="superficie mt-4 overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">
            Preguntas más frecuentes de los últimos {formatearNumero(dias)} días, con su tema, las
            veces que se preguntó y cuántas de esas veces quedaron sin resolver
          </caption>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--borde)" }}>
              <th scope="col" className="px-3 py-3 text-left font-semibold">
                Pregunta
              </th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">
                Tema
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Veces
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Sin resolver
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, indice) => {
              const nunca = fila.sinResolver === fila.veces;
              return (
                <tr
                  key={`${indice}-${fila.pregunta}`}
                  style={{ borderBottom: "1px solid var(--borde)" }}
                >
                  <th
                    scope="row"
                    className="px-3 py-3 text-left font-medium"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {fila.pregunta}
                  </th>
                  <td className="px-3 py-3">
                    <span style={{ color: "var(--texto-suave)" }}>
                      {ETIQUETA_TEMA[fila.tema] ?? fila.tema}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className="flex items-center justify-end gap-2">
                      <BarraMini valor={fila.veces} maximo={maximo} color={COLOR_RESUELTA} />
                      <strong className="font-medium">{formatearNumero(fila.veces)}</strong>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {fila.sinResolver === 0 ? (
                      <span style={{ color: "var(--texto-suave)" }}>—</span>
                    ) : (
                      <span style={{ color: COLOR_SIN_RESOLVER_TEXTO, fontWeight: 600 }}>
                        {formatearNumero(fila.sinResolver)}
                        {nunca && (
                          <span className="ml-1 font-normal">
                            {fila.veces === 1 ? "(no se contestó)" : "(nunca se contestó)"}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Los numeros de la ventana
// ---------------------------------------------------------------------------

function Numeros({ resumen, dias }: { resumen: ResumenChat; dias: number }) {
  return (
    <section className="mt-10" aria-labelledby="titulo-numeros">
      <h2 id="titulo-numeros" className="text-xl font-bold">
        Los números de los últimos {formatearNumero(dias)} días
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        El contexto de lo de arriba. Una consulta cuenta como resuelta cuando Migue pudo contestarla
        con datos del sitio; cuenta como sin resolver cuando el dato no estaba cargado o cuando la
        pregunta se fue del programa.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta
          titulo="Consultas"
          valor={formatearNumero(resumen.total)}
          detalle={`${formatearNumero(resumen.resueltas)} resueltas · ${formatearNumero(
            resumen.sinResolver,
          )} sin resolver`}
        />
        <Tarjeta
          titulo="Se pudo contestar"
          valor={resumen.total === 0 ? "—" : `${formatearNumero(resumen.porcentajeResueltas)} %`}
          detalle={
            resumen.total === 0
              ? "Sin consultas en esta ventana no hay porcentaje que calcular."
              : "Sobre el total de la ventana."
          }
          color={COLOR_RESUELTA_TEXTO}
        />
        <Tarjeta
          titulo="Tema más demandado"
          valor={
            resumen.temaMasDemandado
              ? (ETIQUETA_TEMA[resumen.temaMasDemandado.tema] ?? resumen.temaMasDemandado.tema)
              : "—"
          }
          detalle={
            resumen.temaMasDemandado
              ? `${formatearNumero(resumen.temaMasDemandado.consultas)} ${
                  resumen.temaMasDemandado.consultas === 1 ? "consulta" : "consultas"
                }`
              : "Todavía no hay consultas en esta ventana."
          }
          chico
        />
        <Tarjeta
          titulo="Demora en responder"
          valor={
            resumen.msPromedio === null ? "—" : `${formatearNumero(resumen.msPromedio)} ms`
          }
          detalle={
            resumen.conError === 0
              ? "Promedio. Ninguna consulta se cortó por un error."
              : `Promedio. ${formatearNumero(resumen.conError)} ${
                  resumen.conError === 1 ? "consulta se cortó" : "consultas se cortaron"
                } por un error.`
          }
          color={resumen.conError > 0 ? COLOR_SIN_RESOLVER_TEXTO : undefined}
        />
      </div>

      {/* Antes este parrafo decia que las filas viejas cuentan como "Otros" y
          "sin resolver". Dejo de ser cierto: ahora quedan FUERA del panel (ver
          soloDelChat en src/db/queries.ts), porque contarlas mal ponia 72
          preguntas ya contestadas al frente de la lista de trabajo. */}
      <p className="mt-3 max-w-3xl text-xs" style={{ color: "var(--texto-suave)" }}>
        <strong>Qué queda afuera:</strong> esta pantalla cuenta solamente las consultas al chat de
        Migue, no las del asistente que ayuda a escribir una idea ni los informes de impacto del
        panel, que se registran en la misma tabla. Y cuenta solo las que quedaron clasificadas: las
        anteriores a que existiera la clasificación no tienen tema ni resolución guardados, así que
        no se muestran en lugar de contarse como “Otros”. No se pueden reclasificar sin inventar.
      </p>
    </section>
  );
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  color,
  chico = false,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  color?: string;
  /** Para un valor que es texto y no un numero: baja el cuerpo de la letra. */
  chico?: boolean;
}) {
  return (
    <div className="superficie rounded-2xl p-5">
      <p className="text-sm font-medium" style={{ color: "var(--texto-suave)" }}>
        {titulo}
      </p>
      <p
        className={`mt-1 font-bold ${chico ? "text-lg leading-snug" : "text-2xl"}`}
        style={color ? { color } : undefined}
      >
        {valor}
      </p>
      <p className="mt-1.5 text-xs" style={{ color: "var(--texto-suave)" }}>
        {detalle}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Grafico de temas: barras horizontales apiladas
// ---------------------------------------------------------------------------

const ANCHO_TEMAS = 660;
const ETIQUETA_TEMAS = 186;
const VALOR_TEMAS = 104;
const ALTO_FILA_TEMA = 30;
const ESPACIO_FILA_TEMA = 8;
const ALTO_BARRA_TEMA = 14;

/** Parte una etiqueta larga en a lo sumo dos lineas de `maximo` caracteres. */
function partirEtiqueta(texto: string, maximo: number): string[] {
  if (texto.length <= maximo) return [texto];
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    if (actual && `${actual} ${palabra}`.length > maximo) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.slice(0, 2);
}

/**
 * Reparto por tema. La barra se parte en resueltas y sin resolver, asi que de
 * una sola pasada se ve que tema trae mas gente Y en que tema el sitio queda
 * corto (un tema con la barra casi toda naranja es un agujero de contenido).
 *
 * El color nunca es la unica fuente: el numero y el porcentaje estan escritos al
 * costado, el svg lleva su resumen en aria-label y la tabla completa esta en el
 * <details>.
 */
function PorTema({
  filas,
  total,
  dias,
}: {
  filas: FilaTemaChat[];
  total: number;
  dias: number;
}) {
  if (filas.length === 0) {
    return (
      <section className="mt-10" aria-labelledby="titulo-temas">
        <h2 id="titulo-temas" className="text-xl font-bold">
          Qué temas trae la gente
        </h2>
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Sin consultas en los últimos {formatearNumero(dias)} días no hay temas que repartir.
        </p>
      </section>
    );
  }

  const maximo = Math.max(1, ...filas.map((fila) => fila.consultas));
  const anchoBarras = ANCHO_TEMAS - ETIQUETA_TEMAS - VALOR_TEMAS;
  const alto = filas.length * (ALTO_FILA_TEMA + ESPACIO_FILA_TEMA) - ESPACIO_FILA_TEMA;
  const resumen = filas
    .map(
      (fila) =>
        `${ETIQUETA_TEMA[fila.tema] ?? fila.tema}: ${formatearNumero(fila.consultas)} ` +
        `(${fila.porcentaje} %), ${formatearNumero(fila.sinResolver)} sin resolver`,
    )
    .join("; ");

  return (
    <section className="mt-10" aria-labelledby="titulo-temas">
      <h2 id="titulo-temas" className="text-xl font-bold">
        Qué temas trae la gente
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Cada consulta entra en un solo tema, así que las barras suman el total de la ventana. Los
        temas que no aparecen no tuvieron ninguna consulta. Un tema con mucho naranja es un tema
        sobre el que el sitio no tiene qué contestar.
      </p>

      <div className="superficie mt-4 rounded-2xl p-5">
        <Leyenda />

        <div className="mt-4 overflow-x-auto">
          <svg
            viewBox={`0 0 ${ANCHO_TEMAS} ${alto}`}
            className="mx-auto h-auto w-full"
            style={{ minWidth: 420, maxWidth: ANCHO_TEMAS }}
            role="img"
            aria-label={
              `Consultas por tema en los últimos ${formatearNumero(dias)} días, ` +
              `${formatearNumero(total)} en total. ${resumen}. ` +
              "El detalle completo está en la tabla que sigue."
            }
          >
            {filas.map((fila, indice) => {
              const y = indice * (ALTO_FILA_TEMA + ESPACIO_FILA_TEMA);
              const yBarra = y + (ALTO_FILA_TEMA - ALTO_BARRA_TEMA) / 2;
              const largo = (fila.consultas / maximo) * anchoBarras;
              const largoResueltas = fila.consultas
                ? (fila.resueltas / fila.consultas) * largo
                : 0;
              const lineas = partirEtiqueta(ETIQUETA_TEMA[fila.tema] ?? fila.tema, 24);
              return (
                <g key={fila.tema}>
                  {lineas.map((linea, numero) => (
                    <text
                      key={linea}
                      x={ETIQUETA_TEMAS - 10}
                      y={
                        lineas.length === 1
                          ? y + ALTO_FILA_TEMA / 2 + 4
                          : y + ALTO_FILA_TEMA / 2 - 2 + numero * 12
                      }
                      textAnchor="end"
                      fill="var(--texto)"
                      style={{ fontSize: 11.5, fontWeight: 600 }}
                    >
                      {linea}
                    </text>
                  ))}

                  <rect
                    x={ETIQUETA_TEMAS}
                    y={yBarra}
                    width={anchoBarras}
                    height={ALTO_BARRA_TEMA}
                    rx={4}
                    fill="var(--borde)"
                  />
                  {largoResueltas > 0 && (
                    <rect
                      x={ETIQUETA_TEMAS}
                      y={yBarra}
                      width={Math.max(2, largoResueltas)}
                      height={ALTO_BARRA_TEMA}
                      rx={3}
                      fill={COLOR_RESUELTA}
                    />
                  )}
                  {fila.sinResolver > 0 && (
                    <rect
                      x={ETIQUETA_TEMAS + largoResueltas}
                      y={yBarra}
                      width={Math.max(2, largo - largoResueltas)}
                      height={ALTO_BARRA_TEMA}
                      rx={3}
                      fill={COLOR_SIN_RESOLVER}
                    />
                  )}

                  {/* Dos pixeles de aire contra el borde derecho: el trazo del
                      ultimo glifo se pasa del ancho de avance y con el numero
                      pegado a 660 el svg desbordaba su propio viewBox. */}
                  <text
                    x={ANCHO_TEMAS - 2}
                    y={y + ALTO_FILA_TEMA / 2 + 4}
                    textAnchor="end"
                    fill="var(--texto)"
                    style={{ fontSize: 11.5, fontWeight: 600 }}
                  >
                    {formatearNumero(fila.consultas)}
                  </text>
                  <text
                    x={ANCHO_TEMAS - 46}
                    y={y + ALTO_FILA_TEMA / 2 + 4}
                    textAnchor="end"
                    fill="var(--texto-suave)"
                    style={estiloEje}
                  >
                    {fila.porcentaje} %
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm" style={{ color: "var(--texto-suave)" }}>
            Ver los datos del gráfico ({formatearNumero(filas.length)}{" "}
            {filas.length === 1 ? "tema" : "temas"})
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Consultas por tema, con resueltas y sin resolver</caption>
              <thead>
                <tr style={{ color: "var(--texto-suave)" }}>
                  <th scope="col" className="py-1 text-left font-medium">
                    Tema
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Consultas
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Del total
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Resueltas
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Sin resolver
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.tema} style={{ borderTop: "1px solid var(--borde)" }}>
                    <th scope="row" className="py-1 text-left font-normal">
                      {ETIQUETA_TEMA[fila.tema] ?? fila.tema}
                    </th>
                    <td className="py-1 text-right tabular-nums">
                      {formatearNumero(fila.consultas)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{fila.porcentaje} %</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatearNumero(fila.resueltas)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatearNumero(fila.sinResolver)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

/** Leyenda compartida por los dos graficos: el color siempre con su palabra. */
function Leyenda() {
  return (
    <ul className="flex flex-wrap gap-4 text-sm">
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-sm"
          style={{ background: COLOR_RESUELTA }}
        />
        Se pudo contestar
      </li>
      <li className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-sm"
          style={{ background: COLOR_SIN_RESOLVER }}
        />
        Sin resolver
      </li>
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 5. Grafico de uso por dia: barras apiladas
// ---------------------------------------------------------------------------

const ANCHO_DIAS = 660;
const ALTO_DIAS = 210;
const MARGEN_DIAS = { arriba: 14, derecha: 14, abajo: 34, izquierda: 44 };

/**
 * Uso dia por dia. Son BARRAS y no una linea a proposito: la consulta devuelve
 * solo los dias que tuvieron consultas, y con tres dias sueltos una linea
 * dibujaria una tendencia que no existe. Cada barra se parte en resueltas y sin
 * resolver, con los mismos colores que el grafico de temas.
 */
function PorDia({ puntos, dias }: { puntos: UsoChatPorDia[]; dias: number }) {
  if (puntos.length === 0) {
    return (
      <section className="mt-10" aria-labelledby="titulo-por-dia">
        <h2 id="titulo-por-dia" className="text-xl font-bold">
          Cuánto se usa Migue
        </h2>
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Sin consultas en los últimos {formatearNumero(dias)} días no hay nada que graficar.
        </p>
      </section>
    );
  }

  const total = puntos.reduce((suma, punto) => suma + punto.consultas, 0);
  const totalSinResolver = puntos.reduce((suma, punto) => suma + punto.sinResolver, 0);
  const maximo = Math.max(1, ...puntos.map((punto) => punto.consultas));

  const anchoUtil = ANCHO_DIAS - MARGEN_DIAS.izquierda - MARGEN_DIAS.derecha;
  const altoUtil = ALTO_DIAS - MARGEN_DIAS.arriba - MARGEN_DIAS.abajo;
  const paso = anchoUtil / puntos.length;
  const anchoBarra = Math.max(2, Math.min(30, paso - 4));

  const centro = (indice: number) => MARGEN_DIAS.izquierda + paso * (indice + 0.5);
  const enY = (valor: number) => MARGEN_DIAS.arriba + (1 - valor / maximo) * altoUtil;
  const marcas = Array.from(new Set([0, Math.ceil(maximo / 2), maximo]));

  const pico = puntos.reduce((mejor, punto) => (punto.consultas > mejor.consultas ? punto : mejor));
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const medio = puntos[Math.floor((puntos.length - 1) / 2)];
  const promedio = total / puntos.length;

  return (
    <section className="mt-10" aria-labelledby="titulo-por-dia">
      <h2 id="titulo-por-dia" className="text-xl font-bold">
        Cuánto se usa Migue
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Una barra por día con consultas: los días en cero no se dibujan, así que el eje no es un
        calendario corrido. Sirve para cruzar el uso con lo que pasó en el proceso: un pico suele
        caer el día que abre una etapa o que sale una novedad.
      </p>

      <div className="superficie mt-4 rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Leyenda />
          <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
            {formatearNumero(total)} {total === 1 ? "consulta" : "consultas"} en{" "}
            {formatearNumero(puntos.length)} {puntos.length === 1 ? "día" : "días"} con actividad ·{" "}
            {decimales.format(promedio)} por día
          </p>
        </div>

        <svg
          viewBox={`0 0 ${ANCHO_DIAS} ${ALTO_DIAS}`}
          className="mt-4 h-auto w-full"
          role="img"
          aria-label={
            `Consultas por día: ${formatearNumero(total)} en total, ` +
            `${formatearNumero(totalSinResolver)} sin resolver, repartidas en ` +
            `${formatearNumero(puntos.length)} ${puntos.length === 1 ? "día" : "días"} con ` +
            `actividad, entre el ${formatearFechaCorta(primero.dia)} y el ` +
            `${formatearFechaCorta(ultimo.dia)}. El día de mayor movimiento fue el ` +
            `${formatearFechaCorta(pico.dia)} con ${formatearNumero(pico.consultas)}. ` +
            "Los días sin consultas no se dibujan. El detalle está en la tabla que sigue."
          }
        >
          {marcas.map((marca) => (
            <g key={marca}>
              <line
                x1={MARGEN_DIAS.izquierda}
                y1={enY(marca)}
                x2={ANCHO_DIAS - MARGEN_DIAS.derecha}
                y2={enY(marca)}
                stroke="var(--borde)"
                strokeWidth={1}
              />
              <text
                x={MARGEN_DIAS.izquierda - 8}
                y={enY(marca) + 4}
                textAnchor="end"
                fill="var(--texto-suave)"
                style={estiloEje}
              >
                {formatearNumero(marca)}
              </text>
            </g>
          ))}

          {puntos.map((punto, indice) => {
            const x = centro(indice) - anchoBarra / 2;
            const base = enY(0);
            const altoTotal = base - enY(punto.consultas);
            const altoSinResolver = punto.consultas
              ? (punto.sinResolver / punto.consultas) * altoTotal
              : 0;
            const altoResueltas = altoTotal - altoSinResolver;
            return (
              <g key={punto.dia}>
                {altoResueltas > 0 && (
                  <rect
                    x={x}
                    y={base - altoResueltas}
                    width={anchoBarra}
                    height={altoResueltas}
                    fill={COLOR_RESUELTA}
                    rx={anchoBarra > 6 ? 2 : 0}
                  />
                )}
                {/* Piso de 2px: una sola consulta sin resolver dentro de un dia
                    de mucho movimiento daria una franja de medio pixel, o sea
                    invisible, y es justo la que hay que ver. Se come dos
                    pixeles del segmento de abajo, no del alto total. */}
                {altoSinResolver > 0 && (
                  <rect
                    x={x}
                    y={base - altoTotal}
                    width={anchoBarra}
                    height={Math.max(2, altoSinResolver)}
                    fill={COLOR_SIN_RESOLVER}
                    rx={anchoBarra > 6 ? 2 : 0}
                  />
                )}
              </g>
            );
          })}

          <text
            x={puntos.length === 1 ? centro(0) : MARGEN_DIAS.izquierda}
            y={ALTO_DIAS - 10}
            textAnchor={puntos.length === 1 ? "middle" : "start"}
            fill="var(--texto-suave)"
            style={estiloEje}
          >
            {formatearFechaCorta(primero.dia)}
          </text>
          {puntos.length > 4 && (
            <text
              x={MARGEN_DIAS.izquierda + anchoUtil / 2}
              y={ALTO_DIAS - 10}
              textAnchor="middle"
              fill="var(--texto-suave)"
              style={estiloEje}
            >
              {formatearFechaCorta(medio.dia)}
            </text>
          )}
          {puntos.length > 1 && (
            <text
              x={ANCHO_DIAS - MARGEN_DIAS.derecha}
              y={ALTO_DIAS - 10}
              textAnchor="end"
              fill="var(--texto-suave)"
              style={estiloEje}
            >
              {formatearFechaCorta(ultimo.dia)}
            </text>
          )}
        </svg>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm" style={{ color: "var(--texto-suave)" }}>
            Ver los datos del gráfico ({formatearNumero(puntos.length)}{" "}
            {puntos.length === 1 ? "día" : "días"})
          </summary>
          <div className="mt-2 max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Consultas por día, con las que quedaron sin resolver</caption>
              <thead>
                <tr style={{ color: "var(--texto-suave)" }}>
                  <th scope="col" className="py-1 text-left font-medium">
                    Día
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Consultas
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Sin resolver
                  </th>
                </tr>
              </thead>
              <tbody>
                {puntos.map((punto) => (
                  <tr key={punto.dia} style={{ borderTop: "1px solid var(--borde)" }}>
                    <th scope="row" className="py-1 text-left font-normal">
                      {formatearFechaCorta(punto.dia)}
                    </th>
                    <td className="py-1 text-right tabular-nums">
                      {formatearNumero(punto.consultas)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatearNumero(punto.sinResolver)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. Las ultimas consultas
// ---------------------------------------------------------------------------

/**
 * El registro crudo, del mas nuevo al mas viejo. Va al final porque es para
 * mirar cuando una fila de arriba llamo la atencion, no para leer todos los
 * dias. Tampoco se filtra por la ventana: son siempre las ultimas.
 */
function Ultimas({ filas, limite }: { filas: FilaConsultaChat[]; limite: number }) {
  return (
    <section className="mt-10" aria-labelledby="titulo-ultimas">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-ultimas" className="text-xl font-bold">
          Las últimas consultas
        </h2>
        <p className="text-sm" style={{ color: "var(--texto-suave)" }}>
          {filas.length === limite
            ? `Las ${formatearNumero(limite)} más recientes.`
            : `${formatearNumero(filas.length)} ${
                filas.length === 1 ? "consulta registrada" : "consultas registradas"
              }.`}{" "}
          <Link href="/admin/consultas" className="underline">
            Ver el listado completo
          </Link>
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--texto-suave)" }}>
          Todavía no hay ninguna consulta registrada.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {filas.map((fila) => (
            <li key={fila.id}>
              <TarjetaConsulta fila={fila} destacada={!fila.resuelta} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
