// Podigni config/content.version — natjeraj klijente da osvježe keš taskova,
// bedževa i XP krive.
//
// Pokretanje:  npm run oznaci-sadrzaj
//              npm run oznaci-sadrzaj -- --emulator
//
// Skripte postavi-taskove/postavi-bedzeve/postavi-levele ovo rade same.
// Ova skripta je za slučaj da si sadržaj mijenjao RUČNO u Firebase konzoli —
// tada klijenti bez ovoga do brisanja keša gledaju stare questove i bedževe.

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
const { oznaciIzmjenuSadrzaja } = await import('./_verzija-sadrzaja.js')

await oznaciIzmjenuSadrzaja(db)
process.exit(0)
