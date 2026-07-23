// Admin skripta za uvoz pitanja u Firestore 'questions' kolekciju.
//
// Pokretanje:  npm run uvoz-pitanja -- scripts/pitanja-primjer.json
// (ili direktno: node scripts/import-questions.js putanja/do/pitanja.json)
//
// Preduslov: scripts/serviceAccountKey.json — privatni ključ iz Firebase konzole
// (Project settings → Service accounts → Generate new private key).
// Ključ NIKAD ne ide na GitHub (vidi .gitignore).

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Uz '--emulator' skripta piše u lokalni Firestore emulator umjesto u pravu bazu.
if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  console.log('(emulator mod: pišem u lokalni Firestore na portu 8080)')
}

const { initializeApp, cert } = await import('firebase-admin/app')
const { getFirestore } = await import('firebase-admin/firestore')

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')

// ---- 1. Provjere prije starta ----
const jsonPath = process.argv.slice(2).find((a) => a !== '--emulator')
if (!jsonPath) {
  console.error('GREŠKA: navedi putanju do JSON fajla s pitanjima.')
  console.error('Primjer: npm run uvoz-pitanja -- scripts/pitanja-primjer.json')
  process.exit(1)
}
if (!existsSync(jsonPath)) {
  console.error(`GREŠKA: fajl ne postoji: ${jsonPath}`)
  process.exit(1)
}
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  console.error('Skini ga u Firebase konzoli: ⚙ Project settings → Service accounts → Generate new private key,')
  console.error('pa sačuvaj fajl kao scripts/serviceAccountKey.json')
  process.exit(1)
}

// ---- 2. Učitaj i validiraj pitanja ----
let questions
try {
  questions = JSON.parse(readFileSync(jsonPath, 'utf8'))
} catch (e) {
  console.error(`GREŠKA: fajl nije ispravan JSON (${e.message})`)
  process.exit(1)
}
if (!Array.isArray(questions) || questions.length === 0) {
  console.error('GREŠKA: JSON mora biti lista pitanja (počinje sa [ i završava sa ]).')
  process.exit(1)
}

const VALID_DIFFICULTY = [1, 2, 3]
const errors = []
questions.forEach((q, i) => {
  const label = `Pitanje #${i + 1}`
  if (typeof q.text !== 'string' || q.text.trim().length < 10)
    errors.push(`${label}: 'text' nedostaje ili je prekratak`)
  if (!Array.isArray(q.options) || q.options.length !== 4)
    errors.push(`${label}: 'options' mora imati tačno 4 opcije`)
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3)
    errors.push(`${label}: 'correctIndex' mora biti 0, 1, 2 ili 3`)
  if (typeof q.category !== 'string' || !q.category.trim())
    errors.push(`${label}: 'category' nedostaje`)
  if (!VALID_DIFFICULTY.includes(q.difficulty))
    errors.push(`${label}: 'difficulty' mora biti 1, 2 ili 3`)
  if (!Number.isInteger(q.points) || q.points <= 0)
    errors.push(`${label}: 'points' mora biti pozitivan broj`)
  if (typeof q.explanation !== 'string' || !q.explanation.trim())
    errors.push(`${label}: 'explanation' nedostaje`)
})
if (errors.length > 0) {
  console.error(`GREŠKA: ${errors.length} problem(a) u fajlu — ništa nije uvezeno:\n`)
  errors.forEach((e) => console.error('  • ' + e))
  process.exit(1)
}

// ---- 3. Poveži se na Firestore kao admin ----
initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

// ID dokumenta = hash teksta pitanja → ponovni uvoz istog fajla NE pravi duplikate,
// nego ažurira postojeća pitanja (možeš slobodno ispraviti tipfeler i uvesti ponovo).
const docId = (text) => createHash('sha1').update(text.trim().toLowerCase()).digest('hex').slice(0, 20)

// ---- 4. Upis u serijama (batch po 250 pitanja = 500 dokumenata, Firestore limit) ----
// Etapa 6: pitanje se dijeli na JAVNI dio (questions — bez tačnog odgovora!)
// i TAJNI dio (questionSecrets — čita ga samo server).
const col = db.collection('questions')
const secrets = db.collection('questionSecrets')
let written = 0
for (let i = 0; i < questions.length; i += 250) {
  const batch = db.batch()
  for (const q of questions.slice(i, i + 250)) {
    const id = docId(q.text)
    batch.set(col.doc(id), {
      text: q.text.trim(),
      options: q.options.map((o) => String(o).trim()),
      category: q.category.trim().toLowerCase(),
      difficulty: q.difficulty,
      points: q.points,
      active: true,
      updatedAt: new Date(),
      // Napomena: set() ZAMJENJUJE cijeli dokument, pa stari correctIndex/
      // explanation nestaju iz javnog dokumenta (migracija starih uvoza).
    })
    batch.set(secrets.doc(id), {
      correctIndex: q.correctIndex,
      explanation: q.explanation.trim(),
    })
  }
  await batch.commit()
  written += Math.min(250, questions.length - i)
  console.log(`  ...upisano ${written}/${questions.length}`)
}

const total = (await col.count().get()).data().count
console.log(`\n✓ Uvezeno ${written} pitanja iz "${jsonPath}".`)
console.log(`✓ Ukupno pitanja u bazi: ${total}`)
process.exit(0)
