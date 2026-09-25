/**
 * Limite de uso por ventana de tiempo, apoyado en una tabla de la base.
 * Se resuelve con un solo UPSERT atomico, sin necesidad de Redis.
 */
import { createHash, createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { consultar } from "@/db";
import { esEntornoProductivo, pimientaDniSiHay } from "@/lib/empadronamiento";

export type Resultado = {
  permitido: boolean;
  restantes: number;
  reiniciaEn: number;
};

export async function consumir(
  clave: string,
  maximo: number,
  ventanaSegundos: number,
): Promise<Resultado> {
  const filas = await consultar<{ contador: number; ventana_desde: string | Date }>(sql`
    INSERT INTO rate_limit (clave, contador, ventana_desde)
    VALUES (${clave}, 1, now())
    ON CONFLICT (clave) DO UPDATE SET
      contador = CASE
        WHEN rate_limit.ventana_desde < now() - make_interval(secs => ${ventanaSegundos})
        THEN 1
        ELSE rate_limit.contador + 1
      END,
      ventana_desde = CASE
        WHEN rate_limit.ventana_desde < now() - make_interval(secs => ${ventanaSegundos})
        THEN now()
        ELSE rate_limit.ventana_desde
      END
    RETURNING contador, ventana_desde
  `);

  const contador = Number(filas[0].contador);
  const ventanaDesde = new Date(filas[0].ventana_desde);
  const reiniciaEn = Math.max(
    0,
    Math.ceil((ventanaDesde.getTime() + ventanaSegundos * 1000 - Date.now()) / 1000),
  );

  return {
    permitido: contador <= maximo,
    restantes: Math.max(0, maximo - contador),
    reiniciaEn,
  };
}

/**
 * Hash de la IP. Se guarda hasheada y no en claro: alcanza para limitar abuso
 * y para detectar votos repetidos, sin conservar un dato personal identificable.
 */
export function hashearIp(ip: string): string {
  return createHash("sha256").update(`${ip}:${pimientaIp()}`).digest("hex");
}

/** Etiqueta de la derivacion: cambiarla cambia todos los hashes de IP. */
const DOMINIO_IP = "pp-smt/pimienta-ip/v1";

/** Los avisos de configuracion ya impresos: uno por proceso, no uno por pedido. */
const avisosDados = new Set<string>();

function avisarUnaVez(aviso: string) {
  if (avisosDados.has(aviso)) return;
  avisosDados.add(aviso);
  console.error(aviso);
}

/**
 * La pimienta de la IP. Hasta ahora era SESSION_SECRET, igual que la del DNI;
 * ahora no depende de el, por el mismo motivo (rotar la sesion no tiene por
 * que cambiar ningun hash). En orden:
 *
 *  1. IP_PEPPER, si esta. Es opcional: existe para poder rotar la de la IP sin
 *     tocar la del DNI.
 *  2. Si no, una derivada de la pimienta del DNI con separacion de dominio
 *     (HMAC con una etiqueta propia): es estable como DNI_PEPPER, que no se
 *     rota, y el hash de una IP no se puede usar para nada del DNI, ni al
 *     reves. En desarrollo la del DNI es la fija de desarrollo, asi que esto
 *     anda sin configurar nada.
 *  3. Solo en produccion sin DNI_PEPPER (un deploy mal configurado): una
 *     derivada de SESSION_SECRET, con un error en consola.
 *
 * Nada de esto tira por configuracion incompleta mientras quede un secreto de
 * verdad a mano: `hashearIp` lo llaman el chat, el alta de ideas y el login del
 * panel, y una variable faltante no tiene por que tirar el sitio entero. La
 * votacion queda cerrada por su cuenta, porque `hashearDni` si tira. Lo que
 * NUNCA se hace es caer a una pimienta publica o corta: con una conocida, los
 * 2^32 IPv4 se recorren en minutos y el hash no protege nada.
 */
function pimientaIp(): string {
  const propia = process.env.IP_PEPPER;
  if (propia?.trim()) {
    if (!esEntornoProductivo() || propia.trim().length >= 32) return propia;
    avisarUnaVez("[rate-limit] IP_PEPPER tiene menos de 32 caracteres: se ignora.");
  }

  const delDni = pimientaDniSiHay();
  if (delDni) return derivar(delDni);

  const sesion = process.env.SESSION_SECRET;
  if (sesion && sesion.length >= 32) {
    avisarUnaVez(
      "[rate-limit] Falta DNI_PEPPER (y no hay IP_PEPPER): la IP se hashea con " +
        "una derivada de SESSION_SECRET. Configurar DNI_PEPPER; al hacerlo, los " +
        "hashes de IP cambian una vez (los contadores de limite arrancan de cero).",
    );
    return derivar(sesion);
  }
  throw new Error("Falta DNI_PEPPER (o IP_PEPPER) para hashear la IP en produccion.");
}

function derivar(secreto: string): string {
  return createHmac("sha256", secreto).update(DOMINIO_IP).digest("hex");
}

/** IP del cliente detras del proxy municipal o del hosting. */
export function ipDe(request: Request): string {
  return ipDeCabeceras(request.headers);
}

/**
 * Lo mismo, para los contextos que no reciben el Request: las server actions
 * leen las cabeceras con `headers()` de next/headers.
 */
export function ipDeCabeceras(cabeceras: Headers): string {
  const nombres = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"];
  for (const nombre of nombres) {
    const valor = cabeceras.get(nombre);
    if (valor) return valor.split(",")[0].trim();
  }
  return "desconocida";
}
