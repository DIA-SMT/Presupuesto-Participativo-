import type { MetadataRoute } from "next";
import { getEdicionActiva, listarIdeas } from "@/db/queries";
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
    const edicion = await getEdicionActiva();
    if (!edicion) return [...fijas, ...distritos];
    const ideas = await listarIdeas({ edicionId: edicion.id });
    return [
      ...fijas,
      ...distritos,
      ...ideas.map((idea) => ({
        url: `${base}/proyectos/${idea.slug}`,
        changeFrequency: "weekly" as const,
      })),
    ];
  } catch {
    return [...fijas, ...distritos];
  }
}
