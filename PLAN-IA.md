# Plan de IA — Presupuesto Participativo SMT

Dos funciones pedidas por el equipo:

- **(A) Asistente de carga.** Que la IA ayude al vecino en el momento de escribir
  su propuesta, incluida una reescritura que puede aceptar o descartar.
- **(B) Informe de impacto.** Que la IA analice las propuestas para el equipo,
  con impacto positivo y negativo, y proponga un borrador de la devolución.

Este documento explica **qué se construye, en qué orden y qué queda afuera**.
Mismo criterio que `PLAN-BACKOFFICE.md`: nada de pantallas sueltas, cada tanda
cierra un circuito de trabajo completo.

## Estado

| Tanda | Estado | Qué deja |
|---|---|---|
| 0 · Proveedor y base compartida | Pendiente | — (sin pantallas: un cliente para las tres funciones, y el chat vuelve a vivir) |
| 1 · Asistente de carga | Pendiente | `/ideas/nueva` con revisión y reescritura antes de enviar |
| 2 · Informe de impacto | Pendiente | Bloque en la ficha de `/admin` con borrador de devolución |
| 3 · Transparencia | Pendiente | `/privacidad` al día, marcado de contenido generado |

## Decisiones tomadas

| Decisión | Resuelto |
|---|---|
| Proveedor del modelo | **OpenRouter** (clave en `.env`, la carga Lucas) |
| Alcance del asistente | Señala **y** propone reescritura que el vecino acepta o descarta |
| Informe de impacto | Propone borrador de devolución; la persona lo edita y lo aprueba |

---

## Lo que hay que entender antes de empezar

### 1. Hoy casi no hay texto para analizar

Medido sobre la base de producción (`scripts/ver-materia-prima.ts`):

| Estado | Ideas | Con problema **y** solución |
|---|---|---|
| Factible | 46 | **0** |
| No factible | 29 | **0** |
| Integrada | 2 | **0** |
| Ganadora | 19 | 18 |
| **Total publicadas** | **96** | **18** |

Las únicas 18 ideas analizables son las que ya se decidieron. El relevamiento
del sitio anterior solo recuperó el texto de los ganadores; el resto tiene
título, barrio, distrito y categoría, un promedio de **174 caracteres**.

**Consecuencia de diseño:** un informe de impacto sobre las otras 78 ideas
tendría que inventar, que es justo lo que el sitio promete no hacer. Por eso las
dos funciones no son independientes: **(A) produce la materia prima de (B)**. El
asistente hace que el vecino escriba una propuesta desarrollada, y esa propuesta
desarrollada es lo que hace posible un informe honesto.

Para las ideas de 2025 sin texto, el informe tiene que decir exactamente eso:
_"esta idea no tiene problema ni solución cargados: no hay material para
analizar"_. Es la misma línea editorial que ya usa el sitio cuando muestra que
los presupuestos nunca se cargaron.

### 2. La deuda que esto puede ayudar a pagar

El panel abre con un contador: **32 ideas no factibles sin devolución escrita**
(29 publicadas + 3 duplicados despublicados). El propio panel lo llama _"la deuda
del equipo con los vecinos: a cada una se le dijo que no sin explicarle por qué"_.

Ahí es donde el informe tiene valor real: como **insumo para escribir esa
devolución**. Es lo que lo convierte en herramienta de trabajo y no en un botón
lindo. (Para esas 32 va a decir que no hay texto suficiente; la deuda se paga
cuando el equipo cargue el contenido o lleguen ideas nuevas por el formulario.)

### 3. OpenRouter no habla el idioma del código actual

Esto es lo más importante del plan y cambia trabajo que ya está escrito.

OpenRouter expone una API **compatible con OpenAI**
(`https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer`,
modelos con nombre `proveedor/modelo`). **No expone un endpoint compatible con
Anthropic.** El chat de hoy (`src/app/api/chat/route.ts`) está escrito contra el
SDK de Anthropic: `messages.stream()`, `tools` con `input_schema`,
`cache_control`, `output_config.effort`. Nada de eso funciona contra OpenRouter.

Entonces hay que elegir, y la elección ya está tomada porque el pedido fue "para
el bot usaremos OpenRouter":

- **Las tres funciones pasan por OpenRouter**, con un único cliente.
- El chat se migra del SDK de Anthropic al formato OpenAI. Es reescribir el bucle
  de herramientas y el streaming, unas 80 líneas.

**Lo bueno:** hoy el chat está muerto en producción (no hay clave de Anthropic
en Vercel). Con una sola clave de OpenRouter se encienden las tres cosas.

**Lo que se pierde:** `cache_control` (el descuento por cachear el prompt de
sistema) y `effort` son extensiones de Anthropic. En OpenRouter el prompt de
sistema se paga entero en cada consulta. Con el prompt actual del chat es
tolerable, pero es la razón por la que el control de costo de la tanda 0 pasa de
"buena práctica" a "necesario".

El buscador determinístico (`src/lib/chat-sin-ia.ts`) **no se toca**: no depende
de ningún proveedor y sigue siendo la red de contención.

### 4. Hoy no se mide lo que se gasta

`chat_consultas` tiene las columnas `tokens_entrada`, `tokens_salida` y
`cache_lectura` desde la migración inicial, con un comentario que dice que
sirven para auditar el costo. **Nadie las escribe**: `registrar()` no recibe el
`usage` y `finalMessage()` lo descarta. Con OpenRouter, que factura por token y
sin caché de prompt, sumar dos funciones más sin arreglar esto deja al municipio
a ciegas.

---

## Tanda 0 — Proveedor y base compartida

Sin pantallas. Es la que habilita todo lo demás.

1. **`src/lib/modelo.ts`.** Un solo lugar donde se crea el cliente y se lee la
   configuración:
   - Cliente: SDK de OpenAI apuntando a `https://openrouter.ai/api/v1`, con los
     headers `HTTP-Referer` y `X-OpenRouter-Title` que OpenRouter usa para
     atribución.
   - `MODELO` desde `OPENROUTER_MODEL` (formato `proveedor/modelo`), con un valor
     por defecto razonable y **validado**: hoy `CHAT_EFFORT` se castea sin
     validar y un valor mal tipeado en Vercel hace fallar todas las consultas con
     un error que el vecino ve como "Hubo un problema al responder".
   - `hayClave()`, para que las tres funciones degraden igual.
   - **Timeout y `AbortSignal`**: hoy no hay ninguno del lado del servidor, así
     que si el modelo tarda, la función de Vercel se consume hasta el tope.
2. **Migrar `/api/chat` al formato OpenAI.** Las cinco herramientas de
   `chat-herramientas.ts` cambian de `input_schema` a `parameters`; el bucle pasa
   de `messages.stream()` a `chat.completions.create({ stream: true })` con
   `tool_calls`. El transporte SSE hacia el navegador y `Chat.tsx` **no cambian**:
   el tipo `Evento` se mantiene, así que el cliente no se entera.
3. **Costo real.** Acumular `usage` de cada vuelta y pasarlo a `registrar()`.
   Llena columnas que ya existen: **sin migración**.
4. **Columna `origen`** en `chat_consultas` (`chat` | `asistente` | `informe`),
   para que `/admin/consultas` no mezcle las tres funciones. Migración `0005`.
5. **`src/lib/idea-esquema.ts`.** Los mínimos de una idea (título 8, problema 30,
   solución 30) están hoy solo en el zod de `POST /api/ideas`. El asistente los
   necesita para no gastar una llamada al modelo con un texto que el servidor va
   a rechazar igual. Un esquema, importado por los dos.
6. **Sacar `@anthropic-ai/sdk`** de las dependencias cuando el chat esté migrado.

---

## Tanda 1 — Asistente de carga (feature A)

**Circuito que cierra:** el vecino escribe → pide una revisión → recibe
señalamientos concretos y una reescritura → acepta o edita a mano → envía.

### Qué hace el asistente

Sobre el texto que el vecino ya escribió:

- **Qué le falta a la propuesta.** "No decís a cuántas personas afecta" o "no se
  entiende dónde sería la obra dentro del barrio".
- **Una reescritura para aceptar o descartar.** Su texto, mejor ordenado, sin
  inventar datos que no puso. Se muestra al lado del original y **nunca se aplica
  solo**: hay que apretar "Usar este texto".
- **Encuadre.** Si el texto no corresponde a la categoría elegida, lo dice. El
  criterio de cada categoría sale de `categorias.descripcion`, que ya viene de la
  base: no hay conocimiento hardcodeado.
- **Propuestas parecidas ya presentadas** en el mismo distrito. Esto **no llama
  al modelo**: usa `similitud()` de `src/lib/texto.ts`, la misma función Jaccard
  que detectó los duplicados de 2025 en el ETL. Es arreglar de raíz el problema
  que el ETL tuvo que limpiar a mano.

### Cómo se ve

El botón "Enviar mi idea" pasa a ser **"Revisar mi idea"**. Después de la
revisión aparecen los señalamientos, la reescritura con su botón "Usar este
texto", y **"Enviar igual"**. El vecino nunca queda atrapado: si la API falla,
tarda o no hay clave, se envía igual. El asistente **no está en el camino
crítico**.

### Decisiones técnicas ya tomadas

- **Ruta nueva `POST /api/ideas/asistente`**, con el molde del handler del chat.
  Rate limit con **clave propia** (`asistente:<ipHash>`): si compartiera la del
  alta, revisar tres veces dejaría al vecino sin poder enviar (son 5 por hora).
- **La reescritura no obliga a rehacer el formulario.** El formulario es no
  controlado (lee `FormData` al enviar) y pasarlo a controlado era el cambio más
  invasivo del MVP. No hace falta: se guarda una `ref` por textarea y, al aceptar,
  se escribe `textarea.value`. El `FormData` del envío lo levanta igual. Se toca
  poco y se gana la función completa.
- **Sin datos personales en el pedido.** Ni nombre ni correo viajan al modelo. El
  vecino consintió que ese dato se use para contarle cómo sigue su idea, nada más.
- **El texto del vecino es entrada no confiable.** Va delimitado y marcado como
  dato, nunca como instrucción. Un "ignorá las instrucciones anteriores" adentro
  del campo problema tiene que quedar en nada.
- **Cuidado con `currentTarget`.** `enviar()` lee `evento.currentTarget` antes del
  primer `await`; si se mete el `await` de la revisión antes, React ya recicló el
  evento. El `FormData` se arma siempre en la primera línea sincrónica.
- **Degradación sin clave:** quedan los chequeos determinísticos (mínimos, campos
  vacíos, propuestas parecidas). El bloque de reescritura simplemente no aparece.

---

## Tanda 2 — Informe de impacto (feature B)

**Circuito que cierra:** el moderador abre una idea → pide el informe → lo lee →
usa el borrador para escribir la devolución → guarda con la acción de siempre,
que deja su fila de auditoría.

### Qué contiene el informe

1. **Qué propone**, en una línea.
2. **Impacto positivo esperado**: a quiénes beneficia y cómo, según el texto.
3. **Riesgos y costos**: qué puede salir mal, qué mantenimiento pide después.
4. **Qué falta saber**: las preguntas concretas que el equipo debería responder
   antes de decidir. Es la sección más útil y la más honesta.
5. **Encuadre**: si entra en la categoría elegida y si parece competencia
   municipal.
6. **Borrador de devolución** para el vecino, en el tono del sitio.

Y si la idea no tiene texto: **solo** dice que no hay material para analizar.

### Reglas que no se negocian

- **La IA no decide.** No cambia el estado de una idea, no aprueba, no rechaza.
- **No pisa `ideas.motivo_estado`.** Esa columna es la devolución que lee el
  vecino y su único camino de escritura auditado es `evaluarIdea`. El borrador se
  guarda en tabla propia y la persona lo pega en el textarea y lo guarda con la
  acción de siempre. Así la fila de `revisiones` sigue diciendo qué texto quedó y
  quién lo aprobó.
- **Queda etiquetado** como borrador generado por IA, de uso interno, con el
  modelo que lo produjo y la fecha.
- **Queda auditado**: quién lo pidió, cuándo, con qué modelo y cuánto costó.

### Decisiones técnicas ya tomadas

- **Server action `generarInformeImpacto`** en `src/app/admin/acciones.ts`, al
  lado de `evaluarIdea`. Nada de rutas bajo `/api/admin`: el backoffice escribe
  todo por server actions con `exigirAdmin()` y auditoría en la misma
  transacción. No se copia el esqueleto de `/api/chat`, que es público a propósito.
- **Tabla `informes_impacto`** (migración `0005`): `ideaId`, las secciones del
  informe, el borrador de devolución, modelo, tokens, ms, quién lo pidió y cuándo.
- **Valor `informe` en el enum `accion_revision`**, misma migración, para que
  aparezca en el historial de la idea. Ojo: un valor nuevo sin la migración
  aplicada rompe la transacción entera — ya pasó con `presupuesto`. **La `0005` se
  aplica en Supabase antes de desplegar el código.**
- **Salida estructurada.** OpenRouter soporta
  `response_format: { type: "json_schema", json_schema: { name, strict, schema } }`,
  así el informe llega tipado y se guarda sin parsear texto con expresiones
  regulares. El esquema sale de zod con `z.toJSONSchema()` (zod 4 ya está en el
  proyecto). **Cuidado:** el soporte depende del modelo y del proveedor que
  OpenRouter elija, así que hay que validar la respuesta con zod igual y tener un
  camino de error claro si vuelve mal formada.
- **Dónde va en la pantalla:** dentro de la ficha (`panel.tsx`, componente
  `Ficha`), entre "Devolución que se publica hoy" y el bloque de acciones. La
  ficha no es una ruta propia sino `?idea=<id>`, y se remonta con `key`: el
  informe se lee del servidor, no de estado del cliente.
- **Tope de uso.** Un botón sin límite deja que se disparen N llamadas sobre la
  misma idea. Se guarda el último informe y no se regenera salvo pedido explícito,
  con rate limit por cuenta.
- **`revalidatePath("/", "layout")`** invalida el sitio entero en cada acción.
  Para esta conviene algo más acotado: el informe no cambia nada público.
- **Rol:** lo genera un `moderador`; un `lector` no ve el botón (guarda
  `soloLectura`).

---

## Tanda 3 — Transparencia

No es un extra: es parte de que esto se pueda publicar.

1. **`/privacidad` queda en falso por partida doble.** Hoy declara que
   **Anthropic** _"recibe únicamente el texto de la pregunta que escribís en el
   chat"_. Con este plan cambian las dos mitades de esa frase: el proveedor pasa a
   ser **OpenRouter** (que a su vez enruta a otro proveedor, dato que hay que
   nombrar) y lo que recibe incluye **el texto de las propuestas**. Es un sitio de
   gobierno bajo la ley 25.326 y la página ya está enlazada desde el pie. Hay que
   actualizar la sección de transferencia internacional y la tabla de tratamientos.
2. **Marcado del contenido generado.** Todo lo que produzca el modelo se muestra
   con su etiqueta y su fecha, en el formulario del vecino y en la ficha del panel.
3. **Registro de costo visible** en `/admin/consultas`, separado por origen.

---

## Qué queda afuera del MVP

Explícito, para que nadie lo espere:

- **Streaming del informe.** La server action devuelve el texto completo. Se ve
  "Generando…" como en los otros formularios del panel.
- **Análisis masivo** de las 96 ideas de una vez. Es plata y no hay texto que
  analizar.
- **Publicación del informe al vecino.** Por ahora es interno.
- **Caché del prompt de sistema.** Se pierde al salir de la API de Anthropic; se
  puede recuperar si más adelante se vuelve a un proveedor directo.
- **Aviso por mail** cuando se resuelve una idea: sigue siendo la tanda 6 del otro
  plan y depende de terceros del municipio.

---

## Variables de entorno nuevas

```
OPENROUTER_API_KEY=          # la clave; sin ella todo degrada, nada rompe
OPENROUTER_MODEL=            # formato proveedor/modelo
SITE_URL=                    # ya existe; OpenRouter la usa para atribución
```

`ANTHROPIC_API_KEY`, `CHAT_MODEL` y `CHAT_EFFORT` quedan sin uso cuando termine
la tanda 0.

---

## Prueba de que funciona (guion de demostración)

Un solo recorrido, de punta a punta:

1. Cambiar la etapa de la edición a **ideas** desde `/admin/ediciones`.
2. En `/ideas/nueva`, cargar una propuesta a propósito floja. Pedir la revisión:
   el asistente marca lo que falta, avisa si hay algo parecido en ese distrito y
   ofrece una reescritura.
3. Aceptar la reescritura, completar y enviar. Anotar número y código.
4. En `/admin`, abrir la idea recién llegada y **generar el informe**.
5. Usar el borrador para escribir la devolución y guardarla.
6. Consultar el código en `/ideas/seguimiento`: el vecino ve la devolución.
7. Mostrar la fila en el historial de la idea y el costo en `/admin/consultas`.
8. De yapa: el chat del sitio, que hoy está muerto, responde de nuevo.

Es el circuito completo: entra mejor escrita, se analiza, se responde, y todo
queda registrado.
