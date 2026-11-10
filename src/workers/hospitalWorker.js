// Worker: abre el IFC del hospital con web-ifc (WASM) y devuelve sus espacios (bahías) y su
// georreferencia. Igual que el worker del puerto, para no bloquear el hilo principal.
import { IfcAPI } from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'
import { readHospital } from '../hospitalIfc.js'

self.onmessage = async (e) => {
  const { url } = e.data
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const bytes = new Uint8Array(await r.arrayBuffer())
    const api = new IfcAPI()
    await api.Init(() => new URL(wasmUrl, self.location.href).href, true)
    const model = api.OpenModel(bytes)
    const hospital = readHospital(api, model)
    api.CloseModel(model)
    self.postMessage({ ok: true, hospital, bytes: bytes.length })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message || err) })
  }
}
