/**
 * Mide una imagen de portada para poder maquetarla sin adivinar.
 *
 * Responde tres preguntas que definen el hero:
 *   1. Donde termina el vacio y empieza el dibujo (ahi puede ir el texto).
 *   2. De que color es ese vacio (para empalmar el fondo de la seccion).
 *   3. Que tan claro es (para saber si el texto encima pasa contraste AA).
 *
 * Uso:  node scripts/analizar-imagen.mjs public/images/.../archivo.png
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const ruta = process.argv[2];
if (!ruta) {
  console.error("Falta la ruta de la imagen.");
  process.exit(1);
}

// --- Decodificar el PNG ------------------------------------------------------

const datos = readFileSync(ruta);
let posicion = 8;
let ancho = 0;
let alto = 0;
let profundidad = 0;
let tipoColor = 0;
const trozos = [];

while (posicion < datos.length) {
  const largo = datos.readUInt32BE(posicion);
  const tipo = datos.toString("ascii", posicion + 4, posicion + 8);
  const cuerpo = datos.subarray(posicion + 8, posicion + 8 + largo);
  if (tipo === "IHDR") {
    ancho = cuerpo.readUInt32BE(0);
    alto = cuerpo.readUInt32BE(4);
    profundidad = cuerpo[8];
    tipoColor = cuerpo[9];
  } else if (tipo === "IDAT") trozos.push(cuerpo);
  else if (tipo === "IEND") break;
  posicion += 12 + largo;
}

if (profundidad !== 8 || ![2, 6].includes(tipoColor)) {
  console.error(`Formato no soportado: ${profundidad} bits, tipo ${tipoColor}.`);
  process.exit(1);
}

const canales = tipoColor === 6 ? 4 : 3;
const porFila = ancho * canales;
const crudo = inflateSync(Buffer.concat(trozos));
const pixeles = Buffer.alloc(alto * porFila);

for (let fila = 0; fila < alto; fila += 1) {
  const filtro = crudo[fila * (porFila + 1)];
  const entrada = crudo.subarray(fila * (porFila + 1) + 1, (fila + 1) * (porFila + 1));
  const salida = pixeles.subarray(fila * porFila, (fila + 1) * porFila);
  const arriba = fila > 0 ? pixeles.subarray((fila - 1) * porFila, fila * porFila) : null;
  for (let i = 0; i < porFila; i += 1) {
    const a = i >= canales ? salida[i - canales] : 0;
    const b = arriba ? arriba[i] : 0;
    const c = arriba && i >= canales ? arriba[i - canales] : 0;
    const x = entrada[i];
    let v;
    switch (filtro) {
      case 0: v = x; break;
      case 1: v = x + a; break;
      case 2: v = x + b; break;
      case 3: v = x + ((a + b) >> 1); break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: v = x;
    }
    salida[i] = v & 0xff;
  }
}

// --- Utilidades --------------------------------------------------------------

const px = (x, y) => {
  const i = y * porFila + x * canales;
  return [pixeles[i], pixeles[i + 1], pixeles[i + 2]];
};
const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
const canal = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
const contraste = (a, b) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const pct = (n, total) => `${((n / total) * 100).toFixed(1)}%`;

console.log(`\nIMAGEN  ${ancho} x ${alto}  (proporcion ${(ancho / alto).toFixed(3)})\n`);

// --- 1. Donde empieza el dibujo ---------------------------------------------

// El fondo se estima con la franja izquierda, que es la parte vacia.
const muestrasFondo = [];
for (let y = 0; y < alto; y += 7) {
  for (let x = 0; x < Math.round(ancho * 0.05); x += 5) muestrasFondo.push(px(x, y));
}
const fondo = [0, 1, 2].map((c) =>
  Math.round(muestrasFondo.reduce((s, p) => s + p[c], 0) / muestrasFondo.length),
);

/** Cuanto se aparta una columna del fondo, en promedio por canal. */
function desvioColumna(x) {
  let suma = 0;
  let n = 0;
  for (let y = 0; y < alto; y += 3) {
    const p = px(x, y);
    suma += Math.max(Math.abs(p[0] - fondo[0]), Math.abs(p[1] - fondo[1]), Math.abs(p[2] - fondo[2]));
    n += 1;
  }
  return suma / n;
}

const UMBRAL = 12; // por debajo de esto la columna se lee como vacia
let primeraConDibujo = ancho;
for (let x = 0; x < ancho; x += 2) {
  if (desvioColumna(x) > UMBRAL) { primeraConDibujo = x; break; }
}
let ultimaConDibujo = 0;
for (let x = ancho - 1; x >= 0; x -= 2) {
  if (desvioColumna(x) > UMBRAL) { ultimaConDibujo = x; break; }
}

console.log("DONDE ESTA EL DIBUJO");
console.log(`  empieza en x=${primeraConDibujo}  (${pct(primeraConDibujo, ancho)} del ancho)`);
console.log(`  termina en x=${ultimaConDibujo}  (${pct(ultimaConDibujo, ancho)} del ancho)`);
console.log(`  zona libre a la izquierda: 0 a ${pct(primeraConDibujo, ancho)}\n`);

// --- 2. Color del vacio ------------------------------------------------------

console.log("COLOR DEL FONDO");
console.log(`  promedio de la franja izquierda: ${hex(fondo)}`);
console.log(`  arriba izquierda:  ${hex(px(4, 4))}`);
console.log(`  abajo izquierda:   ${hex(px(4, alto - 5))}`);
console.log(`  arriba derecha:    ${hex(px(ancho - 5, 4))}`);
console.log(`  abajo derecha:     ${hex(px(ancho - 5, alto - 5))}\n`);

// --- 3. Contraste del texto encima ------------------------------------------

// Se mide sobre la mitad izquierda, que es donde puede apoyarse el texto.
const AZUL_TITULO = [14, 58, 127];   // --color-marca-900
const GRIS_TEXTO = [85, 98, 122];    // --texto-suave

let peorTitulo = Infinity;
let peorCuerpo = Infinity;
let masOscuro = null;
const hasta = Math.min(primeraConDibujo, Math.round(ancho * 0.5));
for (let x = 0; x < hasta; x += 4) {
  for (let y = Math.round(alto * 0.15); y < Math.round(alto * 0.85); y += 4) {
    const p = px(x, y);
    const cT = contraste(AZUL_TITULO, p);
    const cC = contraste(GRIS_TEXTO, p);
    if (cT < peorTitulo) { peorTitulo = cT; masOscuro = p; }
    if (cC < peorCuerpo) peorCuerpo = cC;
  }
}

console.log(`CONTRASTE DEL TEXTO SOBRE LA ZONA LIBRE (0 a ${pct(hasta, ancho)})`);
console.log(`  pixel mas desfavorable: ${hex(masOscuro)}`);
console.log(`  titulo azul oscuro: ${peorTitulo.toFixed(2)}:1  ${peorTitulo >= 4.5 ? "AA ✓" : "NO PASA ✗"}`);
console.log(`  texto gris:         ${peorCuerpo.toFixed(2)}:1  ${peorCuerpo >= 4.5 ? "AA ✓" : "NO PASA ✗"}\n`);

// --- 4. Mapa de contraste por celda -----------------------------------------

/*
 * Si el peor pixel no pasa, hay que saber DONDE esta: no es lo mismo un
 * elemento oscuro en el medio de la zona del texto que uno pegado al borde.
 * La grilla muestra el peor contraste del titulo en cada celda.
 */
const COLS = 10;
const FILAS = 8;
console.log(`MAPA DE CONTRASTE DEL TITULO (peor caso por celda, imagen completa)`);
console.log(`  columnas: cada una es ${pct(1 / COLS, 1)} del ancho\n`);

let cabecera = "        ";
for (let c = 0; c < COLS; c += 1) cabecera += String(c * 10).padStart(6) + "%";
console.log(cabecera);

for (let f = 0; f < FILAS; f += 1) {
  let linea = String(Math.round((f / FILAS) * 100)).padStart(6) + "% ";
  for (let c = 0; c < COLS; c += 1) {
    let peor = Infinity;
    const x0 = Math.round((c / COLS) * ancho);
    const x1 = Math.round(((c + 1) / COLS) * ancho);
    const y0 = Math.round((f / FILAS) * alto);
    const y1 = Math.round(((f + 1) / FILAS) * alto);
    for (let x = x0; x < x1; x += 3) {
      for (let y = y0; y < y1; y += 3) {
        const c2 = contraste(AZUL_TITULO, px(x, y));
        if (c2 < peor) peor = c2;
      }
    }
    const marca = peor >= 4.5 ? " " : peor >= 3 ? "." : "#";
    linea += (peor.toFixed(1) + marca).padStart(7);
  }
  console.log(linea);
}
console.log("\n  ( # = por debajo de 3:1   . = entre 3 y 4.5   sin marca = pasa AA )\n");

// --- 5. Hasta donde puede llegar el texto -----------------------------------

/*
 * La pregunta que define la maqueta: si el texto se apoya sobre la franja
 * izquierda, hasta que ancho puede crecer sin perder contraste AA (4.5:1).
 * Se mide con el gris del cuerpo, que es el color mas exigente de los dos.
 */
function peorContraste(x0, x1, y0, y1, color) {
  let peor = Infinity;
  for (let x = x0; x < x1; x += 2) {
    for (let y = y0; y < y1; y += 2) {
      const c = contraste(color, px(x, y));
      if (c < peor) peor = c;
    }
  }
  return peor;
}

const ARRIBA = Math.round(alto * 0.12);
const ABAJO = Math.round(alto * 0.88);
let limite = 0;
for (let x = Math.round(ancho * 0.1); x < ancho; x += 4) {
  if (peorContraste(x - 4, x, ARRIBA, ABAJO, GRIS_TEXTO) < 4.5) break;
  limite = x;
}

console.log("HASTA DONDE PUEDE LLEGAR EL TEXTO (franja vertical del 12% al 88%)");
console.log(`  ultimo x con AA para el gris: ${limite}  (${pct(limite, ancho)} del ancho)`);
console.log(`  contraste del gris en esa caja:   ${peorContraste(0, limite, ARRIBA, ABAJO, GRIS_TEXTO).toFixed(2)}:1`);
console.log(`  contraste del titulo en esa caja: ${peorContraste(0, limite, ARRIBA, ABAJO, AZUL_TITULO).toFixed(2)}:1\n`);

// --- 6. Alto del dibujo (cuanto se puede recortar arriba y abajo) ------------

function desvioFila(y) {
  let suma = 0;
  let n = 0;
  for (let x = 0; x < ancho; x += 3) {
    const p = px(x, y);
    suma += Math.max(Math.abs(p[0] - fondo[0]), Math.abs(p[1] - fondo[1]), Math.abs(p[2] - fondo[2]));
    n += 1;
  }
  return suma / n;
}

let primeraFila = alto;
for (let y = 0; y < alto; y += 2) if (desvioFila(y) > UMBRAL) { primeraFila = y; break; }
let ultimaFila = 0;
for (let y = alto - 1; y >= 0; y -= 2) if (desvioFila(y) > UMBRAL) { ultimaFila = y; break; }

console.log("ALTO DEL DIBUJO");
console.log(`  empieza en y=${primeraFila}  (${pct(primeraFila, alto)})`);
console.log(`  termina en y=${ultimaFila}  (${pct(ultimaFila, alto)})`);
console.log(`  aire arriba: ${pct(primeraFila, alto)}   aire abajo: ${pct(alto - ultimaFila, alto)}\n`);
