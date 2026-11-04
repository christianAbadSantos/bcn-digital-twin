import React from 'react'

const dot = (r) => (r < 0.6 ? 'bad' : r < 0.85 ? 'warn' : 'ok')

export default function Rail({ live, onFocus }) {
  if (!live) return <aside className="rail"><div className="rail-h">Cargando…</div></aside>
  return (
    <aside className="rail">
      <div className="rail-h">Puntos negros 2024</div>
      {live.zones.map((z) => (
        <button key={z.id} className="rail-i" onClick={() => onFocus({ lon: z.lon, lat: z.lat, t: Date.now() })} title="Ver en el mapa">
          <i className={`d ${dot(z.ratio)}`} />
          <span className="rail-n">{z.name}</span>
          <span className="rail-s">{Math.round(z.speed)} km/h · {z.acc2024} acc.</span>
        </button>
      ))}
      <div className="rail-h">Metro</div>
      {live.metro.map((l) => (
        <div key={l.id} className="rail-i static">
          <i className="d" style={{ background: l.color }} />
          <span className="rail-n">{l.name}</span>
          <span className={`rail-s ${l.status === 'retraso' ? 'bad' : ''}`}>{l.status === 'retraso' ? 'con retraso' : 'normal'}</span>
        </div>
      ))}
      {live.port?.length > 0 && (
        <>
          <div className="rail-h">Puerto · grúas</div>
          {live.port.map((c) => (
            <div key={c.device} className="rail-i static">
              <i className={`d ${c.state === 'RUN' ? 'ok' : 'bad'}`} />
              <span className="rail-n">{c.device}</span>
              <span className={`rail-s ${c.state === 'RUN' ? '' : 'bad'}`}>{c.state === 'RUN' ? `${c.boxesPerHour} cont/h` : c.reason || c.state}</span>
            </div>
          ))}
        </>
      )}
    </aside>
  )
}
