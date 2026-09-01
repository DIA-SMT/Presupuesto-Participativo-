"use client";

/**
 * Edicion de los textos del sitio y alta de novedades. Cumple el rol del
 * endpoint /api/text del sitio anterior, pero con autenticacion.
 *
 * La pantalla identificaba cada texto SOLO por su clave tecnica
 * (`home-hero-volanta` en gris chico), asi que para saber que se estaba editando
 * habia que descifrar la clave o guardar y despues ir a mirar el sitio. Ahora
 * cada campo dice en palabras que es y en que pagina se ve, y la clave queda
 * abajo como dato secundario. Los nombres NO son un diccionario clave por clave:
 * se derivan de la forma de la clave (ver `nombreLegible`), asi que una clave
 * nueva se nombra sola.
 */
import { useState, useActionState } from "react";
import { crearNovedad, guardarTexto } from "../acciones";

type Texto = { clave: string; valor: string };

/**
 * En que pagina del sitio se ve cada familia de textos, por el primer segmento
 * de la clave. El orden es el de la lista: la portada primero, porque es la que
 * mas se toca, y lo que aparece en todas las paginas al final.
 *
 * `resto` junta lo que no cae en ningun grupo conocido: una clave nueva no se
 * pierde, aparece al final con su nombre crudo.
 */
const GRUPOS: { prefijo: string; titulo: string; donde: string }[] = [
  { prefijo: "home", titulo: "Portada", donde: "/" },
  { prefijo: "proyectos", titulo: "Proyectos e ideas", donde: "/proyectos" },
  { prefijo: "distritos", titulo: "Distritos", donde: "/distritos" },
  { prefijo: "transparencia", titulo: "Transparencia", donde: "/transparencia" },
  { prefijo: "votacion", titulo: "Votación", donde: "/votar" },
  { prefijo: "ideas", titulo: "Presentar una idea", donde: "/ideas/nueva" },
  { prefijo: "reglamento", titulo: "Reglamento", donde: "/reglamento" },
  { prefijo: "chat", titulo: "Chat de consultas", donde: "el botón “Consultas”" },
  { prefijo: "sitio", titulo: "Todo el sitio", donde: "encabezado y pie de página" },
  { prefijo: "contacto", titulo: "Datos de contacto", donde: "el pie de página" },
];

/** Que ES el texto, por el ultimo segmento de la clave. */
const NOMBRE_SUFIJO: Record<string, string> = {
  titulo: "Título",
  subtitulo: "Subtítulo",
  texto: "Texto",
  volanta: "Volanta",
  boton: "Botón",
  bienvenida: "Mensaje de bienvenida",
  aviso: "Aviso",
  nombre: "Nombre",
  organismo: "Organismo",
  direccion: "Dirección",
  telefono: "Teléfono",
};

/**
 * Donde vive dentro de su pagina, por los segmentos del medio. La preposicion
 * viene armada en el valor para no tener que resolver genero y numero al pegar:
 * "Texto" + "de novedades", "Título" + "del primer bloque".
 */
const NOMBRE_SECCION: Record<string, string> = {
  hero: "del encabezado",
  bloque1: "del primer bloque",
  bloque2: "del segundo bloque",
  bloque3: "del tercer bloque",
  mapa: "del mapa de distritos",
  novedades: "de novedades",
  // "ideas-nueva-titulo": el segmento no agrega nada, ya lo dice el grupo.
  nueva: "",
};

/**
 * El nombre de un texto en castellano, derivado de su clave.
 *
 * Si el sufijo no esta en la tabla se devuelve la clave tal cual: es mejor
 * mostrar `home-bloque4-epigrafe` que inventarle un nombre equivocado a algo que
 * alguien agrego despues de este archivo.
 */
function nombreLegible(clave: string): string {
  const partes = clave.split("-");
  const base = NOMBRE_SUFIJO[partes[partes.length - 1]];
  if (!base) return clave;
  const seccion = partes
    .slice(1, -1)
    .map((parte) => NOMBRE_SECCION[parte])
    .filter(Boolean)
    .join(" ");
  return seccion ? `${base} ${seccion}` : base;
}

/**
 * Orden VISUAL, de arriba abajo, con el que estas dos listas ordenan los campos
 * dentro de cada pagina: primero por la seccion y despues por lo que es el texto
 * dentro de la seccion.
 *
 * Ordenar alfabeticamente por clave dejaba el encabezado de la portada cuarto,
 * abajo de los tres bloques, porque "bloque1" < "hero". Quien viene a cambiar el
 * titulo grande de la portada lo busca primero, no al medio.
 *
 * Lo que no este en la lista va al final de su tramo, no se pierde.
 */
const ORDEN_SECCION = ["hero", "bloque1", "bloque2", "bloque3", "mapa", "novedades"];
const ORDEN_SUFIJO = [
  "volanta",
  "titulo",
  "subtitulo",
  "bienvenida",
  "texto",
  "aviso",
  "boton",
  "nombre",
  "organismo",
  "direccion",
  "telefono",
];

/** Posicion en una lista de orden; lo desconocido va al final. */
function posicion(lista: string[], valor: string): number {
  const indice = lista.indexOf(valor);
  return indice === -1 ? lista.length : indice;
}

/** El texto tal como se lee en su pagina: por seccion y despues por tipo. */
function ordenVisual(a: Texto, b: Texto): number {
  const partesA = a.clave.split("-");
  const partesB = b.clave.split("-");
  const seccion =
    posicion(ORDEN_SECCION, partesA.slice(1, -1).join("-")) -
    posicion(ORDEN_SECCION, partesB.slice(1, -1).join("-"));
  if (seccion !== 0) return seccion;
  const tipo =
    posicion(ORDEN_SUFIJO, partesA[partesA.length - 1]) -
    posicion(ORDEN_SUFIJO, partesB[partesB.length - 1]);
  // A igual seccion y tipo, la clave: el orden tiene que ser estable.
  return tipo !== 0 ? tipo : a.clave.localeCompare(b.clave);
}

/** Agrupa los textos por pagina, respetando el orden de GRUPOS. */
function agrupar(textos: Texto[]): { titulo: string; donde: string; textos: Texto[] }[] {
  const usadas = new Set<string>();
  const grupos = GRUPOS.map((grupo) => {
    const propios = textos
      .filter((texto) => texto.clave.split("-")[0] === grupo.prefijo)
      .sort(ordenVisual);
    propios.forEach((texto) => usadas.add(texto.clave));
    return { titulo: grupo.titulo, donde: grupo.donde, textos: propios };
  }).filter((grupo) => grupo.textos.length > 0);

  const resto = textos.filter((texto) => !usadas.has(texto.clave));
  if (resto.length > 0) {
    grupos.push({ titulo: "Otros textos", donde: "según su clave", textos: resto });
  }
  return grupos;
}

export default function PanelContenido({
  textos,
  soloLectura,
}: {
  textos: Texto[];
  soloLectura: boolean;
}) {
  const [filtro, setFiltro] = useState("");
  const buscado = filtro.trim().toLowerCase();
  const visibles = textos.filter(
    (texto) =>
      !buscado ||
      texto.clave.includes(buscado) ||
      texto.valor.toLowerCase().includes(buscado) ||
      // Tambien por el nombre en castellano: si la pantalla lo llama "Volanta
      // del encabezado", buscar "volanta" tiene que encontrarlo.
      nombreLegible(texto.clave).toLowerCase().includes(buscado),
  );
  const grupos = agrupar(visibles);
  const vacios = textos.filter((texto) => texto.valor.trim() === "").length;

  return (
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      <section>
        <h1 className="text-2xl font-bold">Textos del sitio</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
          Lo que guardás acá se ve en el sitio público al instante, sin publicar nada más.
        </p>

        {/*
          Un texto vacio no se distingue de uno corto: la caja se ve igual. Y hay
          por lo menos uno que el equipo tiene pendiente de cargar (el cuerpo del
          reglamento), asi que la cuenta va arriba.
        */}
        {vacios > 0 && (
          <p className="mt-3 text-sm" style={{ color: "var(--color-acento-700)" }}>
            {vacios === 1
              ? "Hay 1 texto vacío: el sitio no muestra nada en su lugar."
              : `Hay ${vacios} textos vacíos: el sitio no muestra nada en su lugar.`}
          </p>
        )}

        <input
          type="search"
          placeholder="Buscar por nombre, clave o contenido…"
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value)}
          className="mt-4 w-full max-w-sm rounded-xl px-3 py-2.5 text-sm outline-none"
          style={estiloCampo}
        />

        {/*
          Agrupados por la pagina donde se ven. Antes eran 32 cajas seguidas
          ordenadas alfabeticamente por clave, asi que los cuatro textos del
          encabezado de la portada caian salteados entre los de otras paginas.
        */}
        {grupos.length === 0 ? (
          <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
            Ningún texto coincide con “{filtro.trim()}”.
          </p>
        ) : (
          grupos.map((grupo) => (
            <section key={grupo.titulo} className="mt-8">
              <h2 className="text-lg font-bold">{grupo.titulo}</h2>
              <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
                Se ve en {grupo.donde}
              </p>
              <ul className="mt-3 space-y-3">
                {grupo.textos.map((texto) => (
                  <li key={texto.clave}>
                    <FormularioTexto texto={texto} soloLectura={soloLectura} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </section>

      {!soloLectura && (
        <aside className="superficie rounded-2xl p-6">
          <h2 className="text-lg font-bold">Nueva novedad</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-suave)" }}>
            Aparece en la portada, en “Novedades y próximos encuentros”.
          </p>
          <FormularioNovedad />
        </aside>
      )}
    </div>
  );
}

function FormularioTexto({ texto, soloLectura }: { texto: Texto; soloLectura: boolean }) {
  const [estado, accion, pendiente] = useActionState(guardarTexto, null);
  const largo = texto.valor.length > 120;
  const vacio = texto.valor.trim() === "";
  const nombre = nombreLegible(texto.clave);
  // Cuando la clave no se pudo traducir, `nombreLegible` la devuelve tal cual:
  // ahi no se repite abajo.
  const mostrarClave = nombre !== texto.clave;

  return (
    <form action={accion} className="superficie rounded-2xl p-4">
      <input type="hidden" name="clave" value={texto.clave} />
      {/*
        El nombre en castellano es el label del campo, con el peso de un label; la
        clave tecnica baja a dato secundario. Antes la clave era lo unico que
        habia, y en text-xs gris: el identificador del campo era mas chico que su
        contenido.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label className="text-sm font-medium" htmlFor={`texto-${texto.clave}`}>
          {nombre}
          {vacio && (
            <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-acento-700)" }}>
              vacío
            </span>
          )}
        </label>
        <div className="flex items-baseline gap-3">
          {estado && (
            <span
              role="status"
              className="text-xs"
              style={{
                color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)",
              }}
            >
              {estado.ok ? "Guardado." : estado.error}
            </span>
          )}
          {mostrarClave && (
            <code className="text-xs" style={{ color: "var(--texto-suave)" }}>
              {texto.clave}
            </code>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <textarea
          id={`texto-${texto.clave}`}
          name="valor"
          defaultValue={texto.valor}
          rows={largo ? 4 : 1}
          disabled={soloLectura}
          className="flex-1 resize-y rounded-xl px-3 py-2 text-sm"
          style={estiloCampo}
        />
        {!soloLectura && (
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--color-marca-700)" }}
          >
            Guardar
          </button>
        )}
      </div>
    </form>
  );
}

function FormularioNovedad() {
  const [estado, accion, pendiente] = useActionState(crearNovedad, null);

  return (
    <form action={accion} className="mt-4 grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Título</span>
        <input name="titulo" required maxLength={200} style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Fecha</span>
        <input name="fecha" type="date" required style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Copete (opcional)</span>
        <input name="copete" maxLength={300} style={estiloCampo} className="rounded-xl px-3 py-2" />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Cuerpo</span>
        <textarea name="cuerpo" required rows={4} style={estiloCampo} className="resize-y rounded-xl px-3 py-2" />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-acento-600)" }}
        >
          {pendiente ? "Publicando…" : "Publicar novedad"}
        </button>
        {estado && (
          <span
            role="status"
            className="text-sm"
            style={{ color: estado.ok ? "var(--color-cat-ambiental)" : "var(--color-acento-600)" }}
          >
            {estado.ok ? "Publicada." : estado.error}
          </span>
        )}
      </div>
    </form>
  );
}

const estiloCampo: React.CSSProperties = {
  background: "var(--fondo-suave)",
  border: "1px solid var(--borde)",
  color: "var(--texto)",
};
