// That Open Components (visor IFC del CDE) necesita three >= 0.182, pero el gemelo usa three 0.160 con
// react-three-fiber. Para no tocar el gemelo, el CDE usa su propia copia de three ("three-tho") y su
// camera-controls 3 ("camera-controls-tho") y web-ifc 0.0.77 ("web-ifc-tho"): este plugin redirige a esas copias las importaciones que
// vienen de @thatopen/*, src/cde/ y src/edificio/. Además sirve el web-ifc.wasm en /cde/wasm/ (dev y build).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const DE_THATOPEN = /[\\/]node_modules[\\/]@thatopen[\\/]|[\\/]node_modules[\\/]camera-controls-tho[\\/]|[\\/]src[\\/](cde|edificio)[\\/]/
const WASM = path.join(path.dirname(require.resolve('web-ifc-tho')), 'web-ifc.wasm')

const redirigir = (id, importer) => {
  if (!importer || !DE_THATOPEN.test(importer)) return null
  if (id === 'three' || id.startsWith('three/')) return 'three-tho' + id.slice(5)
  if (id === 'camera-controls') return 'camera-controls-tho'
  if (id === 'web-ifc') return 'web-ifc-tho' // That Open está probado con web-ifc 0.0.77
  return null
}

export default function thatOpen() {
  return {
    name: 'cde-thatopen',
    enforce: 'pre',
    config: () => ({
      optimizeDeps: {
        esbuildOptions: {
          // el prebundle de dependencias en desarrollo lo hace esbuild: misma redirección
          plugins: [{
            name: 'cde-thatopen-esbuild',
            setup(build) {
              build.onResolve({ filter: /^(three(\/.*)?|camera-controls|web-ifc)$/ }, (a) => {
                const r = redirigir(a.path, a.importer)
                // lo resuelve el propio esbuild, con las condiciones de navegador (no la versión de Node)
                return r ? build.resolve(r, { kind: a.kind, resolveDir: a.resolveDir }) : undefined
              })
            },
          }],
        },
      },
    }),
    async resolveId(id, importer, opts) {
      const r = redirigir(id, importer)
      return r ? this.resolve(r, importer, { ...opts, skipSelf: true }) : null
    },
    configureServer(server) {
      server.middlewares.use('/cde/wasm/web-ifc.wasm', (_req, res) => {
        res.setHeader('content-type', 'application/wasm')
        fs.createReadStream(WASM).pipe(res)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'cde/wasm/web-ifc.wasm', source: fs.readFileSync(WASM) })
    },
  }
}
