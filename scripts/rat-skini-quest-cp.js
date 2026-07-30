// Jednokratna ispravka: skida iz klanskog rata CP koji je došao iz nagrada za
// questove.
//
// ŠTA SE DESILO
// Pravilo igre je da u rat ulazi SAMO XP zarađen kroz dnevni kviz i
// Preživljavanje. `claimTask` je ipak zvao addClanWarCp, pa su i nagrade za
// dnevne, sedmične i mjesečne questove nosile CP. Ispravljeno 30.07.2026;
// ovdje se čisti ono što je do tada ušlo u rat koji je već tekao.
//
// KAKO SE RAČUNA (rekonstrukcijom, jer izvor CP-a nije zapisivan)
//   CP iz questova = ratXP − XP iz kvizova poslije otvaranja rata
//                          − XP iz Preživljavanja poslije otvaranja rata
// Množilac je danas 1.0 (nema srijednog boosta, petka ni R&D nivoa), pa je
// CP == priznati XP i oduzimanje XP-a je ujedno oduzimanje CP-a. Skripta to
// PROVJERAVA po igraču i odbija raditi ako negdje nije 1:1.
//
// Preživljavanje nema dnevni zapis, samo tekući run (streak + vrijeme zadnje
// aktivnosti). Zato:
//   - zadnja aktivnost PRIJE otvaranja rata → 0 XP iz Preživljavanja;
//   - poslije → uzima se NAJVEĆI mogući doprinos (3 XP × niz + kovčezi).
// Uvijek u korist igrača: radije ostavi koji CP nego da oduzme tuđi.
//
// Pokretanje:
//   node scripts/rat-skini-quest-cp.js               # suhi hod
//   node scripts/rat-skini-quest-cp.js --primijeni

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getDatabase } from 'firebase-admin/database'

const PRIMIJENI = process.argv.includes('--primijeni')
const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
const ENV_PATH = join(__dirname, '..', '.env')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}
// RTDB je u europe-west1 — sastavljena `...firebaseio.com` adresa tiho visi.
const rtdbUrl = readFileSync(ENV_PATH, 'utf8')
  .match(/^VITE_FIREBASE_DATABASE_URL=(.+)$/m)?.[1]
  ?.trim()
if (!rtdbUrl) {
  console.error('GREŠKA: VITE_FIREBASE_DATABASE_URL nije u .env')
  process.exit(1)
}
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))), databaseURL: rtdbUrl })
const db = getFirestore()
const rtdb = getDatabase()

const COMBO_PRAG = 3
const SURVIVAL_XP = 3
const SURVIVAL_KOVCEG_KORAK = 10

const cfg = (await db.doc('config/clanWar').get()).data()
if (!cfg?.warId) {
  console.error('GREŠKA: nema config/clanWar.')
  process.exit(1)
}
const POCETAK = cfg.startAt || 0
const dan = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sarajevo' }).format(
  new Date(POCETAK)
)
console.log(`Rat ${cfg.warId} · otvoren ${new Date(POCETAK).toLocaleString('bs-BA', { timeZone: 'Europe/Sarajevo', hour12: false })} · dan ${dan}\n`)

const vec = await db.doc(`ratIspravke/${cfg.warId}`).get()
if (vec.exists && PRIMIJENI) {
  console.log('Ispravka za ovaj rat je već odrađena:', JSON.stringify(vec.data().poIgracu))
  process.exit(0)
}

// --- XP iz kvizova poslije otvaranja rata ------------------------------------
const kvizXp = new Map()
;(await db.collection('quizSessions').get()).forEach((doc) => {
  const s = doc.data()
  const fin = s.finishedAt?.toMillis?.() || 0
  if (!s.finished || fin <= POCETAK) return
  const osnovni = (s.answers || []).reduce((t, a) => t + (a.correct ? a.points : 0), 0)
  let combo = 0
  let niz = 0
  if (s.comboBonus > 0) {
    for (const a of s.answers || []) {
      if (!a.correct) {
        niz = 0
        continue
      }
      niz++
      if (niz >= COMBO_PRAG) combo += a.points * s.comboBonus
    }
  }
  kvizXp.set(s.uid, (kvizXp.get(s.uid) || 0) + Math.round(osnovni * (1 + (s.xpBonus || 0)) + combo))
})

// --- Klan svakog igrača ------------------------------------------------------
const klanIgraca = new Map()
for (const d of (await db.collection('clans').get()).docs) {
  for (const uid of d.data().memberIds || []) klanIgraca.set(uid, { id: d.id, name: d.data().name })
}

// --- Rekonstrukcija po igraču ------------------------------------------------
const ratDaily = (await rtdb.ref(`clanWarDaily/${dan}`).get()).val() || {}
const red = []
let neslaganje = false

for (const [uid, ratXp] of Object.entries(ratDaily)) {
  const u = (await db.doc(`users/${uid}`).get()).data() || {}
  const klan = klanIgraca.get(uid)
  const cpClana = klan
    ? (await rtdb.ref(`clanWar/${cfg.warId}/${klan.id}/members/${uid}/cp`).get()).val() || 0
    : 0

  // Provjera 1:1. Bez nje bi oduzimanje XP-a krivo oduzimalo CP.
  if (klan && cpClana !== ratXp) {
    console.log(`⚠ ${u.displayName}: CP (${cpClana}) ≠ ratXP (${ratXp}) — množilac nije 1.0`)
    neslaganje = true
  }

  const sr = (await db.doc(`survivalRuns/${uid}`).get()).data()
  const zadnjaSurv = sr?.pausedAt?.toMillis?.() || sr?.endedAt?.toMillis?.() || 0
  const niz = sr?.streak || 0
  const survMax =
    zadnjaSurv > POCETAK ? niz * SURVIVAL_XP + Math.floor(niz / SURVIVAL_KOVCEG_KORAK) * 100 : 0

  const questCp = Math.max(0, ratXp - (kvizXp.get(uid) || 0) - survMax)
  red.push({
    uid,
    ime: u.displayName || uid,
    klan,
    ratXp,
    kviz: kvizXp.get(uid) || 0,
    survMax,
    questCp,
  })
}

red.sort((a, b) => b.questCp - a.questCp)
console.log(
  `${'igrač'.padEnd(18)} ${'klan'.padEnd(20)} ${'CP sad'.padStart(7)} ${'kviz'.padStart(6)} ${'surv≤'.padStart(6)} ${'skida se'.padStart(9)}`
)
for (const r of red) {
  console.log(
    `${r.ime.slice(0, 17).padEnd(18)} ${(r.klan?.name || '(bez klana)').slice(0, 19).padEnd(20)} ` +
      `${String(r.ratXp).padStart(7)} ${String(r.kviz).padStart(6)} ${String(r.survMax).padStart(6)} ${String(r.questCp).padStart(9)}`
  )
}

// Zbir po klanu
const poKlanu = new Map()
for (const r of red) {
  if (!r.klan || r.questCp <= 0) continue
  poKlanu.set(r.klan.id, (poKlanu.get(r.klan.id) || 0) + r.questCp)
}
console.log('\nPo klanu:')
for (const [cid, cp] of poKlanu) {
  const stari = (await rtdb.ref(`clanWar/${cfg.warId}/${cid}/cp`).get()).val() || 0
  const ime = red.find((r) => r.klan?.id === cid)?.klan.name || cid
  console.log(`  ${ime.padEnd(22)} ${stari} → ${stari - cp}  (−${cp})`)
}
console.log(`\nUkupno CP za skidanje: ${[...poKlanu.values()].reduce((a, b) => a + b, 0)}`)

if (neslaganje) {
  console.error('\nPREKID: negdje CP ≠ ratXP. Provjeri množioce prije ispravke.')
  process.exit(1)
}
if (!PRIMIJENI) {
  console.log('\nSuhi hod. Pokreni s --primijeni da se skine.')
  process.exit(0)
}

// --- Skidanje ----------------------------------------------------------------
// Sve transakcijama: igrači u međuvremenu igraju i dodaju CP, pa se smije samo
// oduzeti fiksan iznos, nikad upisati zatečena vrijednost.
for (const r of red) {
  if (r.questCp <= 0 || !r.klan) continue
  const korijen = `clanWar/${cfg.warId}/${r.klan.id}`
  await rtdb.ref(`${korijen}/cp`).transaction((cur) => Math.max(0, (cur || 0) - r.questCp))
  await rtdb
    .ref(`${korijen}/days/${dan}/cp`)
    .transaction((cur) => Math.max(0, (cur || 0) - r.questCp))
  await rtdb
    .ref(`${korijen}/members/${r.uid}`)
    .transaction((cur) => (cur ? { ...cur, cp: Math.max(0, (cur.cp || 0) - r.questCp) } : cur))
  // I dnevni strop igrača: taj XP se više ne broji u rat, pa ne smije ni jesti
  // njegovih 1000 XP dnevno.
  await rtdb
    .ref(`clanWarDaily/${dan}/${r.uid}`)
    .transaction((cur) => Math.max(0, (cur || 0) - r.questCp))
  console.log(`− ${r.ime}: ${r.questCp} CP`)
}

// Oznaka dnevne aktivnosti se NE dira: svi pogođeni igrači imaju i CP iz kviza,
// pa su tog dana bili aktivni bez obzira na questove.
await db.doc(`ratIspravke/${cfg.warId}`).set({
  razlog: 'claimTask je pripisivao CP suprotno pravilu (samo kviz i Preživljavanje)',
  dan,
  poIgracu: Object.fromEntries(red.filter((r) => r.questCp > 0).map((r) => [r.ime, r.questCp])),
  ukupno: red.reduce((t, r) => t + r.questCp, 0),
  izvrseno: FieldValue.serverTimestamp(),
})
console.log('\n✓ Skinuto i zapisano u ratIspravke/' + cfg.warId)
process.exit(0)
