import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2500 },
  worker: { format: 'es' },
  server: {
    // en desarrollo, los IFC del Port se piden a través de este proxy (su servidor no permite CORS);
    // en Cloudflare lo hace functions/api/ifc.js con caché en R2
    proxy: {
      // trenes reales de Rodalies (Renfe GTFS-RT, sin CORS)
      '/renfe': {
        target: 'https://gtfsrt.renfe.com',
        changeOrigin: true,
        headers: { 'user-agent': 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)' },
        rewrite: (p) => p.slice('/renfe'.length),
      },
      // balizas V16 / incidencias de la DGT (DATEX II, sin CORS)
      '/dgt': {
        target: 'https://nap.dgt.es',
        changeOrigin: true,
        headers: { 'user-agent': 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)' },
        rewrite: (p) => p.slice('/dgt'.length),
      },
      '/api/ifc': {
        target: 'https://serveis.portdebarcelona.cat',
        changeOrigin: true,
        headers: { 'user-agent': 'bcn-digital-twin/0.5 (+https://bcn-digital-twin.pages.dev)' },
        rewrite: (p) => '/cataleg_bim_planol/IFC/' + new URLSearchParams(p.split('?')[1] || '').get('f'),
      },
    },
  },
})
