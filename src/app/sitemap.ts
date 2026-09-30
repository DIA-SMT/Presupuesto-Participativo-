import type { MetadataRoute } from "next";
import { getArchivoDeEdiciones, getFichasPublicadas } from "@/db/queries";
import { conEdicion } from "@/lib/ediciones";
import { urlDelSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

/** Las vistas de una edicion que se recorren con `?edicion=AAAA`. */
const VISTAS_DE_UNA_EDICION = [
  "/proyectos",
  "/distritos",
  ...Array.from({ length: 20 }, (_, i) => `/distritos/${i + 1}`),
  "/transparencia",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = urlDelSitio();

  const fijas: MetadataRoute.Sitemap = [
    "",
    "/distritos",
    "/proyectos",
    "/transparencia",
    "/acerca-de",
    "/reglamento",
    "/archivo",
    "/ideas/nueva",
    "/ideas/seguimiento",
    "/privacidad",
  ].map((ruta) => ({ url: `${base}${ruta}`, changeFrequency: "weekly" }));

  const distritos: MetadataRoute.Sitemap = Array.from({ length: 20 }, (_, i) => ({
    url: `${base}/distritos/${i + 1}`,
    changeFrequency: "weekly" as const,
  }));

  try {
    const [archivo, fichas] = await Promise.all([getArchivoDeEdiciones(), getFichasPublicadas()]);

    // Las vistas de cada edicion anterior, no solo sus fichas: el listado, los
    // distritos y los ganadores de 2025 son una pagina distinta de los de la
    // activa, y hasta ahora solo se llegaba a ellos desde /archivo. Las
    // ediciones sin ideas publicadas no van: /archivo tampoco las muestra.
    const anteriores: MetadataRoute.Sitemap = archivo
      .filter((edicion) => !edicion.activa && edicion.ideas > 0)
      .flatMap((edicion) =>
        VISTAS_DE_UNA_EDICION.map((ruta) => ({
          url: `${base}${conEdicion(ruta, edicion.anio)}`,
          changeFrequency: "monthly" as const,
        })),
      );

    return [
      ...fijas,
      ...distritos,
      ...anteriores,
      // Las fichas de TODAS las ediciones, no solo de la activa: al activarse la
      // 2026, los 19 ganadores 2025 (las obras que se estan ejecutando) salian
      // del sitemap. Cada una con la URL que declara como canonica su pagina: la
      // de la activa sin parametro, las demas con `?edicion=AAAA`.
      ...fichas.map((ficha) => ({
        url: `${base}${conEdicion(`/proyectos/${ficha.slug}`, ficha.activa ? null : ficha.anio)}`,
        // Una edicion anterior ya no cambia salvo por un avance de obra.
        changeFrequency: ficha.activa ? ("weekly" as const) : ("monthly" as const),
      })),
    ];
  } catch {
    return [...fijas, ...distritos];
  }
}
