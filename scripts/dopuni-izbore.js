// Dopuna ZAMRZNUTIH izbora questova svim igračima — jednokratna migracija.
//
// Pokretanje:
//   node scripts/dopuni-izbore.js            (probni hod, ništa se ne piše)
//   node scripts/dopuni-izbore.js --stvarno  (upisuje)
//   ... --tip weekly,monthly                 (samo ti periodi; default sva tri)
//
// ZAŠTO POSTOJI
// Izbor questova se zamrzne na početku perioda i ne dira do kraja. Server ga
// dopunjava (functions/index.js → ensurePicksZaTip), ali TA DOPUNA SE OKINE tek
// kad neko pozove `ensureDailyQuests` — a klijent ga zove SAMO kad je izbor
// prazan. Igrač koji već ima zamrznut izbor ga dakle ne bi dobio dok mu se
// period ne obrne: sedmični tek u ponedjeljak, mjesečni tek 01.09.
//
// Zato se poslije svake izmjene `TASK_COUNT` ili dodavanja `always` questa
// pokreće ova skripta. Idempotentna je — drugi hod ne mijenja ništa.
//
// Pravilo je isto kao na serveru: SAMO DODAJE. Nijedan zatečeni quest se ne
// uklanja, nijedan napredak se ne dira.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { dopuniIzbor, ponuda } from '../functions/quest-izbor.js'

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
  process.argv.includes('--tip') && tipArg
    ? tipArg.split(',').map((s) => s.trim())
    : ['daily', 'weekly', 'monthly']

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
      hour: '2-digit',
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

// ---------------------------------------------------------------------------
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const taskSnap = await db.collection('tasks').where('active', '==', true).get()
const sviTaskovi = taskSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
const pool = ponuda(sviTaskovi, dailyKey())

const odgodeni = sviTaskovi.filter((t) => !pool.some((p) => p.id === t.id))
if (odgodeni.length > 0) {
  console.log(`Odgođeni (ne ulaze u dopunu danas): ${odgodeni.map((t) => t.id).join(', ')}\n`)
}

const users = await db.collection('users').get()
console.log(`${users.size} igrača · tipovi: ${TIPOVI.join(', ')} · ${STVARNO ? 'UPISUJEM' : 'probni hod'}\n`)

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
    // Prazan ili istekao izbor se ne dira — njega server napravi iz nule pri
    // prvom otvaranju, i to već po novim pravilima.
    if (stanje?.period !== period || !Array.isArray(stanje.picked) || stanje.picked.length === 0) {
      continue
    }
    const dopunjen = dopuniIzbor(stanje.picked, pool, doc.id, tip, period)
    if (!dopunjen) continue

    izmjene[`taskProgress.${tip}.picked`] = dopunjen
    const dodano = dopunjen.filter((id) => !stanje.picked.includes(id))
    opis.push(`${tip} ${stanje.picked.length}→${dopunjen.length} (+${dodano.join(', ')})`)
    brojacPoTipu[tip]++
  }

  if (opis.length === 0) continue
  dirnuto++
  console.log(`  ${ime}: ${opis.join(' · ')}`)
  if (STVARNO) await doc.ref.update(izmjene)
}

console.log(`\n${dirnuto} igrača ${STVARNO ? 'dopunjeno' : 'bi bilo dopunjeno'}`)
for (const [tip, n] of Object.entries(brojacPoTipu)) console.log(`  ${tip}: ${n}`)
if (!STVARNO) console.log('\nNiŠTA NIJE UPISANO. Ponovi s  --stvarno  da se primijeni.')
process.exit(0)
