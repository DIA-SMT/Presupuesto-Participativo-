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
 * La contrasena sale de ADMIN_PASSWORD; si la variable no esta, la genera al
 * azar y la imprime UNA sola vez. Cuando la genera el script, la cuenta queda
 * marcada con `debe_cambiar_password`: quien la reciba tiene que cambiarla en
 * su primer ingreso.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { consultar, db } from "../src/db";
import { admins, bitacoraEquipo } from "../src/db/schema";
import { hashearPassword } from "../src/lib/password";

const ROLES = ["admin", "moderador", "lector"] as const;
type Rol = (typeof ROLES)[number];

/** Quien figura en la bitacora: el cambio no salio del panel sino de la consola. */
const AUTOR = "consola (scripts/crear-admin)";

function salirConUso(mensaje: string): never {
  console.error(`\n${mensaje}`);
  console.error(
    '\nUso: npm run crear-admin -- <correo> "<Nombre Apellido>" [admin|moderador|lector]\n' +
      "\nLa contrasena se toma de ADMIN_PASSWORD; si no esta, se genera una al azar.\n",
  );
  process.exit(1);
}

async function main() {
  const [emailCrudo, nombreCrudo, rolCrudo = "moderador"] = process.argv.slice(2);

  const email = (emailCrudo ?? "").trim().toLowerCase();
  const nombre = (nombreCrudo ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    salirConUso("Falta el correo o no tiene forma de correo.");
  }
  if (nombre.length < 3) {
    salirConUso("Falta el nombre completo (va entre comillas si tiene espacios).");
  }
  if (!ROLES.includes(rolCrudo as Rol)) {
    salirConUso(`Rol desconocido: "${rolCrudo}". Tiene que ser admin, moderador o lector.`);
  }
  const rol = rolCrudo as Rol;

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

  const desdeElEntorno = process.env.ADMIN_PASSWORD?.trim();
  const generada = !desdeElEntorno;
  const password = desdeElEntorno || randomBytes(12).toString("base64url");
  if (password.length < 12) {
    console.error("\nADMIN_PASSWORD tiene menos de 12 caracteres. Elegi una mas larga.\n");
    process.exit(1);
  }
  const passwordHash = await hashearPassword(password);

  const [existente] = await db
    .select({ id: admins.id, rol: admins.rol })
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  if (existente) {
    await db.transaction(async (tx) => {
      await tx
        .update(admins)
        .set({
          nombre,
          rol,
          passwordHash,
          activo: true,
          // Si la contrasena la eligio el entorno (una persona la escribio para
          // otra), tambien conviene que la cambie; pero al reestablecer la
          // propia con ADMIN_PASSWORD eso molestaria. Solo se exige el cambio
          // cuando la genero el script.
          debeCambiarPassword: generada,
        })
        .where(eq(admins.id, existente.id));

      await tx.insert(bitacoraEquipo).values({
        adminId: null,
        adminNombre: AUTOR,
        objetivoId: existente.id,
        objetivoEmail: email,
        accion: existente.rol === rol ? "cambio_password" : "cambio_rol",
        rolAnterior: existente.rol,
        rolNuevo: rol,
      });
    });
    console.log(`\nCuenta actualizada: ${email} (${rol}).`);
  } else {
    await db.transaction(async (tx) => {
      const [creada] = await tx
        .insert(admins)
        .values({
          email,
          nombre,
          passwordHash,
          rol,
          activo: true,
          debeCambiarPassword: generada,
        })
        .returning({ id: admins.id });

      await tx.insert(bitacoraEquipo).values({
        adminId: null,
        adminNombre: AUTOR,
        objetivoId: creada.id,
        objetivoEmail: email,
        accion: "alta",
        rolNuevo: rol,
      });
    });
    console.log(`\nCuenta creada: ${email} (${rol}).`);
  }

  if (generada) {
    console.log(
      `Contrasena provisoria: ${password}` +
        "\n\nSe imprime UNA sola vez y no queda guardada en claro en ningun lado." +
        "\nEntregala en mano; el panel va a pedir cambiarla en el primer ingreso.",
    );
  } else {
    console.log("Contrasena tomada de ADMIN_PASSWORD (no se imprime).");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FALLO:", error?.message ?? error);
    process.exit(1);
  });
