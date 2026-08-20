# Presupuesto Participativo SMT

Sitio del Presupuesto Participativo de San Miguel de Tucumán. Next.js 16
(App Router) + Drizzle sobre Postgres (Supabase en producción, PGlite embebido
en desarrollo — sin Docker) + MapLibre + chatbot con la API de Claude. Leer el `README.md` para el mapa completo del proyecto.

## Comandos

- `npm run dev` — desarrollo (la base embebida se abre sola; correr `npm run setup` la primera vez)
- `npm run setup` — arranque desde cero: esquema + ETL + seed
- `npm test` — pruebas de normalización y geografía (no necesitan base)
- `npm run typecheck` — TypeScript estricto, sin emitir
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
  claro.
- La limpieza de datos migrados es auditable: cualquier transformación nueva en
  el ETL debe registrarse en `notasMigracion` y en el reporte.

## Cosas no obvias

- La carpeta del proyecto tiene espacios: citar rutas en los comandos.
- Sin `DATABASE_URL`, la base es PGlite en `./data/pg`: **de proceso único**.
  Cerrar `npm run dev` antes de correr `npm run seed` o `npm run build`.
  Si la carpeta se corrompe, se borra y se recrea con `db:push` + `seed`.
- Con `DATABASE_URL` de Supabase (pooler, puerto 6543) el mismo código usa
  postgres.js con `prepare: false`. No usar extensiones de Postgres: la
  geografía y la búsqueda sin tildes se resuelven en la aplicación
  (`src/lib/geo.ts`, columna `barrio_normalizado`).
- `AUTH_PROVIDER=dev` habilita un login de prueba sin verificación; el código
  lo bloquea en producción (`src/lib/empadronamiento.ts`).
- La etapa del proceso vive en la tabla `ediciones` (fila `activa = true`), no
  en variables de entorno; se cambia desde `/admin`.
- Sin `ANTHROPIC_API_KEY`, `/api/chat` degrada al buscador determinístico de
  `src/lib/chat-sin-ia.ts` — el chat nunca debe romperse por falta de clave.
