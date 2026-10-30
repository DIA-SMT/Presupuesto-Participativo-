import { redirect } from "next/navigation";

/**
 * El archivo de ediciones por año ya no existe: el programa dejo de mostrarse
 * por ediciones anuales (octubre de 2026). Los proyectos ganadores, de
 * cualquier votacion, estan en /transparencia; la ruta queda para que los
 * enlaces viejos no den 404.
 */
export default function Archivo() {
  redirect("/transparencia");
}
