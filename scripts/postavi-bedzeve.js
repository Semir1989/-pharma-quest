// Admin skripta: upisuje definicije bedževa u Firestore 'badges' kolekciju.
// Pokretanje:  npm run postavi-bedzeve
// Mijenjaš li bedževe — izmijeni listu ovdje pa ponovo pokreni (isti ID = ažuriranje).
//
// Dodjelu bedževa (users/{uid}.badges) radi ISKLJUČIVO server (Cloud Functions,
// funkcija awardBadges) — klijent bedževe samo čita i prikazuje.

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

// metric: kumulativna metrika profila na koju se veže bedž. Server je računa u
// functions/index.js (profileMetrics): 'quizCount' (ukupno odigranih kvizova),
// 'perfectQuizzes' (kvizovi bez greške), 'totalCorrect' (ukupno tačnih),
// 'xp' (ukupan XP), 'level' (trenutni level).
// goal: prag koji metrika mora dostići da se bedž dodijeli.
const BADGES = [
  { id: 'prvi-kviz', emoji: '🎓', name: 'Prvi korak', description: 'Odigraj svoj prvi kviz', metric: 'quizCount', goal: 1, order: 1 },
  { id: 'uporni', emoji: '📚', name: 'Uporan', description: 'Odigraj 10 kvizova', metric: 'quizCount', goal: 10, order: 2 },
  { id: 'veteran', emoji: '🏅', name: 'Veteran', description: 'Odigraj 50 kvizova', metric: 'quizCount', goal: 50, order: 3 },
  { id: 'legenda', emoji: '👑', name: 'Legenda', description: 'Odigraj 100 kvizova', metric: 'quizCount', goal: 100, order: 4 },
  { id: 'stotka', emoji: '✅', name: 'Stotka', description: '100 tačnih odgovora', metric: 'totalCorrect', goal: 100, order: 5 },
  { id: 'precizan', emoji: '🎯', name: 'Precizan', description: '300 tačnih odgovora', metric: 'totalCorrect', goal: 300, order: 6 },
  { id: 'bezgresan', emoji: '💯', name: 'Bezgrešan', description: 'Riješi kviz bez ijedne greške', metric: 'perfectQuizzes', goal: 1, order: 7 },
  { id: 'xp-lovac', emoji: '⚡', name: 'XP lovac', description: 'Skupi 1000 XP', metric: 'xp', goal: 1000, order: 8 },
  { id: 'xp-masina', emoji: '🚀', name: 'XP mašina', description: 'Skupi 5000 XP', metric: 'xp', goal: 5000, order: 9 },
  { id: 'znalac', emoji: '🌟', name: 'Znalac', description: 'Dostigni level 10', metric: 'level', goal: 10, order: 10 },
]

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

const batch = db.batch()
for (const { id, ...badge } of BADGES) {
  batch.set(db.collection('badges').doc(id), { ...badge, active: true, updatedAt: new Date() })
}
await batch.commit()

console.log(`✓ Upisano ${BADGES.length} bedževa u 'badges' kolekciju:`)
for (const b of BADGES) console.log(`  ${b.emoji} ${b.name} — ${b.description}`)
process.exit(0)
