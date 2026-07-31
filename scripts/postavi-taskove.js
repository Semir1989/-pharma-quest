// Admin skripta: upisuje definicije taskova u Firestore 'tasks' kolekciju.
// Pokretanje:  npm run postavi-taskove
//
// Same definicije su u scripts/taskovi-lista.js (čisti podaci, bez Firebasea) —
// mijenjaš li taskove, mijenjaj TAMO pa pokreni ovu skriptu (isti ID =
// ažuriranje). Poslije izmjene obavezno `npm run test-questovi`: on provjerava
// da bazen ima dovoljno kandidata za TASK_COUNT.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { TASKS, DEACTIVATE } from './taskovi-lista.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')

// Uz '--emulator' piše u lokalni Firestore emulator umjesto u pravu bazu.
if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  console.log('(emulator mod: pišem u lokalni Firestore na portu 8080)')
}

if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()
const { oznaciIzmjenuSadrzaja } = await import('./_verzija-sadrzaja.js')

const batch = db.batch()
for (const { id, ...task } of TASKS) {
  batch.set(db.collection('tasks').doc(id), { ...task, active: true, updatedAt: new Date() })
}
for (const id of DEACTIVATE) {
  batch.set(db.collection('tasks').doc(id), { active: false, updatedAt: new Date() }, { merge: true })
}
await batch.commit()

console.log(`✓ Upisano ${TASKS.length} taskova u 'tasks' kolekciju:`)
for (const t of TASKS) {
  const oznake = [
    t.event ? `event: ${t.event}` : null,
    t.always ? 'STALNI' : null,
    t.metric === 'manual' ? 'ručna potvrda' : null,
  ].filter(Boolean)
  const tag = oznake.length ? ` (${oznake.join(', ')})` : ''
  const dodatno = [
    ...Object.entries(t.tokens || {}).map(([k, n]) => `+${n} ${k}`),
    t.clanGold ? `+${t.clanGold} zelenih` : null,
  ].filter(Boolean)
  const extra = dodatno.length ? `, ${dodatno.join(', ')}` : ''
  console.log(`  [${t.type}] ${t.title}${tag} → +${t.reward} XP${extra}`)
}
console.log(`\n✓ Deaktivirano ${DEACTIVATE.length} starih taskova: ${DEACTIVATE.join(', ')}`)
await oznaciIzmjenuSadrzaja(db)
process.exit(0)
