/**
 * Configuracion de ESLint (formato plano, el unico que existe en ESLint 9).
 *
 * Antes se armaba con `FlatCompat` de `@eslint/eslintrc`, que traduce configs
 * del formato viejo (.eslintrc). Desde Next 16, `eslint-config-next` ya exporta
 * arreglos en formato plano: pasarlos por el traductor hacia que el validador
 * del formato viejo intentara serializarlos y ESLint moria al cargar la config
 * ("Converting circular structure to JSON") sin revisar un solo archivo. Por
 * eso ahora se importan directo, como indica la guia de Next
 * (node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md).
 *
 * `next lint` tampoco existe mas en Next 16: el script `lint` de package.json
 * llama a `eslint` directamente.
 */
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Declarar `globalIgnores` reemplaza los ignorados por defecto de
  // eslint-config-next, asi que se repiten aca los suyos (.next, out, build,
  // next-env.d.ts) ademas de los propios del proyecto.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    // SQL y snapshots generados por drizzle-kit: no son codigo nuestro.
    "drizzle/**",
    // Copia de maplibre-gl que hace el postinstall: es la libreria compilada.
    "public/maplibre/**",
    // La base embebida de desarrollo.
    "data/pg/**",
    // Configuracion local de Claude Code. Adentro pueden vivir worktrees con
    // copias enteras del repo (.claude/worktrees/*): sin esto, `eslint .` en la
    // raiz revisaria cada archivo una vez por copia.
    ".claude/**",
  ]),
  {
    rules: {
      // El proyecto usa espanol: los identificadores con enie/tildes no aplican,
      // pero los nombres descriptivos largos si.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default config;
