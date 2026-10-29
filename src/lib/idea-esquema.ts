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
  referenciasUbicacion: 1000,
  organizacion: 160,
  autorTelefono: 30,
} as const;

/**
 * Un telefono como lo escribe la gente: digitos con espacios, guiones, barras,
 * parentesis y un + adelante. Entre 6 y 15 digitos en total, que va de un fijo
 * local sin caracteristica a un movil con +54 9. No se normaliza: se guarda
 * como lo escribio la persona, para que el equipo lo lea igual que en el papel.
 */
export const telefono = z
  .string()
  .trim()
  .max(LARGOS.autorTelefono)
  .regex(/^\+?[\d\s()\-/.]+$/, "Solo números, espacios y guiones.")
  .refine((valor) => {
    const digitos = valor.replace(/\D/g, "").length;
    return digitos >= 6 && digitos <= 15;
  }, "El teléfono tiene que tener entre 6 y 15 números.");

/** Minimos para que la propuesta se pueda evaluar. */
export const MINIMOS = {
  titulo: 8,
  problema: 30,
  solucion: 30,
} as const;

/**
 * El contenido de la propuesta: lo que describe la idea, sin la ubicacion ni
 * los datos de contacto. Es exactamente lo que puede ver el asistente.
 *
 * La categoria es OPCIONAL desde el formulario 2026: la persona ya no la elige,
 * la asigna el equipo al evaluar (ver la ficha del panel). Se sigue aceptando
 * si viene, pero no hace falta.
 */
export const contenidoIdea = z.object({
  titulo: z.string().trim().min(MINIMOS.titulo).max(LARGOS.titulo),
  categoria: z.string().trim().max(60).nullish(),
  barrio: z.string().trim().max(LARGOS.barrio).nullish(),
  /** "¿Dónde ocurre?": las referencias escritas del lugar. */
  referenciasUbicacion: z.string().trim().max(LARGOS.referenciasUbicacion).nullish(),
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
    /** La organizacion en cuyo nombre se presenta; vacio o null, ninguna. */
    organizacion: z.string().trim().max(LARGOS.organizacion).nullish(),
    /** Opcional. Solo lo ve el equipo, y se borra al cerrar la edicion. */
    autorTelefono: z.literal("").or(telefono).nullish(),
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
  // Los mensajes nombran las preguntas como las ve la persona en el formulario
  // ("¿Qué querés proponer?", "¿Por qué hace falta?") y no las columnas de la
  // base: nadie que carga una idea vio nunca las palabras "problema" ni
  // "solución" en pantalla.
  if (largo(datos.solucion) < MINIMOS.solucion) {
    faltan.push(
      `Contá un poco más qué querés proponer: necesita al menos ${MINIMOS.solucion} caracteres.`,
    );
  }
  if (largo(datos.problema) < MINIMOS.problema) {
    faltan.push(
      `Contá un poco más por qué hace falta: necesita al menos ${MINIMOS.problema} caracteres.`,
    );
  }
  return faltan;
}
