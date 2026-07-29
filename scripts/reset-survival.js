// Admin skripta: resetuje sedmični pokušaj Preživljavanja za JEDNOG igrača.
// Služi za testiranje — igrač poslije ovoga može ponovo ući u izazov, kao da
// ove sedmice nije igrao.
//
// Pokretanje:  npm run reset-survival -- "Admin123"
//              npm run reset-survival -- YJqMeLlmdZO3nUYEqUSz9od7Eq52
//
// Namjerno traži tačno jedno ime/uid i odbija raditi bez argumenta — da se
// slučajno ne obriše cijela sedmica svim igračima.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getDatabase } from 'firebase-admin/database'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

const arg = process.argv.slice(2).join(' ').trim()
if (!arg) {
  console.error('Upotreba:  npm run reset-survival -- "Ime igrača"   (ili uid)')
  process.exit(1)
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  databaseURL: 'https://pharma-quest-8c6cc-default-rtdb.europe-west1.firebasedatabase.app',
})
const db = getFirestore()
const rtdb = getDatabase()

const pad = (n) => String(n).padStart(2, '0')
// Ista logika kao u functions/index.js — sedmica počinje SRIJEDOM U 08:00 po
// BiH vremenu. Pomak od 8 sati unazad: sve prije srijede u 08:00 još pripada
// prošloj sedmici.
function bihParts(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sarajevo',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24 }
}

function survivalWeekKey(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  const date = new Date(Date.UTC(y, m - 1, day, hh - 8))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 3 + 7) % 7))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Nađi igrača po uid-u ili po imenu (displayName).
let uid = null
let ime = null
const direktno = await db.doc(`users/${arg}`).get()
if (direktno.exists) {
  uid = direktno.id
  ime = direktno.data().displayName
} else {
  const pogodci = (await db.collection('users').where('displayName', '==', arg).get()).docs
  if (pogodci.length === 0) {
    console.error(`GREŠKA: nema igrača s imenom ili uid-om "${arg}".`)
    process.exit(1)
  }
  if (pogodci.length > 1) {
    console.error(`GREŠKA: ime "${arg}" nosi ${pogodci.length} igrača — pokreni s uid-om:`)
    for (const d of pogodci) console.error(`  ${d.id}`)
    process.exit(1)
  }
  uid = pogodci[0].id
  ime = pogodci[0].data().displayName
}

const week = survivalWeekKey()
const runRef = db.doc(`survivalRuns/${uid}`)
const run = await runRef.get()

console.log(`Igrač:    ${ime}  (${uid})`)
console.log(`Sedmica:  ${week}`)
console.log(
  `Run prije: ${run.exists ? `niz ${run.data().streak}, aktivan: ${run.data().active}` : '(ne postoji)'}`
)

// 1. Stanje run-a — bez njega server misli da je pokušaj potrošen.
await runRef.delete()
// 2. Unos s leaderboarda tekuće sedmice.
await rtdb.ref(`survival/${week}/${uid}`).remove()
// 3. Event je opet živ → dnevni questovi ga smiju ponuditi. Brišemo i današnji
//    izbor questova da se napravi nanovo, sa survival zadatkom u ponudi.
await db.doc(`users/${uid}`).update({
  'eventStatus.survival': true,
  'eventStatus.survivalWeek': week,
  'taskProgress.daily.picked': null,
})

console.log('\n✓ Resetovano:')
console.log('  - survivalRuns/' + uid + '  obrisan')
console.log(`  - survival/${week}/${uid}  uklonjen s leaderboarda`)
console.log('  - eventStatus.survival = true, dnevni questovi se biraju nanovo')
console.log('\nIgrač sada može ponovo ući u Preživljavanje.')
process.exit(0)
