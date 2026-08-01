// Skraćivanje NADUVANIH zamrznutih izbora questova — jednokratna popravka.
//
// Pokretanje:
//   node scripts/skrati-izbore.js              (probni hod, ništa se ne piše)
//   node scripts/skrati-izbore.js --stvarno    (upisuje)
//   ... --tip daily,weekly                     (default: samo daily)
//
// Default je SAMO daily: sedmični izbor je 31.07. namjerno prešao na 7 (5
// zatečenih + 2 stalna EPC zadatka), pa ga ne treba dirati — vidi test 9 u
// scripts/test-questovi.mjs.
//
// ZAŠTO POSTOJI
// Do 01.08.2026. je ensurePicksZaTip pri prvom ulasku u NOVI period dopisivao
// questove koje je igrač preuzeo (ili ispunio) u PROŠLOM periodu — provjera
// `cur.period === period` je stajala samo nad `base`, ne i nad `zasluzeni`.
// Posljedica: dnevnih questova je svaki dan bilo sve više (5 → 7 → 9...).
// Uzrok je popravljen u functions/index.js; ova skripta čisti već zamrznute
// liste, jer se one do kraja perioda više ne prave iznova.
//
// PRAVILO SKRAĆIVANJA — ništa zarađeno se ne oduzima:
//   1. `always` questovi ostaju uvijek
//   2. ostaju questovi koje je igrač u OVOM periodu preuzeo ILI ispunio, i
//      vanjski (EPC) zadaci na kojima mu je admin već upisao napredak
//   3. ostatak do TASK_COUNT se popunjava iz zatečene liste — prvo vanjski
//      (EPC) zadaci, pa ostali po `order`
//   4. ako sami zadržani (1+2) prelaze TASK_COUNT, lista ostaje veća — višak
//      traje samo do kraja perioda
//
// Zašto se NE zadržava svaki quest s napretkom > 0: brojači su zajednički, pa
// jedan odigran kviz odmah "pokreće" i 12 tačnih i 20 tačnih i 150 XP i 250 XP.
// Po tom pravilu skoro ništa ne bi ispalo. Skinuti quest ionako ne pojede
// napredak — brojači ostaju u taskProgress i zateknu quest ako se opet pojavi.
// Idempotentna je: drugi hod ne mijenja ništa.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { TASK_COUNT } from '../functions/quest-izbor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')

if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  console.log('(emulator mod)')
}
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

const STVARNO = process.argv.includes('--stvarno')
const tipArg = process.argv[process.argv.indexOf('--tip') + 1]
const TIPOVI =
  process.argv.includes('--tip') && tipArg ? tipArg.split(',').map((s) => s.trim()) : ['daily']

// --- ključevi perioda: IDENTIČNI serverskim (functions/index.js) -------------
const BIH_TZ = 'Europe/Sarajevo'
const pad = (n) => String(n).padStart(2, '0')

function bihParts(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BIH_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day }
}

function dailyKey(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  return `${y}-${pad(m)}-${pad(day)}`
}

function weeklyKey(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const date = new Date(Date.UTC(y, m - 1, day))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${pad(week)}`
}

// Mora pratiti MJESECNI_SPOJENI iz functions/index.js i src/utils/periods.js.
const MJESECNI_SPOJENI = { '2026-08': '2026-07' }
function monthlyKey(d = new Date()) {
  const { y, m } = bihParts(d)
  const stvarni = `${y}-${pad(m)}`
  return MJESECNI_SPOJENI[stvarni] || stvarni
}

const periodKey = (tip) =>
  tip === 'daily' ? dailyKey() : tip === 'weekly' ? weeklyKey() : monthlyKey()

// Napredak igrača na jednom questu — ista pravila kao vrijednostQuesta() na serveru.
function vrijednost(stanje, task) {
  if (task.metric === 'manual') return stanje?.manual?.[task.id] || 0
  if (task.metric === 'correct' && task.category) return stanje?.byCategory?.[task.category] || 0
  return stanje?.[task.metric] || 0
}

// ---------------------------------------------------------------------------
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const taskSnap = await db.collection('tasks').where('active', '==', true).get()
const byId = new Map(taskSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]))

const users = await db.collection('users').get()
console.log(
  `${users.size} igrača · tipovi: ${TIPOVI.join(', ')} · ` +
    `granice ${TIPOVI.map((t) => `${t}=${TASK_COUNT[t]}`).join(' ')} · ` +
    `${STVARNO ? 'UPISUJEM' : 'probni hod'}\n`
)

let dirnuto = 0
const brojacPoTipu = Object.fromEntries(TIPOVI.map((t) => [t, 0]))

for (const doc of users.docs) {
  const p = doc.data()
  const ime = p.displayName || doc.id.slice(0, 6)
  const izmjene = {}
  const opis = []

  for (const tip of TIPOVI) {
    const stanje = p.taskProgress?.[tip]
    const period = periodKey(tip)
    if (stanje?.period !== period || !Array.isArray(stanje.picked)) continue
    if (stanje.picked.length <= TASK_COUNT[tip]) continue

    // Šta se NE dira: stalni, vanjski (EPC), preuzeti i ispunjeni questovi.
    // Vanjski ostaju i kad su na 0 — igrač ih dobija rijetko, nose najveću
    // nagradu i tek su uvedeni (dnevni razgovor kreće 01.08.2026.).
    const zadrzi = stanje.picked.filter((id) => {
      const t = byId.get(id)
      if (!t) return false // ugašen quest — prilika da ispadne iz liste
      if (t.always === true || t.metric === 'manual') return true
      return stanje.claimed?.[id] === true || vrijednost(stanje, t) >= t.goal
    })

    const ostatak = stanje.picked.filter((id) => !zadrzi.includes(id) && byId.has(id))
    const mjesta = Math.max(0, TASK_COUNT[tip] - zadrzi.length)
    const novi = [...zadrzi, ...ostatak.slice(0, mjesta)].sort(
      (a, b) => (byId.get(a)?.order || 0) - (byId.get(b)?.order || 0)
    )
    if (novi.length === stanje.picked.length) continue

    const skinuto = stanje.picked.filter((id) => !novi.includes(id))
    izmjene[`taskProgress.${tip}.picked`] = novi
    opis.push(`${tip} ${stanje.picked.length}→${novi.length} (−${skinuto.join(', ')})`)
    brojacPoTipu[tip]++
  }

  if (opis.length === 0) continue
  dirnuto++
  console.log(`  ${ime}: ${opis.join(' · ')}`)
  if (STVARNO) await doc.ref.update(izmjene)
}

console.log(`\n${dirnuto} igrača ${STVARNO ? 'skraćeno' : 'bi bilo skraćeno'}`)
for (const [tip, n] of Object.entries(brojacPoTipu)) console.log(`  ${tip}: ${n}`)
if (!STVARNO) console.log('\nNIŠTA NIJE UPISANO. Ponovi s  --stvarno  da se primijeni.')
process.exit(0)
