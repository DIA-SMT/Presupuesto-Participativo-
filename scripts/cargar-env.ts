/**
 * Carga .env.local ANTES de que se evalue cualquier otro modulo.
 *
 * Importar este archivo como PRIMER import de todo script que use src/db:
 * los imports de ES modules se evaluan en orden textual antes del cuerpo del
 * archivo, asi que un `config()` puesto en el cuerpo corre DESPUES de que
 * src/db ya leyo process.env.DATABASE_URL (y conecto a la base equivocada).
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
