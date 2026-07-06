// Generates the raster Home-Screen app icons from public/favicon.svg.
//
// iOS ignores the SVG icon for the Home Screen, and Android maskable icons need
// a safe-zone inset, so we composite the (non-square, transparent) mark onto a
// solid #111111 square with per-target padding and commit the PNGs.
//
// Dev-only, run manually after the brand mark changes:
//   cd web && npm i -D sharp && node scripts/generate-icons.mjs
//
// Outputs (committed): public/apple-touch-icon.png, public/pwa-192.png,
// public/pwa-512.png.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const dir = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(dir, '../public')
const svg = readFileSync(path.join(publicDir, 'favicon.svg'))

const BG = { r: 0x11, g: 0x11, b: 0x11, alpha: 1 }

// size: output px. padding: fraction of the canvas kept clear on every side
// (maskable icons want ~20% so the mark stays inside the 80% safe zone; Apple
// rounds/masks its own corners, so ~18% keeps the mark clear of the edge).
const targets = [
  { file: 'apple-touch-icon.png', size: 180, padding: 0.18 },
  { file: 'pwa-192.png', size: 192, padding: 0.2 },
  { file: 'pwa-512.png', size: 512, padding: 0.2 },
]

for (const { file, size, padding } of targets) {
  const inner = Math.round(size * (1 - padding * 2))
  const mark = await sharp(svg, { density: 512 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(path.join(publicDir, file))

  console.log(`wrote public/${file} (${size}×${size})`)
}
