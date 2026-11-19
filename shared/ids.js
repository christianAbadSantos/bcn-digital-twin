// Validación IDS (Information Delivery Specification, buildingSMART IDS 1.0) · lógica pura, probada con Vitest.
// Un IDS dice qué información debe tener un modelo IFC: a qué elementos se aplica (applicability) y qué
// tienen que cumplir (requirements). Aquí se admite el subconjunto más usado en la práctica:
//   applicability: <entity><name><simpleValue>IFCWALL</simpleValue></name></entity>
//   requirements:  <attribute> (Name, Description, Tag…) y <property> (Pset + nombre), con valor fijo,
//                  lista de valores (<xs:enumeration>) o patrón (<xs:pattern>); cardinalidad required/optional/prohibited.

// ---- lector XML mínimo (sin dependencias; funciona en el navegador y en Node)
export function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  let m
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1]
    if (m[1] != null) top.text += m[1]
    else if (m[2]) { if (stack.length > 1) stack.pop() }
    else if (m[3]) {
      const attrs = {}
      for (const a of m[4].matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1].replace(/^.*:/, '')] = unesc(a[2] ?? a[3])
      const node = { name: m[3].replace(/^.*:/, ''), attrs, children: [], text: '' }
      top.children.push(node)
      if (!m[5]) stack.push(node)
    } else if (m[6] && m[6].trim()) top.text += unesc(m[6].trim())
  }
  return root.children[0] || null
}
const kids = (n, name) => (n?.children || []).filter((c) => c.name === name)
const kid = (n, name) => kids(n, name)[0] || null

// valor de un IDS: simpleValue o restricción (enumeración, patrón)
function readValue(n) {
  if (!n) return null
  const sv = kid(n, 'simpleValue')
  if (sv) return { tipo: 'igual', valores: [sv.text.trim()] }
  const r = kid(n, 'restriction')
  if (!r) return null
  const en = kids(r, 'enumeration').map((e) => e.attrs.value)
  if (en.length) return { tipo: 'lista', valores: en }
  const pt = kid(r, 'pattern')
  if (pt) return { tipo: 'patron', valores: [pt.attrs.value] }
  return null
}

// ---- IDS → especificaciones
export function parseIds(text) {
  const doc = parseXml(text)
  if (!doc || doc.name !== 'ids') throw new Error('No es un fichero IDS (falta <ids>)')
  const info = kid(doc, 'info')
  const specs = kids(kid(doc, 'specifications'), 'specification').map((s, i) => {
    const ap = kid(s, 'applicability')
    const ents = kids(ap, 'entity').flatMap((e) => readValue(kid(e, 'name'))?.valores || []).map((v) => v.toUpperCase())
    const reqs = []
    for (const r of kid(s, 'requirements')?.children || []) {
      const card = r.attrs.cardinality || 'required'
      if (r.name === 'attribute') reqs.push({ tipo: 'atributo', nombre: readValue(kid(r, 'name'))?.valores[0], valor: readValue(kid(r, 'value')), card })
      if (r.name === 'property') reqs.push({ tipo: 'propiedad', pset: readValue(kid(r, 'propertySet'))?.valores[0], nombre: readValue(kid(r, 'baseName'))?.valores[0], valor: readValue(kid(r, 'value')), dataType: r.attrs.dataType || null, card })
    }
    return { id: `S${i + 1}`, nombre: s.attrs.name || `Especificación ${i + 1}`, descripcion: s.attrs.description || '', entidades: ents, requisitos: reqs }
  })
  return { titulo: kid(info, 'title')?.text || 'IDS', autor: kid(info, 'author')?.text || '', version: kid(info, 'version')?.text || '', specs }
}

// texto legible de un requisito
export function describe(r) {
  const que = r.tipo === 'atributo' ? `atributo ${r.nombre}` : `${r.pset}.${r.nombre}`
  const v = !r.valor ? '' : r.valor.tipo === 'igual' ? ` = «${r.valor.valores[0]}»` : r.valor.tipo === 'lista' ? ` ∈ {${r.valor.valores.join(', ')}}` : ` con el patrón ${r.valor.valores[0]}`
  return r.card === 'prohibited' ? `sin ${que}` : `${que}${v}${r.card === 'optional' ? ' (opcional)' : ''}`
}

const ATTR = { Name: 'nombre', Description: 'descripcion', Tag: 'tag', GlobalId: 'guid', ObjectType: 'objectType' }
function check(valor, v) {
  if (!valor) return true
  const s = String(v)
  if (valor.tipo === 'igual') return s === valor.valores[0]
  if (valor.tipo === 'lista') return valor.valores.includes(s)
  if (valor.tipo === 'patron') return new RegExp(`^(?:${valor.valores[0]})$`).test(s)
  return true
}

// ---- validar elementos ({ guid, clase, nombre, descripcion, tag, psets }) contra un IDS
export function validate(ids, elementos) {
  const resultados = ids.specs.map((spec) => {
    const aplica = elementos.filter((e) => spec.entidades.includes(String(e.clase).toUpperCase()))
    const fallos = []
    for (const e of aplica) {
      const motivos = []
      for (const r of spec.requisitos) {
        const v = r.tipo === 'atributo' ? e[ATTR[r.nombre] || r.nombre] : e.psets?.[r.pset]?.[r.nombre]
        const hay = v != null && v !== ''
        if (r.card === 'prohibited') { if (hay) motivos.push(`no debería tener ${describe({ ...r, card: 'required' })}`); continue }
        if (!hay) { if (r.card === 'required') motivos.push(`falta ${r.tipo === 'atributo' ? `el atributo ${r.nombre}` : `${r.pset}.${r.nombre}`}`); continue }
        if (!check(r.valor, v)) motivos.push(`${r.tipo === 'atributo' ? r.nombre : `${r.pset}.${r.nombre}`} = «${v}» no cumple ${r.valor.tipo === 'lista' ? `{${r.valor.valores.join(', ')}}` : r.valor.tipo === 'patron' ? `el patrón ${r.valor.valores[0]}` : `«${r.valor.valores[0]}»`}`)
      }
      if (motivos.length) fallos.push({ guid: e.guid, nombre: e.descripcion || e.nombre, tag: e.tag, clase: e.clase, motivos })
    }
    const malos = new Set(fallos.map((f) => f.guid))
    return { ...spec, aplicados: aplica.length, cumplen: aplica.length - fallos.length, fallos, okGuids: aplica.filter((e) => !malos.has(e.guid)).map((e) => e.guid) }
  })
  const total = resultados.reduce((s, r) => s + r.aplicados, 0)
  const malos = resultados.reduce((s, r) => s + r.fallos.length, 0)
  const porGuid = {}
  for (const r of resultados) for (const f of r.fallos) porGuid[f.guid] = [...(porGuid[f.guid] || []), ...f.motivos]
  const okGuid = new Set(resultados.flatMap((r) => r.okGuids).filter((g) => !porGuid[g]))
  return { ok: malos === 0, total, malos, resultados, porGuid, okGuid: [...okGuid] }
}
