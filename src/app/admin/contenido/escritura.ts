/**
 * Lo que escriben las acciones de /admin/contenido: textos, preguntas
 * frecuentes y novedades, cada cambio con su fila en `bitacora_sistema` en la
 * MISMA transaccion.
 *
 * Esta separado de acciones.ts por lo mismo que src/app/api/votos/registrar.ts
 * esta separado de su ruta: una server action no se puede llamar sin contexto
 * de request (lee la cookie de sesion con `exigirAdmin`), asi que no se podria
 * probar. Aca no se lee ninguna cookie: la accion resuelve quien es y le pasa la
 * `Autorizacion` ya verificada, y scripts/tests/contenido-escritura.test.ts
 * ejercita todo contra una PGlite con el esquema real, bitacora incluida.
 *
 * NO es "use server" y no se importa desde el navegador: trae la base. Las
 * puertas son las acciones, que empiezan por `exigirAdmin("admin")`.
 *
 * Reglas que valen para todo lo de aca:
 *  - Guardar algo que ya estaba igual no es un cambio: no escribe ni deja fila,
 *    y devuelve `cambio: false` para que la accion no revalide de mas.
 *  - La fila de la bitacora lleva el ANTES y el DESPUES en palabras, recortados
 *    por `filaSistema`: audita que cambio, no guarda versiones.
 *  - Lo que se va a modificar se relee con FOR UPDATE dentro de la transaccion:
 *    el ANTES que queda en la bitacora es el que habia al escribir, no el que
 *    tenia la pantalla de quien apreto el boton.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bitacoraSistema, faq, novedades, textos } from "@/db/schema";
import { formatearNumero } from "@/lib/formato";
import { slugificar } from "@/lib/texto";
import { filaSistema, type Autorizacion, type Transaccion } from "../comun";
import {
  entradaDe,
  largoDe,
  maximoDe,
  MAXIMO_COPETE,
  MAXIMO_CUERPO_NOVEDAD,
  MAXIMO_PREGUNTA,
  MAXIMO_RESPUESTA,
  MAXIMO_TITULO_NOVEDAD,
  normalizarBloque,
  normalizarLinea,
  normalizarValor,
} from "./catalogo";

/**
 * Lo que devuelve cada escritura. `cambio` dice si se toco la base: la accion
 * revalida el sitio solo si es true.
 */
export type Escritura =
  | { ok: true; cambio: boolean; mensaje?: string }
  | { ok: false; error: string };

const SIN_CAMBIOS = (mensaje: string): Escritura => ({ ok: true, cambio: false, mensaje });

function demasiadoLargo(que: string, largo: number, maximo: number): Escritura {
  return {
    ok: false,
    error: `${que} tiene ${formatearNumero(largo)} caracteres y el máximo es ${formatearNumero(maximo)}.`,
  };
}

/** Estado de publicacion en palabras, para la bitacora. */
function estado(publicada: boolean): string {
  return publicada ? "publicada" : "sin publicar";
}

// ---------------------------------------------------------------------------
// Textos del sitio
// ---------------------------------------------------------------------------

/**
 * Guarda un texto de la tabla `textos` (lo que el sitio anterior servia por
 * /api/text sin autenticacion).
 *
 * Se puede escribir una clave que ya este en la base o una que el catalogo
 * conozca aunque todavia no exista (el cuerpo del reglamento y el aviso urgente
 * nacen asi). Una clave inventada no: crearia una fila que ninguna pagina lee.
 *
 * La tabla no tiene historial: despues de escribir, la version vieja no existe
 * mas en ningun lado salvo recortada en la bitacora.
 */
export async function escribirTexto(
  sesion: Autorizacion,
  datos: { clave: string; valor: string },
): Promise<Escritura> {
  const clave = datos.clave.trim();
  if (!clave || clave.length > 100) return { ok: false, error: "Clave inválida." };

  const valor = normalizarValor(clave, datos.valor);
  const maximo = maximoDe(clave);
  if (largoDe(valor) > maximo) return demasiadoLargo("El texto", largoDe(valor), maximo);

  return db.transaction(async (tx): Promise<Escritura> => {
    const [anterior] = await tx
      .select({ valor: textos.valor })
      .from(textos)
      .where(eq(textos.clave, clave))
      .for("update");

    const entrada = entradaDe(clave);
    if (!anterior && !entrada) {
      return { ok: false, error: "Ese texto no existe: ninguna página del sitio lo usa." };
    }
    if (valor === "" && entrada?.obligatorio) {
      return { ok: false, error: `No puede quedar vacío: ${entrada.obligatorio}` };
    }
    if (anterior && anterior.valor === valor) {
      return SIN_CAMBIOS("El texto ya estaba así: no se registró ningún cambio.");
    }
    // Una clave que nunca se guardo, guardada vacia: no hay nada que cambiar.
    // Pasa con "Quitar el aviso" cuando nunca hubo uno.
    if (!anterior && valor === "") {
      return SIN_CAMBIOS("No había nada guardado: no se registró ningún cambio.");
    }

    await tx
      .insert(textos)
      .values({ clave, valor })
      .onConflictDoUpdate({ target: textos.clave, set: { valor, updatedAt: new Date() } });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "texto_guardado",
        entidad: "texto",
        // Un texto se identifica por su clave, no por un id: va en la etiqueta.
        entidadId: null,
        etiqueta: clave,
        antes: anterior ? anterior.valor || "(vacío)" : null,
        despues: valor || "(vacío)",
      }),
    );
    return { ok: true, cambio: true };
  });
}

// ---------------------------------------------------------------------------
// Preguntas frecuentes
//
// Se ven en /acerca-de y el chat las recibe enteras en cada consulta, pero solo
// las publicadas (`getFaq`). Despublicar es la forma de sacar una sin perderla;
// borrar es definitivo.
// ---------------------------------------------------------------------------

function validarFaq(pregunta: string, respuesta: string): string | null {
  if (largoDe(pregunta) < 5) return "Escribí la pregunta (al menos 5 caracteres).";
  if (largoDe(pregunta) > MAXIMO_PREGUNTA) {
    return `La pregunta puede tener hasta ${formatearNumero(MAXIMO_PREGUNTA)} caracteres.`;
  }
  if (largoDe(respuesta) < 10) return "Escribí la respuesta (al menos 10 caracteres).";
  if (largoDe(respuesta) > MAXIMO_RESPUESTA) {
    return `La respuesta tiene ${formatearNumero(largoDe(respuesta))} caracteres y el máximo es ${formatearNumero(MAXIMO_RESPUESTA)}.`;
  }
  return null;
}

/** Como se lee una pregunta en la bitacora. */
function resumenFaq(fila: { pregunta: string; respuesta: string }): string {
  return `${fila.pregunta} — ${fila.respuesta}`;
}

function posicion(indice: number, total: number): string {
  return `Posición ${indice + 1} de ${total}`;
}

/** Todas las preguntas en su orden, bloqueadas: el orden se decide entre todas. */
async function preguntasEnOrden(tx: Transaccion) {
  return tx
    .select({
      id: faq.id,
      orden: faq.orden,
      pregunta: faq.pregunta,
      respuesta: faq.respuesta,
      publicada: faq.publicada,
    })
    .from(faq)
    .orderBy(asc(faq.orden), asc(faq.id))
    .for("update");
}

const FAQ_NO_EXISTE: Escritura = {
  ok: false,
  error: "La pregunta ya no existe: puede que otra persona la haya borrado. Recargá la página.",
};

/** Una pregunta nueva, al final de la lista. */
export async function crearFaq(
  sesion: Autorizacion,
  datos: { pregunta: string; respuesta: string; publicada: boolean },
): Promise<Escritura> {
  const pregunta = normalizarLinea(datos.pregunta);
  const respuesta = normalizarBloque(datos.respuesta);
  const error = validarFaq(pregunta, respuesta);
  if (error) return { ok: false, error };

  return db.transaction(async (tx): Promise<Escritura> => {
    const lista = await preguntasEnOrden(tx);
    const orden = lista.reduce((mayor, fila) => Math.max(mayor, fila.orden), 0) + 1;

    const [creada] = await tx
      .insert(faq)
      .values({ orden, pregunta, respuesta, publicada: datos.publicada })
      .returning({ id: faq.id });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "faq_guardada",
        entidad: "faq",
        entidadId: creada.id,
        etiqueta: pregunta,
        // No hay ANTES: la pregunta no existia.
        despues: `${posicion(lista.length, lista.length + 1)} · ${estado(datos.publicada)} · ${resumenFaq({ pregunta, respuesta })}`,
      }),
    );
    return {
      ok: true,
      cambio: true,
      mensaje: datos.publicada
        ? "Agregada al final y publicada: ya se ve en “Cómo participar” y el chat la usa."
        : "Agregada al final, sin publicar: todavía no la ve nadie.",
    };
  });
}

/** La pregunta y la respuesta. La publicacion y el orden tienen su propia accion. */
export async function editarFaq(
  sesion: Autorizacion,
  datos: { id: number; pregunta: string; respuesta: string },
): Promise<Escritura> {
  const pregunta = normalizarLinea(datos.pregunta);
  const respuesta = normalizarBloque(datos.respuesta);
  const error = validarFaq(pregunta, respuesta);
  if (error) return { ok: false, error };

  return db.transaction(async (tx): Promise<Escritura> => {
    const [actual] = await tx
      .select({ pregunta: faq.pregunta, respuesta: faq.respuesta })
      .from(faq)
      .where(eq(faq.id, datos.id))
      .for("update");
    if (!actual) return FAQ_NO_EXISTE;
    if (actual.pregunta === pregunta && actual.respuesta === respuesta) {
      return SIN_CAMBIOS("La pregunta ya estaba así: no se registró ningún cambio.");
    }

    await tx.update(faq).set({ pregunta, respuesta }).where(eq(faq.id, datos.id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "faq_guardada",
        entidad: "faq",
        entidadId: datos.id,
        etiqueta: pregunta,
        antes: resumenFaq(actual),
        despues: resumenFaq({ pregunta, respuesta }),
      }),
    );
    return { ok: true, cambio: true };
  });
}

/** Publicar o despublicar. Despublicada, no la ven ni /acerca-de ni el chat. */
export async function publicarFaq(
  sesion: Autorizacion,
  datos: { id: number; publicada: boolean },
): Promise<Escritura> {
  return db.transaction(async (tx): Promise<Escritura> => {
    const [actual] = await tx
      .select({ pregunta: faq.pregunta, publicada: faq.publicada })
      .from(faq)
      .where(eq(faq.id, datos.id))
      .for("update");
    if (!actual) return FAQ_NO_EXISTE;
    if (actual.publicada === datos.publicada) {
      return SIN_CAMBIOS(datos.publicada ? "Ya estaba publicada." : "Ya estaba sin publicar.");
    }

    await tx.update(faq).set({ publicada: datos.publicada }).where(eq(faq.id, datos.id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "faq_guardada",
        entidad: "faq",
        entidadId: datos.id,
        etiqueta: actual.pregunta,
        antes: estado(actual.publicada),
        despues: estado(datos.publicada),
      }),
    );
    return { ok: true, cambio: true };
  });
}

/**
 * Sube o baja una pregunta un lugar.
 *
 * No intercambia los dos `orden`: renumera la lista entera de 1 a N. Con dos
 * preguntas en el mismo `orden` (el seed y la carga a mano no lo evitaban) un
 * intercambio de dos numeros iguales no movia nada, y el boton parecia roto.
 */
export async function moverFaq(
  sesion: Autorizacion,
  datos: { id: number; direccion: "arriba" | "abajo" },
): Promise<Escritura> {
  return db.transaction(async (tx): Promise<Escritura> => {
    const lista = await preguntasEnOrden(tx);
    const desde = lista.findIndex((fila) => fila.id === datos.id);
    if (desde === -1) return FAQ_NO_EXISTE;

    const hasta = datos.direccion === "arriba" ? desde - 1 : desde + 1;
    if (hasta < 0) return SIN_CAMBIOS("Ya es la primera.");
    if (hasta >= lista.length) return SIN_CAMBIOS("Ya es la última.");

    const nueva = [...lista];
    const [movida] = nueva.splice(desde, 1);
    nueva.splice(hasta, 0, movida);
    for (const [indice, fila] of nueva.entries()) {
      if (fila.orden !== indice + 1) {
        await tx.update(faq).set({ orden: indice + 1 }).where(eq(faq.id, fila.id));
      }
    }

    // Una sola fila de bitacora: la de la pregunta que se movio. Las demas
    // cambian de numero pero no de lugar entre si, salvo la vecina, que baja o
    // sube un puesto como consecuencia obvia de este mismo cambio.
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "faq_guardada",
        entidad: "faq",
        entidadId: movida.id,
        etiqueta: movida.pregunta,
        antes: posicion(desde, lista.length),
        despues: posicion(hasta, lista.length),
      }),
    );
    return {
      ok: true,
      cambio: true,
      mensaje: `Quedó en la posición ${hasta + 1} de ${lista.length}.`,
    };
  });
}

/**
 * Borra una pregunta. Es definitivo: la fila se va de la tabla. La bitacora
 * guarda como era (recortada), con el DESPUES en null.
 */
export async function borrarFaq(
  sesion: Autorizacion,
  datos: { id: number },
): Promise<Escritura> {
  return db.transaction(async (tx): Promise<Escritura> => {
    const lista = await preguntasEnOrden(tx);
    const indice = lista.findIndex((fila) => fila.id === datos.id);
    if (indice === -1) return FAQ_NO_EXISTE;
    const actual = lista[indice];

    await tx.delete(faq).where(eq(faq.id, datos.id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "faq_borrada",
        entidad: "faq",
        entidadId: datos.id,
        etiqueta: actual.pregunta,
        antes: `${posicion(indice, lista.length)} · ${estado(actual.publicada)} · ${resumenFaq(actual)}`,
        despues: null,
      }),
    );
    return { ok: true, cambio: true };
  });
}

// ---------------------------------------------------------------------------
// Novedades
//
// La portada muestra las ultimas publicadas por fecha (`getNovedades`): la
// fecha, el titulo y el copete. El cuerpo se guarda pero hoy ninguna pagina lo
// muestra, por eso no es obligatorio. No se borran: se despublican (el enum de
// la bitacora no tiene `novedad_borrada`, a proposito).
// ---------------------------------------------------------------------------

type DatosNovedad = { titulo: string; fecha: string; copete: string; cuerpo: string };

function limpiarNovedad(datos: DatosNovedad): DatosNovedad {
  return {
    titulo: normalizarLinea(datos.titulo),
    fecha: datos.fecha.trim(),
    copete: normalizarLinea(datos.copete),
    cuerpo: normalizarBloque(datos.cuerpo),
  };
}

/** "YYYY-MM-DD" que existe en el calendario: el formato solo deja pasar un 31 de febrero. */
export function fechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [anio, mes, dia] = texto.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    anio >= 2000 &&
    anio <= 2100 &&
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function validarNovedad(datos: DatosNovedad): string | null {
  if (largoDe(datos.titulo) < 3) return "Escribí el título (al menos 3 caracteres).";
  if (largoDe(datos.titulo) > MAXIMO_TITULO_NOVEDAD) {
    return `El título puede tener hasta ${formatearNumero(MAXIMO_TITULO_NOVEDAD)} caracteres.`;
  }
  if (!fechaValida(datos.fecha)) return "Elegí una fecha válida.";
  if (largoDe(datos.copete) > MAXIMO_COPETE) {
    return `El copete puede tener hasta ${formatearNumero(MAXIMO_COPETE)} caracteres.`;
  }
  if (largoDe(datos.cuerpo) > MAXIMO_CUERPO_NOVEDAD) {
    return `El cuerpo tiene ${formatearNumero(largoDe(datos.cuerpo))} caracteres y el máximo es ${formatearNumero(MAXIMO_CUERPO_NOVEDAD)}.`;
  }
  return null;
}

/** Como se lee una novedad en la bitacora. */
function resumenNovedad(datos: DatosNovedad): string {
  return `Fecha ${datos.fecha} · ${datos.titulo} · ${datos.copete || datos.cuerpo || "(sin copete)"}`;
}

const NOVEDAD_NO_EXISTE: Escritura = {
  ok: false,
  error: "La novedad ya no existe. Recargá la página.",
};

export async function crearNovedad(
  sesion: Autorizacion,
  entrada: DatosNovedad & { publicada: boolean },
): Promise<Escritura> {
  const datos = limpiarNovedad(entrada);
  const error = validarNovedad(datos);
  if (error) return { ok: false, error };

  // El slug no lo usa ninguna pagina todavia (no hay /novedades/<slug>), pero
  // la columna es unica y obligatoria. El sufijo evita chocar con otra novedad
  // del mismo titulo, y no cambia al editar: si algun dia hay pagina, sus
  // enlaces no se rompen.
  const slug = `${slugificar(datos.titulo)}-${Date.now().toString(36)}`;

  return db.transaction(async (tx): Promise<Escritura> => {
    const [creada] = await tx
      .insert(novedades)
      .values({
        titulo: datos.titulo,
        slug,
        copete: datos.copete || null,
        // La columna es NOT NULL; sin cuerpo se guarda vacio.
        cuerpo: datos.cuerpo,
        fecha: datos.fecha,
        publicada: entrada.publicada,
      })
      .returning({ id: novedades.id });

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "novedad_creada",
        entidad: "novedad",
        entidadId: creada.id,
        etiqueta: datos.titulo,
        // No hay ANTES: la novedad no existia.
        despues: `${estado(entrada.publicada)} · ${resumenNovedad(datos)}`,
      }),
    );
    return {
      ok: true,
      cambio: true,
      mensaje: entrada.publicada
        ? "Publicada. La portada muestra las más recientes por fecha."
        : "Guardada sin publicar: todavía no la ve nadie.",
    };
  });
}

/** Titulo, fecha, copete y cuerpo. La publicacion tiene su propia accion. */
export async function editarNovedad(
  sesion: Autorizacion,
  entrada: DatosNovedad & { id: number },
): Promise<Escritura> {
  const datos = limpiarNovedad(entrada);
  const error = validarNovedad(datos);
  if (error) return { ok: false, error };

  return db.transaction(async (tx): Promise<Escritura> => {
    const [fila] = await tx
      .select({
        titulo: novedades.titulo,
        fecha: novedades.fecha,
        copete: novedades.copete,
        cuerpo: novedades.cuerpo,
      })
      .from(novedades)
      .where(eq(novedades.id, entrada.id))
      .for("update");
    if (!fila) return NOVEDAD_NO_EXISTE;

    const actual: DatosNovedad = { ...fila, copete: fila.copete ?? "" };
    if (
      actual.titulo === datos.titulo &&
      actual.fecha === datos.fecha &&
      actual.copete === datos.copete &&
      actual.cuerpo === datos.cuerpo
    ) {
      return SIN_CAMBIOS("La novedad ya estaba así: no se registró ningún cambio.");
    }

    await tx
      .update(novedades)
      .set({
        titulo: datos.titulo,
        fecha: datos.fecha,
        copete: datos.copete || null,
        cuerpo: datos.cuerpo,
      })
      .where(eq(novedades.id, entrada.id));

    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "novedad_editada",
        entidad: "novedad",
        entidadId: entrada.id,
        etiqueta: datos.titulo,
        antes: resumenNovedad(actual),
        despues: resumenNovedad(datos),
      }),
    );
    return { ok: true, cambio: true };
  });
}

/** Publicar o despublicar. Despublicada, sale de la portada. */
export async function publicarNovedad(
  sesion: Autorizacion,
  datos: { id: number; publicada: boolean },
): Promise<Escritura> {
  return db.transaction(async (tx): Promise<Escritura> => {
    const [actual] = await tx
      .select({ titulo: novedades.titulo, publicada: novedades.publicada })
      .from(novedades)
      .where(eq(novedades.id, datos.id))
      .for("update");
    if (!actual) return NOVEDAD_NO_EXISTE;
    if (actual.publicada === datos.publicada) {
      return SIN_CAMBIOS(datos.publicada ? "Ya estaba publicada." : "Ya estaba sin publicar.");
    }

    await tx
      .update(novedades)
      .set({ publicada: datos.publicada })
      .where(eq(novedades.id, datos.id));
    await tx.insert(bitacoraSistema).values(
      filaSistema({
        sesion,
        accion: "novedad_editada",
        entidad: "novedad",
        entidadId: datos.id,
        etiqueta: actual.titulo,
        antes: estado(actual.publicada),
        despues: estado(datos.publicada),
      }),
    );
    return { ok: true, cambio: true };
  });
}
