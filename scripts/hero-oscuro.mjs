/**
 * Genera la version del dibujo del hero para el tema oscuro.
 *
 * El PNG del hero no tiene transparencia: el fondo claro (un degrade gris
 * azulado con ondas) esta PINTADO en la imagen. Por eso en el tema oscuro el
 * hero seguia claro: con un fondo oscuro detras, el dibujo se veia como un
 * rectangulo claro pegado. Este script separa la figura (el mapa en relieve,
 * Migue y el logo) de ese fondo y escribe una copia con transparencia.
 *
 * Como lo hace
 * ------------
 * 1. Modela el fondo: un parche de Coons armado con los cuatro bordes de la
 *    imagen (que son fondo puro), suavizados para no copiar las ondas.
 * 2. Exterior = relleno desde los bordes por pixeles SUAVES (gradiente bajo) y
 *    no mucho mas oscuros que el fondo: fondo, ondas y sombras difusas. Frena en
 *    los bordes nitidos de la figura. Lo encerrado por la figura (los edificios
 *    blancos del mapa, que tienen el mismo color del fondo) no se toca nunca.
 * 3. Sombras de contacto: crecen desde el exterior hacia la figura solo
 *    mientras el brillo no sube respecto del minimo del camino. Una sombra se
 *    oscurece de forma monotona hacia el objeto y toca fondo en la linea de
 *    contacto; del otro lado el objeto vuelve a aclarar, y ahi frena. Crecen
 *    solo hacia arriba y hacia la izquierda porque la luz del dibujo viene de
 *    arriba a la izquierda (las sombras caen abajo y a la derecha): asi no
 *    entran en las caras iluminadas del costado izquierdo del zocalo, que
 *    tienen casi el brillo del fondo y un borde igual de suave.
 * 4. Exterior -> "color a alfa" contra el fondo modelado: lo mas oscuro que el
 *    fondo (sombras) queda como sombra translucida; lo mas claro (ondas) se
 *    atenua a casi nada para no restarle contraste al texto.
 * 5. Borde de la figura (3 px): el suavizado original mezcla la figura con el
 *    fondo claro y sobre oscuro se veia un filo blanco. El color se toma del
 *    interior cercano y el alfa sale de proyectar el pixel entre fondo y figura.
 *
 * Tres zonas estan protegidas a mano (coordenadas del PNG de 1672x941, mas
 * abajo): son figura que ningun criterio local distingue de sombra o fondo.
 * Si se cambia la ilustracion, hay que revisarlas.
 *
 * Uso:
 *   node scripts/hero-oscuro.mjs [--vista ruta.png]
 * Lee   public/images/presupuesto-participativo/hero-mapa-distritos.png
 * Escribe public/images/presupuesto-participativo/hero-mapa-distritos-oscuro.webp
 * Con --vista, ademas una composicion sobre el fondo oscuro del sitio para
 * revisar el resultado a ojo (no se commitea).
 */
import sharp from "sharp";

const ENTRADA = "public/images/presupuesto-participativo/hero-mapa-distritos.png";
const SALIDA = "public/images/presupuesto-participativo/hero-mapa-distritos-oscuro.webp";
const iVista = process.argv.indexOf("--vista");
const VISTA = iVista > 0 ? process.argv[iVista + 1] : null;

/** Fondo del sitio en tema oscuro (--fondo en globals.css), solo para --vista. */
const FONDO_OSCURO = { r: 12, g: 20, b: 31 };

// Umbrales. Medidos sobre este dibujo: el fondo tiene ruido de 1-2 niveles por
// pixel, las sombras suben de a 3 cerca de la base y los bordes nitidos de la
// figura saltan 15 o mas.
const G_SUAVE = 2.2; // gradiente maximo del relleno principal
const G_SOMBRA = 12; // gradiente maximo que puede cruzar una sombra de contacto
const TOLERANCIA = 1.5; // niveles que puede subir el brillo sobre el minimo del camino
const CRECER_MAX = 30; // px que puede crecer una sombra
const ISLA_MAX = 1500; // manchas de "figura" sueltas en el fondo mas chicas que esto son ruido
const BANDA = 3; // px de borde de figura que se descontaminan
const ONDAS = 0.12; // cuanto se conservan las ondas claras del fondo

// Zonas protegidas (x0, y0, x1, y1 inclusive; elipses: cx, cy, rx, ry).
/** Punta de la suela izquierda de Migue: en sombra, se oscurece de a poco desde el piso. */
const NO_CRECER = [[1388, 748, 1430, 768]];
/** Filete blanco entre las hojas del logo: el relleno lo recorria desde el hueco en V. */
const NO_RELLENAR_CLARO = [[1292, 748, 1302, 786]];
/** Cara redondeada del zocalo frente a la bahia (distrito 20): en sombra, sin escalon con el piso. */
const ELIPSES = [[1149, 817, 15, 12]];

const { data, info } = await sharp(ENTRADA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const N = info.channels;
const P = W * H;

// --- 1. Modelo del fondo -----------------------------------------------------

function promedio(x0, y0, x1, y1) {
  const suma = [0, 0, 0];
  let n = 0;
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * W + x) * N;
      suma[0] += data[i];
      suma[1] += data[i + 1];
      suma[2] += data[i + 2];
      n += 1;
    }
  return suma.map((v) => v / n);
}

function suavizar(valores, radio) {
  return valores.map((_, i) => {
    const suma = [0, 0, 0];
    let n = 0;
    for (let k = Math.max(0, i - radio); k <= Math.min(valores.length - 1, i + radio); k += 1) {
      suma[0] += valores[k][0];
      suma[1] += valores[k][1];
      suma[2] += valores[k][2];
      n += 1;
    }
    return suma.map((v) => v / n);
  });
}

const arriba = suavizar(Array.from({ length: W }, (_, x) => promedio(x, 0, x, 3)), 40);
const abajo = suavizar(Array.from({ length: W }, (_, x) => promedio(x, H - 4, x, H - 1)), 40);
const izquierda = suavizar(Array.from({ length: H }, (_, y) => promedio(0, y, 3, y)), 30);
const derecha = suavizar(Array.from({ length: H }, (_, y) => promedio(W - 4, y, W - 1, y)), 30);

const fondo = new Float32Array(P * 3);
for (let y = 0; y < H; y += 1) {
  const v = y / (H - 1);
  for (let x = 0; x < W; x += 1) {
    const u = x / (W - 1);
    for (let c = 0; c < 3; c += 1) {
      fondo[(y * W + x) * 3 + c] =
        (1 - v) * arriba[x][c] + v * abajo[x][c] + (1 - u) * izquierda[y][c] + u * derecha[y][c] -
        ((1 - u) * (1 - v) * arriba[0][c] + u * (1 - v) * arriba[W - 1][c] +
          (1 - u) * v * abajo[0][c] + u * v * abajo[W - 1][c]);
    }
  }
}

// --- Medidas por pixel -------------------------------------------------------

const brillo = new Float32Array(P);
for (let i = 0; i < P; i += 1)
  brillo[i] = 0.299 * data[i * N] + 0.587 * data[i * N + 1] + 0.114 * data[i * N + 2];

// Sobel sobre el brillo, en "niveles por pixel".
const gradiente = new Float32Array(P);
for (let y = 1; y < H - 1; y += 1)
  for (let x = 1; x < W - 1; x += 1) {
    const i = y * W + x;
    const gx = (brillo[i - W + 1] + 2 * brillo[i + 1] + brillo[i + W + 1] -
      brillo[i - W - 1] - 2 * brillo[i - 1] - brillo[i + W - 1]) / 8;
    const gy = (brillo[i + W - 1] + 2 * brillo[i + W] + brillo[i + W + 1] -
      brillo[i - W - 1] - 2 * brillo[i - W] - brillo[i - W + 1]) / 8;
    gradiente[i] = Math.hypot(gx, gy);
  }

/** Diferencia media con el fondo (negativa: mas oscuro). */
const diferencia = (i) =>
  ((data[i * N] - fondo[i * 3]) + (data[i * N + 1] - fondo[i * 3 + 1]) + (data[i * N + 2] - fondo[i * 3 + 2])) / 3;
/** Alfa minimo que explica el pixel como una sombra (negro translucido) sobre el fondo. */
function alfaSombra(i) {
  let a = 0;
  for (let c = 0; c < 3; c += 1) {
    const f = fondo[i * 3 + c];
    const v = data[i * N + c];
    if (v < f) a = Math.max(a, (f - v) / f);
  }
  return a;
}
/** Cuanto mas claro que el fondo es el canal mas claro. */
function masClaro(i) {
  let m = 0;
  for (let c = 0; c < 3; c += 1) m = Math.max(m, data[i * N + c] - fondo[i * 3 + c]);
  return m;
}

const enRect = (i, [x0, y0, x1, y1]) => {
  const x = i % W;
  const y = (i / W) | 0;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
};
const enElipse = (i, [cx, cy, rx, ry]) => {
  const x = i % W;
  const y = (i / W) | 0;
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
};
const protegido = (i) =>
  (NO_RELLENAR_CLARO.some((r) => enRect(i, r)) && masClaro(i) > 6) || ELIPSES.some((e) => enElipse(i, e));
const sinCrecer = (i) => NO_CRECER.some((r) => enRect(i, r));

// --- 2. Exterior: relleno desde los bordes -----------------------------------

const exterior = new Uint8Array(P);
const cola = new Int32Array(P);
let cabeza = 0;
let final = 0;

function recorrible(i) {
  if (protegido(i)) return false;
  const g = gradiente[i];
  const d = diferencia(i);
  return (g < G_SUAVE && d > -75) || (d > -5 && g < G_SUAVE * 2);
}
function sembrar(i) {
  if (!exterior[i] && recorrible(i)) {
    exterior[i] = 1;
    cola[final++] = i;
  }
}
const vecinos = (i) => {
  const x = i % W;
  const y = (i / W) | 0;
  return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
};

for (let x = 0; x < W; x += 1) {
  sembrar(x);
  sembrar((H - 1) * W + x);
}
for (let y = 0; y < H; y += 1) {
  sembrar(y * W);
  sembrar(y * W + W - 1);
}
while (cabeza < final) for (const j of vecinos(cola[cabeza++])) if (j >= 0) sembrar(j);

// Manchas chicas de "figura" sueltas en el fondo (ruido, restos de ondas).
const visto = new Uint8Array(P);
for (let s = 0; s < P; s += 1) {
  if (exterior[s] || visto[s]) continue;
  const mancha = [s];
  visto[s] = 1;
  for (let k = 0; k < mancha.length; k += 1)
    for (const j of vecinos(mancha[k]))
      if (j >= 0 && !exterior[j] && !visto[j]) {
        visto[j] = 1;
        mancha.push(j);
      }
  if (mancha.length < ISLA_MAX) for (const i of mancha) exterior[i] = 1;
}

// --- 3. Sombras de contacto --------------------------------------------------

const pasos = new Uint8Array(P);
const piso = new Float32Array(P);
cabeza = 0;
final = 0;
for (let i = 0; i < P; i += 1)
  if (exterior[i]) {
    cola[final++] = i;
    piso[i] = brillo[i];
  }
while (cabeza < final) {
  const i = cola[cabeza++];
  if (pasos[i] >= CRECER_MAX) continue;
  const x = i % W;
  const y = (i / W) | 0;
  for (const j of [x > 0 ? i - 1 : -1, y > 0 ? i - W : -1]) {
    if (j < 0 || exterior[j] || protegido(j) || sinCrecer(j)) continue;
    if (brillo[j] > piso[i] + TOLERANCIA) continue;
    if (gradiente[j] > G_SOMBRA) continue;
    const a = alfaSombra(j);
    if (a <= 0.02 || a > 0.62) continue;
    if (masClaro(j) > 6) continue;
    exterior[j] = 1;
    pasos[j] = pasos[i] + 1;
    piso[j] = Math.min(piso[i], brillo[j]);
    cola[final++] = j;
  }
}

// --- Distancia de la figura al exterior (hasta BANDA + 3) --------------------

const LIMITE = BANDA + 3;
const distancia = new Uint8Array(P).fill(255);
cabeza = 0;
final = 0;
for (let i = 0; i < P; i += 1)
  if (exterior[i]) {
    distancia[i] = 0;
    cola[final++] = i;
  }
while (cabeza < final) {
  const i = cola[cabeza++];
  if (distancia[i] >= LIMITE) continue;
  for (const j of vecinos(i))
    if (j >= 0 && distancia[j] === 255) {
      distancia[j] = distancia[i] + 1;
      cola[final++] = j;
    }
}

// --- 4 y 5. Alfa y color -----------------------------------------------------

const salida = Buffer.alloc(P * 4);
for (let i = 0; i < P; i += 1) {
  const C = [data[i * N], data[i * N + 1], data[i * N + 2]];
  const B = [fondo[i * 3], fondo[i * 3 + 1], fondo[i * 3 + 2]];
  const o = i * 4;

  if (exterior[i]) {
    const aOscuro = alfaSombra(i);
    let aClaro = 0;
    for (let c = 0; c < 3; c += 1) if (C[c] > B[c]) aClaro = Math.max(aClaro, (C[c] - B[c]) / (255 - B[c]));
    if (aOscuro > 0 && aOscuro >= aClaro * ONDAS) {
      for (let c = 0; c < 3; c += 1)
        salida[o + c] = Math.max(0, Math.min(255, Math.round((C[c] - (1 - aOscuro) * B[c]) / aOscuro)));
      salida[o + 3] = Math.round(aOscuro * 255);
    } else {
      salida[o] = salida[o + 1] = salida[o + 2] = 255;
      salida[o + 3] = Math.round(Math.min(1, aClaro) * ONDAS * 255);
    }
    continue;
  }

  if (distancia[i] > BANDA) {
    salida[o] = C[0];
    salida[o + 1] = C[1];
    salida[o + 2] = C[2];
    salida[o + 3] = 255;
    continue;
  }

  // Borde: color de la figura a mas de BANDA px del exterior, en una ventana 9x9.
  const x = i % W;
  const y = (i / W) | 0;
  let F = [0, 0, 0];
  let n = 0;
  for (let dy = -4; dy <= 4; dy += 1)
    for (let dx = -4; dx <= 4; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (distancia[j] > BANDA && distancia[j] !== 0) {
        F[0] += data[j * N];
        F[1] += data[j * N + 1];
        F[2] += data[j * N + 2];
        n += 1;
      }
    }
  let alfa = distancia[i] / (BANDA + 1);
  let color = C;
  if (n > 0) {
    F = F.map((v) => v / n);
    const fb = F.map((v, c) => v - B[c]);
    const cb = C.map((v, c) => v - B[c]);
    const norma = fb[0] ** 2 + fb[1] ** 2 + fb[2] ** 2;
    if (norma > 225) {
      alfa = Math.max(0, Math.min(1, (cb[0] * fb[0] + cb[1] * fb[1] + cb[2] * fb[2]) / norma));
      color = C.map((v, c) => (alfa > 0.05 ? Math.max(0, Math.min(255, (v - (1 - alfa) * B[c]) / alfa)) : F[c]));
    }
  }
  salida[o] = Math.round(color[0]);
  salida[o + 1] = Math.round(color[1]);
  salida[o + 2] = Math.round(color[2]);
  salida[o + 3] = Math.round(alfa * 255);
}

// El ruido del fondo deja alfas de 1 a 5 (sobre 255) con colores al azar:
// no se ven sobre ningun fondo y la compresion los paga caro. A cero.
for (let i = 0; i < P; i += 1)
  if (salida[i * 4 + 3] < 6) salida[i * 4] = salida[i * 4 + 1] = salida[i * 4 + 2] = salida[i * 4 + 3] = 0;

const figura = sharp(salida, { raw: { width: W, height: H, channels: 4 } });
await figura.clone().webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(SALIDA);

let transparentes = 0;
for (let i = 0; i < P; i += 1) if (salida[i * 4 + 3] === 0) transparentes += 1;
console.log(`${SALIDA}: ${W}x${H}, ${((100 * transparentes) / P).toFixed(1)}% transparente`);

if (VISTA) {
  await sharp({ create: { width: W, height: H, channels: 3, background: FONDO_OSCURO } })
    .composite([{ input: await figura.clone().png().toBuffer() }])
    .png()
    .toFile(VISTA);
  console.log(`vista: ${VISTA}`);
}
