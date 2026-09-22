/**
 * Ingreso de vecinos con CIDITUC (la ciudadania digital del municipio).
 *
 * NO es OpenID Connect, aunque se le parezca. No hay descubrimiento, ni
 * client_secret, ni intercambio de un code por un token. El flujo real, tal como
 * lo sirve el municipio, son tres pasos:
 *
 *   1. mandamos a la persona a cidituc.smt.gob.ar/#/login?next=<clave de la app>
 *   2. el Derivador la autentica y la devuelve a NUESTRO callback con ?auth=<token>
 *   3. consultamos su perfil con ese token: esa consulta ES la validacion,
 *      porque el backend verifica la firma antes de responder. Con un token
 *      falso contesta 401.
 *
 * La primera version de este sitio asumia OIDC y habria fallado contra el
 * proveedor real. Se reescribio siguiendo "Conectar tu aplicacion al login de
 * CIDITUC", la guia de integracion de la Direccion de IA (Lucas Nahuz) salida
 * del Portal del Becario de ELCOP y probada en produccion el 11/8/2026.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Agent, request as pedirHttps } from "node:https";
import { rootCertificates } from "node:tls";

/**
 * El Derivador (la pantalla de login) y el backend que valida el token.
 *
 * Van en el codigo y NO en el entorno a proposito: la URL de ingreso lleva un
 * `#` y en un archivo .env el `#` abre un comentario, asi que puesta ahi se
 * pierde `#/login` y la redireccion muere en silencio. Y el `#` no es
 * decorativo: el Derivador usa HashRouter, y sin el su router cae en la ruta
 * comodin y expulsa a la persona a ciudaddigital.smt.gob.ar.
 *
 * PERFIL es el endpoint de CIUDADANOS. Existe tambien /usuarios/authStatusIA,
 * que consulta la tabla de EMPLEADOS municipales y le devuelve 401 a cualquier
 * vecino: aca vota el vecino, asi que no se cambia por el otro "para que
 * funcione".
 */
const DERIVADOR = "https://cidituc.smt.gob.ar";
const PERFIL = "https://estadisticas.smt.gob.ar:5000/usuarios/authStatus";

/**
 * Sin timeout, un backend caido deja el callback colgado en vez de fallar con
 * un mensaje. Diez segundos alcanzan.
 */
const TIEMPO_LIMITE = 10_000;

/** Clave con la que esta app esta registrada en el Derivador. */
export function claveDeApp(): string {
  return process.env.CIDITUC_APP?.trim() || "presupuesto-participativo";
}

/**
 * El boton no lleva directo al Derivador: pasa por una ruta nuestra que planta
 * la cookie del estado y recien ahi redirige. Ver `nuevoEstado`.
 */
export const RUTA_INGRESO = "/auth/cidituc/ingresar";

/**
 * El estado que ata la vuelta a la salida.
 *
 * Sin esto, el callback abre sesion con cualquier token valido que le llegue,
 * aunque el ingreso no haya empezado en este navegador. Alguien puede pedir un
 * token con SU cuenta, no usarlo, y mandarle a otra persona el link del callback
 * con ese token colgado: la persona hace clic, el token es legitimo —CIDITUC lo
 * firmo— y queda con la sesion del otro. Si despues vota, cree que voto ella y
 * su voto sigue sin usarse.
 *
 * Con el estado, la salida deja un numero al azar en una cookie de la persona y
 * se lo pasa al Derivador, que lo devuelve; el callback los compara. Un link
 * fabricado por otro no puede traer el numero que esta en LA cookie de la
 * victima. Es lo mismo que ya hace UrbanIA.
 *
 * Dura 10 minutos y es de un solo uso. Efecto conocido y aceptado: si alguien
 * abre el ingreso en dos pestañas, la segunda pisa la cookie de la primera y la
 * vuelta de la primera falla con "estado"; el mensaje le dice que entre de nuevo.
 */
export const COOKIE_ESTADO = "pp_cidituc_estado";
export const DURACION_ESTADO = 600;

export function nuevoEstado(): string {
  return randomBytes(16).toString("hex");
}

/** Comparacion en tiempo constante: es una credencial, aunque sea de un rato. */
export function mismoEstado(uno: string | null | undefined, otro: string | null | undefined): boolean {
  if (!uno || !otro || uno.length !== otro.length) return false;
  return timingSafeEqual(Buffer.from(uno), Buffer.from(otro));
}

/**
 * El origen del Derivador.
 *
 * Es fijo, salvo en desarrollo: con CIDITUC_DERIVADOR se puede apuntar al
 * Derivador que corre en la maquina (http://localhost:5173) y probar el ingreso
 * de punta a punta. En produccion la variable se IGNORA, no se "respeta si esta"
 * — el ingreso real es uno solo, y una variable de desarrollo que igual funciona
 * en produccion es exactamente la que despues se cuela en un deploy.
 *
 * La variable lleva SOLO el origen. El `#/login?...` lo pone el codigo, asi el
 * `#` no pasa nunca por un archivo .env, donde abriria un comentario y se
 * comeria el resto de la linea.
 */
function derivador(): string {
  if (process.env.NODE_ENV !== "production") {
    const local = process.env.CIDITUC_DERIVADOR?.trim().replace(/\/$/, "");
    if (local) return local;
  }
  return DERIVADOR;
}

/**
 * La URL del Derivador para esta app.
 *
 * El `state` va DENTRO del fragmento, al lado de `next`: el Derivador usa
 * HashRouter y lee la query del hash, no la de la URL. Puesto despues del `#`
 * de la manera "normal" no lo veria nunca.
 */
export function urlDeIngreso(estado: string): string {
  const parametros = new URLSearchParams({ next: claveDeApp(), state: estado });
  return `${derivador()}/#/login?${parametros}`;
}

/**
 * Interruptor del boton.
 *
 * Mientras el Derivador no tenga DESPLEGADA la entrada de esta app, la persona
 * se autentica bien y queda varada en la pantalla de ellos, sin ningun mensaje.
 * Hasta entonces el boton no se muestra. El callback, en cambio, se publica
 * desde el primer dia: tiene que existir para poder probarlo.
 */
export function ingresoHabilitado(): boolean {
  return process.env.CIDITUC_INGRESO_HABILITADO?.trim().toLowerCase() === "true";
}

// ---------------------------------------------------------------------------
// La persona que devuelve el backend
// ---------------------------------------------------------------------------

export type PersonaCidituc = {
  /** id_persona de CIDITUC: el identificador de la persona en SU sistema. */
  id: string | null;
  /** documento_persona, ya limpio de puntos y espacios. */
  documento: string;
  nombre: string | null;
};

/**
 * Un campo de la persona, como texto.
 *
 * El backend hace `SELECT p.*` sobre MySQL, asi que `documento_persona` o
 * `id_persona` llegan como NUMERO cuando la columna es numerica. Exigir
 * `typeof === "string"` descarta documentos validos en silencio.
 */
export function texto(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  return null;
}

/**
 * Saca la persona de la respuesta.
 *
 * Cada endpoint la envuelve con una clave distinta —authStatus la manda en
 * `usuarioSinContraseña` y authStatusIA en `user`—, asi que se aceptan las dos
 * y tambien la forma plana, por si el backend cambia.
 *
 * De todo lo que trae la respuesta, que incluye permisos sobre otros sistemas,
 * se toma unicamente lo que el padron necesita: documento, nombre e id. El
 * email y el telefono NO se leen: el sitio no los usa, y lo que no se guarda no
 * se puede filtrar.
 */
export function personaDeRespuesta(cuerpo: unknown): PersonaCidituc | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const envoltorio = cuerpo as Record<string, unknown>;
  const anidada = envoltorio["usuarioSinContraseña"] ?? envoltorio.user ?? envoltorio;
  if (!anidada || typeof anidada !== "object") return null;
  const persona = anidada as Record<string, unknown>;

  const documento = texto(persona.documento_persona)?.replace(/\D/g, "") ?? "";
  // Ancho generoso a proposito: el largo exacto del documento no es asunto
  // nuestro y rechazarlo de mas es el error que ya se pago una vez.
  if (!/^\d{6,11}$/.test(documento)) return null;

  const nombre =
    [texto(persona.nombre_persona), texto(persona.apellido_persona)]
      .filter((parte): parte is string => parte !== null)
      .join(" ") || null;

  return { id: texto(persona.id_persona), documento, nombre };
}

// ---------------------------------------------------------------------------
// La consulta del perfil (que es la validacion del token)
// ---------------------------------------------------------------------------

/**
 * La cadena de certificados que el servidor no manda.
 *
 * `estadisticas.smt.gob.ar:5000` presenta un certificado valido de Sectigo para
 * `*.smt.gob.ar`, pero manda la cadena completa o solo el certificado final
 * segun por donde se llegue. Desde Vercel llega SIN el intermedio y Node corta
 * con UNABLE_TO_VERIFY_LEAF_SIGNATURE; los navegadores lo disimulan porque
 * cachean el intermedio, un servidor no.
 *
 * Con CIDITUC_CA_PEM se le aporta el intermedio y el raiz (son publicos: se
 * sacan de la propia conexion con `openssl s_client -showcerts`). La
 * verificacion sigue completa —firma, dominio, vencimiento—: solo se suple lo
 * que el servidor no manda.
 *
 * Lo que NO hay, y no se agrega: `rejectUnauthorized: false`. Con eso el token
 * viajaria a un servidor sin verificar y cualquiera en el medio podria
 * quedarselo. Tampoco existe "solo para desarrollo": una bandera asi es
 * exactamente la que despues se cuela en un deploy.
 *
 * OJO con algo que la guia no dice y se midio aca contra el backend real: la
 * opcion `ca` de Node REEMPLAZA el almacen de certificados, no lo amplia. Pasar
 * solamente la cadena de Sectigo deja sin ancla al "Root R46", que viene
 * firmado por USERTrust y no por si mismo, y la conexion muere con
 * UNABLE_TO_GET_ISSUER_CERT. Por eso se concatena con las raices que ya trae
 * Node. Las tres variantes, contra estadisticas.smt.gob.ar:5000:
 *
 *     solo el PEM              -> ERROR UNABLE_TO_GET_ISSUER_CERT
 *     raices de Node + el PEM  -> 401 (la respuesta esperada)
 *     sin ca                   -> 401 desde esta red; desde Vercel puede fallar
 */
function autoridades(): string[] | undefined {
  const pem = process.env.CIDITUC_CA_PEM?.trim();
  if (!pem) return undefined;
  // Pegado en una sola linea de .env, el PEM viene con los saltos escapados.
  const cadena = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  return [...rootCertificates, cadena];
}

type RespuestaCruda = { estado: number; cuerpo: string };

function pedirPerfil(token: string): Promise<RespuestaCruda> {
  const url = new URL(PERFIL);
  return new Promise((resolver, rechazar) => {
    const pedido = pedirHttps(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "GET",
        // El token va PELADO, sin "Bearer": con el prefijo el backend
        // responde 401 siempre.
        headers: { Authorization: token, Accept: "application/json" },
        agent: new Agent({ ca: autoridades(), keepAlive: false }),
        timeout: TIEMPO_LIMITE,
      },
      (respuesta) => {
        let cuerpo = "";
        respuesta.setEncoding("utf8");
        respuesta.on("data", (parte: string) => {
          cuerpo += parte;
          // El perfil son unos pocos kilobytes; mas que esto es otra cosa.
          if (cuerpo.length > 200_000) pedido.destroy(new Error("RESPUESTA_ENORME"));
        });
        respuesta.on("end", () => resolver({ estado: respuesta.statusCode ?? 0, cuerpo }));
      },
    );
    pedido.on("timeout", () => pedido.destroy(new Error("TIMEOUT")));
    pedido.on("error", rechazar);
    pedido.end();
  });
}

export type ResultadoPerfil =
  | { ok: true; persona: PersonaCidituc }
  | { ok: false; motivo: "token-invalido" | "sin-documento" | "sin-perfil" };

/**
 * Los fallos se registran en dos niveles, como pide la guia:
 *
 *  - el RESUMEN (codigo HTTP, codigo de error de red, variable sin configurar)
 *    siempre, tambien en produccion: sin eso un certificado roto se ve igual
 *    que todo funcionando y nos enteramos por las quejas;
 *  - el DETALLE (cuerpo de la respuesta, claves recibidas) solo en desarrollo,
 *    porque puede traer datos de la persona.
 *
 * El token no se registra nunca, en ningun nivel.
 */
function resumen(mensaje: string): void {
  console.error(`[cidituc] ${mensaje}`);
}

function detalle(mensaje: string, dato: unknown): void {
  if (process.env.NODE_ENV !== "production") console.error(`[cidituc] ${mensaje}`, dato);
}

/** Valida el token consultando el perfil, y devuelve solo lo que usamos. */
export async function consultarPerfil(token: string): Promise<ResultadoPerfil> {
  let respuesta: RespuestaCruda;
  try {
    respuesta = await pedirPerfil(token);
  } catch (causa) {
    const codigo =
      (causa as NodeJS.ErrnoException)?.code ??
      (causa instanceof Error ? causa.message : "desconocido");
    const pista = autoridades()
      ? ""
      : " (CIDITUC_CA_PEM sin configurar: si es un fallo de TLS, falta la cadena de Sectigo)";
    resumen(`no se pudo consultar el perfil: ${codigo}${pista}`);
    return { ok: false, motivo: "sin-perfil" };
  }

  if (respuesta.estado === 401) {
    resumen("el backend rechazo el token (401)");
    return { ok: false, motivo: "token-invalido" };
  }
  if (respuesta.estado < 200 || respuesta.estado >= 300) {
    resumen(`respuesta inesperada del backend (${respuesta.estado})`);
    detalle("cuerpo de la respuesta", respuesta.cuerpo.slice(0, 2000));
    return { ok: false, motivo: "sin-perfil" };
  }

  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse(respuesta.cuerpo);
  } catch {
    resumen("la respuesta del backend no es JSON");
    detalle("cuerpo de la respuesta", respuesta.cuerpo.slice(0, 2000));
    return { ok: false, motivo: "sin-perfil" };
  }

  const persona = personaDeRespuesta(cuerpo);
  if (!persona) {
    resumen("el perfil llego sin un documento usable");
    detalle(
      "claves recibidas",
      cuerpo && typeof cuerpo === "object" ? Object.keys(cuerpo as object) : typeof cuerpo,
    );
    return { ok: false, motivo: "sin-documento" };
  }

  return { ok: true, persona };
}
