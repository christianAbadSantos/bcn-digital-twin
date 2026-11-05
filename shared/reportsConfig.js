// Configuración PÚBLICA de los reportes ciudadanos (no hay secretos aquí).
// - Clerk: inicio de sesión (email o Google). La publishable key es pública por diseño.
// - Cloudinary: guarda las fotos de cada reporte. El API secret vive solo en Cloudflare.

export const CLERK_PUBLISHABLE_KEY = 'pk_test_YXdhcmUtZ2FubmV0LTE3MzUuY2xlcmsuYWNjb3VudHMuZGV2JA'
// emisor de los tokens de sesión de esta instancia de Clerk (sale de la publishable key)
export const CLERK_ISSUER = 'https://aware-gannet-1735.clerk.accounts.dev'

export const CLOUDINARY_CLOUD = 'mzvfog4d'
export const REPORT_TAG = 'bcn-twin-report'
export const REPORT_FOLDER = 'bcn-twin/reportes'
export const REPORT_FORMATS = 'jpg,jpeg,png,webp,heic'
export const REPORT_MAX_BYTES = 8 * 1024 * 1024

export const REPORT_TYPES = {
  bache: 'Bache o calzada dañada',
  accidente: 'Accidente',
  inundacion: 'Inundación o agua',
  alumbrado: 'Alumbrado',
  obstaculo: 'Obstáculo en la vía',
  otro: 'Otro',
}

// zona válida (Barcelona y alrededores)
export const REPORT_BBOX = { w: 1.9, e: 2.4, s: 41.25, n: 41.55 }
