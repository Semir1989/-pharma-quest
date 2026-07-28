// Privremena dijagnostika push notifikacija.
// Gleda stanje naloga (notifOn, notifPrefs, fcmTokens) i šalje PRAVU poruku na
// svaki token da se vidi tačan odgovor FCM-a po uređaju.
//
// Pokretanje: node scripts/dijagnostika-notifikacija.js [email]

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getMessaging } from 'firebase-admin/messaging'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
initializeApp({
  credential: cert(JSON.parse(readFileSync(join(__dirname, 'serviceAccountKey.json'), 'utf8'))),
})

const db = getFirestore()

// Bez argumenta: nađi nalog s admin claimom.
const email = process.argv[2]
let korisnik
if (email) {
  korisnik = await getAuth().getUserByEmail(email)
} else {
  const lista = await getAuth().listUsers(1000)
  const admini = lista.users.filter((u) => u.customClaims?.admin === true)
  console.log(`\nNaloga ukupno: ${lista.users.length}, s admin claimom: ${admini.length}`)
  admini.forEach((u) => console.log(`  admin: ${u.email} (${u.uid})`))
  if (admini.length === 0) {
    console.log('Nema admin naloga — pokreni sa: node scripts/dijagnostika-notifikacija.js <email>')
    process.exit(1)
  }
  korisnik = admini[0]
}
console.log(`\nNALOG: ${email}`)
console.log(`  uid:   ${korisnik.uid}`)
console.log(`  admin claim: ${korisnik.customClaims?.admin === true}`)

const snap = await db.doc(`users/${korisnik.uid}`).get()
if (!snap.exists) {
  console.log('  users/{uid} dokument NE POSTOJI')
  process.exit(1)
}
const p = snap.data()
const tokeni = p.fcmTokens || []

console.log(`\nSTANJE NOTIFIKACIJA`)
console.log(`  notifOn:      ${p.notifOn}`)
console.log(`  notifPrefs:   ${JSON.stringify(p.notifPrefs || {})}`)
console.log(`  lastNotifAt:  ${p.lastNotifAt ? new Date(p.lastNotifAt).toISOString() : '—'}`)
console.log(`  lastNotifTip: ${p.lastNotifTip || '—'}`)
console.log(`  lastPlayDay:  ${p.lastPlayDay || '—'}`)
console.log(`  fcmTokens:    ${tokeni.length}`)
tokeni.forEach((t, i) => console.log(`    [${i}] ${t.slice(0, 24)}…${t.slice(-12)}  (${t.length} znakova)`))

// Koliko ih ukupno ima uključene notifikacije
const svi = await db.collection('users').where('notifOn', '==', true).get()
console.log(`\nUKUPNO s notifOn == true: ${svi.size}`)

if (tokeni.length === 0) {
  console.log('\n>>> NEMA TOKENA — slanje nije ni moguće. Uzrok je na klijentu.')
  process.exit(0)
}

console.log(`\nSLANJE PROBNE PORUKE (data-only, isto kao produkcija)…`)
const odgovor = await getMessaging().sendEachForMulticast({
  tokens: tokeni,
  data: {
    title: 'Dijagnostika',
    body: 'Ako vidiš ovo — isporuka radi.',
    url: '/',
    tip: 'najave',
    tag: `dijagnostika-${Date.now()}`,
  },
  webpush: { headers: { Urgency: 'normal', TTL: '86400' } },
})

console.log(`  successCount: ${odgovor.successCount}`)
console.log(`  failureCount: ${odgovor.failureCount}`)
odgovor.responses.forEach((r, i) => {
  if (r.success) console.log(`    [${i}] OK  messageId=${r.messageId}`)
  else console.log(`    [${i}] GREŠKA  code=${r.error?.code}  msg=${r.error?.message}`)
})

process.exit(0)
