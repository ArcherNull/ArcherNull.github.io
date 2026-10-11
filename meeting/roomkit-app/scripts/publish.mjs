import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const target = resolve(root, '..')
const assetsName = 'roomkit-assets'

if (!existsSync(resolve(dist, 'meet.html'))) {
  console.error('dist/meet.html missing. Run vite build first.')
  process.exit(1)
}

const targetAssets = resolve(target, assetsName)
if (existsSync(targetAssets)) {
  rmSync(targetAssets, { recursive: true, force: true })
}
mkdirSync(targetAssets, { recursive: true })
cpSync(resolve(dist, 'meet.html'), resolve(target, 'meet.html'))
cpSync(resolve(dist, assetsName), targetAssets, { recursive: true })
console.log('Published -> meeting/meet.html + meeting/roomkit-assets/')
