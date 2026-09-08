import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  DIAS_PANEL_CHAT,
  getConsultasPorTema,
  getConsultasSinResolver,
  getPreguntasRepetidasChat,
  getResumenChat,
  getUsoChatPorDia,
  listarConsultasChat,
} from "@/db/queries";
import { getSesionAdmin } from "@/lib/sesion";
import PanelMigue from "./panel";

/**
 * Panel de Migue: que le pregunta la gente al asistente y que quedo sin
 * contestar.
 *
 * Todos los datos salen de consultas tipadas de src/db/queries.ts. Aca no hay
 * SQL: la pagina solo valida el parametro de la URL, pide las seis consultas en
 * paralelo y se las pasa al panel, que solo dibuja.
 *
 * Ninguna de esas consultas devuelve como esta configurado Migue por dentro (ni
 * eso, ni contadores de uso, ni las herramientas que uso), asi que esta pantalla
 * no lo puede mostrar ni por accidente. Tampoco devuelven nada de quien
 * pregunto: ni la IP hasheada.
 *
 * No hay chequeo de rol mas alla de tener sesion, por la misma razon que la
 * bitacora: esto es de solo lectura y no expone datos personales, asi que lo
 * puede mirar cualquier rol del panel, incluido `lector`. Es justamente el rol
 * de quien redacta los textos que faltan.
 */

export const metadata: Metadata = { title: "Migue" };

/**
 * Ventanas entre las que se puede elegir. El valor de la URL NO llega a la
 * consulta tal cual: se compara contra esta lista y lo que no este cae a la
 * ventana por defecto. Una semana para ver el efecto de un cambio, un mes (la
 * ventana por defecto, que es lo que dura una etapa corta) y un trimestre para
 * mirar la edicion entera.
 */
const VENTANAS = [7, DIAS_PANEL_CHAT, 90] as const;

/** Tope de la lista de trabajo: son para leer de un tiron, no para paginar. */
const LIMITE_SIN_RESOLVER = 25;

/** Tope de las ultimas consultas en esta pantalla. El listado largo es /admin/consultas. */
const LIMITE_ULTIMAS = 15;

type Props = {
  searchParams: Promise<{ dias?: string }>;
};

export default async function AdminMigue({ searchParams }: Props) {
  const sesion = await getSesionAdmin();
  if (!sesion) redirect("/admin/ingresar");

  const parametros = await searchParams;
  const pedido = Number(parametros.dias);
  const dias = (VENTANAS as readonly number[]).includes(pedido) ? pedido : DIAS_PANEL_CHAT;

  const [resumen, temas, porDia, sinResolver, repetidas, ultimas] = await Promise.all([
    getResumenChat(dias),
    getConsultasPorTema(dias),
    getUsoChatPorDia(dias),
    // Las dos listas de preguntas NO llevan la ventana a proposito: una pregunta
    // sin contestar no caduca porque pase un mes, y "las ultimas" son las
    // ultimas.
    getConsultasSinResolver(LIMITE_SIN_RESOLVER),
    getPreguntasRepetidasChat(dias),
    listarConsultasChat(LIMITE_ULTIMAS),
  ]);

  return (
    <PanelMigue
      dias={dias}
      ventanas={VENTANAS}
      resumen={resumen}
      temas={temas}
      porDia={porDia}
      sinResolver={sinResolver}
      repetidas={repetidas}
      ultimas={ultimas}
      limiteSinResolver={LIMITE_SIN_RESOLVER}
      limiteUltimas={LIMITE_ULTIMAS}
    />
  );
}
