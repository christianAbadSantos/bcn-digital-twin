import React, { Suspense, lazy, useEffect, useState } from 'react'
import Panel from './Panel.jsx'
import { useTwinData } from './useTwinData.js'

// Cada vista se carga bajo demanda (mapbox-gl y three pesan bastante)
const MapboxTwin = lazy(() => import('./MapboxTwin.jsx'))
const ThreeTwin = lazy(() => import('./ThreeTwin.jsx'))

const LAYER_LABELS = {
  accidents: 'Accidentes',
  rail: 'Trenes',
  port: 'Puerto',
  rain: 'Lluvia',
}

export default function App() {
  const data = useTwinData()
  const [view, setView] = useState('three')
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [layers, setLayers] = useState({ accidents: true, rail: true, port: true, rain: true })
  const [token, setToken] = useState(() => import.meta.env.VITE_MAPBOX_TOKEN || localStorage.getItem('mbtoken') || '')

  // Empezar en la última hora disponible cuando llegan los datos
  useEffect(() => {
    if (data) setHour(data.times.length - 1)
  }, [data?.times.length])

  // Reproducción automática del tiempo
  useEffect(() => {
    if (!playing || !data) return
    const id = setInterval(() => setHour((h) => (h + 1) % data.times.length), 450)
    return () => clearInterval(id)
  }, [playing, data])

  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const saveToken = (t) => {
    try { localStorage.setItem('mbtoken', t) } catch {}
    setToken(t)
  }

  return (
    <div className="app">
      <header className="top">
        <h1>Gemelo digital · Barcelona</h1>
        <div className="tabs">
          <button className={view === 'three' ? 'on' : ''} onClick={() => setView('three')}>3D sin Mapbox</button>
          <button className={view === 'mapbox' ? 'on' : ''} onClick={() => setView('mapbox')}>Con Mapbox</button>
        </div>
        <div className="chips">
          {Object.entries(LAYER_LABELS).map(([k, label]) => (
            <button key={k} className={`chip ${layers[k] ? 'on' : ''}`} onClick={() => toggle(k)}>{label}</button>
          ))}
        </div>
      </header>

      <div className="main">
        <div className="view">
          {!data ? (
            <div className="gate"><div className="card">Cargando datos del tiempo…</div></div>
          ) : (
            <Suspense fallback={<div className="gate"><div className="card">Cargando vista…</div></div>}>
              {view === 'three' ? (
                <ThreeTwin data={data} hour={hour} layers={layers} />
              ) : (
                <MapboxTwin data={data} hour={hour} layers={layers} token={token} onToken={saveToken} />
              )}
            </Suspense>
          )}
        </div>
        <Panel data={data} hour={hour} onPick={setHour} />
      </div>

      <footer className="bar">
        <button className="btn" onClick={() => setPlaying((p) => !p)} disabled={!data}>
          {playing ? '⏸ Pausa' : '▶ Reproducir'}
        </button>
        <input
          type="range"
          min="0"
          max={data ? data.times.length - 1 : 0}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          disabled={!data}
        />
        <span className="time">{data ? data.times[hour].replace('T', ' ') : '—'}</span>
      </footer>
    </div>
  )
}
