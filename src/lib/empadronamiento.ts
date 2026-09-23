/**
 * Empadronamiento de votantes.
 *
 * Proveedor "cidituc": la ciudadania digital municipal. El flujo entero
 * (Derivador, token, consulta del perfil) vive en src/lib/cidituc.ts; aca queda
 * solo lo que hace el sitio con la persona ya identificada.
 *
 * Proveedor "dev": login de prueba local con DNI y distrito, para desarrollo
 * y demostraciones. Se activa solo con AUTH_PROVIDER=dev, con base local y
 * fuera de produccion (ver `proveedorActivo`).
 *
 * En ambos casos el DNI se guarda hasheado (sha256 + DNI_PEPPER): el padron del
 * sitio no contiene DNIs en claro.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, esBaseRemota } from "@/db";
import { votantes } from "@/db/schema";

/**
 * Si este proceso tiene que comportarse como produccion: un build de
 * produccion, o cualquier proceso conectado a una base remota. Lo segundo
 * importa tanto como lo primero: un `npm run dev` con la URL de Supabase en el
 * .env.local escribe en el padron de verdad (ver `esBaseRemota`).
 */
export function esEntornoProductivo(): boolean {
  return process.env.NODE_ENV === "production" || esBaseRemota();
}

/**
 * Pimienta de desarrollo. Es publica (esta en el repo) y por eso solo vale con
 * base local y fuera de produccion: con ella, los 10^8 DNIs posibles se
 * recorren en segundos y cualquier hash del padron se revierte.
 */
const PIMIENTA_DNI_DESARROLLO = "pimienta-de-desarrollo-pp-smt-solo-base-local";

/** Largo minimo de una pimienta en produccion, igual que SESSION_SECRET. */
const LARGO_MINIMO = 32;

/**
 * La pimienta del hash del DNI: la variable DNI_PEPPER, propia y separada de
 * SESSION_SECRET.
 *
 * Antes era SESSION_SECRET, y eso ataba dos cosas que no tienen nada que ver.
 * Rotar el secreto de sesion es una medida de higiene (se filtro, se fue
 * alguien del equipo); pero con el mismo valor como pimienta, rotarlo cambiaba
 * el hash de TODOS los DNIs: la misma persona pasaba a ser un votante nuevo y
 * podia votar otra vez en la misma edicion.
 *
 * DNI_PEPPER NO SE ROTA NUNCA DURANTE UNA EDICION. Cambiarla equivale a vaciar
 * el padron: nadie vuelve a encontrar su fila. Entre ediciones se puede, solo a
 * sabiendas de que el padron arranca de cero (los votos viejos quedan, atados a
 * las filas viejas).
 *
 * Se usa tal cual, sin recortar espacios, como se usaba SESSION_SECRET: asi, al
 * pasar de una a otra, DNI_PEPPER con el valor que tenia SESSION_SECRET da
 * exactamente los mismos hashes y el padron existente se conserva.
 */
export function pimientaDni(): string {
  const pimienta = pimientaDniSiHay();
  if (pimienta) return pimienta;
  throw new Error(
    `DNI_PEPPER faltante o demasiado corta (minimo ${LARGO_MINIMO} caracteres). ` +
      "Es obligatoria en produccion y con base remota. Si ya hay padron, tiene " +
      "que valer lo mismo que valia SESSION_SECRET hasta ahora (ver .env.example).",
  );
}

/**
 * Lo mismo, pero con `null` en lugar del error cuando falta en produccion. Lo
 * usa la pimienta de la IP (src/lib/rate-limit.ts), que tiene a donde caer.
 */
export function pimientaDniSiHay(): string | null {
  const valor = process.env.DNI_PEPPER;
  if (esEntornoProductivo()) {
    return valor && valor.trim().length >= LARGO_MINIMO ? valor : null;
  }
  return valor?.trim() ? valor : PIMIENTA_DNI_DESARROLLO;
}

/**
 * Hash del DNI para el padron. La forma (`dni:<digitos>:<pimienta>`) no se
 * cambia: cambiarla tiene el mismo efecto que rotar la pimienta.
 */
export function hashearDni(dni: string): string {
  const pimienta = pimientaDni();
  const limpio = dni.replace(/\D/g, "");
  return createHash("sha256").update(`dni:${limpio}:${pimienta}`).digest("hex");
}

export type DatosEmpadronamiento = {
  dni: string;
  nombre: string | null;
  distrito: number | null;
  proveedor: "cidituc" | "dev";
  proveedorSub: string | null;
  verificado: boolean;
};

/*
 * Que se conserva de la fila que ya estaba cuando la misma persona vuelve a
 * entrar. La regla: la fila vieja cuenta solo si es al menos tan confiable como
 * el ingreso nuevo.
 *
 *  - SUBE (la vieja no estaba verificada y el ingreso nuevo si, p. ej. un login
 *    "dev" y despues CIDITUC): de la vieja no se hereda nada. Antes se heredaba
 *    el distrito, porque CIDITUC no trae distrito y el UPDATE ignoraba el null:
 *    un distrito elegido en un formulario sin verificacion terminaba en una
 *    fila marcada como verificada, y con el se votaba.
 *  - BAJA (la vieja estaba verificada y el ingreso nuevo no): no se toca nada.
 *    Un ingreso sin verificar no puede desmarcar una identidad verificada ni
 *    cambiarle el distrito.
 *  - MISMO NIVEL: lo nuevo manda, y lo que no trae se conserva (CIDITUC otra
 *    vez no trae distrito, y no por eso se pierde el que ya tenia).
 *
 * En SQL, `votantes.x` es la fila que estaba y `excluded.x` la que se intento
 * insertar.
 */
const sube = sql`(NOT ${votantes.verificado} AND excluded.verificado)`;
const baja = sql`(${votantes.verificado} AND NOT excluded.verificado)`;

/**
 * Crea o actualiza el votante y devuelve su id interno.
 *
 * Si la cuenta del proveedor ya esta en el padron con OTRO documento, el alta
 * rebota contra `votantes_proveedor_sub_idx` y esto tira: es el caso en que la
 * misma persona abriria un segundo lugar en el padron (ver src/db/schema.ts).
 */
export async function empadronar(datos: DatosEmpadronamiento): Promise<{
  votanteId: number;
  distrito: number | null;
  nombre: string | null;
}> {
  const dniHash = hashearDni(datos.dni);
  const dniCola = datos.dni.replace(/\D/g, "").slice(-3);

  let fila: { id: number; distritoId: number | null; nombre: string | null };
  try {
    [fila] = await db
      .insert(votantes)
      .values({
        dniHash,
        dniCola,
        nombre: datos.nombre,
        distritoId: datos.distrito,
        proveedor: datos.proveedor,
        proveedorSub: datos.proveedorSub,
        verificado: datos.verificado,
      })
      .onConflictDoUpdate({
        target: votantes.dniHash,
        set: {
          nombre: sql`CASE WHEN ${baja} THEN ${votantes.nombre}
            WHEN ${sube} THEN excluded.nombre
            ELSE COALESCE(excluded.nombre, ${votantes.nombre}) END`,
          distritoId: sql`CASE WHEN ${baja} THEN ${votantes.distritoId}
            WHEN ${sube} THEN excluded.distrito_id
            ELSE COALESCE(excluded.distrito_id, ${votantes.distritoId}) END`,
          // Antes proveedor y sub no se actualizaban nunca: una fila nacida en
          // el login "dev" seguia diciendo "dev" aunque la persona ya hubiera
          // entrado con CIDITUC, y la cuenta no quedaba anotada.
          proveedor: sql`CASE WHEN ${baja} THEN ${votantes.proveedor}
            ELSE excluded.proveedor END`,
          proveedorSub: sql`CASE WHEN ${baja} THEN ${votantes.proveedorSub}
            WHEN ${sube} THEN excluded.proveedor_sub
            ELSE COALESCE(excluded.proveedor_sub, ${votantes.proveedorSub}) END`,
          verificado: sql`${votantes.verificado} OR excluded.verificado`,
        },
      })
      .returning({
        id: votantes.id,
        distritoId: votantes.distritoId,
        nombre: votantes.nombre,
      });
  } catch (causa) {
    throw errorSinDatosPersonales(causa);
  }

  return { votanteId: fila.id, distrito: fila.distritoId, nombre: fila.nombre };
}

/**
 * El error de la base, sin los datos de la persona.
 *
 * drizzle arma el mensaje como "Failed query: ... params: <valores>", y los
 * valores de este INSERT son el hash del DNI, sus ultimos tres digitos, el
 * nombre y la cuenta de CIDITUC. El callback de CIDITUC registra el
 * `message` del error en los logs del hosting: sin esto, cada alta fallida
 * dejaba a la persona identificada ahi. Se conserva el codigo de Postgres y el
 * constraint, que es lo que sirve para diagnosticar, y la causa original.
 */
function errorSinDatosPersonales(causa: unknown): Error {
  let codigo: string | undefined;
  let restriccion: string | undefined;
  for (let actual: unknown = causa; actual instanceof Error; actual = actual.cause) {
    const conDatos = actual as Error & { code?: unknown; constraint?: unknown };
    if (typeof conDatos.code === "string") codigo ??= conDatos.code;
    if (typeof conDatos.constraint === "string") restriccion ??= conDatos.constraint;
  }
  if (restriccion === "votantes_proveedor_sub_idx") {
    return new Error(
      "La cuenta del proveedor ya esta en el padron con otro documento " +
        "(votantes_proveedor_sub_idx): no se abre un segundo lugar para la misma " +
        "cuenta. Revisar a mano si cambio DNI_PEPPER o el documento de la cuenta.",
      { cause: causa },
    );
  }
  return new Error(
    `No se pudo guardar en el padron (codigo ${codigo ?? "desconocido"}` +
      `${restriccion ? `, ${restriccion}` : ""}).`,
    { cause: causa },
  );
}

/**
 * Con que proveedor se empadrona. El login "dev" se bloquea en dos casos,
 * aunque el entorno lo pida:
 *
 *  - En produccion: es preferible que la votacion falle a que se pueda votar
 *    sin identidad verificada.
 *  - Con base remota: sin esto, cualquiera con la DATABASE_URL de produccion en
 *    su .env.local podia levantar `npm run dev` y empadronar DNIs inventados,
 *    con el distrito que quisiera, directo en el padron real.
 */
export function proveedorActivo(): "cidituc" | "dev" {
  const valor = process.env.AUTH_PROVIDER?.trim().toLowerCase();
  if (valor === "cidituc") return "cidituc";
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_PROVIDER debe ser 'cidituc' en produccion. El proveedor 'dev' es solo para desarrollo.",
    );
  }
  if (esBaseRemota()) {
    throw new Error(
      "AUTH_PROVIDER=dev solo funciona con base local (PGlite o Postgres en esta " +
        "maquina). Con una DATABASE_URL remota el login de prueba escribiria en el " +
        "padron real: usar AUTH_PROVIDER=cidituc o sacar DATABASE_URL.",
    );
  }
  return "dev";
}
