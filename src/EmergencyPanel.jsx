import React from 'react'

const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—')
const STATE = { libre: 'Libre', reservada: 'Reservada', ocupada: 'Ocupada' }

// Panel de urgencias: estado de las bahías (del IFC), tablero de llegadas de ambulancias con su ETA
// y bahía asignada (como un panel de llegadas de aeropuerto) y balizas V16 reales.
export default function EmergencyPanel({ em, onFocus }) {
  if (!em) return null
  const h = em.hospital
  const arrivals = em.amb.filter((a) => a.phase === 'ruta' || a.phase === 'espera').sort((a, b) => a.etaMs - b.etaMs)
  const docked = em.amb.filter((a) => a.phase === 'bahia')
  const affected = arrivals.filter((a) => a.v16.length)

  return (
    <div className="panel-body urg">
      <h2>Urgencias · Hospital Clínic</h2>
      <p className="muted">Cada ambulancia envía su GPS (LoRaWAN). Con la ruta, el tráfico y las balizas V16 se calcula a qué hora llega y en qué bahía del muelle aparcará; el hospital lo ve antes de que llegue.</p>

      <div className="urg-actions">
        {h && <button className="btn" onClick={() => onFocus({ lon: h.bays[2]?.center[0] ?? h.entrance[0], lat: h.bays[2]?.center[1] ?? h.entrance[1], zoom: 18.4, pitch: 40, bearing: -45.5, plan: true })}>Ver el muelle</button>}
        <button className="btn" onClick={em.simulateV16} title="Pone una baliza V16 simulada en la ruta de una ambulancia">Simular V16 en una ruta</button>
        {em.simBeacons.length > 0 && <button className="btn" onClick={em.clearSim}>Quitar simuladas</button>}
      </div>

      {!h && <div className="calm">{em.err || 'Leyendo el IFC del hospital…'}</div>}

      {h && (
        <>
          <h3>Bahías del muelle <small className="muted">(leídas del IFC · {h.storey})</small></h3>
          <div className="bays">
            {em.bays.map((b) => (
              <div key={b.code} className={`bay ${b.state}`}>
                <div className="bay-top"><b>{b.code}</b><span>{b.tipo}</span></div>
                <div className="bay-st">{STATE[b.state]}</div>
                <div className="bay-sub">
                  {b.occ ? `${b.occ.id} hasta ${hhmm(b.occ.until)}` : b.next ? `${b.next.id} · ${hhmm(b.next.etaMs)}` : '—'}
                </div>
              </div>
            ))}
          </div>

          <h3>Llegadas</h3>
          {arrivals.length === 0 && <div className="calm">No hay ambulancias en camino.</div>}
          {arrivals.length > 0 && (
            <table className="board">
              <thead><tr><th>Unidad</th><th>Desde</th><th>Llega</th><th>Bahía</th><th>Estado</th></tr></thead>
              <tbody>
                {arrivals.map((a) => (
                  <tr key={a.id} className={a.v16.length ? 'late' : ''} onClick={() => a.pos && onFocus({ lon: a.pos[0], lat: a.pos[1], zoom: 15, pitch: 50 })}>
                    <td><b>{a.id}</b> <span className={`tag ${a.tipo.toLowerCase()}`}>{a.tipo}</span></td>
                    <td className="muted">{a.origen}</td>
                    <td><b>{a.phase === 'espera' ? 'ya' : hhmm(a.etaMs)}</b>{a.phase === 'ruta' && <small className="muted"> · {a.etaMin}′</small>}</td>
                    <td><b>{a.bay || '—'}</b>{a.waitMin > 0 && <small className="warn-t"> +{a.waitMin}′</small>}</td>
                    <td>{a.phase === 'espera' ? 'Esperando bahía' : a.v16.length ? `V16 en ruta (+${a.v16.length * 4}′)` : a.slow > 1.15 ? 'Tráfico denso' : 'En ruta'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {docked.length > 0 && <p className="muted small">En el muelle: {docked.map((a) => `${a.id} (${a.bay})`).join(' · ')}</p>}
        </>
      )}

      <h3>Balizas V16 <small className="muted">(DGT 3.0 · reales)</small></h3>
      {em.v16.status === 'ok' ? (
        <p className="muted small">{em.v16.beacons.length} encendidas ahora en Cataluña · {em.v16.totalSpain} en toda España · actualizado {hhmm(em.v16.ts)}{affected.length ? ` · ${affected.length} afectan a ambulancias` : ''}</p>
      ) : (
        <p className="muted small">{em.v16.status === 'down' ? `Sin datos de la DGT (${em.v16.error})` : 'Cargando…'}</p>
      )}
      <div className="v16-list">
        {em.beacons.slice(0, 8).map((b) => (
          <button key={b.id} className={`v16-row ${b.sim ? 'sim' : ''}`} onClick={() => onFocus({ lon: b.lon, lat: b.lat, zoom: 14.5, pitch: 45 })}>
            <i />
            <span><b>{b.sim ? 'Simulada' : `${b.road}${b.km != null ? ` km ${String(b.km).replace('.', ',')}` : ''}`}</b> {b.municipality}</span>
            <small>{hhmm(b.since)}</small>
          </button>
        ))}
      </div>

      <p className="note">Real: balizas V16 (DGT 3.0, datos abiertos DATEX II), calles y rutas (OpenStreetMap/OSRM), tráfico de los sensores del gemelo. Simulado: el GPS de las ambulancias (con el formato real de un uplink LoRaWAN) y el IFC del muelle, un modelo de ejemplo porque los planos del hospital no son públicos; con el IFC real se leería igual.</p>
    </div>
  )
}
