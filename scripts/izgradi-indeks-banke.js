// Gradi bank/index — indeks banke pitanja iz kojeg Cloud Functions biraju
// pitanja umjesto da skeniraju cijelu kolekciju 'questions'.
//
// Pokretanje:  npm run izgradi-indeks
//              npm run izgradi-indeks -- --emulator
//
// Uvoz pitanja (import-questions.js) i admin panel ovo rade automatski.
// Skripta je tu za prvo punjenje i za popravku ako indeks ikad zaostane.
//
// Preduslov: scripts/serviceAccountKey.json (vidi import-questions.js).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  console.log('(emulator mod: pišem u lokalni Firestore na portu 8080)')
}

const { initializeApp, cert } = await import('firebase-admin/app')
const { getFirestore } = await import('firebase-admin/firestore')

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const snap = await db.collection('questions').where('active', '==', true).get()
// `difficulty` (1–3) je od 01.08.2026. dio indeksa: po njemu 1v1 turnir bira
// težinu pitanja po rundi (functions/pitanja-tezina.js). Bez njega u indeksu
// sva pitanja izgledaju kao srednja težina.
const items = snap.docs.map((d) => ({
  id: d.id,
  points: d.data().points,
  category: d.data().category,
  difficulty: d.data().difficulty ?? null,
}))

if (items.length === 0) {
  console.error('GREŠKA: nema nijednog aktivnog pitanja — indeks NIJE upisan.')
  console.error('(Prazan indeks bi funkcijama značio "banka je prazna".)')
  process.exit(1)
}

// Dokument Firestore-a smije biti najviše 1 MiB. Na ~60 B po stavci to je oko
// 17.000 pitanja; provjera je tu da se prag ne pređe nečujno.
const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8')
if (bytes > 900 * 1024) {
  console.error(`GREŠKA: indeks je ${(bytes / 1024).toFixed(0)} KB — preblizu limitu od 1 MiB.`)
  console.error('Banka je prerasla jedan dokument; indeks treba podijeliti na dijelove.')
  process.exit(1)
}

await db.doc('bank/index').set({
  version: Date.now(), // promjena verzije obara keš na instancama funkcija
  count: items.length,
  items,
  updatedAt: new Date(),
})

const kategorije = new Set(items.map((i) => i.category)).size
console.log(`✓ bank/index izgrađen: ${items.length} aktivnih pitanja, ${kategorije} kategorija`)
console.log(`  veličina indeksa: ${(bytes / 1024).toFixed(1)} KB (limit 1 MiB)`)
process.exit(0)
