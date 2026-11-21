// Gemelo digital del edificio (BCN01): supervisión y control de las instalaciones sobre el modelo IFC.
// El 3D es el visor de That Open del CDE; cada sala (IfcSpace) y cada equipo están asociados a sus puntos del
// BMS por el código del elemento, y de ahí a su GlobalId. Los puntos son simulados (shared/bms.js).
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useModelMeta } from '../cde/useModelMeta.js'
import { EQUIPOS, PLANTAS, PUNTOS, ZONAS, alarmas, buscar, efectivo, estadoInicial, mandar, paso } from '../../shared/bms.js'

const CdeViewer = lazy(() => import('../cde/CdeViewer.jsx'))
const BASE = `${import.meta.env.BASE_URL}data/cde/`
const MODELOS = [
  { file: 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', url: BASE + 'BCN01-CAB-ZZ-XX-M3-A-0001.ifc', visible: true },
  { file: 'BCN01-CAB-ZZ-XX-M3-M-0001.ifc', url: BASE + 'BCN01-CAB-ZZ-XX-M3-M-0001.ifc', visible: true },
]
const GEMELO = import.meta.env.VITE_GEMELO_URL || '/'
const CDE = import.meta.env.VITE_CDE_URL || '/cde/'
const KEY = 'bcn-bms.v1'
// altura de corte de cada planta, en metros sobre la cara inferior del forjado de planta baja (−0,30)
const CORTE = [3.5, 7.2]
const SIS = ['Climatización', 'Fontanería', 'Electricidad']
const fmt = (x, ud = '') => (typeof x === 'number' ? `${String(x).replace('.', ',')}${ud ? ' ' + ud : ''}` : typeof x === 'boolean' ? (x ? 'On' : 'Off') : x ?? '—')

// color de la sala según su temperatura (azul frío → verde confort → rojo calor)
function colorTemp(t) {
  const st = [[18, [59, 130, 246]], [21, [56, 189, 248]], [22.5, [52, 199, 123]], [24, [250, 204, 21]], [25.5, [249, 115, 22]], [27, [239, 68, 68]]]
  if (t <= st[0][0]) return rgb(st[0][1])
  for (let i = 1; i < st.length; i++) if (t <= st[i][0]) { const [a, ca] = st[i - 1], [b, cb] = st[i], k = (t - a) / (b - a); return rgb(ca.map((c, j) => c + (cb[j] - c) * k)) }
  return rgb(st.at(-1)[1])
}
const rgb = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')

function cargar() {
  const e = estadoInicial()
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j?.fallback) return { ...e, fallback: { ...e.fallback, ...j.fallback }, override: j.override || {} } } catch { /* sin almacenamiento */ }
  return e
}

export default function Edificio() {
  // ---- BMS simulado: un paso cada 2 s
  const est = useRef(null)
  if (!est.current) est.current = cargar()
  const [vals, setVals] = useState(() => { const r = paso(est.current); est.current = r.est; return r })
  const tick = useCallback(() => { const r = paso(est.current); est.current = r.est; setVals(r) }, [])
  useEffect(() => { const id = setInterval(tick, 2000); return () => clearInterval(id) }, [tick])
  const enviar = useCallback((ords, orden) => {
    const r = mandar(est.current, ords, orden)
    est.current = r.est
    try { localStorage.setItem(KEY, JSON.stringify({ fallback: r.est.fallback, override: r.est.override })) } catch { /* lleno */ }
    tick()
    return r.resultados
  }, [tick])
  const v = vals.valores
  const alarm = useMemo(() => alarmas(v), [v])

  // ---- elementos del modelo (código → GlobalId, planta)
  const meta = useModelMeta(MODELOS)
  const els = useMemo(() => Object.values(meta).flatMap((m) => m.elementos || []), [meta])
  const porCodigo = useMemo(() => new Map(els.map((e) => [e.nombre, e])), [els])
  const porGuid = useMemo(() => new Map(els.map((e) => [e.guid, e])), [els])
  const guidDe = (codigo) => porCodigo.get(codigo)?.guid

  // ---- navegación: inicio · planta · zona · equipo
  const [nav, setNav] = useState({ tipo: 'inicio' })
  const [hist, setHist] = useState([])
  const ir = (n) => { setHist((h) => [...h, nav].slice(-30)); setNav(n) }
  const atras = () => setHist((h) => { if (h.length) setNav(h.at(-1)); return h.slice(0, -1) })
  const zona = nav.tipo === 'zona' ? ZONAS.find((z) => z.fcu === nav.fcu) : null
  const equipo = nav.tipo === 'equipo' ? EQUIPOS.find((e) => e.codigo === nav.codigo) : null
  const planta = nav.tipo === 'planta' ? nav.i : zona ? zona.planta : null
  const [masivo, setMasivo] = useState(false)
  const [verAlarmas, setVerAlarmas] = useState(false)

  // ---- qué se ve en el 3D
  const espacios = useMemo(() => els.filter((e) => e.clase === 'IFCSPACE'), [els])
  const ocultos = useMemo(() => {
    const s = new Set()
    // las salas (IfcSpace) son volúmenes: no se pintan; su caja sirve para el mapa térmico del suelo
    for (const e of espacios) s.add(e.guid)
    return s
  }, [espacios, planta])
  const marcas = useMemo(() => {
    const m = {}
    for (const a of alarm) { const g = guidDe(a.elemento); if (g && !ZONAS.some((z) => z.espacio === a.elemento)) m[g] = '#ff4d5e' }
    return m
  }, [alarm, porCodigo]) // eslint-disable-line react-hooks/exhaustive-deps
  const seleccion = equipo ? guidDe(equipo.codigo) : null
  const [api, setApi] = useState(null)
  const corte = useMemo(() => (planta != null && api ? { h: CORTE[planta] / api.caja.getSize(new THREE.Vector3()).y, v: null } : null), [planta, api])

  // ---- api del visor (cámara y cajas) para encuadrar y para las etiquetas flotantes
  const [cajas, setCajas] = useState({})
  useEffect(() => {
    if (!api || !els.length) return
    let vivo = true
    ;(async () => {
      const out = {}
      for (const c of [...ZONAS.map((z) => z.espacio), ...EQUIPOS.map((e) => e.codigo)]) { const g = guidDe(c); if (g) { const b = await api.cajaDe(g); if (b && !b.isEmpty()) out[c] = b } }
      if (vivo) setCajas(out)
    })()
    return () => { vivo = false }
  }, [api, els]) // eslint-disable-line react-hooks/exhaustive-deps

  // mapa térmico: una mancha en el suelo de cada sala de la planta, del color de su temperatura
  const manchas = useRef(new Map())
  useEffect(() => {
    if (!api) return
    const escena = api.world.scene.three
    const vivas = new Set()
    if (planta != null) for (const z of ZONAS.filter((x) => x.planta === planta)) {
      const bx = cajas[z.espacio], d = v[`zona:${z.fcu}`]
      if (!bx || !d) continue
      vivas.add(z.fcu)
      let m = manchas.current.get(z.fcu)
      if (!m) {
        const s = bx.getSize(new THREE.Vector3()), c = bx.getCenter(new THREE.Vector3())
        const tex = new THREE.CanvasTexture(document.createElement('canvas'))
        m = new THREE.Mesh(new THREE.PlaneGeometry(s.x, s.z), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        m.position.set(c.x, bx.min.y + 0.03, c.z)
        m.renderOrder = 2
        m.userData = { ar: s.x / s.z }
        escena.add(m)
        manchas.current.set(z.fcu, m)
      }
      const col = colorTemp(d.T), sel = zona === z
      if (m.userData.col !== col + sel) {
        m.userData.col = col + sel
        const W = 256, H = Math.max(32, Math.round(256 / m.userData.ar)), cv = m.material.map.image
        cv.width = W; cv.height = H
        const g = cv.getContext('2d'), r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.55)
        r.addColorStop(0, col + 'ff'); r.addColorStop(0.5, col + 'b0'); r.addColorStop(1, col + '30')
        g.fillStyle = r; g.fillRect(0, 0, W, H)
        if (sel) { g.strokeStyle = '#38bdf8'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6) }
        m.material.map.needsUpdate = true
      }
    }
    for (const [k, m] of manchas.current) m.visible = vivas.has(k)
  }, [api, planta, zona, cajas, v])
  useEffect(() => () => { for (const m of manchas.current.values()) { m.removeFromParent(); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose() } }, [])

  // encuadre de cámara según la vista
  useEffect(() => {
    if (!api) return
    const cam = api.world.camera.controls
    const b = api.caja, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3())
    if (nav.tipo === 'inicio') return void cam.setLookAt(c.x + s.x * 0.85, c.y + s.y * 1.3 + 10, c.z + s.z * 1.5 + 8, c.x, c.y, c.z, true)
    if (planta != null && !zona) { const y = b.min.y + CORTE[planta] - 2.5; return void cam.setLookAt(c.x + s.x * 0.35, y + 20, c.z + s.z * 0.95, c.x, y, c.z, true) }
    const bx = zona ? cajas[zona.espacio] : equipo ? cajas[equipo.codigo] : null
    if (!bx) return
    const p = bx.getCenter(new THREE.Vector3()), r = Math.max(7, bx.getSize(new THREE.Vector3()).length() * (zona ? 1.1 : 2.6))
    cam.setLookAt(p.x + r * 0.75, p.y + r * 0.7, p.z + r * 0.9, p.x, p.y, p.z, true)
  }, [api, nav, cajas]) // eslint-disable-line react-hooks/exhaustive-deps

  // etiquetas: posiciones en pantalla recalculadas en cada fotograma
  const etiquetas = useMemo(() => {
    const out = []
    const top = (bx) => { const p = bx.getCenter(new THREE.Vector3()); p.y = bx.min.y + Math.min(2.2, bx.getSize(new THREE.Vector3()).y * 0.8); return p }
    if (planta != null) for (const z of ZONAS.filter((x) => x.planta === planta)) if (cajas[z.espacio]) out.push({ k: z.fcu, p: top(cajas[z.espacio]), zona: z })
    if (nav.tipo === 'inicio') {
      for (const e of EQUIPOS) if (cajas[e.codigo]) { const bx = cajas[e.codigo], p = bx.getCenter(new THREE.Vector3()); p.y = bx.max.y + 0.4; out.push({ k: e.codigo, p, equipo: e }) }
      if (api) PLANTAS.forEach((n, i) => { const b = api.caja, p = new THREE.Vector3(b.max.x + 1, b.min.y + (i ? 5.8 : 2), b.max.z); out.push({ k: 'pl' + i, p, planta: i }) })
    }
    return out
  }, [planta, nav.tipo, cajas, api])
  const capa = useRef(null)
  useEffect(() => {
    if (!api) return
    let raf
    const v3 = new THREE.Vector3()
    const loop = () => {
      const el = capa.current, cam = api.world.camera.three
      if (el) {
        const w = el.clientWidth, h = el.clientHeight
        for (const n of el.children) {
          const e = etiquetas.find((x) => x.k === n.dataset.k)
          if (!e) continue
          v3.copy(e.p).project(cam)
          const fuera = v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1
          n.style.transform = `translate(${((v3.x + 1) / 2) * w}px, ${((1 - v3.y) / 2) * h}px) translate(-50%, -100%)`
          n.style.visibility = fuera ? 'hidden' : 'visible'
        }
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [api, etiquetas])

  // clic en el modelo: sala → zona, equipo → equipo, sensor → su zona
  const onSelect = useCallback((s) => {
    const e = s && porGuid.get(s.guid)
    if (!e) return
    const z = ZONAS.find((x) => x.espacio === e.nombre || x.sensor === e.nombre)
    if (z) return ir({ tipo: 'zona', fcu: z.fcu })
    if (EQUIPOS.some((x) => x.codigo === e.nombre)) ir({ tipo: 'equipo', codigo: e.nombre })
  }, [porGuid, nav]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- KPI
  const zs = ZONAS.map((z) => v[`zona:${z.fcu}`]).filter(Boolean)
  const confort = zs.length ? zs.reduce((a, d) => a + d.T, 0) / zs.length : 0
  const potOrd = PUNTOS.find((p) => p.nombre === 'POT_ACT').ord, eneOrd = PUNTOS.find((p) => p.nombre === 'ENE_HOY').ord

  // migas de pan
  const migas = [['Menú principal', { tipo: 'inicio' }], ['Biblioteca BCN01', { tipo: 'inicio' }]]
  if (planta != null) migas.push(['Plantas', null], [PLANTAS[planta], { tipo: 'planta', i: planta }])
  if (zona) migas.push([zona.fcu, nav])
  if (equipo) migas.push([equipo.sistema, null], [equipo.nombre, nav])

  return (
    <div className="ed">
      <header className="ed-top">
        <div className="ed-nav">
          <button title="Menú principal" onClick={() => ir({ tipo: 'inicio' })}>⌂</button>
          <button title="Atrás" disabled={!hist.length} onClick={atras}>↶</button>
          <nav>{migas.map(([t, n], i) => <span key={i}>{i > 0 && <i>›</i>}{n ? <button onClick={() => ir(n)} className={i === migas.length - 1 ? 'on' : ''}>{t}</button> : <em>{t}</em>}</span>)}</nav>
        </div>
        <b className="ed-obra">BCN01 · Biblioteca de barri Sant Antoni</b>
        <div className="ed-acc">
          <button className="ed-btn" onClick={() => setMasivo(true)}>⇶ Comando masivo</button>
          <span className="ed-ses">Sesión: operador</span>
          <a className="ed-btn ghost" href={CDE}>CDE ↗</a>
          <a className="ed-btn ghost" href={`${GEMELO}?lon=2.160447&lat=41.379296&z=18&capa=bim`}>Gemelo BCN ↗</a>
        </div>
      </header>

      <div className="ed-body">
        <aside className="ed-side">
          <small>EXPLORAR</small>
          <Nodo t="Menú principal" on={nav.tipo === 'inicio'} onClick={() => ir({ tipo: 'inicio' })} />
          <Nodo t="Biblioteca BCN01" abierto nivel={0}>
            <Nodo t="Plantas" abierto nivel={1}>
              {PLANTAS.map((n, i) => (
                <Nodo key={n} t={n} nivel={2} abierto={planta === i} on={nav.tipo === 'planta' && nav.i === i} onClick={() => ir({ tipo: 'planta', i })}>
                  {ZONAS.filter((z) => z.planta === i).map((z) => <Nodo key={z.fcu} t={`${z.fcu}`} sub={z.nombre} nivel={3} hoja on={zona === z} alarma={alarm.some((a) => a.equipo === z.fcu)} onClick={() => ir({ tipo: 'zona', fcu: z.fcu })} />)}
                </Nodo>
              ))}
            </Nodo>
            {SIS.map((s) => (
              <Nodo key={s} t={s} nivel={1} abierto>
                {EQUIPOS.filter((e) => e.sistema === s).map((e) => <Nodo key={e.codigo} t={e.nombre} sub={e.codigo} nivel={2} hoja on={equipo === e} alarma={alarm.some((a) => a.equipo === e.codigo)} onClick={() => ir({ tipo: 'equipo', codigo: e.codigo })} />)}
              </Nodo>
            ))}
          </Nodo>
        </aside>

        <main className="ed-main">
          <Suspense fallback={<div className="cde-msg">Cargando el visor…</div>}>
            <CdeViewer modelos={MODELOS} colorPor="natural" marcas={marcas} seleccion={seleccion} onSelect={onSelect} ocultos={ocultos} corte={corte} fondo="#0b1622" onListo={setApi} />
          </Suspense>

          <div className="ed-capa" ref={capa}>
            {etiquetas.map((e) => (
              <div key={e.k} data-k={e.k} className="ed-tag">
                {e.zona && <Tarjeta z={e.zona} d={v[`zona:${e.zona.fcu}`]} onClick={() => ir({ tipo: 'zona', fcu: e.zona.fcu })} />}
                {e.equipo && <button className={`ed-chip ${alarm.some((a) => a.equipo === e.equipo.codigo) ? 'bad' : ''}`} onClick={() => ir({ tipo: 'equipo', codigo: e.equipo.codigo })}>{e.equipo.codigo}</button>}
                {e.planta != null && <button className="ed-chip pl" onClick={() => ir({ tipo: 'planta', i: e.planta })}>{PLANTAS[e.planta]} ›</button>}
              </div>
            ))}
          </div>

          <div className="ed-kpis">
            <Kpi ico="👥" t="Ocupación" v={vals.ocupacion} />
            <Kpi ico="⚡" t="Energía hoy" v={`${fmt(v[eneOrd])}`} s={`kWh · ${fmt(v[potOrd])} kW`} />
            <Kpi ico="🌡" t="Confort" v={`${fmt(Math.round(confort * 10) / 10)} °C`} />
            <Kpi ico="🔔" t="Alarmas activas" v={alarm.length} bad={alarm.length > 0} onClick={() => setVerAlarmas((x) => !x)} />
          </div>
          {verAlarmas && (
            <div className="ed-alarmas">
              <b>Alarmas activas</b>
              {alarm.length ? alarm.map((a, i) => <button key={i} onClick={() => ir(ZONAS.some((z) => z.fcu === a.equipo) ? { tipo: 'zona', fcu: a.equipo } : { tipo: 'equipo', codigo: a.equipo })}>{a.texto}</button>) : <span>Sin alarmas</span>}
            </div>
          )}

          {zona && <PanelZona z={zona} v={v} enviar={enviar} />}
          {equipo && <PanelEquipo e={equipo} v={v} enviar={enviar} />}
          {planta != null && !zona && <Escala />}

          <footer className="ed-pie">
            {nav.tipo === 'inicio' && 'Modelo IFC del CDE · edificio y navegación'}
            {nav.tipo === 'planta' && 'Temperatura y humedad por sala · mapa térmico sobre los espacios IFC'}
            {zona && 'Consigna, marcha/paro y lectura del fancoil de la sala'}
            {equipo && 'Puntos del equipo asociados a su elemento IFC'}
            <span>Puntos BMS simulados · rutas ORD tipo Niagara 4</span>
          </footer>
        </main>
      </div>
      {masivo && <Masivo enviar={enviar} est={est} onClose={() => setMasivo(false)} />}
    </div>
  )
}

function Nodo({ t, sub, nivel = 0, on, hoja, abierto, alarma, onClick, children }) {
  const [ab, setAb] = useState(!!abierto)
  useEffect(() => { if (abierto) setAb(true) }, [abierto])
  return (
    <div className="ed-nodo">
      <button className={`${on ? 'on' : ''}`} style={{ paddingLeft: 10 + nivel * 14 }} onClick={() => { onClick?.(); if (children) setAb((x) => !x) }}>
        <span className="ico">{hoja ? '▣' : '▤'}</span>
        <span className="t">{t}{sub && <small>{sub}</small>}</span>
        {alarma && <span className="dot" />}
        {children && <span className="car">{ab ? '▾' : '›'}</span>}
      </button>
      {ab && children}
    </div>
  )
}

const Kpi = ({ ico, t, v, s, bad, onClick }) => (
  <button className={`ed-kpi ${bad ? 'bad' : ''}`} onClick={onClick} disabled={!onClick}>
    <span className="ico">{ico}</span><span><small>{t}</small><b>{v}</b>{s && <em>{s}</em>}</span>
  </button>
)

function Tarjeta({ z, d, onClick }) {
  if (!d) return null
  return (
    <button className="ed-card" onClick={onClick}>
      <b>{z.nombre}</b>
      <span><i>🌡 TEM_AMB</i><em style={{ color: colorTemp(d.T) }}>{fmt(d.T, '°C')}</em></span>
      <span><i>💧 HUM_AMB</i><em>{fmt(d.hum, '%')}</em></span>
      <span><i>CO₂</i><em className={d.co2 > 1000 ? 'bad' : ''}>{d.co2} ppm</em></span>
    </button>
  )
}

function Escala() {
  return <div className="ed-escala"><span>18 °C</span><i /><span>27 °C</span></div>
}

// ficha de la sala: datos del fancoil y termostato (consigna y marcha/paro)
function PanelZona({ z, v, enviar }) {
  const ps = PUNTOS.filter((p) => p.equipo === z.fcu)
  const o = (n) => ps.find((p) => p.nombre === n).ord
  const sp = v[o('SP_AMB')], on = v[o('PM_FCU')]
  const [msg, setMsg] = useState('')
  const mand = (ord, valor) => { const [r] = enviar([ord], { modo: 'set', valor }); setMsg(r.msg) }
  return (
    <>
      <div className="ed-panel">
        <h4>DATOS EQUIPO · {z.fcu}</h4>
        <small className="ed-sub">{z.nombre} · {z.espacio}{z.sensor ? ` · ${z.sensor}` : ''}</small>
        {ps.map((p) => <Fila key={p.ord} p={p} x={v[p.ord]} />)}
      </div>
      <div className={`ed-termo ${on ? '' : 'off'}`}>
        <div className="disp">{on ? sp.toFixed(1).replace('.', ',') : 'OFF'}<small>{on ? '°C' : ''}</small></div>
        <div className="amb">Sala {fmt(v[o('TEM_AMB')], '°C')}</div>
        <div className="bot">
          <button disabled={!on} onClick={() => mand(o('SP_AMB'), Math.round((sp - 0.5) * 10) / 10)}>−</button>
          <button className="pw" onClick={() => mand(o('PM_FCU'), !on)}>⏻</button>
          <button disabled={!on} onClick={() => mand(o('SP_AMB'), Math.round((sp + 0.5) * 10) / 10)}>+</button>
        </div>
        {msg && <small className="ok">{msg}</small>}
      </div>
    </>
  )
}

function PanelEquipo({ e, v, enviar }) {
  const ps = PUNTOS.filter((p) => p.equipo === e.codigo)
  const grupos = [...new Set(ps.map((p) => p.grupo))]
  const [msg, setMsg] = useState('')
  const mand = (p, valor) => { const [r] = enviar([p.ord], { modo: 'set', valor }); setMsg(r.msg) }
  return (
    <div className="ed-panel">
      <h4>{e.nombre.toUpperCase()}</h4>
      <small className="ed-sub">{e.codigo} · {e.sistema}</small>
      {grupos.map((g) => (
        <div key={g}>
          <h5>{g.toUpperCase()}</h5>
          {ps.filter((p) => p.grupo === g).map((p) => <Fila key={p.ord} p={p} x={v[p.ord]} mand={mand} />)}
        </div>
      ))}
      {msg && <small className="ok">{msg}</small>}
    </div>
  )
}

function Fila({ p, x, mand }) {
  const paso_ = p.ud === 'Pa' ? 25 : p.ud === 'bar' ? 0.1 : 0.5
  return (
    <div className={`ed-fila ${p.rw ? 'rw' : ''}`} title={p.ord}>
      <span>{p.nombre}</span>
      <em className={x === 'Alarma' ? 'bad' : x === 'Open' || x === true ? 'on' : ''}>{fmt(x, p.ud)}</em>
      {mand && p.rw && (p.tipo === 'boolean'
        ? <button onClick={() => mand(p, !x)}>{x ? 'Parar' : 'Marcha'}</button>
        : <span className="st"><button onClick={() => mand(p, Math.round((x - paso_) * 10) / 10)}>−</button><button onClick={() => mand(p, Math.round((x + paso_) * 10) / 10)}>+</button></span>)}
    </div>
  )
}

// comando masivo: buscar puntos, revisar y aplicar con resultado por punto (como en Niagara)
function Masivo({ enviar, est, onClose }) {
  const [nombre, setNombre] = useState('PM_FCU')
  const [carpeta, setCarpeta] = useState('station:|slot:/')
  const [tipo, setTipo] = useState('boolean')
  const [modo, setModo] = useState('set')
  const [valor, setValor] = useState('true')
  const [res, setRes] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [revisado, setRevisado] = useState(false)
  const [out, setOut] = useState({})
  const lista = res || []
  const buscarYa = () => { const r = buscar(nombre, carpeta.replace('station:|slot:/', '')).filter((p) => tipo === 'todos' || p.tipo === tipo); setRes(r); setSel(new Set(r.filter((p) => p.rw).map((p) => p.ord))); setRevisado(false); setOut({}) }
  const aplicar = () => { const r = enviar([...sel], { modo, valor: tipo === 'boolean' ? valor === 'true' : valor }); setOut(Object.fromEntries(r.map((x) => [x.ord, x]))); setRevisado(false) }
  const csv = () => {
    const filas = [['ORD', 'tipo', 'valor', 'resultado'], ...lista.map((p) => [p.ord, p.tipo, String(efectivo(est.current, p.ord) ?? ''), out[p.ord]?.msg || ''])]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([filas.map((f) => f.map((c) => `"${c}"`).join(';')).join('\n')], { type: 'text/csv' }))
    a.download = 'comando-masivo.csv'; a.click()
  }
  const aptos = lista.filter((p) => sel.has(p.ord) && p.rw).length
  return (
    <div className="ed-modal" onClick={onClose}>
      <div className="ed-dlg" onClick={(e) => e.stopPropagation()}>
        <h3>Comando masivo</h3>
        <p>Busca puntos por nombre, selecciónalos y revisa antes de aplicar. Set/Fallback cambia el valor por defecto; Override anula con prioridad 8; Auto retira la anulación. No es una operación atómica: cada punto devuelve su resultado.</p>
        <div className="ed-form">
          <label>Nombre del punto<input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
          <label>Carpeta de búsqueda<input value={carpeta} onChange={(e) => setCarpeta(e.target.value)} /></label>
          <button className="ed-btn" onClick={buscarYa}>Buscar</button>
        </div>
        <div className="ed-form">
          <label>Tipo de puntos<select value={tipo} onChange={(e) => { setTipo(e.target.value); setValor(e.target.value === 'boolean' ? 'true' : '22') }}><option value="boolean">Boolean</option><option value="numeric">Numeric</option><option value="todos">Todos</option></select></label>
          <label>Modo de mando<select value={modo} onChange={(e) => setModo(e.target.value)}><option value="set">Set / Fallback</option><option value="override">Override</option><option value="auto">Auto (quitar override)</option></select></label>
          <label>Valor{tipo === 'boolean' ? <select value={valor} onChange={(e) => setValor(e.target.value)}><option value="true">TRUE / ON</option><option value="false">FALSE / OFF</option></select> : <input value={valor} onChange={(e) => setValor(e.target.value)} />}</label>
        </div>
        <div className="ed-row">
          <button onClick={() => setSel(new Set(lista.filter((p) => p.rw).map((p) => p.ord)))}>Seleccionar todos</button>
          <button onClick={() => setSel(new Set())}>Deseleccionar todos</button>
          <button disabled={!aptos} onClick={() => setRevisado(true)}>Revisar selección</button>
          <button className="pri" disabled={!revisado || !aptos} onClick={aplicar}>Confirmar y aplicar a {aptos}</button>
          <button disabled={!Object.keys(out).length} onClick={csv}>Descargar resultados</button>
          <button onClick={onClose}>Cerrar</button>
        </div>
        {revisado && <p className="ed-aviso">Revisión preparada: {modo === 'auto' ? 'quitar override' : `${modo === 'set' ? 'set' : 'override'} = ${valor}`} en {aptos} puntos. Aún no se ha enviado ningún mando.</p>}
        {res && <p className="ed-sub">{lista.length} resultados · {sel.size} seleccionados · {lista.filter((p) => !p.rw).length} de solo lectura</p>}
        {res && (
          <div className="ed-tabla">
            <table>
              <thead><tr><th>✓</th><th>Nombre</th><th>ORD completa</th><th>Tipo</th><th>Valor actual</th><th>Resultado</th></tr></thead>
              <tbody>{lista.map((p) => (
                <tr key={p.ord}>
                  <td><input type="checkbox" disabled={!p.rw} checked={sel.has(p.ord)} onChange={(e) => setSel((s) => { const n = new Set(s); e.target.checked ? n.add(p.ord) : n.delete(p.ord); return n })} /></td>
                  <td>{p.nombre}</td><td className="ord">{p.ord}</td><td>{p.tipo}{p.ud && ` · ${p.ud}`}</td>
                  <td>{fmt(efectivo(est.current, p.ord) ?? '—')}{p.ord in est.current.override ? ' (override)' : ''}</td>
                  <td className={out[p.ord] ? (out[p.ord].ok ? 'ok' : 'bad') : ''}>{out[p.ord]?.msg || (p.rw ? '' : 'Solo lectura')}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
