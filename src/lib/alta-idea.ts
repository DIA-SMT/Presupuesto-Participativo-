/**
 * El alta de una idea, compartida por las dos puertas que la crean:
 *
 *  - el formulario publico (POST /api/ideas), que carga el vecino;
 *  - la carga del equipo desde el panel (/admin/ideas/nueva), para lo que llega
 *    de una asamblea, por mail o en papel a la oficina.
 *
 * Lo que cada puerta valida por su lado (el origen del pedido, los topes, el
 * esquema, quien puede cargar en que etapa) queda en su puerta. Aca vive lo que
 * tiene que ser identico en las dos, porque si divergen el sitio tiene dos
 * clases de ideas: como se deriva el distrito del punto, como se normalizan el
 * titulo, el barrio y los textos, y como se asignan el numero y el slug.
 *
 * El numero y el slug se calculan ADENTRO de una transaccion que bloquea la
 * fila de la edicion (FOR NO KEY UPDATE). Antes se calculaban con un
 * max(numero)+1 suelto: dos altas a la vez obtenian el mismo numero, la segunda
 * chocaba con el indice unico `ideas_edicion_numero_idx` y el vecino recibia
 * "No se pudo guardar la idea". Con la carga del panel eso deja de ser teorico:
 * dos personas cargando la tanda de una asamblea se pisan en cada idea. Con el
 * bloqueo, las altas de una misma edicion hacen fila y cada una ve el numero de
 * la anterior ya confirmado.
 *
 * Por que ese bloqueo y no otro:
 *  - NO KEY UPDATE choca consigo mismo (las altas hacen fila entre ellas), con
 *    el FOR UPDATE de `cambiarEtapa` (la etapa no cambia en medio de un alta, y
 *    el alta la relee adentro) y con el FOR SHARE de las acciones sobre ideas
 *    y de los votos (esperas de milisegundos: ninguna retiene la fila).
 *  - NO choca con el FOR KEY SHARE que toma la clave foranea de un voto o de
 *    la propia idea al insertarse: un FOR UPDATE si, y hubiera trabado cada voto
 *    detras de cada alta.
 * Es el primer bloqueo que toma la transaccion, asi que no puede formar un
 * ciclo de esperas con las acciones del panel, que bloquean primero la edicion
 * y despues la idea.
 */
import { and, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, ediciones, ideas } from "@/db/schema";
import type { CanalCarga, EtapaEdicion } from "@/db/queries";
import { distritoDePunto } from "@/lib/geo-servidor";
import {
  normalizar,
  normalizarBarrio,
  normalizarParrafo,
  normalizarTitulo,
  slugificar,
} from "@/lib/texto";

/** La transaccion de drizzle, para lo que quien llama escribe adentro. */
export type TransaccionAlta = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DatosIdeaNueva = {
  edicionId: number;
  titulo: string;
  /** Slug de la categoria, como lo manda el formulario. */
  categoria: string;
  barrio?: string | null;
  problema: string;
  solucion: string;
  beneficios?: string | null;
  lat: number;
  lon: number;
  /** true cuando quien carga no sabe el lugar exacto (un papel sin direccion). */
  ubicacionAproximada?: boolean;
  canal: CanalCarga;
  /** De donde vino, cuando no fue la web. No es publico. */
  canalDetalle?: string | null;
  autorNombre?: string | null;
  /**
   * El correo del autor, SOLO con consentimiento (la casilla de avisos del
   * formulario publico). La carga del panel no lo pide nunca.
   */
  contacto?: { email: string; version: string } | null;
  /** Quien la cargo en el backoffice. */
  cargadoPor?: string | null;
  /** Dia de presentacion, AAAA-MM-DD. */
  fecha: string;
};

export type RechazoAlta = {
  ok: false;
  /**
   * Por que no se creo, para que cada puerta responda a su manera: la API
   * publica con un codigo HTTP, el panel con un mensaje en la pantalla.
   */
  motivo: "fuera-del-ejido" | "categoria" | "edicion" | "etapa";
  mensaje: string;
};

export type IdeaCreada = {
  ok: true;
  id: number;
  numero: number;
  /** Numero de distrito, derivado del punto. */
  distrito: number;
  slug: string;
  /** El titulo y el barrio tal como quedaron guardados, ya normalizados. */
  titulo: string;
  barrio: string | null;
  problema: string | null;
  solucion: string | null;
  beneficios: string | null;
};

export type OpcionesAlta = {
  /**
   * Si la etapa deja crear la idea. Se llama ADENTRO de la transaccion, con la
   * etapa releida de la base y la fila de la edicion bloqueada: devuelve el
   * motivo del rechazo (que se muestra tal cual) o null si deja. Cada puerta
   * tiene su regla: el formulario publico, la de la etapa "ideas"; el panel,
   * `puedeCargarIdea` de src/lib/etapas.ts.
   */
  etapaPermitida: (edicion: { etapa: EtapaEdicion }) => string | null;
  /**
   * Lo que tiene que quedar escrito en la MISMA transaccion que la idea (la
   * fila de `revisiones` del alta del panel). Si falla, la idea tampoco queda.
   */
  enLaMismaTransaccion?: (
    tx: TransaccionAlta,
    idea: { id: number; numero: number },
  ) => Promise<void>;
};

/**
 * Crea la idea: `pendiente` y sin publicar, como toda idea nueva. Se publica
 * cuando el equipo la revisa, sea cual sea la puerta por la que entro.
 */
export async function crearIdea(
  datos: DatosIdeaNueva,
  opciones: OpcionesAlta,
): Promise<IdeaCreada | RechazoAlta> {
  // El distrito no lo elige nadie: sale del punto, por point-in-polygon contra
  // la geometria oficial (src/lib/geo.ts).
  const distrito = distritoDePunto({ lat: datos.lat, lon: datos.lon });
  if (!distrito) {
    return {
      ok: false,
      motivo: "fuera-del-ejido",
      mensaje: "El punto marcado queda fuera de los 20 distritos de la ciudad.",
    };
  }

  const [categoria] = await db
    .select({ id: categorias.id })
    .from(categorias)
    .where(eq(categorias.slug, datos.categoria))
    .limit(1);
  if (!categoria) {
    return { ok: false, motivo: "categoria", mensaje: "Categoría desconocida." };
  }

  const titulo = normalizarTitulo(datos.titulo);
  const base = slugificar(titulo);
  const barrio = normalizarBarrio(datos.barrio);
  const problema = normalizarParrafo(datos.problema);
  const solucion = normalizarParrafo(datos.solucion);
  const beneficios = normalizarParrafo(datos.beneficios);

  return db.transaction(async (tx): Promise<IdeaCreada | RechazoAlta> => {
    const [edicion] = await tx
      .select({ etapa: ediciones.etapa, activa: ediciones.activa })
      .from(ediciones)
      .where(eq(ediciones.id, datos.edicionId))
      .for("no key update", { of: ediciones });
    // Una idea nueva entra siempre en la edicion activa, por cualquiera de las
    // dos puertas. Si dejo de serlo entre la lectura de quien llama y esta
    // transaccion (alguien activo otra), no se crea en la que se esta cerrando.
    if (!edicion || !edicion.activa) {
      return {
        ok: false,
        motivo: "edicion",
        mensaje: "La edición dejó de ser la activa mientras se cargaba la idea.",
      };
    }
    const motivo = opciones.etapaPermitida(edicion);
    if (motivo) return { ok: false, motivo: "etapa", mensaje: motivo };

    // Numero identificador correlativo dentro de la edicion. Con la fila de la
    // edicion bloqueada, ninguna otra alta puede estar calculando el mismo.
    const [ultimo] = await tx
      .select({ siguiente: sql<number>`coalesce(max(${ideas.numero}), 0) + 1` })
      .from(ideas)
      .where(eq(ideas.edicionId, datos.edicionId));
    const numero = Number(ultimo?.siguiente ?? 1);

    const slug = await slugLibre(tx, datos.edicionId, base);

    const [creada] = await tx
      .insert(ideas)
      .values({
        edicionId: datos.edicionId,
        distritoId: distrito,
        categoriaId: categoria.id,
        numero,
        titulo,
        slug,
        barrio,
        barrioNormalizado: barrio ? normalizar(barrio) : null,
        problema,
        solucion,
        beneficios,
        lat: String(datos.lat),
        lon: String(datos.lon),
        ubicacionAproximada: datos.ubicacionAproximada ?? false,
        estado: "pendiente",
        canal: datos.canal,
        canalDetalle: datos.canalDetalle || null,
        autorNombre: datos.autorNombre || null,
        // El contacto entra SOLO con consentimiento, y queda registrada la
        // version del texto que la persona acepto.
        autorEmail: datos.contacto?.email ?? null,
        autorAvisos: Boolean(datos.contacto),
        autorAvisosEn: datos.contacto ? new Date() : null,
        autorAvisosVersion: datos.contacto?.version ?? null,
        cargadoPor: datos.cargadoPor || null,
        // Se publica cuando el equipo la revisa.
        publicada: false,
        fecha: datos.fecha,
      })
      .returning({ id: ideas.id });

    await opciones.enLaMismaTransaccion?.(tx, { id: creada.id, numero });

    return {
      ok: true,
      id: creada.id,
      numero,
      distrito,
      slug,
      titulo,
      barrio,
      problema,
      solucion,
      beneficios,
    };
  });
}

/**
 * Un slug que no exista en la edicion (el indice unico es por edicion y slug).
 *
 * El primer candidato es el de siempre: el slug del titulo, y si ya hay alguno
 * que empieza igual, el mismo con "-N", donde N es uno mas que los que empiezan
 * igual. Asi las ideas que ya existen y las nuevas siguen teniendo los slugs de
 * antes. Pero esa cuenta sola podia chocar ("plaza-2" como titulo propio y
 * "plaza" sin cargar dan "plaza-2" otra vez), y antes el choque terminaba en un
 * error del indice: ahora se prueba el numero siguiente hasta que quede libre.
 *
 * `slugificar` deja solo letras, numeros y guiones, asi que el LIKE no puede
 * traer comodines escondidos en la base.
 */
async function slugLibre(tx: TransaccionAlta, edicionId: number, base: string): Promise<string> {
  const [conteo] = await tx
    .select({ tomados: sql<number>`count(*)::int` })
    .from(ideas)
    .where(
      and(
        eq(ideas.edicionId, edicionId),
        or(eq(ideas.slug, base), like(ideas.slug, `${base}-%`)),
      ),
    );
  let sufijo = Number(conteo?.tomados ?? 0) + 1;
  let candidato = sufijo > 1 ? `${base}-${sufijo}` : base;

  // Cien vueltas es un techo que no se alcanza: haria falta que existan cien
  // slugs seguidos con el mismo comienzo.
  for (let vuelta = 0; vuelta < 100; vuelta += 1) {
    const [ocupado] = await tx
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(eq(ideas.edicionId, edicionId), eq(ideas.slug, candidato)))
      .limit(1);
    if (!ocupado) return candidato;
    sufijo += 1;
    candidato = `${base}-${sufijo}`;
  }
  return `${base}-${Date.now()}`;
}
