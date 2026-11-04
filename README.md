# Gemelo digital de Barcelona (demo para entrevistas)

Demo web de un gemelo digital: **ingesta de varias fuentes → bus normalizado → reglas de alertas → decisiones** (mejor ruta de A a B), sobre un mapa 3D libre. No es una app completa: sin usuarios ni roles, a propósito.

## Qué incluye

- **Mapa 3D libre** (MapLibre + OpenStreetMap vía OpenFreeMap, sin clave ni cuenta): edificios 3D, metro con trenes 3D en movimiento (Three.js dentro del mapa), congestión por zonas, incidentes, alertas y radar de lluvia.
- **7 fuentes de datos** con su protocolo: MQTT, Kafka, WebSocket, PROFINET, PROFIBUS DP, REST y SQL (D1). Panel "Fuentes" con estado, mensajes/min, latencia y último mensaje de cada una.
- **Motor de reglas** (7 reglas) que cruza varias fuentes para generar alertas. Ejemplo: *choque (Kafka) + atasco (MQTT) + lluvia (REST)* en la misma zona.
- **Recomendador de rutas A→B**: compara coche, bus, metro, bici y a pie, con y sin datos en vivo, y dice si la ingesta cambia la decisión.
- **Escenarios de demo** (selector arriba): lluvia fuerte, choque en Glòries, viento fuerte. Garantizan que la demo siempre tenga algo que mostrar.
- **Accidentes reales de 2024** (7.536 de la Guàrdia Urbana) con la **lluvia real** de esas horas. El panel *Lluvia/accidentes* calcula la relación entre ambas con una razón ajustada por hora del día y tipo de día, con intervalo de confianza. La línea de tiempo empieza en el día más lluvioso de 2024.
- **Puntos negros reales**: las 8 zonas del mapa son los puntos de Barcelona con más accidentes en 2024 (la nº 1, Corts Catalanes / Gràcia, tiene 123 a menos de 300 m).
- **Árboles reales en 3D** (opcional, ver abajo): el arbolado viario de Open Data BCN (~240.000 ejemplares) con su posición y tipo reales, dibujado en 3D al acercar el mapa.
- **Escena 3D** sin mapa (Three.js), con la misma línea de tiempo.

## Qué es real y qué es simulado

| Dato | Origen |
| --- | --- |
| Accidentes de 2024 (fecha, hora, coordenadas, víctimas, barrio) | **Real**: Open Data BCN, Guàrdia Urbana |
| Lluvia horaria de 2024 | **Real**: archivo histórico de Open-Meteo |
| Los 8 puntos negros y su recuento de accidentes | **Real**: calculados de los accidentes de 2024 |
| Tiempo actual (lluvia, viento, temperatura) | **Real**: Open-Meteo |
| Radar de lluvia | **Real**: RainViewer |
| Mapa base y edificios | **Real**: OpenStreetMap (OpenFreeMap) |
| Sensores MQTT, incidentes Kafka, telemetría WebSocket, PLC Profinet, pasarela Profibus | **Simulados** |
| Velocidad del tráfico por zona, incidentes y alertas "en vivo" | **Simulados** (sobre zonas reales) |
| Trenes y barcos de la escena 3D | **Simulados** |
| Posición, especie y tipo (frondosa/palmera/conífera) de cada árbol | **Real**: Open Data BCN, arbolado viario (CC BY 4.0 según su ficha) |
| Altura y tamaño de copa de cada árbol | **Ilustrativo**: el CSV no trae altura; se genera al azar de forma fija por árbol |
| Red de metro | **Esquemática**: estaciones aproximadas, no sirve para viajar |

Los conectores simulados generan mensajes con la forma del protocolo real (topic MQTT, partición y offset de Kafka, esclavo Profibus, frame Profinet), pero **no abren sockets reales**. En producción se cambia cada conector por su driver (MQTT.js, kafkajs, pasarela OPC UA/Profinet…) y las reglas siguen igual. Dilo así en la entrevista.

## Guion de demo (3 minutos)

1. **Fuentes**: "siete conectores, cada uno con su protocolo; solo el del tiempo es real".
2. **Escenario "Choque en Corts Catalanes / Gràcia + lluvia"** → pestaña **Alertas**: aparece *Choque + atasco*, con las fuentes que lo disparan. "Ninguna fuente sola daría este aviso".
3. Pulsa **Ver en el mapa**: el mapa vuela a la zona. Mira el metro 3D.
4. Pestaña **Ruta**, de Aeroport a Plaça Catalunya: sin datos en vivo recomienda coche; con el choque, metro. "Esto no se puede hacer sin la ingesta".
5. Pestaña **Lluvia/accidentes**: "esto sí son datos reales, 7.536 accidentes de 2024 con la lluvia de cada hora". Enseña la razón ajustada y explica por qué la media simple engaña.
6. Apaga **Edificios 3D** si el portátil va justo de GPU.

Ten claro este matiz antes de la entrevista: el *choque* y el *atasco* de las alertas son **simulados**; lo real es dónde ocurren los accidentes y la relación histórica con la lluvia.

## Datos reales: origen y límites

- **Accidentes**: *Accidents gestionats per la Guàrdia Urbana a la ciutat de Barcelona*, 2024, de [Open Data BCN](https://opendata-ajuntament.barcelona.cat) (Ajuntament de Barcelona). Se convirtieron del CSV a `public/data/accidents-2024.json` (238 KB). **No he podido comprobar la licencia desde aquí**: mira la ficha del conjunto de datos y cita la fuente.
- **Qué son**: solo los accidentes gestionados por la Guàrdia Urbana, no todos los de la ciudad. El JSON guarda el barrio pero no la calle ni el número de vehículos implicados, aunque el CSV los trae.
- **Gravedad**: *grave* = al menos un fallecido o herido grave (249 accidentes); *heridos leves* (6.471); *sin heridos* (816). Total 8.511 víctimas, 11 fallecidos.
- **Lluvia**: un solo punto (centro de Barcelona) para toda la ciudad, hora a hora. Se pide a Open-Meteo desde el navegador. **Si esa petición falla, el panel lo dice y no calcula nada**: nunca se rellena con lluvia inventada.
- **Análisis**: razón de tasas con/sin lluvia (≥ 0,2 mm/h) por estratos de hora del día × laborable/fin de semana (Mantel-Haenszel), con IC 95 %. No ajusta por volumen de tráfico, y correlación no es causa. El día del cambio de hora hay una hora de desajuste.
- **Para actualizar el año**: cambia el CSV y regenera el JSON con el mismo formato (`d` = día del año, `h` = hora, `lon`, `lat`, gravedad 0/1/2, víctimas, barrio).

## Capa de teselas 3D de Barcelona (opcional)

Hay un interruptor **Teselas 3D Barcelona**, desactivado por defecto porque consume mucha GPU y porque **no he encontrado una URL abierta de 3D Tiles** que se pueda cargar directamente. Lo que sí he verificado: el modelo 3D de Barcelona está en el [GeoportalBCN](https://www.barcelona.cat/geoportal/en) y se descarga en formatos SLPK y DWG (desde [w20.bcn.cat/cartobcn](https://w20.bcn.cat/cartobcn)), sin licencia indicada en esa página.

Para usarlo: convierte el modelo a 3D Tiles, alójalo donde quieras (los ficheros de Cloudflare Pages tienen un máximo de 25 MB cada uno) y pon la URL del `tileset.json` en `VITE_TILES3D_URL`. Si pones una URL, la capa se carga con deck.gl solo cuando activas el interruptor. **Esta capa no la he podido probar.** Mientras tanto, los edificios 3D de OpenStreetMap ya dan un efecto de ciudad en 3D.

## Árboles reales en 3D

El CSV del arbolado viario pesa ~42 MB y no se sube al repositorio tal cual. Un script lo convierte en dos ficheros pequeños (~2 MB):

1. Descarga *Arbrat viari* (CSV) de [Open Data BCN](https://opendata-ajuntament.barcelona.cat) y descomprímelo.
2. Ejecuta: `npm run trees -- ruta\al\arbrat-viari.csv` (o `node scripts/build-trees.mjs ruta/al/archivo.csv`).
3. Genera `public/data/trees.bin` y `trees.json` y muestra un informe: árboles válidos, filas descartadas (sin coordenadas, fuera de Barcelona, duplicadas, columnas incorrectas), grupos y especies más frecuentes.
4. Sube los dos ficheros al repositorio (`git add public/data`) y vuelve a desplegar.

Si faltan esos ficheros, la app funciona igual y el mapa avisa. En el mapa, activa **Árboles** y acerca (zoom ≥ 14,2): solo se dibujan los cercanos al centro, con un tope de 60.000 por vista.

**Qué es real y qué no:** posición, especie y si es palmera o conífera son datos del CSV. La **altura y la copa son ilustrativas** (el CSV no las trae) y el mapa lo indica. No se usa la columna `categoria_arbrat` como tamaño porque no consta que lo sea. Los grupos se deducen del nombre científico con una lista de géneros; algún caso raro puede quedar como frondosa. No he podido probar la capa en un navegador, solo el script y la sintaxis.

**Licencia:** la ficha del conjunto indica CC BY 4.0 (a verificar por tu parte); cita *Open Data BCN · Ajuntament de Barcelona*. La atribución ya aparece en el mapa.

## Arrancar en local

```bash
npm install
npm run dev
```

En local no hay backend (`/api` no existe), así que la app usa **el mismo motor en el navegador** y lo indica en el panel Fuentes.

## Backend en Cloudflare (gratis)

El backend son **Pages Functions**: la carpeta `functions/` se despliega sola con el proyecto, sin configuración. Expone:

- `GET /api/state?scenario=…`: ejecuta conectores + reglas y devuelve el estado.
- `GET /api/history`: últimas 2 h guardadas en D1 (si lo configuras).

**D1 es opcional.** Sin D1, todo funciona igual y la fuente "SQL" aparece como "sin configurar". Para activarlo (los nombres de menú de Cloudflare pueden variar):

1. *Storage & Databases → D1 SQL database → Create*, nombre `bcn-twin`.
2. Abre su pestaña *Console*, pega el contenido de `db/schema.sql` y ejecútalo.
3. En tu proyecto de Pages: *Settings → Bindings → Add → D1 database*, variable `DB`, elige `bcn-twin`.
4. Haz un nuevo despliegue (*Deployments → Retry deployment*).

### Límites y cómo no pasarte

Límites del plan gratuito según las páginas que consulté (Workers: 100.000 peticiones/día; D1: 5 millones de lecturas y 100.000 escrituras/día, 5 GB). **Dos fuentes no coinciden en el tiempo de CPU por petición (10 ms y 30 ms)**, por eso el código es muy ligero. Medidas incluidas:

- El navegador consulta cada **5 s**, solo con la pestaña visible, y se **pausa solo a los 5 min** (botón Reanudar).
- El servidor cachea cada respuesta **4 s** y el tiempo **10 min**.
- D1 guarda **1 fila por minuto** como máximo (1.440 escrituras/día, un 1,4 % del límite) y solo en el escenario normal. Se borran los datos de más de 7 días.
- `public/_routes.json` hace que solo `/api/*` ejecute funciones: los archivos estáticos no cuentan como peticiones.
- Si el backend falla o se agota la cuota, la app sigue con el motor local.

**Sobre el cobro:** Cloudflare no tiene en el plan gratuito una opción de "tope de gasto". Lo que protege es **no tener método de pago ni cambiar a un plan de pago** (Workers Paid). No he podido confirmar en documentación oficial qué ocurre exactamente al superar un límite gratuito; revisa la sección de límites en la documentación de Cloudflare y el apartado *Billing* de tu cuenta.

## Estructura

```
shared/engine.js   conectores simulados, reglas, rutas (lo usan backend y navegador)
public/data/       accidentes reales de 2024 (JSON)
src/stats.js       análisis lluvia vs accidentes (razón ajustada, IC 95 %)
functions/         backend: /api/state, /api/history
db/schema.sql      tabla de D1 (opcional)
src/MapTwin.jsx    mapa 3D libre (MapLibre)
src/metroLayer.js  trenes 3D dentro del mapa (Three.js)
src/treesLayer.js  árboles 3D instanciados dentro del mapa
scripts/build-trees.mjs  CSV de arbolado → trees.bin + trees.json
src/tiles3d.js     capa opcional de teselas 3D (deck.gl)
src/*Panel.jsx     fuentes, alertas, ruta, lluvia vs accidentes
```

## Publicar

Igual que antes: repo en GitHub conectado a Cloudflare Pages, comando `npm run build`, salida `dist`. Ya **no hace falta ningún token** (se quitó Mapbox). Puedes borrar la variable `VITE_MAPBOX_TOKEN` de Cloudflare y el token en Mapbox.
