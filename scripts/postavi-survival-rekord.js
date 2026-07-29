// Admin skripta: računa rekord Preživljavanja (najbolji niz IKAD) iz zatečenih
// ljestvica i upisuje ga u config/survivalRecord.
//
// Pokretanje:  npm run postavi-rekord            (suhi hod — samo ispiše)
//              npm run postavi-rekord -- --stvarno
//
// Server rekord održava sam (functions/index.js, updateSurvivalRecord) i sam ga
// posije ako ne postoji. Ova skripta je za trenutak uvođenja i za slučaj da se
// rekord treba preračunati nanovo poslije ručne intervencije u podacima.

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

const stvarno = process.argv.includes('--stvarno')

initializeApp({
  credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))),
  databaseURL: 'https://pharma-quest-8c6cc-default-rtdb.europe-west1.firebasedatabase.app',
})
const db = getFirestore()
const rtdb = getDatabase()

// survival/{week}/{uid} → { name, avatar, streak }; tražimo najveći streak
// kroz SVE sedmice. Kod izjednačenja pobjeđuje starija sedmica — rekord pripada
// onome ko ga je prvi postavio, isto pravilo kao na serveru.
const snap = await rtdb.ref('survival').get()
const stablo = snap.exists() ? snap.val() || {} : {}

let naj = null
for (const week of Object.keys(stablo).sort()) {
  for (const [uid, z] of Object.entries(stablo[week] || {})) {
    const streak = z?.streak || 0
    if (streak > 0 && (!naj || streak > naj.streak)) {
      naj = { uid, name: z.name || 'Farmaceut', avatar: z.avatar || 'a1', streak, week }
    }
  }
}

const postojeci = await db.doc('config/survivalRecord').get()
console.log(
  'Zapisan rekord:',
  postojeci.exists ? `${postojeci.data().name} — niz ${postojeci.data().streak}` : '(ne postoji)'
)

if (!naj) {
  console.log('Nema nijednog niza na ljestvicama — nema šta upisati.')
  process.exit(0)
}

console.log(`Izračunat rekord: ${naj.name} — niz ${naj.streak} (sedmica ${naj.week}, uid ${naj.uid})`)

if (!stvarno) {
  console.log('\nSuhi hod — ništa nije upisano. Pokreni s "-- --stvarno" da se upiše.')
  process.exit(0)
}

await db.doc('config/survivalRecord').set({ ...naj, setAt: new Date() })
console.log('\n✓ config/survivalRecord upisan.')
process.exit(0)
