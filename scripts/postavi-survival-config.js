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

// Prozor pokriva CIJELU sedmicu Preživljavanja: od srijede 00:00 UTC do
// sljedeće srijede 00:00 UTC. To je nužno otkad igrač smije izaći poslije
// tačnog odgovora i vratiti se kasnije — run mora ostati dostupan kroz dane,
// a ne samo u jednom popodnevu. Sedmicu zatvara greška, ne sat.
// Uz '--sljedeca' postavlja narednu sedmicu (npr. najava unaprijed).
function survivalWeekStart(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 3 + 7) % 7)) // srijeda = 3
  return date.getTime()
}

const WEEK_MS = 7 * 86400000
const openAt = survivalWeekStart() + (process.argv.includes('--sljedeca') ? WEEK_MS : 0)
const closeAt = openAt + WEEK_MS

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

await db.doc('config/survival').set({
  enabled: true,
  openAt,
  closeAt,
  label: 'Sedmični izazov preživljavanja',
  updatedAt: new Date(),
})

const bih = (ms) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Sarajevo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms))

console.log('✓ config/survival postavljen (cijela sedmica, reset srijedom):')
console.log(`  otvoreno:  ${bih(openAt)} (BiH)`)
console.log(`  zatvoreno: ${bih(closeAt)} (BiH)`)
process.exit(0)
