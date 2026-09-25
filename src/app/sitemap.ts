import type { MetadataRoute } from "next";
import { getFichasPublicadas } from "@/db/queries";
import { conEdicion } from "@/lib/ediciones";
import { urlDelSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

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
    // Las fichas de TODAS las ediciones, no solo de la activa: al activarse la
    // 2026, los 19 ganadores 2025 (las obras que se estan ejecutando) salian del
    // sitemap. Cada una con la URL que declara como canonica su pagina: la de la
    // activa sin parametro, las demas con `?edicion=AAAA`.
    const fichas = await getFichasPublicadas();
    return [
      ...fijas,
      ...distritos,
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
