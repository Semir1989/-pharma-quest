// Admin skripta: upisuje definicije taskova u Firestore 'tasks' kolekciju.
// Pokretanje:  npm run postavi-taskove
// Mijenjaš li taskove — izmijeni listu ovdje pa ponovo pokreni (isti ID = ažuriranje).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')

if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

// metric: 'quizzes' (odigrani kvizovi) | 'correct' (tačni odgovori) | 'xp' (osvojeni XP)
// category (opciono, uz 'correct'): broji samo tačne odgovore iz te kategorije
const TASKS = [
  // Dnevni
  { id: 'daily-kviz', type: 'daily', title: 'Odigraj 1 kviz', shortTitle: '1 kviz', metric: 'quizzes', goal: 1, reward: 30, order: 1 },
  { id: 'daily-tacnih-7', type: 'daily', title: 'Odgovori tačno na 7 pitanja', shortTitle: '7 tačnih', metric: 'correct', goal: 7, reward: 20, order: 2 },
  { id: 'daily-xp-80', type: 'daily', title: 'Osvoji 80 XP', shortTitle: '80 XP', metric: 'xp', goal: 80, reward: 25, order: 3 },

  // Sedmični
  { id: 'weekly-kvizovi-5', type: 'weekly', title: 'Odigraj 5 kvizova', metric: 'quizzes', goal: 5, reward: 100, order: 1 },
  { id: 'weekly-tacnih-30', type: 'weekly', title: 'Odgovori tačno na 30 pitanja', metric: 'correct', goal: 30, reward: 80, order: 2 },
  { id: 'weekly-interakcije-10', type: 'weekly', title: 'Odgovori tačno na 10 pitanja iz interakcija', metric: 'correct', category: 'interakcije', goal: 10, reward: 60, order: 3 },

  // Mjesečni
  { id: 'monthly-kvizovi-20', type: 'monthly', title: 'Odigraj 20 kvizova', metric: 'quizzes', goal: 20, reward: 250, order: 1 },
  { id: 'monthly-tacnih-120', type: 'monthly', title: 'Odgovori tačno na 120 pitanja', metric: 'correct', goal: 120, reward: 200, order: 2 },
  { id: 'monthly-xp-1500', type: 'monthly', title: 'Osvoji 1500 XP', metric: 'xp', goal: 1500, reward: 300, order: 3 },
]

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const batch = db.batch()
for (const { id, ...task } of TASKS) {
  batch.set(db.collection('tasks').doc(id), { ...task, active: true, updatedAt: new Date() })
}
await batch.commit()

console.log(`✓ Upisano ${TASKS.length} taskova u 'tasks' kolekciju:`)
for (const t of TASKS) console.log(`  [${t.type}] ${t.title} → +${t.reward} XP`)
process.exit(0)
