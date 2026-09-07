# Reporte de limpieza — migracion de la edicion 2025

Generado por `npm run etl` a partir de `data/raw/proyectos_pp2025.csv`.
Este archivo existe para que la limpieza sea auditable: cada cambio hecho sobre
los datos originales figura aca y en el campo `notasMigracion` de cada idea.

## Totales

| Concepto | Cantidad |
|---|---|
| Filas leidas del CSV | 100 |
| Ideas migradas | 100 |
| Ideas publicadas | 96 |
| Registros repetidos despublicados | 4 |
| Ganadoras | 19 |
| Factibles | 46 |
| No factibles | 29 |
| Integradas | 2 |
| Con coordenada propia | 37 |
| Con ubicacion aproximada (centroide del distrito) | 59 |
| Votos totales de las ganadoras | 2069 |

## Que se corrigio

1. **Coordenadas.** El sitio anterior guardaba la ubicacion como texto libre. Se
   interpretaron los cuatro formatos presentes (par decimal, latitud con signo
   invertido, grados/minutos/segundos y un registro en coordenadas proyectadas),
   se validaron contra el ejido municipal y se resolvio el distrito por
   point-in-polygon contra `public/geo/distritos.geojson`. Las ideas sin
   coordenada utilizable se ubican en el centroide de su distrito y quedan
   marcadas con `ubicacionAproximada`, para que el mapa nunca muestre un punto
   falso como si fuera exacto.
2. **Titulos.** Se quitaron marcas de trabajo interno (`*`, `S/DATOS`,
   `sin identificar`, `- No factible`) y se paso la mayuscula sostenida a
   texto legible conservando siglas (SUM, CAC, AGEF, SMATA, DIZA).
3. **Barrios.** Se quito el prefijo "Barrio" redundante y los marcadores de dato
   faltante pasaron a nulo.
4. **Campos corridos.** En los proyectos de los distritos 2, 3, 6, 12, 14, 15 y 17
   el contenido no correspondia a su etiqueta. Se reordeno en problema / solucion /
   beneficios y, donde el origen no tenia el dato, quedo en nulo con la nota
   correspondiente en lugar de completarlo con texto inventado.
5. **Presupuesto y obra: no se migro nada, porque el origen no trae nada.** El
   campo `presupuesto-total` valia 1 en las 100 ideas: era relleno, no un monto,
   asi que no se migro ningun importe. Y el CSV no tiene ninguna columna sobre la
   ejecucion: su columna `estado` es el estado de EVALUACION (factible,
   no-factible, ganador, integrado), no el de la obra. Las 100 ideas quedan en
   `sin_asignar`.

   Hasta esta corrida, este script le ponia `preparacion` a los 19 ganadores.
   Eso no lo informo nadie: era una constante del script, y el sitio la mostraba
   como el estado real de 19 obras. Se saco. El municipio informara la etapa
   cuando las obras empiecen.

## Registros repetidos unificados

- **D1** se unifican 2 registros en "Puesta en Valor el corredor verde del Barrio Oeste II": "PUESTA EN VALOR CORREDOR VERDE BARRIO OESTE II *"
- **D14** se unifican 2 registros en "CAC N° 11 Inclusivo": "CAC N° 11 Inclusivo- No factible"
- **D15** se unifican 2 registros en "Puesta en valor plaza santísima Trinidad- Villa Alem": "Puesta en valor plaza santísima Trinidad-villa Alem"
- **D17** se unifican 2 registros en "Adoquinamiento Calle Benigno Vallejos Barrio SMATA II y III": "ADOQUINAMIENTO CALLE BENIGNO VALLEJOS BARRIO SMATA 2 Y 3"

## Titulos identicos en distritos distintos

No se unifican automaticamente porque podrian ser proyectos distintos con el
mismo nombre. Requieren decision del equipo:

- "Centro de Contención Deportivo y Cultural San Cayetano" aparece en los distritos 1, 16

## Avisos que requieren revision manual

- "Puesta en Valor del Centro Vecinal- Barrio America": punto en D5, declarada en D1. Requiere revision manual.
- "Centro Vecinal "Capitán de los Andes"- Barrio San Martín": punto en D12, declarada en D1. Requiere revision manual.
- "Revive tu plaza: espacio para todos- Barrio San Nicolas Distrito 1": punto en D15, declarada en D1. Requiere revision manual.
- "Centro de Contención Deportivo y Cultural San Cayetano": punto en D16, declarada en D1. Requiere revision manual.
- "Tu Primer Empleo - Formación y Futuro": punto en D17, declarada en D12. Requiere revision manual.
