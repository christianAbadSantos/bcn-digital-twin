// Gemelo del edificio como aplicación propia (/edificio/): se abre desde el mapa del gemelo y desde el CDE.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../cde/cde.css'
import './edificio.css'
import Edificio from './Edificio.jsx'

createRoot(document.getElementById('root')).render(<Edificio />)
