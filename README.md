# Gemelo digital de Barcelona

[![CI](https://github.com/christianAbadSantos/bcn-digital-twin/actions/workflows/ci.yml/badge.svg)](https://github.com/christianAbadSantos/bcn-digital-twin/actions/workflows/ci.yml)

Un modelo 3D de Barcelona que junta en un solo mapa datos reales y en vivo de la ciudad: urbanismo, urgencias, residuos, movilidad, puerto y edificios BIM. Funciona en el navegador, sin instalar nada.

**👉 Pruébalo: [bcn-digital-twin.pages.dev](https://bcn-digital-twin.pages.dev)**

![Urbanismo: calificación del suelo y ficha del Catastro de un edificio del Eixample](docs/img/urbanismo.jpg)

## Módulos

| Módulo | Qué hace | Datos |
| --- | --- | --- |
| **Urbanismo** | Colorea cada manzana según lo que se puede construir y, al hacer clic en un edificio, enseña su ficha: año, plantas, uso, superficies, edificabilidad y clave urbanística | Mapa Urbanístic de Catalunya (Generalitat) · Catastro, en directo |
| **Urgencias** | Ambulancias con GPS LoRaWAN, ETA según tráfico y balizas V16, y asignación de bahía en el muelle del hospital leída de un modelo IFC | Balizas V16 reales (DGT) · rutas reales (OSRM) · ambulancias simuladas |
| **Flota de camiones** | Rutas de reparto optimizadas con capacidad y ventana horaria de cada cliente (inserción más barata + reubicación entre camiones + 2-opt; un 38 % menos de km de media que por orden de llegada) y seguimiento en vivo: cada camión manda su GPS por LoRaWAN (payload de 13 bytes, decodificador de The Things Stack, pasarelas con RSSI/SNR/SF, tiempo en el aire y ciclo de trabajo). Las horas de llegada cambian con el tráfico y las balizas V16; recálculo de rutas y recogidas urgentes | Distancias, tiempos y trazado reales por carretera (OSRM / OpenStreetMap) · empresa, pedidos y mensajes simulados |
| **Residuos** | Contenedores con sensor de llenado, indicadores y planificación de la ruta de recogida (vecino más próximo + 2-opt, varios viajes según la capacidad del camión) | 7.500 contenedores reales (OSM) · Open Data BCN · **API .NET + SQL Server** |
| **Movilidad** | Tráfico por zonas, metro 3D en movimiento, trenes de Rodalies en tiempo real, alertas que cruzan varias fuentes y recomendador de rutas | Rodalies real (Renfe GTFS-RT) · tiempo y radar reales · tráfico simulado |
| **Accidentes** | 7.536 accidentes de 2024 cruzados con la lluvia de cada hora (razón de tasas ajustada, IC 95 %) | Guàrdia Urbana (Open Data BCN) · Open-Meteo |
| **Ciudad 3D y BIM** | Edificios reales por teselas con LOD y Web Workers, relieve de 5 m, ortofoto y modelos IFC del Port de Barcelona | OpenStreetMap · ICGC · Biblioteca IFC del Port |
| **Smart city** | Adaptador FIWARE (NGSI-v2 y NGSI-LD) con Smart Data Models y reportes ciudadanos con foto | Context Broker configurable · Clerk + Cloudinary |

<table>
  <tr>
    <td><img src="docs/img/urgencias.jpg" alt="Urgencias: ambulancias en ruta al Clínic"></td>
    <td><img src="docs/img/muelle-ifc.jpg" alt="Muelle de urgencias leído de un modelo IFC"></td>
  </tr>
  <tr>
    <td align="center"><sub>Urgencias: ambulancias en ruta y su ETA</sub></td>
    <td align="center"><sub>Bahías del muelle leídas de un modelo IFC</sub></td>
  </tr>
</table>

## Entorno común de datos (CDE)

Aplicación propia en **[/cde/](https://bcn-digital-twin.pages.dev/cde/)**, conectada al gemelo. Sigue la UNE-EN ISO 19650:

- **Contenedores** con estados *En curso → Compartido → Publicado → Archivado*, códigos de idoneidad (S0–S4, A1) y revisiones (P01.01, P01, C01).
- **Roles:** autor, coordinador BIM y cliente, cada uno con sus pasos.
- **Nomenclatura** `Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número`, comprobada al subir cada fichero.
- **Historial y registro de actividad** de cada contenedor.
- **Visor IFC con That Open Components** (`@thatopen/components` + Fragments): el IfcLoader convierte cada IFC a Fragments en el navegador; selección por raycast, GlobalId ↔ localId, planos de corte y colores por IDS, colisiones, decisiones, mantenimiento o sensores. Usa su propia copia de three (`three-tho`, ver `vite.thatopen.js`) para no tocar el gemelo.
- **Decisiones de obra** enlazadas a elementos del IFC por su GlobalId, exportables en **BCF 2.1**.
- **Mantenimiento (GMAO):** activos y plan preventivo sacados del modelo, órdenes correctivas, sensores en tiempo real (simulados) y exportación CSV.
- **GIS:** el modelo georreferenciado desde el IfcSite sobre el relieve del ICGC, comprobando la cota.
- **SharePoint:** sincronización por estados con Microsoft Graph, en **modo simulación**.
- **Validación IDS** (buildingSMART IDS 1.0): comprueba cada modelo contra los requisitos de información del cliente (`public/data/cde/BCN01-requisitos.ids`). Pinta en 3D lo que cumple y lo que no, y un modelo IFC no se puede publicar sin pasarla.
- **Colisiones** entre arquitectura e instalaciones, con los GlobalId de los dos elementos y paso directo a tema BCF.
- **Certificados:** huella SHA-256 de cada versión publicada, con código de verificación y un verificador de ficheros en el navegador.
- **Árbol del modelo** por disciplina, planta y familia, y **planos de corte** horizontal y vertical.

El CDE publica sus modelos publicados en `/cde/publicados.json`. El gemelo los lee y los dibuja en el mapa (capa *Edificios BIM (CDE)*), con un enlace de vuelta al CDE.

### Gemelo del edificio (BMS)

Aplicación propia en **[/edificio/](https://bcn-digital-twin.pages.dev/edificio/)**, que se abre desde el edificio en el mapa, desde la cabecera del gemelo y desde el CDE. Es una vista de supervisión y control de las instalaciones sobre el modelo IFC del CDE, con el visor de That Open:

- **Navegación** por edificio, plantas, salas y equipos, con árbol lateral, migas de pan y KPI (ocupación, energía, confort y alarmas activas).
- **Plantas con corte** y **mapa térmico por sala**: la caja de cada `IfcSpace` da la mancha de color en el suelo, y cada sala lleva su tarjeta con temperatura, humedad y CO₂.
- **Puntos del BMS asociados a cada elemento IFC** por su código (y de ahí a su GlobalId), con rutas ORD del estilo de Niagara 4: fancoils por sala, climatizadora (consignas, impulsión, retorno y alarmas), bombas y cuadro eléctrico.
- **Mando**: termostato por sala (consigna y marcha/paro), consignas y marcha/paro de cada equipo, y **comando masivo** (buscar puntos, revisar, aplicar en modo Set/Fallback, Override o Auto, con resultado por punto y exportación a CSV).

Los puntos son simulados (`shared/bms.js`, con tests): la sala va hacia su consigna si el fancoil está en marcha, la UTA renueva aire y parar una bomba dispara su alarma. Con un Niagara real se cambiaría la fuente por su API (oBIX o REST), manteniendo las mismas rutas.

Los modelos IFC de ejemplo (un edificio ficticio en Sant Antoni) se generan con `node scripts/build-cde-ifc.mjs`. Los datos de la demo del CDE se guardan en el navegador.

## Arquitectura

```
                   ┌──────────────────────────────────────────────┐
  Navegador        │  React + MapLibre + Three.js + web-ifc (WASM) │
                   └───────┬──────────────┬───────────────┬────────┘
                           │              │               │
              ┌────────────▼───┐  ┌───────▼────────┐  ┌───▼─────────────────────┐
              │ Cloudflare     │  │ API .NET 10    │  │ Datos abiertos directos │
              │ Pages Functions│  │ (residuos)     │  │ Catastro · ICGC · OSM   │
              │ proxies, caché,│  │ EF Core        │  │ Open-Meteo · RainViewer │
              │ D1 y R2        │  │ SQL Server     │  └─────────────────────────┘
              └──┬─────────────┘  └────────────────┘
                 │  Renfe GTFS-RT · DGT DATEX II · FIWARE · IFC del Port
```

- **Frontend:** React 18, MapLibre GL, Three.js, deck.gl, web-ifc, That Open Components, Vite.
- **Backend web:** Cloudflare Pages Functions (proxies para fuentes sin CORS, caché, D1 y R2).
- **API de residuos:** ASP.NET Core 10, EF Core (SQL Server en producción, PostgreSQL en local), panel MVC, webhook LoRaWAN y xUnit. Ver [`fcc-residus-api/`](fcc-residus-api/README.md).
- **Calidad:** tests con Vitest (web) y xUnit (API), ejecutados en GitHub Actions en cada push.

## Qué es real y qué es simulado

Todo lo que se puede es real: mapa, edificios, relieve, calificación urbanística, Catastro, accidentes, lluvia, trenes de Rodalies, balizas V16 y posición de los contenedores. Lo simulado está marcado en la propia web: los sensores de tráfico y de llenado, las ambulancias, la flota de camiones y sus pedidos, y el metro. La tabla completa está en la [guía técnica](docs/GUIA-TECNICA.md#qué-es-real-y-qué-es-simulado).

## Arrancar en local

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de la lógica (Vitest)
```

La API de residuos, opcional en local:

```bash
cd fcc-residus-api
dotnet test
dotnet run --project src/Residus.Api
```

Sin backend, la web usa el mismo motor en el navegador y lo indica en el panel *Fuentes*.

## Documentación

- [Guía técnica](docs/GUIA-TECNICA.md): cada módulo en detalle, origen y límites de los datos, despliegue en Cloudflare (D1, R2, secretos) y estructura del código.
- [API de residuos](fcc-residus-api/README.md): endpoints, modelo de datos y despliegue.

![Escena 3D: Sagrada Família con edificios reales de OpenStreetMap](docs/img/escena-3d.jpg)

---

Christian Abad Santos · © 2026, todos los derechos reservados (ver [LICENSE](LICENSE)). Los datos son de sus respectivas fuentes abiertas, citadas en la web y en la guía técnica.
