"use client";

/**
 * Solapa "Textos del sitio": todas las claves de la tabla `textos`, agrupadas
 * por la pagina en la que se ven, cada una editable.
 *
 * Cada campo dice en palabras que es y donde se ve; la clave tecnica queda como
 * dato secundario. La pagina y el nombre salen del catalogo (catalogo.ts), que
 * una prueba mantiene al dia con el codigo, y no de adivinar por el prefijo de
 * la clave: asi se sabe cuales NO se ven en ningun lado, que van al final y
 * plegados.
 *
 * El reglamento y el aviso urgente son textos de la misma tabla pero tienen su
 * solapa: uno es un texto largo con vista previa y el otro sale en todas las
 * paginas.
 */
import { useActionState, useState } from "react";
import { normalizar } from "@/lib/texto";
import { guardarTexto } from "./acciones";
import {
  avisosDeFormato,
  formatoDe,
  GRUPOS,
  largoDe,
  maximoDe,
  normalizarValor,
  tipoDe,
  type GrupoTexto,
  type TextoDelPanel,
} from "./catalogo";
import {
  AvisosFormato,
  claseBotonPrincipal,
  Contador,
  estiloBotonPrincipal,
  estiloCampo,
  Marca,
  MensajeAccion,
} from "./comunes";

type Grupo = { grupo: GrupoTexto; textos: TextoDelPanel[] };

export default function SeccionTextos({ grupos }: { grupos: Grupo[] }) {
  const [filtro, setFiltro] = useState("");
  const buscado = normalizar(filtro);

  const propios = grupos.filter((grupo) => grupo.grupo !== "reglamento" && grupo.grupo !== "aviso");
  const visibles = propios
    .map((grupo) => ({ ...grupo, textos: grupo.textos.filter((texto) => coincide(texto, buscado)) }))
    .filter((grupo) => grupo.textos.length > 0);

  const enUso = propios.filter((grupo) => grupo.grupo !== "sin-uso").flatMap((grupo) => grupo.textos);
  const vacios = enUso.filter((texto) => texto.existe && texto.valor === "").length;
  const sinCargar = enUso.filter((texto) => !texto.existe).length;

  return (
    <section aria-labelledby="titulo-textos">
      <h2 id="titulo-textos" className="text-xl font-bold">
        Textos del sitio
      </h2>
      <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--texto-suave)" }}>
        Lo que guardás acá se ve en el sitio público al instante, sin publicar nada más. El
        reglamento y el aviso urgente tienen su propia solapa.
      </p>

      {/*
        Un texto vacio no se distingue de uno corto: la caja se ve igual. Y la
        pagina no cae en el texto del codigo: guardado vacio, no muestra nada.
      */}
      {(vacios > 0 || sinCargar > 0) && (
        <p className="mt-3 text-sm" style={{ color: "var(--acento-texto)" }}>
          {[
            vacios === 1
              ? "Hay 1 texto vacío: la página no muestra nada en su lugar."
              : vacios > 1
                ? `Hay ${vacios} textos vacíos: las páginas no muestran nada en su lugar.`
                : null,
            sinCargar === 1
              ? "Hay 1 texto que la página lee y nunca se cargó: muestra lo que trae el código."
              : sinCargar > 1
                ? `Hay ${sinCargar} textos que las páginas leen y nunca se cargaron: muestran lo que trae el código.`
                : null,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}

      <label className="mt-4 block max-w-sm text-sm">
        <span className="sr-only">Buscar un texto</span>
        <input
          type="search"
          placeholder="Buscar por nombre, clave o contenido…"
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm"
          style={estiloCampo}
        />
      </label>

      {visibles.length === 0 ? (
        <p className="mt-6 text-sm" style={{ color: "var(--texto-suave)" }}>
          Ningún texto coincide con “{filtro.trim()}”.
        </p>
      ) : (
        visibles.map((grupo) =>
          grupo.grupo === "sin-uso" ? (
            <GrupoSinUso key={grupo.grupo} textos={grupo.textos} abierto={buscado !== ""} />
          ) : (
            <GrupoDeTextos key={grupo.grupo} grupo={grupo} />
          ),
        )
      )}
    </section>
  );
}

/** Busca sin distinguir mayusculas ni tildes, por nombre, clave o contenido. */
function coincide(texto: TextoDelPanel, buscado: string): boolean {
  if (!buscado) return true;
  return [texto.clave, texto.valor, texto.entrada?.nombre ?? ""].some((campo) =>
    normalizar(campo).includes(buscado),
  );
}

function GrupoDeTextos({ grupo }: { grupo: Grupo }) {
  const { titulo, donde, ruta } = GRUPOS[grupo.grupo];
  const idTitulo = `grupo-${grupo.grupo}`;
  return (
    <section className="mt-8" aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className="text-lg font-bold">
        {titulo}
      </h3>
      <p className="mt-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
        Se ve en {donde}
        {ruta && (
          <>
            {" · "}
            <a href={ruta} target="_blank" rel="noopener" className="underline">
              abrir {ruta}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </>
        )}
      </p>
      <ul className="mt-3 space-y-3">
        {grupo.textos.map((texto) => (
          <li key={texto.clave}>
            <FormularioTexto texto={texto} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Los textos que estan en la base y ninguna pagina lee. Van plegados: se
 * pueden editar, pero editarlos no cambia nada del sitio, y abiertos ocupaban
 * lo mismo que los que si importan. Se abren solos si una busqueda los
 * encuentra.
 */
function GrupoSinUso({ textos, abierto }: { textos: TextoDelPanel[]; abierto: boolean }) {
  return (
    <details className="mt-10" open={abierto}>
      <summary className="cursor-pointer text-lg font-bold">
        {GRUPOS["sin-uso"].titulo} ({textos.length})
      </summary>
      <p className="mt-1 max-w-3xl text-xs" style={{ color: "var(--texto-suave)" }}>
        Están en la base pero ningún archivo del sitio los lee: cambiarlos no cambia nada de lo que
        ve el vecino. Quedaron de la carga inicial. Cada uno dice dónde está hoy el texto que sí se
        ve.
      </p>
      <ul className="mt-3 space-y-3">
        {textos.map((texto) => (
          <li key={texto.clave}>
            <FormularioTexto texto={texto} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Un texto editable. Lo usan tambien la solapa del reglamento (para el aviso
 * que se ve mientras no hay reglamento).
 *
 * El campo es controlado, como los de la bandeja: un formulario con action se
 * resetea solo despues de cada envio, y con un campo no controlado un error (la
 * sesion vencida, un texto de mas) borraba lo que la persona habia escrito.
 */
export function FormularioTexto({
  texto,
  exito,
}: {
  texto: TextoDelPanel;
  /** El mensaje al guardar, cuando "ya se ve en el sitio" no es cierto. */
  exito?: string;
}) {
  const [estado, accion, pendiente] = useActionState(guardarTexto, null);
  const [borrador, setBorrador] = useState(texto.valor);

  // Si lo guardado cambia (lo guardo esta persona, o alguien mas desde otra
  // pantalla) y aca no habia nada sin guardar, el campo acompaña. Si habia
  // cambios sin guardar, se respetan: pisarlos seria perder trabajo. Es el
  // patron de React para ajustar estado cuando cambia una prop, sin efecto.
  const [base, setBase] = useState(texto.valor);
  if (texto.valor !== base) {
    if (normalizarValor(texto.clave, borrador) === base) setBorrador(texto.valor);
    setBase(texto.valor);
  }

  const tipo = tipoDe(texto.clave);
  const maximo = maximoDe(texto.clave);
  const normalizado = normalizarValor(texto.clave, borrador);
  const largo = largoDe(normalizado);
  const sucio = normalizado !== texto.valor;
  const avisos = avisosDeFormato(normalizado, formatoDe(texto.clave), tipo);
  // Vacio y obligatorio: la accion lo rechaza igual, pero aca ya se dice por que.
  const faltaObligatorio = normalizado === "" && Boolean(texto.entrada?.obligatorio);
  const notaVacio = faltaObligatorio
    ? `No puede quedar vacío: ${texto.entrada?.obligatorio}`
    : texto.existe && sucio && normalizado === ""
      ? "Si lo guardás vacío, la página no muestra nada en su lugar: no vuelve al texto que trae el código."
      : null;

  // Las claves del catalogo son slugs, pero una fila vieja de la base puede
  // traer cualquier cosa, y un espacio en el id rompe aria-describedby.
  const id = `texto-${texto.clave.replace(/[^a-z0-9-]/gi, "_")}`;
  const nombre = texto.entrada?.nombre ?? texto.clave;
  const ayuda = [texto.entrada?.donde, texto.entrada?.nota, texto.descripcion].filter(
    (linea): linea is string => Boolean(linea),
  );
  const describe = [
    ayuda.length ? `${id}-ayuda` : null,
    avisos.length ? `${id}-avisos` : null,
    notaVacio ? `${id}-vacio` : null,
    `${id}-contador`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form action={accion} className="superficie rounded-2xl p-4">
      <input type="hidden" name="clave" value={texto.clave} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-semibold">
          {nombre}
        </label>
        <span className="flex flex-wrap items-center gap-2">
          {!texto.existe && <Marca tono="atencion">nunca se cargó</Marca>}
          {texto.existe && texto.valor === "" && <Marca tono="atencion">vacío</Marca>}
          {sucio && <Marca>cambios sin guardar</Marca>}
          {/* La clave no se repite si ya es el nombre (una clave que el catalogo no conoce). */}
          {texto.entrada && (
            <code className="text-xs" style={{ color: "var(--texto-suave)" }}>
              {texto.clave}
            </code>
          )}
        </span>
      </div>

      {ayuda.length > 0 && (
        <div id={`${id}-ayuda`} className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--texto-suave)" }}>
          {ayuda.map((linea) => (
            <p key={linea}>{linea}</p>
          ))}
        </div>
      )}

      {tipo === "linea" ? (
        <input
          id={id}
          name="valor"
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          aria-describedby={describe}
          className="mt-2 w-full rounded-xl px-3 py-2 text-sm"
          style={estiloCampo}
        />
      ) : (
        <textarea
          id={id}
          name="valor"
          value={borrador}
          onChange={(evento) => setBorrador(evento.target.value)}
          rows={tipo === "largo" ? 16 : 3}
          aria-describedby={describe}
          className="mt-2 w-full resize-y rounded-xl px-3 py-2 text-sm leading-relaxed"
          style={estiloCampo}
        />
      )}

      <AvisosFormato id={`${id}-avisos`} avisos={avisos} />

      {!texto.existe && (
        <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
          Nunca se cargó: hoy la página muestra lo que trae escrito el código, o nada. Al guardarlo
          queda cargado y manda lo de acá.
        </p>
      )}
      {notaVacio && (
        <p id={`${id}-vacio`} className="mt-2 text-xs" style={{ color: "var(--acento-texto)" }}>
          {notaVacio}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="submit"
          disabled={pendiente || largo > maximo || faltaObligatorio}
          className={claseBotonPrincipal}
          style={estiloBotonPrincipal}
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {sucio && (
          <button type="button" onClick={() => setBorrador(texto.valor)} className="text-sm underline">
            Descartar cambios
          </button>
        )}
        <Contador id={`${id}-contador`} largo={largo} maximo={maximo} />
        <MensajeAccion
          resultado={estado}
          exito={
            exito ??
            (texto.entrada?.archivos.length
              ? "Guardado: ya se ve en el sitio."
              : "Guardado. Ninguna página muestra este texto.")
          }
        />
      </div>
      {texto.actualizado && (
        <p className="mt-2 text-xs" style={{ color: "var(--texto-suave)" }}>
          Guardado por última vez el {texto.actualizado}.
        </p>
      )}
    </form>
  );
}
