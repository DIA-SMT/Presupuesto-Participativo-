/**
 * Limite de uso por ventana de tiempo, apoyado en una tabla de la base.
 * Se resuelve con un solo UPSERT atomico, sin necesidad de Redis.
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { consultar } from "@/db";

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
  const pimienta = process.env.SESSION_SECRET ?? "pp-smt";
  return createHash("sha256").update(`${ip}:${pimienta}`).digest("hex");
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
