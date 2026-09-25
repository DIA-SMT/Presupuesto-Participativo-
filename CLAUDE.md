# Presupuesto Participativo SMT

Sitio del Presupuesto Participativo de San Miguel de Tucumán. Next.js 16
(App Router) + Drizzle sobre Postgres (Supabase en producción, PGlite embebido
en desarrollo — sin Docker) + MapLibre + funciones de lenguaje (chat, asistente
de carga, informe de impacto) por **OpenRouter** con el SDK de OpenAI, todas a
través de `src/lib/modelo.ts`. Leer el `README.md` para el mapa completo del proyecto.

## Comandos

- `npm run dev` — desarrollo (la base embebida se abre sola; correr `npm run setup` la primera vez)
- `npm run setup` — arranque desde cero de la base de desarrollo: esquema + ETL + seed (se niega si la base es remota)
- `npm test` — pruebas de normalización, geografía, reglas y el candado de producción (las que usan base levantan una PGlite descartable)
- `npm run typecheck` — `next typegen` + TypeScript estricto, sin emitir
- `npm run lint` — ESLint con la config de Next (hay errores previos en `src/`; en la CI no bloquea todavía)
- `npm run etl` — regenera `data/proyectos-2025.json` y el reporte de limpieza

## Convenciones del código

- Código, comentarios, nombres de tablas y variables **en español**, sin
  excepciones (el equipo que lo mantiene es hispanohablante).
- Los textos visibles usan voseo argentino ("podés", "presentá").
- Todos los datos que ven las páginas y el chatbot salen de
  `src/db/queries.ts`. No escribir SQL suelto en componentes ni rutas: agregar
  la consulta ahí, tipada.
- El chatbot (`src/app/api/chat/route.ts`) solo accede a datos por sus
  herramientas (`src/lib/chat-herramientas.ts`). Nunca darle acceso directo a
  tablas ni agregarle conocimiento hardcodeado: si un dato falta, debe decir
  que falta.
- La respuesta del modelo se renderiza sin `dangerouslySetInnerHTML`
  (`src/components/Chat.tsx` construye nodos React). Mantener eso.
- Datos de personas: DNI e IP siempre hasheados (`src/lib/empadronamiento.ts`,
  `src/lib/rate-limit.ts`). No agregar campos que guarden identificadores en
  claro. El DNI se hashea con `DNI_PEPPER`, no con `SESSION_SECRET`, y esa
  pimienta **no se rota nunca durante una edición** (cambiarla vacía el padrón).
- Todo `POST` nuevo llama a `exigirMismoOrigen` (`src/lib/origen.ts`) antes
  que nada, incluso antes del rate limit.
- Lo que se puede hacer según la etapa (sacar o meter proyectos en la boleta,
  proclamar, cambiar de etapa, activar otra edición) lo decide
  `src/lib/etapas.ts`. Una acción nueva que toque ideas votables o la etapa lo
  consulta dentro de su transacción, releyendo la etapa de la base.
- Toda consulta sobre ideas (listas, cuentas, búsquedas, el chat) excluye las
  descartadas con `NO_DESCARTADA` (`src/db/queries.ts`), también las públicas:
  una descartada no cuenta en ningún número. Solo la solapa "Descartadas" de la
  bandeja las muestra.
- La edición que muestra una página pública sale de `?edicion=AAAA`, leído con
  `src/lib/edicion-en-vista.ts`; sin el parámetro, la activa. Los enlaces
  internos de una página que muestra otra edición se arman con `conEdicion`
  (`src/lib/ediciones.ts`): el slug se repite entre ediciones.
- Un texto editable del sitio se lee con su clave literal (`textos["clave"]`) y
  la clave se suma a `src/app/admin/contenido/catalogo.ts`, que es lo que
  muestra la pantalla de Contenido. Lo exige
  `scripts/tests/contenido-catalogo.test.ts`.
- La limpieza de datos migrados es auditable: cualquier transformación nueva en
  el ETL debe registrarse en `notasMigracion` y en el reporte.

## Cosas no obvias

- La carpeta del proyecto tiene espacios: citar rutas en los comandos.
- Sin `DATABASE_URL`, la base es PGlite en `./data/pg`: **de proceso único**.
  Cerrar `npm run dev` antes de correr `npm run seed` o `npm run build`.
  Si la carpeta se corrompe, se borra y se recrea con `db:migrate` + `seed`.
- `.env.local` **no lleva la URL de producción**: `DATABASE_URL` va vacía y el
  desarrollo usa PGlite. Los scripts que escriben (`db:migrate`, `seed`,
  `crear-admin`, `purgar-contactos --confirmar`, `cambiar-etapa`,
  `aplicar-geografia --aplicar`, `ver-ideas-web --borrar … --confirmar`,
  `limpiar-pruebas --confirmar`) se
  niegan a correr contra una base remota salvo con `--produccion`
  (`npm run x -- --produccion`: sin el `--` npm se queda el flag), y con el
  flag muestran el host y esperan 5 s antes de escribir. El candado es
  `scripts/produccion.ts`: todo script nuevo que escriba en la base lo llama
  antes de la primera consulta. `setup` se niega siempre con una base remota, y
  `seed -- --produccion` solo corre sobre una base vacía. Nunca pasar
  `--produccion` ni poner la URL de Supabase sin un pedido explícito del
  usuario para esa corrida.
- El esquema se cambia con migraciones versionadas: se edita `src/db/schema.ts`,
  se corre `npm run db:generate` y el SQL de `drizzle/` **se lee antes de
  aplicarlo** con `npm run db:migrate`. `drizzle-kit push` ya no se usa: proponía
  DROPs de cualquier columna que estuviera en la base y no en el archivo. La
  migraciones `0000` a `0002` son reaplicables (`IF NOT EXISTS`, bloques `DO`)
  porque el esquema de Supabase se aplicó por fuera del runner y su registro
  quedó vacío; correrlas ahí no cambia nada y solo deja el registro al día. **De
  la `0003` en adelante no se editan a mano y no se usa `drizzle-kit push`**: un
  `push` deja la base y el registro desincronizados y rompe la migración
  siguiente.
- Con `DATABASE_URL` de Supabase (pooler, puerto 6543) el mismo código usa
  node-postgres (`Pool` de `pg`), **no** postgres.js: sobre pgbouncer en modo
  transacción postgres.js entubaba varias consultas por conexión y el pooler
  cruzaba los parámetros (ver el comentario de `src/db/index.ts`). No usar
  extensiones de Postgres: la
  geografía y la búsqueda sin tildes se resuelven en la aplicación
  (`src/lib/geo.ts`, columna `barrio_normalizado`).
- `scripts/escenario.ts <etapa>` pone la base local en una etapa del proceso,
  con ideas de ejemplo, para ver el sitio en cada una; no corre contra una base
  remota ni con flag.
- La sesión del panel se valida contra la base en cada pedido
  (`getSesionAdmin`, `src/lib/sesion.ts`): el token lleva el id de la cuenta y
  su `version_sesion`, y el rol, el nombre y si está activa salen de la fila.
  Lo que tenga que cortar las sesiones abiertas de una cuenta (baja, cambio de
  rol o de contraseña, restablecimiento) sube `version_sesion` (ver
  `src/app/admin/equipo/cuentas.ts`). En las acciones, `exigirAdmin`
  (`src/app/admin/comun.ts`) va antes de cualquier try/catch, porque con la
  contraseña provisoria redirige a `/admin/password`; solo esa pantalla, su
  acción y el layout del panel pasan `permitirPasswordProvisoria`.
- `AUTH_PROVIDER=dev` habilita un login de prueba sin verificación; el código
  lo bloquea en producción y con cualquier base remota
  (`src/lib/empadronamiento.ts`).
- Toda tabla nueva lleva `.enableRLS()` en `schema.ts`: RLS sin políticas, para
  que la Data API de Supabase no la exponga con la clave anónima (la app entra
  como dueña y no la afecta). Lo exige `scripts/tests/base-segura.test.ts`.
- La etapa del proceso vive en la tabla `ediciones` (fila `activa = true`), no
  en variables de entorno; se cambia desde `/admin`.
- Sin `OPENROUTER_API_KEY`, `/api/chat` degrada al buscador determinístico de
  `src/lib/chat-sin-ia.ts` y el asistente de carga y el informe de impacto se
  desactivan — nada debe romperse por falta de clave. El modelo sale de
  `OPENROUTER_MODELO` (o de `OPENROUTER_MODELO_CHAT`, `_ASISTENTE`, `_INFORME`
  por función); ver `src/lib/modelo.ts`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
