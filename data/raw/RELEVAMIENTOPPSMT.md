# Relevamiento del sitio Presupuesto Participativo SMT

**Fuente:** https://presupuestoparticipativo.smt.gob.ar
**Fecha de extracción:** 20 de agosto de 2026
**Objetivo:** insumo completo para construir el nuevo sitio del Presupuesto Participativo de San Miguel de Tucumán.

## 1. Qué es el sitio actual

Plataforma de participación ciudadana desarrollada por **Democracia en Red** (base tecnológica DemocracyOS / Consul-like, Node + React + Leaflet). Gestiona el ciclo completo del Presupuesto Participativo: presentación de ideas, evaluación técnica, votación por distrito y seguimiento de la ejecución presupuestaria de los proyectos ganadores.

Edición relevada: **Presupuesto Participativo 2025**, con la votación realizada el **29 y 30 de octubre de 2025** y el foro actualmente en etapa `seguimiento`.

### Estructura de páginas

| Ruta | Contenido |
|---|---|
| `/` | Home: banner, 3 bloques explicativos, mapa de distritos, novedades, footer |
| `/acerca-de` | Preguntas frecuentes (acordeón de 6 ítems) |
| `/propuestas` | Listado de ideas/proyectos con filtros por Zona, Tema y Tipo de idea |
| `/propuestas?tipoIdea=ganador&years=2025` | Vista de proyectos ganadores (la que enlaza la home) |
| `/reglamento` | Reglamento general (página vacía en el relevamiento) |
| `/s/terminos-y-condiciones` | Términos y condiciones |
| `/signin`, `/signup` | Ingreso y registro de usuarios |

### Datos de contacto (footer)

```
Municipalidad de San Miguel de Tucumán
9 de Julio 570
SMT, Tucumán T4000IHL
Argentina
3814516500 int. 6517
```

Redes vinculadas: facebook.com/MuniSMTucuman · instagram.com/munismtucuman · x.com/CiudadSMT · smt.gob.ar

## 2. Los mapas de distritos (lo central)

**Se logró extraer la geometría completa de los 20 distritos.** El sitio no expone la geometría por API: el archivo `distritos.json` está embebido dentro del bundle `site.js` y se dibuja con Leaflet sobre teselas de OpenStreetMap. Se recuperó desde el bundle y se validó.

Archivo: **`datos/distritos.geojson`**

- Formato: GeoJSON `FeatureCollection`, 20 features
- Geometría: `MultiPolygon`, un anillo por distrito, todos cerrados y validados
- CRS: `urn:ogc:def:crs:OGC:1.3:CRS84` (equivalente a EPSG:4326, lon/lat en grados decimales)
- Propiedades por feature: `id`, `name` ("Distrito N"), `numero`
- Extensión: longitud −65.27504 a −65.15907 · latitud −26.91120 a −26.78331
- Centro aproximado: −26.84725, −65.21705
- Vértices por distrito: entre 6 (D3) y 73 (D20); total 590 puntos

Los 20 distritos cubren el ejido de forma contigua, sin huecos ni solapamientos visibles: D1–D8 son franjas angostas en el norte, D9–D13 y D17 en el oeste/centro, D14–D16 y D18–D20 en el sur, y D10 corresponde al área central de la ciudad.

Archivos complementarios generados:

- `datos/centroides_distritos.json` — centroide de cada distrito (para etiquetas y anclaje de tarjetas)
- `mapa_distritos.html` — visor interactivo autocontenido (Leaflet embebido, sin dependencias externas): distritos coloreados por categoría del proyecto ganador, etiquetas numéricas, marcadores de proyectos ganadores con coordenadas y panel lateral con el detalle de los 20 distritos
- `mapa_distritos.svg` — mapa estático vectorial, listo para imprimir o incrustar

### Cómo reusarlos en el sitio nuevo

El GeoJSON se puede cargar tal cual en Leaflet, MapLibre, Mapbox GL, OpenLayers, Google Maps (vía `Data.addGeoJson`), QGIS o PostGIS. Recomendación para el sitio nuevo: **servirlo como archivo estático propio** (`/geo/distritos.geojson`) o como tabla PostGIS con endpoint `/api/distritos`, en lugar de volver a empaquetarlo dentro del bundle de JavaScript. Así queda versionable, cacheable y consumible por otros sistemas del municipio.

Para asignar una idea a su distrito basta un *point-in-polygon* sobre este archivo (`turf.booleanPointInPolygon` en el navegador, `ST_Contains` en PostGIS), lo que permite autocompletar el distrito a partir de la ubicación marcada por el vecino.

## 3. Taxonomía y ciclo de vida

### Categorías (tags)

| Categoría | Descripción según el sitio | Ideas 2025 |
|---|---|---|
| Espacio socio ambiental | Plazas, espacios verdes y mejoras ambientales | 29 |
| Espacio cultural deportivo | Centros culturales, bibliotecas y espacios artísticos comunitarios | 50 |
| Espacio de innovación urbana | Corredores seguros, espacios de encuentro, SUM, entre otros | 21 |

### Estados de una idea

`pendiente` → `factible` / `no-factible` / `integrado` (fusionada con otra) → `ganador`

Sobre los proyectos que avanzan hay además dos estados propios:

- **Estado de proyecto:** `ganador` / `no-ganador`
- **Estado de presupuesto:** `preparacion` → `compra` (contratación) → `ejecucion` → `finalizado`

Distribución 2025: 47 factibles · 32 no factibles · 19 ganadoras · 2 integradas (100 ideas en total).

### Cronograma del proceso 2025

- **Mayo – Julio 2025:** lanzamiento del programa
- **Junio – Septiembre 2025:** presentación de ideas y proyectos
- **Octubre 2025:** elección pública de los proyectos a implementar (votación 29 y 30 de octubre)
- **2026:** ejecución de los proyectos ganadores con presupuesto asignado

### Reglas de votación

- 1 voto disponible por persona
- Se vota únicamente un proyecto del distrito donde la persona vive
- Empadronamiento: ciudadanía digital **CIDITUC** (virtual, vía web municipal) o presencial en las asambleas participativas

## 4. Formulario de carga de ideas (esquema de campos)

Esquema real del sitio actual, útil para replicar el formulario. Los campos marcados como ocultos sólo los ve la administración.

| Campo | Etiqueta | Tipo | Oblig. | Notas |
|---|---|---|---|---|
| `numero` | Número identificador de la idea | Número (1–1000) | sí | |
| `state` | Estado | Enum | sí | pendiente / no-factible / integrado / factible / ganador |
| `admin-comment-referencia` | Integración de ideas | Texto (128) | sí | link a la idea final si fue integrada |
| `admin-comment` | Comentario del moderador | Texto largo (5000) | sí | se completa al pasar a factible / no factible |
| `problema` | Problema o necesidad existente | Texto largo (5000) | sí | "¿Qué problemas querés resolver? ¿a quiénes afecta? ¿Cómo?" |
| `solucion` | Propuesta de solución | Texto largo (8000) | sí | en la portada se ven los primeros 400 caracteres |
| `beneficios` | Beneficios para el barrio | Texto largo (8000) | no | "¿Cómo ayuda este proyecto al barrio? ¿Quiénes se benefician?" |
| `barrio` | Barrio | Texto (340) | no | |
| `coordinates` | Coordenadas | Texto (340) | no | texto libre — ver problemas de calidad abajo |
| `telefono` | Teléfono celular | Texto (340) | no | sólo para contacto sobre la idea |
| `genero` | Género del postulante | Texto | no | oculto |
| `proyecto-visibilidad` | Visibilidad del proyecto | Enum | no | oculto: oculto / visible |
| `proyecto-titulo` | Título del proyecto | Texto (340) | no | oculto |
| `proyecto-contenido` | Contenido del proyecto | Texto largo (5000) | no | |
| `proyecto-estado` | Estado del proyecto | Enum | no | oculto: ganador / no-ganador |
| `proyecto-votos` | Cantidad de votos | Número | no | |
| `presupuesto-total` | Presupuesto total | Número | sí | |
| `presupuesto-estado` | Estado del presupuesto | Enum | no | preparación / contratación / ejecución / finalizado |
| `presupuesto-preparacion` / `-compra` / `-ejecucion` / `-finalizado` | Montos por etapa | Número | no | |
| `presupuesto-historial` | Historial de ejecución | Texto largo (8000) | no | notas sobre la ejecución |

### Problemas de calidad de datos detectados (a corregir en el sitio nuevo)

1. **Coordenadas como texto libre.** De 100 ideas, sólo 34 tienen un par lat/lon usable. Hay latitudes con el signo invertido (`26.795635, -65.254633`), un registro en coordenadas proyectadas Gauss-Krüger (`3576679.46555, 7028253.17743`) y otro en grados-minutos-segundos (`26°51'20.7"S 65°15'21.0"W`). **Recomendación:** reemplazar el campo de texto por un selector de punto sobre el mapa que guarde lat/lon numéricos y derive el distrito por point-in-polygon.
2. **`presupuesto-total` sin usar.** Todas las ideas tienen el valor `1`; el presupuesto real nunca se cargó. Si el nuevo sitio va a mostrar montos y avance de obra, conviene que el campo sea obligatorio con validación y que el seguimiento por etapas se publique.
3. **Duplicados y títulos con marcas de trabajo interno.** Hay ideas repetidas con distinta redacción (p. ej. "Escuela Formativa Defensores del Sur" aparece dos veces en D18; "Puesta en valor plaza Santísima Trinidad" en D15) y títulos que arrastran asteriscos o textos como `S/DATOS`, `sin identificar`, `- No factible`. Conviene una limpieza antes de migrar.
4. **Campos `problema` / `solucion` / `beneficios` intercambiados.** En varios proyectos el contenido no corresponde a la etiqueta (en D2, D6, D12 y D19 la "solución" describe el problema y los "beneficios" describen la solución). Revisar caso por caso al migrar.
5. **Comillas y saltos de línea sucios.** Muchos textos vienen envueltos en comillas dobles literales, con saltos dobles y mayúsculas sostenidas provenientes de la carga manual.
6. **Autoría concentrada.** Casi todas las ideas están cargadas por los usuarios internos `PParticipativo` y `MUNICIPALIDAD` (sólo una por un vecino identificado, `AGUSTÍN`): la carga fue mayormente presencial y transcripta por el equipo. Vale la pena que el nuevo sitio facilite la carga directa por el vecino y registre igualmente el canal de origen.
7. **Distrito 10 sin ganador.** El área central registró una sola idea, declarada no factible, y quedó sin proyecto ganador.

## 5. Textos del sitio actual (copy reutilizable)

Todos los textos son editables desde el backend (endpoint `/api/text`). Se listan con su clave original.

**Home**

- `home-title`: Presupuesto Participativo de San Miguel de Tucumán
- `home-subtitle`: PROYECTOS
- `home-subtitle-text`: El 29 y 30 de octubre se votó el presupuesto participativo! Conocé los proyectos ganadores!
- `home-banner-title`: Presupuesto Participativo 2025
- `home-banner-button1-text`: PROYECTOS → `/propuestas`
- `home-encuentro-title`: NOVEDADES Y PRÓXIMOS ENCUENTROS
- `home-encuentro-subtitle`: Agendate la reunión de tu barrio y presentá tus ideas.

**Tres bloques explicativos de la home**

1. **¿QUÉ ES?** — El Presupuesto Participativo es una herramienta de participación ciudadana que permite a vecinos y vecinas de San Miguel de Tucumán proponer, debatir y decidir de manera directa cómo se invierte una parte del presupuesto municipal.
2. **¿CÓMO PUEDO PARTICIPAR?** — Presentá tu idea para tu barrio en la etapa de ideas y luego votá el proyecto que mas te gustaría.
3. **¿CUÁLES SON LOS PRÓXIMOS PASOS?** — Luego del cierre de la etapa de ideas, las propuestas se evaluarán técnica y presupuestariamente. Las seleccionadas pasarán a la votación abierta. También podrás seguir el avance de los proyectos ganadores directamente desde la plataforma.

**Listado de proyectos**

- `idea-title`: Proyectos
- `idea-subtitle`: Conocé los proyectos ganadores del Presupuesto Participativo 2025

**Votación**

- `votacion-title`: VOTACIÓN DEL PRESUPUESTO PARTICIPATIVO 2025
- `votacion-subtitle`: Gracias por participar de la votación del presupuesto participativo 2025
- `votacion-steps`: Pasos y reglas para la votación — Tenés **1 voto disponible**. Podés votar un proyecto del distrito donde vivís.

**Archivo**

- `archivo-title`: Archivo de proyectos
- `archivo-subtitle`: Aquí podes visualizar los proyectos de años anteriores

**Preguntas frecuentes (`/acerca-de`)**

1. **¿Qué es el Presupuesto Participativo?** Es un mecanismo de participación ciudadana que permite a los vecinos proponer y decidir directamente en qué se invertirá una parte del presupuesto municipal.
2. **¿Qué tipo de proyectos se pueden desarrollar?** En tres grandes categorías: *Espacio socioambiental* (plazas, espacios verdes y mejoras ambientales); *Espacio deportivo y cultural* (centros culturales, bibliotecas y espacios artísticos comunitarios); *Espacio de innovación urbana* (corredores seguros, espacios de encuentro, Salón de Usos Múltiples, entre otros).
3. **¿Cómo puedo participar?** De dos maneras: *acercando tu idea*, presentando propuestas que luego podrán transformarse en proyectos; y *eligiendo*, participando en la votación de los proyectos que más te interesen.
4. **¿Cómo me empadrono para votar?** De manera virtual, haciéndote ciudadano digital (CIDITUC) a través de la página oficial de la Municipalidad; o de manera presencial, en las asambleas participativas, donde te ayudaremos a inscribirte al CIDITUC.
5. **¿Cuándo se seleccionan o votan los proyectos?** En octubre de 2025 se realizará una elección pública de proyectos. El que resulte ganador será incorporado al presupuesto municipal del año siguiente.
6. **¿Cuál es el calendario del proceso?** Ver cronograma en la sección 3.

## 6. Dataset de proyectos 2025

Archivo: **`datos/proyectos_pp2025.csv`** (100 filas, UTF-8 con BOM, listo para Excel)

Columnas: `distrito`, `estado`, `categoria`, `titulo`, `barrio`, `coordenadas_originales`, `lat`, `lon`, `votos`, `fecha`, `cargado_por`.

Las columnas `lat` / `lon` son una normalización propia: se parsean las coordenadas del sitio, se corrige el signo cuando está invertido y se descartan los valores fuera del área de Tucumán (quedan 34 registros geolocalizables de 100).

### Ideas por distrito

| Distrito | Ideas | Distrito | Ideas |
|---|---|---|---|
| 1 | 21 | 11 | 3 |
| 2 | 2 | 12 | 2 |
| 3 | 7 | 13 | 1 |
| 4 | 3 | 14 | 7 |
| 5 | 2 | 15 | 11 |
| 6 | 2 | 16 | 6 |
| 7 | 4 | 17 | 7 |
| 8 | 4 | 18 | 5 |
| 9 | 2 | 19 | 5 |
| 10 | 1 | 20 | 5 |

### Proyectos ganadores 2025 (19)

Ordenados por votos.

| Votos | Distrito | Proyecto | Categoría |
|---|---|---|---|
| 282 | 5 | Espacio deportivo-cultural Club Sargento Cabral, Villa Urquiza | cultural deportivo |
| 231 | 11 | Playón deportivo comunitario "Cancha Ex Aeropuerto" | cultural deportivo |
| 210 | 19 | Playón deportivo y vestuarios para el Club San Alberto | cultural deportivo |
| 192 | 12 | El Arte Popular en la Plaza Los Plátanos | cultural deportivo |
| 186 | 16 | Puesta en valor Club Social y Deportivo Barrio 20 de Junio | cultural deportivo |
| 172 | 4 | Puesta en valor Plaza Curva, Barrio Juan Pablo II | socio ambiental |
| 137 | 8 | Playón deportivo comunitario "Plaza Viluco" | cultural deportivo |
| 118 | 7 | Plaza Activa, B° Sitravi | socio ambiental |
| 89 | 6 | Recuperación integral del Complejo General Muñoz, Villa 9 de Julio | innovación urbana |
| 75 | 20 | Centro Deportivo San Miguel, Barrio CGT | cultural deportivo |
| 67 | 15 | Centro Cultural y Comunitario DIZA | socio ambiental |
| 58 | 18 | Espacio deportivo comunitario en Plaza de Chañaritos | cultural deportivo |
| 49 | 3 | Playón deportivo para Plaza Lozano Muñoz, B° Echeverría | cultural deportivo |
| 49 | 13 | Plaza de juegos y pista de salud "Barrio Lincoln" | innovación urbana |
| 40 | 14 | CAC N° 11 Inclusivo, Barrio Victoria | cultural deportivo |
| 35 | 1 | Puesta en valor de la Gruta de la Virgen del Rosario de San Nicolás | innovación urbana |
| 28 | 17 | Revalorización de la Plaza del Barrio San Miguel | socio ambiental |
| 26 | 9 | Puesta en valor de la Plaza Pedro Cossio Paz, Barrio Padilla | innovación urbana |
| 25 | 2 | Puesta en valor Plaza Democracia, Barrio Casino–Zenón Santillán | socio ambiental |

Total de votos registrados en los proyectos ganadores: **2.069**. El Distrito 10 (área central) no tiene proyecto ganador.

Todos los proyectos ganadores figuran con estado de presupuesto **"En preparación"**, sin montos ni avance cargados.

## 7. Contenido completo de los proyectos ganadores

Texto tal como está cargado en el sitio actual (se normalizaron espacios; se mantienen las etiquetas originales del formulario aunque en algunos casos el contenido esté corrido de campo).

### Distrito 1 · Puesta en valor de la Gruta de la Virgen del Rosario de San Nicolás
*Innovación urbana · 35 votos · B° Oeste II · −26.798656, −65.252994*

**Problema.** Deterioro del techo de la pérgola que resguarda la gruta, afectando su conservación. Otros problemas detectados: ausencia de bancos que permitan a los vecinos permanecer en el lugar con comodidad; falta de ornamentación y embellecimiento del entorno, lo que resta atractivo y calidez al espacio. Afecta principalmente a los vecinos y fieles que se acercan a la gruta para rezar, pero también a toda la comunidad que utiliza el espacio público: reduce la comodidad, dificulta la permanencia y genera un ambiente poco cuidado en un espacio de relevancia espiritual y comunitaria.

**Solución.** Refacción integral del techo de la pérgola que resguarda la gruta. Instalación de bancos de cemento para brindar un espacio cómodo y digno de oración. Incorporación de plantas florales ornamentales alrededor de la gruta, para embellecer y dar mayor calidez al entorno.

**Beneficios.** Revalorización de un espacio significativo para la fe y la identidad comunitaria. Generación de un lugar digno y confortable para la oración y la reflexión. Embellecimiento del entorno barrial y fortalecimiento del sentido de pertenencia. Creación de un espacio público que favorezca la convivencia, la espiritualidad y el encuentro vecinal.

### Distrito 2 · Puesta en valor Plaza Democracia, Barrio Casino – Zenón Santillán
*Socio ambiental · 25 votos · B° Casino (Zenón Santillán) · −26.800276, −65.236695*

**Problema.** La Plaza Democracia del barrio Casino constituye un punto estratégico para la vida comunitaria; actualmente se encuentra en un estado deplorable debido a la falta de mantenimiento, mobiliario urbano y condiciones de seguridad no apropiadas. La escasa iluminación y el desaprovechamiento del espacio verde impiden que la plaza cumpla su función de promover la interacción entre vecinos, la recreación y el fortalecimiento del sentido de pertenencia. Recuperar este espacio es fundamental para devolverle su rol de núcleo social, cultural y recreativo al barrio.

**Diagnóstico detallado** (cargado en el campo "solución"). Falta de iluminación y condiciones de seguridad apropiadas. Ausencia de juegos infantiles, equipamiento deportivo y mobiliario urbano. Espacios verdes en mal estado, sin mantenimiento ni parquización adecuada. Escasez de lugares de encuentro y recreación para vecinos de distintas edades. A quiénes afecta: niños, que no cuentan con un lugar seguro y atractivo para el juego; jóvenes, que carecen de espacios recreativos y deportivos accesibles; adultos y adultos mayores, que no disponen de un espacio de reunión, esparcimiento y actividades saludables; la comunidad en general, que pierde un espacio público de integración social y cultural. Cómo afecta: genera sensación de inseguridad, limita la vida comunitaria y la posibilidad de encuentros barriales, y reduce el acceso a actividades recreativas, deportivas y culturales.

**Beneficios.** Recuperación y revalorización de un espacio público estratégico para la vida comunitaria. Mejora de la seguridad y accesibilidad de la plaza. Creación de un lugar de integración que favorezca la convivencia y el sentido de pertenencia. Fomento de la recreación, el deporte y la vida saludable. Embellecimiento del entorno barrial y fortalecimiento de la identidad comunitaria.

### Distrito 3 · Playón deportivo para "Plaza Lozano Muñoz", B° Echeverría
*Cultural deportivo · 49 votos · B° Echeverría*

**Problema.** La Plaza Lozano Muñoz cumple un rol social, cultural y deportivo clave en la comunidad. Sin embargo, actualmente no cuenta con un espacio adecuado para la práctica de múltiples disciplinas al aire libre. La construcción de un playón deportivo permitirá brindar un lugar seguro y accesible para la práctica del deporte; promover la inclusión social de niños, niñas, jóvenes y adultos; ofrecer una alternativa recreativa que contribuya a la salud y al bienestar; y fomentar valores como el compañerismo, la solidaridad y el trabajo en equipo.

**Beneficios.** Incrementar la práctica de deportes en un espacio seguro. Revalorizar la plaza como núcleo de encuentro comunitario. Prevenir problemáticas sociales vinculadas al ocio improductivo. Favorecer la integración intergeneracional a través de torneos y actividades recreativas.

### Distrito 4 · Puesta en valor Plaza Curva, Barrio Juan Pablo II
*Socio ambiental · 172 votos · B° Juan Pablo II*

**Problema.** La plaza es un espacio de encuentro para los vecinos del barrio Juan Pablo II, para niños, jóvenes y adultos que asisten a la OC Los Lapachitos. En ella se realizan diferentes actividades culturales, recreativas y espacios de encuentro que requieren resignificar el espacio, para permitir proyectar actividades organizadas por esa organización colindante.

**Solución.** Contar con un espacio refuncionalizado ayudará de manera integral a la convivencia, se podrán proyectar actividades y la comunidad podrá empoderarse del espacio, haciendo un uso adecuado del tiempo libre de los jóvenes con diferentes problemas sociales.

**Beneficios.** Integrar este espacio como una oportunidad para todos.

### Distrito 5 · Espacio deportivo-cultural Club Sargento Cabral, Villa Urquiza
*Cultural deportivo · 282 votos (el más votado) · Villa Urquiza · −26.796956, −65.200865*

**Problema.** La comunidad enfrenta una carencia de infraestructura deportiva y recreativa, lo que afecta principalmente a niños, niñas y jóvenes que no cuentan con alternativas seguras para ocupar su tiempo libre. Esta situación favorece el sedentarismo, limita la participación social y aumenta el riesgo de problemáticas asociadas a la exclusión. Además, el espacio público existente se encuentra deteriorado y subutilizado, sin equipamiento ni iluminación adecuada para el desarrollo de actividades comunitarias.

**Solución.** Construcción de un playón deportivo comunitario multifuncional: piso de hormigón con demarcaciones deportivas; equipamiento fijo (arcos, aros, redes para vóley y handball); iluminación LED para uso nocturno y mayor seguridad; bancos, cestos de residuos y señalética comunitaria; y actividades deportivas, culturales y recreativas articuladas con escuelas, clubes y organizaciones sociales. Destinado a fútbol, vóley, básquet, handball y otras actividades comunitarias.

**Beneficios.** Mayor participación de jóvenes en actividades deportivas y recreativas. Reducción del sedentarismo y mejora del bienestar físico y emocional. Fortalecimiento de la cohesión social y del sentido de pertenencia barrial. Creación de redes de contención comunitaria a través del deporte. Revalorización de un espacio público actualmente deteriorado y subutilizado.

### Distrito 6 · Recuperación integral del Complejo General Muñoz, Villa 9 de Julio
*Innovación urbana · 89 votos · Villa 9 de Julio*

**Problema.** El Complejo General Muñoz es un espacio emblemático del noreste de San Miguel de Tucumán. Durante décadas fue un punto de encuentro, formación y contención para generaciones de vecinos; en sus canchas se forjaron lazos comunitarios y en su gruta, dedicada a la Virgen del Rosario de San Nicolás, se mantiene viva una fuerte identidad espiritual. En la actualidad el predio presenta un grave deterioro debido al abandono, lo que lo ha convertido en un foco de inseguridad y vandalismo. Su recuperación es urgente no sólo desde lo urbano, sino también desde lo social y humano.

**Diagnóstico detallado.** Estado de abandono y deterioro general del predio. Falta de iluminación, equipamiento y mantenimiento. Inseguridad por robos, vandalismo y enfrentamientos. Escasez de espacios verdes y deportivos en el noreste de la ciudad. Dificultades de acceso y falta de infraestructura inclusiva para adultos mayores y personas con movilidad reducida. Afecta a toda la comunidad del sector noreste, especialmente niños, jóvenes, adultos mayores y personas con discapacidad.

**Propuesta de intervención.** Infraestructura deportiva: reacondicionamiento de canchas, iluminación, señalética y equipamiento. Gruta de la Virgen de San Nicolás: restauración paisajística, mobiliario y mejoras de accesibilidad. Accesibilidad universal: rampas, caminos seguros, bancos ergonómicos y áreas tranquilas para adultos mayores. Entorno verde: reforestación con especies nativas, huertas comunitarias y jardines sensoriales. Seguridad y prevención: iluminación perimetral, cámaras, patrullajes preventivos y jornadas de concientización. Actividades comunitarias: programas deportivos, recreativos, culturales y religiosos coordinados con instituciones locales. La sostenibilidad se plantea con acompañamiento municipal y participación vecinal, articulando instituciones barriales, escuelas, clubes y organizaciones sociales.

### Distrito 7 · Plaza Activa, B° Sitravi
*Socio ambiental · 118 votos · esquina de Costa Rica y José Hernández*

**Problema.** La plaza presenta equipamiento incompleto, poca iluminación y ausencia de un área deportiva reglada. Estas condiciones limitan el uso del espacio público y la posibilidad de desarrollar actividades recreativas, culturales y comunitarias. El proyecto busca transformar el lugar en un punto de encuentro moderno, seguro y accesible: espacio ordenado y multifuncional para el deporte, la educación y la convivencia; hábitos saludables e integración intergeneracional; mejor seguridad, iluminación y accesibilidad; identidad barrial y uso activo del espacio público durante todo el año.

**Propuesta de intervención.**
- *Sector deportivo central:* playón multiuso en hormigón con demarcaciones reglamentarias para futsal, básquet, vóley y handball; cercado perimetral con portón accesible, bancos, apoyabicicletas, bebedero y áreas de sombra; tableros de básquet templados con aros reforzados y señalética deportiva.
- *Gimnasio urbano y circuito aeróbico:* barras de calistenia, paralelas y banco de abdominales sobre piso de caucho; sendero perimetral con baldosas podotáctiles y señalización de distancias.
- *Espacios de descanso y verde:* pérgolas metálicas, bancos y mesas de hormigón con madera tratada; cestos dobles (seco/húmedo), bicicleteros, arbolado nativo y canteros con riego por goteo.
- *Anfiteatro a cielo abierto:* gradas bajas en semicírculo, escenario central y rampa accesible; iluminación específica y toma técnica para sonido o proyección.
- *SUM cívico-comunitario:* sala multiuso cerrada con tratamiento acústico básico, galería perimetral techada y cocina de apoyo; sanitarios (incluido baño accesible) y depósito.
- *Sustentabilidad y seguridad:* iluminación LED, ventilación cruzada, materiales de bajo mantenimiento y preinstalación para energía solar; paisajismo bajo que asegura visibilidad 360° y drenaje eficiente.

### Distrito 8 · Playón deportivo comunitario "Plaza Viluco"
*Cultural deportivo · 137 votos*

**Problema.** En numerosos barrios de la ciudad, niños, niñas y jóvenes carecen de espacios deportivos adecuados y accesibles. Esta ausencia de infraestructura limita la recreación, incrementa el sedentarismo y deja a muchos chicos y chicas sin alternativas saludables para ocupar su tiempo libre; en ese contexto emergen problemáticas como el consumo problemático, la deserción escolar y la exclusión social. El deporte y la recreación permiten fortalecer vínculos comunitarios, promover hábitos saludables y fomentar valores como el respeto, la cooperación, la disciplina y el esfuerzo.

**Solución.** Construcción de un playón multifuncional con piso de hormigón y demarcaciones deportivas; equipamiento fijo (arcos, aros, red de vóley/handball); iluminación LED para uso nocturno y mayor seguridad; bancos, cestos de residuos y señalética comunitaria; y jornadas de promoción de la salud, charlas deportivas y actividades recreativas coordinadas con escuelas, clubes, centros vecinales y organizaciones sociales. Uso previsto: fútbol, vóley, básquet, handball y actividades culturales o comunitarias.

**Beneficios.** Mayor participación de jóvenes en actividades recreativas y deportivas. Reducción del sedentarismo y mejora del bienestar físico y emocional. Fortalecimiento de la cohesión social y el orgullo barrial. Creación de redes de contención comunitaria a través del deporte. Revalorización y activación de un espacio público deteriorado y subutilizado.

### Distrito 9 · Puesta en valor de la Plaza Pedro Cossio Paz, Barrio Padilla
*Innovación urbana · 26 votos*

**Problema.** La plaza presenta destrozos en sus instalaciones y ha sufrido vandalismo, lo que genera inseguridad y dificulta su uso por parte de la comunidad. Los niños, jóvenes y familias del barrio no cuentan con un espacio adecuado para jugar, recrearse o desarrollar actividades al aire libre. La falta de seguridad, equipamiento y mantenimiento limita la posibilidad de que este espacio cumpla su función social.

**Solución.** Plan integral de puesta en valor: incorporación de medidas de seguridad para resguardar el espacio; instalación de juegos infantiles y merenderos comunitarios; creación de una pista para clases de baile y gimnasia; refuerzo en la limpieza, conservación del espacio verde y mantenimiento general.

**Beneficios.** Recuperación de un espacio público clave para la recreación, el deporte y la cultura. Mejora de la seguridad y limpieza del entorno. Inclusión de actividades para todas las edades, fortaleciendo la integración social. Fomento de la vida saludable y del uso responsable del espacio público. Incremento de la calidad de vida de los vecinos del Barrio Ernesto Padilla.

### Distrito 11 · Playón deportivo comunitario "Cancha Ex Aeropuerto"
*Cultural deportivo · 231 votos · B° Ex-Aeropuerto*

**Problema.** Mismo diagnóstico que el Distrito 8: ausencia de espacios deportivos adecuados y accesibles para niños, niñas y jóvenes, con el consiguiente sedentarismo y falta de alternativas saludables para el tiempo libre. Se propone la construcción de un playón deportivo comunitario en la cancha del B° Ex Aeropuerto como espacio de encuentro, inclusión y participación.

**Beneficios.** Mayor participación de jóvenes en actividades recreativas y deportivas. Reducción del sedentarismo y mejora del bienestar físico y emocional. Fortalecimiento de la cohesión social y el orgullo barrial. Creación de redes de contención comunitaria a través del deporte. Revalorización y activación de un espacio público deteriorado y subutilizado.

### Distrito 12 · El Arte Popular en la Plaza Los Plátanos
*Cultural deportivo · 192 votos · B° Los Plátanos*

**Problema.** La plaza carece de infraestructura adecuada que permita el desarrollo de espectáculos, talleres o encuentros vecinales, lo que limita las oportunidades de integración social y acceso a la cultura. Las actividades comunitarias suelen desarrollarse sin condiciones de seguridad, visibilidad o accesibilidad, restringiendo la participación. Afecta principalmente a jóvenes, instituciones educativas, artistas locales y organizaciones sociales que no cuentan con un ámbito adecuado para sus eventos y expresiones culturales.

**Propuesta.** Construcción de un escenario al aire libre con capacidad para aproximadamente 200 personas, con gradas, rampas de accesibilidad y equipamiento técnico básico (iluminación, sonido y electricidad segura). El diseño contempla seguridad, confort y sustentabilidad: materiales resistentes, drenaje pluvial, ventilación natural y accesibilidad universal. Permitirá espectáculos, obras teatrales, actividades escolares, ferias, capacitaciones y eventos comunitarios.

### Distrito 13 · Plaza de juegos y pista de salud "Barrio Lincoln"
*Innovación urbana · 49 votos · B° Lincoln · −26.838791, −65.250745*

**Problema.** Carencia de un área de juegos infantiles y de un circuito de ejercicios adecuados para la actividad física en el barrio. Afecta a las familias del Barrio Lincoln, especialmente a niños, niñas y adultos mayores que no disponen de espacios apropiados para el juego, el esparcimiento y la actividad física, limitando las oportunidades de recreación y convivencia barrial.

**Solución.** Instalación de una plaza de juegos infantiles y creación de una pista de salud en el espacio recreativo existente: juegos seguros y modernos para distintas edades; aparatos para actividad física y ejercicios aeróbicos; mobiliario urbano (bancos, cestos, luminarias); parquizado y señalización del circuito de salud.

**Beneficios.** Promueve la recreación saludable, la integración familiar y la convivencia vecinal. Brinda un espacio accesible para el esparcimiento infantil y la actividad física de jóvenes y adultos.

### Distrito 14 · CAC N° 11 Inclusivo
*Cultural deportivo · 40 votos · B° Victoria*

**Problema y objetivo.** Más espacio para la comunidad e incremento de la posibilidad de realizar actividades para todas las edades, ofreciendo un ámbito seguro e inclusivo para encuentros, talleres y eventos.

**Solución.** Espacio para apoyo escolar, alfabetización y actividades culturales.

**Beneficios.** La construcción de un segundo piso permitirá la ampliación y el mejoramiento para los vecinos, y la inclusión para una mejor calidad de vida.

### Distrito 15 · Centro Cultural y Comunitario DIZA
*Socio ambiental · 67 votos · B° Diza*

**Problema.** El barrio Diza carece de un espacio cubierto y accesible donde realizar actividades educativas, culturales y comunitarias. Actualmente los talleres, capacitaciones y reuniones deben organizarse en lugares improvisados o al aire libre, lo que limita la participación vecinal y el desarrollo de propuestas estables. La construcción del Centro permitirá brindar un espacio adecuado y multifuncional para educación, cultura y participación ciudadana; fortalecer la identidad barrial y el sentido de pertenencia; promover la inclusión social, el acceso a servicios y el aprendizaje continuo; y ofrecer un punto de encuentro seguro y equipado para toda la comunidad del Distrito 15.

**Beneficios.** Incremento de la oferta cultural, educativa y recreativa local. Sede para programas municipales, talleres de oficios, ferias y actividades artísticas. Espacio de resguardo ante emergencias climáticas y centro operativo para campañas de salud. Mayor participación comunitaria e integración intergeneracional. Promoción de prácticas sustentables y de cuidado del entorno.

### Distrito 16 · Puesta en valor del Club Social y Deportivo Barrio 20 de Junio
*Cultural deportivo · 186 votos*

**Problema.** Al club asisten más de 350 personas entre niños, adolescentes y adultos, principalmente en fútbol, representando al club en las máximas categorías del fútbol tucumano: ocho categorías infantiles, cuatro de inferiores, reserva, primera división, veteranos y senior más 35. A lo largo de la semana se desarrollan entrenamientos, partidos oficiales y actividades sociales orientadas a la contención, integración y desarrollo físico, social y emocional de los jóvenes. Solicitan al municipio apoyo para la instalación de seis columnas elevadas con luminarias LED de alta potencia y la provisión de los materiales eléctricos necesarios, con el objetivo de permitir la práctica deportiva nocturna en condiciones seguras, ampliar el horario de uso del predio, brindar un espacio cuidado y saludable para los niños y jóvenes de la zona, y reforzar el trabajo comunitario y preventivo en torno al deporte. Se suma la provisión de un salón de usos múltiples con baños.

**Solución.** Instalación de seis columnas de alumbrado de alto porte; colocación de luminarias LED aptas para canchas de fútbol; provisión de cableado, tableros, accesorios y mano de obra completa para el sistema de iluminación; supervisión técnica municipal durante la obra; remodelación y acondicionamiento de baños existentes; construcción y equipamiento de vestuarios para jugadores locales y visitantes.

**Beneficios.** La iluminación permitirá optimizar el uso del predio, incrementar la seguridad, estimular la participación de padres y madres y consolidar un espacio de pertenencia, contención e inclusión. Continuar participando en la Liga Tucumana de Fútbol. Fomentar el deporte como herramienta de inclusión social.

### Distrito 17 · Revalorización de la Plaza del Barrio San Miguel
*Socio ambiental · 28 votos · B° San Miguel*

**Problema.** Falta de equipamiento urbano y recreativo. Degradación del espacio verde y ausencia de mantenimiento programado. Desaprovechamiento del desnivel natural como recurso paisajístico. Ausencia de conectividad peatonal interna. Presencia de situaciones de vulnerabilidad social en el espacio (uso problemático del lugar durante la noche, actos de vandalismo y hechos delictivos). Necesidad de recuperar el espacio como ámbito seguro, inclusivo y de calidad. Demanda vecinal de un espacio público que fomente el encuentro intergeneracional, el juego, el ejercicio y el descanso.

**Solución.** Caminerías perimetrales e interiores con tratamiento de solado articulado y rampas accesibles. Espacios verdes sectorizados con vegetación baja y arbolado de sombra. Juegos infantiles y equipamiento inclusivo. Sector de salud con estaciones de ejercicio y bancos de descanso. Playón deportivo multifuncional de aproximadamente 750 m², con superficie de hormigón llaneado y demarcaciones para cancha de básquet y fútbol 5 integrados, con equipamiento deportivo. Iluminación LED peatonal y deportiva para todo el recorrido y sectores de uso nocturno. Mobiliario urbano: bancos, cestos, bicicleteros y bebederos.

### Distrito 18 · Espacio deportivo comunitario en Plaza de Chañaritos
*Cultural deportivo · 58 votos · plaza entre Amador Lucero, Melián de Leguizamón, Av. Manantial Sur y 42/96 Suroeste*

**Problema.** En esta plaza, desde hace más de 10 años, un grupo de entrenadoras y madres del barrio sostiene de manera autogestiva una actividad deportiva inclusiva y gratuita: clases de hockey infantil para niñas de entre 4 y 12 años. Actualmente participan alrededor de 50 niñas de los barrios Chañaritos, Lapachos, Kirchner y Manantial Sur. A pesar de las condiciones desfavorables (falta de delimitación de cancha, luminarias, superficie adecuada y equipamiento), el grupo se mantiene firme, promoviendo el deporte y valores de solidaridad, participación, contención y comunidad. El proyecto propone formalizar este esfuerzo con infraestructura deportiva adecuada, segura y accesible, para garantizar el derecho al deporte, al juego y al desarrollo integral de las niñas y jóvenes de la zona.

**Solución.** Construir una cancha de césped sintético de 16 × 32 m con cerramiento perimetral. Instalar una pista saludable con caminos de trote y zonas de ejercicios funcionales. Incorporar luminarias LED para permitir el uso en horario nocturno. Fortalecer el vínculo comunitario mediante el deporte y la vida saludable.

**Beneficiarios.** Más de 30 niñas de entre 4 y 12 años que ya participan del hockey. Madres y vecinas que realizan entrenamiento funcional en la plaza. Vecinos que utilizan el espacio público como lugar de encuentro y salud. Niños y jóvenes que podrían incorporarse a la escuelita deportiva gratuita.

### Distrito 19 · Playón deportivo y vestuarios para el Club San Alberto
*Cultural deportivo · 210 votos · B° San Alberto*

**Problema.** El Club San Alberto carece de infraestructura para realizar deportes al aire libre, lo que limita la participación de niños, jóvenes y adultos en actividades que promuevan la salud y la integración social. La falta de instalaciones seguras y equipadas promueve el sedentarismo, reduce las oportunidades de socialización y genera la pérdida de un espacio de encuentro positivo y formativo. La construcción del playón y los vestuarios permitirá fortalecer el rol social y educativo del club, fomentando la cooperación, el trabajo en equipo y la solidaridad.

**Solución.** Construcción de un playón deportivo comunitario con piso de hormigón llaneado, delimitación reglamentaria de canchas y equipamiento para distintas disciplinas (fútbol, básquet, vóley, handball). Incluye vestuarios y baños, iluminación LED para uso nocturno, bancos, cerco perimetral y señalización. El espacio se destinará a actividades deportivas, recreativas y sociales, tanto para socios del club como para vecinos, escuelas y organizaciones comunitarias.

**Beneficios.** Impacto directo en la calidad de vida de la comunidad, promoviendo el deporte como herramienta de inclusión social y prevención de problemáticas vinculadas al ocio y al sedentarismo. Fomenta la participación familiar y vecinal, fortalece los vínculos intergeneracionales y contribuye al uso positivo del espacio público, convirtiendo al club en un punto de encuentro seguro, educativo y saludable.

### Distrito 20 · Centro Deportivo San Miguel, Barrio CGT
*Cultural deportivo · 75 votos · B° CGT*

**Problema.** Poner en valor un espacio sin equipamiento ni mobiliario urbano destinado a la práctica deportiva adaptada, reducir la existencia de zonas oscuras y el vertedero de basura, e integrarlo a la trama urbana de la ciudad.

**Solución.** Canchas de fútbol 7 y canchas multiuso (básquet, vóley), juegos infantiles, caminería, SUM con espacios administrativos, baños y vestuarios, áreas verdes, forestación, rampas, pistas de salud, luminarias LED y paneles solares.

**Beneficios.** Práctica deportiva de amateurs y profesionales. Participación de niños, jóvenes, adultos mayores, personas con discapacidad y familias. Escuelas aledañas y del barrio.

## 8. Notas técnicas del sitio actual

Endpoints públicos observados (todos requieren cabecera `Accept: application/json`; sin ella devuelven `406 Not Acceptable`):

| Endpoint | Devuelve |
|---|---|
| `GET /api/zona` | Los 20 distritos: `_id`, `nombre`, `numero` (sin geometría) |
| `GET /api/tag/all?field=name` | Las 3 categorías |
| `GET /api/text` | 33 textos editables del sitio |
| `GET /api/forum?name=proyectos` | Configuración del foro y esquema completo de campos |
| `GET /api/v2/about-all` | Las 6 preguntas frecuentes |
| `GET /ext/api/topics?forumName=proyectos&page=N&limit=100&tipoIdea=` | Ideas paginadas (`limit` máximo 100; `tipoIdea` es obligatorio y admite vacío para traer todo) |
| `GET /api/user/me` | Perfil (403 sin sesión) |

La geometría de los distritos **no** está disponible por API: vive dentro de `site.js` (módulo `distritos.json`). Por eso se extrajo desde el bundle.

Otras observaciones para tener en cuenta al rehacer el sitio:

- El bundle `site.js` pesa **2,99 MB** y `site.css` **429 KB** sin dividir por ruta; carga jQuery 3.5.1 desde `ajax.googleapis.com`, Bootstrap 3.3.7 y Font Awesome 3.2.1 desde cdnjs, y `cdn.polyfill.io` (que responde **503**: es un servicio discontinuado y además considerado riesgoso; conviene no reponerlo).
- Tipografías: Open Sans, Noto Serif y Poppins desde Google Fonts, más la fuente propia `ALFABET-BOLD.OTF`.
- Colores predominantes del CSS actual: `#2eb1ff` (celeste principal), `#3d699e` (azul), `#0099c3`, `#1791be`, `#8c1e81` (violeta de acento), sobre grises `#f0f0f0` / `#333`.
- Assets propios en `/ext/lib/`: `boot/logo.png`, `boot/logo-smt.png`, `boot/favicon.ico`, `site/footer/logo-der.png`, iconos de redes, `site/home-multiforum/{enterate,participa,seguimos}.png`, `site/banner-invitacion/icon-votar.png`, `site/banner-foro-vecinal/pp-smt-11.jpg`.
- El mapa usa teselas directas de `tile.openstreetmap.org`. Para un sitio municipal con tráfico real conviene un proveedor con términos de uso adecuados (MapTiler, Mapbox, o un servidor propio) y mantener la atribución.
- `/reglamento` está vacío: el reglamento general del Presupuesto Participativo hay que conseguirlo aparte para publicarlo en el sitio nuevo.

## 9. Recomendaciones para el sitio nuevo

1. **Servir los distritos como dato, no como código.** Publicar `distritos.geojson` en una ruta estática o como capa PostGIS con endpoint propio, versionada. Permite reutilizarla en otros sistemas municipales.
2. **Georreferenciación asistida.** Reemplazar el campo de coordenadas en texto libre por un selector de punto en el mapa; derivar el distrito automáticamente por point-in-polygon y guardar lat/lon numéricos separados.
3. **Vista por distrito como página propia.** Cada distrito merece su URL (`/distrito/7`) con su mapa, sus ideas, su proyecto ganador y el avance de obra. Hoy todo se resuelve con filtros sobre un único listado.
4. **Transparencia presupuestaria real.** El esquema ya prevé monto total y montos por etapa (preparación, contratación, ejecución, finalizado) más un historial: en 2025 quedó sin usar. Es la funcionalidad con mayor potencial de confianza pública si se completa.
5. **Migración con limpieza previa.** Deduplicar ideas, normalizar títulos (quitar asteriscos, `S/DATOS`, mayúsculas sostenidas), y revisar los casos donde problema/solución/beneficios están corridos de campo.
6. **Archivo histórico.** El sitio ya contempla un "Archivo de proyectos" con filtro por año: conservar la edición 2025 completa como año histórico del nuevo sitio.
7. **Performance y dependencias.** Evitar el bundle monolítico y las dependencias de terceros discontinuadas; autocontener o servir localmente los assets críticos.

## 10. Archivos entregados

| Archivo | Contenido |
|---|---|
| `datos/distritos.geojson` | Los 20 distritos en GeoJSON (lo más importante del relevamiento) |
| `datos/centroides_distritos.json` | Centroide de cada distrito |
| `datos/proyectos_pp2025.csv` | Las 100 ideas de 2025 con distrito, estado, categoría, barrio, coordenadas normalizadas, votos y fecha |
| `mapa_distritos.html` | Visor interactivo autocontenido de distritos y ganadores |
| `mapa_distritos.svg` | Mapa estático vectorial de los 20 distritos |
| `docs/RELEVAMIENTO-PP-SMT.md` | Este documento |
