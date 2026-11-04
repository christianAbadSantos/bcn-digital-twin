// GET /api/history → últimas 2 h guardadas en D1 (si está configurado).
export async function onRequestGet({ env }) {
  const headers = { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' }
  if (!env.DB) return new Response(JSON.stringify({ enabled: false, rows: [] }), { headers })
  try {
    const { results } = await env.DB.prepare(
      'SELECT minute, rain, wind, alerts, open_incidents, avg_kmh FROM readings ORDER BY minute DESC LIMIT 120',
    ).all()
    return new Response(JSON.stringify({ enabled: true, rows: results.reverse() }), { headers })
  } catch (e) {
    return new Response(JSON.stringify({ enabled: false, rows: [], error: 'tabla no creada: ejecuta db/schema.sql' }), { headers })
  }
}
