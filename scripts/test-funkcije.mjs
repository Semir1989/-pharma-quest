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

// 3b. resumeQuiz — pauza (zaključan ekran, poziv) ne smije pojesti pitanje.
// Vraća se ISTO pitanje, sa svježim rokom, i nijedan odgovor se ne gubi.
const resume = await call('resumeQuiz', { sessionId: start.sessionId })
if (resume.question.index !== start.question.index) {
  throw new Error(`resumeQuiz je pomjerio pitanje: ${start.question.index} → ${resume.question.index}`)
}
if (JSON.stringify(resume.question).includes('correctIndex')) {
  throw new Error('CURENJE u resumeQuiz!')
}
console.log(`✓ resumeQuiz: pauza vraća isto pitanje (${resume.question.index + 1}/${resume.total})`)

// Tačni odgovori se broje kroz cijeli test (i kroz blok 3c), da se na kraju
// mogu uporediti sa serverskim zbirom.
let correctCount = 0

// 3c. Rok pitanja kreće kad pitanje STANE PRED IGRAČA (ispravka 30.07.2026.)
//
// Regresija koju ovo čuva: askedAt se postavljao pri ocjeni PRETHODNOG pitanja,
// pa je vrijeme na ekranu s objašnjenjem jelo rok sljedećeg pitanja i tačni
// odgovori su poništavani dok je na tajmeru još bilo sekundi.
// Čitanje objašnjenja se simulira pomjeranjem askedAt 60 s u prošlost (prag je qSeconds + GRACE = 45 s).
const sRef = db.doc(`quizSessions/${start.sessionId}`)
{
  // (1) BEZ pocniPitanje → odgovor se poništava, ali server to sad JAVLJA
  //     (late) i pamti šta je igrač stvarno pritisnuo (selectedRaw).
  await sRef.update({ askedAt: Date.now() - 60000 })
  const zakasnio = await call('submitAnswer', { sessionId: start.sessionId, answerIndex: 0 })
  if (!zakasnio.late) throw new Error('Server nije javio late za poništeni odgovor!')
  if (zakasnio.correct) throw new Error('Zakašnjeli odgovor je priznat kao tačan!')
  const odg = (await sRef.get()).data().answers[0]
  if (odg.selected !== null) throw new Error('Poništeni odgovor nije zapisan kao null!')
  if (odg.selectedRaw !== 0) throw new Error('selectedRaw (stvarni izbor) nije sačuvan!')
  console.log('✓ Poništeni odgovor: late:true + selectedRaw sačuvan za provjeru')

  // (2) SA pocniPitanje → isto vrijeme na objašnjenju, odgovor se NORMALNO
  //     ocjenjuje. Ovo je srž ispravke.
  const prije = (await sRef.get()).data()
  await sRef.update({ askedAt: Date.now() - 60000 })
  const p = await call('pocniPitanje', { sessionId: start.sessionId, index: prije.current })
  if (!p.pokrenuto) throw new Error('pocniPitanje nije pomjerio rok pitanja!')
  const naVrijeme = await call('submitAnswer', { sessionId: start.sessionId, answerIndex: 0 })
  if (naVrijeme.late) throw new Error('Odgovor poslije pocniPitanje je poništen!')
  if (naVrijeme.correct) correctCount++
  console.log('✓ pocniPitanje: 60 s na ekranu objašnjenja više ne jede rok pitanja')

  // (3) Zaštita od zloupotrebe: rok se po pitanju pomjera SAMO JEDNOM i nikad
  //     za pitanje koje je već prošlo.
  const sad = (await sRef.get()).data()
  const prvi = await call('pocniPitanje', { sessionId: start.sessionId, index: sad.current })
  if (!prvi.pokrenuto) throw new Error('Prvi pocniPitanje za novo pitanje nije prošao!')
  const rok = (await sRef.get()).data().askedAt
  const drugi = await call('pocniPitanje', { sessionId: start.sessionId, index: sad.current })
  if (drugi.pokrenuto) throw new Error('pocniPitanje se dao ponoviti za isto pitanje!')
  if ((await sRef.get()).data().askedAt !== rok) throw new Error('Ponovljeni poziv je pomjerio rok!')
  const staro = await call('pocniPitanje', { sessionId: start.sessionId, index: sad.current - 1 })
  if (staro.pokrenuto) throw new Error('pocniPitanje je pomjerio rok za prošlo pitanje!')
  console.log('✓ pocniPitanje: jedan pomjeraj po pitanju, zakašnjeli poziv ne dodaje vrijeme')
}

// 4. Odgovori na ostatak pitanja (uvijek opcija 0)
let finished = false
let lastResult = null
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

// 6. Nagrade. Dnevni questovi se ROTIRAJU — server prima samo zadatak iz
// zamrznutog izbora (taskProgress.daily.picked), pa test taj izbor postavlja
// sam umjesto da se oslanja na nasumičnu rotaciju.
const ISPUNJEN = 'daily-kviz-1' // cilj: 1 kviz — odigran gore
const NEISPUNJEN = 'daily-xp-250' // cilj: 250 XP — jedan kviz ih ne donosi
await db.doc(`users/${uid}`).update({
  'taskProgress.daily.picked': [ISPUNJEN, NEISPUNJEN, 'daily-tacnih-12'],
})

const claim = await call('claimTask', { taskId: ISPUNJEN })
console.log(`✓ claimTask ${ISPUNJEN}: +${claim.reward} XP`)
const profile2 = (await db.doc(`users/${uid}`).get()).data()
if (profile2.xp !== profile.xp + claim.reward) throw new Error('Nagrada nije upisana!')

let blocked = false
try {
  await call('claimTask', { taskId: NEISPUNJEN })
} catch {
  blocked = true
}
console.log(blocked ? '✓ Neispunjen task ispravno ODBIJEN' : '✗ GREŠKA: neispunjen task prošao!')
if (!blocked) throw new Error('Server dozvolio preuzimanje neispunjenog taska!')

// 7. Dupli claim mora biti odbijen
let doubleBlocked = false
try {
  await call('claimTask', { taskId: ISPUNJEN })
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
