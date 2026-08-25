import { permanentRedirect } from "next/navigation";

/**
 * La bandeja de revision paso a ser la pantalla principal del panel: vive en
 * /admin. Esta ruta queda como redirect permanente (308) para no romper los
 * enlaces y marcadores que el equipo ya tiene guardados.
 *
 * El querystring se arrastra tal como viene (filtros, orden, pagina, idea
 * abierta): un link compartido sigue abriendo exactamente la misma vista. La
 * sesion la sigue verificando /admin, que es donde se termina de resolver.
 *
 * El panel (panel.tsx) sigue en esta carpeta y lo importa /admin/page.tsx.
 */
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BandejaMudada({ searchParams }: Props) {
  const parametros = await searchParams;
  const consulta = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    // Un parametro repetido llega como arreglo: se toma el primero, que es lo
    // que hace la pantalla al leerlos.
    const primero = Array.isArray(valor) ? valor[0] : valor;
    if (primero) consulta.set(clave, primero);
  }
  const cadena = consulta.toString();
  permanentRedirect(cadena ? `/admin?${cadena}` : "/admin");
}
