// CDE como aplicación propia (/cde/): no carga nada del gemelo, solo se enlaza con él.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import Cde from './Cde.jsx'

const GEMELO = import.meta.env.VITE_GEMELO_URL || '/'

function CdeApp() {
  return (
    <div className="cde-app">
      <header className="cde-brand">
        <span className="cde-logo" aria-hidden="true" />
        <b>CDE</b><small>Entorno común de datos · UNE-EN ISO 19650</small>
        <a className="btn" href={GEMELO}>Gemelo digital de Barcelona ↗</a>
      </header>
      <Cde onGemelo={(f) => { location.href = `${GEMELO}?lon=${f.lon}&lat=${f.lat}&z=18&capa=bim` }} />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<CdeApp />)
