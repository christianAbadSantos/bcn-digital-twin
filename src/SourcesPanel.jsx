import React from 'react'

const STATUS = { ok: 'En línea', degraded: 'Degradado', idle: 'Sin configurar', down: 'Caído' }

function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 100) return `hace ${s} s`
  return `hace ${Math.round(s / 60)} min`
}

export default function SourcesPanel({ live, mode, hist, paused, onResume }) {
  if (!live) return <div className="panel-body">Conectando con las fuentes…</div>
  const total = live.sources.reduce((s, x) => s + x.msgPerMin, 0)

  return (
    <div className="panel-body">
      <h2>Fuentes de datos</h2>
      <p className="muted">
        {mode === 'backend' ? (
          <>Backend: <b>Cloudflare Functions</b> · D1: <b>{live.db ? 'activo' : 'no configurado'}</b></>
        ) : (
          <>Backend no disponible: <b>motor local</b> en el navegador (mismo código).</>
        )}
      </p>
      <div className="flow">Conectores → bus normalizado → reglas → alertas y rutas</div>

      {paused && (
        <div className="pausebox">
          Actualización en pausa para ahorrar cuota. <button className="btn" onClick={onResume}>Reanudar</button>
        </div>
      )}

      <div className="sumline">
        <span><b>{live.sources.length}</b> fuentes</span>
        <span><b>{Math.round(total)}</b> msg/min</span>
        <span><b>{live.alerts.length}</b> alertas</span>
      </div>

      {live.sources.map((s) => (
        <div className="src" key={s.id}>
          <div className="src-top">
            <span className={`dot2 ${s.status}`} title={STATUS[s.status]} />
            <b>{s.protocol}</b>
            <span className="tag">{s.simulated ? 'simulado' : 'real'}</span>
            <span className="src-r">{s.msgPerMin} msg/min · {s.latencyMs} ms</span>
          </div>
          <div className="src-label">{s.label}</div>
          <div className="src-ep">{s.endpoint}</div>
          <code className="sample">{JSON.stringify(s.sample)}</code>
          <div className="src-ep">{STATUS[s.status]} · último mensaje {ago(s.lastTs, live.ts)}</div>
        </div>
      ))}

      {hist?.enabled && <p className="muted">D1: {hist.rows.length} minutos guardados en las últimas 2 h.</p>}

      <p className="note">
        Los conectores simulados generan mensajes con la forma de cada protocolo (topic MQTT, partición y offset de Kafka,
        esclavo Profibus, frame Profinet). Para producción se sustituye cada conector por su driver real y las reglas no cambian.
        Solo el conector REST (Open-Meteo) trae datos reales.
      </p>
    </div>
  )
}
