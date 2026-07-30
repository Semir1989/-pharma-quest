// Jednokratna nadoknada XP-a za odgovore koje je server nepravedno poništio.
//
// ŠTA SE DESILO (nađeno 30.07.2026.)
// submitAnswer je rok sljedećeg pitanja (askedAt) postavljao u trenutku kad
// ocijeni PRETHODNO pitanje. Klijent sljedeće pitanje iscrta tek kad igrač na
// ekranu s objašnjenjem pritisne "Sljedeće pitanje →". Vrijeme čitanja
// objašnjenja je zato teklo iz roka sljedećeg pitanja, pa je tačan odgovor bio
// poništavan (selected: null) i pri 5 sekundi na tajmeru. Ispravka: pocniPitanje
// (functions/index.js) — rok kreće kad pitanje stane pred igrača.
//
// KOGA SKRIPTA NADOKNAĐUJE
// Sve odgovore selected: null na pitanjima 2–10 zavšenih sesija otvorenih PRIJE
// ispravke. Prvo pitanje se NAMJERNO izostavlja: tamo su klijentov i serverov
// sat bili poravnati (askedAt postavlja startQuiz), pa su ti slučajevi stvarni
// istekli odgovori. Mjerenje to potvrđuje: na 1. pitanju 1,1 % poništenih, na
// ostalim 3–5 %.
//
// KAKO SE RAČUNA
// Ne može se znati je li igrač pritisnuo tačno slovo (poništenje je prepisivalo
// izbor, pa selectedRaw historijski ne postoji). Zato se nadoknađuje PUNI broj
// bodova pitanja — u korist igrača. Bez klanskih bonusa i bez combo množioca,
// i bez dnevnog stropa (nadoknada je odvojena od kviza, kao nagrada za quest).
//
// ŠTA SE NE DIRA
//   - answers[].correct i categoryStats/accuracyByCategory — ne znamo da je
//     odgovor bio tačan, pa se statistika tačnosti ne prepravlja;
//   - taskProgress (prošli dani/sedmice su zaključani);
//   - XP trka i klanski rat — to su takmičenja u toku i retroaktivni bodovi bi
//     falsifikovali poredak drugima. Ako se to želi, radi se odvojeno i svjesno.
//
// ŠTA SE USKLAĐUJE (jer visi o XP-u)
//   - users/{uid}.xp
//   - bonus za svaki 10. level (levelRewardMilestone) — isti algoritam kao
//     awardLevelMilestones u functions/index.js
//   - leaderboard/global (xp + level) i leaderboard/weekly za tekuću sedmicu
//     (samo dio nadoknade koji pripada toj sedmici)
//   - bedževi vezani na xp/level (ista pravila kao awardBadges)
//   - kovčezi za level se NE upisuju jer se izvode iz XP-a:
//     broj kovčega = levelFromXp(xp) − levelChestClaimed. Legnu sami.
//
// Skripta je idempotentna: šta je isplaćeno piše u xpNadoknade/{uid}
// (lista sessionId-eva), i ta sesija se drugi put ne plaća.
//
// Pokretanje:
//   node scripts/nadoknada-ponistenih.js                  # SUHI HOD, ništa ne piše
//   node scripts/nadoknada-ponistenih.js --primijeni      # upisuje
//   node scripts/nadoknada-ponistenih.js --emulator       # nad emulatorom
//   node scripts/nadoknada-ponistenih.js --do 2026-07-30T14:00:00Z
//        granica: sesije otvorene POSLIJE ovog trenutka se ne nadoknađuju
//        (default: sada). Postavi na trenutak deploya ispravke.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const args = process.argv.slice(2)
const PRIMIJENI = args.includes('--primijeni')
const EMULATOR = args.includes('--emulator')

if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
  console.log('(emulator mod: radim nad lokalnim emulatorima)')
}

const doIdx = args.indexOf('--do')
const GRANICA = doIdx >= 0 && args[doIdx + 1] ? new Date(args[doIdx + 1]).getTime() : Date.now()
if (!Number.isFinite(GRANICA)) {
  console.error('GREŠKA: --do nije ispravan datum.')
  process.exit(1)
}

const { initializeApp, cert } = await import('firebase-admin/app')
const { getFirestore, FieldValue } = await import('firebase-admin/firestore')
const { getDatabase } = await import('firebase-admin/database')

const __dirname = dirname(fileURLToPath(import.meta.url))
const KEY_PATH = join(__dirname, 'serviceAccountKey.json')
if (!existsSync(KEY_PATH)) {
  console.error('GREŠKA: nedostaje scripts/serviceAccountKey.json')
  process.exit(1)
}
const kljuc = JSON.parse(readFileSync(KEY_PATH, 'utf8'))

// RTDB adresa se ČITA iz .env. Baza projekta je u regiji europe-west1, pa
// pretpostavljeni `...-default-rtdb.firebaseio.com` (US) ne postoji — admin SDK
// se na njega samo beskonačno pokušava povezati i skripta visi bez greške.
const ENV_PATH = join(__dirname, '..', '.env')
const rtdbUrl = existsSync(ENV_PATH)
  ? (readFileSync(ENV_PATH, 'utf8').match(/^VITE_FIREBASE_DATABASE_URL=(.+)$/m) || [])[1]?.trim()
  : null
if (!rtdbUrl && !EMULATOR) {
  console.error('GREŠKA: VITE_FIREBASE_DATABASE_URL nije nađen u .env — ne znam adresu RTDB-a.')
  process.exit(1)
}
initializeApp({ credential: cert(kljuc), databaseURL: rtdbUrl })
const db = getFirestore()
const rtdb = getDatabase()

// --- pomoćne funkcije: preslikane iz functions/index.js -----------------------
// Parametri krive i definicije bedževa se ČITAJU iz baze (config/levels,
// badges), pa se ovdje ne može ukrasti razlika u konfiguraciji.
const BIH_TZ = 'Europe/Sarajevo'
const pad = (n) => String(n).padStart(2, '0')

function bihParts(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BIH_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day }
}

function weeklyKey(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const date = new Date(Date.UTC(y, m - 1, day))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${pad(week)}`
}

function levelFromXp(xp, cfg) {
  const xpFor = (level) => {
    const k = Math.min(level, cfg.maxLevel) - 1
    return k * cfg.baseXp + (cfg.stepXp * k * (k - 1)) / 2
  }
  let level = 1
  while (level < cfg.maxLevel && xp >= xpFor(level + 1)) level++
  return level
}

function profileMetrics(profile, cfg) {
  const cats = profile.categoryStats || {}
  const totalCorrect = Object.values(cats).reduce((s, c) => s + (c.correct || 0), 0)
  const totalAnswered = Object.values(cats).reduce((s, c) => s + (c.total || 0), 0)
  return {
    xp: profile.xp || 0,
    level: levelFromXp(profile.xp || 0, cfg),
    quizCount: profile.quizCount || 0,
    perfectQuizzes: profile.perfectQuizzes || 0,
    totalCorrect,
    totalAnswered,
    streak: profile.streak || 0,
  }
}

// --- 1. Konfiguracija --------------------------------------------------------
const cfgSnap = await db.doc('config/levels').get()
const cfg = { baseXp: 100, stepXp: 25, maxLevel: 100, ...(cfgSnap.exists ? cfgSnap.data() : {}) }
const badgeDefs = (await db.collection('badges').where('active', '==', true).get()).docs.map((d) => ({
  id: d.id,
  ...d.data(),
}))

// --- 2. Šta je već nadoknađeno ----------------------------------------------
// `ljestvice: true` na zapisu znači da su i XP i ljestvice odrađeni. Zapis bez
// te oznake je prekinuto pokretanje (XP legao, RTDB ne) — takve dovršava faza A.
const placeno = new Set()
const nedovrseni = new Map() // uid → Set(sessionId) čije ljestvice nisu odrađene
for (const d of (await db.collection('xpNadoknade').get()).docs) {
  const sesije = d.data().sesije || []
  for (const sid of sesije) placeno.add(sid)
  if (d.data().ljestvice !== true) nedovrseni.set(d.id, new Set(sesije))
}

// --- 3. Skupi poništene odgovore --------------------------------------------
const sesije = await db.collection('quizSessions').get()
const poIgracu = new Map() // uid → { xp, stavke[], sesije:Set, xpSedmica }
const sedmicaSad = weeklyKey()
let preskoceno = 0
let ukupnoStavki = 0

const popravkaSedmica = new Map() // uid → XP tekuće sedmice iz PLAĆENIH sesija

sesije.forEach((doc) => {
  const s = doc.data()
  if (!s.finished || !s.uid) return
  if (placeno.has(doc.id)) {
    preskoceno++
    // Prekinuto pokretanje: XP je legao, ali sedmična ljestvica nije dobila
    // svoj dio. Taj dio se ovdje ponovo izračuna da ga faza A može upisati.
    if (nedovrseni.get(s.uid)?.has(doc.id)) {
      const start0 = s.startedAt?.toMillis?.() || 0
      if (weeklyKey(new Date(start0)) === weeklyKey()) {
        const zbir0 = (s.answers || [])
          .filter((a, i) => i > 0 && a.selected === null)
          .reduce((t, a) => t + (a.points || 0), 0)
        popravkaSedmica.set(s.uid, (popravkaSedmica.get(s.uid) || 0) + zbir0)
      }
    }
    return
  }
  const start = s.startedAt?.toMillis?.() || 0
  if (start >= GRANICA) return // sesija poslije ispravke — nije pogođena

  const stavke = []
  ;(s.answers || []).forEach((a, i) => {
    // i === 0 se izostavlja: na prvom pitanju su satovi bili poravnati.
    if (i === 0 || a.selected !== null) return
    stavke.push({ sesija: doc.id, pitanje: i + 1, id: a.id, xp: a.points || 0 })
  })
  if (stavke.length === 0) return

  const zbir = stavke.reduce((t, x) => t + x.xp, 0)
  const rec = poIgracu.get(s.uid) || { xp: 0, xpSedmica: 0, stavke: [], sesije: new Set() }
  rec.xp += zbir
  if (weeklyKey(new Date(start)) === sedmicaSad) rec.xpSedmica += zbir
  rec.stavke.push(...stavke)
  rec.sesije.add(doc.id)
  poIgracu.set(s.uid, rec)
  ukupnoStavki += stavke.length
})

console.log(`\nPregledano sesija: ${sesije.size} (već nadoknađenih preskočeno: ${preskoceno})`)
console.log(`Granica (--do): ${new Date(GRANICA).toISOString()}`)
console.log(`Poništenih odgovora za nadoknadu: ${ukupnoStavki} kod ${poIgracu.size} igrača`)
console.log(`Ukupno XP za isplatu: ${[...poIgracu.values()].reduce((t, r) => t + r.xp, 0)}\n`)

// Upis na ljestvice — isto što radi syncLeaderboard u functions/index.js.
// Globalni unos je idempotentan (piše trenutno stanje), sedmični se UVEĆAVA pa
// se smije zvati samo jednom po isplati.
async function upisiLjestvice(uid, p, xpUkupno, level, sedmicniDelta) {
  if (p.hideFromBoards === true) return
  const unos = {
    name: p.displayName || 'Farmaceut',
    avatar: p.avatar || 'a1',
    level,
    streak: p.streak || 0,
  }
  await rtdb.ref(`leaderboard/global/${uid}`).update({ ...unos, xp: xpUkupno })
  if (sedmicniDelta > 0) {
    await rtdb
      .ref(`leaderboard/weekly/${sedmicaSad}/${uid}`)
      .transaction((cur) => ({ ...unos, xp: (cur?.xp || 0) + sedmicniDelta }))
  }
}

// --- FAZA A: dovrši prekinuto pokretanje ------------------------------------
// Prvo pokretanje 30.07.2026. je stalo na pogrešnoj RTDB adresi: XP i zapis su
// legli, ljestvice nisu. Ovdje se dovršava samo taj RTDB dio.
if (nedovrseni.size > 0) {
  console.log(`Nedovršenih zapisa (XP legao, ljestvice ne): ${nedovrseni.size}`)
  for (const uid of nedovrseni.keys()) {
    const snap = await db.doc(`users/${uid}`).get()
    if (!snap.exists) continue
    const p = snap.data()
    const level = levelFromXp(p.xp || 0, cfg)
    const sedm = popravkaSedmica.get(uid) || 0
    console.log(
      `  ${(p.displayName || uid).padEnd(22)} ljestvica → xp ${p.xp}, level ${level}` +
        (sedm ? `, sedmično +${sedm}` : '') +
        (PRIMIJENI ? '' : ' (suhi hod)')
    )
    if (!PRIMIJENI) continue
    await upisiLjestvice(uid, p, p.xp || 0, level, sedm)
    await db.doc(`xpNadoknade/${uid}`).set({ ljestvice: true }, { merge: true })
  }
  console.log('')
}

if (poIgracu.size === 0) {
  console.log('Nema više šta nadoknaditi.')
  process.exit(0)
}

// --- 4. Isplata po igraču ----------------------------------------------------
const izvjestaj = []
for (const [uid, rec] of poIgracu) {
  const userRef = db.doc(`users/${uid}`)
  const snap = await userRef.get()
  if (!snap.exists) {
    console.log(`⚠ ${uid}: profil ne postoji — preskačem ${rec.xp} XP`)
    continue
  }
  const p = snap.data()
  const xpPrije = p.xp || 0
  const levelPrije = levelFromXp(xpPrije, cfg)
  const kovcegPrije = Math.max(0, levelPrije - (p.levelChestClaimed || 1))

  // Bonus za svaki 10. level — isti algoritam kao awardLevelMilestones.
  let xpPoslije = xpPrije + rec.xp
  let milestone = p.levelRewardMilestone || 0
  let bonus = 0
  const presli = []
  for (let guard = 0; guard < 20; guard++) {
    const lvl = levelFromXp(xpPoslije, cfg)
    const next = milestone + 10
    if (next > lvl || next > cfg.maxLevel) break
    const nagrada = (next / 10) * 100
    xpPoslije += nagrada
    bonus += nagrada
    presli.push(next)
    milestone = next
  }

  const levelPoslije = levelFromXp(xpPoslije, cfg)
  const kovcegPoslije = Math.max(0, levelPoslije - (p.levelChestClaimed || 1))

  // Bedževi na xp/level koji sad prelaze prag.
  const m = profileMetrics({ ...p, xp: xpPoslije }, cfg)
  const imaBedz = p.badges || {}
  const noviBedzevi = badgeDefs
    .filter((b) => !imaBedz[b.id] && (m[b.metric] || 0) >= b.goal)
    .map((b) => b.id)

  izvjestaj.push({
    uid,
    ime: p.displayName || '(bez imena)',
    email: p.email || '',
    odgovora: rec.stavke.length,
    xpNadoknada: rec.xp,
    xpBonusLevela: bonus,
    xpPrije,
    xpPoslije,
    levelPrije,
    levelPoslije,
    kovcegPrije,
    kovcegPoslije,
    noviBedzevi,
    presliPragovi: presli,
    xpSedmica: rec.xpSedmica,
    sesije: [...rec.sesije],
    stavke: rec.stavke,
    skriven: p.hideFromBoards === true,
  })

  if (!PRIMIJENI) continue

  // 4a. XP + bonus + zapis u istoj transakciji (zapis je i zaštita od duple
  //     isplate: sljedeće pokretanje čita xpNadoknade i preskače te sesije).
  await db.runTransaction(async (tx) => {
    const s2 = await tx.get(userRef)
    if (!s2.exists) return
    const sad = s2.data()
    const izmjene = { xp: (sad.xp || 0) + rec.xp + bonus }
    if (bonus > 0) izmjene.levelRewardMilestone = milestone
    for (const id of noviBedzevi) izmjene[`badges.${id}`] = FieldValue.serverTimestamp()
    tx.update(userRef, izmjene)
    tx.set(
      db.doc(`xpNadoknade/${uid}`),
      {
        uid,
        razlog: 'ponisteni-odgovori-kviza-30-07-2026',
        xp: FieldValue.increment(rec.xp),
        xpBonusLevela: FieldValue.increment(bonus),
        odgovora: FieldValue.increment(rec.stavke.length),
        sesije: FieldValue.arrayUnion(...rec.sesije),
        stavke: FieldValue.arrayUnion(...rec.stavke.map((x) => `${x.sesija}#${x.pitanje}`)),
        izvrseno: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  })

  // 4b. Oznaka na sesijama (informativno, za buduće provjere).
  const batch = db.batch()
  for (const sid of rec.sesije) {
    batch.set(
      db.doc(`quizSessions/${sid}`),
      { nadoknada: { at: FieldValue.serverTimestamp(), razlog: 'ponisteni-odgovori' } },
      { merge: true }
    )
  }
  await batch.commit()

  // 4c. Ljestvice (RTDB), pa oznaka da je igrač u cijelosti odrađen. Oznaka ide
  //     POSLIJE upisa: padne li skripta ovdje, faza A dovršava ljestvice.
  await upisiLjestvice(uid, p, xpPoslije, levelPoslije, rec.xpSedmica)
  await db.doc(`xpNadoknade/${uid}`).set({ ljestvice: true }, { merge: true })
}

// --- 5. Izvještaj ------------------------------------------------------------
izvjestaj.sort((a, b) => b.xpNadoknada - a.xpNadoknada)
console.log(PRIMIJENI ? '=== ISPLAĆENO ===\n' : '=== SUHI HOD (ništa nije upisano) ===\n')
for (const r of izvjestaj) {
  const lvl = r.levelPoslije > r.levelPrije ? ` · level ${r.levelPrije}→${r.levelPoslije}` : ''
  const kov =
    r.kovcegPoslije > r.kovcegPrije ? ` · kovčezi ${r.kovcegPrije}→${r.kovcegPoslije}` : ''
  const bez = r.noviBedzevi.length ? ` · bedževi: ${r.noviBedzevi.join(', ')}` : ''
  const bon = r.xpBonusLevela ? ` (+${r.xpBonusLevela} bonus za level ${r.presliPragovi.join(', ')})` : ''
  console.log(
    `${r.ime.padEnd(22)} +${String(r.xpNadoknada).padStart(4)} XP${bon} · ${r.odgovora} odgovora · ` +
      `XP ${r.xpPrije}→${r.xpPoslije}${lvl}${kov}${bez}${r.skriven ? ' · [skriven s ljestvica]' : ''}`
  )
}

const ukXp = izvjestaj.reduce((t, r) => t + r.xpNadoknada + r.xpBonusLevela, 0)
console.log(`\nIgrača: ${izvjestaj.length} · ukupno XP: ${ukXp}`)
console.log(`Novih levela: ${izvjestaj.filter((r) => r.levelPoslije > r.levelPrije).length}`)
console.log(`Novih kovčega: ${izvjestaj.reduce((t, r) => t + (r.kovcegPoslije - r.kovcegPrije), 0)}`)
console.log(`Novih bedževa: ${izvjestaj.reduce((t, r) => t + r.noviBedzevi.length, 0)}`)
if (!PRIMIJENI) console.log('\nPokreni s --primijeni da se upiše.')
process.exit(0)
