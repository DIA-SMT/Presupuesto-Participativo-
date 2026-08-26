/**
 * Que es una idea bien formada. Un solo lugar.
 *
 * Existe porque hay dos puertas de entrada al mismo texto: el alta
 * (`POST /api/ideas`) y el asistente de carga (`POST /api/ideas/asistente`).
 * Si cada una tuviera sus propios minimos, el asistente podria dar por buena
 * una propuesta que el alta despues rechaza, o al reves: gastar una llamada al
 * modelo con un texto que el servidor iba a rechazar igual.
 */
import { z } from "zod";

/** Largos maximos, los mismos que limitan los campos del formulario. */
export const LARGOS = {
  titulo: 140,
  barrio: 120,
  problema: 3000,
  solucion: 4000,
  beneficios: 3000,
  autorNombre: 120,
  autorEmail: 160,
} as const;

/** Minimos para que la propuesta se pueda evaluar. */
export const MINIMOS = {
  titulo: 8,
  problema: 30,
  solucion: 30,
} as const;

/**
 * El contenido de la propuesta: lo que describe la idea, sin la ubicacion ni
 * los datos de contacto. Es exactamente lo que puede ver el asistente.
 */
export const contenidoIdea = z.object({
  titulo: z.string().trim().min(MINIMOS.titulo).max(LARGOS.titulo),
  categoria: z.string().trim().min(1).max(60),
  barrio: z.string().trim().max(LARGOS.barrio).nullish(),
  problema: z.string().trim().min(MINIMOS.problema).max(LARGOS.problema),
  solucion: z.string().trim().min(MINIMOS.solucion).max(LARGOS.solucion),
  beneficios: z.string().trim().max(LARGOS.beneficios).nullish(),
});

export type ContenidoIdea = z.infer<typeof contenidoIdea>;

/** El alta completa: contenido + ubicacion + contacto opcional. */
export const altaIdea = contenidoIdea
  .extend({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    autorNombre: z.string().trim().max(LARGOS.autorNombre).nullish(),
    autorEmail: z
      .string()
      .trim()
      .email()
      .max(LARGOS.autorEmail)
      .nullish()
      .or(z.literal("")),
    /** Casilla de avisos: sin ella el mail no se guarda (ver el refine). */
    autorAvisos: z.coerce.boolean().optional(),
  })
  // No se acepta un mail sin la casilla marcada: seria un dato personal sin
  // consentimiento. El formulario no deja llegar hasta aca, esto es el cierre.
  .refine((datos) => !datos.autorEmail || datos.autorAvisos, {
    message: "Falta el consentimiento para guardar el correo.",
    path: ["autorAvisos"],
  });

/**
 * Que campos estan por debajo del minimo, en castellano y listo para mostrar.
 *
 * Lo usa el asistente ANTES de llamar al modelo: si a la propuesta le falta lo
 * basico, no hace falta gastar una consulta para darse cuenta. Tambien sirve
 * en el navegador, donde hoy no hay ninguna validacion de minimos y la persona
 * se entera recien despues de enviar.
 */
export function faltantesBasicos(datos: {
  titulo?: string | null;
  problema?: string | null;
  solucion?: string | null;
}): string[] {
  const faltan: string[] = [];
  const largo = (valor: string | null | undefined) => (valor ?? "").trim().length;

  if (largo(datos.titulo) < MINIMOS.titulo) {
    faltan.push(
      `El título es muy corto: necesita al menos ${MINIMOS.titulo} caracteres.`,
    );
  }
  if (largo(datos.problema) < MINIMOS.problema) {
    faltan.push(
      `Contá un poco más el problema: necesita al menos ${MINIMOS.problema} caracteres.`,
    );
  }
  if (largo(datos.solucion) < MINIMOS.solucion) {
    faltan.push(
      `Contá un poco más la solución: necesita al menos ${MINIMOS.solucion} caracteres.`,
    );
  }
  return faltan;
}
