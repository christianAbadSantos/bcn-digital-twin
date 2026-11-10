// Prepara la carpeta que se sube al Space de Hugging Face (Docker) con la API .NET de residuos:
// copia fcc-residus-api/src y el Dockerfile, añade los datos reales (public/data/residus.json) y el
// README con la cabecera que pide Hugging Face. Uso:
//   node scripts/prepare-hf-space.mjs <carpeta-del-space>
// La carpeta suele ser un clon del repositorio del Space (git clone https://huggingface.co/spaces/USUARIO/NOMBRE).
import fs from 'node:fs'
import path from 'node:path'

const dest = path.resolve(process.argv[2] || '../residus-bcn-space')
const api = path.resolve('fcc-residus-api')
fs.mkdirSync(dest, { recursive: true })

const skip = (p) => /[\\/](bin|obj|\.vs|TestResults)([\\/]|$)/.test(p)
fs.rmSync(path.join(dest, 'src'), { recursive: true, force: true })
fs.cpSync(path.join(api, 'src'), path.join(dest, 'src'), { recursive: true, filter: (p) => !skip(p) })
fs.copyFileSync(path.join(api, 'Dockerfile'), path.join(dest, 'Dockerfile'))
fs.mkdirSync(path.join(dest, 'data'), { recursive: true })
fs.copyFileSync(path.resolve('public/data/residus.json'), path.join(dest, 'data/residus.json'))
fs.writeFileSync(path.join(dest, '.gitignore'), 'bin/\nobj/\n')
fs.writeFileSync(path.join(dest, 'README.md'), `---
title: Residus BCN API
emoji: ♻️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: API .NET de recogida de residuos del gemelo digital de BCN
---

# Residus BCN · API

API en ASP.NET Core (.NET 10) + EF Core + PostgreSQL del módulo de residuos del
[gemelo digital de Barcelona](https://bcn-digital-twin.pages.dev).

- Panel de operaciones (MVC): [/panel](./panel)
- Documentación de la API: [/scalar](./scalar)

Código fuente: https://github.com/christianAbadSantos/bcn-digital-twin/tree/main/fcc-residus-api

Necesita el secreto \`ConnectionStrings__Residus\` (URL de PostgreSQL, p. ej. de Neon).
`)
console.log('Space preparado en', dest)
