/**
 * El cuerpo del reglamento tal como se publica en /reglamento.
 *
 * Esta aparte de page.tsx para que la vista previa del panel
 * (src/app/admin/contenido/reglamento.tsx) dibuje EXACTAMENTE lo mismo que la
 * pagina: si cada una tuviera su copia, la vista previa podria mostrar algo que
 * despues el sitio no muestra. No usa hooks ni consulta nada, asi que sirve
 * igual en el servidor (la pagina) y en el cliente (el panel).
 *
 * El formato es el de siempre: cada renglon con texto es un parrafo. No
 * interpreta HTML ni markdown; lo que se pegue asi se ve tal cual, con los
 * signos, y el panel avisa antes de guardar (`avisosDeFormato`).
 */

/**
 * Los parrafos del texto: un renglon, un parrafo.
 *
 * Parte tanto con "\n" como con "\r\n": un texto que viajo en un formulario o
 * que se pego desde Word trae los saltos de Windows, y partiendo solo con "\n"
 * cada renglon en blanco quedaba como un "\r" que contaba como parrafo (un
 * parrafo vacio con su margen, o sea un hueco doble). Por lo mismo se descartan
 * los renglones que tienen solo espacios.
 */
export function parrafosDelReglamento(texto: string | null | undefined): string[] {
  if (!texto) return [];
  return texto
    .split(/\r?\n/)
    .map((renglon) => renglon.trim())
    .filter((renglon) => renglon.length > 0);
}

export default function CuerpoReglamento({ parrafos }: { parrafos: string[] }) {
  return (
    <div className="mt-6 max-w-3xl space-y-4 text-[0.9375rem] leading-relaxed">
      {parrafos.map((parrafo, indice) => (
        <p key={indice}>{parrafo}</p>
      ))}
    </div>
  );
}
