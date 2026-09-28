/**
 * Genera el Migue de la burbuja del chat a partir del dibujo entero.
 *
 * La burbuja es un circulo del que Migue "sale": el pelo asoma por arriba del
 * borde y el resto del cuerpo queda adentro. Para eso el recorte tiene dos
 * partes:
 *
 *  - arriba de la linea del centro del circulo no se recorta nada: la cabeza
 *    puede pasar por encima del borde;
 *  - abajo de esa linea solo queda lo que cae adentro del circulo: los hombros
 *    del buzo, que en el dibujo se abren mas alla, se cortan con el borde
 *    redondo (suavizado, sin serrucho).
 *
 * El circulo en si NO esta en la imagen: lo dibuja el CSS detras (ver
 * src/components/Chat.tsx), asi toma los colores del tema. La imagen es el
 * cuadro de ANCHO x ALTO de abajo, con el circulo apoyado en su base y del
 * mismo ancho: el CSS solo tiene que respetar esa proporcion.
 *
 * El centro y el radio salen de medir el dibujo (la caja de los pixeles con
 * alfa): la cara queda en el medio y la mano que saluda entra entera por la
 * izquierda. Si se cambia el dibujo, hay que volver a medirlos.
 *
 * Uso:
 *   node scripts/migue-burbuja.mjs
 * Lee     public/images/presupuesto-participativo/migue-saludo.webp
 * Escribe public/images/presupuesto-participativo/migue-burbuja.webp
 */
import path from "node:path";
import sharp from "sharp";

const CARPETA = path.join(process.cwd(), "public/images/presupuesto-participativo");
const ENTRADA = path.join(CARPETA, "migue-saludo.webp");
const SALIDA = path.join(CARPETA, "migue-burbuja.webp");

/** El circulo, en pixeles del dibujo original (1254 x 1254). */
const CENTRO_X = 625;
const CENTRO_Y = 690;
const RADIO = 490;
/** Hasta donde llega el pelo: lo que asoma por arriba del circulo. */
const TOPE = 56;

/** Ancho de la imagen que se publica: sobra para una burbuja de 64 px en 4x. */
const ANCHO_FINAL = 384;

const x0 = CENTRO_X - RADIO;
const ancho = 2 * RADIO;
const alto = CENTRO_Y + RADIO - TOPE;

const { data, info } = await sharp(ENTRADA)
  .extract({ left: x0, top: TOPE, width: ancho, height: alto })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Centro del circulo dentro del recorte.
const cx = RADIO - 0.5;
const cy = CENTRO_Y - TOPE - 0.5;
for (let y = 0; y < info.height; y += 1) {
  if (y < cy) continue; // arriba del centro: la cabeza puede salir del circulo
  for (let x = 0; x < info.width; x += 1) {
    const distancia = Math.hypot(x - cx, y - cy);
    // Borde suavizado: el pixel que el borde corta por la mitad queda a medias.
    const cobertura = Math.min(1, Math.max(0, RADIO - distancia + 0.5));
    if (cobertura < 1) {
      const i = (y * info.width + x) * 4 + 3;
      data[i] = Math.round(data[i] * cobertura);
    }
  }
}

const altoFinal = Math.round((alto * ANCHO_FINAL) / ancho);
await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(ANCHO_FINAL, altoFinal)
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile(SALIDA);

console.log(
  `${path.relative(process.cwd(), SALIDA)}: ${ANCHO_FINAL}x${altoFinal} ` +
    `(circulo del ancho completo, apoyado en la base; asoma ${((alto - ancho) / ancho * 100).toFixed(1)}% por arriba)`,
);
