// Genera public/data/cde/PdE-guia-bim.ids: los requisitos del set de propiedades de la Guía BIM de Puertos del
// Estado (apartado 5.2.2, tabla 26) en IDS 1.0 de buildingSMART, para validarlos en el CDE como cualquier otro IDS.
// Uso: node scripts/build-pde-ids.mjs
import fs from 'node:fs'
import path from 'node:path'
import { ESTADOS_PDE, TIPOLOGIAS } from '../shared/pde.js'

const ENTIDADES = ['IFCWALL', 'IFCSLAB', 'IFCCOLUMN', 'IFCDOOR', 'IFCWINDOW', 'IFCROOF', 'IFCSPACE', 'IFCUNITARYEQUIPMENT', 'IFCPUMP', 'IFCELECTRICDISTRIBUTIONBOARD', 'IFCSENSOR', 'IFCDUCTSEGMENT', 'IFCPIPESEGMENT', 'IFCBUILDINGELEMENTPROXY']
const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const simple = (v) => `<ids:simpleValue>${x(v)}</ids:simpleValue>`
const lista = (vs) => `<xs:restriction base="xs:string">${vs.map((v) => `<xs:enumeration value="${x(v)}"/>`).join('')}</xs:restriction>`
const patron = (p) => `<xs:restriction base="xs:string"><xs:pattern value="${x(p)}"/></xs:restriction>`
const prop = (pset, nombre, valor, dataType = 'IFCLABEL') => `        <ids:property dataType="${dataType}" cardinality="required">
          <ids:propertySet>${simple(pset)}</ids:propertySet>
          <ids:baseName>${simple(nombre)}</ids:baseName>${valor ? `\n          <ids:value>${valor}</ids:value>` : ''}
        </ids:property>`
const spec = (nombre, descripcion, reqs) => `    <ids:specification name="${x(nombre)}" ifcVersion="IFC4" description="${x(descripcion)}">
      <ids:applicability minOccurs="0" maxOccurs="unbounded">
${ENTIDADES.map((e) => `        <ids:entity><ids:name>${simple(e)}</ids:name></ids:entity>`).join('\n')}
      </ids:applicability>
      <ids:requirements>
${reqs.join('\n')}
      </ids:requirements>
    </ids:specification>`

const ID = '01_PdE_Identificación', CA = '02_PdE_Cantidades', PR = '03_PdE_Proyecto', EOM = '05_PdE_EOM'
const URL = 'https?://.+'
const ids = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Set de propiedades de la Guía BIM de Puertos del Estado (junio de 2019, apartado 5.2.2, tabla 26) en IDS 1.0.
     Generado con scripts/build-pde-ids.mjs. Fuente: https://www.puertos.es/system/files/2024-02/Guia%20BIM%2009.pdf -->
<ids:ids xmlns:ids="http://standards.buildingsmart.org/IDS" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://standards.buildingsmart.org/IDS http://standards.buildingsmart.org/IDS/1.0/ids.xsd">
  <ids:info>
    <ids:title>Guía BIM de Puertos del Estado · set de propiedades (LOI)</ids:title>
    <ids:version>2019-06</ids:version>
    <ids:author>bim@cde-ejemplo.es</ids:author>
    <ids:date>2026-11-25</ids:date>
    <ids:purpose>Comprobar que cada elemento lleva el set de propiedades PdE: identificación, cantidades, proyecto y explotación y mantenimiento</ids:purpose>
  </ids:info>
  <ids:specifications>
${spec('01 · Identificación del elemento', 'Proyecto, localizador, estado, clasificación, tipología, disciplina, subdisciplina y material (5.2.2).', [
  prop(ID, '01_01_PdE_Proyecto'), prop(ID, '01_02_PdE_Localizador'),
  prop(ID, '01_03_PdE_Estado', lista(ESTADOS_PDE)),
  prop(ID, '01_04_PdE_Clasificación', patron('(PT|BCN)\\.[A-Z0-9.]+')),
  prop(ID, '01_05_PdE_Tipología', lista(Object.values(TIPOLOGIAS).map((t) => t.nom))),
  prop(ID, '01_06_PdE_Disciplina'), prop(ID, '01_07_PdE_Subdisciplina'), prop(ID, '01_08_PdE_Material'),
])}
${spec('02 · Cantidades', 'Unidad de medición y magnitudes del elemento, para la trazabilidad de las mediciones (uso BIM «Mediciones»).', [
  prop(CA, '02_01_PdE_Unidad', lista(['ud', 'm', 'm2', 'm3'])), prop(CA, '02_02_PdE_Longitud', null, 'IFCREAL'), prop(CA, '02_04_PdE_Area', null, 'IFCREAL'), prop(CA, '02_05_PdE_Volumen', null, 'IFCREAL'),
])}
${spec('03 · Proyecto', 'Fase de obra, unidad de medición y enlaces (url) a los planos y al pliego en el CDE (5.2.3: información vinculada por url).', [
  prop(PR, '03_01_PdE_Fase Obra'), prop(PR, '03_02_PdE_Planos', patron(URL)), prop(PR, '03_03_PdE_PPTP', patron(URL)), prop(PR, '03_04_01_PdE_Ud Medición 01'),
])}
${spec('05 · Explotación y mantenimiento', 'Código de inventario de mantenimiento y epígrafe de activo contable del anexo III (cuatro cifras).', [
  prop(EOM, '05_01_01_PdE_Cod Mantenimiento'), prop(EOM, '05_01_02_PdE_Aux Mantenimiento', patron(URL)),
  prop(EOM, '05_03_01_PdE_Cod Contable', patron('[0-9]{4}')),
])}
  </ids:specifications>
</ids:ids>
`
const out = path.resolve('public/data/cde/PdE-guia-bim.ids')
fs.writeFileSync(out, ids)
console.log('escrito', out)
