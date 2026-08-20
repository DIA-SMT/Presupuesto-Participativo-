# Presupuesto Participativo · San Miguel de Tucumán

Sitio nuevo del Presupuesto Participativo municipal. Reemplaza a la plataforma
anterior (DemocracyOS) con una aplicación propia que cubre el ciclo completo:
presentación de ideas por los vecinos, evaluación técnica, votación por
distrito, seguimiento de la ejecución de las obras y un chatbot de consultas
que responde únicamente con los datos publicados.

**Stack:** Next.js 16 (App Router) + Drizzle ORM sobre Postgres
(**Supabase** en producción, **PGlite** embebido en desarrollo, sin Docker) +
MapLibre GL + API de Claude para el chatbot. Pensado para desplegarse en
**Vercel**.

## Qué incluye

| Área | Ruta | Descripción |
|---|---|---|
| Portada | `/` | Mapa de los 20 distritos, totales de la edición, ganadores, cronograma y novedades |
| Distritos | `/distritos` y `/distritos/7` | Página propia por distrito: sus ideas, su ganador, su mapa |
| Proyectos | `/proyectos` | Listado con filtros por distrito, categoría, estado y texto; vista con mapa |
| Ficha de proyecto | `/proyectos/<slug>` | Problema, propuesta, beneficios, votos, presupuesto y avance de obra |
| Transparencia | `/transparencia` | Tabla de los ganadores con votos, montos y etapa; datos abiertos |
| Carga de ideas | `/ideas/nueva` | Formulario con selector de punto en el mapa; el distrito se deriva solo |
| Votación | `/votar` | Empadronamiento (CIDITUC u OIDC), un voto por persona en su distrito |
| Chatbot | botón flotante | Consultas en lenguaje natural sobre los datos reales del programa |
| Backoffice | `/admin` | Moderación de ideas, avance de obras, textos del sitio, consultas del chat |
| Datos abiertos | `/api/proyectos`, `/geo/distritos.geojson` | JSON/CSV y geometría oficial reutilizables |

## Cómo levantarlo (desarrollo)

Requisitos: **Node 20+**. Nada más — sin Docker, sin Postgres instalado: en
desarrollo la base es PGlite (Postgres embebido) y vive en `./data/pg`.

```bash
npm install
copy .env.example .env.local   # completar SESSION_SECRET y ADMIN_*
npm run setup                  # crea el esquema, migra la edición 2025 y la carga
npm run dev                    # http://localhost:3000
```

> PGlite es de proceso único: **cerrar `npm run dev` antes de correr
> `npm run seed`** (el seed lo detecta y avisa). Si la base queda inutilizable,
> se recrea con: borrar `./data/pg` y correr `npm run db:push && npm run seed`.

### Variables de entorno (`.env.local`)

| Variable | Qué hace |
|---|---|
| `DATABASE_URL` | Vacío = PGlite local. Con la URL de Supabase = Postgres real |
| `SESSION_SECRET` | Firma de sesiones y hash de DNI/IP. Mínimo 32 caracteres |
| `ANTHROPIC_API_KEY` | Clave del chatbot. **Sin ella el chat sigue funcionando** en modo buscador determinístico |
| `CHAT_MODEL` / `CHAT_EFFORT` | Modelo y esfuerzo del asistente (por defecto `claude-opus-5` / `low`) |
| `CHAT_RATE_LIMIT` | Consultas por IP por hora (por defecto 30) |
| `AUTH_PROVIDER` | `dev` (login de prueba, solo desarrollo) o `cidituc` (OIDC real) |
| `CIDITUC_*` | Credenciales OIDC que debe entregar el municipio |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario inicial del backoffice, creado por el seed |
| `SITE_URL` | URL pública del sitio en producción |

La etapa del proceso (ideas → evaluación → votación → seguimiento) **no** se
configura por entorno: vive en la tabla `ediciones` y se cambia desde `/admin`.

## Despliegue: Supabase + Vercel

1. **Supabase**: crear un proyecto y copiar el *connection string* del
   **Transaction pooler** (Settings → Database → Connection string, puerto
   `6543`). No hace falta habilitar ninguna extensión: el sitio no usa PostGIS
   ni unaccent (la geografía se resuelve en la aplicación).
2. **Cargar la base**: en la máquina local, poner esa URL en `DATABASE_URL` de
   `.env.local` y correr `npm run setup`. Eso crea el esquema y migra la
   edición 2025 directamente en Supabase.
3. **Vercel**: importar el repo y configurar las variables de entorno del
   proyecto: `DATABASE_URL` (la misma de Supabase), `SESSION_SECRET`,
   `ANTHROPIC_API_KEY`, `AUTH_PROVIDER=cidituc` (o dejar la votación cerrada
   hasta tener CIDITUC), `SITE_URL` y las `CIDITUC_*` cuando estén.
4. El mismo código detecta la URL: con Supabase usa el driver de red
   (con `prepare: false` para el pooler); sin URL usa PGlite. No hay ramas de
   código distintas entre desarrollo y producción.

## Arquitectura

- **Next.js 16 (App Router) + TypeScript.** Páginas server-rendered a demanda
  que leen la base directamente; las rutas `/api/*` sirven el chat, la carga de
  ideas, la votación y los datos abiertos.
- **Drizzle ORM** con esquema en `src/db/schema.ts` y todas las consultas en
  `src/db/queries.ts`. La geometría de los 20 distritos se guarda como GeoJSON
  y también se sirve estática en `/geo/distritos.geojson`. El distrito de
  cualquier punto se resuelve por point-in-polygon en la aplicación
  (`src/lib/geo.ts`, con tests), sin extensiones de Postgres.
- **MapLibre GL** para los mapas, con teselas raster de OpenStreetMap.
  **Para producción con tráfico real conviene cambiar el proveedor de teselas**
  (MapTiler, Mapbox o un servidor propio): la política de uso de los tiles de
  OSM no está pensada para sitios institucionales con volumen. Está aislado en
  `src/components/Mapa.tsx` (función `estilo()`), es un cambio de una línea.
- **Chatbot**: `POST /api/chat` (streaming SSE). Usa la API de Claude con
  *tool use*: el modelo no recibe la base entera sino cinco herramientas
  (`buscar_proyectos`, `detalle_proyecto`, `resumen_distrito`, `ubicar_barrio`,
  `estadisticas`) que llaman exactamente a las mismas consultas que las
  páginas. Si un dato no está cargado, la herramienta lo dice y el asistente
  lo repite en lugar de inventarlo. La clave de API nunca llega al navegador.
  Sin clave configurada, el endpoint responde con un buscador determinístico
  (`src/lib/chat-sin-ia.ts`). Cada consulta queda registrada (pregunta,
  herramientas usadas, tokens, latencia, IP hasheada) en `chat_consultas` y se
  puede revisar en `/admin/consultas`.
- **Votación**: sesión JWT en cookie httpOnly; un voto por persona garantizado
  por restricción UNIQUE en la base (no solo por lógica de aplicación); el DNI
  se guarda hasheado con pepper, nunca en claro. El proveedor `dev` permite
  probar el flujo completo sin CIDITUC y queda bloqueado en producción.
- **Rate limiting** por IP hasheada sobre una tabla de la base (sin Redis).

## Datos y migración de la edición 2025

Los datos originales vienen del relevamiento del sitio anterior
(`data/raw/`). El pipeline es:

```
data/raw/proyectos_pp2025.csv ──┐
data/contenido-ganadores.json ──┼── npm run etl ──> data/proyectos-2025.json
public/geo/distritos.geojson ───┘                   data/reporte-limpieza.md
                                                        │
                                            npm run seed ──> la base
```

Qué corrige el ETL (todo queda auditado en `data/reporte-limpieza.md` y en el
campo `notasMigracion` de cada idea, visible en la ficha pública):

1. **Coordenadas en texto libre** → lat/lon numéricos validados contra el
   ejido. Interpreta los cuatro formatos que había (par decimal, signo
   invertido, grados/minutos/segundos, proyectadas — estas últimas se
   descartan en lugar de adivinarse). Detectó además 7 ideas cuyo punto cae
   en un distrito distinto del declarado: quedan marcadas para revisión.
2. **Ideas sin coordenada** → centroide del distrito, marcadas como
   `ubicacionAproximada` (el mapa las dibuja distinto y lo aclara).
3. **Títulos** → sin marcas internas (`*`, `S/DATOS`, `- No factible`), sin
   mayúscula sostenida, con siglas y tildes restituidas.
4. **Duplicados** → 4 pares unificados dentro de su distrito; el registro
   repetido no se borra: queda despublicado y enlazado a la idea principal.
5. **Campos corridos** → en los ganadores de D2, D3, D6, D12, D14, D15 el
   problema/solución/beneficios estaban intercambiados; se reordenaron sin
   inventar el contenido faltante (queda en nulo y la ficha lo dice).
6. **Presupuesto** → el sitio anterior tenía `presupuesto-total = 1` en las
   100 ideas (relleno). No se migró ningún monto; la estructura para
   publicarlos existe y se completa desde `/admin/obras`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run setup` | `db:push` + `etl` + `seed` en un paso (idempotente) |
| `npm run db:push` | Aplica el esquema de `src/db/schema.ts` |
| `npm run etl` | Regenera el dataset limpio y el reporte de limpieza |
| `npm run seed` | Carga/actualiza la base |
| `npm test` | Pruebas de normalización y point-in-polygon |
| `npm run typecheck` | TypeScript sin emitir |

## Pendientes conocidos

- **CIDITUC**: el flujo OIDC está implementado (`/api/auth/*`) pero sin probar
  contra el IdP real; falta que el municipio entregue credenciales y el mapeo
  exacto de los claims (DNI y distrito del padrón).
- **Reglamento**: la página existe con las reglas confirmadas, pero el texto
  oficial completo hay que conseguirlo y cargarlo en el texto `reglamento-cuerpo`
  desde `/admin/contenido`.
- **Teselas del mapa**: cambiar OSM por un proveedor con términos adecuados
  antes de salir a producción (ver arriba).
- **Contenido de ideas no ganadoras**: el relevamiento solo recuperó el texto
  completo de los 19 ganadores; las demás ideas tienen título, barrio, estado y
  votos. Si el municipio conserva los textos, se cargan por el admin.
- **7 ideas con distrito dudoso**: listadas en `data/reporte-limpieza.md`,
  requieren confirmación del equipo.
