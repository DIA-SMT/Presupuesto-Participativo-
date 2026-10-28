/**
 * Crea o actualiza UNA cuenta del backoffice, y nada mas.
 *
 * A diferencia de `npm run seed`, que reescribe el contenido del sitio (textos,
 * FAQ, cronograma, ideas), este script toca unicamente la fila de `admins` que
 * corresponde al correo indicado. Es el camino para dar de alta a alguien del
 * equipo en produccion sin arriesgar el resto de la base.
 *
 *   npm run crear-admin -- correo@smt.gob.ar "Nombre Apellido" moderador
 *
 * En produccion, con la URL de Supabase en DATABASE_URL solo para esa corrida,
 * se agrega `--produccion` (en cualquier lugar despues del `--`): sin el flag el
 * script se niega a escribir en una base remota (scripts/produccion.ts).
 *
 * La contrasena la genera el script al azar (16 caracteres) y la imprime UNA
 * sola vez, y la cuenta queda marcada con `debe_cambiar_password`: quien la
 * reciba la cambia en su primer ingreso. No se toma del entorno: ADMIN_PASSWORD
 * es la del seed y vive en .env.local (ver `guardarCuentaDesdeConsola` en
 * scripts/cuenta-de-consola.ts).
 *
 * Si la cuenta ya existe, la actualiza y le cierra las sesiones abiertas del
 * panel, como un restablecimiento desde /admin/equipo: sirve tambien para una
 * cuenta comprometida o para recuperar el acceso del ultimo administrador. El
 * rol es opcional: sin el, una cuenta que ya existe conserva el suyo (una nueva
 * nace moderador), y degradar al ultimo administrador activo se rechaza, como
 * en el panel (ver `guardarCuentaDesdeConsola`).
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { consultar, db } from "../src/db";
import type { AccionEquipo } from "../src/db/queries";
import { hashearPassword } from "../src/lib/password";
import { CuentaDeConsolaRechazada, guardarCuentaDesdeConsola } from "./cuenta-de-consola";
import { exigirPermisoDeEscritura, sinFlagProduccion } from "./produccion";

const ROLES = ["admin", "moderador", "lector"] as const;
type Rol = (typeof ROLES)[number];

/** Como se lee en la consola cada fila que quedo en la bitacora. */
const QUE_SE_HIZO: Record<AccionEquipo, string> = {
  alta: "alta",
  reactivacion: "reactivada",
  cambio_rol: "cambio de rol",
  cambio_password: "contrasena restablecida",
  desactivacion: "desactivada",
};

function salirConUso(mensaje: string): never {
  console.error(`\n${mensaje}`);
  console.error(
    '\nUso: npm run crear-admin -- <correo> "<Nombre Apellido>" [admin|moderador|lector] [--produccion]\n' +
      "\nSin rol, una cuenta que ya existe conserva el suyo y una nueva nace moderador." +
      "\nLa contrasena es una provisoria al azar que se cambia en el primer ingreso." +
      "\n--produccion hace falta cuando DATABASE_URL apunta a una base remota.\n",
  );
  process.exit(1);
}

async function main() {
  // Los posicionales se leen sin el flag: asi `--produccion` puede ir en
  // cualquier lugar sin correr el correo o el rol. El rol no tiene valor por
  // defecto aca: cual corresponde depende de si la cuenta ya existe, y eso se
  // sabe recien en la transaccion (ver `guardarCuentaDesdeConsola`).
  const [emailCrudo, nombreCrudo, rolCrudo] = sinFlagProduccion(process.argv.slice(2));

  const email = (emailCrudo ?? "").trim().toLowerCase();
  const nombre = (nombreCrudo ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    salirConUso("Falta el correo o no tiene forma de correo.");
  }
  if (nombre.length < 3) {
    salirConUso("Falta el nombre completo (va entre comillas si tiene espacios).");
  }
  if (rolCrudo !== undefined && !ROLES.includes(rolCrudo as Rol)) {
    salirConUso(`Rol desconocido: "${rolCrudo}". Tiene que ser admin, moderador o lector.`);
  }
  const rolPedido = (rolCrudo as Rol | undefined) ?? null;

  // Despues de validar (un error de tipeo no tiene por que esperar la cuenta
  // regresiva) y antes de abrir ninguna conexion: contra una base remota hace
  // falta el flag. El comando va tal como se escribio, sin rol si no lo tenia:
  // con un rol inventado aca, la cuenta regresiva mostraria uno que quizas no
  // es el que queda.
  await exigirPermisoDeEscritura(
    `npm run crear-admin -- ${email} "${nombre}"${rolPedido ? ` ${rolPedido}` : ""}`,
  );

  // PGlite es de proceso unico: si `npm run dev` esta corriendo, la carpeta de
  // datos esta tomada y esta escritura la romperia.
  try {
    await consultar(sql`SELECT 1 AS ok`);
  } catch {
    console.error(
      "\nNo se pudo abrir la base. Si `npm run dev` esta corriendo, cerralo antes" +
        "\nde correr este script (PGlite no admite dos procesos a la vez).\n",
    );
    process.exit(1);
  }

  // 16 caracteres al azar: el minimo corto de la politica es para la que
  // despues elige la persona, no para esta (src/lib/politica-password.ts).
  const password = randomBytes(12).toString("base64url");
  const passwordHash = await hashearPassword(password);

  let resultado;
  try {
    resultado = await guardarCuentaDesdeConsola(db, {
      email,
      nombre,
      rol: rolPedido,
      passwordHash,
    });
  } catch (error) {
    // Una regla que frena el cambio no es una falla: se dice por que y no se
    // imprime ninguna contrasena, porque no quedo ninguna.
    if (error instanceof CuentaDeConsolaRechazada) {
      console.error(`\nNO SE ESCRIBIO NADA.\n\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  if (resultado.creada) {
    console.log(`\nCuenta creada: ${email} (${resultado.rol}).`);
  } else {
    const hechos = resultado.acciones.map((accion) => QUE_SE_HIZO[accion]).join(", ");
    console.log(
      `\nCuenta actualizada: ${email} (${resultado.rol}): ${hechos}.` +
        "\nSi tenia el panel abierto, esas sesiones se cerraron.",
    );
  }

  console.log(
    `Contrasena provisoria: ${password}` +
      "\n\nSe imprime UNA sola vez y no queda guardada en claro en ningun lado." +
      "\nEntregala en mano; el panel va a pedir cambiarla en el primer ingreso.\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FALLO:", error?.message ?? error);
    process.exit(1);
  });
