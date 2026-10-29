# Gemelo digital de Barcelona

Demo web con dos vistas del mismo gemelo digital, más un panel que cruza **lluvia** y **accidentes**.

- **3D sin Mapbox** (Three.js / react-three-fiber): ciudad en bloques, trenes 3D en movimiento, barcos y contenedores en el puerto, lluvia en partículas y accidentes como balizas pulsantes.
- **Con Mapbox**: edificios 3D reales, mapa de calor de accidentes, radar de lluvia (RainViewer), trenes y barcos animados.
- **Panel**: gráfico lluvia vs accidentes por hora (última semana), correlación de Pearson y media de accidentes con/sin lluvia. Se puede hacer clic en el gráfico o mover el deslizador para recorrer el tiempo.

## Qué es real y qué es simulado

| Dato | Origen |
| --- | --- |
| Lluvia horaria (7 días) | **Real**, API de Open-Meteo (sin clave) |
| Radar de lluvia (vista Mapbox) | **Real**, RainViewer |
| Accidentes | **Simulados** (modelo de Poisson donde la lluvia sube la tasa) |
| Trenes y barcos | **Simulados** sobre rutas esquemáticas |

Como los accidentes se generan a partir de la lluvia, la correlación que se ve es ilustrativa y no una conclusión. Para datos reales, sustituye `simulateAccidents` en `src/sim.js` por el dataset de accidentes de la Guàrdia Urbana en Open Data BCN y deja el resto igual.

## Arrancar en local

```bash
npm install
cp .env.example .env   # opcional: pon tu token público de Mapbox (pk.…)
npm run dev
```

Si no pones token en `.env`, la vista Mapbox te lo pide en pantalla y lo guarda en tu navegador.

## Publicar en Cloudflare (gratis)

1. Sube esta carpeta a un repo público de GitHub (`.env` ya está en `.gitignore`).
2. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** y elige el repo.
3. Build command: `npm run build` · Output directory: `dist`.
4. En *Variables de entorno* añade `VITE_MAPBOX_TOKEN` con tu token público.
5. Deploy. Te da una URL `*.pages.dev` para compartir.

Alternativa por CLI: `npm run build && npx wrangler deploy` (usa `wrangler.toml`).

## Sobre el token de Mapbox

Un token `pk.` queda visible en el código del navegador, es lo normal en Mapbox. Para que nadie lo reutilice, en el panel de Mapbox restríngelo a tu dominio `*.pages.dev` (URL restrictions). No uses nunca un token secreto (`sk.`) en el frontend.
