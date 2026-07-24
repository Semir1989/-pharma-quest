// Admin skripta: postavlja prozor vikend turnira (XP trka).
// Pokretanje:  npm run postavi-turnir
// Server (functions/index.js) sabira osvojeni XP na tournament/{key}/{uid}
// dok smo unutar [openAt, closeAt]. enabled:false = turnir ugašen.

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

// Vikend: petak 24.07.2026 18:00 → nedjelja 26.07.2026 18:00, BiH (CEST=UTC+2).
const openAt = Date.UTC(2026, 6, 24, 16, 0, 0) // 18:00 CEST
const closeAt = Date.UTC(2026, 6, 26, 16, 0, 0) // 18:00 CEST
const key = '2026-07-24' // identifikator ovog vikend eventa (putanja leaderboarda)

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

await db.doc('config/tournament').set({
  enabled: true,
  openAt,
  closeAt,
  key,
  label: 'Vikend XP trka',
  updatedAt: new Date(),
})

console.log('✓ config/tournament postavljen:')
console.log(`  key:       ${key}`)
console.log(`  otvoreno:  ${new Date(openAt).toISOString()}  (petak 18:00 BiH)`)
console.log(`  zatvoreno: ${new Date(closeAt).toISOString()}  (nedjelja 18:00 BiH)`)
process.exit(0)
