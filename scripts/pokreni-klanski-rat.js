// Admin skripta: napravi i pokreni klanski rat s računara.
//
// Pokretanje:
//   npm run pokreni-rat                    → probni ispis, ništa se ne mijenja
//   npm run pokreni-rat -- --stvarno       → pravi parove i POKREĆE rat odmah
//   npm run pokreni-rat -- --stvarno --do "2026-07-31 20:00"
//   npm run pokreni-rat -- --stvarno --par klanA,klanB --par klanC,klanD
//
// Isto radi i dugme u admin panelu (RatKontrola). Skripta postoji za slučaj kad
// panel nije deployan ili kad treba upariti klanove prije nego iko uđe u igru.
//
// PAŽNJA: rat koji je već zatvoren (status 'resolved') se NE dira — nagrade su
// isplaćene i ponovno pokretanje bi ih isplatilo drugi put.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { napraviParove, warIdZa, RAT_KRAJ_SAT } from '../functions/klan-rat.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const args = process.argv.slice(2)
const stvarno = args.includes('--stvarno')
const doArg = args[args.indexOf('--do') + 1]
const rucniParovi = args.reduce((acc, a, i) => {
  if (a === '--par' && args[i + 1]) acc.push({ clanIds: args[i + 1].split(',').map((s) => s.trim()) })
  return acc
}, [])

const BIH_TZ = 'Europe/Sarajevo'
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
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute }
}

// Petak ove sedmice u RAT_KRAJ_SAT po BiH vremenu (UTC+2 ljeti).
function podrazumijevaniKraj(p) {
  const danas = new Date(Date.UTC(p.y, p.m - 1, p.d))
  const doPetka = (5 - danas.getUTCDay() + 7) % 7
  return Date.UTC(p.y, p.m - 1, p.d + doPetka, RAT_KRAJ_SAT - 2, 0, 0)
}

const p = bihParts()
const warId = warIdZa(p)
const kraj = doArg ? new Date(doArg.replace(' ', 'T') + ':00+02:00').getTime() : podrazumijevaniKraj(p)
const pocetak = Date.now()

if (!Number.isFinite(kraj) || kraj <= pocetak) {
  console.error('GREŠKA: kraj rata mora biti u budućnosti. Format: --do "2026-07-31 20:00"')
  process.exit(1)
}

const klanSnap = await db.collection('clans').where('disbandedAt', '==', null).get()
const klanovi = klanSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((c) => (c.memberIds || []).length > 0)
  .map((c) => ({ id: c.id, name: c.name, tag: c.tag || null, rating: c.clanRating || 0, clanovi: (c.memberIds || []).length }))

console.log(`\nKlanovi (${klanovi.length}):`)
for (const k of klanovi) console.log(`  ${k.id}  ${k.name}  ${k.clanovi} čl.  ${k.rating} rtg`)

if (klanovi.length < 2) {
  console.error('\nGREŠKA: za rat trebaju bar dva klana s članovima.')
  process.exit(1)
}

const parovi = rucniParovi.length
  ? rucniParovi.map((x) => ({ ...x, grupni: x.clanIds.length > 2 }))
  : napraviParove(klanovi)

const bih = (ms) =>
  new Intl.DateTimeFormat('bs-BA', { timeZone: BIH_TZ, dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(ms)
  )

console.log(`\nRat:      ${warId}`)
console.log(`Počinje:  ${bih(pocetak)}`)
console.log(`Završava: ${bih(kraj)}`)
console.log(`Mečevi:   ${parovi.length}`)
for (const par of parovi) {
  console.log(
    '  ' + par.clanIds.map((id) => klanovi.find((k) => k.id === id)?.name || id).join('  vs  ') +
      (par.grupni ? '   (grupni)' : '')
  )
}

const postoji = await db.doc(`clanWars/${warId}`).get()
if (postoji.exists && postoji.data().status === 'resolved') {
  console.error(`\nGREŠKA: rat ${warId} je već zatvoren i nagrade su isplaćene. Ne diram ga.`)
  process.exit(1)
}

if (!stvarno) {
  console.log('\n(probni ispis — ništa nije upisano; dodaj --stvarno)')
  process.exit(0)
}

// Boost kategorija za srijedu: iz banke, samo kategorije s bar 20 pitanja.
const bank = await db.doc('bank/index').get()
const broj = {}
for (const it of bank.data()?.items || []) {
  const k = (it.category || '').trim()
  if (k) broj[k] = (broj[k] || 0) + 1
}
const kandidati = Object.entries(broj).filter(([, n]) => n >= 20).map(([k]) => k)
const boost = kandidati.length ? kandidati[Math.floor(Math.random() * kandidati.length)] : null

const stari = await db.collection(`clanWars/${warId}/matches`).get()
const batch = db.batch()
stari.docs.forEach((d) => batch.delete(d.ref))
batch.set(db.doc(`clanWars/${warId}`), {
  warId,
  startAt: pocetak,
  endAt: kraj,
  status: 'active',
  boostKategorija: boost,
  brojMeceva: parovi.length,
  brojKlanova: klanovi.length,
  createdAt: FieldValue.serverTimestamp(),
})
parovi.forEach((par, i) => {
  batch.set(db.doc(`clanWars/${warId}/matches/m${i}`), {
    clanIds: par.clanIds,
    grupni: !!par.grupni,
    bye: !!par.bye,
    imena: Object.fromEntries(
      par.clanIds.map((id) => {
        const k = klanovi.find((x) => x.id === id)
        return [id, { name: k?.name || id, tag: k?.tag || null }]
      })
    ),
    status: 'pending',
    scores: {},
    winner: null,
  })
})
batch.set(
  db.doc('config/clanWar'),
  {
    enabled: true,
    warId,
    status: 'active',
    startAt: pocetak,
    endAt: kraj,
    boostKategorija: boost,
    autoUparivanje: true,
    label: 'Klanski rat',
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
)
await batch.commit()

console.log(`\n✓ Rat ${warId} je POKRENUT. Kategorija za srijedu: ${boost || '—'}`)
console.log('  Bodovanje kreće odmah — svaki XP nosi 1 CP klanu.')
process.exit(0)
