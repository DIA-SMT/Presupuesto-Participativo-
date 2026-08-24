/**
 * Imagen de Open Graph del sitio: la tarjeta que aparece cuando alguien
 * comparte el link en WhatsApp, X o Facebook. Antes no habia ninguna, asi que
 * el sitio se compartia sin previsualizacion.
 *
 * Se genera con ImageResponse (Satori) en lugar de subir un PNG hecho a mano,
 * para que el texto se pueda corregir sin volver a exportar una imagen. Next la
 * cachea: no consulta la base ni depende de la edicion activa, asi que la
 * tarjeta no queda desactualizada ni se rompe si la base no responde.
 *
 * Notas de Satori (no es un navegador):
 *  - Solo flexbox y un subconjunto de CSS. No hay `grid` ni `filter`, por eso
 *    la marca usa el archivo blanco oficial y no el de color con un filtro.
 *  - Las variables CSS del tema no se resuelven: los colores van literales y
 *    son los oficiales (ver los tokens --logo-* de globals.css).
 *  - La fuente es la que trae @vercel/og (Geist Regular), en un solo peso: la
 *    jerarquia se hace con tamano y opacidad, no con negritas. Cuando el sitio
 *    autohospede Poppins con next/font, conviene pasarle ese .ttf en `fonts`.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "Presupuesto Participativo de San Miguel de Tucumán: vos decidís en qué se invierte tu barrio";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

/** Lockup municipal en blanco, para fondo oscuro. */
const logo = await readFile(join(process.cwd(), "public/marca/logo-smt-blanco.png"));
const logoBase64 = `data:image/png;base64,${logo.toString("base64")}`;

export default async function Imagen() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          // Mismo degrade que la portada del sitio (marca-950 -> marca-800 -> azul oficial).
          backgroundImage:
            "linear-gradient(150deg, #0a2450 0%, #0b429c 45%, #0166ff 100%)",
          color: "#ffffff",
          fontSize: 32,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "block",
              fontSize: 24,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Municipalidad de San Miguel de Tucumán
          </div>

          {/* Filete amarillo del isotipo: ancla la marca sin repetir el logo. */}
          <div
            style={{
              display: "flex",
              width: 96,
              height: 8,
              marginTop: 28,
              borderRadius: 4,
              backgroundColor: "#f4dc00",
            }}
          />

          <div
            style={{
              display: "block",
              marginTop: 32,
              fontSize: 92,
              lineHeight: 1.04,
              letterSpacing: -2,
            }}
          >
            Presupuesto Participativo
          </div>

          <div
            style={{
              display: "block",
              marginTop: 24,
              fontSize: 40,
              color: "rgba(255,255,255,0.88)",
            }}
          >
            Vos decidís en qué se invierte tu barrio
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoBase64} alt="" height={78} width={192} />
          <div
            style={{
              display: "block",
              fontSize: 26,
              color: "rgba(255,255,255,0.72)",
            }}
          >
            20 distritos · propuestas de vecinos y vecinas
          </div>
        </div>
      </div>
    ),
    size,
  );
}
