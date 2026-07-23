// Admin skripta: upisuje parametre XP krive u Firestore (config/levels).
// Pokretanje:  npm run postavi-levele
// Mijenjaš li krivu kasnije — izmijeni vrijednosti ovdje pa ponovo pokreni.

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

// XP kriva — mora odgovarati DEFAULT_LEVEL_CONFIG u src/utils/levels.js
const LEVEL_CONFIG = {
  baseXp: 100, // XP za prelazak s levela 1 na 2
  stepXp: 25, // koliko svaki sljedeći prelazak poskupljuje
  maxLevel: 60,
}

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })
const db = getFirestore()

await db.doc('config/levels').set({ ...LEVEL_CONFIG, updatedAt: new Date() })

console.log('✓ XP kriva upisana u config/levels:')
console.log(`  Level 2: ${LEVEL_CONFIG.baseXp} XP, svaki sljedeći +${LEVEL_CONFIG.stepXp} skuplji, max level ${LEVEL_CONFIG.maxLevel}`)
process.exit(0)
