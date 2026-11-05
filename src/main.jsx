import React from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { esES } from '@clerk/localizations'
import App from './App.jsx'
import { CLERK_PUBLISHABLE_KEY } from '../shared/reportsConfig.js'
import './index.css'

// Inicio de sesión con Clerk (email o Google). La clave publicable puede cambiarse con VITE_CLERK_PUBLISHABLE_KEY.
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || CLERK_PUBLISHABLE_KEY

createRoot(document.getElementById('root')).render(
  <ClerkProvider
    publishableKey={clerkKey}
    localization={esES}
    appearance={{ variables: { colorPrimary: '#184f95', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', borderRadius: '8px' } }}
  >
    <App />
  </ClerkProvider>,
)
