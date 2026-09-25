/**
 * Que un POST con la cookie de la persona haya salido de ESTE sitio.
 *
 * Por que hace falta aunque la cookie sea SameSite=Lax
 * ----------------------------------------------------
 * "Lax" frena los pedidos que vienen de OTRO SITIO, y para el navegador el
 * sitio no es el host sino el dominio registrable. `gob.ar` esta en la Public
 * Suffix List, asi que el sitio es `smt.gob.ar` entero: una pagina en
 * cualquier `*.smt.gob.ar` cuenta como el mismo sitio y la cookie de sesion
 * viaja en sus POST. Si uno de esos sistemas tiene una falla, un formulario
 * escondido ahi puede votar o cargar ideas con la sesion del vecino.
 *
 * Y un formulario HTML si puede mandar algo que parece JSON: con
 * `enctype="text/plain"` y un campo bien elegido, el cuerpo sale como
 * `{"slug":"...","x":"="}` y `request.json()` lo acepta sin quejarse.
 *
 * Las dos comprobaciones, y por que las dos
 * -----------------------------------------
 *  1. `Origin` igual a este sitio. El navegador lo manda SIEMPRE en un POST,
 *     tambien en un fetch del mismo origen (lo exige el estandar Fetch para todo
 *     metodo que no sea GET ni HEAD), y una pagina no lo puede falsificar. Sin
 *     `Origin` no se acepta: los pedidos de esta API los hace el navegador, y
 *     un script que quiera usarla puede mandarlo.
 *  2. `Content-Type: application/json`. Un formulario no puede ponerlo (solo
 *     manda urlencoded, multipart o text/plain), y un fetch de otro origen que
 *     lo ponga dispara un preflight CORS que este sitio no contesta. Es la
 *     segunda llave por si la primera falla en algun navegador viejo.
 *
 * Se compara el HOST (con el puerto), no el origen entero, igual que hace Next
 * con las Server Actions (node_modules/next/dist/server/app-render/action-handler.js):
 * detras del proxy que termina el TLS, el pedido puede llegar al servidor como
 * http:// aunque la persona este en https://, y comparar el esquema rechazaria
 * pedidos legitimos. Los hosts aceptados son el de la URL del pedido, los
 * encabezados `Host` y `X-Forwarded-Host` (que una pagina ajena no puede poner
 * en el navegador de otro: el primero lo pone el navegador y el segundo pide un
 * preflight) y el de SITE_URL si esta configurada, para cuando el proxy no
 * reenvia el host publico.
 *
 * Donde se usa: POST /api/votos, POST /api/ideas y el login de prueba
 * (POST /api/auth/ingresar).
 */

/** El host de una URL, o null si no se puede leer. */
function hostDe(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Los hosts que cuentan como "este sitio" para este pedido. */
function hostsPropios(request: Request): Set<string> {
  const hosts = new Set<string>();
  const agregar = (valor: string | null | undefined) => {
    const limpio = valor?.split(",")[0]?.trim().toLowerCase();
    if (limpio) hosts.add(limpio);
  };
  agregar(hostDe(request.url));
  agregar(request.headers.get("host"));
  agregar(request.headers.get("x-forwarded-host"));
  agregar(hostDe(process.env.SITE_URL?.trim()));
  return hosts;
}

/**
 * Si el pedido viene de una pagina de este sitio.
 *
 * `Origin: null` (iframes con sandbox, algunas redirecciones) tampoco pasa:
 * no dice de donde viene, y aca eso alcanza para no aceptarlo.
 */
export function mismoOrigen(request: Request): boolean {
  const origen = request.headers.get("origin");
  if (!origen || origen === "null") return false;
  const host = hostDe(origen);
  return host !== null && hostsPropios(request).has(host);
}

/** Si el cuerpo se declara JSON (con o sin `; charset=...`). */
export function esJson(request: Request): boolean {
  const tipo = request.headers.get("content-type") ?? "";
  return tipo.split(";")[0].trim().toLowerCase() === "application/json";
}

/**
 * La puerta de los POST que actuan con la sesion de la persona.
 *
 * Devuelve la respuesta 403 lista para devolver, o null si el pedido pasa.
 * Va PRIMERO en la ruta, antes del rate limit: un pedido ajeno no tiene que
 * gastarle los intentos a la conexion de la persona.
 *
 *     const rechazo = exigirMismoOrigen(request);
 *     if (rechazo) return rechazo;
 */
export function exigirMismoOrigen(request: Request): Response | null {
  if (!mismoOrigen(request)) {
    return Response.json(
      {
        error:
          "No pudimos confirmar que este pedido haya salido de la página del Presupuesto Participativo, así que no lo procesamos. Recargá la página y probá de nuevo.",
      },
      { status: 403 },
    );
  }
  if (!esJson(request)) {
    return Response.json(
      { error: "El pedido tiene que llegar en formato JSON, como lo manda el sitio." },
      { status: 403 },
    );
  }
  return null;
}
