// Admin skripta: dodjeljuje/oduzima admin ovlaštenje (Firebase custom claim).
// Pokretanje:  npm run postavi-admina -- info@farmaceutupraksi.ba
//         ili: npm run postavi-admina -- info@farmaceutupraksi.ba --ukloni
//
// Preduslov: nalog s tim emailom MORA već postojati (registrovan u aplikaciji).
// Poslije dodjele, admin se mora ODJAVITI pa PRIJAVITI (ili sačekati do 1h) da
// mu token pokupi novu ovlast. Server/pravila čitaju request.auth.token.admin.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}

const args = process.argv.slice(2)
const email = args.find((a) => a.includes('@'))
const remove = args.includes('--ukloni')
if (!email) {
  console.error('GREŠKA: navedi email. Primjer: npm run postavi-admina -- info@farmaceutupraksi.ba')
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY_PATH, 'utf8'))) })

try {
  const userRecord = await getAuth().getUserByEmail(email)
  await getAuth().setCustomUserClaims(userRecord.uid, remove ? {} : { admin: true })
  console.log(`✓ ${email} (uid ${userRecord.uid}) je sada ${remove ? 'OBIČAN korisnik' : 'ADMIN'}.`)
  console.log('  Napomena: admin se mora odjaviti pa ponovo prijaviti da promjena stupi na snagu.')
} catch (e) {
  if (e.code === 'auth/user-not-found') {
    console.error(`GREŠKA: nalog ${email} ne postoji. Prvo se registruj s tim emailom u aplikaciji, pa ponovo pokreni ovu skriptu.`)
  } else {
    console.error('GREŠKA:', e.message)
  }
  process.exit(1)
}
process.exit(0)
