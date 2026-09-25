/**
 * Los largos y minimos de los campos de una idea, para las pantallas del panel.
 *
 * Los que valen son los de src/lib/idea-esquema.ts, que es lo que valida el
 * servidor. Las pantallas los necesitan para los contadores y para no dejar
 * enviar lo que el servidor va a rechazar, pero son componentes de cliente, e
 * importar idea-esquema desde ahi trae zod entero al navegador. Por eso los arma
 * el servidor (la page) y viajan como props: el formulario publico, que no tiene
 * page intermedia, los copia a mano, y aca no hace falta.
 *
 * Los componentes de cliente importan de aca SOLO el tipo (`import type`), que
 * no llega al navegador.
 */
import { LARGOS, MINIMOS } from "@/lib/idea-esquema";
import { LARGO_CANAL_DETALLE } from "./operaciones";

export type Largo = { minimo: number; maximo: number };

export type Limites = {
  titulo: Largo;
  solucion: Largo;
  problema: Largo;
  beneficios: Largo;
  barrio: Largo;
  autorNombre: Largo;
  canalDetalle: Largo;
};

/**
 * Los limites de la carga (los del formulario publico, mas "de donde vino").
 * La correccion usa los mismos maximos, y del titulo el mismo minimo: sus
 * textos no tienen minimo (ver `aplicarCorreccion`).
 */
export function limitesDeLaIdea(): Limites {
  return {
    titulo: { minimo: MINIMOS.titulo, maximo: LARGOS.titulo },
    solucion: { minimo: MINIMOS.solucion, maximo: LARGOS.solucion },
    problema: { minimo: MINIMOS.problema, maximo: LARGOS.problema },
    beneficios: { minimo: 0, maximo: LARGOS.beneficios },
    barrio: { minimo: 0, maximo: LARGOS.barrio },
    autorNombre: { minimo: 0, maximo: LARGOS.autorNombre },
    canalDetalle: { minimo: 3, maximo: LARGO_CANAL_DETALLE },
  };
}
