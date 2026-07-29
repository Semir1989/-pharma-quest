// Admin skripta: TVRDI restart tekuće sedmice Preživljavanja za SVE igrače.
//
// Isto što zakazani posao survivalWeeklyReset (functions/index.js) radi
// srijedom u 08:00, plus brisanje ljestvice TEKUĆE sedmice — jer ovo se
// pokreće usred sedmice, kad na listi već ima rezultata koje treba poništiti.
//
//   1. prozor     — config/survival na tekuću sedmicu (srijeda 08:00 → srijeda 08:00)
//   2. pokušaji   — cijela kolekcija survivalRuns se briše
//   3. ljestvica  — survival/{tekuća sedmica} se prazni
//   4. signal     — svima eventStatus.survival = true (ikonica Arene svijetli)
//   5. questovi   — današnji izbor se poništava da survival zadatak uđe u ponudu
//
// Ljestvice STARIH sedmica se ne diraju — najboljiSurvivalIz() ih čita za
// "najbolji niz ikad" na ekranu upravljanja klanom.
//
// Pokretanje:  node scripts/restartuj-survival-sedmicu.js            (suhi hod)
//              node scripts/restartuj-survival-sedmicu.js --stvarno  (stvarno radi)

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getDatabase } from 'firebase-admin/database'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

const stvarno = process.argv.includes('--stvarno')

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  databaseURL: 'https://pharma-quest-8c6cc-default-rtdb.europe-west1.firebasedatabase.app',
})
const db = getFirestore()
const rtdb = getDatabase()

// --- vrijeme: sve kopije ove logike (functions/index.js, src/utils/periods.js,
// ostale skripte) moraju davati isti rezultat ---
const BIH_TZ = 'Europe/Sarajevo'
const RESET_HOUR = 8
const pad = (n) => String(n).padStart(2, '0')

function bihParts(d = new Date()) {
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

function survivalWeekKey(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  const date = new Date(Date.UTC(y, m - 1, day, hh - RESET_HOUR))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 3 + 7) % 7)) // srijeda = 3
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function nextSurvivalResetAt(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  let dana = (3 - new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 7) % 7
  if (dana === 0 && hh >= RESET_HOUR) dana = 7
  const civil = Date.UTC(y, m - 1, day + dana, RESET_HOUR)
  const guess = civil - bihOffset(d)
  return civil - bihOffset(new Date(guess))
}

const bih = (ms) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BIH_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(ms))

const BATCH_LIMIT = 400

const week = survivalWeekKey()
const closeAt = nextSurvivalResetAt()
const openAt = nextSurvivalResetAt(new Date(closeAt - 8 * 86400000))

const runovi = await db.collection('survivalRuns').get()
const igraci = await db.collection('users').get()
const lista = await rtdb.ref(`survival/${week}`).get()
const naListi = lista.exists() ? Object.keys(lista.val() || {}).length : 0

console.log(`Sedmica:   ${week}`)
console.log(`Prozor:    ${bih(openAt)} → ${bih(closeAt)}  (BiH)`)
console.log(`Runova:    ${runovi.size}  (svi se brišu)`)
console.log(`Na listi:  ${naListi}  (brišu se)`)
console.log(`Igrača:    ${igraci.size}  (svima signal na true)`)

if (!stvarno) {
  console.log('\nSUHI HOD — ništa nije promijenjeno. Dodaj --stvarno da se izvrši.')
  process.exit(0)
}

// 1. Prozor eventa.
await db.doc('config/survival').set({
  enabled: true,
  openAt,
  closeAt,
  label: 'Sedmični izazov preživljavanja',
  updatedAt: FieldValue.serverTimestamp(),
})

// 2. Pokušaji.
for (let i = 0; i < runovi.docs.length; i += BATCH_LIMIT) {
  const batch = db.batch()
  for (const d of runovi.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref)
  await batch.commit()
}

// 3. Ljestvica tekuće sedmice.
await rtdb.ref(`survival/${week}`).remove()

// 4. i 5. Signal i dnevni questovi.
for (let i = 0; i < igraci.docs.length; i += BATCH_LIMIT) {
  const batch = db.batch()
  for (const d of igraci.docs.slice(i, i + BATCH_LIMIT)) {
    batch.update(d.ref, {
      'eventStatus.survival': true,
      'eventStatus.survivalWeek': week,
      'taskProgress.daily.picked': null,
      survivalChest: null, // kovčezi se te sedmice mogu ponovo osvojiti i otvoriti
    })
  }
  await batch.commit()
}

console.log('\n✓ Restartovano:')
console.log(`  - config/survival: ${bih(openAt)} → ${bih(closeAt)}`)
console.log(`  - survivalRuns: obrisano ${runovi.size}`)
console.log(`  - survival/${week}: obrisano ${naListi} unosa`)
console.log(`  - ${igraci.size} igrača: eventStatus.survival = true, questovi se biraju nanovo`)
process.exit(0)
