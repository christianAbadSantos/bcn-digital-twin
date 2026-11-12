import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import Panel from './Panel.jsx'
import SourcesPanel from './SourcesPanel.jsx'
import AlertsPanel from './AlertsPanel.jsx'
import RoutePanel from './RoutePanel.jsx'
import Kpis from './Kpis.jsx'
import Dashboard from './Dashboard.jsx'
import Rail from './Rail.jsx'
import { useTwinData } from './useTwinData.js'
import { useLive } from './useLive.js'
import { SCENARIOS, recommendRoutes } from '../shared/engine.js'
import { detectTier } from './deviceTier.js'
import { useFiware } from './fiware.js'
import { useRodalies } from './useRodalies.js'
import { useReports, AuthButton, ReportButton, ReportDialog } from './reports.jsx'
import { useEmergency } from './useEmergency.js'
import EmergencyPanel from './EmergencyPanel.jsx'
import { useResidus } from './useResidus.js'
import ResidusPanel from './ResidusPanel.jsx'
import { useUrbanisme } from './urbanisme.js'
import UrbanismePanel from './UrbanismePanel.jsx'

// Cada vista se carga bajo demanda (maplibre y three pesan bastante)
const MapTwin = lazy(() => import('./MapTwin.jsx'))
const ThreeTwin = lazy(() => import('./ThreeTwin.jsx'))

const TILES3D_URL = import.meta.env.VITE_TILES3D_URL || ''
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
const HAS_TILES3D = Boolean(TILES3D_URL || GOOGLE_KEY)
const TIER = detectTier()

const CHIPS = {
  bld3d: 'Edificios 3D',
  terrain: 'Relieve 3D',
  sat: 'Ortofoto',
  tiles3d: 'Teselas 3D fotorrealistas',
  fiware: 'FIWARE',
  rodalies: 'Rodalies (real)',
  reports: 'Reportes',
  res: 'Residuos',
  urb: 'Urbanismo',
  urg: 'Urgencias',
  v16: 'Balizas V16 (real)',
  metro: 'Metro 3D',
  trees: 'Árboles',
  labels: 'Etiquetas',
  traffic: 'Tráfico',
  accidents: 'Accidentes',
  alerts: 'Alertas',
  rain: 'Radar lluvia',
  port: 'Puerto',
}
const SCENE_CHIPS = ['labels', 'metro', 'port', 'rain', 'accidents', 'fiware']

export default function App() {
  const data = useTwinData()
  const [scenario, setScenario] = useState('normal')
  const { snap: liveRaw, mode, paused, resume, hist } = useLive(scenario)
  const fiware = useFiware()
  const rodalies = useRodalies()
  const reports = useReports()
  const [picking, setPicking] = useState(false) // eligiendo punto para un reporte
  const [reportPoint, setReportPoint] = useState(null)
  const emergency = useEmergency(liveRaw?.zones)
  const residus = useResidus()
  const [resFraccio, setResFraccio] = useState('all')
  // la fuente FIWARE se añade al resto (aparece en el panel Fuentes aunque no esté configurada)
  const live = useMemo(() => (liveRaw ? { ...liveRaw, sources: [...liveRaw.sources, rodalies.source, fiware.source, reports.source, ...emergency.sources, residus.source], fiware, rodalies, reports } : null), [liveRaw, fiware, rodalies, reports, emergency.sources, residus.source])

  const [view, setView] = useState('map')
  const [tab, setTab] = useState('fuentes')
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [focus, setFocus] = useState(null)
  const [sheet, setSheet] = useState(false) // panel inferior en móvil
  const [sel, setSel] = useState({ from: 'aeroport', to: 'catalunya' })
  const [layers, setLayers] = useState({ bld3d: true, terrain: TIER.key !== 'low', sat: false, fiware: true, rodalies: true, reports: true, res: true, urg: true, v16: true, tiles3d: false, metro: true, trees: true, labels: true, traffic: true, accidents: true, alerts: true, rain: true, port: true, urb: false })
  const urbanisme = useUrbanisme(layers.urb)

  const ok = Boolean(data && !data.error)
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const warn = live ? live.alerts.filter((a) => a.sev === 'warn').length : 0
  const info = live ? live.alerts.filter((a) => a.sev === 'info').length : 0

  // al cargar, la línea de tiempo empieza en el día más lluvioso de 2024 (si hay datos de lluvia)
  useEffect(() => {
    if (ok) setHour(data.startHour)
  }, [ok])

  // reproducir: 3 horas cada 250 ms (un día cada ~2 s)
  useEffect(() => {
    if (!playing || !ok) return
    const id = setInterval(() => setHour((h) => (h + 3) % data.times.length), 250)
    return () => clearInterval(id)
  }, [playing, ok])

  const route = useMemo(() => (live ? recommendRoutes(sel.from, sel.to, live) : null), [live, sel])
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }))
  const showUrb = () => setLayers((l) => ({ ...l, urb: true }))
  const goTab = (t) => {
    setTab(t)
    if (t === 'urb') showUrb()
  }
  const chips = view === 'map' ? Object.keys(CHIPS).filter((k) => k !== 'labels' && (k !== 'tiles3d' || HAS_TILES3D)) : SCENE_CHIPS
  const showTimeline = view === 'scene' || (view === 'map' && tab === 'historico')
  const crit = live ? live.alerts.filter((a) => a.sev === 'crit').length : 0

  const onFocus = (f) => {
    setView('map')
    setFocus(f)
    setSheet(false)
  }
  const goView = (v) => {
    setView(v)
    setSheet(false)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo" />Digital Twin<small>Barcelona</small></div>
        <nav className="nav">
          <button className={view === 'map' ? 'on' : ''} onClick={() => goView('map')}>Mapa 3D</button>
          <button className={view === 'scene' ? 'on' : ''} onClick={() => goView('scene')}>Escena 3D</button>
          <button className={view === 'dash' ? 'on' : ''} onClick={() => goView('dash')}>Dashboard</button>
        </nav>
        <div className="top-r">
          <span className="pill">Datos reales + simulados</span>
          <label className="scn">
            Escenario
            <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
              {Object.entries(SCENARIOS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </label>
          <span className="clock">{clock.toLocaleTimeString('es-ES')}</span>
          <AuthButton />
        </div>
      </header>

      {view === 'dash' ? (
        ok ? <Dashboard data={data} live={live} mode={mode} scenarioLabel={SCENARIOS[scenario].label} /> : <div className="gate"><div className="card">Cargando datos…</div></div>
      ) : (<>
      <Kpis live={live} data={ok ? data : null} />

      <div className="main">
        <Rail live={live} onFocus={onFocus} />
        <div className="view">
          <div className="toolbar">
            {view === 'map' && <ReportButton picking={picking} onStart={() => setPicking(true)} onCancel={() => setPicking(false)} />}
            {view === 'map' && <button className="chip" onClick={() => setFocus({ port: true, t: Date.now() })}>Encuadrar puerto</button>}
            {chips.map((k) => (
              <button key={k} className={`chip ${layers[k] ? 'on' : ''}`} onClick={() => toggle(k)}>{CHIPS[k]}</button>
            ))}
          </div>
          {!data ? (
            <div className="gate"><div className="card">Cargando accidentes y lluvia de 2024…</div></div>
          ) : data.error ? (
            <div className="gate"><div className="card"><p className="err">No se pudieron cargar los accidentes reales ({data.error}).</p><p className="muted">Comprueba que existe public/data/accidents-2024.json.</p></div></div>
          ) : (
            <Suspense fallback={<div className="gate"><div className="card">Cargando vista…</div></div>}>
              {view === 'map' ? (
                <MapTwin data={data} hour={hour} layers={layers} live={live} emergency={emergency} residus={layers.res ? residus : null} resFraccio={resFraccio} urbanisme={urbanisme} onUrbPick={(p) => { urbanisme.tria(p); setTab('urb') }} focus={focus} route={tab === 'ruta' ? route : null} tilesUrl={TILES3D_URL} googleKey={GOOGLE_KEY} tier={TIER.key}
                  picking={picking} onPick={(p) => { setPicking(false); setReportPoint(p) }} />
              ) : (
                <ThreeTwin data={data} hour={hour} layers={layers} live={live} />
              )}
            </Suspense>
          )}
        </div>

        <aside className={`panel ${sheet ? 'open' : ''}`}>
          <button className="sheet-x" onClick={() => setSheet(false)} aria-label="Cerrar panel">Cerrar ✕</button>
          <nav className="ptabs">
            <button className={tab === 'fuentes' ? 'on' : ''} onClick={() => setTab('fuentes')}>Fuentes</button>
            <button className={tab === 'alertas' ? 'on' : ''} onClick={() => setTab('alertas')}>
              Alertas{live && live.alerts.length > 0 && <span className={`badge2 ${crit ? 'crit' : ''}`}>{live.alerts.length}</span>}
            </button>
            <button className={tab === 'urg' ? 'on' : ''} onClick={() => setTab('urg')}>Urgencias</button>
            <button className={tab === 'res' ? 'on' : ''} onClick={() => setTab('res')}>Residuos</button>
            <button className={tab === 'urb' ? 'on' : ''} onClick={() => goTab('urb')}>Urbanismo</button>
            <button className={tab === 'ruta' ? 'on' : ''} onClick={() => setTab('ruta')}>Ruta</button>
            <button className={tab === 'historico' ? 'on' : ''} onClick={() => setTab('historico')}>Histórico</button>
          </nav>
          {tab === 'fuentes' && <SourcesPanel live={live} mode={mode} hist={hist} paused={paused} onResume={resume} />}
          {tab === 'alertas' && <AlertsPanel live={live} onFocus={onFocus} />}
          {tab === 'urg' && <EmergencyPanel em={emergency} onFocus={onFocus} />}
          {tab === 'res' && <ResidusPanel res={residus} fraccio={resFraccio} setFraccio={setResFraccio} onFocus={onFocus} />}
          {tab === 'urb' && <UrbanismePanel urb={urbanisme} enabled={layers.urb} onEnable={showUrb} onFocus={onFocus} />}
          {tab === 'ruta' && <RoutePanel sel={sel} setSel={setSel} route={route} live={live} />}
          {tab === 'historico' && <Panel data={data} hour={hour} onPick={setHour} />}
        </aside>
      </div>

      </>)}

      {showTimeline && (
        <footer className="bar">
          <button className="btn" onClick={() => setPlaying((p) => !p)} disabled={!ok}>{playing ? '⏸ Pausa' : '▶ Reproducir'}</button>
          <input type="range" min="0" max={ok ? data.times.length - 1 : 0} value={hour} onChange={(e) => setHour(Number(e.target.value))} disabled={!ok} />
          <span className="time">{ok ? data.times[hour].replace('T', ' ') : '—'}</span>
        </footer>
      )}

      {reportPoint && <ReportDialog point={reportPoint} onClose={() => setReportPoint(null)} onSent={() => setTimeout(reports.reload, 2500)} />}

      <footer className="status">
        <span className="sv"><i className="d bad" />{crit} críticas</span>
        <span className="sv"><i className="d warn" />{warn} altas</span>
        <span className="sv"><i className="d info" />{info} info</span>
        <span className="st-msg">{live && live.alerts[0] ? live.alerts[0].title : 'Sin alertas activas'}</span>
        <span className="st-r">{mode === 'backend' ? 'Backend Cloudflare' : 'Motor local'} · actualiza cada 5 s{paused ? ' (en pausa)' : ''}</span>
      </footer>

      <nav className="mnav">
        <button className={view === 'map' && !sheet ? 'on' : ''} onClick={() => goView('map')}><i>◎</i>Mapa</button>
        <button className={view === 'scene' ? 'on' : ''} onClick={() => goView('scene')}><i>▣</i>Escena 3D</button>
        <button className={view === 'dash' ? 'on' : ''} onClick={() => goView('dash')}><i>▤</i>Dashboard</button>
        <button className={sheet ? 'on' : ''} onClick={() => { if (view === 'dash') setView('map'); setSheet((v) => !v) }}>
          <i>☰</i>Panel{live && live.alerts.length > 0 && <span className={`badge2 ${crit ? 'crit' : ''}`}>{live.alerts.length}</span>}
        </button>
      </nav>
    </div>
  )
}
