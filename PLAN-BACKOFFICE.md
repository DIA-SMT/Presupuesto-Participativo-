# Plan del backoffice — Presupuesto Participativo SMT

Este documento explica **qué vamos a cambiar y en qué orden** para llegar al
backoffice que necesita el equipo: tablero con estadísticas, revisión de
propuestas con aviso al vecino, visualización de usuarios y roles.

El orden no es arbitrario: cada tanda se apoya en la anterior, y la primera
existe porque sin ella las demás se pisan entre sí. Lo que está marcado como
**hecho** ya está en la rama `Agustin`.

## Estado

| Tanda | Estado | Pantallas |
|---|---|---|
| 1 · Base | Hecha | — (migraciones, rate limit, filtros, devolución) |
| 2 · Ediciones y cronograma | Hecha | `/admin/ediciones` |
| 3 · Bandeja de revisión | Hecha | `/admin/bandeja` |
| 4 · Seguimiento sin mail | Hecha | `/ideas/seguimiento`, `/privacidad` |
| 5 · Tablero | Hecha | `/admin/tablero` |
| 6 · Aviso por mail | **No hecha** | depende de terceros del municipio |
| 7 · Equipo y roles | Hecha | `/admin/equipo`, `/admin/password` |

Lo que falta para poder usar todo esto:

1. **Dejar el registro de migraciones al día en Supabase** (`npm run db:migrate`).
   El esquema ya está completo — se aplicó por fuera del runner con
   `drizzle-kit push` — pero `drizzle.__drizzle_migrations` está vacío. Las
   `0000` a `0002` se hicieron reaplicables para poder correrlas sobre esa base
   sin cambiar nada; sin ese paso, la próxima migración falla en la primera
   sentencia. **No volver a usar `drizzle-kit push`**: es exactamente lo que la
   tanda 1 vino a evitar.
2. **Completar los cinco `PENDIENTE CONFIRMAR` de `/privacidad`**: responsable y
   domicilio para pedidos sobre datos personales, número de inscripción en el
   registro de la AAIP, país donde está alojada la base, canal para ejercer
   derechos, y plazo de conservación de las consultas del chatbot. Están
   marcados en la página a propósito: no los inventamos.
3. **Revisión legal** del texto de `/privacidad` y del consentimiento
   (`VERSION_CONSENTIMIENTO`, hoy `"2026-08"`) antes de publicarlos.
4. **`npm run lint` sigue roto** de antes: el script usa `next lint`, que Next 16
   eliminó, y la config de ESLint falla al cargarse. Es independiente de este
   trabajo.

---

## Tanda 1 — Base (hecha)

Cuatro arreglos que no agregan ninguna pantalla, pero sin los cuales todo lo
que sigue se construye sobre arena.

### 1.1 Migraciones versionadas en lugar de `db:push`

**Qué había:** `drizzle.config.ts` declara `out: "./drizzle"`, pero esa carpeta
no existía en el repo. El esquema se aplicaba con `drizzle-kit push`, que compara
`src/db/schema.ts` contra la base y genera el DDL en el momento.

**Por qué es un problema:** `push` no deja SQL revisable ni registro de lo que se
aplicó, y **propone borrar cualquier columna que esté en la base y no en el
archivo**. Con varias personas tocando el esquema en ramas distintas, el segundo
`push` ofrece un `DROP` de lo que agregó el primero. Contra una base con la
edición 2025 cargada, eso se paga una sola vez y no se recupera.

**Qué hicimos:**

| Archivo | Cambio |
|---|---|
| `drizzle/0000_esquema_inicial.sql` | Migración base con las 14 tablas, 5 enums, 10 FKs y 7 índices |
| `drizzle/meta/` | Snapshot y journal que drizzle usa para diferenciar |
| `scripts/migrar.ts` | Corre las migraciones pendientes; funciona con PGlite y con Postgres |
| `package.json` | `db:generate` y `db:migrate` nuevos; **`db:push` eliminado**; `setup` usa `db:migrate` |

La `0000` está **editada a mano para ser idempotente** (`CREATE TABLE IF NOT
EXISTS`, enums y FKs dentro de bloques `DO $$ … EXCEPTION WHEN duplicate_object`).
Es a propósito: cuando adoptamos el flujo, la base de Supabase ya tenía las 14
tablas y los datos del 2025. Aplicarla ahí no recrea nada — solo registra el
punto de partida en `drizzle.__drizzle_migrations`. Sobre una base vacía (PGlite
en desarrollo) crea el esquema completo.

**De la `0001` en adelante las migraciones no se editan a mano.**

Verificado sobre una PGlite descartable: crea las 14 tablas desde cero, corre dos
veces sin efecto, y aplicada sobre una base que ya tenía el esquema *y datos*
(el caso de Supabase) no toca las tablas ni pierde filas.

#### El flujo, de ahora en más

```bash
npm run db:generate
```

Después **leer** el SQL nuevo en `drizzle/` — si aparece un `DROP`, parar y
entender por qué — y recién entonces:

```bash
npm run db:migrate
```

#### Paso pendiente en Supabase

La base de producción todavía **no tiene** la tabla de migraciones: hay que
correr `npm run db:migrate` una vez contra ella para registrar el punto de
partida. Antes de hacerlo: snapshot de Supabase. Si el pooler en modo transacción
(puerto 6543) rechaza el DDL, usar el Session pooler en el 5432 — el script lo
avisa en el mensaje de error.

### 1.2 Tope de intentos en el login del backoffice

`ingresarAdmin` no tenía límite de intentos, aunque el login ciudadano de
`/api/auth/ingresar` sí lo tiene y la pieza (`src/lib/rate-limit.ts`) ya estaba
escrita. Ese login es la puerta al padrón y a los datos de contacto de los
vecinos: sin tope, una contraseña débil se rompe por fuerza bruta sin dejar
rastro.

Ahora son **10 intentos por IP cada 10 minutos**, con el mismo criterio y la
misma tabla que el resto del sitio. La IP se guarda hasheada, nunca en claro.

Para que la server action pueda leer la IP sin tener un `Request`, se agregó
`ipDeCabeceras(headers)` en `src/lib/rate-limit.ts`; `ipDe(request)` ahora
delega en ella. No cambió ningún comportamiento existente.

### 1.3 `getIdea` no devuelve ideas sin publicar

`getIdea` no filtraba por `publicada`, así que una idea recién enviada por el
formulario público ya era visible en `/proyectos/<slug>` y para el chatbot,
junto con los duplicados que el ETL despublicó a propósito.

Ahora filtra por defecto, con el mismo patrón que `listarIdeas`: el backoffice
pide `{ incluirNoPublicadas: true }` de forma explícita. La firma pasó de
`getIdea(slug, edicionId?)` a `getIdea(slug, filtro?)` — ningún llamador usaba
el segundo parámetro.

Misma corrección en la herramienta `ubicar_barrio` del chatbot
(`src/lib/chat-herramientas.ts`), que buscaba barrios sobre ideas sin publicar.

### 1.4 La devolución técnica ya no se borra sola

`motivoEstado` es el texto que el vecino lee para saber por qué su idea no fue
factible. Se guardaba como `datos.motivoEstado || null`: **guardar el formulario
con el textarea vacío borraba la devolución que ya estaba escrita**, sin
historial y sin forma de recuperarla.

Ahora, si el campo viene vacío, la columna no se toca. Una devolución se corrige
escribiendo otra, no vaciándola. El historial completo (quién la escribió y
cuándo) llega en la tanda 3, con la tabla `revisiones`.

### 1.5 Documentación corregida

`CLAUDE.md` y el `README.md` decían que con Supabase el código usa **postgres.js
con `prepare: false`**. Es falso: `src/db/index.ts` usa **node-postgres** (`Pool`
de `pg`), y su propio comentario explica que se abandonó postgres.js porque
entubaba varias consultas por conexión y pgbouncer cruzaba los parámetros. Queda
corregido en los dos archivos, porque induce a error en cualquier razonamiento
sobre transacciones o sobre el pooler.

---

## Tanda 2 — Pantalla de ediciones y cronograma (hecha)

Hoy no se puede crear la edición 2026, activarla, ni cargarle fechas y
presupuesto sin un desarrollador. La 2026 ya existe en la base (`activa = false`,
etapa `ideas`), pero no hay forma de tocarla desde `/admin`.

Va segunda porque **sin esto el ciclo 2026 no arranca**, y todo el resto del
backoffice se mira contra una edición.

- `/admin/ediciones`: crear, activar, fechas de ideas y votación, presupuesto
  total.
- Editar los hitos del cronograma (tabla `hitos`), que hoy solo entran por seed.
- Antes de agregar un índice único de "una sola edición activa", arreglar el
  seed: hoy fuerza `activa = true` en 2025 y el índice lo haría fallar, que es
  el camino de recuperación documentado.
- Cambio de contraseña propio: hoy el único camino es correr el seed con
  variables de entorno, y quien crea la cuenta conoce la contraseña para siempre.

## Tanda 3 — Bandeja de revisión (hecha)

La pieza central del pedido, y la que más decisiones de fondo tiene.

**Problema de modelo:** el enum `estado_idea` (`borrador`, `pendiente`,
`factible`, `no_factible`, `integrado`, `ganador`) no tiene un estado "en
revisión", y no queda registro de quién revisó, cuándo ni con qué criterio.

- Tabla **`revisiones`** append-only: idea, admin, acción, nota, fecha. Es la
  auditoría, y es lo que después permite decirle al vecino algo más que un
  estado.
- **Devolución obligatoria para `no_factible`**: no se puede rechazar una idea
  sin escribir por qué. Es lo que hace defendible el proceso en una asamblea.
- Publicar/despublicar pasa a ser una acción aparte del estado, con motivo.
- `proclamarGanador` validado contra el más votado del distrito, en lugar del
  checkbox actual que cambia el estado sin verificar nada.
- Separar los votos migrados del 2025 de los votos reales, y **sacar la edición
  manual del contador**. Un contador de votos editable a mano vuelve
  indefendible cualquier resultado discutido.

## Tanda 4 — Seguimiento sin mail (hecha)

**Decisión tomada: el primer canal de aviso no es el mail.** Dos razones:

1. De las 100 ideas del 2025, 89 entraron por asamblea y 10 por el municipio.
   Muchos vecinos no van a tener mail cargado, y si el mail es el único canal
   quedan sin enterarse de nada.
2. El mail depende de terceros dentro del municipio (DKIM/SPF/DMARC sobre un
   subdominio, casilla de respuesta atendida, proveedor de envío). Bloquear toda
   la funcionalidad detrás de eso la deja parada semanas.

Entonces: **código de seguimiento + página pública** donde el vecino consulta el
estado de su idea cuando quiera. El código se deriva del `id` (clave primaria,
único garantizado), **no** del campo `numero`, que es nullable y se asigna con un
`max(numero)+1` sin lock: dos altas simultáneas obtienen el mismo número.

En la misma tanda, datos personales:

- **Sacar el teléfono del formulario.** La columna `autor_telefono` se escribe
  pero ninguna consulta la lee: es pasivo legal sin ningún beneficio.
- Casilla de consentimiento **desmarcada**, con la aclaración de que no dar el
  mail no afecta la evaluación.
- Página `/privacidad` con la información previa del art. 6 de la ley 25.326
  (responsable y domicilio, finalidad de cada dato, destinatarios, carácter
  facultativo, derechos y cómo ejercerlos). Hoy **no hay una sola mención de la
  ley en todo el repo**, y sin eso el consentimiento no es válido.

## Tanda 5 — Dashboard de estadísticas (hecha)

Con la auditoría y las ediciones en su lugar, el tablero es casi todo consultas.

- Tarjetas de resumen, estadísticas por distrito y por categoría, ejecución
  presupuestaria, series de votos e ideas.
- Todas las consultas nuevas van a `src/db/queries.ts`, tipadas. En la misma
  tanda hay que **migrar el SQL suelto** que hoy vive en `admin/obras/page.tsx`
  y `admin/consultas/page.tsx`, que viola la regla de `CLAUDE.md`.
- Gráficos con SVG a mano sobre los tokens de `globals.css`. No hace falta
  agregar ninguna dependencia.
- Si el orden de una tabla se controla por querystring, mapear el parámetro
  contra una lista de columnas permitidas. Interpolarlo en el template `sql` es
  inyección directa.

### Visualización de usuarios — decisión tomada

**No se construye un listado nominal del padrón.** Es el activo más sensible del
sistema: un directorio navegable de vecinos identificados de San Miguel de
Tucumán. Para lo que el equipo necesita alcanza con:

- **Agregado por distrito** como vista por defecto.
- **Búsqueda puntual por DNI** para la mesa de ayuda: por server action o POST,
  **nunca por querystring** (queda en los logs del hosting y en el historial del
  navegador municipal), con tope de consultas y una fila de bitácora por
  búsqueda — nunca el DNI, solo los últimos 3 dígitos que ya guarda `dni_cola`.
- **Supresión de celdas chicas**: mostrar `<5` en lugar del número. Con N chico,
  un agregado más el ranking por idea puede identificar el voto de una persona;
  "es un agregado, entonces es seguro" es falso al arranque de una votación.

## Tanda 6 — Aviso por mail (NO hecha: depende de terceros)

Recién acá, y solo cuando estén DKIM/SPF/DMARC y la revisión legal del texto.

**Regla que no se negocia: ningún mail repite texto cargado por el usuario.** El
formulario de ideas es público. Si el cuerpo del mail incluye el título de la
propuesta, cualquiera puede hacer que el municipio envíe el texto que quiera, a
la dirección que quiera, con remitente institucional. El aviso dice número de
idea, distrito y link — nada más.

Además: doble opt-in, tope por destinatario y no solo por IP, lista de
supresión con su propia pimienta documentada como no rotable, manejo de rebotes,
y purga de los contactos al cerrar la edición.

## Tanda 7 — Gestión del equipo y roles (hecha)

**Discrepancia con el pedido original, a propósito:** no son dos roles, son
**dos poblaciones distintas**, y el esquema ya las separa bien — `admins` (con
contraseña scrypt y enum `rol_admin`) y `votantes` (padrón CIDITUC con DNI
hasheado). Unificarlas en una tabla `usuarios` con columna `rol` pondría las
credenciales del backoffice y el padrón de vecinos en la misma tabla, y
agrandaría la superficie del dato más sensible sin ganar nada.

`rol_admin` ya tiene tres valores (`admin`, `moderador`, `lector`) y conviene
dejarlos: `lector` es justo lo que se le da a alguien de otra dirección que
necesita mirar el tablero sin tocar nada.

Lo que falta de verdad:

- `/admin/equipo`: alta, baja y cambio de rol, con **bitácora** de quién cambió
  a quién. Reemplaza el camino actual de correr el seed con variables de
  entorno.
- Un único helper de autorización. Hoy los chequeos están dispersos en
  `acciones.ts` (`exigirEscritura`, y un chequeo aparte más estricto en
  `cambiarEtapa`), y el gate tiene que ir **por página y por server action**: en
  el App Router un layout compartido no se vuelve a renderizar al navegar entre
  rutas hermanas, así que no sirve como frontera de seguridad.

### Fuera de alcance por ahora

Suspender el empadronamiento de un vecino (`votantes.activo`) **no** se
implementa todavía. Es el acto más sensible del sistema y no es una decisión
técnica: necesita criterios escritos en el reglamento, motivo obligatorio,
notificación a la persona y un canal de apelación real. Un booleano sin eso es
peor que no tenerlo.

---

## Cosas que dependen de terceros

Conviene empezarlas en paralelo, porque no las resuelve el código:

- **DKIM, SPF y DMARC** sobre un subdominio delegado (tipo
  `avisos.smt.gob.ar`), y una casilla de respuesta atendida por una persona.
- **Revisión legal** del texto de consentimiento y de la política de privacidad.
- **Transferencia internacional de datos**: Supabase corre en Brasil y los
  proveedores de mail habituales en EEUU; ninguno está en el listado de países
  adecuados de la AAIP. Hace falta el instrumento firmado.
- **Reglamento actualizado** con lo que el código va a empezar a hacer: plazos
  de evaluación, qué se publica de las ideas rechazadas, criterios de no
  factibilidad, y qué pasa cuando una idea se integra con otra.

---

## Lo que se agregó fuera del plan original

Cosas que aparecieron al implementar y conviene tener anotadas.

**`scripts/crear-admin.ts`** — crea o actualiza una cuenta del backoffice sin
tocar nada más de la base, a diferencia del seed, que reescribe contenido del
sitio:

```bash
npm run crear-admin -- correo@smt.gob.ar "Nombre Apellido" admin
```

Toma la contraseña de `ADMIN_PASSWORD`; si no está, genera una al azar, la
imprime una sola vez y marca la cuenta para que la persona la cambie al entrar.

**`scripts/purgar-contactos.ts`** — borra el contacto del autor de las ideas de
las ediciones cerradas y deja constancia en `contacto_purgado_en`. Existe porque
`/privacidad` le promete al vecino que el correo se borra al cerrar la edición, y
sin este script esa promesa no se cumplía. Sin `--confirmar` no escribe nada:

```bash
npm run purgar-contactos
```

**Los votos migrados y los votos reales se muestran separados.** No hizo falta
partir la columna: `getResumenAdmin` devuelve `votosRegistrados` (filas de la
tabla `votos`, o sea votos emitidos por este sitio) y `votosEnIdeas` (el contador
`ideas.votos`, que incluye los 2.069 importados del 2025). El tablero muestra el
primero y aclara el segundo. Así el número no queda inflado ni desaparece.

**El código de seguimiento sale del `id`, no del `numero`.** `ideas.numero` es
nullable y se asignaba con un `max(numero)+1` sin lock: dos altas simultáneas
obtenían el mismo número. Ahora hay además un índice único sobre
`(edicion_id, numero)` — verificado que las 100 ideas del 2025 ya lo cumplían.

**Autorización unificada.** `exigirEscritura` ya no existe: todas las acciones
pasan por `exigirAdmin(<rol mínimo>)`, que **relee el rol y el estado de la
cuenta desde la base en cada request**. El JWT dura 12 horas, así que confiar en
el rol de la cookie dejaría escribir a una cuenta ya desactivada o degradada. El
gate va por página y por acción: en el App Router un layout compartido no se
vuelve a renderizar al navegar entre rutas hermanas, así que **no sirve** como
frontera de seguridad.

## Decisiones que quedaron pendientes de definición humana

- **Convivencia de `/admin` (Ideas) y `/admin/bandeja`.** Las dos editan ideas.
  La bandeja es la que deja historial; la tabla vieja quedó para edición rápida
  de presupuesto y publicación. Habría que decidir si la tabla vieja se retira.
- **Activar una edición sin fechas cargadas** está permitido. Si el equipo quiere
  un freno (por ejemplo exigir fechas de ideas antes de activar), va en la acción
  `activarEdicion`, no en la pantalla.
- **Recuperar el código de seguimiento de un vecino.** El código se puede
  regenerar desde el `id`, pero no hay pantalla que lo muestre, así que la mesa
  de ayuda hoy no puede dárselo por teléfono. Conviene agregarlo a la ficha de
  `/admin/bandeja`.
- **El chatbot no sabe de `/ideas/seguimiento`.** Si se quiere que responda
  "consultá con tu número y tu código", hay que sumarlo a sus herramientas.
- **Avance presupuestario.** La columna del tablero muestra el monto de la etapa
  actual sobre el total, no un acumulado. Si el equipo espera un acumulado, hace
  falta otra consulta.
