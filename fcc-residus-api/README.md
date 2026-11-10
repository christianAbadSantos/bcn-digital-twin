# Residus BCN · API de recogida de residuos

API en **ASP.NET Core (.NET 10)** con **Entity Framework Core** y **PostgreSQL** para el módulo de residuos del [gemelo digital de Barcelona](https://bcn-digital-twin.pages.dev): contenedores con sensor de llenado, entrada de lecturas LoRaWAN, planificación de rutas de recogida e indicadores, con un panel web en **MVC (Razor)**.

## Qué hace

| Endpoint | Qué devuelve |
|---|---|
| `GET /api/contenidors?fraccio=&minNivell=&bbox=` | Contenedores con su último nivel (para el mapa) |
| `GET /api/contenidors/{id}/lectures?hores=24` | Histórico del sensor de un contenedor |
| `POST /api/lectures` | Lectura de un sensor (JSON propio) |
| `POST /api/lectures/ttn` | Webhook de The Things Stack v3 (LoRaWAN): `device_id` = `cont-{id}`, `decoded_payload.nivell` |
| `GET /api/rutes/proposta?fraccio=Rebuig&llindar=80` | Ruta de recogida: contenedores por encima del umbral, desde la base de la Zona Franca, en varios viajes según la capacidad del camión |
| `POST /api/rutes/completar` | Marca la ruta como hecha: vacía los contenedores y la registra |
| `GET /api/kpis` | Indicadores: llenado por fracción, desbordes, batería baja, lecturas, recogidas del día |
| `GET /panel` | Panel de operaciones (MVC + Razor, se refresca cada 30 s) |
| `GET /scalar` · `/openapi/v1.json` | Documentación interactiva y especificación OpenAPI |
| `GET /health` | Estado de la API y de la base de datos |

## Datos: qué es real y qué es simulado

- **Real:** la posición y las fracciones de los ~7.500 contenedores (OpenStreetMap, `amenity=recycling`), generadas por `scripts/build-residus-data.mjs` del gemelo en `public/data/residus.json`. La API las carga la primera vez que arranca.
- **Simulado:** el nivel de llenado. `SimuladorSensors` (un `BackgroundService`) lo avanza cada 15 s con un ritmo por fracción y un perfil horario (`OmplimentModel`), y una parte de los contenedores envía lectura en cada tick, como sensores reales. Con sensores de verdad, las lecturas entrarían por `POST /api/lectures/ttn`.
- **Base de los camiones:** Zona Franca, ubicación aproximada.

## Diseño

```
src/Residus.Api
├── Domain/Model.cs              Contenidor, Lectura, Recollida, Fraccio
├── Data/ResidusDb.cs            DbContext (índices: fracción+nivel, contenedor+fecha)
├── Data/Migrations/             migraciones de EF Core
├── Data/Seeder.cs               carga inicial de los contenedores reales
├── Services/OmplimentModel.cs   cómo se llena cada fracción (y cuántos kg pesa)
├── Services/PlanificadorRutes.cs vecino más próximo + 2-opt, con varios viajes por capacidad
├── Services/SimuladorSensors.cs servicio en segundo plano (sensores simulados)
├── Services/Indicadors.cs       KPIs (API y panel)
├── Controllers/                 API REST + PanelController (MVC)
└── Views/Panel/Index.cshtml     panel de operaciones
tests/Residus.Tests              xUnit: planificador y modelo de llenado
```

- El planificador y el modelo de llenado son funciones puras: se prueban sin base de datos.
- El gemelo usa la misma lógica en JavaScript (`shared/residus.js`) cuando la API no está en marcha (por ejemplo, en la web publicada).
- La contraseña de la base de datos no está en el repositorio: va en *user-secrets* o en una variable de entorno.

## Arrancar en local

Requisitos: .NET 10 SDK y PostgreSQL.

```bash
createdb fcc_residus
cd src/Residus.Api
dotnet user-secrets set "ConnectionStrings:Residus" "Host=localhost;Port=5432;Database=fcc_residus;Username=postgres;Password=..."
dotnet run --launch-profile http        # http://localhost:5080 → aplica migraciones y carga los contenedores
```

Con la API en marcha, el gemelo (`npm run dev` en la raíz) se conecta solo a `http://localhost:5080` (pestaña **Residuos**).

```bash
dotnet test        # desde fcc-residus-api/
```

## Próximos pasos

- PostGIS para consultas espaciales y sectorización de rutas por distrito.
- Rutas por la red viaria real (OSRM o pgRouting) en lugar de distancia recta × 1,3.
- Autenticación de los webhooks de los sensores.
