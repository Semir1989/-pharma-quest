// E2E test Cloud Functions na emulatorima: registracija → startQuiz →
// 10× submitAnswer → provjera XP-a, taskova i leaderboarda.
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

initializeApp({ projectId: 'pharma-quest-8c6cc' })
const db = getFirestore()

const FN = 'http://127.0.0.1:5001/pharma-quest-8c6cc/europe-west1'
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'

// 1. Registruj test korisnika u Auth emulatoru
const signUp = await fetch(`${AUTH}/accounts:signUp?key=fake-api-key`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@epc.ba', password: 'test123', returnSecureToken: true }),
}).then((r) => r.json())
if (!signUp.idToken) throw new Error('Auth signUp nije uspio: ' + JSON.stringify(signUp))
const { idToken, localId: uid } = signUp
console.log('✓ Test korisnik kreiran:', uid)

// 2. Kreiraj users dokument (kao pri registraciji u aplikaciji)
await db.doc(`users/${uid}`).set({
  email: 'test@epc.ba',
  displayName: 'Test Farmaceut',
  avatar: 'a2',
  xp: 0,
  level: 1,
  streak: 0,
  clan: null,
  accuracyByCategory: {},
  createdAt: new Date(),
})
console.log('✓ Profil kreiran')

async function call(name, data) {
  const res = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`${name}: ${JSON.stringify(json.error)}`)
  return json.result
}

// 3. startQuiz
const start = await call('startQuiz', {})
console.log(`✓ startQuiz: sesija ${start.sessionId}, ${start.total} pitanja`)

// SIGURNOSNA PROVJERA: pitanje ne smije sadržavati tačan odgovor
const leak = JSON.stringify(start.question)
if (leak.includes('correctIndex') || leak.includes('explanation')) {
  throw new Error('CURENJE: startQuiz vraća tajna polja! ' + leak)
}
console.log('✓ Nema curenja tačnog odgovora u startQuiz')

// 4. Odgovori na svih 10 pitanja (uvijek opcija 0)
let finished = false
let lastResult = null
let correctCount = 0
for (let i = 0; i < start.total && !finished; i++) {
  lastResult = await call('submitAnswer', { sessionId: start.sessionId, answerIndex: 0 })
  if (lastResult.correct) correctCount++
  finished = lastResult.finished
  if (!finished) {
    const leak2 = JSON.stringify(lastResult.question)
    if (leak2.includes('correctIndex')) throw new Error('CURENJE u submitAnswer!')
  }
}
console.log(`✓ Kviz završen: ${lastResult.summary.correctCount}/${lastResult.summary.total} tačnih, +${lastResult.summary.earnedXp} XP`)
if (lastResult.summary.correctCount !== correctCount) throw new Error('Neslaganje brojanja!')

// 5. Provjeri users dokument
const profile = (await db.doc(`users/${uid}`).get()).data()
console.log(`✓ Profil poslije kviza: xp=${profile.xp}, dnevni kvizovi=${profile.taskProgress?.daily?.quizzes}, tačnih=${profile.taskProgress?.daily?.correct}`)
if (profile.xp !== lastResult.summary.earnedXp) throw new Error('XP se ne slaže s rezultatom!')

// 6. Pokušaj preuzeti nagradu za "Odigraj 1 kviz" (ispunjen) i "20 kvizova" (nije)
const claim = await call('claimTask', { taskId: 'daily-kviz' })
console.log(`✓ claimTask daily-kviz: +${claim.reward} XP`)
const profile2 = (await db.doc(`users/${uid}`).get()).data()
if (profile2.xp !== profile.xp + claim.reward) throw new Error('Nagrada nije upisana!')

let blocked = false
try {
  await call('claimTask', { taskId: 'monthly-kvizovi-20' })
} catch {
  blocked = true
}
console.log(blocked ? '✓ Neispunjen task ispravno ODBIJEN' : '✗ GREŠKA: neispunjen task prošao!')
if (!blocked) throw new Error('Server dozvolio preuzimanje neispunjenog taska!')

// 7. Dupli claim mora biti odbijen
let doubleBlocked = false
try {
  await call('claimTask', { taskId: 'daily-kviz' })
} catch {
  doubleBlocked = true
}
console.log(doubleBlocked ? '✓ Dupla nagrada ispravno ODBIJENA' : '✗ GREŠKA: dupla nagrada prošla!')
if (!doubleBlocked) throw new Error('Server dozvolio duplu nagradu!')

// 8. Leaderboard u RTDB emulatoru
const lb = await fetch(
  `http://127.0.0.1:9000/leaderboard/global/${uid}.json?ns=pharma-quest-8c6cc-default-rtdb`,
  { headers: { Authorization: 'Bearer owner' } }
).then((r) => r.json())
console.log(`✓ Leaderboard global: ${lb?.name} — ${lb?.xp} XP (level ${lb?.level})`)
if (lb?.xp !== profile2.xp) throw new Error('Leaderboard XP se ne slaže!')

console.log('\n══════════════════════════════════')
console.log('SVI TESTOVI PROŠLI ✓ Server-side bodovanje radi.')
process.exit(0)
