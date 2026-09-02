import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Pendiente } from "@/components/ui";
import { getTextos, UMBRAL_SUPRESION } from "@/db/queries";
import { VERSION_CONSENTIMIENTO } from "@/lib/avisos";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Qué datos personales pide el sitio del Presupuesto Participativo de San Miguel de Tucumán, para qué se usan, quiénes los reciben, cuánto se conservan y cómo ejercer los derechos de acceso, rectificación y supresión (ley 25.326).",
};

/**
 * Informacion previa del art. 6 de la ley 25.326 (Proteccion de los Datos
 * Personales). Sin este texto el consentimiento del correo no seria valido.
 *
 * Los datos del organismo salen de la tabla `textos` (claves contacto-*). El
 * panel ya no tiene pantalla para editarlos: /admin/contenido se borro al
 * recortar el backoffice, asi que hoy se cambian en la base. Lo que todavia
 * nadie confirmo NO se inventa:
 * se muestra con un marcador PENDIENTE CONFIRMAR bien visible, para que quede a
 * la vista de quien tenga que completarlo antes de publicar la pagina.
 */
export default async function Privacidad() {
  const textos = await getTextos().catch(() => ({}) as Record<string, string>);

  const organismo = textos["contacto-organismo"] ?? "Municipalidad de San Miguel de Tucumán";
  const direccion = textos["contacto-direccion"];
  const telefono = textos["contacto-telefono"];

  return (
    <div className="contenedor py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Política de privacidad</h1>
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--texto-suave)" }}>
          Acá te contamos, en castellano claro, qué datos te pedimos en este sitio, para qué los
          usamos, quiénes los reciben, cuánto tiempo los guardamos y cómo podés pedir verlos,
          corregirlos o borrarlos. Es la información previa que exige el artículo 6 de la ley
          nacional 25.326 de protección de los datos personales.
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--texto-suave)" }}>
          Versión del texto de consentimiento vigente: <strong>{VERSION_CONSENTIMIENTO}</strong>.
        </p>
      </header>

      <div className="mt-10 max-w-3xl space-y-12">
        {/* --- Responsable ------------------------------------------------- */}
        <Bloque titulo="1. Quién es responsable de tus datos">
          <p>
            El responsable del tratamiento es la <strong>{organismo}</strong>, a través del equipo
            del programa Presupuesto Participativo.
          </p>
          {direccion ? (
            <p>
              Domicilio: {direccion}
              {telefono && <> · Teléfono: {telefono}</>}
            </p>
          ) : (
            <p>
              <Pendiente>
                domicilio legal del organismo responsable (calle, número y ciudad)
              </Pendiente>
            </p>
          )}
          <p>
            <Pendiente>
              área u oficina exacta que actúa como responsable del programa, y si el domicilio de
              arriba es también el lugar donde se reciben los pedidos sobre datos personales o es
              otra dependencia
            </Pendiente>
          </p>
          <p>
            <Pendiente>
              número de inscripción de la base de datos en el Registro Nacional de Bases de Datos de
              la Agencia de Acceso a la Información Pública
            </Pendiente>
          </p>
        </Bloque>

        {/* --- Que datos y para que --------------------------------------- */}
        <Bloque titulo="2. Qué datos te pedimos y para qué">
          <p>
            Cada dato se usa solo para la finalidad que figura acá. No hacemos perfiles, no cruzamos
            estos datos con otros registros y no los usamos para publicidad.
          </p>

          <ul className="grid gap-4">
            {DATOS.map((dato) => (
              <li
                key={dato.dato}
                className="superficie rounded-2xl p-5"
                style={{ borderLeft: `4px solid ${dato.color}` }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold">{dato.dato}</h3>
                  <span className="text-xs font-medium" style={{ color: dato.color }}>
                    {dato.caracter}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed">{dato.finalidad}</p>
              </li>
            ))}
          </ul>
        </Bloque>

        {/* --- Caracter facultativo del contacto --------------------------- */}
        <Bloque titulo="3. El correo es facultativo: qué pasa si no lo dejás">
          <p>
            Dejar tu correo es <strong>opcional</strong>. La casilla viene desmarcada y el dato no se
            guarda si no la marcás. <strong>No dejarlo no afecta en nada la evaluación</strong> de tu
            propuesta: tu idea se evalúa con los mismos criterios que todas las demás y puede ser
            votada y ganar igual.
          </p>
          <p>
            Si no dejás el correo, no vas a recibir avisos nuestros. Para eso está el{" "}
            <strong>código de seguimiento</strong> que te damos al enviar la idea: con ese código y
            el número de tu idea entrás a{" "}
            <Link href="/ideas/seguimiento" className="font-semibold underline">
              Seguí tu idea
            </Link>{" "}
            y ves en qué etapa está y la devolución del equipo, cuantas veces quieras.
          </p>
          <p>
            Si dejás el correo y después cambiás de idea, podés pedir que lo borremos y lo borramos:
            la idea sigue su curso sin ningún cambio.
          </p>
          <p>
            Un dato inexacto (por ejemplo un correo mal escrito) solo tiene una consecuencia: no
            podríamos avisarte. Nunca es motivo para descartar una idea.
          </p>
        </Bloque>

        {/* --- Destinatarios ---------------------------------------------- */}
        <Bloque titulo="4. Quiénes reciben tus datos">
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>Áreas técnicas del municipio</strong> que evalúan las ideas y ejecutan las
              obras, y el equipo del programa que usa el panel de administración. Cada persona del
              equipo entra con su propia cuenta y cada cambio de estado queda registrado con nombre y
              fecha.
            </li>
            <li>
              <strong>Proveedor de base de datos y de hosting del sitio</strong>: la base y el sitio
              están alojados en servicios de terceros (Supabase y Vercel) cuyos servidores están{" "}
              <strong>fuera de la Argentina</strong>. Esto implica una transferencia internacional de
              datos.{" "}
              <Pendiente>
                región y país exactos donde queda alojada la base, y revisión legal de la
                transferencia internacional según el artículo 12 de la ley 25.326
              </Pendiente>
            </li>
            <li>
              <strong>OpenRouter</strong>, el servicio por el que pasan las funciones de
              inteligencia artificial del sitio. OpenRouter no ejecuta el modelo: enruta cada
              consulta al proveedor del modelo elegido (hoy Anthropic), que también está fuera de
              la Argentina. Recibe tres cosas y ninguna otra:
              <ul className="mt-2 space-y-1 pl-5">
                <li className="list-disc">
                  el texto de la pregunta que escribís en el chat del sitio;
                </li>
                <li className="list-disc">
                  el texto de tu propuesta, si pedís que la revisemos antes de enviarla (título,
                  barrio, problema, solución y beneficios). <strong>Nunca tu nombre ni tu
                  correo</strong>: esos datos no salen de la base del municipio;
                </li>
                <li className="list-disc">
                  el texto de una propuesta ya presentada, cuando el equipo pide un informe interno
                  para evaluarla. También sin datos de quien la presentó.
                </li>
              </ul>
              <p className="mt-2">
                Por eso te pedimos que no escribas datos personales dentro del texto del chat ni de
                la propuesta: no hacen falta y viajan a un tercero.
              </p>
            </li>
            <li>
              <strong>Ciudadanía digital de Tucumán (CIDITUC)</strong>, para verificar la identidad
              de quien vota. La verificación la hace ese sistema; el sitio solo recibe la
              confirmación y los datos mínimos del padrón.
            </li>
          </ul>
          <p>
            Fuera de estos casos, no cedemos ni vendemos datos a nadie. Lo único que se publica en el
            sitio es el contenido de las ideas y los resultados de la votación, nunca los datos de
            contacto de quien las presentó.
          </p>
        </Bloque>

        {/* --- Conservacion ----------------------------------------------- */}
        <Bloque titulo="5. Cuánto tiempo los guardamos">
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>El contenido de las ideas y los resultados</strong> se conservan como archivo
              histórico del programa: son información pública de la gestión municipal y quedan
              publicados en el sitio y en el archivo de ediciones.
            </li>
            <li>
              <strong>Tu correo</strong> se guarda mientras dura la edición en la que presentaste la
              idea y se borra al cerrarla, porque después ya no hay nada que avisarte. También lo
              borramos antes si nos lo pedís.
            </li>
            <li>
              <strong>El padrón de votantes</strong> (documento hasheado, nombre y distrito) se
              conserva para poder auditar el resultado de la edición.
            </li>
            <li>
              <strong>Los registros técnicos</strong> de límite de uso por conexión se reinician
              solos en ventanas de minutos u horas.
            </li>
            <li>
              <strong>Las consultas a las funciones de inteligencia artificial</strong> (el chat, la
              revisión de una propuesta y los informes internos del equipo) se guardan sin datos
              personales, para saber qué pregunta la gente, mejorar las respuestas y controlar
              cuánto cuesta el servicio.{" "}
              <Pendiente>plazo de conservación de las consultas</Pendiente>
            </li>
          </ul>
        </Bloque>

        {/* --- Derechos --------------------------------------------------- */}
        <Bloque titulo="6. Tus derechos y cómo ejercerlos">
          <p>
            Podés pedirnos, de forma gratuita y sin explicar por qué:{" "}
            <strong>acceso</strong> (que te digamos qué datos tuyos tenemos),{" "}
            <strong>rectificación</strong> y <strong>actualización</strong> (que corrijamos lo que
            está mal) y <strong>supresión</strong> (que borremos tus datos, como el correo).
          </p>
          <p>
            La ley 25.326 nos da hasta <strong>10 días corridos</strong> para contestar un pedido de
            acceso (art. 14) y hasta <strong>5 días hábiles</strong> para rectificar, actualizar o
            suprimir un dato (art. 16). El acceso es gratuito a intervalos de seis meses, salvo que
            demuestres un interés legítimo antes.
          </p>
          <p>
            <Pendiente>
              canal oficial para presentar estos pedidos: dirección de correo electrónico y/o mesa de
              entradas con domicilio y horario de atención
            </Pendiente>
          </p>
          {(direccion || telefono) && (
            <p style={{ color: "var(--texto-suave)" }}>
              Mientras se confirme ese canal, podés consultar por el programa en{" "}
              {direccion && <>{direccion}</>}
              {direccion && telefono && " · "}
              {telefono}.
            </p>
          )}
          <p>
            La autoridad de control de la ley 25.326 es la{" "}
            <strong>Agencia de Acceso a la Información Pública</strong>: podés hacerle un reclamo si
            considerás que no atendimos bien tu pedido.
          </p>
        </Bloque>

        {/* --- Cuidados tecnicos ------------------------------------------ */}
        <Bloque titulo="7. Qué hacemos para cuidarlos">
          <ul className="list-disc space-y-3 pl-5">
            <li>
              El <strong>documento (DNI) de quien vota no se guarda nunca en claro</strong>: se
              guarda una huella criptográfica que no permite reconstruirlo. Lo mismo con la dirección
              IP de las visitas.
            </li>
            <li>
              Los <strong>datos de contacto no salen en ningún listado</strong>: ni en el sitio, ni en
              el panel del equipo, ni en el chat. El panel solo indica si una idea tiene contacto
              cargado o no.
            </li>
            <li>
              En las estadísticas de participación, las celdas con menos de{" "}
              <strong>{UMBRAL_SUPRESION}</strong> personas se muestran como “—” en lugar del número:
              con grupos tan chicos, un dato agregado puede terminar señalando a una persona.
            </li>
            <li>
              El sitio usa únicamente <strong>cookies propias y necesarias</strong> para mantener la
              sesión de quien vota (4 horas) y la del equipo municipal (12 horas). No hay cookies de
              publicidad ni de analítica de terceros. Las tipografías se cargan desde Google Fonts,
              lo que implica una conexión de tu navegador a un servidor de Google.
            </li>
          </ul>
        </Bloque>

        {/* --- Cambios ---------------------------------------------------- */}
        <Bloque titulo="8. Cambios en esta política">
          <p>
            Si cambiamos la finalidad de algún dato, cambiamos también la versión del texto de
            consentimiento. Los correos que se dejaron con una versión anterior no se usan bajo un
            texto nuevo: quedan bajo el que aceptaste, y para cualquier uso distinto te lo volvemos a
            pedir.
          </p>
          <p style={{ color: "var(--texto-suave)" }}>
            Los marcadores <strong>PENDIENTE CONFIRMAR</strong> de esta página señalan datos que el
            municipio todavía tiene que precisar. Están a la vista a propósito: preferimos que se vea
            lo que falta antes que publicar un dato inventado.
          </p>
        </Bloque>
      </div>
    </div>
  );
}

/**
 * Inventario de datos. El campo `caracter` es lo que exige el art. 6 inc. c de
 * la ley: si el dato es obligatorio o facultativo.
 */
const DATOS: Array<{ dato: string; caracter: string; finalidad: string; color: string }> = [
  {
    dato: "El contenido de tu idea",
    caracter: "Obligatorio",
    color: "var(--color-marca-600)",
    finalidad:
      "Título, categoría, barrio, problema, solución, beneficios y el punto que marcás en el mapa. Se usan para evaluar técnicamente la propuesta, asignarla a un distrito y publicarla en el sitio para que se pueda votar. Este contenido es público.",
  },
  {
    dato: "Tu nombre",
    caracter: "Facultativo",
    color: "var(--color-cat-ambiental)",
    finalidad:
      "Solo para que el equipo pueda identificar quién presentó la propuesta si necesita entenderla mejor. No se publica en el sitio.",
  },
  {
    dato: "Tu correo electrónico",
    caracter: "Facultativo, con tu consentimiento",
    color: "var(--color-acento-600)",
    finalidad:
      "Lo usamos solo para contarte cómo sigue tu idea. No se publica, no se comparte y no se usa para ninguna otra comunicación. Se guarda únicamente si marcás la casilla del formulario.",
  },
  {
    dato: "Tu documento, nombre y distrito, al empadronarte para votar",
    caracter: "Obligatorio para poder votar",
    color: "var(--color-estado-factible)",
    finalidad:
      "Sirven para verificar que sos vecino o vecina de la ciudad y garantizar un voto por persona en su distrito. El documento se guarda hasheado (no en claro); del número solo conservamos los últimos tres dígitos, para que la mesa de ayuda pueda identificarte si tenés un problema.",
  },
  {
    dato: "Tu voto",
    caracter: "Obligatorio para poder votar",
    color: "var(--color-estado-ganador)",
    finalidad:
      "Al votar se registra el proyecto elegido junto con tu registro del padrón: es lo que permite garantizar un voto por persona y auditar el recuento. Los resultados se publican solo agregados (por proyecto y por distrito), nunca persona por persona.",
  },
  {
    dato: "Tu dirección IP",
    caracter: "Se registra de forma automática",
    color: "var(--color-estado-nofactible)",
    finalidad:
      "Se guarda hasheada (no en claro) para limitar la cantidad de envíos, votos y consultas por conexión, y así evitar cargas automatizadas y abuso.",
  },
  {
    dato: "Lo que escribís en el chat del sitio",
    caracter: "Facultativo",
    color: "var(--color-cat-urbana)",
    finalidad:
      "La pregunta y la respuesta se guardan para saber qué consulta la gente y mejorar la información del sitio. La pregunta viaja a OpenRouter para poder responderte. No pidas ni escribas datos personales en el chat: no hace falta para usarlo.",
  },
  {
    dato: "El texto de tu propuesta, si pedís que la revisemos",
    caracter: "Facultativo",
    color: "var(--color-cat-urbana)",
    finalidad:
      "Cuando apretás “Revisar mi idea”, el texto de la propuesta (sin tu nombre ni tu correo) viaja a OpenRouter para señalarte qué le falta y ofrecerte una versión mejor escrita. Podés enviar tu idea sin pedir la revisión: el botón “Enviar sin revisar” está siempre disponible.",
  },
];

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{titulo}</h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed">{children}</div>
    </section>
  );
}
