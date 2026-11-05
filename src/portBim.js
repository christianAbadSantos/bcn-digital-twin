// Selección de modelos de la "Biblioteca de Objetos IFC" del Port de Barcelona (CC BY 4.0):
// https://serveis.portdebarcelona.cat/cataleg_bim_planol/  (lista completa en su projects.js, 951 IFC)
//
// Los IFC NO traen georreferencia (IfcSite sin latitud/longitud): la posición y la orientación de aquí
// están puestas a mano y son APROXIMADAS. Cada modelo existe en LOD1 (ligero) y LOD3 (detallado);
// se elige el más detallado que quepa en el presupuesto del dispositivo. Tamaños en bytes.
export const PORT_BIM_CATALOG = 'https://serveis.portdebarcelona.cat/cataleg_bim_planol/'
export const PORT_BIM = [
  { f: 'APBCN-URB-MON-Monumento_Cristobal_Colon', name: 'Monument a Colom', lon: 2.17768, lat: 41.37578, rot: 0, size: { LOD1: 114384, LOD3: 50942233 } },
  { f: 'APBCN-URB-MON-Edificio_WTC', name: 'World Trade Center', lon: 2.1803, lat: 41.3713, rot: 0, size: { LOD1: 20196026, LOD3: 2810784 } },
  { f: 'APBCN-URB-MON-Edificio_PortalPau', name: 'Edifici Portal de la Pau (APB)', lon: 2.1766, lat: 41.3747, rot: 0, size: { LOD1: 180409, LOD3: 10026127 } },
  { f: 'APBCN-URB-MON-Edificio_MaremagnumBarcelona', name: 'Maremagnum', lon: 2.1838, lat: 41.3747, rot: 0, size: { LOD1: 47185, LOD3: 9879631 } },
  { f: 'APBCN-URB-MON-Edificio_RambladelMar', name: 'Rambla de Mar', lon: 2.1801, lat: 41.3752, rot: 0, size: { LOD1: 1093225, LOD3: 1958238 } },
  { f: 'APBCN-URB-MON-Monumento_Torre_DelRellotge', name: 'Torre del Rellotge', lon: 2.1856, lat: 41.3757, rot: 0, size: { LOD1: 25790, LOD3: 104063 } },
  { f: 'APBCN-URB-MON-Edificio_Vela', name: 'Edificio Vela (Hotel W)', lon: 2.1897, lat: 41.3684, rot: 0, size: { LOD1: 201744, LOD3: 3085942 } },
  { f: 'APBCN-URB-MON-Edificio_Terminal_A', name: 'Terminal A de cruceros', lon: 2.1744, lat: 41.354, rot: 0, size: { LOD1: 507312, LOD3: 982937 } },
]

export function pickLod(item, maxBytes) {
  const opts = Object.entries(item.size).filter(([, s]) => s <= maxBytes)
  if (opts.length) return opts.sort((a, b) => (a[0] < b[0] ? 1 : -1))[0][0] // el LOD más alto que cabe
  return Object.entries(item.size).sort((a, b) => a[1] - b[1])[0][0] // si no cabe ninguno, el más ligero
}

// En desarrollo la ruta la atiende el proxy de Vite; en Cloudflare, functions/api/ifc.js (con caché en R2)
export const ifcUrl = (file) => `/api/ifc?f=${encodeURIComponent(file)}`
