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

// Prozor pokriva CIJELU sedmicu Preživljavanja: od srijede 08:00 do sljedeće
// srijede 08:00 po BiH vremenu. To je nužno otkad igrač smije izaći poslije
// tačnog odgovora i vratiti se kasnije — run mora ostati dostupan kroz dane,
// a ne samo u jednom popodnevu. Sedmicu zatvara greška, ne sat.
// Uz '--sljedeca' postavlja narednu sedmicu (npr. najava unaprijed).
//
// NAPOMENA: od uvođenja zakazanog posla survivalWeeklyReset (functions/index.js)
// ovo radi server sam, srijedom u 08:00. Skripta ostaje kao ručna poluga —
// termini moraju biti identični, inače se ključ sedmice i prozor raziđu.
const BIH_TZ = 'Europe/Sarajevo'
const RESET_HOUR = 8

function bihParts(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BIH_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second }
}

function bihOffset(d) {
  const p = bihParts(d)
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(d.getTime() / 1000) * 1000
}

// Sljedeća srijeda u 08:00 po BiH vremenu (ms epoch). Dva prolaza zbog
// ljetnog/zimskog vremena.
function nextSurvivalResetAt(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  let dana = (3 - new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 7) % 7
  if (dana === 0 && hh >= RESET_HOUR) dana = 7
  const civil = Date.UTC(y, m - 1, day + dana, RESET_HOUR)
  const guess = civil - bihOffset(d)
  return civil - bihOffset(new Date(guess))
}

const sljedeca = process.argv.includes('--sljedeca')
const kraj = nextSurvivalResetAt()
const closeAt = sljedeca ? nextSurvivalResetAt(new Date(kraj + 86400000)) : kraj
const openAt = nextSurvivalResetAt(new Date(closeAt - 8 * 86400000))

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
