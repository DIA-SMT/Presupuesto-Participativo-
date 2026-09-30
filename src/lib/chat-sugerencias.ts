/**
 * Las preguntas que Migue le sugiere a quien abre el chat, segun la etapa de la
 * edicion activa.
 *
 * Eran cuatro fijas ("¿Qué ganó en mi distrito?", "¿Cómo presento una idea?"...)
 * en todas las etapas: en plena votacion no habia ninguna sobre como votar, y
 * con la carga cerrada se ofrecia presentar una idea. Ahora cada etapa sugiere
 * lo que la gente viene a hacer en ese momento. Todas tienen respuesta tambien
 * sin IA (lo prueba scripts/tests/chat-respaldo.test.ts).
 */
import type { EtapaEdicion } from "@/db/queries";

export function sugerenciasDelChat(etapa: EtapaEdicion | undefined): string[] {
  switch (etapa) {
    case "ideas":
      return [
        "¿Cómo presento una idea?",
        "¿Hasta cuándo puedo presentar?",
        "¿Qué ganó en mi distrito?",
        "¿Qué tipo de proyectos se pueden presentar?",
      ];
    case "evaluacion":
      return [
        "¿Cómo sigo mi idea?",
        "¿Cuándo es la votación?",
        "¿Qué pasa con las ideas que no ganan?",
        "¿Cuántas ideas se presentaron?",
      ];
    case "votacion":
      return [
        "¿Cómo voto?",
        "¿Hasta cuándo puedo votar?",
        "¿Quién puede votar?",
        "¿Cuántas veces puedo votar?",
      ];
    default:
      return [
        "¿Qué ganó en mi distrito?",
        "¿Cuántas ideas se presentaron?",
        "¿Cómo va la obra de mi barrio?",
        "Proyectos de plazas y espacios verdes",
      ];
  }
}
