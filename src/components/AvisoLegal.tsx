import Link from "next/link";
import type { ReactNode } from "react";
import { Pendiente } from "@/components/ui";
import { VERSION_AVISO_LEGAL } from "@/lib/avisos";

/**
 * Aviso legal y condiciones de uso del sitio: el texto, y nada mas que el
 * texto.
 *
 * Se muestra adentro de la ventana modal del pie
 * (src/components/VentanaAvisoLegal.tsx). Fue primero un <details> plegado en
 * el mismo pie, pero desplegado dejaba la pagina cargada; la ventana lo saca
 * del flujo sin darle lo que nunca tuvo ni necesita: una ruta propia que nadie
 * visitaria. Sigue siendo un componente de servidor a proposito: son ~300
 * lineas de texto que no necesitan JavaScript, y viajan como children ya
 * renderizados, no en el bundle del cliente.
 *
 * Las anclas quedan donde estaban, porque el sitio ya enlaza a ellas:
 *
 *  - `#aviso-legal-texto`, el parrafo de apertura.
 *  - `#aviso-ia`, el bloque 6: a donde van los micro-avisos del chat
 *    (src/components/Chat.tsx) y del formulario de ideas
 *    (src/components/FormularioIdea.tsx), que hablan justo de eso.
 *  - `#aviso-legal`, el contenedor, para cualquier enlace viejo.
 *
 * Como ahora viven adentro de un <dialog> cerrado, el navegador no puede
 * scrollear hasta ellas: VentanaAvisoLegal escucha el hash, abre la ventana y
 * scrollea su cuerpo hasta el bloque. Este componente no sabe nada de eso.
 *
 * Los datos del organismo llegan por props y no con una consulta propia: el
 * layout ya trajo la tabla `textos` para el resto del pie. Lo que nadie
 * confirmo todavia NO se inventa, se marca con <Pendiente>, igual que en
 * /privacidad.
 */
export default function AvisoLegal({ textos }: { textos: Record<string, string> }) {
  const organismo = textos["contacto-organismo"] ?? "Municipalidad de San Miguel de Tucumán";
  const direccion = textos["contacto-direccion"];
  const telefono = textos["contacto-telefono"];

  return (
    <div id="aviso-legal" className="space-y-10">
        <p id="aviso-legal-texto" className="text-[0.9375rem] leading-relaxed">
          Este sitio es el canal de información y participación del programa{" "}
          <strong>Presupuesto Participativo</strong> de la {organismo}. Acá te contamos qué valor
          tiene lo que publicamos, de dónde salen los datos, qué hacen y qué no hacen las funciones
          de inteligencia artificial del sitio, y qué te pedimos si presentás una idea o votás.
        </p>

        {/* --- 1. Valor de lo publicado ----------------------------------- */}
        <Bloque titulo="1. Qué valor tiene lo que publicamos acá">
          <p>
            Todo lo que ves en este sitio se publica con fines de{" "}
            <strong>información, transparencia y participación ciudadana</strong>.
          </p>
          <p>
            <strong>No es el Boletín Oficial ni reemplaza a los actos administrativos.</strong> Las
            ordenanzas, resoluciones, pliegos, adjudicaciones y actas de proclamación de resultados
            son los documentos que producen efectos jurídicos. Si algo de este sitio no coincide con
            lo que dice el documento oficial, <strong>vale el documento oficial</strong>.
          </p>
          <p>
            Las reglas del programa —quién puede participar, qué ideas se admiten, cómo se evalúan y
            cómo se vota— están en el{" "}
            <Link href="/reglamento" className="font-semibold underline">
              reglamento
            </Link>
            . Este aviso no las modifica: explica el uso del sitio.
          </p>
        </Bloque>

        {/* --- 2. Exactitud de los datos ---------------------------------- */}
        <Bloque titulo="2. De dónde salen los datos y qué exactitud tienen">
          <p>
            Los datos de ediciones anteriores fueron <strong>migrados</strong> desde la plataforma
            que usó el programa hasta 2025. La migración incluye un proceso de limpieza automática
            (unificación de nombres de barrios, de categorías y de montos) cuyas transformaciones
            quedan registradas proyecto por proyecto y se pueden auditar.
          </p>
          <p>
            Trabajamos para que la información esté completa y al día, pero{" "}
            <strong>puede haber errores, datos faltantes o desfases</strong> entre lo publicado y lo
            que consta en el expediente.
          </p>
          <p>
            Si encontrás un error, avisanos y lo corregimos.{" "}
            <Pendiente>
              dirección de correo o canal oficial donde se reciben los pedidos de corrección de
              datos publicados
            </Pendiente>
          </p>
        </Bloque>

        {/* --- 3. Montos --------------------------------------------------- */}
        <Bloque titulo="3. Los montos son estimativos">
          <p>
            Los presupuestos que figuran en cada proyecto son{" "}
            <strong>estimaciones a precios del momento en que se cargaron</strong>. El costo final
            depende de la disponibilidad presupuestaria, del proceso de contratación y de la
            variación de precios.
          </p>
          <p>
            Que un proyecto resulte ganador de la votación{" "}
            <strong>no constituye por sí solo un compromiso de gasto</strong> ni una obligación de
            contratar: eso ocurre con el acto administrativo correspondiente, dentro del presupuesto
            asignado al programa.
          </p>
        </Bloque>

        {/* --- 4. Avance de obra ------------------------------------------- */}
        <Bloque titulo="4. El avance de las obras es informado, no medido en tiempo real">
          <p>
            El estado y el porcentaje de avance de cada obra los informan las áreas técnicas del
            municipio y se actualizan periódicamente. Puede haber{" "}
            <strong>diferencia entre lo que está pasando en la calle y lo publicado acá</strong>.
          </p>
          <p>
            Las fechas de inicio y de finalización son estimadas y pueden cambiar por clima,
            permisos, interferencias de servicios, disponibilidad de materiales o plazos de los
            proveedores.
          </p>
        </Bloque>

        {/* --- 5. Mapas ----------------------------------------------------- */}
        <Bloque titulo="5. Los mapas son referenciales">
          <p>
            Los mapas del sitio sirven para <strong>orientar</strong>, no para delimitar.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Los límites de los 20 distritos son la <strong>delimitación operativa</strong> del
              programa. <strong>No tienen valor catastral</strong> y no definen dominio,
              jurisdicción, límites de barrio ni ningún derecho.
            </li>
            <li>
              El punto que marca una idea en el mapa es <strong>aproximado</strong>: lo elige quien
              la presenta. La ubicación definitiva de una obra la define el proyecto ejecutivo.
            </li>
            <li>
              La cartografía de base (calles y referencias) proviene de{" "}
              <strong>OpenStreetMap</strong>, una obra colaborativa de sus colaboradores publicada
              bajo licencia ODbL. El municipio no responde por su exactitud ni por su
              disponibilidad.
            </li>
          </ul>
        </Bloque>

        {/* --- 6. IA: el bloque central ------------------------------------ */}
        <Bloque id="aviso-ia" titulo="6. Las funciones de inteligencia artificial del sitio">
          <p>
            El sitio usa modelos de lenguaje en tres lugares. En ninguno de los tres{" "}
            <strong>la inteligencia artificial decide algo</strong> sobre tu propuesta, tu voto o
            vos.
          </p>

          <ol className="grid gap-4">
            <FuncionIA
              titulo="El chat de consultas"
              color="var(--color-marca-600)"
              queHace="Responde preguntas en lenguaje natural consultando los mismos datos publicados que ves en las páginas. No recibe la base entera ni tiene conocimiento propio del programa: si un dato no está cargado, lo dice en lugar de inventarlo."
              limite="Puede equivocarse, resumir mal o quedar desactualizado. Sus respuestas son orientativas: no son una respuesta oficial del municipio, no constituyen notificación, no generan derechos ni obligaciones y no reemplazan un trámite. Antes de tomar una decisión, verificá el dato en la ficha del proyecto o en la página correspondiente."
            />
            <FuncionIA
              titulo="El asistente de carga de ideas"
              color="var(--color-cat-ambiental)"
              queHace="Cuando presentás una idea puede ordenarte lo que escribiste, para que se entienda mejor. En el problema y en la solución no escribe por vos: parte del texto que vos cargaste y solo lo formaliza. En el campo de beneficios, que es opcional, puede redactar un texto deduciéndolo del problema y la solución que vos contaste. También puede avisarte si ya hay una propuesta parecida y señalarte qué le falta a la tuya."
              limite="Nunca completa el formulario solo: el texto aparece aparte y se carga únicamente si apretás «usar este texto», y después lo podés editar. Es una sugerencia y nada más: podés ignorarla, y lo que se envía es siempre lo que vos elegís. No evalúa tu propuesta, no la puntúa y no influye en su suerte."
            />
            <FuncionIA
              titulo="El informe de impacto"
              color="var(--color-cat-urbana)"
              queHace="Un resumen que se genera para el equipo técnico como insumo de trabajo, a partir de los datos de la propuesta."
              limite="No es la evaluación. La evaluación técnica la hace una persona del área que corresponde, queda registrada con su nombre y la fecha, y puede apartarse del informe."
            />
          </ol>

          <p
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{
              background: "color-mix(in srgb, var(--color-marca-600) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-marca-600) 28%, transparent)",
            }}
          >
            Ninguna función de inteligencia artificial admite, rechaza, prioriza ni puntúa una idea,
            ni interviene en el recuento de los votos. No hay decisiones automatizadas sobre las
            personas: cada decisión sobre una propuesta la toma un agente municipal identificado y
            queda asentada con su nombre y la fecha.
          </p>

          <p>
            <strong>Qué sale del sitio.</strong> Para generar estas respuestas, el texto de tu
            consulta o de tu idea se envía a un proveedor externo de modelos de lenguaje. Por eso te
            pedimos que <strong>no escribas datos personales</strong>, tuyos ni de terceros, en el
            chat ni en el texto de la propuesta. El detalle está en la{" "}
            <Link href="/privacidad" className="font-semibold underline">
              política de privacidad
            </Link>
            .
          </p>
          <p style={{ color: "var(--texto-suave)" }}>
            Si el servicio del modelo no está disponible, el chat sigue funcionando con un buscador
            común sobre los mismos datos y las otras dos funciones simplemente no aparecen. Nada del
            sitio depende de la inteligencia artificial para funcionar.
          </p>
        </Bloque>

        {/* --- 7. Contenido de los vecinos --------------------------------- */}
        <Bloque titulo="7. Las ideas publicadas son de quien las presentó">
          <p>
            El contenido de cada propuesta expresa la opinión de la vecina o el vecino que la
            presentó. <strong>No expresa la posición del municipio</strong> ni implica que la
            propuesta haya sido aceptada, evaluada favorablemente o comprometida.
          </p>
          <p>
            Que una idea esté publicada tampoco significa que sea técnica o legalmente factible: eso
            lo determina la evaluación, y su resultado se muestra en la ficha de cada proyecto.
          </p>
        </Bloque>

        {/* --- 8. Condiciones de uso --------------------------------------- */}
        <Bloque titulo="8. Condiciones de uso: qué te pedimos">
          <p>Al presentar una idea, usar el chat o votar, te comprometés a:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Que lo que cargues sea <strong>veraz</strong> y de tu autoría.
            </li>
            <li>
              <strong>No incluir datos personales de terceros</strong> (nombres, teléfonos,
              direcciones, datos de salud) en el texto de la propuesta ni en el chat. Si necesitás
              señalar un caso concreto, describí la situación sin identificar a nadie.
            </li>
            <li>
              No cargar contenido ofensivo, discriminatorio, difamatorio, propaganda partidaria,
              publicidad ni contenido contrario a la ley.
            </li>
            <li>
              No usar el sitio para intentar acceder a datos ajenos, alterar su funcionamiento,
              sobrecargarlo ni automatizar envíos, consultas o votos. La cantidad de envíos por
              conexión está limitada.
            </li>
            <li>
              <strong>Un voto por persona.</strong> Votar más de una vez, o hacerlo en nombre de
              otra persona, invalida el voto y puede dar lugar a las acciones que correspondan.
            </li>
          </ul>

          <p className="pt-2">
            <strong>Qué puede hacer el municipio.</strong> El equipo del programa revisa cada
            propuesta antes de publicarla y puede: pedirte que la corrijas o la completes; corregir
            cuestiones de forma (ortografía, encuadre en una categoría o en un distrito) sin cambiar
            el sentido de lo que escribiste; y no publicar, o dar de baja, lo que incumpla estas
            condiciones o el reglamento. Toda decisión sobre una idea queda registrada, y podés
            verla con tu código de seguimiento en{" "}
            <Link href="/ideas/seguimiento" className="font-semibold underline">
              Seguí tu idea
            </Link>
            .
          </p>
          <p>
            <strong>Qué pasa con lo que cargás.</strong> Al presentar una idea autorizás al
            municipio a publicarla, reproducirla y difundirla en el marco del programa y de su
            comunicación institucional. Seguís siendo su autor o autora.{" "}
            <Pendiente>
              alcance exacto de la licencia de uso del contenido cargado por los vecinos, y si
              corresponde citar el nombre de quien presentó la idea al difundirla
            </Pendiente>
          </p>
        </Bloque>

        {/* --- 9. Disponibilidad -------------------------------------------- */}
        <Bloque titulo="9. Disponibilidad del sitio">
          <p>
            Procuramos que el sitio esté disponible en forma continua, pero el servicio{" "}
            <strong>puede interrumpirse</strong> por mantenimiento, fallas o causas ajenas al
            municipio (proveedores de alojamiento, conectividad, servicios de terceros). Una
            interrupción no genera derecho a indemnización.
          </p>
          <p>
            Los plazos que valen son los del reglamento y los del cronograma de la edición, no la
            disponibilidad del sitio en un momento dado.{" "}
            <Pendiente>
              qué se hace si el sitio no está disponible durante el cierre de una etapa: prórroga
              automática del plazo, vía alternativa presencial, o ambas
            </Pendiente>
          </p>
        </Bloque>

        {/* --- 10. Datos abiertos ------------------------------------------- */}
        <Bloque titulo="10. Reutilización de los datos abiertos">
          <p>
            Los datos publicados en formato abierto (el listado de proyectos en JSON y CSV, y la
            geometría de los distritos en GeoJSON) se pueden descargar y reutilizar libremente,{" "}
            <strong>citando como fuente</strong> al Presupuesto Participativo de la {organismo}.
          </p>
          <p>
            Se entregan <strong>tal como están</strong>, sin garantía de exactitud, de continuidad
            del formato ni de disponibilidad del servicio. Quien los reutilice es responsable del
            uso que les dé y de las conclusiones que saque.
          </p>
          <p>
            <Pendiente>licencia exacta bajo la que se publican los datos abiertos</Pendiente>
          </p>
        </Bloque>

        {/* --- 11. Terceros -------------------------------------------------- */}
        <Bloque titulo="11. Enlaces y servicios de terceros">
          <p>
            El sitio enlaza a páginas que no controla. No respondemos por sus contenidos ni por su
            disponibilidad, y un enlace no implica que compartamos lo que dicen.
          </p>
          <p>
            El funcionamiento del sitio se apoya en servicios de terceros: alojamiento y base de
            datos, cartografía, el proveedor del modelo de lenguaje y el sistema de ciudadanía
            digital que verifica la identidad de quien vota. Cada uno se rige por sus propios
            términos, y su interrupción puede afectar al sitio.
          </p>
        </Bloque>

        {/* --- 12. Propiedad intelectual -------------------------------------- */}
        <Bloque titulo="12. Identidad municipal y propiedad intelectual">
          <p>
            El escudo, los logotipos, el isotipo del programa y la identidad visual del municipio
            son de su titularidad. <strong>Su uso requiere autorización previa</strong>, y no puede
            emplearse de una forma que sugiera un respaldo oficial que no existe.
          </p>
          <p>
            Los textos, las imágenes y el diseño del sitio —salvo el contenido cargado por los
            vecinos y los datos abiertos— no pueden reproducirse con fines comerciales sin
            autorización.
          </p>
        </Bloque>

        {/* --- 13. Datos personales -------------------------------------------- */}
        <Bloque titulo="13. Datos personales">
          <p>
            Qué datos te pedimos, para qué los usamos, quiénes los reciben, cuánto los guardamos y
            cómo pedir verlos, corregirlos o borrarlos está en la{" "}
            <Link href="/privacidad" className="font-semibold underline">
              política de privacidad
            </Link>
            , que es la información previa que exige el artículo 6 de la ley nacional 25.326.
          </p>
        </Bloque>

        {/* --- 14. Cambios y contacto ------------------------------------------ */}
        <Bloque titulo="14. Cambios, versión y contacto">
          <p>
            Este aviso puede modificarse. La versión vigente es siempre la publicada acá, y el
            número de versión cambia cuando cambia el texto.
          </p>
          <p>
            Versión vigente: <strong>{VERSION_AVISO_LEGAL}</strong>.
          </p>
          <p>
            Responsable: <strong>{organismo}</strong>, a través del equipo del programa Presupuesto
            Participativo.
            {direccion && (
              <>
                {" "}
                Domicilio: {direccion}
                {telefono && <> · Teléfono: {telefono}</>}.
              </>
            )}
          </p>
          <p style={{ color: "var(--texto-suave)" }}>
            Los marcadores <strong>PENDIENTE CONFIRMAR</strong> señalan puntos que el municipio
            todavía tiene que precisar. Están a la vista a propósito: preferimos que se vea lo que
            falta antes que publicar un dato inventado.
          </p>
        </Bloque>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Bloque({
  titulo,
  id,
  children,
}: {
  titulo: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id}>
      <h3 className="text-base font-bold">{titulo}</h3>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * Una de las tres funciones de IA, con lo que hace y —sobre todo— lo que no
 * hace. Las dos mitades van siempre juntas: el limite es la parte que descarga
 * responsabilidad, y sola la descripcion suena a promesa.
 */
function FuncionIA({
  titulo,
  color,
  queHace,
  limite,
}: {
  titulo: string;
  color: string;
  queHace: string;
  limite: string;
}) {
  return (
    <li className="superficie rounded-2xl p-5" style={{ borderLeft: `4px solid ${color}` }}>
      <h4 className="text-base font-semibold">{titulo}</h4>
      <p className="mt-2 text-sm leading-relaxed">{queHace}</p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--texto-suave)" }}>
        <strong style={{ color }}>Qué no hace: </strong>
        {limite}
      </p>
    </li>
  );
}

