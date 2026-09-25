/**
 * Alta de una idea presentada por un vecino.
 *
 * La idea entra como `pendiente` y sin publicar: aparece en el sitio despues de
 * que el equipo la revise desde el backoffice. El distrito no lo elige quien
 * carga: se deriva por point-in-polygon a partir del punto marcado en el mapa.
 *
 * La creacion propiamente dicha (distrito, normalizacion, numero y slug) vive
 * en src/lib/alta-idea.ts, compartida con la carga del equipo desde el panel.
 * Aca queda lo que es de esta puerta: el origen, el tope por IP, el esquema, el
 * correo con consentimiento y los codigos HTTP de cada respuesta.
 */
import { z } from "zod";
import { getEdicionActiva } from "@/db/queries";
import { crearIdea } from "@/lib/alta-idea";
import { codigoSeguimiento, VERSION_CONSENTIMIENTO } from "@/lib/avisos";
import { consumir, hashearIp, ipDe } from "@/lib/rate-limit";
import { altaIdea } from "@/lib/idea-esquema";
import { puedeCargarFueraDeEtapa } from "@/lib/modo-prueba";
import { AVISO_POR_MAIL_HABILITADO } from "@/lib/aviso-por-mail";
import { exigirMismoOrigen } from "@/lib/origen";

export const runtime = "nodejs";

// Los minimos y los largos viven en src/lib/idea-esquema.ts, compartidos con
// el asistente de carga: si cada uno tuviera los suyos, el asistente podria
// aprobar un texto que esta ruta rechaza.
const esquema = altaIdea;

const SIN_EDICION = "No hay una edición activa.";
const ETAPA_CERRADA = "La etapa de presentación de ideas está cerrada.";

/**
 * Con los avisos por correo apagados (src/lib/aviso-por-mail.ts), el contacto
 * se saca del cuerpo ANTES de validar. Despues seria tarde en los dos sentidos:
 * un correo mal escrito haria rechazar una idea por un campo que no se usa, y
 * un correo con la casilla marcada pasaria el zod y llegaria al insert.
 */
function sinContacto(cuerpo: unknown): unknown {
  if (AVISO_POR_MAIL_HABILITADO || !cuerpo || typeof cuerpo !== "object") return cuerpo;
  const copia = { ...(cuerpo as Record<string, unknown>) };
  delete copia.autorEmail;
  delete copia.autorAvisos;
  return copia;
}

export async function POST(request: Request) {
  // Primero, antes del rate limit: un pedido armado desde otra pagina no tiene
  // que gastarle los cinco intentos a la conexion de la persona.
  const rechazo = exigirMismoOrigen(request);
  if (rechazo) return rechazo;

  const ipHash = hashearIp(ipDe(request));

  // Tope generoso, pero suficiente para frenar una carga automatizada.
  const limite = await consumir(`ideas:${ipHash}`, 5, 3600);
  if (!limite.permitido) {
    return Response.json(
      {
        error: `Ya enviaste varias ideas desde esta conexión. Probá de nuevo en ${Math.ceil(
          limite.reiniciaEn / 60,
        )} minutos.`,
      },
      { status: 429 },
    );
  }

  let datos: z.infer<typeof esquema>;
  try {
    datos = esquema.parse(sinContacto(await request.json()));
  } catch (causa) {
    const detalle =
      causa instanceof z.ZodError
        ? causa.issues.map((i) => i.path.join(".")).join(", ")
        : null;
    return Response.json(
      {
        error: detalle
          ? `Revisá estos campos: ${detalle}.`
          : "Faltan datos o hay un campo demasiado corto.",
      },
      { status: 400 },
    );
  }

  const edicion = await getEdicionActiva();
  if (!edicion) {
    return Response.json({ error: SIN_EDICION }, { status: 503 });
  }
  // Fuera de la ventana del reglamento el alta esta cerrada, salvo para el
  // equipo o con MODO_PRUEBA_IDEAS=1, que es como se muestra el circuito
  // completo con el programa en seguimiento (ver src/lib/modo-prueba.ts).
  // La excepcion se averigua una sola vez, aca: `crearIdea` vuelve a mirar la
  // etapa adentro de su transaccion (por si se cerro en el medio) y usa esta
  // misma respuesta.
  const fueraDeEtapa = edicion.etapa === "ideas" ? false : await puedeCargarFueraDeEtapa();
  if (edicion.etapa !== "ideas" && !fueraDeEtapa) {
    return Response.json({ error: ETAPA_CERRADA }, { status: 409 });
  }

  // Sin casilla marcada no hay consentimiento, y sin consentimiento no se
  // guarda el contacto (el zod ya rechaza mail sin casilla). Con los avisos
  // apagados `sinContacto` ya saco los dos campos; el interruptor se repite aca
  // para que el insert no dependa de que esa limpieza siga existiendo.
  const quiereAvisos =
    AVISO_POR_MAIL_HABILITADO && Boolean(datos.autorAvisos && datos.autorEmail);

  try {
    const creada = await crearIdea(
      {
        edicionId: edicion.id,
        titulo: datos.titulo,
        categoria: datos.categoria,
        barrio: datos.barrio,
        problema: datos.problema,
        solucion: datos.solucion,
        beneficios: datos.beneficios,
        lat: datos.lat,
        lon: datos.lon,
        canal: "web",
        autorNombre: datos.autorNombre,
        // El contacto entra SOLO con la casilla marcada. Sin consentimiento el
        // dato no se guarda, y queda registrada la version del texto aceptado.
        contacto:
          quiereAvisos && datos.autorEmail
            ? { email: datos.autorEmail, version: VERSION_CONSENTIMIENTO }
            : null,
        fecha: new Date().toISOString().slice(0, 10),
      },
      {
        etapaPermitida: ({ etapa }) =>
          etapa === "ideas" || fueraDeEtapa ? null : ETAPA_CERRADA,
      },
    );

    if (!creada.ok) {
      // Los mismos codigos y textos que respondia esta ruta antes de compartir
      // la creacion con el panel. "edicion" es la edicion activa que dejo de
      // serlo entre la lectura de arriba y la transaccion.
      const estado = { "fuera-del-ejido": 400, categoria: 400, edicion: 503, etapa: 409 }[
        creada.motivo
      ];
      return Response.json(
        { error: creada.motivo === "edicion" ? SIN_EDICION : creada.mensaje },
        { status: estado },
      );
    }

    // El codigo de seguimiento es lo unico que le permite a la persona ver
    // despues como sigue su idea: la pantalla de "idea recibida" lo muestra y
    // pide anotarlo. No se guarda en la base, se recalcula desde el id.
    return Response.json(
      {
        numero: creada.numero,
        distrito: creada.distrito,
        codigo: codigoSeguimiento(creada.id),
      },
      { status: 201 },
    );
  } catch (causa) {
    console.error("[ideas] alta fallida", causa);
    return Response.json(
      { error: "No se pudo guardar la idea. Probá de nuevo en un momento." },
      { status: 500 },
    );
  }
}
