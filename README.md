# Presupuesto Participativo · San Miguel de Tucumán

Sitio nuevo del Presupuesto Participativo municipal. Reemplaza a la plataforma
anterior (DemocracyOS) con una aplicación propia que cubre el ciclo completo:
presentación de ideas por los vecinos, evaluación técnica, votación por
distrito, seguimiento de la ejecución de las obras y un chatbot de consultas
que responde únicamente con los datos publicados.

**Stack:** Next.js 16 (App Router) + Drizzle ORM sobre Postgres
(**Supabase** en producción, **PGlite** embebido en desarrollo, sin Docker) +
MapLibre GL + **OpenRouter** para las funciones de lenguaje. Pensado para
desplegarse en **Vercel**.

> El trabajo en curso está planificado en dos documentos, con el orden de las
> tandas y las decisiones ya tomadas:
> **[PLAN-BACKOFFICE.md](PLAN-BACKOFFICE.md)** (tablero, revisión de propuestas,
> aviso al vecino, roles) y **[PLAN-IA.md](PLAN-IA.md)** (asistente de carga e
> informe de impacto).

## Qué incluye

| Área | Ruta | Descripción |
|---|---|---|
| Portada | `/` | Mapa de los 20 distritos, totales de la edición, ganadores, cronograma y novedades |
| Distritos | `/distritos` y `/distritos/7` | Página propia por distrito: sus ideas, su ganador, su mapa |
| Proyectos | `/proyectos` | Listado con filtros por distrito, categoría, estado y texto; vista con mapa |
| Ficha de proyecto | `/proyectos/<slug>` | Problema, propuesta, beneficios, votos, presupuesto y avance de obra |
| Transparencia | `/transparencia` | Qué proyecto ganó en cada distrito y con cuántos votos; datos abiertos |
| Carga de ideas | `/ideas/nueva` | Formulario con selector de punto en el mapa; el distrito se deriva solo |
| Votación | `/votar` | Empadronamiento con CIDITUC, un voto por persona en su distrito |
| Chatbot | botón flotante | Consultas en lenguaje natural sobre los datos reales del programa |
| Backoffice | `/admin` | Leer las propuestas, evaluarlas, exportarlas en PDF y mover la etapa del proceso |
| Datos abiertos | `/api/proyectos`, `/geo/distritos.geojson` | JSON/CSV y geometría oficial reutilizables |

## Cómo levantarlo (desarrollo)

Requisitos: **Node 20.9+** (la CI usa Node 24). Nada más — sin Docker, sin
Postgres instalado: en desarrollo la base es **PGlite** (Postgres embebido) y
vive en `./data/pg`, dentro de tu copia del repo.

```bash
npm install
copy .env.example .env.local   # completar SESSION_SECRET y ADMIN_*; DATABASE_URL queda vacía
npm run setup                  # crea el esquema, migra la edición 2025 y la carga en PGlite
npm run dev                    # http://localhost:3000
```

> **`.env.local` no lleva la URL de producción.** `DATABASE_URL` va vacía, y así
> `npm run dev`, el seed y todos los scripts trabajan sobre PGlite. Hasta
> septiembre de 2026 `.env.local` apuntaba a Supabase, y cualquier `npm run setup`
> o `npm run seed` reescribía la base real: reactivaba la 2025, pisaba sus ideas,
> borraba las preguntas frecuentes y el cronograma y le cambiaba la contraseña
> al admin. Ahora los scripts se defienden solos (ver
> [Tocar producción desde la terminal](#tocar-producción-desde-la-terminal)),
> pero la regla sigue: la URL de Supabase se pega en la terminal para la corrida
> que la necesita y no queda guardada en ningún archivo.

> PGlite es de proceso único: **cerrar `npm run dev` antes de correr
> `npm run seed`** (el seed lo detecta y avisa). Si la base queda inutilizable,
> se recrea con: borrar `./data/pg` y correr `npm run db:migrate && npm run seed`.

### Variables de entorno (`.env.local`)

| Variable | Qué hace |
|---|---|
| `DATABASE_URL` | **Vacía en `.env.local`**: PGlite local. La URL de Supabase va solo en las variables de Vercel y, para un script puntual, en la terminal con `--produccion` |
| `SESSION_SECRET` | Firma de sesiones y hash de DNI/IP. Mínimo 32 caracteres |
| `OPENROUTER_API_KEY` | Clave del modelo, compartida por el chat, el asistente de carga y el informe de impacto. **Sin ella nada rompe**: el chat cae al buscador determinístico y las funciones de IA quedan desactivadas |
| `OPENROUTER_MODELO` | Modelo con la forma `proveedor/modelo` (por defecto `anthropic/claude-sonnet-5`). Se puede afinar por función con `OPENROUTER_MODELO_CHAT`, `_ASISTENTE` e `_INFORME` |
| `CHAT_RATE_LIMIT` | Consultas por IP por hora (por defecto 30) |
| `AUTH_PROVIDER` | `dev` (login de prueba, solo desarrollo) o `cidituc` (la ciudadanía digital real) |
| `CIDITUC_APP` | Clave con la que la app está registrada en el Derivador (por defecto `presupuesto-participativo`) |
| `CIDITUC_INGRESO_HABILITADO` | `true` enciende el botón de ingreso. Se enciende **después** de que el Derivador despliegue la entrada de esta app |
| `CIDITUC_CA_PEM` | Cadena de Sectigo (intermedio + raíz) para hablar con `estadisticas.smt.gob.ar:5000`. Ver más abajo |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Usuario del backoffice que el seed crea en tu PGlite. En producción las cuentas se crean con `npm run crear-admin` |
| `SITE_URL` | URL pública del sitio en producción |

La etapa del proceso (ideas → evaluación → votación → seguimiento) **no** se
configura por entorno: vive en la tabla `ediciones` y se cambia desde `/admin`.

## Despliegue: Supabase + Vercel

1. **Supabase**: crear un proyecto y copiar el *connection string* del
   **Transaction pooler** (Settings → Database → Connection string, puerto
   `6543`). No hace falta habilitar ninguna extensión: el sitio no usa PostGIS
   ni unaccent (la geografía se resuelve en la aplicación).
2. **Cargar la base** — solo si el proyecto de Supabase es **nuevo y está
   vacío**: la primera carga se describe al final de la sección siguiente. La
   base que ya está en uso no se vuelve a cargar nunca: se le aplican las
   migraciones nuevas y nada más.
3. **Vercel**: importar el repo y configurar las variables de entorno del
   proyecto: `DATABASE_URL` (la del Transaction pooler), `SESSION_SECRET`,
   `OPENROUTER_API_KEY`, `AUTH_PROVIDER=cidituc` (o dejar la votación cerrada
   hasta tener CIDITUC), `SITE_URL`, `CIDITUC_CA_PEM` y, cuando el Derivador
   tenga desplegada la entrada de esta app, `CIDITUC_INGRESO_HABILITADO=true`.
   Vercel es el único lugar donde la URL de producción queda guardada.
4. El mismo código detecta la URL: con Supabase usa node-postgres (`Pool` de
   `pg`, una consulta por conexión, que es lo que tolera el pooler en modo
   transacción); sin URL usa PGlite. No hay ramas de código distintas entre
   desarrollo y producción.

### Tocar producción desde la terminal

Los scripts que escriben en la base **se niegan a correr contra una base
remota** salvo que se les pase `--produccion`: `db:migrate`, `seed`,
`crear-admin`, `purgar-contactos --confirmar`, `cambiar-etapa`,
`aplicar-geografia --aplicar` y `ver-ideas-web --borrar … --confirmar`. Con el
flag, antes de empezar muestran el host (sin usuario ni contraseña) y esperan
5 segundos, para poder cancelar con Ctrl+C si no era la base que se creía. Y al
revés: `--produccion` contra una base local también se rechaza, para que nadie
crea que purgó o migró producción cuando lo hizo en PGlite. "Remota" es
cualquier host que no sea `localhost`, `127.0.0.1` o `::1`. Una `DATABASE_URL`
que no se entiende (otro esquema, o una contraseña con `#`, `/`, `:` o `%` sin
codificar) no deja escribir ni con el flag. El candado está en
`scripts/produccion.ts`, con sus pruebas.

La URL se pone solo para esa corrida, nunca en `.env.local` (se copia del botón
*Connect* de Supabase o de las variables de Vercel):

```powershell
# PowerShell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<clave>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
npm run db:migrate -- --produccion
Remove-Item Env:DATABASE_URL
```

```bash
# Git Bash: la variable vive solo durante ese comando
DATABASE_URL="postgresql://postgres.<ref>:<clave>@aws-0-sa-east-1.pooler.supabase.com:6543/postgres" \
  npm run db:migrate -- --produccion
```

El `--` antes del flag es lo que hace que npm se lo pase al script. Sin él npm se
lo queda, el script no lo recibe y lo rechaza (avisando por qué).

| Qué se hace en producción | Cómo |
|---|---|
| Aplicar las migraciones nuevas | `npm run db:migrate -- --produccion` (ver [Cambios de esquema](#cambios-de-esquema-siempre-por-migraciones)) |
| Dar de alta una cuenta del panel | `npm run crear-admin -- correo@smt.gob.ar "Nombre Apellido" moderador --produccion` |
| Purgar los contactos de una edición cerrada | `npm run purgar-contactos` (solo muestra) y después `npm run purgar-contactos -- --confirmar --produccion` |
| Cambiar la etapa del proceso | Desde `/admin/ediciones`. `scripts/cambiar-etapa.ts` es para pruebas locales (también deja rastro en la bitácora) |
| Borrar una idea cargada en una demostración | `npx tsx scripts/ver-ideas-web.ts --borrar <número>` (muestra cuál) y después con `--confirmar --produccion` |

**`npm run setup` y `npm run seed` no se corren contra Supabase.** `setup` se
niega siempre ante una base remota, sin flag que lo habilite. `seed` con
`--produccion` solo corre si la base está **vacía** (sin ninguna edición):
existe para la primera carga de un proyecto nuevo, nunca para "poner al día" la
base que está en uso. Esa primera carga, con la URL del proyecto nuevo en la
terminal y `ADMIN_EMAIL` / `ADMIN_PASSWORD` para la primera cuenta, es
`npm run db:migrate -- --produccion`, `npm run etl` y
`npm run seed -- --produccion`.

Si el pooler en modo transacción (puerto `6543`) rechaza el DDL de una
migración, se migra por el Session pooler (puerto `5432`) — `db:migrate` lo
sugiere en el mensaje de error. La aplicación sigue usando el `6543`.

### Ingreso con CIDITUC

El login de la ciudadanía digital **no es OpenID Connect**: no hay `client_id`
ni `client_secret` que pedirle a nadie. La persona sale a la pantalla de CIDITUC
(el *Derivador*), vuelve a `/auth/cidituc/callback` con `?auth=<token>`, y el
sitio valida ese token consultando el perfil en
`estadisticas.smt.gob.ar:5000/usuarios/authStatus` — esa consulta **es** la
validación, porque el backend verifica la firma antes de responder. Todo eso
vive en `src/lib/cidituc.ts`.

Lo que falta hacer una sola vez es de DITEC, no de este repo: registrar la app
en el repo **`derivador`** (ojo, los nombres están cruzados: `cidituc.smt.gob.ar`
lo sirve el repo `derivador`, y el repo `cidituc` sirve otro dominio). En
`src/components/Login/Login.jsx`, una entrada en **cada** uno de los dos mapas:

```js
const APPS_EXTERNAS = new Map([
  ["presupuesto-participativo", {
    nombre: "Presupuesto Participativo",
    callbackUrl: import.meta.env.VITE_APP_PRESUPUESTO_CALLBACK_URL,
  }],
]);

const RESPALDO_CALLBACK = new Map([
  ["presupuesto-participativo",
   "https://presupuestoparticipativo.smt.gob.ar/auth/cidituc/callback"],
]);
```

El respaldo hardcodeado **no es opcional**: Vite hornea las `VITE_*` al compilar
y el build de producción no las tiene, así que sin él el bundle sale con
`callbackUrl: undefined` y la persona se autentica para chocar con "Falta
configurar el regreso".

Mergear a `dev` no alcanza: hay que **desplegar** y verificarlo en el bundle
servido, no en el repo.

```bash
curl -s https://cidituc.smt.gob.ar/ | grep -oE '/assets/index-[^"]+.js'
curl -s https://cidituc.smt.gob.ar/assets/index-XXXX.js | grep -c "presupuesto-participativo"
```

Recién cuando eso devuelve algo distinto de cero se pone
`CIDITUC_INGRESO_HABILITADO=true`. Antes de ese despliegue, la persona se
autentica bien y queda varada en la pantalla de CIDITUC sin ningún mensaje: por
eso el botón no se muestra solo.

**El certificado.** `estadisticas.smt.gob.ar:5000` manda la cadena completa o
solo el certificado final según por dónde se llegue; desde Vercel llega sin el
intermedio y Node corta con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Por eso
`CIDITUC_CA_PEM` lleva el intermedio y el raíz de Sectigo, que son públicos:

```bash
openssl s_client -connect estadisticas.smt.gob.ar:5000 -showcerts </dev/null
# el 2do y 3er bloque BEGIN/END CERTIFICATE, concatenados
```

Esos certificados se **suman** a las raíces que ya trae Node, no las
reemplazan: la opción `ca` pisa el almacén entero, y pasando solo la cadena de
Sectigo el raíz R46 queda sin ancla (viene firmado por USERTrust, no por sí
mismo) y la conexión muere con `UNABLE_TO_GET_ISSUER_CERT`. Medido contra el
backend real. La verificación TLS **nunca** se desactiva: no hay ninguna
`rejectUnauthorized: false` en el código, ni siquiera para desarrollo.

La guía completa, con todas las trampas, es `docs/integrar-cidituc.md` del
proyecto Landing Elecop (Dirección de IA).

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
- **Funciones de lenguaje**: todas pasan por `src/lib/modelo.ts`, que habla con
  **OpenRouter** (API compatible con OpenAI) y elige el modelo por entorno. Ese
  módulo concentra el cliente, el timeout, la traducción de errores y la cuenta
  de tokens; ninguna función arma el suyo.
- **Chatbot**: `POST /api/chat` (streaming SSE). Usa *tool use*: el modelo no
  recibe la base entera sino cinco herramientas
  (`buscar_proyectos`, `detalle_proyecto`, `resumen_distrito`, `ubicar_barrio`,
  `estadisticas`) que llaman exactamente a las mismas consultas que las
  páginas. Si un dato no está cargado, la herramienta lo dice y el asistente
  lo repite en lugar de inventarlo. La clave de API nunca llega al navegador.
  Sin clave configurada, el endpoint responde con un buscador determinístico
  (`src/lib/chat-sin-ia.ts`). Cada consulta queda registrada (pregunta,
  herramientas usadas, tokens, latencia, IP hasheada) en `chat_consultas`. El
  panel **no** tiene pantalla para leer esa tabla: la tenía (`/admin/consultas`)
  y se borró porque mostraba sobre todo las llamadas del asistente de carga, con
  el JSON crudo de cada propuesta. Para consultarla hay que ir a la base.
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
   publicarlos existe en la base, pero el panel ya no tiene pantalla para
   cargarlos (`/admin/obras` se borró al recortar el backoffice).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run setup` | Solo desarrollo: comprueba que la base sea local y corre `db:migrate` + `etl` + `seed` |
| `npm run db:generate` | Genera la migración SQL a partir de `src/db/schema.ts` |
| `npm run db:migrate` | Aplica las migraciones pendientes de `drizzle/` |
| `npm run etl` | Regenera el dataset limpio y el reporte de limpieza (no toca la base) |
| `npm run seed` | Carga la edición 2025 en la base de desarrollo. Pisa contenido: no es para producción |
| `npm run crear-admin` | Crea o actualiza **una** cuenta del panel, con fila en la bitácora del equipo |
| `npm run purgar-contactos` | Borra el contacto de los autores de las ediciones cerradas; sin `--confirmar` solo muestra |
| `npm test` | Pruebas (normalización, geografía, reglas de votación y de revisión, candado de producción). Las que usan base levantan una PGlite descartable |
| `npm run typecheck` | Genera los tipos de Next (`next typegen`) y corre TypeScript sin emitir |
| `npm run lint` | ESLint con la configuración de Next (`eslint .`) |

Los que escriben en la base piden `--produccion` para correr contra una base
remota: ver [Tocar producción desde la terminal](#tocar-producción-desde-la-terminal).

Cada push y cada pull request corre `typecheck`, `test` y `lint` en GitHub
Actions (`.github/workflows/ci.yml`), con Node 24 y sin ningún secreto. El lint
todavía no bloquea el merge (ver Pendientes).

### Cambios de esquema: siempre por migraciones

Desde que existe la carpeta `drizzle/`, **todo cambio en `src/db/schema.ts` va
por migración versionada**: editar el esquema, correr `npm run db:generate`
(crea el SQL en `drizzle/` con un nombre descriptivo), revisar ese SQL, y
aplicarlo con `npm run db:migrate`. La migración se commitea junto con el
cambio del esquema.

Eso la aplica en tu PGlite. A producción llega después, con la URL de Supabase
en la terminal solo para esa corrida: `npm run db:migrate -- --produccion` (ver
[Tocar producción desde la terminal](#tocar-producción-desde-la-terminal)). Es
el único script que se corre contra Supabase como parte del trabajo de todos
los días.

No usar `drizzle-kit push` (por eso no hay script para eso): `push` empuja el
esquema sin dejar registro, y la base de producción lleva la cuenta de qué
migraciones tiene aplicadas en `drizzle.__drizzle_migrations`. Un `push` por
fuera desincroniza ese registro y la próxima migración de otra persona falla o,
peor, pisa un cambio. Regla corta: si tocaste `schema.ts`, tu PR incluye un
archivo nuevo en `drizzle/`.

## Pendientes conocidos

- **CIDITUC**: el flujo está implementado y probado contra el backend real
  (token falso → 401 → error propio), pero falta lo que no depende de este repo:
  que DITEC registre la app en el Derivador y lo **despliegue**. Hasta entonces
  `CIDITUC_INGRESO_HABILITADO` queda en `false`. Falta además decidir **de dónde
  sale el distrito** de cada votante: CIDITUC devuelve documento, nombre y
  contacto, no domicilio, así que hoy quien ingresa cae en la pantalla "Falta tu
  distrito" salvo que el padrón ya lo tenga cargado.
- **Reglamento**: la página existe con las reglas confirmadas, pero el texto
  oficial completo hay que conseguirlo y cargarlo en el texto `reglamento-cuerpo`,
  hoy directamente en la base (la pantalla que lo editaba se borró).
- **Teselas del mapa**: cambiar OSM por un proveedor con términos adecuados
  antes de salir a producción (ver arriba).
- **Contenido de ideas no ganadoras**: el relevamiento solo recuperó el texto
  completo de los 19 ganadores; las demás ideas tienen título, barrio, estado y
  votos. Si el municipio conserva los textos, se cargan por el admin.
- **7 ideas con distrito dudoso**: listadas en `data/reporte-limpieza.md`,
  requieren confirmación del equipo.
- **Lint con errores previos**: `npm run lint` volvió a correr (antes usaba
  `next lint`, que Next 16 eliminó), y encontró errores que ya estaban en `src/`.
  La mayoría son de `react-hooks/rules-of-hooks`: los hooks propios se llaman
  `usar…` y las herramientas de React solo reconocen como hook lo que empieza con
  `use`. Mientras no se resuelvan, el paso de lint de la CI no bloquea.
