// Admin skripta: postavlja vremenski prozor eventa Preživljavanje.
// Pokretanje:  npm run postavi-survival
// Server (functions/index.js) gejta startSurvival: van [openAt, closeAt] event
// je zatvoren. enabled:false ili obrisan doc = nema gejta (uvijek otvoreno).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

// Prozor: subota 25.07.2026, 08:00–20:00 po BiH vremenu (CEST = UTC+2).
// Date.UTC očekuje UTC, pa oduzimamo 2h (08:00 CEST = 06:00 UTC).
const openAt = Date.UTC(2026, 6, 25, 6, 0, 0) // 08:00 CEST
const closeAt = Date.UTC(2026, 6, 25, 18, 0, 0) // 20:00 CEST

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

await db.doc('config/survival').set({
  enabled: true,
  openAt,
  closeAt,
  label: 'Vikend beta izazov',
  updatedAt: new Date(),
})

console.log('✓ config/survival postavljen:')
console.log(`  otvoreno:  ${new Date(openAt).toISOString()}  (08:00 BiH)`)
console.log(`  zatvoreno: ${new Date(closeAt).toISOString()}  (20:00 BiH)`)
process.exit(0)
