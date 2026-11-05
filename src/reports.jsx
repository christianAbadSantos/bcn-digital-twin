// Reportes ciudadanos: quien inicia sesión (Clerk) envía una incidencia con foto (Cloudinary)
// en un punto del mapa. Aparecen en el mapa y como una fuente más del gemelo.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Show, SignInButton, UserButton, useAuth, useUser } from '@clerk/react'
import { REPORT_TYPES, REPORT_MAX_BYTES } from '../shared/reportsConfig.js'

const POLL_MS = 60000

export function useReports() {
  const [state, setState] = useState({ reports: [], status: 'idle', enabled: null, ts: null, latency: 0, error: null })
  const load = useCallback(async () => {
    const t0 = performance.now()
    try {
      const r = await fetch('/api/reports')
      if (!(r.headers.get('content-type') || '').includes('json')) throw Object.assign(new Error('sin backend'), { idle: true })
      const d = await r.json()
      setState({ reports: d.reports || [], status: d.enabled === false ? 'idle' : r.ok ? 'ok' : 'down', enabled: d.enabled !== false, ts: Date.now(), latency: Math.round(performance.now() - t0), error: d.error || null })
    } catch (e) {
      setState((s) => ({ ...s, status: e.idle ? 'idle' : 'down', error: e.message }))
    }
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(() => !document.hidden && load(), POLL_MS)
    return () => clearInterval(id)
  }, [load])

  return useMemo(() => {
    const s = state
    const last = s.reports[0]
    return {
      ...s,
      reload: load,
      source: {
        id: 'reports',
        protocol: 'REST · Cloudinary',
        label: 'Reportes ciudadanos (con foto, sesión Clerk)',
        endpoint: '/api/reports',
        simulated: false,
        status: s.status,
        msgPerMin: 0,
        latencyMs: s.latency,
        lastTs: last ? Date.parse(last.creado) : s.ts || Date.now(),
        sample: last ? { tipo: last.tipo, texto: last.texto, autor: last.autor } : { info: s.status === 'idle' ? 'sin backend o sin secretos de Cloudinary' : 'todavía no hay reportes' },
      },
    }
  }, [state, load])
}

// Botón de sesión para la barra superior
export function AuthButton() {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="btn-auth">Iniciar sesión</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  )
}

// Formulario del reporte, una vez elegido el punto en el mapa
export function ReportDialog({ point, onClose, onSent }) {
  const { getToken } = useAuth()
  const { user } = useUser()
  const [tipo, setTipo] = useState('bache')
  const [texto, setTexto] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const send = async () => {
    if (!file) return setMsg('Añade una foto de la incidencia.')
    if (file.size > REPORT_MAX_BYTES) return setMsg('La foto pesa más de 8 MB.')
    setBusy(true)
    setMsg('Enviando…')
    try {
      const token = await getToken()
      const r = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ lat: point.lat, lon: point.lon, tipo, texto, autor: user?.firstName || user?.username || 'usuario' }),
      })
      const sig = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(sig.error || `servidor ${r.status}`)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('api_key', sig.api_key)
      fd.append('signature', sig.signature)
      Object.entries(sig.params).forEach(([k, v]) => fd.append(k, v))
      const up = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud}/image/upload`, { method: 'POST', body: fd })
      const res = await up.json()
      if (!up.ok) throw new Error(res.error?.message || `Cloudinary ${up.status}`)
      setMsg('¡Reporte enviado! Aparecerá en el mapa en unos segundos.')
      onSent?.()
      setTimeout(onClose, 1200)
    } catch (e) {
      setMsg(`No se pudo enviar: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rep-back" onClick={onClose}>
      <div className="rep-card" onClick={(e) => e.stopPropagation()}>
        <h3>Reportar una incidencia</h3>
        <p className="muted">Punto: {point.lat.toFixed(5)}, {point.lon.toFixed(5)}</p>
        <label>Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Descripción (opcional)
          <textarea maxLength={280} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Qué pasa y desde cuándo" />
        </label>
        <label>Foto
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <p className="rep-note">La foto y la ubicación serán públicas en el mapa. No subas caras ni matrículas.</p>
        {msg && <p className="rep-msg">{msg}</p>}
        <div className="rep-actions">
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={send} disabled={busy}>Enviar reporte</button>
        </div>
      </div>
    </div>
  )
}

// Botón de la barra de capas: con sesión pide el punto; sin sesión abre el inicio de sesión
export function ReportButton({ picking, onStart, onCancel }) {
  return (
    <>
      <Show when="signed-in">
        <button className={`chip report ${picking ? 'on' : ''}`} onClick={picking ? onCancel : onStart}>
          {picking ? 'Toca el mapa… (cancelar)' : '+ Reportar incidencia'}
        </button>
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="chip report">+ Reportar incidencia</button>
        </SignInButton>
      </Show>
    </>
  )
}
