// Guarda UNA fila por minuto en D1 (opcional). Coste: como máximo 1.440 escrituras/día,
// frente a las 100.000 del plan gratuito. INTEGER PRIMARY KEY = sin índice extra.
// INSERT OR IGNORE: si varias visitas coinciden en el mismo minuto, solo la primera escribe.
export async function persist(db, snap) {
  const minute = Math.floor(snap.ts / 60000)
  const avg = snap.zones.reduce((s, z) => s + z.speed, 0) / snap.zones.length
  const stmts = [
    db
      .prepare('INSERT OR IGNORE INTO readings (minute, rain, wind, alerts, open_incidents, avg_kmh, data) VALUES (?,?,?,?,?,?,?)')
      .bind(
        minute,
        snap.weather.rain,
        snap.weather.wind,
        snap.alerts.length,
        snap.incidents.length,
        Math.round(avg * 10) / 10,
        JSON.stringify({ alerts: snap.alerts.map((a) => ({ rule: a.rule, sev: a.sev, title: a.title })), scenario: snap.scenario }),
      ),
  ]
  // limpieza una vez por hora: se conservan 7 días
  if (minute % 60 === 0) stmts.push(db.prepare('DELETE FROM readings WHERE minute < ?').bind(minute - 7 * 1440))
  await db.batch(stmts)
}
