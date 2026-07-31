// Popravlja bracket TEKUĆEG 1v1 turnira:
//   1. briše mečeve čija grana nema nijednog igrača (višak prevelikog bracketa);
//   2. postavlja rokove rundi na BiH termine (08/14/20) umjesto jednakih
//      dijelova prozora, koji su padali usred noći.
//
// Skorovi, prijave i odigrani mečevi se NE DIRAJU.
//
// Pokretanje:
//   npm run popravi-turnir            → samo prikaže šta bi uradio
//   npm run popravi-turnir -- --pisi  → stvarno upiše
//
// Ista logika postoji i kao dugmad u admin panelu (adminPruneEmptyMatches,
// adminSetRoundDeadlines). Skripta je tu za slučaj da funkcije nisu deployane.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { rasporedRundi } from '../functions/turnir-raspored.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

const PISI = process.argv.includes('--pisi')

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const bih = (ms) =>
  ms
    ? new Intl.DateTimeFormat('bs-BA', {
        timeZone: 'Europe/Sarajevo',
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(ms))
    : '—'

const cfgSnap = await db.doc('config/tournament').get()
const cfg = cfgSnap.exists ? cfgSnap.data() : null
if (!cfg?.key) {
  console.error('Nema aktivnog turnira (config/tournament.key).')
  process.exit(1)
}
const tid = cfg.key

const tSnap = await db.doc(`tournaments/${tid}`).get()
if (!tSnap.exists) {
  console.error(`Bracket tournaments/${tid} ne postoji.`)
  process.exit(1)
}
const t = tSnap.data()
if (!t.rounds) {
  console.error('Turnir nema upisan broj rundi — stajem, da ne obrišem previše.')
  process.exit(1)
}

console.log(`Turnir: ${tid} · status ${t.status} · runda ${t.currentRound}/${t.rounds}`)
console.log(`Prijavljenih: ${t.participantCount} · bracket veličine ${t.size}`)
console.log(`Početak eventa: ${bih(cfg.openAt)}\n`)

// --- 1. Prazne grane -------------------------------------------------------
const mSnap = await db.collection(`tournaments/${tid}/matches`).get()
const po = {}
for (const d of mSnap.docs) po[d.id] = { ref: d.ref, ...d.data() }

const imaIgraca = {}
for (let r = 1; r <= t.rounds; r++) {
  for (const [id, m] of Object.entries(po)) {
    if (m.round !== r) continue
    const svoji = !!(m.p1 || m.p2)
    const ispod =
      r === 1 ? false : !!(imaIgraca[`r${r - 1}s${m.slot * 2}`] || imaIgraca[`r${r - 1}s${m.slot * 2 + 1}`])
    imaIgraca[id] = svoji || ispod
  }
}
const zaBrisanje = Object.keys(po).filter((id) => !imaIgraca[id])

console.log(`Mečeva ukupno: ${mSnap.size}`)
console.log(`Praznih (bez ijednog igrača u cijeloj grani): ${zaBrisanje.length}`)
if (zaBrisanje.length) console.log('  ' + zaBrisanje.sort().join(', '))

// Sigurnosna brana: ako bi ostalo manje mečeva nego što turnir treba, nešto je
// pogrešno u računu — radije stani nego obriši bracket.
const ostaje = mSnap.size - zaBrisanje.length
if (ostaje < t.rounds) {
  console.error(`\nSTOP: ostalo bi samo ${ostaje} mečeva za ${t.rounds} rundi. Ne diram ništa.`)
  process.exit(1)
}

// --- 2. Rokovi rundi -------------------------------------------------------
const stari = t.roundDeadlines || []
const novi = rasporedRundi(cfg.openAt || Date.now(), t.rounds)
console.log('\nRokovi rundi:')
for (let i = 0; i < t.rounds; i++) {
  const promjena = stari[i] === novi[i] ? '' : '  ← mijenja se'
  console.log(`  runda ${i + 1}: ${bih(stari[i])}  →  ${bih(novi[i])}${promjena}`)
}

// Runde koje su već zatvorene ne diramo — njihov rok je istorija.
const gotovih = (t.currentRound || 1) - 1
const spoj = novi.map((n, i) => (i < gotovih ? stari[i] || n : n))
if (gotovih > 0) console.log(`\n(Prvih ${gotovih} rundi je zatvoreno — njihovi rokovi ostaju kakvi jesu.)`)

if (!PISI) {
  console.log('\n— Probni prolaz. Ništa nije upisano. Za upis: npm run popravi-turnir -- --pisi')
  process.exit(0)
}

const batch = db.batch()
for (const id of zaBrisanje) batch.delete(po[id].ref)
batch.update(db.doc(`tournaments/${tid}`), { roundDeadlines: spoj })
await batch.commit()

console.log(`\n✓ Obrisano praznih mečeva: ${zaBrisanje.length}`)
console.log('✓ Rokovi rundi postavljeni na BiH termine')
process.exit(0)
