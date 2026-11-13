/**
 * El cuerpo del reglamento tal como se publica en /reglamento.
 *
 * Esta aparte de page.tsx porque no usa hooks ni consulta nada: dibuja el
 * texto que le pasan, en el servidor o en el cliente.
 *
 * El formato es el de siempre: cada renglon con texto es un parrafo. No
 * interpreta HTML ni markdown, con una sola excepcion: un renglon que empieza
 * con "## " es un titulo (el nombre de cada norma). Lo demas se ve tal cual,
 * con los signos.
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
      {parrafos.map((parrafo, indice) =>
        parrafo.startsWith("## ") ? (
          <h3 key={indice} className="pt-4 text-lg font-bold">
            {parrafo.slice(3)}
          </h3>
        ) : (
          <p key={indice}>{parrafo}</p>
        ),
      )}
    </div>
  );
}
