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

// Uz '--emulator' piše u lokalni Firestore emulator umjesto u pravu bazu.
if (process.argv.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  console.log('(emulator mod: pišem u lokalni Firestore na portu 8080)')
}

if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

// metric:
//   'quizzes'         odigrani kvizovi          'days'            dani s odigranim kvizom
//   'correct'         tačni odgovori u kvizu    'perfect'         kvizovi bez greške
//   'xp'              XP iz kvizova (max 300/dan)
//   'survivalCorrect' tačni u Preživljavanju    'survivalBest'    najduži niz u periodu
//   'duels'           odigrani duel mečevi      'tournamentXp'    XP tokom prozora turnira
// category (opciono, uz 'correct'): broji samo tačne odgovore iz te kategorije
// event (opciono): 'survival' | 'tournament' — zadatak ulazi u ponudu SAMO dok
//   je event aktivan za tog igrača (ispao iz Preživljavanja = nema ga više).
//
// BALANS (dnevni strop: 3 kviza = max 30 pitanja = max 300 XP)
//  - Dnevni: bazen od 8 običnih + 4 event zadatka; svaki igrač dobija 3 na dan
//    (deterministički po uid+datumu). Kad je neki event živ, tačno 1 od ta 3 je
//    event zadatak. Svi ciljevi su dostižni unutar 3 kviza.
//  - Sedmični: ciljevi su NAMJERNO iznad maksimuma za 3 dana (3 dana = 9 kvizova
//    / 27 tačnih / 900 XP), pa se najranije mogu završiti ČETVRTI dan.
//  - Mjesečni: iznad maksimuma za 14 dana (42 kviza / 420 tačnih / 4200 XP), pa
//    traže najmanje 15 dana igranja.
const TASKS = [
  // ---- Dnevni bazen: osnovni (uvijek u igri) ----
  { id: 'daily-kviz-1', type: 'daily', title: 'Odigraj 1 kviz', shortTitle: '1 kviz', metric: 'quizzes', goal: 1, reward: 20, order: 1 },
  { id: 'daily-kviz-3', type: 'daily', title: 'Odigraj sva 3 dnevna kviza', shortTitle: '3 kviza', metric: 'quizzes', goal: 3, reward: 60, order: 2 },
  { id: 'daily-tacnih-12', type: 'daily', title: 'Odgovori tačno na 12 pitanja', shortTitle: '12 tačnih', metric: 'correct', goal: 12, reward: 30, order: 3 },
  { id: 'daily-tacnih-20', type: 'daily', title: 'Odgovori tačno na 20 pitanja', shortTitle: '20 tačnih', metric: 'correct', goal: 20, reward: 45, order: 4 },
  { id: 'daily-xp-150', type: 'daily', title: 'Osvoji 150 XP', shortTitle: '150 XP', metric: 'xp', goal: 150, reward: 30, order: 5 },
  { id: 'daily-xp-250', type: 'daily', title: 'Osvoji 250 XP', shortTitle: '250 XP', metric: 'xp', goal: 250, reward: 55, order: 6 },
  { id: 'daily-savrsen', type: 'daily', title: 'Odigraj kviz bez ijedne greške', shortTitle: 'Bez greške', metric: 'perfect', goal: 1, reward: 70, order: 7 },
  { id: 'daily-interakcije-3', type: 'daily', title: 'Odgovori tačno na 3 pitanja iz interakcija', shortTitle: '3 interakcije', metric: 'correct', category: 'interakcije', goal: 3, reward: 35, order: 8 },

  // ---- Dnevni bazen: event zadaci (samo dok je event živ za igrača) ----
  { id: 'daily-survival-3', type: 'daily', event: 'survival', title: 'Preživljavanje: 3 tačna odgovora danas', shortTitle: '3 u nizu', metric: 'survivalCorrect', goal: 3, reward: 40, order: 10 },
  { id: 'daily-survival-6', type: 'daily', event: 'survival', title: 'Preživljavanje: 6 tačnih odgovora danas', shortTitle: '6 u nizu', metric: 'survivalCorrect', goal: 6, reward: 70, order: 11 },
  { id: 'daily-duel', type: 'daily', event: 'tournament', title: 'Odigraj svoj duel meč', shortTitle: 'Duel', metric: 'duels', goal: 1, reward: 60, order: 12 },
  { id: 'daily-turnir-xp-150', type: 'daily', event: 'tournament', title: 'Osvoji 150 XP tokom turnira', shortTitle: 'Turnir 150 XP', metric: 'tournamentXp', goal: 150, reward: 50, order: 13 },

  // ---- Sedmični (fiksni; najranije završiv 4. dan) ----
  { id: 'weekly-dana-4', type: 'weekly', title: 'Igraj kvizove 4 dana u sedmici', metric: 'days', goal: 4, reward: 150, order: 1 },
  { id: 'weekly-kvizovi-10', type: 'weekly', title: 'Odigraj 10 kvizova', metric: 'quizzes', goal: 10, reward: 130, order: 2 },
  { id: 'weekly-tacnih-100', type: 'weekly', title: 'Odgovori tačno na 100 pitanja', metric: 'correct', goal: 100, reward: 120, order: 3 },
  { id: 'weekly-xp-1000', type: 'weekly', title: 'Osvoji 1000 XP u kvizovima', metric: 'xp', goal: 1000, reward: 130, order: 4 },
  { id: 'weekly-interakcije-10', type: 'weekly', title: 'Odgovori tačno na 10 pitanja iz interakcija', metric: 'correct', category: 'interakcije', goal: 10, reward: 80, order: 5 },
  { id: 'weekly-survival-15', type: 'weekly', event: 'survival', title: 'Preživljavanje: 15 tačnih odgovora', metric: 'survivalCorrect', goal: 15, reward: 150, order: 6 },
  { id: 'weekly-survival-niz-10', type: 'weekly', event: 'survival', title: 'Preživljavanje: dostigni niz od 10', metric: 'survivalBest', goal: 10, reward: 120, order: 7 },

  // ---- Mjesečni (fiksni; traže najmanje 15 dana igranja) ----
  { id: 'monthly-dana-15', type: 'monthly', title: 'Igraj kvizove 15 dana u mjesecu', metric: 'days', goal: 15, reward: 500, order: 1 },
  { id: 'monthly-kvizovi-45', type: 'monthly', title: 'Odigraj 45 kvizova', metric: 'quizzes', goal: 45, reward: 400, order: 2 },
  { id: 'monthly-tacnih-430', type: 'monthly', title: 'Odgovori tačno na 430 pitanja', metric: 'correct', goal: 430, reward: 350, order: 3 },
  { id: 'monthly-xp-4300', type: 'monthly', title: 'Osvoji 4300 XP u kvizovima', metric: 'xp', goal: 4300, reward: 350, order: 4 },
  { id: 'monthly-savrsenih-10', type: 'monthly', title: 'Odigraj 10 kvizova bez greške', metric: 'perfect', goal: 10, reward: 300, order: 5 },
  { id: 'monthly-survival-40', type: 'monthly', event: 'survival', title: 'Preživljavanje: 40 tačnih odgovora', metric: 'survivalCorrect', goal: 40, reward: 400, order: 6 },
]

// Stari taskovi (prije dnevnog limita) — gase se da ne stoje uz nove.
const DEACTIVATE = ['daily-kviz', 'daily-tacnih-7', 'daily-xp-80', 'weekly-kvizovi-5', 'weekly-tacnih-30', 'monthly-kvizovi-20', 'monthly-tacnih-120', 'monthly-xp-1500']

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

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
  const tag = t.event ? ` (event: ${t.event})` : ''
  console.log(`  [${t.type}] ${t.title}${tag} → +${t.reward} XP`)
}
console.log(`\n✓ Deaktivirano ${DEACTIVATE.length} starih taskova: ${DEACTIVATE.join(', ')}`)
process.exit(0)
