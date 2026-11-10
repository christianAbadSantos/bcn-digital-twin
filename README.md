# Gemelo digital de Barcelona (demo para entrevistas)

Demo web de un gemelo digital: **ingesta de varias fuentes → bus normalizado → reglas de alertas → decisiones** (mejor ruta de A a B), sobre un mapa 3D libre. No es una app completa: sin usuarios ni roles, a propósito.

## Qué incluye

- **Dashboard** (pestaña propia): operaciones en vivo (fuentes, alertas, tráfico por zona, metro, puerto, tiempo) e histórico real de 2024 (mes, gravedad, mapa de calor hora × día, barrios, efecto de la lluvia).
- **Móvil**: barra de pestañas inferior (Mapa, Escena 3D, Dashboard, Panel), KPIs con desplazamiento horizontal y el panel como hoja inferior.

- **Interfaz tipo centro de control**: barra superior, franja de KPIs en vivo, lista lateral de puntos negros/metro/grúas, mapa oscuro con barra de capas flotante, panel derecho y barra de estado con alertas. Paleta oscura con acento amarillo.

- **Mapa 3D libre** (MapLibre + OpenStreetMap vía OpenFreeMap, sin clave ni cuenta): edificios 3D, metro con trenes 3D en movimiento (Three.js dentro del mapa), congestión por zonas, incidentes, alertas y radar de lluvia.
- **7 fuentes de datos** con su protocolo: MQTT, Kafka, WebSocket, PROFINET, PROFIBUS DP, REST y SQL (D1). Panel "Fuentes" con estado, mensajes/min, latencia y último mensaje de cada una.
- **Motor de reglas** (7 reglas) que cruza varias fuentes para generar alertas. Ejemplo: *choque (Kafka) + atasco (MQTT) + lluvia (REST)* en la misma zona.
- **Recomendador de rutas A→B**: compara coche, bus, metro, bici y a pie, con y sin datos en vivo, y dice si la ingesta cambia la decisión.
- **Escenarios de demo** (selector arriba): lluvia fuerte, choque en Glòries, viento fuerte. Garantizan que la demo siempre tenga algo que mostrar.
- **Accidentes reales de 2024** (7.536 de la Guàrdia Urbana) con la **lluvia real** de esas horas. El panel *Lluvia/accidentes* calcula la relación entre ambas con una razón ajustada por hora del día y tipo de día, con intervalo de confianza. La línea de tiempo empieza en el día más lluvioso de 2024.
- **Puerto**: botón *Encuadrar puerto* y etiquetas de Port Vell, Moll Adossat y Moll Prat. El recinto y esas posiciones están trazados a mano (aproximados).
- **Puntos negros reales**: las 8 zonas del mapa son los puntos de Barcelona con más accidentes en 2024 (la nº 1, Corts Catalanes / Gràcia, tiene 123 a menos de 300 m).
- **Árboles reales en 3D** (opcional, ver abajo): el arbolado viario de Open Data BCN (146.849 ejemplares) con su posición y tipo reales, dibujado en 3D al acercar el mapa.
- **Escena 3D** sin mapa (Three.js), con la misma línea de tiempo. Por defecto carga la **ciudad real por teselas** (botón *Ciudad: OSM real*): edificios de OpenStreetMap con su altura (incluidas las partes de la **Sagrada Família**, hasta 185 m, y el **Arc de Triomf** con su arco hueco), calles, parques y agua, sobre el **relieve real** (modelo de 5 m del ICGC) y, en estilo realista, con **ortofoto o satélite** a elegir (ICGC, Esri, Sentinel-2). Encima, **modelos IFC del Port de Barcelona** (Colom, WTC, Maremagnum, Rambla de Mar…). El botón *Ciudad: esquema* vuelve a la maqueta ligera anterior. Cielo y luz según la hora, lluvia, vistas (Ciudad, Sagrada Família, Arc de Triomf, Port Vell (IFC), Puerto, Montjuïc, Calle, Collserola), **Tour**, brújula, minimapa y etiquetas.

## Qué es real y qué es simulado

| Dato | Origen |
| --- | --- |
| Accidentes de 2024 (fecha, hora, coordenadas, víctimas, barrio) | **Real**: Open Data BCN, Guàrdia Urbana |
| Lluvia horaria de 2024 | **Real**: archivo histórico de Open-Meteo |
| Los 8 puntos negros y su recuento de accidentes | **Real**: calculados de los accidentes de 2024 |
| Tiempo actual (lluvia, viento, temperatura) | **Real**: Open-Meteo |
| Radar de lluvia | **Real**: RainViewer |
| Mapa base y edificios | **Real**: OpenStreetMap (OpenFreeMap) |
| Altura de los edificios | **Real cuando OSM la tiene** (`height`, `building:levels`); si no, OpenMapTiles pone una por defecto |
| Relieve | **Real**: modelo de 5 m del ICGC (respaldo: AWS Terrarium, SRTM) |
| Ortofoto / satélite | **Real**: ICGC, Esri World Imagery o Sentinel-2 cloudless (EOX) |
| Modelos IFC del puerto | **Reales** (Biblioteca IFC del Port, CC BY 4.0); **posición y giro puestos a mano**, aproximados |
| Entidades FIWARE | **Reales si configuras un Context Broker**; con `?fiware=demo` son una **muestra inventada** y se marca así |
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
7. **Escena 3D**: vistas *Sagrada Família* y *Port Vell (IFC)*. En el mapa, pulsa la etiqueta de un tren para que la cámara lo siga.

Ten claro este matiz antes de la entrevista: el *choque* y el *atasco* de las alertas son **simulados**; lo real es dónde ocurren los accidentes y la relación histórica con la lluvia.

## Datos reales: origen y límites

- **Accidentes**: *Accidents gestionats per la Guàrdia Urbana a la ciutat de Barcelona*, 2024, de [Open Data BCN](https://opendata-ajuntament.barcelona.cat) (Ajuntament de Barcelona). Se convirtieron del CSV a `public/data/accidents-2024.json` (238 KB). **No he podido comprobar la licencia desde aquí**: mira la ficha del conjunto de datos y cita la fuente.
- **Qué son**: solo los accidentes gestionados por la Guàrdia Urbana, no todos los de la ciudad. El JSON guarda el barrio pero no la calle ni el número de vehículos implicados, aunque el CSV los trae.
- **Gravedad**: *grave* = al menos un fallecido o herido grave (249 accidentes); *heridos leves* (6.471); *sin heridos* (816). Total 8.511 víctimas, 11 fallecidos.
- **Lluvia**: un solo punto (centro de Barcelona) para toda la ciudad, hora a hora. Se pide a Open-Meteo desde el navegador. **Si esa petición falla, el panel lo dice y no calcula nada**: nunca se rellena con lluvia inventada.
- **Análisis**: razón de tasas con/sin lluvia (≥ 0,2 mm/h) por estratos de hora del día × laborable/fin de semana (Mantel-Haenszel), con IC 95 %. No ajusta por volumen de tráfico, y correlación no es causa. El día del cambio de hora hay una hora de desajuste.
- **Para actualizar el año**: cambia el CSV y regenera el JSON con el mismo formato (`d` = día del año, `h` = hora, `lon`, `lat`, gravedad 0/1/2, víctimas, barrio).

## Mapa: relieve, ortofoto y trenes

- **Relieve 3D**: terreno con el modelo de 5 m del ICGC (terrain-RGB) y sombreado. Activado por defecto salvo en el perfil bajo. Los trenes 3D se apoyan en el terreno.
- **Ortofoto**: imagen aérea del ICGC debajo de calles y edificios.
- **Etiqueta sobre cada tren 3D** (línea y estado, en rojo si va con retraso) que lo sigue en pantalla. **Al pulsarla, la cámara sigue a ese tren**; arrastrar el mapa o volver a pulsar lo deja.

## Teselas 3D fotorrealistas en el mapa (opcional)

Interruptor **Teselas 3D fotorrealistas**, visible solo si configuras una fuente (consume mucha GPU):

- `VITE_TILES3D_URL`: un `tileset.json` (OGC 3D Tiles). El modelo 3D de Barcelona del [GeoportalBCN](https://www.barcelona.cat/geoportal/en) se descarga en SLPK/DWG: conviértelo a 3D Tiles y súbelo a **R2** (ver abajo). Después pon `VITE_TILES3D_URL=/api/assets/bcn3d/tileset.json`.
- `VITE_GOOGLE_MAPS_KEY`: Google Photorealistic 3D Tiles (Map Tiles API, de pago por uso con cuota gratuita; revisa sus condiciones). Se muestran los créditos que exige Google.

El error de pantalla y la memoria de las teselas dependen del perfil del dispositivo. **Corregido:** la versión anterior importaba `Tile3DLoader`, que no existe en loaders.gl 4 (el nombre correcto es `Tiles3DLoader`), así que esa capa no podía funcionar. **No he podido probar esta capa con datos reales** (no hay URL ni clave configuradas).

## Ciudad real en 3D (escena 3D)

- **Teselas z14** (~1,8 × 1,4 km). Por cada una, un **Web Worker** descarga la tesela vectorial de OSM (OpenFreeMap) y la del relieve del ICGC, extruye los edificios (`render_height` / `render_min_height`, así salen las partes de la Sagrada Família y el hueco del Arc de Triomf), triangula las cubiertas y pinta calles, parques y agua en una textura. El hilo principal solo sube buffers a la GPU.
- **Frustum culling**: solo se piden las teselas que entran en el campo de visión de la cámara (y las muy cercanas), por orden de distancia. Además, three.js descarta por frustum cada malla. Lo que queda lejos se libera (geometría y texturas).
- **LOD**: cerca, edificios + imagen de más resolución (z16–z17); más lejos, solo relieve con imagen ligera (z14); más allá, nada (lo tapa la niebla, ajustada a lo cargado).
- **Perfil del dispositivo** (`src/deviceTier.js`): núcleos, memoria, pantalla y GPU (WebGL) → radio, nº de teselas con edificios, resolución del relieve y de la imagen, sombras, DPR, nº de workers y tamaño máximo de IFC. Si los FPS reales no llegan, baja de perfil solo. Para probar: `?tier=low`, `?tier=mid` o `?tier=high`. En el perfil bajo se omiten las construcciones diminutas.
- **Precisión**: OSM en z14 viene cuantizado a ~0,5 m; el relieve es de 5 m (en la tesela z14, ~7 m por píxel). Trenes, etiquetas y modelos IFC se apoyan en el relieve real.
- **Overpass API** (consultas OSM directas) estaba saturada al hacer esto, por eso se usan las teselas vectoriales, que van por CDN.

## Biblioteca IFC del Port de Barcelona

[serveis.portdebarcelona.cat/cataleg_bim_planol](https://serveis.portdebarcelona.cat/cataleg_bim_planol/) publica 951 IFC (CC BY 4.0) en LOD1 y LOD3. En `src/portBim.js` hay una selección de 8: Colom, WTC, Portal de la Pau, Maremagnum, Rambla de Mar, Torre del Rellotge, Vela y Terminal A.

- Su servidor **no permite CORS**: en local los pide el proxy de Vite y en Cloudflare `functions/api/ifc.js`, que los guarda en **R2** la primera vez.
- Se abren con **web-ifc** (WASM) en un worker, solo cuando la cámara se acerca al puerto, uno a uno. Se elige el LOD más detallado que quepa en el presupuesto del perfil (por ejemplo, el LOD3 de Colom pesa 51 MB y los perfiles bajo y medio usan el LOD1).
- **Los IFC no están georreferenciados** (IfcSite sin coordenadas): posición y giro están puestos a mano en `portBim.js` y son aproximados. Ajusta `lon`, `lat` y `rot` si ves alguno desplazado.

## FIWARE (smart city en tiempo real)

`src/fiware.js` lee un **Context Broker** (Orion por NGSI-v2, u Orion-LD/Scorpio/Stellio por NGSI-LD) y normaliza los **Smart Data Models** `TrafficFlowObserved`, `AirQualityObserved`, `OffStreetParking`/`ParkingSpot`, `WeatherObserved` y `NoiseLevelObserved`. Aparece como fuente nº 8 en el panel Fuentes, como capa **FIWARE** en el mapa (clic = detalle) y como etiquetas en la escena 3D. Consulta cada 15 s con la pestaña visible.

- **Recomendado**: en Cloudflare Pages define `FIWARE_URL` (y si hace falta `FIWARE_SERVICE`, `FIWARE_SERVICEPATH` y `FIWARE_TOKEN` como secreto). `functions/api/fiware.js` reenvía solo `/v2/entities` y `/ngsi-ld/v1/entities`, cachea 10 s y, con R2, guarda una instantánea por minuto en `fiware/AAAA-MM-DD/HH-MM/<tipo>.json`.
- O directo: `VITE_FIWARE_URL` (el broker debe permitir CORS, y un token quedaría expuesto en el navegador).
- Sin broker, la fuente sale como *sin configurar*. Para enseñarlo, abre la app con `?fiware=demo`: carga `public/data/fiware-sample.json`, con **valores inventados** marcados como MUESTRA.
- **No lo he probado contra un broker real**, solo con la muestra.

## Cloudflare R2 (almacenamiento gratuito)

R2 es almacenamiento de objetos, no una base de datos SQL (para eso ya está D1). Plan gratuito según la web de Cloudflare: 10 GB, sin coste de salida. Sirve para lo que no cabe en Pages (25 MB por fichero):

1. *R2 → Create bucket*, por ejemplo `bcn-twin-assets`.
2. En el proyecto de Pages: *Settings → Bindings → Add → R2 bucket*, variable `BUCKET`.
3. Vuelve a desplegar.

Con eso, los IFC del Port se cachean en `ifc/`, las lecturas FIWARE en `fiware/`, y cualquier objeto que subas se sirve en `/api/assets/<ruta>` (con Range y CORS), por ejemplo un tileset 3D. Sin R2 todo sigue funcionando, solo que sin esa caché. **Las funciones de R2 no las he podido probar** (no hay cuenta de Cloudflare aquí).

## Árboles reales en 3D

El CSV del arbolado viario pesa ~42 MB y no se sube al repositorio tal cual. Un script lo convierte en dos ficheros pequeños (~1,3 MB):

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
- `GET /api/ifc?f=…`: IFC del Port (caché en R2).
- `GET /api/fiware?path=…`: proxy al Context Broker FIWARE (instantáneas en R2).
- `GET /api/assets/<ruta>`: objetos de R2.

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
src/tiles3d.js     capa opcional de teselas 3D fotorrealistas (deck.gl; tileset propio o Google)
src/OsmCity.jsx    ciudad real por teselas en la escena 3D (frustum, LOD, descarga de memoria)
src/workers/tileWorker.js  OSM vectorial + relieve + imagen → mallas y texturas (fuera del hilo principal)
src/workers/ifcWorker.js   IFC → geometría (web-ifc)
src/deviceTier.js  perfil del dispositivo (CPU, memoria, GPU) y presupuestos
src/tileMath.js    teselas z/x/y y fuentes (OSM, ICGC, Esri, Sentinel-2, Terrarium)
src/ground.js      cota del relieve real para apoyar objetos
src/portBim.js     selección de IFC del Port (posiciones a mano)
src/fiware.js      adaptador FIWARE NGSI-v2/NGSI-LD
functions/api/     ifc.js, fiware.js, assets/[[path]].js (R2)
src/*Panel.jsx     fuentes, alertas, ruta, lluvia vs accidentes
```

## Publicar

Igual que antes: repo en GitHub conectado a Cloudflare Pages, comando `npm run build`, salida `dist`. Ya **no hace falta ningún token** (se quitó Mapbox). Puedes borrar la variable `VITE_MAPBOX_TOKEN` de Cloudflare y el token en Mapbox.

## Trenes reales de Rodalies

`shared/rodalies.js` lee los feeds GTFS-RT abiertos de Renfe (`gtfsrt.renfe.com/vehicle_positions.json` y `trip_updates.json`), la misma fuente que usan webs como TrainTracker24. Muestra en el mapa cada tren de Rodalies de Catalunya con su línea y su retraso. Renfe no permite CORS: en Cloudflare los sirve `functions/api/rodalies.js` (caché de 20 s) y en local el proxy `/renfe` de Vite. El metro (TMB) sigue simulado.

## Inicio de sesión y reportes ciudadanos (Clerk + Cloudinary)

- **Clerk** (instancia de desarrollo): botón *Iniciar sesión* con email o Google. La clave publicable está en `shared/reportsConfig.js` (es pública por diseño).
- **Reportes**: con sesión iniciada, *+ Reportar incidencia* → tocar el mapa → tipo, descripción y foto. La foto se sube **directamente a Cloudinary** con una firma que genera `functions/api/reports.js` tras **verificar el token de Clerk** (JWKS). La ubicación, el tipo y el texto los valida el servidor y van en el contexto de la imagen; no hace falta base de datos. `GET /api/reports` los lista con la Search API de Cloudinary.
- **Secretos** (Cloudflare Pages → Settings → Variables and Secrets, tipo *Secret*): `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` (Cloudinary → Settings → API Keys). Sin ellos la app funciona y los reportes salen como *sin configurar*.
- Las fotos son públicas: el formulario avisa de no subir caras ni matrículas. Para producción haría falta moderación.

## Urgencias: ambulancias, balizas V16 y muelle del hospital (BIM)

Pestaña **Urgencias** del panel y capas **Urgencias** y **Balizas V16 (real)** del mapa. La idea: que el hospital sepa a qué hora llegará cada ambulancia y en qué bahía exacta de su muelle aparcará, como la asignación de puestos de estacionamiento a los aviones en un aeropuerto.

- **Balizas V16 (real):** la DGT publica en abierto todas las incidencias en DATEX II v3.7 (`nap.dgt.es`). Cada baliza V16 encendida es un registro `V16_…` con posición, carretera, km y municipio. `functions/api/v16.js` descarga el XML (~7 MB, comprimido ~220 kB), extrae solo las balizas de Cataluña (`shared/v16.js`, ~6 ms) y lo guarda 60 s en caché. En local se usa el proxy `/dgt` de Vite.
- **Ambulancias (simulado):** 10 unidades SVA/SVB recorren rutas reales por carretera hasta la entrada de urgencias del Clínic (OSRM sobre OpenStreetMap, generadas una vez con `node scripts/build-ambulance-routes.mjs`). Cada una envía su GPS cada 15 s como un uplink LoRaWAN con el formato de The Things Stack v3 (dispositivo, pasarela, RSSI/SNR, factor de dispersión).
- **Muelle del hospital (IFC de ejemplo):** `public/data/hospital-clinic-urgencias.ifc` es un IFC4 generado con `node scripts/build-hospital-ifc.mjs`. Está georreferenciado en la entrada de urgencias real (OpenStreetMap) y tiene cada bahía como `IfcSpace` de tipo `PARKING`, con su geometría y el conjunto de propiedades `Pset_BCN_BahiaAmbulancia` (tipo de unidad, medidas, acceso al box de críticos). La app lo lee con web-ifc en un worker (`src/hospitalIfc.js`); con el IFC real del hospital funcionaría igual. Se comprueba con `node scripts/check-hospital-ifc.mjs`.
- **ETA y bahía (`shared/emergency.js`):** ETA = tiempo de ruta pendiente × congestión de los sensores cercanos (con sirenas, la mitad) + 4 min por cada baliza V16 a menos de 120 m de la ruta pendiente. Las llegadas se ordenan por ETA y a cada una se le asigna la bahía compatible que antes quede libre (las SVA tienen bahías propias), manteniendo la anterior si no empeora más de 1 minuto.
- **Probarlo:** "Simular V16 en una ruta" pone una baliza simulada en la ruta de la ambulancia que más tarda y se ve cómo cambia su ETA y su bahía. "Ver el muelle" acerca el mapa a vista de planta para ver las bahías (libre, reservada u ocupada).

## Residuos y limpieza (con API en .NET)

Pestaña **Residuos** del panel y capa **Residuos** del mapa: unos 7.500 contenedores reales de Barcelona (OpenStreetMap) con un sensor de llenado cada uno, los puntos verdes y los puntos críticos de limpieza (Open Data BCN), y la planificación de la ruta de recogida desde una base en la Zona Franca.

- **Datos reales:** `node scripts/build-residus-data.mjs` genera `public/data/residus.json` (posiciones y fracciones de los contenedores, puntos verdes y puntos críticos de limpieza con su último estado).
- **API .NET (`fcc-residus-api/`):** ASP.NET Core 10 + EF Core + PostgreSQL, con entrada de lecturas LoRaWAN (webhook de The Things Stack), planificador de rutas (vecino más próximo + 2-opt, varios viajes según la capacidad del camión), indicadores, un panel MVC y tests con xUnit. Ver su README.
- **Sin API** (por ejemplo, en la web publicada), el gemelo simula lo mismo en el navegador con la misma lógica (`shared/residus.js`).
