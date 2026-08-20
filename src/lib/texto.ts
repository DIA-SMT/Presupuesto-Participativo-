/**
 * Normalizacion de texto. Los datos de 2025 vienen de carga manual: titulos en
 * mayuscula sostenida, comillas literales, marcas internas como "S/DATOS" o un
 * asterisco al final, y saltos de linea dobles.
 */

/** Quita tildes y pasa a minusculas. Para comparar, no para mostrar. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function slugificar(texto: string, maximo = 90): string {
  const base = normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= maximo) return base || "sin-titulo";
  return base.slice(0, maximo).replace(/-[^-]*$/, "");
}

/** Palabras que se mantienen en minuscula al recomponer un titulo. */
const MINUSCULAS = new Set([
  "a", "al", "ante", "con", "de", "del", "desde", "e", "el", "en", "entre",
  "hacia", "hasta", "la", "las", "lo", "los", "o", "para", "por", "que", "se",
  "segun", "sin", "sobre", "su", "sus", "tras", "un", "una", "unos", "unas",
  "y", "vs",
]);

/** Siglas y nombres propios que deben quedar en mayuscula tal cual. */
const LITERALES = new Map<string, string>([
  ["smt", "SMT"], ["sum", "SUM"], ["cac", "CAC"], ["cgt", "CGT"],
  ["agef", "AGEF"], ["aget", "AGET"], ["atsa", "ATSA"], ["smata", "SMATA"],
  ["diza", "DIZA"], ["sitravi", "Sitravi"], ["led", "LED"], ["ii", "II"],
  ["iii", "III"], ["iv", "IV"], ["i", "I"], ["n", "N"], ["b", "B"],
  ["cidituc", "CIDITUC"], ["dni", "DNI"], ["pp", "PP"], ["oc", "OC"],
]);

/**
 * La carga del sitio anterior se hizo en mayuscula sostenida y sin tildes, asi
 * que al pasar un titulo a texto legible hay que restituirlas. Este diccionario
 * se aplica UNICAMENTE a las palabras que estaban gritadas: un texto escrito
 * con capitalizacion intencional no se toca nunca.
 */
const TILDES = new Map<string, string>([
  ["playon", "playón"], ["salon", "salón"], ["multiples", "múltiples"],
  ["jardin", "jardín"], ["camineria", "caminería"], ["cesped", "césped"],
  ["sintetico", "sintético"], ["atletico", "atlético"], ["turistico", "turístico"],
  ["publico", "público"], ["publica", "pública"], ["area", "área"],
  ["jovenes", "jóvenes"], ["mas", "más"], ["sali", "Salí"],
  ["revalorizacion", "revalorización"], ["expansion", "expansión"],
  ["integracion", "integración"], ["pavimentacion", "pavimentación"],
  ["contencion", "contención"], ["ampliacion", "ampliación"],
  ["innovacion", "innovación"], ["formacion", "formación"],
  ["revolucion", "revolución"], ["construccion", "construcción"],
  ["educacion", "educación"], ["recreacion", "recreación"],
  ["inclusion", "inclusión"], ["gestion", "gestión"], ["union", "unión"],
  ["capitan", "capitán"], ["farmaceutico", "farmacéutico"],
  ["america", "América"], ["nicolas", "Nicolás"], ["martin", "Martín"],
  ["echeverria", "Echeverría"], ["munoz", "Muñoz"], ["santillan", "Santillán"],
  ["fernandez", "Fernández"], ["platanos", "plátanos"], ["peron", "Perón"],
  ["guemes", "Güemes"], ["tucuman", "Tucumán"], ["grafico", "gráfico"],
  ["cordoba", "Córdoba"], ["tecnico", "técnico"], ["electrico", "eléctrico"],
]);

/** Conjunciones que en un titulo gritado quedan como una sola mayuscula. */
const CONJUNCIONES = new Set(["y", "e", "o", "u"]);

/** Pone en mayuscula la primera letra, sin importar si el token abre con comilla. */
function capitalizar(parte: string): string {
  return parte.replace(/\p{L}/u, (letra) => letra.toLocaleUpperCase("es"));
}

/**
 * Mayuscula inicial de un titulo completo: solo cuando el primer caracter
 * alfanumerico es una letra. "plaza San Martin" -> "Plaza San Martin", pero
 * "11 de febrero" queda intacto (capitalizar la "d" daria "11 De febrero").
 */
function capitalizarInicio(texto: string): string {
  return texto.replace(
    /^([^\p{L}\p{N}]*)(\p{L})/u,
    (_, previo: string, letra: string) => previo + letra.toLocaleUpperCase("es"),
  );
}

/**
 * Recompone una palabra en mayuscula sostenida como texto legible, respetando
 * siglas conocidas y las palabras que van en minuscula dentro de un titulo.
 */
function recomponerPalabra(parte: string, esPrimera: boolean): string {
  const minuscula = parte.toLocaleLowerCase("es");
  const limpio = minuscula.replace(/[^\p{L}\p{N}]/gu, "");

  const literal = LITERALES.get(limpio);
  if (literal) return minuscula.replace(limpio, literal);

  const conTilde = TILDES.get(limpio);
  const base = conTilde ? minuscula.replace(limpio, conTilde) : minuscula;

  // Un nombre propio del diccionario ya viene con su mayuscula.
  if (conTilde && /\p{Lu}/u.test(conTilde)) return base;
  if (!esPrimera && MINUSCULAS.has(limpio)) return base;
  return capitalizar(base);
}

/**
 * Convierte MAYUSCULA SOSTENIDA en texto legible respetando siglas. Se aplica
 * tanto al titulo completo cuando viene todo en mayusculas como a las palabras
 * gritadas dentro de un titulo de capitalizacion mixta ("plaza VILLA ALEM").
 */
export function normalizarTitulo(bruto: string): string {
  let texto = bruto
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Comillas envolventes de la carga manual. Se quitan solo cuando envuelven
  // el titulo completo: un titulo como `Playon "Plaza Viluco"` conserva las
  // suyas, que son parte del nombre.
  const comillas = (texto.match(/"/g) ?? []).length;
  if (comillas === 2 && texto.startsWith('"') && texto.endsWith('"')) {
    texto = texto.slice(1, -1).trim();
  }

  // Marcas de trabajo interno arrastradas desde el sitio anterior.
  texto = texto
    .replace(/\s*\*+\s*$/g, "")
    .replace(/[\s-]*\bS\/?\s?DATOS\b\.?/gi, "")
    .replace(/[\s-]*\bsin identificar\b\.?/gi, "")
    .replace(/[\s-]*\bno factible\b\.?$/gi, "")
    .replace(/\s*[-–]\s*$/g, "")
    .replace(/\s*,\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const partes = texto.split(/(\s+|[/(),-])/);
  let esPrimeraPalabra = true;

  texto = partes
    .map((parte) => {
      if (!/\p{L}/u.test(parte)) return parte;
      const esPrimera = esPrimeraPalabra;
      esPrimeraPalabra = false;
      // Solo se interviene la palabra si esta gritada: dos letras mayusculas
      // seguidas o mas. Asi una capitalizacion intencional queda intacta. Las
      // conjunciones de una sola letra tambien se bajan ("PLAZA Y JARDIN").
      const enMayusculas = parte === parte.toLocaleUpperCase("es");
      const gritada =
        enMayusculas &&
        (/\p{Lu}{2}/u.test(parte) ||
          CONJUNCIONES.has(parte.toLocaleLowerCase("es")));
      return gritada ? recomponerPalabra(parte, esPrimera) : parte;
    })
    .join("");

  // Punto final sobrante y espacios antes de signos.
  return capitalizarInicio(texto.replace(/\s+([,.;:])/g, "$1").replace(/\.$/, "").trim());
}

/** Limpia un texto largo: comillas envolventes, saltos dobles, espacios. */
export function normalizarParrafo(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const texto = bruto
    .replace(/\r\n/g, "\n")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((linea) => linea.trim())
    .join("\n")
    .trim();
  return texto.length ? texto : null;
}

/** Valores que en los datos de 2025 significan "no hay dato". */
const VACIOS = new Set([
  "", "s/datos", "s/ datos", "sdatos", "sin identificar", "sin datos",
  "sin dato", "s/d", "-", "n/a", "na", "null", "undefined",
]);

export function valorODefecto(bruto: string | null | undefined): string | null {
  if (bruto == null) return null;
  const texto = bruto.trim();
  if (VACIOS.has(normalizar(texto))) return null;
  return texto;
}

/** Nombre de barrio presentable: quita el prefijo "Barrio" repetido y ordena mayusculas. */
export function normalizarBarrio(bruto: string | null | undefined): string | null {
  const valor = valorODefecto(bruto);
  if (!valor) return null;
  const sinPrefijo = valor
    .replace(/^\s*(b°|b\.|bº|barrio|bo\.?)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalizarTitulo(sinPrefijo) || null;
}

/** Similitud de Jaccard entre los tokens de dos textos. Para detectar duplicados. */
export function similitud(a: string, b: string): number {
  const tokens = (texto: string) =>
    new Set(
      normalizar(texto)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let comunes = 0;
  for (const token of ta) if (tb.has(token)) comunes += 1;
  return comunes / (ta.size + tb.size - comunes);
}
