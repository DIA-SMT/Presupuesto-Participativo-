/**
 * Primer paso de `npm run setup`: si la base no es local, corta ahi.
 *
 * `setup` es el arranque desde cero de una maquina de desarrollo (esquema, ETL
 * y seed de la 2025). Contra una base remota no tiene ningun uso legitimo, asi
 * que aca no hay flag que lo habilite: con DATABASE_URL remota, `setup` no
 * empieza. Cada paso tiene ademas su propio candado (scripts/produccion.ts),
 * pero sin este corte el mensaje de rechazo del primero invitaria a repetirlo
 * con `--produccion`, que es justo lo que no hay que hacer con un seed.
 */
// Primero el entorno: ver scripts/cargar-env.ts (el orden de imports importa).
import "./cargar-env";
import { destinoDeLaBase } from "./produccion";

const destino = destinoDeLaBase(process.env.DATABASE_URL);

if (destino.tipo === "desconocida") {
  console.error(`\nNO SE ESCRIBIO NADA: ${destino.descripcion}.\n`);
  process.exit(1);
}

if (destino.tipo === "remota") {
  console.error(
    `\nNO SE ESCRIBIO NADA: DATABASE_URL apunta a una base remota (${destino.descripcion}).` +
      "\n\n`npm run setup` es solo para desarrollo: carga la edicion 2025 desde cero y" +
      "\npisaria lo que el equipo cargo en esa base. Saca DATABASE_URL del entorno y" +
      "\nde .env.local para usar PGlite en ./data/pg." +
      "\n\nPara llevar migraciones a produccion: npm run db:migrate -- --produccion\n",
  );
  process.exit(1);
}

console.log(`Base de desarrollo: ${destino.descripcion}`);
