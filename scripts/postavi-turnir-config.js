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

// Vikend turnir (XP trka + dueli). Sve u BiH vremenu (CEST=UTC+2).
// Prijave za duele su otvorene od danas (radi testiranja) do petka 31.07 12:00.
// Igra (i XP trka i dueli): petak 31.07 18:00 → nedjelja 02.08 18:00.
const regOpenAt = Date.UTC(2026, 6, 24, 10, 0, 0) // 24.07 12:00 CEST (otvoreno odmah)
const regCloseAt = Date.UTC(2026, 6, 31, 10, 0, 0) // 31.07 12:00 CEST
const openAt = Date.UTC(2026, 6, 31, 16, 0, 0) // 31.07 18:00 CEST
const closeAt = Date.UTC(2026, 7, 2, 16, 0, 0) // 02.08 18:00 CEST
const key = '2026-07-31' // identifikator eventa (putanja leaderboarda i bracketa)

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

await db.doc('config/tournament').set({
  enabled: true,
  regOpenAt,
  regCloseAt,
  openAt,
  closeAt,
  key,
  label: 'Vikend turnir',
  updatedAt: new Date(),
})

console.log('✓ config/tournament postavljen:')
console.log(`  key:        ${key}`)
console.log(`  prijave:    ${new Date(regOpenAt).toISOString()} → ${new Date(regCloseAt).toISOString()}`)
console.log(`  igra:       ${new Date(openAt).toISOString()} → ${new Date(closeAt).toISOString()}`)
process.exit(0)
