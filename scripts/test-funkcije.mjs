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

// 9. Preživljavanje (izmjena 30.07.2026): 50 XP po koraku, a svaki 10. korak
//    nosi fiksnih 300 XP + kovčege sa žetonima (10 → 1, 20 → 2 … 100 → 10).
{
  const s0 = await call('startSurvival', {})
  if (s0.locked) throw new Error('Preživljavanje zaključano: ' + JSON.stringify(s0))

  // Tačan odgovor se ČITA iz baze — test ne smije pogađati.
  async function tacanZaTekuce() {
    const run = (await db.doc(`survivalRuns/${uid}`).get()).data()
    const tajna = await db.doc(`questionSecrets/${run.currentQid}`).get()
    if (tajna.exists) return tajna.data().correctIndex
    return (await db.doc(`questions/${run.currentQid}`).get()).data().correctIndex
  }
  const xpA = (await db.doc(`users/${uid}`).get()).data().xp
  const r1 = await call('submitSurvivalAnswer', { answerIndex: await tacanZaTekuce() })
  if (!r1.correct) throw new Error('Tačan odgovor u Preživljavanju nije priznat!')
  if (r1.xpPerCorrect !== 50) throw new Error(`Korak nosi ${r1.xpPerCorrect} XP, očekivano 50`)
  const xpB = (await db.doc(`users/${uid}`).get()).data().xp
  if (xpB - xpA !== 50) throw new Error(`Upisano ${xpB - xpA} XP po koraku, očekivano 50`)
  console.log('✓ Preživljavanje: korak nosi 50 XP')

  // Prag 10. Niz se postavlja na 9 pa se odgovara tačno — banka u testu ima
  // 10 pitanja, pa se `seen` čisti da izbor sljedećeg pitanja ne ostane prazan.
  await db
    .doc(`survivalRuns/${uid}`)
    .update({ streak: 9, awaitingNext: true, currentQid: null, seen: [] })
  await call('startSurvival', {})
  const xpC = (await db.doc(`users/${uid}`).get()).data().xp
  const r2 = await call('submitSurvivalAnswer', { answerIndex: await tacanZaTekuce() })
  if (r2.streak !== 10) throw new Error(`Niz je ${r2.streak}, očekivano 10`)
  if (r2.chestReward !== 300) throw new Error(`Prag nosi ${r2.chestReward} XP, očekivano 300`)
  const xpD = (await db.doc(`users/${uid}`).get()).data().xp
  if (xpD - xpC !== 350) throw new Error(`Prag je upisao ${xpD - xpC} XP, očekivano 350 (50+300)`)
  console.log('✓ Preživljavanje: prag 10 nosi fiksnih 300 XP uz korak')

  const zetonaPrije = (await db.doc(`users/${uid}`).get()).data().rewards || {}
  const kovceg = await call('claimSurvivalChest', { step: 10 })
  if (kovceg.nagrade.length !== 1) {
    throw new Error(`Prag 10 dao ${kovceg.nagrade.length} žetona, očekivan 1`)
  }
  const zetonaPoslije = (await db.doc(`users/${uid}`).get()).data().rewards || {}
  const vrsta = kovceg.nagrade[0].kind
  if ((zetonaPoslije[vrsta] || 0) <= (zetonaPrije[vrsta] || 0)) {
    throw new Error(`Žeton ${vrsta} nije upisan na profil!`)
  }
  console.log(`✓ claimSurvivalChest: prag 10 → 1 žeton (${kovceg.nagrade[0].label})`)

  let dupli = false
  try {
    await call('claimSurvivalChest', { step: 10 })
  } catch {
    dupli = true
  }
  if (!dupli) throw new Error('Isti kovčeg se dao otvoriti dvaput!')

  let rano = false
  try {
    await call('claimSurvivalChest', { step: 20 })
  } catch {
    rano = true
  }
  if (!rano) throw new Error('Otvoren kovčeg za prag koji nije osvojen!')
  console.log('✓ claimSurvivalChest: dupli i neosvojeni prag odbijeni')
}

// 10. Izbor sedmičnih i mjesečnih questova + zamjena žetonom (30.07.2026).
{
  const izbor = await call('ensureDailyQuests', {})
  if (!Array.isArray(izbor.pickedWeekly) || izbor.pickedWeekly.length === 0) {
    throw new Error('ensureDailyQuests ne vraća sedmični izbor!')
  }
  if (!Array.isArray(izbor.pickedMonthly) || izbor.pickedMonthly.length === 0) {
    throw new Error('ensureDailyQuests ne vraća mjesečni izbor!')
  }
  console.log(
    `✓ Izbor questova: ${izbor.picked.length} dnevnih, ${izbor.pickedWeekly.length} sedmičnih, ${izbor.pickedMonthly.length} mjesečnih`
  )

  const sviSedmicni = (await db.collection('tasks').where('type', '==', 'weekly').get()).docs.map(
    (d) => d.id
  )
  const vanIzbora = sviSedmicni.find((id) => !izbor.pickedWeekly.includes(id))
  if (!vanIzbora) throw new Error('Test traži bar jedan sedmični quest van izbora.')

  let odbijen = false
  try {
    await call('claimTask', { taskId: vanIzbora })
  } catch {
    odbijen = true
  }
  if (!odbijen) throw new Error('Quest van izbora se dao preuzeti!')
  console.log('✓ Sedmični quest van izbora ispravno ODBIJEN')

  // Zamjena troši ŽETON SVOG TIPA — dnevni žeton ne smije mijenjati sedmični.
  await db.doc(`users/${uid}`).update({ 'rewards.questReroll': 5, 'rewards.questRerollWeekly': 0 })
  const meta = izbor.pickedWeekly[0]
  let bezZetona = false
  try {
    await call('rerollDailyQuest', { taskId: meta })
  } catch {
    bezZetona = true
  }
  if (!bezZetona) throw new Error('Sedmični quest zamijenjen dnevnim žetonom!')

  await db.doc(`users/${uid}`).update({ 'rewards.questRerollWeekly': 1 })
  const zam = await call('rerollDailyQuest', { taskId: meta })
  if (zam.tip !== 'weekly') throw new Error(`Zamjena je vratila tip ${zam.tip}`)
  if (zam.preostaloZetona !== 0) throw new Error('Sedmični žeton nije potrošen!')
  const noviIzbor = (await db.doc(`users/${uid}`).get()).data().taskProgress.weekly.picked
  if (noviIzbor.includes(meta)) throw new Error('Zamijenjeni quest je ostao u izboru!')
  if (!noviIzbor.includes(zam.noviTaskId)) throw new Error('Novi quest nije ušao u izbor!')
  console.log('✓ Zamjena sedmičnog questa: troši svoj žeton, izbor se mijenja')
}

// 11. Zabrana od 7 dana poslije napuštanja klana (30.07.2026).
{
  await db.doc(`users/${uid}`).update({ clanCooldownUntil: Date.now() + 3 * 86400000 })
  let blokiranoOsnivanje = false
  try {
    await call('createClan', { name: 'Test Klan Zabrana', tag: 'TZB' })
  } catch (e) {
    blokiranoOsnivanje = /pridružiti/i.test(e.message) || /level/i.test(e.message)
  }
  if (!blokiranoOsnivanje) throw new Error('Klan osnovan uprkos zabrani!')

  let blokiranoPridruzivanje = false
  try {
    await call('requestJoinClan', { clanId: 'bilokoji' })
  } catch (e) {
    blokiranoPridruzivanje = /pridružiti/i.test(e.message)
  }
  if (!blokiranoPridruzivanje) throw new Error('Pridruživanje prošlo uprkos zabrani!')
  console.log('✓ Zabrana poslije izlaska: i osnivanje i pridruživanje odbijeni')

  await db.doc(`users/${uid}`).update({ clanCooldownUntil: 0 })
}

console.log('\n══════════════════════════════════')
console.log('SVI TESTOVI PROŠLI ✓ Server-side bodovanje radi.')
process.exit(0)
