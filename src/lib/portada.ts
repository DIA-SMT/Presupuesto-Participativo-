/**
 * Lo que la portada le dice y le ofrece al vecino segun la etapa de la edicion
 * activa.
 *
 * La portada estaba escrita para una sola etapa, la de una edicion que ya voto:
 * "Presentar un proyecto" y "Ver proyectos y votar" en todas las etapas (con
 * la carga y la votacion cerradas la mayor parte del año), "0 proyectos
 * ganadores" y "Ver los 0 ganadores" con la 2026 recien abierta, y el mapa
 * diciendo que los 20 distritos "quedaron sin proyecto ganador" antes de votar.
 * Aca se decide que corresponde en cada momento; la pagina solo lo dibuja.
 *
 * Logica pura, sin base ni Next: la fecha de hoy entra como parametro para
 * poder probarla (scripts/tests/portada.test.ts).
 */
import type { Edicion } from "@/db/queries";
import { votacionTerminada } from "./ediciones";
import { formatearFecha } from "./formato";

export type AccionPortada = { href: string; texto: string };

export type Portada = {
  /**
   * Una oracion sobre el momento del proceso, arriba de los botones: que esta
   * pasando y, si la etapa tiene fecha de cierre cargada, hasta cuando.
   */
  momento: string;
  principal: AccionPortada;
  secundaria: AccionPortada;
  /**
   * Si la edicion activa ya termino de votar: recien entonces tiene ganadores
   * propios, votos que contar y distritos que "quedaron sin ganador".
   */
  yaVoto: boolean;
};

type EdicionDePortada = Pick<
  Edicion,
  "anio" | "etapa" | "ideasHasta" | "votacionDesde" | "votacionHasta"
>;

/**
 * "hasta el 15 de noviembre de 2026", o nada si la fecha no esta cargada o ya
 * paso: con la etapa sin cambiar despues del cierre, prometer una fecha vencida
 * seria peor que no dar ninguna.
 */
function hasta(fecha: string | null, hoy: string): string {
  return fecha && fecha >= hoy ? ` hasta el ${formatearFecha(fecha)}` : "";
}

/** `hoy` en AAAA-MM-DD, el dia de Tucuman (`hoyEnTucuman` en formato.ts). */
export function portadaSegunEtapa(edicion: EdicionDePortada, hoy: string): Portada {
  const yaVoto = votacionTerminada(edicion.etapa);

  switch (edicion.etapa) {
    case "ideas":
      return {
        momento: `Edición ${edicion.anio}: la presentación de ideas está abierta${hasta(edicion.ideasHasta, hoy)}.`,
        principal: { href: "/ideas/nueva", texto: "Presentá tu idea" },
        secundaria: { href: "/proyectos", texto: "Ver las ideas presentadas" },
        yaVoto,
      };
    case "evaluacion": {
      const votacion =
        edicion.votacionDesde && edicion.votacionDesde >= hoy
          ? `, y la votación empieza el ${formatearFecha(edicion.votacionDesde)}`
          : "";
      return {
        momento: `Edición ${edicion.anio}: el equipo técnico está evaluando las ideas presentadas${votacion}.`,
        principal: { href: "/proyectos", texto: "Ver las ideas presentadas" },
        secundaria: { href: "/ideas/seguimiento", texto: "Seguí tu idea" },
        yaVoto,
      };
    }
    case "votacion":
      return {
        momento: `Edición ${edicion.anio}: la votación está abierta${hasta(edicion.votacionHasta, hoy)}. Cada vecino vota un proyecto de su distrito.`,
        principal: { href: "/votar", texto: "Votá en tu distrito" },
        secundaria: { href: "/proyectos", texto: "Ver los proyectos en votación" },
        yaVoto,
      };
    case "seguimiento":
      return {
        momento: `Edición ${edicion.anio}: los vecinos ya eligieron un proyecto por distrito y el municipio los está ejecutando.`,
        principal: { href: "/proyectos?ganadores=1", texto: "Ver los proyectos ganadores" },
        secundaria: { href: "/distritos", texto: "Recorrer los distritos" },
        yaVoto,
      };
    case "cerrada":
      return {
        momento: `La edición ${edicion.anio} terminó. Sus proyectos y los de las ediciones anteriores siguen a la vista.`,
        principal: { href: "/proyectos?ganadores=1", texto: "Ver los proyectos ganadores" },
        secundaria: { href: "/archivo", texto: "Ediciones anteriores" },
        yaVoto,
      };
  }
}
