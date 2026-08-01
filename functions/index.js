// Pharma Quest — Cloud Functions (Etapa 6: server logika i sigurnost).
//
// Bodovanje se seli s klijenta na server:
//  - startQuiz:    server bira pitanja i vraća ih BEZ tačnih odgovora
//  - submitAnswer: server provjerava tačnost, vodi tajmer, na kraju kviza
//                  dodjeljuje XP, ažurira statistiku, taskove i leaderboard
//  - claimTask:    server provjerava uslov taska i dodjeljuje nagradu
// Klijent više NIKAD ne računa niti upisuje XP.

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { setGlobalOptions } from 'firebase-functions/v2'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getDatabase } from 'firebase-admin/database'
import { getMessaging } from 'firebase-admin/messaging'
import {
  kandidatiZaNotifikaciju,
  turnirskaPoruka,
  smijePrimiti,
  notifUkljucen,
} from './notif-odluka.js'
import {
  seedFrom,
  seededPick,
  pickTaskIds,
  dopuniIzbor,
  ponuda,
  smijeSeZamijeniti,
  vrijednostQuesta,
  zasluzeni as zasluzeniUPeriodu,
} from './quest-izbor.js'
import {
  MAX_CLANOVA,
  MAX_SAVJETNIKA,
  MIN_LEVEL_OSNIVANJE,
  NEAKTIVNOST_DANA,
  KLAN_ZABRANA_MS,
  zabranaOstalo,
  kljucImena,
  validirajIme,
  validirajTag,
  ulogaU,
  smijeUpravljati,
  smijeRaspustiti,
  smijeMijenjatiSavjetnike,
  smijePrijavitiNaTakmicenje,
  smijeIzbaciti,
  mozeOsnovati,
  imaMjesta,
  mozeJosSavjetnika,
  izaberiNasljednika,
  jeNeaktivan,
  registracijaOtvorena,
  weekIdZaRegistraciju,
} from './klan-pravila.js'
import {
  DUEL_QUESTIONS,
  DUEL_TOTAL_SECONDS,
  duelPreostalo,
  resolveMatch,
} from './duel-pravila.js'
import { rasporedRundi, brojRundi, paroviPrveRunde } from './turnir-raspored.js'
// Klanski rat. Prefiks `rat*` je namjeran: imena poput `bonusi` ili `mnozilac`
// su preopšta za fajl od 4600 linija, a `objekat`/`resolveMatch` bi se sudarili
// s postojećim funkcijama.
import {
  OBJEKTI as RAT_OBJEKTI,
  MAX_NIVO as RAT_MAX_NIVO,
  COMBO_PRAG,
  DNEVNI_CP_STROP,
  UCESCE_BONUS,
  UPARIVANJE_DAN,
  UPARIVANJE_SAT,
  RAT_POCETAK_SAT,
  RAT_KRAJ_SAT,
  objekat as ratObjekat,
  cijenaNadogradnje as ratCijenaNadogradnje,
  bonusi as ratBonusi,
  mnozilac as ratMnozilac,
  cpZaXp as ratCpZaXp,
  pragUcesca as ratPragUcesca,
  odlukaOBonusu as ratOdlukaOBonusu,
  napraviParove as ratNapraviParove,
  ishodMeca as ratIshodMeca,
  nagradaKlanu as ratNagradaKlanu,
  nagradaClanu as ratNagradaClanu,
  warIdZa as ratWarIdZa,
  dnevniKljuc as ratDnevniKljuc,
  ratUToku,
} from './klan-rat.js'
import { danUSedmici as ratDanUSedmici } from './klan-pravila.js'

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 })

initializeApp({
  databaseURL: 'https://pharma-quest-8c6cc-default-rtdb.europe-west1.firebasedatabase.app',
})
const db = getFirestore()
const rtdb = getDatabase()

const QUESTIONS_PER_QUIZ = 10
const QUESTION_SECONDS = 30
// Tolerancija za mrežno kašnjenje: server broji vrijeme od SLANJA pitanja, a
// klijentski tajmer kreće tek kad pitanje stigne i iscrta se. Na sporoj mobilnoj
// mreži ta razlika zna poništiti tačan odgovor, pa dajemo velikodušan grace.
const GRACE_SECONDS = 15

// Dnevni limit kvizova: najviše 3 kviza i najviše 300 XP iz kvizova po danu
// (BiH dan). Limit se odnosi SAMO na kviz — nagrade za questove, Preživljavanje
// i turnir dolaze povrh toga.
// Strop XP-a iz kvizova po BiH danu. Podignut s 300 na 1000 kad su pokušaji
// postali energija koja se regeneriše — inače bi regenerisani kvizovi nosili
// nula XP-a i izgledali kao pokvarena nagrada.
const DAILY_QUIZ_XP_CAP = 1000

// Energija za kvizove (Etapa 9).
// Igrač ima najviše 3 pokušaja ODJEDNOM. Novi dan ih vraća na 3, a tokom dana
// se po jedan regeneriše svaka 4 sata, opet do istog stropa. Time igra ima šta
// nuditi i kad nema vikend eventa, a strop od 3 sprečava da se sve odigra u
// jednoj minuti. Nagrade iz kovčega NE dižu strop — one su žetoni koji
// spremnik pune (vidi rewards.quizRefill).
const QUIZ_ENERGY_MAX = 3
const QUIZ_REGEN_MS = 4 * 3600 * 1000

// Preživljavanje (Etapa 8): endless mod, +3 XP po tačnom, kraj na prvu grešku.
const SURVIVAL_XP_PER_CORRECT = 50 // do 30.07.2026. bilo 3
const SURVIVAL_SECONDS = 20 // kraći tajmer — napetost; istek = kraj run-a

// Kovčezi na ljestvici niza: svaki 10. tačan odgovor zaredom nosi FIKSNIH
// 300 XP (isto na svakom pragu) plus kovčege sa žetonima — 1 na koraku 10,
// 2 na 20, 3 na 30 … 10 na 100. Žetoni su isti bubanj kao kod kovčega za level
// (CHEST_REWARDS), a izvlači ih server pri otvaranju.
//
// Nizovi se resetuju srijedom, pa se i nagrade mogu osvojiti iznova svake
// sedmice. Ne miješati s awardLevelMilestones — to je bonus za GLOBALNI level,
// sasvim druga stvar.
const SURVIVAL_CHEST_STEP = 10
const SURVIVAL_MAX_STEP = 100
const SURVIVAL_CHEST_XP = 300

function survivalChestReward(streak) {
  if (streak % SURVIVAL_CHEST_STEP !== 0) return 0
  if (streak > SURVIVAL_MAX_STEP) return 0
  return SURVIVAL_CHEST_XP
}

// Koliko kovčega sa žetonima nosi prag: korak 10 → 1, 20 → 2 … 100 → 10.
function survivalChestCount(step) {
  if (step % SURVIVAL_CHEST_STEP !== 0 || step <= 0 || step > SURVIVAL_MAX_STEP) return 0
  return step / SURVIVAL_CHEST_STEP
}

// ---------------------------------------------------------------------------
// Pomoćne funkcije: periodi (kopija logike iz src/utils/periods.js)
// Ključevi se računaju po BiH vremenu (Europe/Sarajevo) — Cloud Functions rade
// u UTC-u, pa bi bez ovoga dnevni reset na serveru bio 2h poslije onog na ekranu.
// ---------------------------------------------------------------------------
const BIH_TZ = 'Europe/Sarajevo'
const pad = (n) => String(n).padStart(2, '0')

function bihParts(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BIH_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second }
}

function bihOffset(d) {
  const p = bihParts(d)
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(d.getTime() / 1000) * 1000
}

function dailyKey(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  return `${y}-${pad(m)}-${pad(day)}`
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

// IZNIMKA (odluka 31.07.2026): mjesečni period jula je PRODUŽEN kroz august.
// Jedan period traje 01.07. → 31.08.2026, a kalendarska logika se vraća
// 01.09.2026. Mapa je 'stvarni mjesec → ključ perioda': august vraća ključ
// jula, pa napredak i zamrznuti izbor questova prežive 01.08. netaknuti
// umjesto da ih lijeni reset pobriše.
//
// Ne mijenjati u ključ tipa '2026-07+08': time bi se ključ promijenio ODMAH
// i pojeo napredak koji igrači imaju u julu. Ključ mora ostati '2026-07'.
// Kad iznimka prođe, objekat se prazni (`{}`), ne briše — client/periods.js
// ima identičnu kopiju i oba moraju ostati u koraku.
const MJESECNI_SPOJENI = { '2026-08': '2026-07' }

function monthlyKey(d = new Date()) {
  const { y, m } = bihParts(d)
  const stvarni = `${y}-${pad(m)}`
  return MJESECNI_SPOJENI[stvarni] || stvarni
}

// Trenutak sljedeće ponoći po BiH vremenu (ms) — klijent iz ovoga crta odbrojavanje.
function nextDailyResetAt(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const midnightCivil = Date.UTC(y, m - 1, day + 1)
  const guess = midnightCivil - bihOffset(d)
  return midnightCivil - bihOffset(new Date(guess))
}

// Sat u srijedu (BiH vrijeme) kad počinje nova sedmica Preživljavanja. Isti
// broj koristi zakazani restart (survivalWeeklyReset) i ključ sedmice — inače
// bi se ljestvica praznila u jednom trenutku, a event otvarao u drugom.
const SURVIVAL_RESET_HOUR = 8

// Ključ sedmice Preživljavanja — sedmica POČINJE SRIJEDOM U 08:00 po BiH
// vremenu. Računa se nad BiH civilnim vremenom pomjerenim 8 sati unazad: sve
// prije srijede u 08:00 tako još pripada prošloj sedmici. Vraća datum
// posljednje srijede, npr. '2026-07-29'.
//
// Ranije je bilo UTC-bazirano (srijeda 00:00 UTC = 02:00 po BiH), pa se
// ljestvica praznila šest sati prije nego što se event uopšte otvori.
// src/utils/periods.js ima identičnu kopiju — putanja leaderboarda mora biti
// ista na obje strane.
function survivalWeekKey(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  const date = new Date(Date.UTC(y, m - 1, day, hh - SURVIVAL_RESET_HOUR))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 3 + 7) % 7)) // srijeda = 3
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Trenutak sljedeće srijede u 08:00 po BiH vremenu (ms epoch). Dva prolaza zbog
// prelaska na ljetno/zimsko vrijeme — drugi prolaz koristi offset koji vrijedi
// u samom trenutku reseta (isti postupak kao nextDailyResetAt).
function nextSurvivalResetAt(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  let dana = (3 - new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 7) % 7
  if (dana === 0 && hh >= SURVIVAL_RESET_HOUR) dana = 7 // danas je srijeda, ali je 08:00 prošlo
  const civil = Date.UTC(y, m - 1, day + dana, SURVIVAL_RESET_HOUR)
  const guess = civil - bihOffset(d)
  return civil - bihOffset(new Date(guess))
}

// Prozor eventa za sedmicu kojoj pripada dati trenutak: od srijede 08:00 do
// sljedeće srijede 08:00. Početak se računa istom funkcijom (ne kao kraj minus
// 7 dana) da prelazak na ljetno/zimsko vrijeme ne pomjeri sat otvaranja.
function survivalWindowFor(d = new Date()) {
  const closeAt = nextSurvivalResetAt(d)
  return { openAt: nextSurvivalResetAt(new Date(closeAt - 8 * 86400000)), closeAt }
}

// Dnevni streak — niz uzastopnih dana igranja (UTC dan). profile.streak raste
// za 1 ako je zadnji dan igranja bio juče, resetuje na 1 ako je bio prekid.
function utcDayKey(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
async function bumpStreak(uid) {
  const today = utcDayKey()
  const yesterday = utcDayKey(new Date(Date.now() - 86400000))
  const uRef = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const s = await tx.get(uRef)
    if (!s.exists) return
    const p = s.data()
    if (p.lastPlayDay === today) return // već zabilježeno danas

    if (p.lastPlayDay === yesterday) {
      tx.update(uRef, { streak: (p.streak || 0) + 1, lastPlayDay: today })
      return
    }

    // Preskočen dan: zaštita streaka (žeton iz kovčega) pokriva prekid i niz se
    // NASTAVLJA. Žeton stoji na profilu neograničeno i troši se tek ovdje —
    // tačno u trenutku kad bi niz inače pao na nulu.
    const zastita = p.rewards?.streakFreeze || 0
    if (p.lastPlayDay && zastita > 0 && (p.streak || 0) > 0) {
      tx.update(uRef, {
        streak: (p.streak || 0) + 1,
        lastPlayDay: today,
        'rewards.streakFreeze': zastita - 1,
        streakFreezeUsedAt: today, // klijent na osnovu ovoga javi šta se desilo
      })
      return
    }

    tx.update(uRef, { streak: 1, lastPlayDay: today })
  })
}

function periodKey(type) {
  if (type === 'daily') return dailyKey()
  if (type === 'weekly') return weeklyKey()
  return monthlyKey()
}

// ---------------------------------------------------------------------------
// Brojači questova — jedno mjesto za sve metrike, za sva tri perioda
// ---------------------------------------------------------------------------
// Metrike koje questovi mogu koristiti (vidi scripts/postavi-taskove.js):
//   quizzes         odigrani kvizovi
//   correct         tačni odgovori u kvizovima (byCategory: po kategoriji)
//   xp              XP osvojen kvizovima (već ograničen dnevnim capom)
//   days            broj različitih dana u periodu s odigranim kvizom
//   perfect         kvizovi bez ijedne greške
//   survivalCorrect tačni odgovori u Preživljavanju
//   survivalBest    najduži niz u Preživljavanju u periodu (maksimum, ne zbir)
//   duels           odigrani duel mečevi
//   tournamentXp    XP osvojen tokom prozora vikend turnira
//   manual          VANJSKI zadatak — igrica ga ne može izmjeriti, vrijednost
//                   upisuje admin (adminSetQuestProgress). Stoji po questu u
//                   `manual: { [taskId]: broj }`, ne kao jedan brojač: dva
//                   ručna questa u istom periodu moraju biti nezavisna.
function emptyProgress(period) {
  return {
    period,
    quizzes: 0,
    correct: 0,
    xp: 0,
    days: 0,
    lastDay: null,
    perfect: 0,
    survivalCorrect: 0,
    survivalBest: 0,
    duels: 0,
    tournamentXp: 0,
    byCategory: {},
    manual: {},
    claimed: {},
    picked: null,
  }
}

// Novi taskProgress objekt s primijenjenim uvećanjima ("lijeni reset" po ključu
// perioda). delta.day (BiH dan) uvećava 'days' samo ako je dan nov za taj period.
function bumpProgress(profile, delta) {
  const out = {}
  for (const type of ['daily', 'weekly', 'monthly']) {
    const key = periodKey(type)
    const stored = profile.taskProgress?.[type]
    const fresh = !stored || stored.period !== key
    const p = fresh ? emptyProgress(key) : { ...emptyProgress(key), ...stored, period: key }

    const byCategory = { ...(p.byCategory || {}) }
    for (const [cat, n] of Object.entries(delta.byCategory || {})) {
      byCategory[cat] = (byCategory[cat] || 0) + n
    }
    const newDay = delta.day && delta.day !== p.lastDay

    out[type] = {
      ...p,
      quizzes: (p.quizzes || 0) + (delta.quizzes || 0),
      correct: (p.correct || 0) + (delta.correct || 0),
      xp: (p.xp || 0) + (delta.xp || 0),
      perfect: (p.perfect || 0) + (delta.perfect || 0),
      survivalCorrect: (p.survivalCorrect || 0) + (delta.survivalCorrect || 0),
      survivalBest: Math.max(p.survivalBest || 0, delta.survivalBest || 0),
      duels: (p.duels || 0) + (delta.duels || 0),
      tournamentXp: (p.tournamentXp || 0) + (delta.tournamentXp || 0),
      days: (p.days || 0) + (newDay ? 1 : 0),
      lastDay: newDay ? delta.day : p.lastDay,
      byCategory,
    }
  }
  return out
}

// Zasebna transakcija kad uvećanje ne ide uz neki drugi upis (survival, duel).
async function applyProgress(uid, delta) {
  const userRef = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) return
    tx.update(userRef, { taskProgress: bumpProgress(snap.data(), delta) })
  })
}

// ---------------------------------------------------------------------------
// Rotacija questova — svaki igrač dobije dio bazena, ne cijeli bazen
// ---------------------------------------------------------------------------
// Izbor je determinističan po (uid, period) i ZAMRZNE se u users/{uid}
// .taskProgress.{tip}.picked, pa se ne mijenja tokom perioda. Ako je za igrača
// aktivan neki event (Preživljavanje / turnir), tačno jedan zadatak je vezan za
// taj event. Igrač koji je ispao iz Preživljavanja NE dobija survival zadatak —
// a ako ispadne usred dana, dnevni zadatak mu se zamijeni običnim.
//
// Od 30.07.2026. isto važi i za SEDMIČNE i MJESEČNE questove. Ranije je igrač
// dobijao sve odreda, pa žeton "zamjena questa" tamo nije imao šta ponuditi —
// igrač je već imao svaki quest. Izborom se dobija i prostor za odluku: koji
// zadatak mi se isplati, a koji mijenjam.
//
// Od 31.07.2026.: 5 / 6 / 7 (bilo 3 / 5 / 4). Sama pravila izbora (uključujući
// "uvijek prisutne" vanjske zadatke) su u functions/quest-izbor.js i testiraju
// se s `npm run test-questovi` — TASK_COUNT se uvozi odande da broj ne bi
// postojao na dva mjesta.

// Žeton kojim se mijenja quest tog tipa. Svaki tip ima svoj — sedmični i
// mjesečni su rjeđi u kovčezima jer nose veće nagrade.
const REROLL_KIND = {
  daily: 'questReroll',
  weekly: 'questRerollWeekly',
  monthly: 'questRerollMonthly',
}

let tasksCache = null
let tasksCacheAt = 0
async function getActiveTasks() {
  if (tasksCache && Date.now() - tasksCacheAt < CONTENT_TTL) return tasksCache
  const snap = await db.collection('tasks').where('active', '==', true).get()
  tasksCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  tasksCacheAt = Date.now()
  return tasksCache
}

// Koji su eventi ovog trenutka "živi" za konkretnog igrača.
async function activeEventsFor(uid) {
  const events = []
  // Preživljavanje: prozor otvoren I igrač nije ispao u tekućoj sedmici.
  if (!(await survivalWindowClosed())) {
    const runSnap = await db.doc(`survivalRuns/${uid}`).get()
    const run = runSnap.exists ? runSnap.data() : null
    const eliminated = run && run.week === survivalWeekKey() && run.active === false
    if (!eliminated) events.push('survival')
  }
  // Questovi tipa "osvoji XP tokom eventa" prate prozor XP TRKE, jer se mjere
  // metrikom tournamentXp koju puni addWeekendXp.
  if (xpRacePoTeku(await getXpRaceConfig())) events.push('tournament')
  return events
}

// Status eventa se ogleda i na profilu (users/{uid}.eventStatus) — klijent je
// već pretplaćen na profil, pa zna da li je igrač još u igri bez ijednog
// dodatnog čitanja. survivalRuns klijent po pravilima ne smije čitati.
async function setEventStatus(uid, patch) {
  const updates = {}
  for (const [k, v] of Object.entries(patch)) updates[`eventStatus.${k}`] = v
  // Uz survival ide i sedmica na koju se odnosi. Bez nje klijent ne može
  // razlikovati "ispao ove sedmice" od "ispao prošle sedmice" — a prošla
  // sedmica ne smije gasiti signal u novoj (vidi useArenaAlert).
  if ('survival' in patch) updates['eventStatus.survivalWeek'] = survivalWeekKey()
  await db.doc(`users/${uid}`).update(updates).catch(() => {})
}

// Vrati (i po potrebi zamrzni) izbor questova jednog tipa za igrača.
async function ensurePicksZaTip(uid, type, pool, events) {
  const period = periodKey(type)
  const userRef = db.doc(`users/${uid}`)
  const snap = await userRef.get()
  if (!snap.exists) return []

  const existing = snap.data().taskProgress?.[type]
  if (existing?.period === period && Array.isArray(existing.picked) && existing.picked.length > 0) {
    // Izbor je zamrznut, ali ga treba DOPUNITI ako je u međuvremenu porastao
    // TASK_COUNT ili je dodan novi stalni quest (31.07.2026: 3/5/4 → 5/6/7 plus
    // tri EPC zadatka). Bez ovoga bi igrači nove zadatke vidjeli tek na sljedeći
    // period — mjesečni tek 01.09. Dopuna samo dodaje, nikad ne uklanja.
    const dopunjen = dopuniIzbor(existing.picked, pool, uid, type, period)
    if (!dopunjen) return existing.picked
    await userRef
      .update({ [`taskProgress.${type}.picked`]: dopunjen })
      .catch(() => {}) // paralelni poziv je već dopunio — svejedno je, lista je ista
    return dopunjen
  }

  const picked = pickTaskIds(pool, uid, type, period, events)
  let final = picked
  await db.runTransaction(async (tx) => {
    const s = await tx.get(userRef)
    if (!s.exists) return
    const cur = s.data().taskProgress?.[type]
    if (cur?.period === period && Array.isArray(cur.picked) && cur.picked.length > 0) {
      final = cur.picked
      return
    }
    // Zatečeni napredak se NE oduzima: u izbor ulaze i questovi koje je igrač
    // u OVOM periodu već preuzeo ili ispunio (vidi zasluzeni() u quest-izbor.js).
    // Iz prošlog perioda se ne prenosi ništa — to je bila greška zbog koje je
    // dnevnih questova svaki dan bilo sve više.
    const izOvogPerioda = cur?.period === period
    const spojeno = [...new Set([...picked, ...zasluzeniUPeriodu(pool, type, cur, period)])]
    final = spojeno
    const base = izOvogPerioda ? { ...emptyProgress(period), ...cur } : emptyProgress(period)
    tx.update(userRef, { [`taskProgress.${type}`]: { ...base, period, picked: spojeno } })
  })
  return final
}

// Zamrzni izbor za sva tri perioda i osvježi status eventa.
async function ensureDailyPicks(uid) {
  const userRef = db.doc(`users/${uid}`)
  const snap = await userRef.get()
  if (!snap.exists) return { daily: [], weekly: [], monthly: [] }

  // Status eventa se osvježava pri SVAKOM pozivu, ne samo kad se pravi novi
  // izbor questova. Ranije je stajao ispod ranog izlaza, pa je bio dnevni
  // snimak: ko je otvorio aplikaciju prije nego se prozor eventa otvori,
  // ostajao je na `false` do sutra iako je u međuvremenu smio igrati.
  const events = await activeEventsFor(uid)
  await setEventStatus(uid, {
    survival: events.includes('survival'),
    tournament: events.includes('tournament'),
  })

  // Questovi s `odDatuma` u budućnosti se ne nude — ni u izboru ni u dopuni.
  const pool = ponuda(await getActiveTasks(), dailyKey())
  return {
    daily: await ensurePicksZaTip(uid, 'daily', pool, events),
    weekly: await ensurePicksZaTip(uid, 'weekly', pool, events),
    monthly: await ensurePicksZaTip(uid, 'monthly', pool, events),
  }
}

// Igrač je ispao iz eventa usred dana → nezavršeni event-quest zamijeni običnim,
// da mu do ponoći ne stoji zadatak koji više ne može ispuniti.
async function dropEventPicks(uid, event) {
  const pool = await getActiveTasks()
  const byId = new Map(pool.map((t) => [t.id, t]))
  const day = dailyKey()
  const userRef = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) return
    const d = snap.data().taskProgress?.daily
    if (!d || d.period !== day || !Array.isArray(d.picked)) return
    const stale = d.picked.filter((id) => byId.get(id)?.event === event && !d.claimed?.[id])
    if (stale.length === 0) return
    const free = pool.filter((t) => t.type === 'daily' && !t.event && !d.picked.includes(t.id))
    const replacements = seededPick(free, stale.length, seedFrom(`${uid}|${day}|${event}`))
    const picked = [
      ...d.picked.filter((id) => !stale.includes(id)),
      ...replacements.map((t) => t.id),
    ]
    tx.update(userRef, { 'taskProgress.daily.picked': picked })
  })
}

// Klijent zove pri otvaranju Questova/Home-a ako izbor još ne postoji.
// Ime je historijsko — od 30.07.2026. zamrzava i sedmični i mjesečni izbor.
export const ensureDailyQuests = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const izbor = await ensureDailyPicks(uid)
  return {
    picked: izbor.daily, // stariji klijenti čitaju samo ovo polje
    pickedWeekly: izbor.weekly,
    pickedMonthly: izbor.monthly,
    day: dailyKey(),
    resetsAt: nextDailyResetAt(),
  }
})

// ---------------------------------------------------------------------------
// Pomoćne funkcije: leveli (kriva iz config/levels, keširana)
// ---------------------------------------------------------------------------
let levelConfigCache = null

async function getLevelConfig() {
  if (levelConfigCache) return levelConfigCache
  const snap = await db.doc('config/levels').get()
  levelConfigCache = { baseXp: 100, stepXp: 25, maxLevel: 100, ...(snap.exists ? snap.data() : {}) }
  return levelConfigCache
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

// Bonus XP na svaki 10. level: lvl 10 → +100, 20 → +200 ... 100 → +1000.
// Dodjeljuje se jednokratno po pragu (users.levelRewardMilestone pamti zadnji).
// Bonus može podići level i otključati sljedeći prag, pa ide u petlji.
async function awardLevelMilestones(uid) {
  const cfg = await getLevelConfig()
  const userRef = db.doc(`users/${uid}`)
  let bonusXp = 0
  const milestones = []
  let totalXp = 0
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) return
    const p = snap.data()
    let xp = p.xp || 0
    let last = p.levelRewardMilestone || 0
    for (let guard = 0; guard < 20; guard++) {
      const level = levelFromXp(xp, cfg)
      const next = last + 10
      if (next > level || next > cfg.maxLevel) break
      const reward = (next / 10) * 100
      xp += reward
      bonusXp += reward
      milestones.push(next)
      last = next
    }
    totalXp = xp
    if (bonusXp > 0) tx.update(userRef, { xp, levelRewardMilestone: last })
  })
  return { bonusXp, milestones, totalXp }
}

// ---------------------------------------------------------------------------
// Pomoćne funkcije: bedževi (achievements) — definicije u Firestore 'badges'
// ---------------------------------------------------------------------------
let badgeConfigCache = null

async function getBadgeConfig() {
  if (badgeConfigCache) return badgeConfigCache
  const snap = await db.collection('badges').where('active', '==', true).get()
  badgeConfigCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return badgeConfigCache
}

// Kumulativne metrike profila na koje se vežu bedževi (vidi scripts/postavi-bedzeve.js).
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

// Provjeri uslove svih bedževa i dodijeli nove. Čita svjež profil (poslije glavne
// transakcije) da metrike budu ažurne. Klijent bedževe NIKAD ne upisuje sam.
// Vraća listu NOVODODIJELJENIH bedževa (za animaciju na klijentu): [{ id, emoji, name, description }].
async function awardBadges(uid) {
  const defs = await getBadgeConfig()
  if (defs.length === 0) return []
  const userRef = db.doc(`users/${uid}`)
  const snap = await userRef.get()
  if (!snap.exists) return []
  const profile = snap.data()
  const cfg = await getLevelConfig()
  const m = profileMetrics(profile, cfg)
  const earned = profile.badges || {}
  const updates = {}
  const newlyEarned = []
  for (const b of defs) {
    if (earned[b.id]) continue
    if ((m[b.metric] || 0) >= b.goal) {
      updates[`badges.${b.id}`] = FieldValue.serverTimestamp()
      newlyEarned.push({ id: b.id, emoji: b.emoji, name: b.name, description: b.description || '' })
    }
  }
  if (Object.keys(updates).length > 0) await userRef.update(updates)
  return newlyEarned
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Kozmetika: okviri avatara (Etapa 9)
// Okvir ne nosi NIJEDAN XP niti ijednu prednost u igri — čist status. Dodjeljuje
// ga isključivo server; klijent iz osvojenih bira samo koji nosi (cosmetics.frame).
// Katalog id-eva živi u src/data/cosmetics.js — ovdje se id-evi samo sastavljaju.
// ---------------------------------------------------------------------------
const SURVIVAL_FRAME_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
const DUEL_WIN_FRAMES = [
  { wins: 25, id: 'dl-win25' },
  { wins: 10, id: 'dl-win10' },
  { wins: 5, id: 'dl-win5' },
  { wins: 1, id: 'dl-win1' },
]
const XP_RACE_SCORE_FRAMES = [
  { xp: 2000, id: 'xp-2000' },
  { xp: 1000, id: 'xp-1000' },
  { xp: 500, id: 'xp-500' },
]

// Dodaje okvire u cosmetics.owned, bez duplikata. Vraća SAMO stvarno nove —
// klijent na osnovu toga može javiti igraču da je nešto otključao.
async function awardCosmetics(uid, ids) {
  const trazeni = (ids || []).filter(Boolean)
  if (trazeni.length === 0) return []
  const ref = db.doc(`users/${uid}`)
  let dodani = []
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return
    const owned = s.data().cosmetics?.owned || []
    dodani = trazeni.filter((id) => !owned.includes(id))
    if (dodani.length === 0) return
    tx.update(ref, { 'cosmetics.owned': [...owned, ...dodani] })
  })
  return dodani
}

// Brojači koji se ne daju izvesti iz jednog eventa (ukupne pobjede u duelima,
// broj osvojenih turnira i trka). Drže se na profilu pod cosmeticStats.
async function bumpCosmeticStat(uid, field, by = 1) {
  const ref = db.doc(`users/${uid}`)
  let value = 0
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return
    value = (s.data().cosmeticStats?.[field] || 0) + by
    tx.update(ref, { [`cosmeticStats.${field}`]: value })
  })
  return value
}

// Pomoćne funkcije: leaderboard (RTDB)
// ---------------------------------------------------------------------------

// Igrači skriveni s ljestvica (users/{uid}.hideFromBoards). Služi test/admin
// nalozima: XP im se i dalje normalno sabira, jer bez toga ne mogu testirati
// ništa što ovisi o levelu — samo ih niko ne vidi u poretku.
// Pokriva sva četiri poretka: globalni, sedmični, XP trka i Preživljavanje.
function isHidden(profile) {
  return profile?.hideFromBoards === true
}

// Uklanja igrača sa SVIH ljestvica — zove se kad se skrivanje uključi, da
// zatečeni unosi ne ostanu visjeti do sljedećeg upisa.
async function purgeFromBoards(uid) {
  const updates = { [`leaderboard/global/${uid}`]: null }
  updates[`leaderboard/weekly/${weeklyKey()}/${uid}`] = null
  updates[`survival/${survivalWeekKey()}/${uid}`] = null
  const cfg = await getXpRaceConfig()
  if (cfg?.key) updates[`tournament/${cfg.key}/${uid}`] = null
  await rtdb.ref().update(updates)
}

// NAPOMENA: polja koja se ovdje koriste odlučuju kada syncProfileToLeaderboard
// smije preskočiti upis. Dodaš li polje ovdje, dodaj ga i u filter tamo.
function leaderboardEntry(profile, level) {
  return {
    name: profile.displayName || 'Farmaceut',
    avatar: profile.avatar || 'a1',
    level,
    streak: profile.streak || 0,
  }
}

async function syncLeaderboard(uid, profile, totalXp, weeklyDelta, level) {
  if (isHidden(profile)) return
  const updates = {}
  updates[`leaderboard/global/${uid}`] = { ...leaderboardEntry(profile, level), xp: totalXp }
  await rtdb.ref().update(updates)
  if (weeklyDelta > 0) {
    const ref = rtdb.ref(`leaderboard/weekly/${weeklyKey()}/${uid}`)
    await ref.transaction((entry) => ({
      ...leaderboardEntry(profile, level),
      xp: (entry?.xp || 0) + weeklyDelta,
    }))
  }
}

// Javna polja pitanja (tačan odgovor i objašnjenje NIKAD ne idu klijentu ovdje).
function publicQuestion(id, data, index, seconds = QUESTION_SECONDS) {
  return {
    index,
    id,
    text: data.text,
    options: data.options,
    category: data.category,
    points: data.points,
    seconds,
  }
}

// ---------------------------------------------------------------------------
// Keš sadržaja (u memoriji instance) — ključno za smanjenje Firestore reads.
//
// Izbor pitanja treba SAMO metapodatke (id, points, category), a ne tekst i
// opcije. Zato metapodaci svih aktivnih pitanja stoje u JEDNOM dokumentu
// bank/index: { version, count, items: [{id, points, category}] }.
// Cijena starta kviza / survival koraka je time 1 čitanje umjesto onoliko
// koliko banka ima pitanja (642 na 26.07.2026, i raste sa svakim poglavljem).
//
// Tijela pitanja (tekst + opcije) se dovlače LIJENO, po id-u, samo za pitanje
// koje se stvarno servira, i keširaju se vezano za `version` indeksa — ne po
// vremenu. Dok se banka ne promijeni, isto pitanje se čita najviše jednom po
// instanci; kad admin nešto snimi, version se promijeni i keš tijela pada.
//
// Indeks se osvježi najviše jednom u CONTENT_TTL po instanci, pa se admin
// izmjene i dalje vide u roku od 10 minuta — isto kao ranije.
// ---------------------------------------------------------------------------
const CONTENT_TTL = 10 * 60 * 1000 // 10 min
const BANK_INDEX_DOC = 'bank/index'

let bankIndex = null // { version, items }
let bankIndexAt = 0
const questionBodies = new Map() // id -> puni dokument pitanja (ili null ako ga nema)

// Metapodaci svih aktivnih pitanja. Vraća listu { id, points, category }.
async function getActiveQuestions() {
  if (bankIndex && Date.now() - bankIndexAt < CONTENT_TTL) return bankIndex.items

  const snap = await db.doc(BANK_INDEX_DOC).get()
  const data = snap.exists ? snap.data() : null

  if (data && Array.isArray(data.items) && data.items.length > 0) {
    // Banka se promijenila od zadnjeg čitanja → tijela u kešu su možda stara.
    if (bankIndex && bankIndex.version !== data.version) questionBodies.clear()
    bankIndex = { version: data.version ?? null, items: data.items }
    bankIndexAt = Date.now()
    return bankIndex.items
  }

  // Indeks još nije izgrađen (prvi deploy prije uvoza, ili neuspio rebuild) →
  // stari puni scan, da igra radi i bez njega. Scan je ionako povukao cijele
  // dokumente, pa usput napuni i keš tijela.
  const qs = await db.collection('questions').where('active', '==', true).get()
  questionBodies.clear()
  const items = qs.docs.map((d) => {
    const q = d.data()
    questionBodies.set(d.id, { id: d.id, ...q })
    return { id: d.id, points: q.points, category: q.category }
  })
  bankIndex = { version: null, items }
  bankIndexAt = Date.now()
  return items
}

// Puni dokument pitanja. Vraća null ako pitanje ne postoji ili nije aktivno —
// isto kao ranije, kad se tražilo u listi aktivnih.
async function getQuestionById(id) {
  if (questionBodies.has(id)) return questionBodies.get(id)
  const snap = await db.doc(`questions/${id}`).get()
  const data = snap.exists ? snap.data() : null
  const q = data && data.active === true ? { id, ...data } : null
  questionBodies.set(id, q) // keširaj i promašaj — da se ne čita opet
  return q
}

// Ponovna izgradnja bank/index iz kolekcije questions. Jedini pisac indeksa na
// serveru; skripta za uvoz radi isto (scripts/import-questions.js).
async function rebuildBankIndex() {
  const snap = await db.collection('questions').where('active', '==', true).get()
  const items = snap.docs.map((d) => ({
    id: d.id,
    points: d.data().points,
    category: d.data().category,
  }))
  await db.doc(BANK_INDEX_DOC).set({
    version: Date.now(), // svaka izmjena obara keš tijela na instancama
    count: items.length,
    items,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return items.length
}

// Tajni odgovori — keširani po id-u (TTL). questionSecrets/{id} ili fallback
// na staro polje u questions/{id} (prelazni period).
const secretsCache = new Map()
let secretsCacheAt = 0
async function getSecret(questionId) {
  if (Date.now() - secretsCacheAt > CONTENT_TTL) {
    secretsCache.clear()
    secretsCacheAt = Date.now()
  }
  if (secretsCache.has(questionId)) return secretsCache.get(questionId)
  let result
  const secretSnap = await db.doc(`questionSecrets/${questionId}`).get()
  if (secretSnap.exists) {
    result = secretSnap.data()
  } else {
    const qSnap = await db.doc(`questions/${questionId}`).get()
    const data = qSnap.exists ? qSnap.data() : {}
    if (typeof data.correctIndex !== 'number') {
      throw new HttpsError('internal', 'Pitanje nema definisan tačan odgovor.')
    }
    result = { correctIndex: data.correctIndex, explanation: data.explanation || '' }
  }
  secretsCache.set(questionId, result)
  return result
}

// ---------------------------------------------------------------------------
// startQuiz — server bira nasumičnih 10 pitanja i otvara sesiju
// Pokušaji rade kao ENERGIJA: najviše 3 odjednom, novi dan puni na 3, i po
// jedan se regeneriše svaka 4 sata. Stanje je u users/{uid}.quizLimit
// { day, energy, regenAt, xp, sessionId }. Troši se ZAPOČETI kviz — inače bi se
// odustajanjem moglo "rerollati" do lakših pitanja. Zato nedovršena sesija
// istog dana ne troši novi pokušaj nego se nastavlja.
// ---------------------------------------------------------------------------
function quizEnergyState(profile, day = dailyKey(), now = Date.now()) {
  const l = profile?.quizLimit
  // Novi dan (ili prvi put) — pun spremnik, bez tajmera.
  if (!l || l.day !== day) {
    return { day, energy: QUIZ_ENERGY_MAX, regenAt: null, xp: 0, sessionId: null }
  }
  // Zatečeni profili nemaju `energy`, nego `started` — izvedi da migracija ne
  // pokloni nikome pokušaje koje je već potrošio danas.
  let energy = l.energy ?? Math.max(0, QUIZ_ENERGY_MAX - (l.started || 0))
  energy = Math.min(QUIZ_ENERGY_MAX, Math.max(0, energy))
  let regenAt = l.regenAt || null
  // Spremnik nije pun a tajmer ne postoji → zapis je od PRIJE uvođenja
  // energije. Bez sidra bi takav igrač ostao zaključan do ponoći: energija 0,
  // a regeneracija nikad ne kreće jer je pokreće tek trošenje pokušaja.
  // Sidro je početak današnjeg dana — fiksno, pa odbrojavanje ne skače
  // pri svakom čitanju.
  if (!regenAt && energy < QUIZ_ENERGY_MAX) {
    regenAt = nextDailyResetAt() - 86400000 + QUIZ_REGEN_MS
  }
  // Nadoknadi SVE pragove koji su prošli otkad je stanje zadnji put gledano —
  // igrač koji se vrati poslije 12 sati dobija tri, ne jedan.
  while (regenAt && energy < QUIZ_ENERGY_MAX && now >= regenAt) {
    energy++
    regenAt += QUIZ_REGEN_MS
  }
  if (energy >= QUIZ_ENERGY_MAX) regenAt = null // pun spremnik ne broji vrijeme
  return { day, energy, regenAt, xp: l.xp || 0, sessionId: l.sessionId || null }
}

// Trošenje jednog pokušaja. Tajmer regeneracije kreće tek kad spremnik nije
// pun; ako već ide, ne dira se (inače bi svaki kviz odgađao regeneraciju).
function spendQuizEnergy(state, now = Date.now()) {
  const energy = Math.max(0, state.energy - 1)
  return { ...state, energy, regenAt: state.regenAt || now + QUIZ_REGEN_MS }
}

// ---------------------------------------------------------------------------
// Nagrada za redovnost: petkom 2× XP iz kviza
// ---------------------------------------------------------------------------
// Uslov: igrač je igrao kviz SVAKOG dana od ponedjeljka do petka, uključujući
// današnji. Broji se `taskProgress.weekly.days` — broj različitih dana s
// odigranim kvizom u tekućoj sedmici (sedmica po BiH vremenu počinje
// ponedjeljkom). Današnji dan se dodaje ovdje jer se `days` uvećava tek u
// bumpProgress, u istoj transakciji.
//
// NAMJERNO se ne koristi `profile.streak`: on broji i Preživljavanje, a
// zaštita streaka (žeton) ga održava i preko preskočenog dana — pa bi bonus
// dobio i onaj ko nije igrao svaki dan. Ovdje se traži stvarno odigrano.
const PETAK = 5

function petakBonusVazi(profile, day = dailyKey(), d = new Date()) {
  const { y, m, d: dan } = bihParts(d)
  const dow = new Date(Date.UTC(y, m - 1, dan)).getUTCDay() || 7 // pon=1 … ned=7
  if (dow !== PETAK) return false

  const w = profile?.taskProgress?.weekly
  const sedmica = periodKey('weekly')
  const daniDosad = w?.period === sedmica ? w.days || 0 : 0
  const danasNov = (w?.period === sedmica ? w.lastDay : null) !== day
  return daniDosad + (danasNov ? 1 : 0) >= PETAK
}

export const startQuiz = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se za igranje kviza.')

  const day = dailyKey()
  const userRef = db.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
  const limit = quizEnergyState(userSnap.data(), day)
  // Galenski Laboratorij: +1 s po nivou. Trajanje se ZAMRZAVA u sesiju — ako
  // klan nadogradi objekat usred kviza, tajmer se ne smije promijeniti između
  // dva pitanja, a server mora provjeravati isto trajanje koje je klijent dobio.
  const bonKlan = await bonusiIgraca(uid)
  const qSeconds = QUESTION_SECONDS + (bonKlan.sekunde || 0)
  const limitInfo = {
    used: QUIZ_ENERGY_MAX - limit.energy,
    limit: QUIZ_ENERGY_MAX,
    energy: limit.energy,
    regenAt: limit.regenAt,
    xpToday: limit.xp,
    xpCap: DAILY_QUIZ_XP_CAP,
    resetsAt: nextDailyResetAt(),
    hintovi: bonKlan.hintovi || 0,
  }

  // Nedovršena sesija od danas → nastavi je (osvježen tajmer, isti pokušaj).
  if (limit.sessionId) {
    const sSnap = await db.doc(`quizSessions/${limit.sessionId}`).get()
    if (sSnap.exists && !sSnap.data().finished) {
      const s = sSnap.data()
      const meta = s.questions[s.current]
      const qData = meta ? await getQuestionById(meta.id) : null
      if (qData) {
        await sSnap.ref.update({ askedAt: Date.now() })
        return {
          sessionId: limit.sessionId,
          total: s.questions.length,
          resumed: true,
          ...limitInfo,
          question: publicQuestion(meta.id, qData, s.current, s.qSeconds || QUESTION_SECONDS),
        }
      }
    }
  }

  if (limit.energy <= 0) return { limited: true, ...limitInfo }

  const pool = await getActiveQuestions()
  if (pool.length === 0) throw new HttpsError('failed-precondition', 'Banka pitanja je prazna.')

  // Fisher-Yates shuffle (kopije) pa uzmi prvih N.
  const all = [...pool]
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  const chosen = all.slice(0, QUESTIONS_PER_QUIZ)

  // Tekst prvog pitanja se dovlači PRIJE trošenja energije — da promašaj u
  // banci ne pojede pokušaj.
  const firstData = await getQuestionById(chosen[0].id)
  if (!firstData) throw new HttpsError('internal', 'Pitanje nije dostupno, pokušaj ponovo.')

  const session = {
    uid,
    questions: chosen.map((q) => ({ id: q.id, points: q.points, category: q.category })),
    answers: [],
    current: 0,
    finished: false,
    askedAt: Date.now(),
    qSeconds,
    xpBonus: bonKlan.xpBonus || 0, // Logistički Centar, zamrznut za ovu sesiju
    comboBonus: bonKlan.comboBonus || 0, // Dječija Apoteka
    startedAt: FieldValue.serverTimestamp(),
  }
  // Trošenje pokušaja ide transakcijom — dva paralelna starta ne smiju proći.
  // Sesija se upisuje tek kad je pokušaj rezervisan, da race ne ostavi siroče.
  const ref = db.collection('quizSessions').doc()
  let poslije = limit
  await db.runTransaction(async (tx) => {
    const s = await tx.get(userRef)
    if (!s.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const cur = quizEnergyState(s.data(), day)
    if (cur.energy <= 0) {
      throw new HttpsError('resource-exhausted', 'Nemaš više pokušaja za kviz.')
    }
    poslije = spendQuizEnergy(cur)
    tx.update(userRef, { quizLimit: { ...poslije, sessionId: ref.id } })
  })
  await ref.set(session)

  return {
    sessionId: ref.id,
    total: chosen.length,
    ...limitInfo,
    used: QUIZ_ENERGY_MAX - poslije.energy,
    energy: poslije.energy,
    regenAt: poslije.regenAt,
    question: publicQuestion(chosen[0].id, firstData, 0, qSeconds),
  }
})

// ---------------------------------------------------------------------------
// submitAnswer — server provjerava odgovor; na zadnjem pitanju upisuje sve
// ---------------------------------------------------------------------------
export const submitAnswer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se za igranje kviza.')

  const { sessionId, answerIndex } = request.data || {}
  if (typeof sessionId !== 'string') throw new HttpsError('invalid-argument', 'Nedostaje sessionId.')
  const answer =
    Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3 ? answerIndex : null

  const sessionRef = db.doc(`quizSessions/${sessionId}`)
  const sessionSnap = await sessionRef.get()
  if (!sessionSnap.exists) throw new HttpsError('not-found', 'Sesija ne postoji.')
  const session = sessionSnap.data()
  if (session.uid !== uid) throw new HttpsError('permission-denied', 'Ovo nije tvoja sesija.')
  if (session.finished) throw new HttpsError('failed-precondition', 'Kviz je već završen.')

  // Server-side tajmer: zakašnjeli odgovor se računa kao neodgovoren.
  // Trajanje dolazi IZ SESIJE (Galenski Laboratorij ga produžava), ne iz
  // konstante — inače bi server odbijao odgovore koje je klijentu sam dozvolio.
  //
  // Rok teče od askedAt, a njega od 30.07.2026. postavlja pocniPitanje — dakle
  // od trenutka kad pitanje STVARNO stane pred igrača. Ranije se postavljao ovdje,
  // pri ocjeni PRETHODNOG pitanja, pa je vrijeme čitanja objašnjenja jelo rok
  // sljedećeg pitanja i tačni odgovori su poništavani s 5 sekundi na tajmeru.
  const qSeconds = session.qSeconds || QUESTION_SECONDS
  const elapsed = (Date.now() - session.askedAt) / 1000
  const effective = elapsed > qSeconds + GRACE_SECONDS ? null : answer
  // Igrač je odgovorio, ali je odgovor poništen kao zakašnjeli. Klijent to MORA
  // znati: bez ovoga je prikazivao "✗ Netačno." (jer njegov `selected` nije
  // null), pa je poništenje izgledalo kao da igra ne priznaje tačan odgovor.
  const late = answer !== null && effective === null

  const q = session.questions[session.current]
  const secret = await getSecret(q.id)
  const correct = effective !== null && effective === secret.correctIndex

  const answers = [
    ...session.answers,
    {
      id: q.id,
      category: q.category,
      points: q.points,
      selected: effective,
      correct,
      // Šta je igrač stvarno pritisnuo, prije poništenja. Bez ovoga se izbor
      // nepovratno gubio (effective ga prepiše), pa se prijava igrača nije
      // mogla provjeriti iz baze. Piše se samo kad se razlikuje.
      ...(late ? { selectedRaw: answer, late: true, elapsed: Math.round(elapsed) } : {}),
    },
  ]
  const isLast = session.current + 1 >= session.questions.length

  if (!isLast) {
    const nextMeta = session.questions[session.current + 1]
    const nextData = await getQuestionById(nextMeta.id)
    // askedAt se ovdje postavlja samo kao SIGURNOSNA MREŽA (npr. pocniPitanje ne
    // prođe zbog mreže). Pravi rok postavlja pocniPitanje kad se pitanje iscrta.
    await sessionRef.update({ answers, current: session.current + 1, askedAt: Date.now() })
    return {
      correct,
      late,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: false,
      question: publicQuestion(nextMeta.id, nextData, session.current + 1, qSeconds),
    }
  }

  // Zadnje pitanje → finalizacija: XP, statistika, taskovi, leaderboard.
  //
  // Bonusi Zelenog Okruga se računaju POSLIJE osnovnog zbira, a PRIJE dnevnog
  // capa: klan ne smije moći probiti DAILY_QUIZ_XP_CAP, samo brže do njega doći.
  //   - Logistički Centar: +5% po nivou na cijeli kviz
  //   - Dječija Apoteka: combo, +5% po nivou na svaki tačan od TREĆEG zaredom
  const osnovniXp = answers.reduce((s, a) => s + (a.correct ? a.points : 0), 0)
  let comboXp = 0
  if (session.comboBonus > 0) {
    let niz = 0
    for (const a of answers) {
      if (!a.correct) {
        niz = 0
        continue
      }
      niz++
      if (niz >= COMBO_PRAG) comboXp += a.points * session.comboBonus
    }
  }
  const earnedXp = Math.round(osnovniXp * (1 + (session.xpBonus || 0)) + comboXp)
  const bonusXpKlana = earnedXp - osnovniXp
  const correctCount = answers.filter((a) => a.correct).length
  const correctByCategory = {}
  const xpByCategory = {}
  for (const a of answers) {
    if (!a.correct) continue
    correctByCategory[a.category] = (correctByCategory[a.category] || 0) + 1
    xpByCategory[a.category] = (xpByCategory[a.category] || 0) + a.points
  }

  const userRef = db.doc(`users/${uid}`)
  const cfg = await getLevelConfig()
  const day = dailyKey()
  const perfect = correctCount === answers.length
  let profileAfter, totalXp
  let awardedXp = 0 // XP poslije dnevnog capa — sve dalje računa s ovim
  let xpToday = 0
  let petakDupli = false // je li nagrada za redovnost udvostručila ovaj kviz

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const profile = userSnap.data()

    // Statistika tačnosti po kategorijama.
    const stats = { ...(profile.categoryStats || {}) }
    for (const a of answers) {
      if (!stats[a.category]) stats[a.category] = { correct: 0, total: 0 }
      stats[a.category].total += 1
      if (a.correct) stats[a.category].correct += 1
    }
    const accuracyByCategory = Object.fromEntries(
      Object.entries(stats).map(([cat, s]) => [cat, Math.round((s.correct / s.total) * 100)])
    )

    // Nagrada za redovnost: ko je igrao SVAKI dan od ponedjeljka do petka,
    // petkom mu se XP iz kviza udvostručuje. Uslov se ne čita iz `streak`
    // (on broji i Preživljavanje, i zaštita streaka ga održava kroz preskočen
    // dan) nego iz taskProgress.weekly.days — a to je broj RAZLIČITIH dana s
    // odigranim kvizom u tekućoj sedmici. Sedmica počinje ponedjeljkom, pa je
    // petkom uslov "pet dana", uključujući današnji kviz.
    petakDupli = petakBonusVazi(profile, day)
    const zaUpis = petakDupli ? earnedXp * 2 : earnedXp

    // Dnevni cap se primjenjuje POSLIJE udvostručavanja — strop od
    // DAILY_QUIZ_XP_CAP ostaje isti, samo se do njega stiže duplo brže.
    const limit = quizEnergyState(profile, day)
    awardedXp = Math.min(zaUpis, Math.max(0, DAILY_QUIZ_XP_CAP - limit.xp))
    xpToday = limit.xp + awardedXp

    totalXp = (profile.xp || 0) + awardedXp
    profileAfter = profile
    tx.update(userRef, {
      xp: totalXp,
      quizCount: (profile.quizCount || 0) + 1,
      perfectQuizzes: (profile.perfectQuizzes || 0) + (perfect ? 1 : 0),
      categoryStats: stats,
      accuracyByCategory,
      taskProgress: bumpProgress(profile, {
        quizzes: 1,
        correct: correctCount,
        xp: awardedXp,
        perfect: perfect ? 1 : 0,
        byCategory: correctByCategory,
        day,
      }),
      quizLimit: { ...limit, xp: xpToday, sessionId: null },
      lastQuizAt: FieldValue.serverTimestamp(),
    })
  })

  await sessionRef.update({ answers, finished: true, finishedAt: FieldValue.serverTimestamp() })
  const levelBonus = await awardLevelMilestones(uid) // { bonusXp, milestones, totalXp }
  const finalXp = levelBonus.totalXp || totalXp
  await syncLeaderboard(uid, profileAfter, finalXp, awardedXp, levelFromXp(finalXp, cfg))
  const newBadges = await awardBadges(uid)
  await addWeekendXp(uid, awardedXp)
  // Klanski rat: CP ide s raspodjelom po kategorijama, da srijedni boost zna
  // koliki dio kviza pripada izvučenoj kategoriji.
  //
  // U rat ide OSNOVNI iznos, bez petkovog udvostručavanja: rat petkom i sam
  // množi s 2 (rush), pa bi se inače udvostručilo dvaput i kviz bi petkom
  // nosio 4× CP. Igraču na profil ide pun dupli iznos — samo se u rat šalje
  // polovina, tj. ono što bi zaradio i bez bonusa.
  const xpZaRat = petakDupli ? Math.round(awardedXp / 2) : awardedXp
  const cpRat = await addClanWarCp(uid, xpZaRat, {
    xpPoKategoriji: xpByCategory,
    izvor: 'kviz',
  })
  await bumpStreak(uid)

  return {
    correct,
    late,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: true,
    klan: cpRat ? { cp: cpRat.cp, mnozilac: cpRat.mnoz || 1, strop: !!cpRat.strop } : null,
    bonusXpKlana,
    summary: {
      earnedXp: awardedXp,
      rawXp: petakDupli ? earnedXp * 2 : earnedXp, // bez capa (za poruku na rezultatima)
      capped: awardedXp < (petakDupli ? earnedXp * 2 : earnedXp),
      petakDupli, // klijent prikazuje "2× za redovnost"
      correctCount,
      total: answers.length,
    },
    quizzesToday: QUIZ_ENERGY_MAX - quizEnergyState(profileAfter, day).energy,
    quizLimit: QUIZ_ENERGY_MAX,
    xpToday,
    xpCap: DAILY_QUIZ_XP_CAP,
    resetsAt: nextDailyResetAt(),
    newLevel: levelFromXp(finalXp, cfg),
    levelBonus,
    newBadges,
  }
})

// ---------------------------------------------------------------------------
// pocniPitanje — rok pitanja kreće kad pitanje STANE PRED IGRAČA
// ---------------------------------------------------------------------------
// Greška koju ovo rješava (nađena 30.07.2026.):
//
// submitAnswer je postavljao askedAt sljedećeg pitanja u trenutku kad ocijeni
// PRETHODNO. A klijent sljedeće pitanje iscrta tek kad igrač na ekranu s
// objašnjenjem pritisne "Sljedeće pitanje →". Sve vrijeme čitanja objašnjenja
// je zato teklo iz roka sljedećeg pitanja, a igrač je na svom tajmeru vidio
// pune 30 sekundi. Ko pogriješi pa pažljivo pročita objašnjenje (20+ s), tom
// bi tačan odgovor bio poništen i pri 5 sekundi na tajmeru — a pisalo bi
// "✗ Netačno". U bazi je od 4680 odgovora tako poništeno 168 (3,6 %).
//
// Zato klijent na iscrtavanju pitanja javi "počeo sam" i tek tad rok kreće.
// Zaštita od zloupotrebe: rok se po pitanju smije pomjeriti SAMO JEDNOM
// (pokrenutoZa pamti indeks) i samo za pitanje koje je trenutno u toku. Igrač
// tako ne može dobiti više od qSeconds + GRACE po pitanju — može samo odgoditi
// početak, što je isto što i sporije čitanje objašnjenja.
//
// Poziv je namjerno "best effort": ako padne, ostaje askedAt koji je postavio
// submitAnswer, tj. staro (strože) ponašanje.
export const pocniPitanje = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')

  const { sessionId, index } = request.data || {}
  if (typeof sessionId !== 'string') throw new HttpsError('invalid-argument', 'Nedostaje sessionId.')
  if (!Number.isInteger(index)) throw new HttpsError('invalid-argument', 'Nedostaje index pitanja.')

  const ref = db.doc(`quizSessions/${sessionId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Sesija ne postoji.')
  const session = snap.data()
  if (session.uid !== uid) throw new HttpsError('permission-denied', 'Ovo nije tvoja sesija.')
  if (session.finished) return { pokrenuto: false }

  // Zakašnjeli poziv za pitanje koje je već prošlo NE SMIJE pomjeriti rok
  // tekućeg pitanja (inače bi spori mrežni poziv poklonio dodatno vrijeme).
  if (index !== session.current) return { pokrenuto: false }
  if (session.pokrenutoZa === session.current) return { pokrenuto: false }

  await ref.update({ askedAt: Date.now(), pokrenutoZa: session.current })
  return { pokrenuto: true, seconds: session.qSeconds || QUESTION_SECONDS }
})

// ---------------------------------------------------------------------------
// resumeQuiz — nastavak pitanja poslije pauze (zaključan ekran, poziv, prelazak
// u drugu aplikaciju)
// ---------------------------------------------------------------------------
// Server broji vrijeme od askedAt, a klijentski tajmer stoji dok je aplikacija
// u pozadini. Bez ovoga se igrač vraćao na pitanje kojem je server već istekao
// rok, pa mu je i TAČAN odgovor bio poništen (effective = null). Ovdje se rok
// jednostavno pomjeri na sada i pitanje vrati netaknuto.
//
// Nije nova rupa: startQuiz od ranije radi isto kad se nedovršena sesija
// nastavi (askedAt se osvježi), samo je za to trebalo napustiti i ponovo
// otvoriti ekran kviza. Ovim to radi dugme "Nastavi", bez gubitka odgovora.
export const resumeQuiz = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')

  const { sessionId } = request.data || {}
  if (typeof sessionId !== 'string') throw new HttpsError('invalid-argument', 'Nedostaje sessionId.')

  const ref = db.doc(`quizSessions/${sessionId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Sesija ne postoji.')
  const session = snap.data()
  if (session.uid !== uid) throw new HttpsError('permission-denied', 'Ovo nije tvoja sesija.')
  if (session.finished) throw new HttpsError('failed-precondition', 'Kviz je već završen.')

  const meta = session.questions[session.current]
  const qData = meta ? await getQuestionById(meta.id) : null
  if (!qData) throw new HttpsError('internal', 'Pitanje nije dostupno, pokušaj ponovo.')

  // pokrenutoZa: rok je upravo pomjeren, pa ga pocniPitanje ne treba (ni smije)
  // pomjerati još jednom za isto pitanje.
  await ref.update({
    askedAt: Date.now(),
    pauses: FieldValue.increment(1),
    pokrenutoZa: session.current,
  })
  return {
    total: session.questions.length,
    // qSeconds MORA ići i ovdje: bez njega je publicQuestion vraćao
    // podrazumijevanih 30 s, pa je igrač s Galenskim Laboratorijem poslije
    // pauze gubio svoje dodatne sekunde na prikazu.
    question: publicQuestion(meta.id, qData, session.current, session.qSeconds || QUESTION_SECONDS),
  }
})

// ---------------------------------------------------------------------------
// claimTask — server provjerava uslov i dodjeljuje nagradu
// ---------------------------------------------------------------------------
export const claimTask = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')

  const { taskId } = request.data || {}
  if (typeof taskId !== 'string') throw new HttpsError('invalid-argument', 'Nedostaje taskId.')

  const taskSnap = await db.doc(`tasks/${taskId}`).get()
  if (!taskSnap.exists || !taskSnap.data().active) {
    throw new HttpsError('not-found', 'Task ne postoji.')
  }
  // `id` mora ući u objekat: vrijednostQuesta ga traži za ručne zadatke
  // (napredak im stoji pod ključem questa, ne pod imenom metrike).
  const task = { id: taskId, ...taskSnap.data() }

  // Dnevni questovi se rotiraju — nagradu nosi samo zadatak iz današnjeg izbora.
  if (task.type === 'daily') await ensureDailyPicks(uid)

  const userRef = db.doc(`users/${uid}`)
  const cfg = await getLevelConfig()
  let profileAfter, totalXp, zetoni, zeleni

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const profile = userSnap.data()

    const stored = profile.taskProgress?.[task.type]
    if (!stored || stored.period !== periodKey(task.type)) {
      throw new HttpsError('failed-precondition', 'Task nije ispunjen u ovom periodu.')
    }
    // Izbor se provjerava za sva tri tipa. Kad izbor još nije zamrznut (stariji
    // profil, prvi poziv u periodu), propušta se — inače bi igrač ostao bez
    // nagrade koju je pošteno ispunio dok se izbor tek uvodio.
    const izbor = stored.picked
    if (Array.isArray(izbor) && izbor.length > 0 && !izbor.includes(taskId)) {
      throw new HttpsError('failed-precondition', 'Ovaj quest nije među tvojim zadacima.')
    }
    const value = vrijednostQuesta(stored, task)
    if (value < task.goal) throw new HttpsError('failed-precondition', 'Task još nije ispunjen.')
    if (stored.claimed?.[taskId]) throw new HttpsError('already-exists', 'Nagrada je već preuzeta.')

    totalXp = (profile.xp || 0) + task.reward
    profileAfter = profile

    // Nagrada može biti više od XP-a (vanjski EPC zadaci, od 31.07.2026.):
    //   task.tokens   { quizRefill: 3, survivalRevive: 1, ... } → users.rewards.*
    //   task.clanGold  zeleni bodovi za gradnju Zelenog Okruga → users.clanGold
    // Sve ide u ISTU transakciju kao XP i oznaka preuzimanja — inače bi pad
    // između dva upisa ostavio quest kao preuzet, a žetone neisplaćene.
    const izmjene = {
      xp: totalXp,
      [`taskProgress.${task.type}.claimed.${taskId}`]: true,
    }
    zetoni = {}
    for (const [kind, amount] of Object.entries(task.tokens || {})) {
      const n = Number(amount)
      if (!Number.isFinite(n) || n <= 0) continue
      izmjene[`rewards.${kind}`] = (profile.rewards?.[kind] || 0) + n
      zetoni[kind] = n
    }
    zeleni = Number(task.clanGold) > 0 ? Math.round(Number(task.clanGold)) : 0
    if (zeleni > 0) izmjene.clanGold = (profile.clanGold || 0) + zeleni

    tx.update(userRef, izmjene)
  })

  const levelBonus = await awardLevelMilestones(uid)
  const finalXp = levelBonus.totalXp || totalXp
  await syncLeaderboard(uid, profileAfter, finalXp, task.reward, levelFromXp(finalXp, cfg))
  const newBadges = await awardBadges(uid)
  await addWeekendXp(uid, task.reward)
  // KLANSKI RAT: nagrada za quest NAMJERNO ne nosi CP.
  // U rat ulazi samo XP zarađen kroz dnevni kviz i Preživljavanje — questovi
  // (dnevni, sedmični, mjesečni) se ne broje. Rat mjeri koliko se igra, a ne
  // koliko se pokupi nagrada; questovi se ionako pune iz istih tih kvizova, pa
  // bi se isti trud brojao dvaput. Klanski bonusi (+% CP) i dalje djeluju, ali
  // samo na CP iz kviza i Preživljavanja.
  // Ne dodavati addClanWarCp ovdje.

  return {
    reward: task.reward,
    tokens: zetoni,
    clanGold: zeleni,
    newLevel: levelFromXp(finalXp, cfg),
    levelBonus,
    newBadges,
  }
})

// ---------------------------------------------------------------------------
// VIKEND TURNIR — XP TRKA (Faza 2, korak B)
// Tokom prozora [openAt, closeAt] sav osvojeni XP (kviz/task/survival) se sabira
// na poseban leaderboard tournament/{key}/{uid}. config/tournament drži prozor.
// ---------------------------------------------------------------------------
let tournamentConfigCache = null
let tournamentConfigAt = 0
async function getTournamentConfig() {
  if (tournamentConfigCache && Date.now() - tournamentConfigAt < 30000) return tournamentConfigCache
  const snap = await db.doc('config/tournament').get()
  tournamentConfigCache = snap.exists ? snap.data() : null
  tournamentConfigAt = Date.now()
  return tournamentConfigCache
}

// XP trka je ZASEBAN event od 1v1 turnira: svoj prozor, svoj ključ, svoje
// gašenje. Do sada su dijelili config/tournament, pa se trka nije mogla
// produžiti ni ugasiti bez diranja duela.
//
// Dok config/xpRace ne postoji, trka pada nazad na prozor turnira — tako
// zatečeni event nastavi raditi i prije nego admin postavi novi prozor.
let xpRaceConfigCache = null
let xpRaceConfigAt = 0
async function getXpRaceConfig() {
  if (xpRaceConfigCache && Date.now() - xpRaceConfigAt < 30000) return xpRaceConfigCache
  const snap = await db.doc('config/xpRace').get()
  xpRaceConfigCache = snap.exists ? snap.data() : await getTournamentConfig()
  xpRaceConfigAt = Date.now()
  return xpRaceConfigCache
}

// Je li trka trenutno otvorena (unutar prozora i uključena).
function xpRacePoTeku(cfg, now = Date.now()) {
  if (!cfg || !cfg.enabled || !cfg.key) return false
  if (cfg.openAt && now < cfg.openAt) return false
  if (cfg.closeAt && now > cfg.closeAt) return false
  return true
}

// Dodaj osvojeni XP na listu XP trke ako smo unutar prozora eventa.
async function addWeekendXp(uid, delta) {
  if (!delta || delta <= 0) return
  const cfg = await getXpRaceConfig()
  if (!cfg || !cfg.enabled || !cfg.key) return
  const now = Date.now()
  if ((cfg.openAt && now < cfg.openAt) || (cfg.closeAt && now > cfg.closeAt)) return
  const us = await db.doc(`users/${uid}`).get()
  const p = us.exists ? us.data() : {}
  if (!isHidden(p)) {
    await rtdb.ref(`tournament/${cfg.key}/${uid}`).transaction((cur) => ({
      name: p.displayName || 'Farmaceut',
      avatar: p.avatar || 'a1',
      xp: (cur?.xp || 0) + delta,
    }))
  }
  // Questovi vezani za turnir (metric 'tournamentXp') prate isti prozor.
  await applyProgress(uid, { tournamentXp: delta })
}

// Finalizacija XP trke na kraju prozora: nagrade top 3 (bonus XP), jednokratno.
const XP_RACE_REWARDS = [500, 300, 150] // 1., 2., 3. mjesto
async function finalizeXpRace(tid) {
  const snap = await rtdb.ref(`tournament/${tid}`).orderByChild('xp').limitToLast(3).get()
  const rows = []
  // Tijelo u vitičastim zagradama je OBAVEZNO: forEach prekida obilazak čim
  // callback vrati nešto istinito, a rows.push vraća dužinu niza. Sa skraćenim
  // zapisom je ovdje ostajao samo jedan red — i to najslabiji od prva tri, pa
  // je prvu nagradu (500 XP) dobijao trećeplasirani.
  snap.forEach((c) => {
    rows.push({ uid: c.key, ...c.val() })
  })
  rows.reverse() // limitToLast je rastuće — želimo najboljeg prvog
  const top = []
  for (let i = 0; i < rows.length; i++) {
    const reward = XP_RACE_REWARDS[i] || 0
    top.push({ uid: rows[i].uid, name: rows[i].name || 'Farmaceut', xp: rows[i].xp || 0, reward })
    if (reward > 0) {
      const uRef = db.doc(`users/${rows[i].uid}`)
      await db.runTransaction(async (tx) => {
        const s = await tx.get(uRef)
        if (s.exists) tx.update(uRef, { xp: (s.data().xp || 0) + reward })
      })
    }
  }
  await awardXpRaceFrames(tid, rows)
  await db.doc(`xpRaces/${tid}`).set({ finalized: true, top, finalizedAt: FieldValue.serverTimestamp() })
}

// Okviri XP trke. Podijum ide iz `top3` (već poredanog), a pragovi osvojenog
// XP-a se dijele SVIM učesnicima — zato se ovdje čita cijeli čvor, ne samo
// prva tri. 'xp-nova' traži tri osvojene trke, pa ide preko brojača.
async function awardXpRaceFrames(tid, top3) {
  const snap = await rtdb.ref(`tournament/${tid}`).get()
  const svi = Object.entries(snap.val() || {})
    .map(([uid, row]) => ({ uid, xp: row?.xp || 0 }))
    .filter((r) => r.xp > 0)
    .sort((a, b) => b.xp - a.xp)
  const PODIJUM = ['xp-1', 'xp-2', 'xp-3']

  for (const { uid, xp } of svi) {
    const ids = ['xp-run']
    const prag = XP_RACE_SCORE_FRAMES.find((p) => xp >= p.xp)
    if (prag) ids.push(prag.id)
    await awardCosmetics(uid, ids)
    // 'Serija' — treća odigrana trka, bez obzira na plasman.
    const trka = await bumpCosmeticStat(uid, 'xpRaceRuns')
    if (trka >= 3) await awardCosmetics(uid, ['xp-hat3'])
  }

  // 'Kometa' — najbolji odmah iza podijuma; nagrada za trud bez trofeja.
  if (svi.length > PODIJUM.length) await awardCosmetics(svi[PODIJUM.length].uid, ['xp-comet'])

  for (let i = 0; i < Math.min(top3.length, PODIJUM.length); i++) {
    const uid = top3[i].uid
    await awardCosmetics(uid, [PODIJUM[i]])
    if (i === 0) {
      const pobjeda = await bumpCosmeticStat(uid, 'xpRaceWins')
      if (pobjeda >= 3) await awardCosmetics(uid, ['xp-nova'])
    }
  }
}

// ---------------------------------------------------------------------------
// 1v1 DUEL TURNIR (Faza 2, korak C) — bracket single-elimination, async dueli
// Prijave [regOpenAt, regCloseAt] → bracket (nasumično) → runde s rokovima.
// tournamentTick (scheduled) zatvara runde: veći skor prolazi, walkover ako
// protivnik ne odigra. Skor protivnika je skriven do zatvaranja runde.
// ---------------------------------------------------------------------------
const DUEL_WINNER_BONUS = 500

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Prijava na duel turnir (unutar prozora prijava).
export const registerForDuel = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const cfg = await getTournamentConfig()
  if (!cfg || !cfg.enabled || !cfg.key) throw new HttpsError('failed-precondition', 'Nema aktivnog turnira.')
  const now = Date.now()
  if (cfg.regOpenAt && now < cfg.regOpenAt) throw new HttpsError('failed-precondition', 'Prijave još nisu otvorene.')
  if (cfg.regCloseAt && now > cfg.regCloseAt) throw new HttpsError('failed-precondition', 'Prijave su zatvorene.')
  const us = await db.doc(`users/${uid}`).get()
  const p = us.exists ? us.data() : {}
  await db.doc(`tournaments/${cfg.key}/participants/${uid}`).set(
    { name: p.displayName || 'Farmaceut', avatar: p.avatar || 'a1', registeredAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  return { ok: true }
})

// Generisanje bracketa iz prijavljenih (na kraju prozora prijava).
//
// Bracket se kroji po broju prijavljenih: višak mjesta do potencije dvojke
// postaje BYE (igrač bez protivnika u prvoj rundi), a ne prazan meč. Ranije se
// popunjavalo redom, pa je 20 prijavljenih davalo 10 punih i 6 potpuno praznih
// mečeva — praznine su visile u prikazu i gurale stvarne mečeve van ekrana.
// Vidi paroviPrveRunde() u turnir-raspored.js.
//
// Rokovi rundi idu u ljudske termine po BiH vremenu (08/14/20), ne na jednake
// dijelove prozora — vidi rasporedRundi().
async function buildBracket(tid, cfg) {
  const tRef = db.doc(`tournaments/${tid}`)
  const partSnap = await db.collection(`tournaments/${tid}/participants`).get()
  let participants = partSnap.docs.map((d) => d.id)
  if (participants.length < 2) {
    await tRef.set(
      { status: 'finished', key: tid, participantCount: participants.length, cancelled: true, builtAt: FieldValue.serverTimestamp() },
      { merge: true }
    )
    return
  }
  participants = shuffle(participants)
  const rounds = brojRundi(participants.length)
  const size = 2 ** rounds
  const parovi = paroviPrveRunde(participants)

  const qids = (await getActiveQuestions()).map((q) => q.id)
  const pickQs = () => shuffle(qids).slice(0, DUEL_QUESTIONS)

  const batch = db.batch()
  const mcol = db.collection(`tournaments/${tid}/matches`)
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r
    for (let s = 0; s < count; s++) {
      const [p1, p2] = r === 1 ? parovi[s] : [null, null]
      batch.set(mcol.doc(`r${r}s${s}`), {
        round: r, slot: s, p1: p1 || null, p2: p2 || null, questionIds: pickQs(),
        p1Score: null, p2Score: null, p1Played: false, p2Played: false,
        winner: null, status: 'pending',
      })
    }
  }
  const roundDeadlines = rasporedRundi(cfg.openAt || Date.now(), rounds)
  batch.set(
    tRef,
    { status: 'active', key: tid, rounds, size, participantCount: participants.length, currentRound: 1, roundDeadlines, builtAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  await batch.commit()
  await resolveByes(tid, 1, rounds)
}

// Prosljeđivanje pobjednika u sljedeću rundu (fiksni bracket).
//
// Meč iznad može nedostajati ako je počišćen kao prazan (adminPruneEmptyMatches).
// To se po definiciji dešava samo iznad grana bez ijednog igrača, pa nema šta ni
// proslijediti — ali update() bi na nepostojećem dokumentu bacio grešku i srušio
// zatvaranje CIJELE runde, pa se izostanak ovdje samo preskoči.
async function propagate(tid, round, slot, winner) {
  if (!winner) return
  const field = slot % 2 === 0 ? 'p1' : 'p2'
  const ref = db.doc(`tournaments/${tid}/matches/r${round + 1}s${Math.floor(slot / 2)}`)
  const snap = await ref.get()
  if (!snap.exists) {
    console.warn(`propagate: meč r${round + 1}s${Math.floor(slot / 2)} ne postoji (${tid})`)
    return
  }
  await ref.update({ [field]: winner })
}

// Riješi bye/prazne mečeve u rundi (igrač bez protivnika odmah prolazi).
async function resolveByes(tid, round, rounds) {
  const snap = await db.collection(`tournaments/${tid}/matches`).where('round', '==', round).get()
  for (const d of snap.docs) {
    const m = d.data()
    if (m.status !== 'pending' || (m.p1 && m.p2)) continue
    const winner = m.p1 || m.p2 || null
    await d.ref.update({ winner, status: 'done' })
    if (round < rounds) await propagate(tid, round, m.slot, winner)
  }
}

// Zatvori tekuću rundu na rok: odredi pobjednike, prosljedi, pomjeri rundu.
async function resolveRound(tid, t) {
  const round = t.currentRound
  const rounds = t.rounds
  const snap = await db.collection(`tournaments/${tid}/matches`).where('round', '==', round).get()
  for (const d of snap.docs) {
    const m = d.data()
    if (m.status === 'done') continue
    const winner = resolveMatch(m)
    await d.ref.update({ winner, status: 'done' })
    if (round < rounds) await propagate(tid, round, m.slot, winner)
  }
  if (round >= rounds) {
    await finalizeTournament(tid, rounds)
  } else {
    await db.doc(`tournaments/${tid}`).update({ currentRound: round + 1 })
    await resolveByes(tid, round + 1, rounds)
  }
}

// Kraj turnira: pobjednik finala dobija bonus XP + bedž šampiona.
async function finalizeTournament(tid, rounds) {
  const fm = await db.doc(`tournaments/${tid}/matches/r${rounds}s0`).get()
  const winner = fm.exists ? fm.data().winner : null
  await db.doc(`tournaments/${tid}`).update({ status: 'finished', winnerUid: winner, finishedAt: FieldValue.serverTimestamp() })
  if (winner) {
    const uRef = db.doc(`users/${winner}`)
    await db.runTransaction(async (tx) => {
      const s = await tx.get(uRef)
      if (!s.exists) return
      tx.update(uRef, { xp: (s.data().xp || 0) + DUEL_WINNER_BONUS, [`badges.turnir-sampion`]: FieldValue.serverTimestamp() })
    })
  }
  await awardDuelFrames(tid, rounds, winner)
}

// Okviri duel turnira. Sve se izvodi iz mečeva jednog turnira, pa nema potrebe
// za praćenjem po rundi: učešće, polufinale, finale, titula i ukupne pobjede.
async function awardDuelFrames(tid, rounds, winner) {
  const [pSnap, mSnap] = await Promise.all([
    db.collection(`tournaments/${tid}/participants`).get(),
    db.collection(`tournaments/${tid}/matches`).get(),
  ])
  const mecevi = mSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  // Učešće — svima koji su bili u bracketu.
  for (const d of pSnap.docs) await awardCosmetics(d.id, ['dl-part'])

  // Finale i polufinale: id meča je r{runda}s{slot}.
  const finale = mecevi.find((m) => m.id === `r${rounds}s0`)
  if (finale) {
    for (const uid of [finale.p1, finale.p2].filter(Boolean)) {
      await awardCosmetics(uid, ['dl-final'])
    }
    // Puni skor u finalu je jedini "neporažen" koji nešto znači — u
    // single-elimination bracketu pobjednik po definiciji nema poraza.
    const puni =
      finale.p1Score === DUEL_QUESTIONS ? finale.p1 : finale.p2Score === DUEL_QUESTIONS ? finale.p2 : null
    if (winner && puni === winner) await awardCosmetics(winner, ['dl-unbeaten'])
  }
  for (const m of mecevi.filter((x) => x.id.startsWith(`r${rounds - 1}s`))) {
    for (const uid of [m.p1, m.p2].filter(Boolean)) await awardCosmetics(uid, ['dl-semi'])
  }

  // Ukupne pobjede kroz sve turnire — brojač se uvećava za pobjede u OVOM.
  const pobjedePo = {}
  for (const m of mecevi) if (m.winner) pobjedePo[m.winner] = (pobjedePo[m.winner] || 0) + 1
  for (const [uid, n] of Object.entries(pobjedePo)) {
    const ukupno = await bumpCosmeticStat(uid, 'duelWins', n)
    const prag = DUEL_WIN_FRAMES.find((p) => ukupno >= p.wins)
    if (prag) await awardCosmetics(uid, [prag.id])
  }

  if (winner) {
    await awardCosmetics(winner, ['dl-champ'])
    const titule = await bumpCosmeticStat(winner, 'duelTitles')
    if (titule >= 3) await awardCosmetics(winner, ['dl-champ3'])
  }
}

// Scheduled tick: gradi bracket i zatvara runde po rasporedu (svakih 30 min).
//
// Trka i turnir su ODVOJENI eventi s vlastitim prozorima, pa svaki ima svoju
// granu: gašenje jednog ne smije zaustaviti drugi.
export const tournamentTick = onSchedule('every 30 minutes', async () => {
  const now = Date.now()

  // --- XP trka: finalizacija na kraju vlastitog prozora (jednom) ---
  const xcfgSnap = await db.doc('config/xpRace').get()
  const tcfgSnap = await db.doc('config/tournament').get()
  const xcfg = xcfgSnap.exists ? xcfgSnap.data() : tcfgSnap.exists ? tcfgSnap.data() : null
  if (xcfg?.enabled && xcfg.key && xcfg.closeAt && now >= xcfg.closeAt) {
    const xr = await db.doc(`xpRaces/${xcfg.key}`).get()
    if (!xr.exists || !xr.data().finalized) await finalizeXpRace(xcfg.key)
  }

  // --- Duel bracket ---
  const cfg = tcfgSnap.exists ? tcfgSnap.data() : null
  if (!cfg || !cfg.enabled || !cfg.key) return
  const tid = cfg.key
  const tSnap = await db.doc(`tournaments/${tid}`).get()
  if (!tSnap.exists) {
    if (cfg.regCloseAt && now >= cfg.regCloseAt) await buildBracket(tid, cfg)
    return
  }
  const t = tSnap.data()
  if (t.status === 'active') {
    const dl = t.roundDeadlines || []
    const idx = t.currentRound - 1
    if (idx >= 0 && idx < dl.length && now >= dl[idx]) await resolveRound(tid, t)
  }
})

// Zatvaranje duela: skor u meč + vrijeme završetka (mjerodavno za neriješeno).
// Zove se i kad igrač odgovori na zadnje pitanje i kad mu istekne vrijeme, pa je
// upis na jednom mjestu. Sve što je ostalo neodgovoreno se broji kao netačno.
async function zavrsiDuel(uid, tid, sRef, session, answers) {
  const score = answers.filter((a) => a.correct).length
  const finishedAt = Date.now()
  await sRef.update({ answers, finished: true, finishedAt })

  const mRef = db.doc(`tournaments/${tid}/matches/${session.matchId}`)
  await db.runTransaction(async (tx) => {
    const ms = await tx.get(mRef)
    if (!ms.exists) return
    const m = ms.data()
    if (m.p1 === uid) tx.update(mRef, { p1Score: score, p1Played: true, p1FinishedAt: finishedAt })
    else if (m.p2 === uid) tx.update(mRef, { p2Score: score, p2Played: true, p2FinishedAt: finishedAt })
  })

  await applyProgress(uid, { duels: 1 }) // questovi tipa "odigraj duel"
  await bumpStreak(uid)
  return { score, total: session.questionIds.length }
}

// Pokreni/nastavi svoj duel u tekućoj rundi.
//
// Za razliku od kviza, ovdje se sat NE resetuje pri povratku: 120 sekundi teče
// od prvog otvaranja duela. Ko izađe pa se vrati, zatiče isti sat — inače bi
// izlazak iz aplikacije bio način da se dobije neograničeno vrijeme, a vrijeme
// je ovdje i kriterij za neriješen rezultat.
export const startDuel = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const cfg = await getTournamentConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema turnira.')
  const tid = cfg.key
  const tSnap = await db.doc(`tournaments/${tid}`).get()
  if (!tSnap.exists || tSnap.data().status !== 'active') return { noMatch: true }
  const round = tSnap.data().currentRound
  const snap = await db.collection(`tournaments/${tid}/matches`).where('round', '==', round).get()
  const md = snap.docs.find((d) => d.data().p1 === uid || d.data().p2 === uid)
  if (!md) return { noMatch: true }
  const m = md.data()
  const isP1 = m.p1 === uid
  if ((isP1 && m.p1Played) || (!isP1 && m.p2Played)) {
    return { alreadyPlayed: true, score: isP1 ? m.p1Score : m.p2Score, total: DUEL_QUESTIONS }
  }
  const sRef = db.doc(`duelSessions/${tid}_${uid}`)
  const sSnap = await sRef.get()
  let session
  if (sSnap.exists && sSnap.data().matchId === md.id && !sSnap.data().finished) {
    session = sSnap.data()
    // Vrijeme je isteklo dok igrača nije bilo → duel se zatvara s onim što ima.
    if (duelPreostalo(session.startedAt) <= 0) {
      const r = await zavrsiDuel(uid, tid, sRef, session, session.answers || [])
      return { alreadyPlayed: true, score: r.score, total: r.total, isteklo: true }
    }
  } else {
    session = {
      tid,
      uid,
      matchId: md.id,
      questionIds: m.questionIds,
      answers: [],
      current: 0,
      finished: false,
      startedAt: Date.now(),
    }
    await sRef.set(session)
  }
  const qid = session.questionIds[session.current]
  const qDoc = await getQuestionById(qid)
  return {
    matchId: md.id,
    total: session.questionIds.length,
    index: session.current,
    secondsLeft: duelPreostalo(session.startedAt),
    totalSeconds: DUEL_TOTAL_SECONDS,
    question: publicQuestion(qid, qDoc, session.current, duelPreostalo(session.startedAt)),
  }
})

// Odgovor u duelu; poslije svakog odgovora odmah slijedi sljedeće pitanje, a na
// zadnjem se upisuje skor u meč (skriven protivniku do zatvaranja runde).
export const submitDuelAnswer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const cfg = await getTournamentConfig()
  const tid = cfg?.key
  const { answerIndex, kraj } = request.data || {}
  const answer = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3 ? answerIndex : null
  const sRef = db.doc(`duelSessions/${tid}_${uid}`)
  const sSnap = await sRef.get()
  if (!sSnap.exists) throw new HttpsError('failed-precondition', 'Nema aktivnog duela.')
  const session = sSnap.data()
  if (session.finished) throw new HttpsError('failed-precondition', 'Duel je završen.')

  // Jedan sat za svih 10 pitanja. Kad istekne, duel se zatvara odmah — pitanja
  // na koja se nije stiglo odgovoriti ostaju netačna.
  //
  // `kraj` šalje klijent kad njegov tajmer dođe na nulu. Bez toga bi odgovor
  // stigao unutar GRACE prozora i server bi ga uredno primio, pa bi ekran
  // pokazivao "isteklo" a duel se nastavljao. Grace ostaje za mrežno kašnjenje
  // stvarnih odgovora, a ne kao produžetak igre.
  const proteklo = (Date.now() - (session.startedAt || Date.now())) / 1000
  if (kraj === true || proteklo > DUEL_TOTAL_SECONDS + GRACE_SECONDS) {
    const r = await zavrsiDuel(uid, tid, sRef, session, session.answers || [])
    return { isteklo: true, finished: true, myScore: r.score, total: r.total, secondsLeft: 0 }
  }

  const qid = session.questionIds[session.current]
  const secret = await getSecret(qid)
  const correct = answer !== null && answer === secret.correctIndex
  const answers = [...session.answers, { correct }]
  const isLast = session.current + 1 >= session.questionIds.length

  if (!isLast) {
    const nextQid = session.questionIds[session.current + 1]
    const nextData = await getQuestionById(nextQid)
    await sRef.update({ answers, current: session.current + 1 })
    const preostalo = duelPreostalo(session.startedAt)
    return {
      correct,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: false,
      secondsLeft: preostalo,
      question: publicQuestion(nextQid, nextData, session.current + 1, preostalo),
    }
  }

  const r = await zavrsiDuel(uid, tid, sRef, session, answers)
  return {
    correct,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: true,
    myScore: r.score,
    total: r.total,
    secondsLeft: duelPreostalo(session.startedAt),
  }
})

// ---------------------------------------------------------------------------
// PREŽIVLJAVANJE (Etapa 8) — endless mod, jedan pokušaj sedmično (reset srijedom)
// ---------------------------------------------------------------------------

// Vremenski prozor eventa: config/survival { enabled, openAt, closeAt } (ms).
// Ako doc ne postoji ili enabled=false → nema gejta (uvijek otvoreno).
let survivalConfigCache = null
let survivalConfigAt = 0
async function getSurvivalConfig() {
  // Kratki keš (30s) da promjena prozora iz admin panela brzo stupi na snagu.
  if (survivalConfigCache && Date.now() - survivalConfigAt < 30000) return survivalConfigCache
  const snap = await db.doc('config/survival').get()
  survivalConfigCache = snap.exists ? snap.data() : null
  survivalConfigAt = Date.now()
  return survivalConfigCache
}

// Vraća null ako je otvoreno, inače { openAt, closeAt } (event zatvoren).
async function survivalWindowClosed() {
  const cfg = await getSurvivalConfig()
  if (!cfg || !cfg.enabled) return null
  const now = Date.now()
  if ((cfg.openAt && now < cfg.openAt) || (cfg.closeAt && now > cfg.closeAt)) {
    return { openAt: cfg.openAt || null, closeAt: cfg.closeAt || null }
  }
  return null
}

// Nasumično aktivno pitanje koje NIJE u 'seen' listi (bez ponavljanja u run-u).
// Bira se nad indeksom (metapodaci), pa se dovuče tekst samo za izabrano.
// Vraća null kad je banka iscrpljena.
async function pickSurvivalQuestion(seen) {
  const pool = (await getActiveQuestions()).filter((q) => !seen.includes(q.id))
  if (pool.length === 0) return null
  // Ako je indeks zastario pa izabrano pitanje više nije aktivno, probaj drugo.
  // Bez ovoga bi jedno ugašeno pitanje vratilo null, a to gore znači "banka
  // iscrpljena" i zatvorilo bi igraču run.
  const preostalo = [...pool]
  for (let poku = 0; poku < 5 && preostalo.length > 0; poku++) {
    const i = Math.floor(Math.random() * preostalo.length)
    const data = await getQuestionById(preostalo[i].id)
    if (data) return data
    preostalo.splice(i, 1)
  }
  return null
}

// Upis trenutnog niza u survival leaderboard (RTDB) — živo penjanje liste.
async function writeSurvivalLeaderboard(uid, week, streak) {
  const us = await db.doc(`users/${uid}`).get()
  const p = us.exists ? us.data() : {}
  if (isHidden(p)) return
  await rtdb.ref(`survival/${week}/${uid}`).set({
    name: p.displayName || 'Farmaceut',
    avatar: p.avatar || 'a1',
    streak,
  })
  await updateSurvivalRecord(uid, p, week, streak)
}

// ---------------------------------------------------------------------------
// Rekord Preživljavanja — najbolji niz IKAD
// ---------------------------------------------------------------------------
// Stalan poredak od jednog mjesta: config/survivalRecord
//   { uid, name, avatar, streak, week, setAt }
//
// Rekord ruši SAMO strogo veći niz — izjednačenje ostavlja mjesto onome ko ga
// je prvi osvojio. Ko na njemu sjedi u trenutku sedmičnog restarta, dobija tri
// kovčega (survivalWeeklyReset → dodijeliRekordKovcege).
//
// Drži se kao vlastiti dokument umjesto da se računa iz RTDB stabla pri svakom
// čitanju (najboljiSurvivalIz radi upravo to, ali za jedan ekran u klanu):
// karticu rekorda vidi svako otvaranje Preživljavanja, pa mora biti jedan read.
// Živi u 'config' jer je to jedina kolekcija koju pravila daju klijentu da
// čita, a serveru da piše (firestore.rules).
const SURVIVAL_RECORD_DOC = 'config/survivalRecord'

// Najbolji niz u cijelom stablu ljestvica. Treba samo jednom — da uvođenje
// rekorda ne krene od nule i pobriše ono što su igrači već postigli.
async function rekordIzStabla() {
  const stablo = await survivalStablo()
  let naj = null
  for (const [week, igraci] of Object.entries(stablo)) {
    for (const [uid, zapis] of Object.entries(igraci || {})) {
      const streak = zapis?.streak || 0
      if (streak > 0 && (!naj || streak > naj.streak)) {
        naj = { uid, name: zapis.name || 'Farmaceut', avatar: zapis.avatar || 'a1', streak, week }
      }
    }
  }
  return naj
}

// Zastavica po instanci: čim znamo da rekord postoji, sijanje se više ni ne
// provjerava — inače bi svaki tačan odgovor plaćao jedan suvišan read.
let rekordZasijan = false

async function osiguraRekord(ref) {
  if (rekordZasijan) return
  if (!(await ref.get()).exists) {
    const sjeme = await rekordIzStabla()
    if (sjeme) await ref.set({ ...sjeme, setAt: FieldValue.serverTimestamp() })
  }
  rekordZasijan = true
}

async function updateSurvivalRecord(uid, profile, week, streak) {
  if (streak <= 0) return
  const ref = db.doc(SURVIVAL_RECORD_DOC)
  await osiguraRekord(ref)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const cur = snap.exists ? snap.data() : null
    if (cur && (cur.streak || 0) >= streak) return // izjednačenje ne ruši rekord
    tx.set(ref, {
      uid,
      name: profile.displayName || 'Farmaceut',
      avatar: profile.avatar || 'a1',
      streak,
      week,
      setAt: FieldValue.serverTimestamp(),
    })
  })
}

// startSurvival — pokreni novi run, nastavi pauzirani/aktivni, ili javi da je
// pokušaj potrošen. Ovo je jedina tačka koja servira pitanje: poslije tačnog
// odgovora run ostaje u stanju 'awaitingNext' (bez pitanja u ruci), pa igrač
// smije izaći bez rizika da mu neko pitanje "visi" dok je vani.
export const startSurvival = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  // Van zakazanog prozora eventa → ne može se započeti/nastaviti.
  const closed = await survivalWindowClosed()
  if (closed) return { closed: true, openAt: closed.openAt, closeAt: closed.closeAt }
  const week = survivalWeekKey()
  const runRef = db.doc(`survivalRuns/${uid}`)
  const runSnap = await runRef.get()
  const run = runSnap.exists ? runSnap.data() : null

  // Run je prekinut greškom → zaključano do srijede (izlazak NE zaključava).
  // `revived` govori klijentu smije li ponuditi žeton za oživljavanje: jedno
  // po run-u, pa se poslije iskorištenog žetona dugme više ne prikazuje.
  if (run && run.week === week && !run.active) {
    return { locked: true, streak: run.streak || 0, week, revived: run.revived === true }
  }

  if (run && run.week === week && run.active) {
    // Pauziran poslije tačnog odgovora → sljedeće pitanje se bira TEK SADA,
    // da ga igrač ne može vidjeti pa izaći i potražiti odgovor.
    if (run.awaitingNext || !run.currentQid) {
      const seen = run.seen || []
      const next = await pickSurvivalQuestion(seen)
      if (!next) {
        // Banka iscrpljena — run se zatvara kao savršen.
        await runRef.update({ active: false, awaitingNext: false, endedAt: FieldValue.serverTimestamp() })
        await writeSurvivalLeaderboard(uid, week, run.streak || 0)
        return { locked: true, exhausted: true, streak: run.streak || 0, week }
      }
      await runRef.update({
        currentQid: next.id,
        seen: [...seen, next.id],
        askedAt: Date.now(),
        awaitingNext: false,
      })
      return {
        locked: false,
        resumed: (run.streak || 0) > 0,
        streak: run.streak || 0,
        week,
        question: publicQuestion(next.id, next, run.streak || 0, SURVIVAL_SECONDS),
      }
    }
    // Pitanje je već bilo poslano (prekinuta konekcija usred pitanja) → isto
    // pitanje sa svježim tajmerom, da mrežni ispad ne pojede sedmični pokušaj.
    const qData = await getQuestionById(run.currentQid)
    if (qData) {
      await runRef.update({ askedAt: Date.now() })
      return {
        locked: false,
        resumed: (run.streak || 0) > 0,
        streak: run.streak || 0,
        week,
        question: publicQuestion(run.currentQid, qData, run.streak || 0, SURVIVAL_SECONDS),
      }
    }
  }

  // Novi run.
  const q = await pickSurvivalQuestion([])
  if (!q) throw new HttpsError('failed-precondition', 'Banka pitanja je prazna.')
  await runRef.set({
    week,
    streak: 0,
    active: true,
    awaitingNext: false,
    currentQid: q.id,
    seen: [q.id],
    askedAt: Date.now(),
  })
  await setEventStatus(uid, { survival: true })
  await bumpStreak(uid)
  return { locked: false, streak: 0, week, question: publicQuestion(q.id, q, 0, SURVIVAL_SECONDS) }
})

// submitSurvivalAnswer — provjeri odgovor; tačno = +3 XP i sljedeće, greška = kraj.
export const submitSurvivalAnswer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const week = survivalWeekKey()
  const { answerIndex } = request.data || {}
  const answer =
    Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3 ? answerIndex : null

  const runRef = db.doc(`survivalRuns/${uid}`)
  const runSnap = await runRef.get()
  if (!runSnap.exists) throw new HttpsError('failed-precondition', 'Nema aktivnog run-a.')
  const run = runSnap.data()
  if (run.week !== week) throw new HttpsError('failed-precondition', 'Sedmica je istekla.')
  if (!run.active) throw new HttpsError('failed-precondition', 'Run je već završen za ovu sedmicu.')
  if (run.awaitingNext || !run.currentQid) {
    throw new HttpsError('failed-precondition', 'Nema pitanja u toku — zatraži sljedeće.')
  }

  const elapsed = (Date.now() - (run.askedAt || Date.now())) / 1000
  const timedOut = elapsed > SURVIVAL_SECONDS + GRACE_SECONDS
  const secret = await getSecret(run.currentQid)
  const correct = !timedOut && answer !== null && answer === secret.correctIndex

  // Greška ili istek → kraj run-a za ovu sedmicu (jedino ovo zaključava event).
  if (!correct) {
    await runRef.update({ active: false, awaitingNext: false, endedAt: FieldValue.serverTimestamp() })
    await writeSurvivalLeaderboard(uid, week, run.streak || 0)
    // Igrač je ispao → survival zadatak mu više ne stoji u dnevnim questovima
    // i do srijede mu se više ne može ni ponuditi.
    await dropEventPicks(uid, 'survival')
    await setEventStatus(uid, { survival: false })
    const newBadges = await awardBadges(uid)
    return {
      correct: false,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: true,
      eliminated: true,
      streak: run.streak || 0,
      // Je li žeton za oživljavanje već potrošen na ovom run-u — klijent na
      // osnovu ovoga odlučuje hoće li ponuditi "Oživi".
      revived: run.revived === true,
      newBadges,
    }
  }

  // Tačno → +3 XP, run se PAUZIRA i igrač bira: izađi ili nastavi.
  // Sljedeće pitanje se namjerno ne šalje ovdje (bira ga startSurvival).
  const newStreak = (run.streak || 0) + 1
  // Kovčeg na svakom 10. koraku niza — XP legne ODMAH, u istoj transakciji;
  // pritisak na kovčeg na ljestvici je samo animacija koja igraču to pokaže.
  const chestReward = survivalChestReward(newStreak)
  const userRef = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef)
    if (!us.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    tx.update(userRef, { xp: (us.data().xp || 0) + SURVIVAL_XP_PER_CORRECT + chestReward })
  })
  const levelBonus = await awardLevelMilestones(uid)
  await addWeekendXp(uid, SURVIVAL_XP_PER_CORRECT)
  // Klanski rat: Preživljavanje nosi CP kao i kviz, uključujući kovčeg na
  // svakom 10. koraku. Kategorija pitanja se čita iz keširanog indeksa banke,
  // pa srijedni boost radi i ovdje bez ijednog dodatnog čitanja.
  const svKat = (await getQuestionById(run.currentQid))?.category || null
  // Kovčeg (300 XP na svakom 10. koraku) NAMJERNO ulazi u rat zajedno s
  // korakom — to je nagrada za odigrano, ne za pokupljeno.
  await addClanWarCp(uid, SURVIVAL_XP_PER_CORRECT + chestReward, {
    xpPoKategoriji: svKat ? { [svKat]: SURVIVAL_XP_PER_CORRECT + chestReward } : null,
    izvor: 'survival',
  })
  await applyProgress(uid, { survivalCorrect: 1, survivalBest: newStreak })

  await runRef.update({
    streak: newStreak,
    currentQid: null,
    awaitingNext: true,
    askedAt: null,
    pausedAt: FieldValue.serverTimestamp(),
  })
  await writeSurvivalLeaderboard(uid, week, newStreak)
  const newBadges = await awardBadges(uid)
  // Okvir na svakom 10. koraku niza — isti pragovi kao kovčezi.
  const newFrames = SURVIVAL_FRAME_STEPS.includes(newStreak)
    ? await awardCosmetics(uid, [`sv-${newStreak}`])
    : []

  const remaining = (await getActiveQuestions()).length - (run.seen || []).length
  return {
    correct: true,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: false,
    canExit: true, // klijent nudi "Izađi" ili "Nastavi"
    exhausted: remaining <= 0, // nema više pitanja — run se zatvara na povratku
    streak: newStreak,
    xpPerCorrect: SURVIVAL_XP_PER_CORRECT,
    chestReward, // > 0 kad je ovim odgovorom otključan kovčeg na ljestvici
    levelBonus,
    newBadges,
    newFrames, // id-evi tek osvojenih okvira avatara
  }
})

// ---------------------------------------------------------------------------
// spendSurvivalRevive — žeton za oživljavanje (nagrada za mjesečni EPC post)
// ---------------------------------------------------------------------------
// Igrač je ispao. Umjesto da čeka srijedu, troši žeton: pitanje na kojem je pao
// BROJI SE KAO PREĐENO (dobija XP za taj korak) i nastavlja na sljedećem.
// Pitanje se ne ponavlja — već je u `run.seen` od trenutka kad mu je postavljeno.
//
// Granice, i zašto baš takve:
//  - NAJVIŠE JEDNOM po run-u (`run.revived`). Bez toga bi igrač s više žetona
//    prošao cijelu ljestvicu bez rizika, a Preživljavanje je zamišljeno kao
//    jedna sedmična sudbina.
//  - Vrijedi do sedmičnog restarta, ne samo odmah — ko ispadne uveče, može se
//    predomisliti ujutro. Zato se gleda `run.week`, a ne vrijeme ispadanja.
//  - Ako oživljeni korak padne na prag (10, 20 …), nosi i kovčeg. Korak je korak.
//
// POZNATO OGRANIČENJE: dnevni survival quest koji je pri ispadanju zamijenjen
// običnim OSTAJE zamijenjen. Vraćanje bi značilo oduzimanje questa koji je igrač
// u međuvremenu možda ispunio, što je gore od ove nedosljednosti.
export const spendSurvivalRevive = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')

  const week = survivalWeekKey()
  if (await survivalWindowClosed()) {
    throw new HttpsError('failed-precondition', 'Preživljavanje trenutno nije otvoreno.')
  }

  const runRef = db.doc(`survivalRuns/${uid}`)
  const runSnap = await runRef.get()
  if (!runSnap.exists) throw new HttpsError('failed-precondition', 'Nemaš pokušaj ove sedmice.')
  const run = runSnap.data()
  if (run.week !== week) throw new HttpsError('failed-precondition', 'Taj pokušaj je iz prošle sedmice.')
  if (run.active) throw new HttpsError('failed-precondition', 'Još si u igri — nemaš šta oživljavati.')
  if (run.revived) throw new HttpsError('failed-precondition', 'Oživljavanje si već iskoristio.')

  const newStreak = (run.streak || 0) + 1
  const chestReward = survivalChestReward(newStreak)
  // Kategorija pitanja na kojem je pao — `currentQid` se pri ispadanju NE
  // briše, pa CP za klanski rat dobija istu kategoriju kao da je odgovorio tačno.
  const kategorija = run.currentQid ? (await getQuestionById(run.currentQid))?.category || null : null

  const userRef = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef)
    if (!us.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const p = us.data()
    const zetona = p.rewards?.survivalRevive || 0
    if (zetona <= 0) throw new HttpsError('failed-precondition', 'Nemaš žeton za oživljavanje.')
    // Trošenje žetona i XP za korak idu zajedno: da pad između dva upisa ne
    // pojede žeton bez koraka, ni obrnuto.
    tx.update(userRef, {
      'rewards.survivalRevive': zetona - 1,
      xp: (p.xp || 0) + SURVIVAL_XP_PER_CORRECT + chestReward,
    })
  })

  await runRef.update({
    streak: newStreak,
    active: true,
    awaitingNext: true, // sljedeće pitanje bira startSurvival, kao i inače
    currentQid: null,
    askedAt: null,
    endedAt: null,
    revived: true,
    revivedAt: FieldValue.serverTimestamp(),
  })

  const levelBonus = await awardLevelMilestones(uid)
  await addWeekendXp(uid, SURVIVAL_XP_PER_CORRECT)
  await addClanWarCp(uid, SURVIVAL_XP_PER_CORRECT + chestReward, {
    xpPoKategoriji: kategorija ? { [kategorija]: SURVIVAL_XP_PER_CORRECT + chestReward } : null,
    izvor: 'survival',
  })
  await applyProgress(uid, { survivalCorrect: 1, survivalBest: newStreak })
  await writeSurvivalLeaderboard(uid, week, newStreak)
  // Bez ovoga igrač ostaje "ispao" za questove i za signal na Areni.
  await setEventStatus(uid, { survival: true })
  const newBadges = await awardBadges(uid)
  const newFrames = SURVIVAL_FRAME_STEPS.includes(newStreak)
    ? await awardCosmetics(uid, [`sv-${newStreak}`])
    : []

  return {
    streak: newStreak,
    xp: SURVIVAL_XP_PER_CORRECT,
    chestReward,
    levelBonus,
    newBadges,
    newFrames,
  }
})

// Sedmični restart Preživljavanja — SRIJEDOM U 08:00 po BiH vremenu.
//
// Do sada se prozor eventa postavljao isključivo ručno (skripta
// postavi-survival-config.js ili admin panel), pa je event ostajao zatvoren dok
// admin ne intervenira. Ovo je poluga koja to radi sama:
//
//   1. prozor  — config/survival se pomjera na tekuću sedmicu
//   2. pokušaji — survivalRuns iz prošlih sedmica se brišu (svi su istekli)
//   3. signal  — svima eventStatus.survival = true, pa Arena zasvijetli
//   4. questovi — današnji izbor se poništava da survival zadatak uđe u ponudu
//
// Ljestvicu ne treba dirati: ona živi po sedmicama (survival/{week}/{uid}), pa
// nova sedmica kreće iz praznog čvora i rezultati prošle time više ne važe.
// Stari čvorovi se NAMJERNO ne brišu — najboljiSurvivalIz() ih pretražuje da bi
// ekran "Upravljanje klanom" pokazao najbolji niz igrača ikad.
//
// Posao je idempotentan uz jednu iznimku: kovčezi rekorderu (korak 0) se pri
// svakom pokretanju dodjeljuju iznova, jer su brojač, ne stanje.
const BATCH_LIMIT = 400 // Firestore dozvoljava 500 operacija po batchu

// Koliko kovčega dobija vlasnik rekorda pri sedmičnom restartu. Rekord se drži
// cijelu sedmicu i brani se protiv svih, pa nosi više od jednog level kovčega.
const RECORD_CHESTS = 5

// Nagrada se dodjeljuje PRIJE svega ostalog u restartu — tako je dobija onaj ko
// je bio prvi u sekundi prije restarta, kako i treba. Kovčezi stoje na profilu
// kao brojač (users/{uid}.recordChests) i otvaraju se na kartici rekorda
// (claimSurvivalRecordChest); isti su bubanj žetona kao kovčezi za level.
async function dodijeliRekordKovcege() {
  const snap = await db.doc(SURVIVAL_RECORD_DOC).get()
  const rekord = snap.exists ? snap.data() : null
  if (!rekord?.uid) return null
  await db
    .doc(`users/${rekord.uid}`)
    .update({ recordChests: FieldValue.increment(RECORD_CHESTS) })
    .catch(() => {}) // obrisan nalog ne smije srušiti restart
  return rekord
}

export const survivalWeeklyReset = onSchedule(
  { schedule: `0 ${SURVIVAL_RESET_HOUR} * * 3`, timeZone: BIH_TZ },
  async () => {
    const week = survivalWeekKey() // u 08:00 ovo je već NOVA sedmica
    const { openAt, closeAt } = survivalWindowFor()

    // 0. Kovčezi vlasniku rekorda — prvo, dok ljestvica prošle sedmice još stoji.
    const rekord = await dodijeliRekordKovcege()

    // 1. Prozor eventa.
    await db.doc('config/survival').set({
      enabled: true,
      openAt,
      closeAt,
      label: 'Sedmični izazov preživljavanja',
      updatedAt: FieldValue.serverTimestamp(),
    })
    survivalConfigCache = null // keš ove instance; ostale isteknu za 30 s

    // 2. Pokušaji iz prošlih sedmica.
    const runs = await db.collection('survivalRuns').get()
    let obrisanihRunova = 0
    for (let i = 0; i < runs.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch()
      for (const d of runs.docs.slice(i, i + BATCH_LIMIT)) {
        if (d.data().week === week) continue // već igra u novoj sedmici
        batch.delete(d.ref)
        obrisanihRunova++
      }
      await batch.commit()
    }

    // 3. i 4. Signal i dnevni questovi za sve igrače.
    const users = await db.collection('users').get()
    for (let i = 0; i < users.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch()
      for (const d of users.docs.slice(i, i + BATCH_LIMIT)) {
        batch.update(d.ref, {
          'eventStatus.survival': true,
          'eventStatus.survivalWeek': week,
          'taskProgress.daily.picked': null,
        })
      }
      await batch.commit()
    }

    console.log(
      `survivalWeeklyReset: sedmica ${week}, prozor ${new Date(openAt).toISOString()} → ` +
        `${new Date(closeAt).toISOString()}, igrača ${users.size}, obrisano runova ${obrisanihRunova}` +
        `, rekord: ${rekord ? `${rekord.name} (niz ${rekord.streak}) +${RECORD_CHESTS} kovčega` : 'nema'}`
    )
  }
)

// ---------------------------------------------------------------------------
// Kovčezi za level (Etapa 9)
//
// Svaki pređeni level ostavlja kovčeg u XP baru na početnoj. Ako igrač u jednom
// kvizu skoči s levela 1 na 3, čekaju ga DVA kovčega — otvaraju se jedan po
// jedan, redom. Animacija level-upa se od sada prikazuje SAMO na otvaranje
// kovčega, ne više odmah poslije kviza/questa/Preživljavanja.
//
// Stanje: users/{uid}.levelChestClaimed = najviši level čiji je kovčeg otvoren.
// Broj kovčega koji čekaju = trenutni level − levelChestClaimed.
//
// Zatečenim igračima se polje ne postavlja unaprijed — prvo čitanje ga tretira
// kao 1 (početni level), pa im kovčezi za već pređene levele legnu odmah.
// ---------------------------------------------------------------------------
// Nagrade iz kovčega. Sve su ŽETONI koji stoje na profilu dok se ne potroše —
// nijedna ne diže strop od 3 pokušaja odjednom, nego spremnik puni kad je
// prazan. Zato +3 nikad ne propada ni kad su pokušaji puni.
//
// Šanse prate vrijednost: lakše i češće nagrade na vrhu, najvrednija na dnu.
// Zbir šansi je 100 — nije uslov (rollChestReward normalizuje), ali je jedini
// način da se raspodjela čita bez računanja.
const CHEST_REWARDS = [
  { id: 'quiz1', kind: 'quizRefill', amount: 1, chance: 30, label: '+1 pokušaj za kviz' },
  { id: 'reroll', kind: 'questReroll', amount: 1, chance: 27, label: 'Zamjena dnevnog questa' },
  { id: 'quiz2', kind: 'quizRefill', amount: 2, chance: 18, label: '+2 pokušaja za kviz' },
  { id: 'freeze', kind: 'streakFreeze', amount: 1, chance: 11, label: 'Zaštita streaka' },
  // Sedmični i mjesečni quest nose 80–500 XP, pa su im žetoni srazmjerno rjeđi:
  // sedmični je srednje težak, mjesečni je najteža nagrada u bubnju.
  { id: 'rerollW', kind: 'questRerollWeekly', amount: 1, chance: 8, label: 'Zamjena sedmičnog questa' },
  { id: 'quiz3', kind: 'quizRefill', amount: 3, chance: 4, label: '+3 pokušaja za kviz' },
  { id: 'rerollM', kind: 'questRerollMonthly', amount: 1, chance: 2, label: 'Zamjena mjesečnog questa' },
]

function rollChestReward() {
  const ukupno = CHEST_REWARDS.reduce((a, r) => a + r.chance, 0)
  let t = Math.random() * ukupno
  for (const r of CHEST_REWARDS) {
    t -= r.chance
    if (t < 0) return r
  }
  return CHEST_REWARDS[0]
}

export const claimLevelChest = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')

  const cfg = await getLevelConfig()
  const ref = db.doc(`users/${uid}`)
  let rezultat = null

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const p = snap.data()
    const level = levelFromXp(p.xp || 0, cfg)
    const claimed = p.levelChestClaimed || 1
    if (claimed >= level) {
      throw new HttpsError('failed-precondition', 'Nema kovčega za otvaranje.')
    }
    // Otvara se UVIJEK najniži neotvoreni, da redoslijed levela ostane tačan.
    const noviLevel = claimed + 1
    // Izvlačenje je na SERVERU: da klijent ne može ponavljati dok ne padne +3.
    const nagrada = rollChestReward()
    const staro = p.rewards?.[nagrada.kind] || 0
    tx.update(ref, {
      levelChestClaimed: noviLevel,
      [`rewards.${nagrada.kind}`]: staro + nagrada.amount,
    })
    rezultat = {
      level: noviLevel,
      preostalo: level - noviLevel,
      reward: { id: nagrada.id, kind: nagrada.kind, amount: nagrada.amount, label: nagrada.label },
    }
  })

  return rezultat
})

// Otvaranje kovčega za rekord Preživljavanja. Isti bubanj nagrada kao kod
// kovčega za level — razlika je samo odakle kovčeg dolazi (sedmični restart
// dodijeli RECORD_CHESTS vlasniku rekorda) i gdje se otvara (kartica rekorda u
// Preživljavanju). Brojač: users/{uid}.recordChests.
export const claimSurvivalRecordChest = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const ref = db.doc(`users/${uid}`)
  let rezultat = null

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const p = snap.data()
    const cekaju = p.recordChests || 0
    if (cekaju <= 0) throw new HttpsError('failed-precondition', 'Nema kovčega za otvaranje.')
    // Izvlačenje je na SERVERU: da klijent ne može ponavljati dok ne padne +3.
    const nagrada = rollChestReward()
    const staro = p.rewards?.[nagrada.kind] || 0
    tx.update(ref, {
      recordChests: cekaju - 1,
      [`rewards.${nagrada.kind}`]: staro + nagrada.amount,
    })
    rezultat = {
      preostalo: cekaju - 1,
      reward: { id: nagrada.id, kind: nagrada.kind, amount: nagrada.amount, label: nagrada.label },
    }
  })

  return rezultat
})

// Otvaranje kovčega na ljestvici Preživljavanja (prag 10, 20 … 100).
//
// Do 30.07.2026. je otvaranje bilo ČISTA ANIMACIJA — XP je legao pri dostizanju
// praga, a klijent je sam upisivao `survivalChest`. Sada kovčeg nosi i žetone,
// pa izvlačenje mora na server (klijent bi inače ponavljao dok ne padne ono
// što mu treba). 300 XP i dalje legne odmah pri pragu; ovdje se izvlače SAMO
// žetoni, i to svi za taj prag odjednom (korak 10 → 1 žeton, 20 → 2 … 100 → 10).
//
// Zaštita od ponovnog otvaranja: `survivalChest.opened` je najviši otvoreni
// prag, pa prag koji nije veći od njega prolazi kao "već otvoren".
export const claimSurvivalChest = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const { step } = request.data || {}
  if (!Number.isInteger(step) || survivalChestCount(step) === 0) {
    throw new HttpsError('invalid-argument', 'Neispravan prag kovčega.')
  }

  const week = survivalWeekKey()
  // Niz se čita iz run-a, ne od klijenta: klijent ne smije tvrditi dokle je stigao.
  const runSnap = await db.doc(`survivalRuns/${uid}`).get()
  const run = runSnap.exists ? runSnap.data() : null
  const niz = run && run.week === week ? run.streak || 0 : 0
  if (step > niz) throw new HttpsError('failed-precondition', 'Taj prag još nije osvojen.')

  const ref = db.doc(`users/${uid}`)
  let rezultat = null
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const p = snap.data()
    const otvoreno = p.survivalChest?.week === week ? p.survivalChest.opened || 0 : 0
    if (step <= otvoreno) throw new HttpsError('failed-precondition', 'Taj kovčeg je već otvoren.')

    const koliko = survivalChestCount(step)
    const nagrade = []
    const zbir = {}
    for (let i = 0; i < koliko; i++) {
      const n = rollChestReward()
      nagrade.push({ id: n.id, kind: n.kind, amount: n.amount, label: n.label })
      zbir[n.kind] = (zbir[n.kind] || 0) + n.amount
    }
    const izmjene = { survivalChest: { week, opened: step } }
    for (const [kind, amount] of Object.entries(zbir)) {
      izmjene[`rewards.${kind}`] = (p.rewards?.[kind] || 0) + amount
    }
    tx.update(ref, izmjene)
    rezultat = { step, xp: SURVIVAL_CHEST_XP, nagrade, preostalo: Math.floor(niz / SURVIVAL_CHEST_STEP) - step / SURVIVAL_CHEST_STEP }
  })

  return rezultat
})

// Trošenje žetona za pokušaj kviza. Puni spremnik za 1, nikad iznad stropa —
// ako su pokušaji već puni, žeton se NE troši (inače bi nagrada nestala uzalud).
export const spendQuizRefill = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const ref = db.doc(`users/${uid}`)
  let rezultat = null

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const p = snap.data()
    const zetona = p.rewards?.quizRefill || 0
    if (zetona <= 0) throw new HttpsError('failed-precondition', 'Nemaš žetona za pokušaj.')
    const stanje = quizEnergyState(p)
    if (stanje.energy >= QUIZ_ENERGY_MAX) {
      throw new HttpsError('failed-precondition', 'Pokušaji su ti već puni.')
    }
    const energy = stanje.energy + 1
    tx.update(ref, {
      'rewards.quizRefill': zetona - 1,
      quizLimit: { ...stanje, energy, regenAt: energy >= QUIZ_ENERGY_MAX ? null : stanje.regenAt },
    })
    rezultat = { energy, preostaloZetona: zetona - 1 }
  })

  return rezultat
})

// Zamjena jednog questa drugim iz bazena — dnevnog, sedmičnog ili mjesečnog.
// Namjerno ZAMJENA, ne reset: reset bi značio da isti quest nosi XP dvaput.
//
// Tip se čita IZ SAMOG QUESTA, ne iz poziva: klijent tako ne može žetonom za
// dnevni quest mijenjati mjesečni. Svaki tip troši svoj žeton (REROLL_KIND).
// Ime funkcije je historijsko (`rerollDailyQuest`) — mijenjanje imena bi
// prekinulo klijente koji su u tom trenutku otvoreni.
export const rerollDailyQuest = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const taskId = request.data?.taskId
  if (typeof taskId !== 'string' || !taskId) {
    throw new HttpsError('invalid-argument', 'Nedostaje taskId.')
  }

  // Zamjena ne smije podijeliti quest koji tek treba da krene (`odDatuma`).
  const [sviTaskovi, events] = await Promise.all([getActiveTasks(), activeEventsFor(uid)])
  const pool = ponuda(sviTaskovi, dailyKey())
  const zadatak = pool.find((t) => t.id === taskId)
  if (!zadatak) throw new HttpsError('not-found', 'Taj quest ne postoji.')
  // Vanjski EPC zadaci su obećani kao "uvijek prisutni" — zamjena bi ih uklonila
  // do kraja perioda i to obećanje pretvorila u laž. Klijent im ionako ne
  // prikazuje dugme, ovo je brana za poziv koji zaobiđe UI.
  if (!smijeSeZamijeniti(zadatak)) {
    throw new HttpsError('failed-precondition', 'Ovaj quest je stalan i ne može se zamijeniti.')
  }
  const type = zadatak.type
  const kind = REROLL_KIND[type]
  if (!kind) throw new HttpsError('invalid-argument', 'Nepoznat tip questa.')

  const period = periodKey(type)
  const ref = db.doc(`users/${uid}`)
  let rezultat = null

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const p = snap.data()
    const zetona = p.rewards?.[kind] || 0
    if (zetona <= 0) throw new HttpsError('failed-precondition', 'Nemaš žetona za zamjenu.')

    const stanje = p.taskProgress?.[type]
    if (stanje?.period !== period || !Array.isArray(stanje.picked)) {
      throw new HttpsError('failed-precondition', 'Questovi nisu spremni.')
    }
    if (!stanje.picked.includes(taskId)) {
      throw new HttpsError('failed-precondition', 'Taj quest nije među tvojim zadacima.')
    }
    if (stanje.claimed?.[taskId]) {
      throw new HttpsError('failed-precondition', 'Nagrada za taj quest je već preuzeta.')
    }

    // Kandidati: aktivni questovi istog tipa koji nisu u igri, i čiji je event
    // živ (ili ga uopšte nemaju).
    // `always` questovi su već u izboru, pa ih ovdje ionako nema — filter je
    // brana za slučaj da neki uđe u bazen a izbor je zamrznut od ranije.
    const kandidati = pool.filter(
      (t) =>
        t.type === type &&
        !stanje.picked.includes(t.id) &&
        smijeSeZamijeniti(t) &&
        (!t.event || events.includes(t.event))
    )
    if (kandidati.length === 0) {
      throw new HttpsError('failed-precondition', 'Nema drugog questa za zamjenu.')
    }
    const novi = kandidati[Math.floor(Math.random() * kandidati.length)]
    const picked = stanje.picked.map((id) => (id === taskId ? novi.id : id))

    tx.update(ref, {
      [`rewards.${kind}`]: zetona - 1,
      [`taskProgress.${type}.picked`]: picked,
    })
    rezultat = { noviTaskId: novi.id, tip: type, preostaloZetona: zetona - 1 }
  })

  return rezultat
})

// ---------------------------------------------------------------------------
// ADMIN alati (Etapa 9) — sve traže custom claim admin:true.
// Namjerno rade SAMO nad vlastitim nalogom osim gdje je izričito drugačije:
// admin panel je alat za testiranje i gašenje požara, ne za mijenjanje tuđih
// rezultata. Svaki poziv se upisuje u adminLog radi traga.
// ---------------------------------------------------------------------------
function requireAdmin(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  if (request.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Samo za administratore.')
  }
  return uid
}

async function adminLog(uid, action, detalji = {}) {
  await db
    .collection('adminLog')
    .add({ uid, action, detalji, at: FieldValue.serverTimestamp() })
    .catch(() => {})
}

// Ponovna izgradnja indeksa banke pitanja (bank/index). Zove je admin panel
// poslije svakog snimanja pitanja — bez toga novo/izmijenjeno pitanje ne bi
// ušlo u izbor. Skupa je koliko i jedan stari scan banke, ali se dešava samo
// kad admin nešto snimi, a ne pri svakom kvizu.
export const adminRebuildBankIndex = onCall(async (request) => {
  const uid = requireAdmin(request)
  const count = await rebuildBankIndex()
  await adminLog(uid, 'rebuildBankIndex', { count })
  return { count }
})

// ---------------------------------------------------------------------------
// adminBroadcast — objava svim igračima, tekst piše admin.
//
// Za razliku od ostalih admin alata (koji rade samo nad vlastitim nalogom),
// ovo dira SVE i NE MOŽE se povući kad ode. Zato tri brane:
//   1. `test: true` šalje samo na admin-ove uređaje — da vidi kako izgleda
//      prije nego ode svima;
//   2. razmak od 30s između dvije objave, da dvostruki klik ili ponovljeni
//      poziv ne pošalju istu objavu dvaput;
//   3. igrači koji su ugasili tip 'najave' se preskaču — "ugasi notifikacije"
//      mora vrijediti i za objave, inače je prekidač lažan.
//
// `komu: <uid>` šalje poruku SAMO tom igraču (popis daje adminListPlayers).
//
// Objava NE gleda je li igrač danas igrao (nije podsjetnik na kviz) i ne pada
// na branu od 8h, ali JESTE postavlja lastNotifAt — da automatska poruka ne
// stigne minutu poslije objave.
// ---------------------------------------------------------------------------
const BROADCAST_RAZMAK = 30 * 1000
const BROADCAST_MAX_NASLOV = 60
const BROADCAST_MAX_TEKST = 160

export const adminBroadcast = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { naslov, tekst, url, test, komu } = request.data || {}

  const t = String(naslov || '').trim()
  const b = String(tekst || '').trim()
  if (t.length < 3) throw new HttpsError('invalid-argument', 'Naslov je prekratak.')
  if (t.length > BROADCAST_MAX_NASLOV)
    throw new HttpsError('invalid-argument', `Naslov može imati najviše ${BROADCAST_MAX_NASLOV} znakova.`)
  if (b.length < 3) throw new HttpsError('invalid-argument', 'Tekst je prekratak.')
  if (b.length > BROADCAST_MAX_TEKST)
    throw new HttpsError('invalid-argument', `Tekst može imati najviše ${BROADCAST_MAX_TEKST} znakova.`)

  // Samo interne rute — objava ne smije voditi van aplikacije.
  const cilj = typeof url === 'string' && /^\/[a-zA-Z0-9\-/]*$/.test(url) ? url : '/'

  const poruka = {
    title: t,
    body: b,
    url: cilj,
    tip: 'najave',
    tag: `najava-${Date.now()}`, // svaka objava stoji zasebno na ekranu
  }

  // --- Probno slanje: samo na vlastite uređaje ---
  if (test) {
    const meSnap = await db.doc(`users/${uid}`).get()
    const mojiTokeni = meSnap.exists ? meSnap.data().fcmTokens || [] : []
    if (mojiTokeni.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Nemaš nijedan uređaj s uključenim notifikacijama. Uključi ih na Profilu pa probaj opet.'
      )
    }
    const ok = await posaljiNotifikaciju(uid, mojiTokeni, poruka)
    return { test: true, uredjaja: mojiTokeni.length, poslano: ok }
  }

  // --- Slanje jednom igraču ---
  // Brana od 30s se NAMJERNO ne dira: ona čuva od ponovljene objave svima, a
  // poruka jednom igraču ne smije blokirati pravu objavu (ni obrnuto).
  if (komu) {
    if (typeof komu !== 'string' || !komu.trim())
      throw new HttpsError('invalid-argument', 'Nedostaje igrač.')

    const meta = await db.doc(`users/${komu}`).get()
    if (!meta.exists) throw new HttpsError('not-found', 'Taj igrač ne postoji.')
    const p = meta.data()
    const ime = p.displayName || 'Igrač'

    // Odjava vrijedi i za poruku upućenu samo njemu — inače je prekidač lažan.
    // Admin dobija izričitu grešku, da slanje ne izgleda kao da je prošlo.
    if (p.notifPrefs?.najave === false)
      throw new HttpsError('failed-precondition', `${ime} je isključio objave.`)

    const tokeni = p.fcmTokens || []
    if (tokeni.length === 0)
      throw new HttpsError(
        'failed-precondition',
        `${ime} nema nijedan uređaj s uključenim notifikacijama.`
      )

    const ok = await posaljiNotifikaciju(komu, tokeni, poruka)
    if (ok) await meta.ref.update({ lastNotifAt: Date.now(), lastNotifTip: 'najave' }).catch(() => {})
    await adminLog(uid, 'notifyUser', { komu, ime, naslov: t, tekst: b, url: cilj, poslano: ok })
    console.log(`adminBroadcast → ${ime} (${komu}): "${t}", poslano=${ok}`)
    return { komu, ime, uredjaja: tokeni.length, poslano: ok }
  }

  // --- Prava objava ---
  const branaRef = db.doc('config/broadcast')
  const branaSnap = await branaRef.get()
  const zadnjaObjava = branaSnap.exists ? branaSnap.data().lastAt || 0 : 0
  if (Date.now() - zadnjaObjava < BROADCAST_RAZMAK) {
    throw new HttpsError(
      'failed-precondition',
      'Prethodna objava je poslana prije manje od 30 sekundi. Sačekaj pa pokušaj ponovo.'
    )
  }
  await branaRef.set({ lastAt: Date.now(), uid, naslov: t }, { merge: true })

  const snap = await db.collection('users').where('notifOn', '==', true).get()
  const sada = Date.now()
  let primalaca = 0
  let uredjaja = 0
  let odjavljenih = 0

  for (const d of snap.docs) {
    const p = d.data()
    if (p.notifPrefs?.najave === false) {
      odjavljenih++
      continue
    }
    const tokeni = p.fcmTokens || []
    if (tokeni.length === 0) continue

    const ok = await posaljiNotifikaciju(d.id, tokeni, poruka)
    if (ok) {
      primalaca++
      uredjaja += tokeni.length
      await d.ref.update({ lastNotifAt: sada, lastNotifTip: 'najave' }).catch(() => {})
    }
  }

  await adminLog(uid, 'broadcast', { naslov: t, tekst: b, url: cilj, primalaca })
  console.log(`adminBroadcast: "${t}" → ${primalaca} igrača / ${uredjaja} uređaja`)
  return { primalaca, uredjaja, odjavljenih, pretplacenih: snap.size }
})

// Popis igrača za biranje primaoca u admin panelu. Vraća i stanje pretplate, da
// admin odmah vidi kome poruka uopšte može stići umjesto da to sazna tek iz
// greške poslije slanja.
//
// Čita cijelu kolekciju users, pa se NE zove pri otvaranju panela nego tek kad
// admin otvori izbor primaoca (vidi AdminObjava.jsx).
export const adminListPlayers = onCall(async (request) => {
  requireAdmin(request)

  const snap = await db.collection('users').get()
  const igraci = snap.docs
    .map((d) => {
      const p = d.data()
      return {
        uid: d.id,
        ime: p.displayName || '(bez imena)',
        uredjaja: (p.fcmTokens || []).length,
        notifOn: p.notifOn === true,
        najaveUgasene: p.notifPrefs?.najave === false,
      }
    })
    .sort((a, b) => a.ime.localeCompare(b.ime, 'bs'))

  return { igraci }
})

// ---------------------------------------------------------------------------
// VANJSKI (EPC) ZADACI — ručna dodjela napretka
// ---------------------------------------------------------------------------
// IZUZETAK od pravila da admin alati rade samo nad vlastitim nalogom: ovo je,
// uz adminBroadcast, jedina funkcija koja dira TUĐI profil. Mora — igrica ne
// vidi šta se dešava na Circle platformi, komentare i lajkove vidi samo admin.
//
// NE ISPLAĆUJE nagradu. Upisuje SAMO napredak (npr. 10/10 komentara); XP,
// žetone i zelene bodove igrač preuzima sam kroz claimTask, kao i kod svakog
// drugog questa. Time nijedna provjera nije zaobiđena, animacija nagrade radi
// normalno, i admin ne može slučajno isplatiti dvaput.

// Popis ručnih questova i trenutne vrijednosti za jednog igrača — panel iz
// jednog poziva zna i šta postoji i dokle je igrač stigao.
export const adminQuestStanje = onCall(async (request) => {
  requireAdmin(request)
  const uid = request.data?.uid
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje uid.')

  // Odgođeni questovi se ne nude ni u panelu: napredak upisan na quest koji
  // igrač još nema u izboru ionako ne bi mogao biti preuzet (claimTask ga odbija).
  const pool = ponuda(await getActiveTasks(), dailyKey())
  const rucni = pool
    .filter((t) => t.metric === 'manual')
    .sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.order || 0) - (b.order || 0))

  const snap = await db.doc(`users/${uid}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Taj igrač ne postoji.')
  const tp = snap.data().taskProgress || {}

  return {
    ime: snap.data().displayName || '(bez imena)',
    zadaci: rucni.map((t) => {
      const stored = tp[t.type]
      const vazi = stored?.period === periodKey(t.type)
      return {
        id: t.id,
        type: t.type,
        title: t.title,
        goal: t.goal,
        reward: t.reward,
        tokens: t.tokens || null,
        clanGold: t.clanGold || 0,
        vrijednost: vazi ? stored?.manual?.[t.id] || 0 : 0,
        preuzeto: vazi ? stored?.claimed?.[t.id] === true : false,
        period: periodKey(t.type),
      }
    }),
  }
})

export const adminSetQuestProgress = onCall(async (request) => {
  const adminUid = requireAdmin(request)
  const { uid, taskId } = request.data || {}
  const value = Math.round(Number(request.data?.value))
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje uid.')
  if (typeof taskId !== 'string' || !taskId) throw new HttpsError('invalid-argument', 'Nedostaje taskId.')
  if (!Number.isFinite(value) || value < 0) {
    throw new HttpsError('invalid-argument', 'Vrijednost mora biti broj ≥ 0.')
  }

  const taskSnap = await db.doc(`tasks/${taskId}`).get()
  if (!taskSnap.exists || !taskSnap.data().active) {
    throw new HttpsError('not-found', 'Task ne postoji.')
  }
  const task = taskSnap.data()
  // Brana da se ovim ne može falsifikovati napredak mjerljivog questa (broj
  // kvizova, tačni odgovori…). Ručno se dodjeljuje samo ono što se ručno i mjeri.
  if (task.metric !== 'manual') {
    throw new HttpsError('failed-precondition', 'Ovaj quest se mjeri automatski.')
  }

  // Izbor mora biti zamrznut prije upisa: bez toga bi period bio nepoznat, a
  // `always` zadatak ne bi bio u igračevoj listi pa nagradu ne bi mogao preuzeti.
  await ensureDailyPicks(uid)

  const period = periodKey(task.type)
  const ref = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'Taj igrač ne postoji.')
    const cur = snap.data().taskProgress?.[task.type]
    // Cijeli podobjekat se prepisuje spojen sa zatečenim: dotted put bi ostavio
    // brojače iz prošlog perioda da važe u novom.
    const base = cur?.period === period ? cur : emptyProgress(period)
    tx.update(ref, {
      [`taskProgress.${task.type}`]: {
        ...base,
        period,
        manual: { ...(base.manual || {}), [taskId]: value },
      },
    })
  })

  await adminLog(adminUid, 'setQuestProgress', { uid, taskId, value, period })
  return { ok: true, uid, taskId, value, goal: task.goal, period }
})

// Reset sedmičnog pokušaja Preživljavanja — isto što radi scripts/reset-survival.js,
// samo iz panela i uvijek nad SOBOM.
export const adminResetSurvival = onCall(async (request) => {
  const uid = requireAdmin(request)
  const week = survivalWeekKey()
  await db.doc(`survivalRuns/${uid}`).delete()
  await rtdb.ref(`survival/${week}/${uid}`).remove()
  await db.doc(`users/${uid}`).update({
    'eventStatus.survival': true,
    'eventStatus.survivalWeek': week,
    'taskProgress.daily.picked': null,
    survivalChest: null, // da se animacije kovčega mogu ponovo vidjeti
  })
  await adminLog(uid, 'resetSurvival', { week })
  return { ok: true, week }
})

// Postavljanje vlastitog XP-a — jedini način da se testira sve što ovisi o
// levelu (istaknuti bedževi na 10/20/30, rangovi, XP bar).
export const adminSetXp = onCall(async (request) => {
  const uid = requireAdmin(request)
  const xp = Math.max(0, Math.round(Number(request.data?.xp)))
  if (!Number.isFinite(xp)) throw new HttpsError('invalid-argument', 'XP mora biti broj.')
  await db.doc(`users/${uid}`).update({ xp })
  await adminLog(uid, 'setXp', { xp })
  return { ok: true, xp }
})

// Skrivanje s ljestvica. Uključivanje odmah briše zatečene unose sa sve četiri.
export const adminSetHidden = onCall(async (request) => {
  const uid = requireAdmin(request)
  const hidden = request.data?.hidden === true
  await db.doc(`users/${uid}`).update({ hideFromBoards: hidden })
  if (hidden) await purgeFromBoards(uid)
  await adminLog(uid, 'setHidden', { hidden })
  return { ok: true, hidden }
})

// Dodjela/oduzimanje okvira sebi — za provjeru izgleda bez čekanja eventa.
export const adminSetCosmetic = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { frameId, grant } = request.data || {}
  if (typeof frameId !== 'string' || !frameId) {
    throw new HttpsError('invalid-argument', 'Nedostaje frameId.')
  }
  const ref = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const c = s.data().cosmetics || {}
    const owned = c.owned || []
    const next = grant === false ? owned.filter((x) => x !== frameId) : [...new Set([...owned, frameId])]
    const patch = { 'cosmetics.owned': next }
    // Ako se skida ukras koji je trenutno na avataru, mora se skinuti i s
    // mjesta gdje stoji — inače bi ostao "duh" koji igrač ne može ukloniti.
    if (grant === false) {
      for (const slot of ['ring', 'background', 'aura']) {
        if (c[slot] === frameId) patch[`cosmetics.${slot}`] = null
      }
    }
    tx.update(ref, patch)
  })
  await adminLog(uid, 'setCosmetic', { frameId, grant: grant !== false })
  return { ok: true }
})

// Sve okvire odjednom (i skidanje svih) — najbrži put do pregleda kolekcije.
export const adminGrantAllCosmetics = onCall(async (request) => {
  const uid = requireAdmin(request)
  const ids = Array.isArray(request.data?.ids) ? request.data.ids.filter((x) => typeof x === 'string') : []
  const clear = request.data?.clear === true
  if (clear) {
    await db.doc(`users/${uid}`).update({
      'cosmetics.owned': [],
      'cosmetics.ring': null,
      'cosmetics.background': null,
      'cosmetics.aura': null,
    })
    await adminLog(uid, 'clearCosmetics')
    return { ok: true, owned: 0 }
  }
  if (ids.length === 0) throw new HttpsError('invalid-argument', 'Nema id-eva.')
  await db.doc(`users/${uid}`).update({ 'cosmetics.owned': ids })
  await adminLog(uid, 'grantAllCosmetics', { count: ids.length })
  return { ok: true, owned: ids.length }
})

// ---------------------------------------------------------------------------
// ADMIN — kontrola eventa (Prioritet 1).
// Vikend eventi su jedino što ima ROK: ako nešto zapne u subotu uveče, ovo su
// poluge da se popravi bez skripte s računara. Oba configa server keširaju 30 s,
// pa izmjena stupa na snagu najkasnije za pola minute.
// ---------------------------------------------------------------------------

// Prozor mora biti smislen, inače se event zaglavi na način koji se teško
// dijagnostikuje: prijave prije igre, igra poslije prijava, sve rastuće.
function validirajTurnirProzor({ regOpenAt, regCloseAt, openAt, closeAt }) {
  const t = [regOpenAt, regCloseAt, openAt, closeAt]
  if (t.some((x) => !Number.isFinite(x) || x <= 0)) {
    throw new HttpsError('invalid-argument', 'Svi termini moraju biti brojevi (ms).')
  }
  if (regOpenAt >= regCloseAt) {
    throw new HttpsError('invalid-argument', 'Prijave se moraju zatvoriti poslije otvaranja.')
  }
  if (regCloseAt > openAt) {
    throw new HttpsError('invalid-argument', 'Igra ne smije početi prije zatvaranja prijava.')
  }
  if (openAt >= closeAt) {
    throw new HttpsError('invalid-argument', 'Igra se mora završiti poslije početka.')
  }
}

// Prozor turnira (config/tournament) — zamjenjuje scripts/postavi-turnir-config.js.
export const adminSetTournamentConfig = onCall(async (request) => {
  const uid = requireAdmin(request)
  const d = request.data || {}
  const key = typeof d.key === 'string' && d.key.trim() ? d.key.trim() : null
  if (!key) throw new HttpsError('invalid-argument', 'Nedostaje ključ eventa.')
  const prozor = {
    regOpenAt: Number(d.regOpenAt),
    regCloseAt: Number(d.regCloseAt),
    openAt: Number(d.openAt),
    closeAt: Number(d.closeAt),
  }
  validirajTurnirProzor(prozor)

  const prije = await db.doc('config/tournament').get()
  const stariKljuc = prije.exists ? prije.data().key : null
  // Promjena ključa pravi NOVI event: bracket, prijave i XP trka žive pod
  // ključem, pa se stari podaci ne miješaju s novim. Zato se posebno bilježi.
  await db.doc('config/tournament').set({
    enabled: d.enabled !== false,
    ...prozor,
    key,
    label: typeof d.label === 'string' && d.label.trim() ? d.label.trim() : 'Vikend turnir',
    updatedAt: FieldValue.serverTimestamp(),
  })
  tournamentConfigCache = null // ne čekaj 30 s na vlastitoj instanci
  await adminLog(uid, 'setTournamentConfig', { ...prozor, key, noviKljuc: stariKljuc !== key })
  return { ok: true, key, noviKljuc: stariKljuc !== key }
})

// Prozor Preživljavanja (config/survival).
export const adminSetSurvivalConfig = onCall(async (request) => {
  const uid = requireAdmin(request)
  const openAt = Number(request.data?.openAt)
  const closeAt = Number(request.data?.closeAt)
  if (!Number.isFinite(openAt) || !Number.isFinite(closeAt) || openAt >= closeAt) {
    throw new HttpsError('invalid-argument', 'Prozor mora biti rastući par termina.')
  }
  await db.doc('config/survival').set({
    enabled: request.data?.enabled !== false,
    openAt,
    closeAt,
    label: 'Sedmični izazov preživljavanja',
    updatedAt: FieldValue.serverTimestamp(),
  })
  survivalConfigCache = null
  await adminLog(uid, 'setSurvivalConfig', { openAt, closeAt })
  return { ok: true }
})

// Prisilno zatvaranje tekuće runde. tournamentTick ide svakih 30 min — ovo je
// poluga kad se runda zaglavi ili kad se ne čeka na raspored.
export const adminForceResolveRound = onCall(async (request) => {
  const uid = requireAdmin(request)
  const cfg = await getTournamentConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivnog turnira.')
  const snap = await db.doc(`tournaments/${cfg.key}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Bracket još nije napravljen.')
  const t = snap.data()
  if (t.status !== 'active') {
    throw new HttpsError('failed-precondition', `Turnir nije aktivan (status: ${t.status}).`)
  }
  const runda = t.currentRound
  await resolveRound(cfg.key, t)
  await adminLog(uid, 'forceResolveRound', { tid: cfg.key, runda })
  return { ok: true, runda }
})

// Ponovna izgradnja bracketa iz trenutnih prijava. Briše mečeve i turnir doc,
// pa gradi nanovo — za slučaj da je bracket napravljen s pogrešnim sastavom.
// Prijave (participants) ostaju netaknute.
export const adminRebuildBracket = onCall(async (request) => {
  const uid = requireAdmin(request)
  const cfg = await getTournamentConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivnog turnira.')
  const tid = cfg.key
  const mecevi = await db.collection(`tournaments/${tid}/matches`).get()
  const batch = db.batch()
  for (const d of mecevi.docs) batch.delete(d.ref)
  batch.delete(db.doc(`tournaments/${tid}`))
  await batch.commit()
  await buildBracket(tid, cfg)
  const novi = await db.doc(`tournaments/${tid}`).get()
  await adminLog(uid, 'rebuildBracket', { tid, obrisanoMeceva: mecevi.size })
  return { ok: true, ucesnika: novi.exists ? novi.data().participantCount || 0 : 0 }
})

// Otkazivanje turnira: gasi config i označava bracket kao otkazan.
// `clearParticipants` uz to briše i prijave — koristi kad se event pomjera, da
// se ljudi prijave nanovo i ne misle da su još u igri.
export const adminCancelTournament = onCall(async (request) => {
  const uid = requireAdmin(request)
  const cfg = await getTournamentConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivnog turnira.')
  const tid = cfg.key
  await db.doc('config/tournament').set({ enabled: false }, { merge: true })
  tournamentConfigCache = null
  await db
    .doc(`tournaments/${tid}`)
    .set({ status: 'finished', cancelled: true, cancelledAt: FieldValue.serverTimestamp() }, { merge: true })

  let obrisanePrijave = 0
  if (request.data?.clearParticipants === true) {
    const ps = await db.collection(`tournaments/${tid}/participants`).get()
    const batch = db.batch()
    for (const d of ps.docs) batch.delete(d.ref)
    await batch.commit()
    obrisanePrijave = ps.size
  }
  await adminLog(uid, 'cancelTournament', { tid, obrisanePrijave })
  return { ok: true, obrisanePrijave }
})

// Finalizacija XP trke ODMAH, ne čekajući closeAt i tick. Ne radi ništa ako je
// već finalizovana — dvostruka isplata nagrada ide samo preko poništavanja.
export const adminFinalizeXpRaceNow = onCall(async (request) => {
  const uid = requireAdmin(request)
  const cfg = await getXpRaceConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivne XP trke.')
  const xr = await db.doc(`xpRaces/${cfg.key}`).get()
  if (xr.exists && xr.data().finalized) {
    throw new HttpsError('failed-precondition', 'XP trka je već finalizovana.')
  }
  await finalizeXpRace(cfg.key)
  await adminLog(uid, 'finalizeXpRaceNow', { tid: cfg.key })
  return { ok: true }
})

// Poništavanje finalizacije XP trke.
// PAŽNJA: sljedeća finalizacija isplaćuje nagrade PONOVO — 500/300/150 XP
// odlazi drugi put. Zato traži izričitu potvrdu i uvijek se loguje.
export const adminUnfinalizeXpRace = onCall(async (request) => {
  const uid = requireAdmin(request)
  if (request.data?.confirmDoublePay !== true) {
    throw new HttpsError('failed-precondition', 'Potrebna je izričita potvrda dvostruke isplate.')
  }
  const cfg = await getXpRaceConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivne XP trke.')
  await db.doc(`xpRaces/${cfg.key}`).delete()
  await adminLog(uid, 'unfinalizeXpRace', { tid: cfg.key })
  return { ok: true }
})

// Prozor XP trke (config/xpRace) — od sada nezavisan od duel turnira.
// Prvi upis ujedno "otcjepljuje" trku: dok dokument ne postoji, server je vodi
// po prozoru turnira.
export const adminSetXpRaceConfig = onCall(async (request) => {
  const uid = requireAdmin(request)
  const d = request.data || {}
  const key = typeof d.key === 'string' && d.key.trim() ? d.key.trim() : null
  if (!key) throw new HttpsError('invalid-argument', 'Nedostaje ključ XP trke.')
  const openAt = Number(d.openAt)
  const closeAt = Number(d.closeAt)
  if (!Number.isFinite(openAt) || !Number.isFinite(closeAt) || openAt <= 0 || openAt >= closeAt) {
    throw new HttpsError('invalid-argument', 'Prozor trke mora biti rastući par termina.')
  }
  await db.doc('config/xpRace').set({
    enabled: d.enabled !== false,
    openAt,
    closeAt,
    key,
    label: typeof d.label === 'string' && d.label.trim() ? d.label.trim() : 'XP trka',
    updatedAt: FieldValue.serverTimestamp(),
  })
  xpRaceConfigCache = null
  await adminLog(uid, 'setXpRaceConfig', { key, openAt, closeAt })
  return { ok: true, key }
})

// Trenutno stanje eventa za panel — jedan poziv umjesto pet čitanja s klijenta.
export const adminEventStatus = onCall(async (request) => {
  requireAdmin(request)
  const cfg = await getTournamentConfig()
  const sur = await getSurvivalConfig()
  const xcfg = await getXpRaceConfig()
  // Dok config/xpRace ne postoji, getXpRaceConfig vraća prozor turnira. Panel
  // to mora znati, da ne prikaže "odvojeno" ono što još dijeli isti prozor.
  const xpOdvojen = (await db.doc('config/xpRace').get()).exists

  let turnir = null
  let prijava = 0
  if (cfg?.key) {
    const [tSnap, pSnap] = await Promise.all([
      db.doc(`tournaments/${cfg.key}`).get(),
      db.collection(`tournaments/${cfg.key}/participants`).count().get(),
    ])
    turnir = tSnap.exists
      ? {
          status: tSnap.data().status,
          currentRound: tSnap.data().currentRound || 0,
          rounds: tSnap.data().rounds || 0,
          cancelled: !!tSnap.data().cancelled,
          winnerUid: tSnap.data().winnerUid || null,
          roundDeadlines: tSnap.data().roundDeadlines || [],
        }
      : null
    prijava = pSnap.data().count
  }

  let xpTrka = null
  if (xcfg?.key) {
    const xSnap = await db.doc(`xpRaces/${xcfg.key}`).get()
    const lb = await rtdb.ref(`tournament/${xcfg.key}`).get()
    xpTrka = {
      finalized: xSnap.exists ? !!xSnap.data().finalized : false,
      ucesnika: Object.keys(lb.val() || {}).length,
    }
  }
  return {
    tournament: cfg || null,
    xpRace: xcfg || null,
    xpOdvojen,
    survival: sur || null,
    turnir,
    prijava,
    xpTrka,
    now: Date.now(),
  }
})

// ---------------------------------------------------------------------------
// ADMIN — 1v1 turnir: poluge za sve što može poći po zlu tokom eventa.
//
// Turnir je jedini dio igre gdje greška ima ROK: ako runda propadne, propali su
// i mečevi u njoj. Zato panel mora moći sve što do sada tražilo ručnu izmjenu u
// bazi — vidjeti ko je odigrao, pomjeriti rok, proglasiti pobjednika, vratiti
// zaglavljen duel i počistiti bracket.
// ---------------------------------------------------------------------------

// Zajednički uvod za sve poluge: aktivan turnir + njegov dokument.
async function turnirZaAdmina() {
  const cfg = await getTournamentConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivnog turnira.')
  const snap = await db.doc(`tournaments/${cfg.key}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Bracket još nije napravljen.')
  return { tid: cfg.key, cfg, t: snap.data() }
}

// Živi pregled turnira: svi mečevi s imenima, brojem tačnih i vremenom
// završetka + popis problema.
//
// Ovo je odgovor na "hoću vidjeti čim neko odigra koliko je tačno odgovorio":
// skor je u meču od trenutka predaje, samo ga do sada niko nije prikazivao
// adminu (igračima ostaje skriven do zatvaranja runde — to se ne mijenja).
export const adminTurnirPregled = onCall(async (request) => {
  requireAdmin(request)
  const cfg = await getTournamentConfig()
  if (!cfg?.key) return { nema: true }
  const tid = cfg.key
  const [tSnap, pSnap, mSnap] = await Promise.all([
    db.doc(`tournaments/${tid}`).get(),
    db.collection(`tournaments/${tid}/participants`).get(),
    db.collection(`tournaments/${tid}/matches`).get(),
  ])
  const imena = {}
  for (const d of pSnap.docs) imena[d.id] = d.data().name || 'Farmaceut'
  const ucesnici = pSnap.docs
    .map((d) => ({ uid: d.id, ime: imena[d.id] }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'bs'))

  if (!tSnap.exists) {
    return { tid, bracket: false, ucesnici, mecevi: [], problemi: [], now: Date.now() }
  }
  const t = tSnap.data()
  const mecevi = mSnap.docs
    .map((d) => {
      const m = d.data()
      return {
        id: d.id,
        round: m.round,
        slot: m.slot,
        status: m.status,
        winner: m.winner || null,
        winnerIme: m.winner ? imena[m.winner] || '—' : null,
        p1: m.p1 || null,
        p2: m.p2 || null,
        p1Ime: m.p1 ? imena[m.p1] || '—' : null,
        p2Ime: m.p2 ? imena[m.p2] || '—' : null,
        p1Score: m.p1Score ?? null,
        p2Score: m.p2Score ?? null,
        p1Played: !!m.p1Played,
        p2Played: !!m.p2Played,
        p1FinishedAt: m.p1FinishedAt || null,
        p2FinishedAt: m.p2FinishedAt || null,
        pitanja: (m.questionIds || []).length,
      }
    })
    .sort((a, b) => a.round - b.round || a.slot - b.slot)

  // --- Dijagnostika: šta je već pošlo po zlu ---
  const now = Date.now()
  const problemi = []
  const prazni = mecevi.filter((m) => !m.p1 && !m.p2)
  if (prazni.length > 0) {
    problemi.push({
      tip: 'prazni',
      tekst: `${prazni.length} mečeva bez ijednog igrača — višak bracketa. Očisti ih.`,
    })
  }
  const rok = (t.roundDeadlines || [])[(t.currentRound || 1) - 1]
  if (t.status === 'active' && rok && now > rok + 45 * 60000) {
    problemi.push({
      tip: 'rok',
      tekst: `Rok runde ${t.currentRound} je prošao prije više od 45 min, a runda još nije zatvorena. Tick ide svakih 30 min — ako i dalje stoji, zatvori je ručno.`,
    })
  }
  if (t.status === 'active' && (t.roundDeadlines || []).length < (t.rounds || 0)) {
    problemi.push({ tip: 'raspored', tekst: 'Rokovi nisu postavljeni za sve runde.' })
  }
  const nerastuci = (t.roundDeadlines || []).some((d, i, a) => i > 0 && d <= a[i - 1])
  if (nerastuci) problemi.push({ tip: 'raspored', tekst: 'Rokovi rundi nisu rastući.' })
  const pitanjaFale = mecevi.filter((m) => (m.p1 || m.p2) && m.pitanja < DUEL_QUESTIONS)
  if (pitanjaFale.length > 0) {
    problemi.push({
      tip: 'pitanja',
      tekst: `${pitanjaFale.length} mečeva nema punih ${DUEL_QUESTIONS} pitanja.`,
    })
  }

  // Zaglavljene sesije: duel otvoren, vrijeme davno isteklo, a skor nije upisan.
  const sesije = await db.collection('duelSessions').get()
  const zaglavljene = []
  for (const d of sesije.docs) {
    const s = d.data()
    if (s.tid !== tid || s.finished) continue
    const proteklo = (now - (s.startedAt || now)) / 1000
    if (proteklo > DUEL_TOTAL_SECONDS + 300) {
      zaglavljene.push({
        uid: s.uid,
        ime: imena[s.uid] || '—',
        matchId: s.matchId,
        odgovoreno: (s.answers || []).length,
        minuta: Math.round(proteklo / 60),
      })
    }
  }
  if (zaglavljene.length > 0) {
    problemi.push({
      tip: 'sesije',
      tekst: `${zaglavljene.length} duela je otvoreno, a vrijeme im je davno isteklo. Skor se upisuje tek kad igrač otvori ekran — zatvori ih ručno ili zatvori rundu.`,
    })
  }

  // Ko u tekućoj rundi još nije odigrao (za podsjetnik).
  const neodigrali = []
  if (t.status === 'active') {
    for (const m of mecevi.filter((x) => x.round === t.currentRound && x.status !== 'done')) {
      if (m.p1 && m.p2) {
        if (!m.p1Played) neodigrali.push({ uid: m.p1, ime: m.p1Ime })
        if (!m.p2Played) neodigrali.push({ uid: m.p2, ime: m.p2Ime })
      }
    }
  }

  return {
    tid,
    bracket: true,
    status: t.status,
    currentRound: t.currentRound || 0,
    rounds: t.rounds || 0,
    cancelled: !!t.cancelled,
    winnerUid: t.winnerUid || null,
    roundDeadlines: t.roundDeadlines || [],
    ucesnici,
    mecevi,
    zaglavljene,
    neodigrali,
    problemi,
    now,
  }
})

// Rokovi rundi. `auto: true` ih iznova izračuna po BiH terminima (08/14/20)
// od početka eventa — poluga kad je bracket napravljen po starom rasporedu i
// runde padaju usred noći.
export const adminSetRoundDeadlines = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { tid, t } = await turnirZaAdmina()
  const rounds = t.rounds || 0
  let rokovi
  if (request.data?.auto === true) {
    const cfg = await getTournamentConfig()
    rokovi = rasporedRundi(Number(request.data?.pocetak) || cfg.openAt || Date.now(), rounds)
  } else {
    rokovi = (request.data?.roundDeadlines || []).map(Number)
  }
  if (rokovi.length !== rounds) {
    throw new HttpsError('invalid-argument', `Treba tačno ${rounds} rokova, stiglo ${rokovi.length}.`)
  }
  if (rokovi.some((x) => !Number.isFinite(x) || x <= 0)) {
    throw new HttpsError('invalid-argument', 'Svi rokovi moraju biti brojevi (ms).')
  }
  if (rokovi.some((x, i) => i > 0 && x <= rokovi[i - 1])) {
    throw new HttpsError('invalid-argument', 'Rokovi moraju rasti od runde do runde.')
  }
  await db.doc(`tournaments/${tid}`).update({ roundDeadlines: rokovi })
  await adminLog(uid, 'setRoundDeadlines', { tid, rokovi, auto: request.data?.auto === true })
  return { ok: true, roundDeadlines: rokovi }
})

// Brisanje mečeva čija grana nema NIJEDNOG igrača.
//
// Bracket građen po starom pravilu je 20 prijavljenih smjestio u 32 mjesta tako
// da je šest mečeva prve runde ostalo prazno; prazno se penje kroz stablo i
// pravi kolone bez ijednog imena. Ovo ih briše, a mečeve s igračima i sve
// upisane skorove ne dira.
export const adminPruneEmptyMatches = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { tid, t } = await turnirZaAdmina()
  // Bez broja rundi se ne zna dokle ide stablo — a pogrešan odgovor ovdje briše
  // cijeli bracket. Radije stani.
  if (!t.rounds) throw new HttpsError('failed-precondition', 'Turnir nema upisan broj rundi.')
  const snap = await db.collection(`tournaments/${tid}/matches`).get()
  const po = {}
  for (const d of snap.docs) po[d.id] = { ref: d.ref, ...d.data() }

  // Grana je prazna ako ni meč ni ijedan njegov predak-hranilac nema igrača.
  // Ide se od prve runde naviše, pa je odgovor za hranioce već poznat.
  const imaIgraca = {}
  for (let r = 1; r <= (t.rounds || 0); r++) {
    for (const id of Object.keys(po)) {
      const m = po[id]
      if (m.round !== r) continue
      const svoji = !!(m.p1 || m.p2)
      const ispod =
        r === 1 ? false : !!(imaIgraca[`r${r - 1}s${m.slot * 2}`] || imaIgraca[`r${r - 1}s${m.slot * 2 + 1}`])
      imaIgraca[id] = svoji || ispod
    }
  }

  const zaBrisanje = Object.keys(po).filter((id) => !imaIgraca[id])
  if (zaBrisanje.length === 0) return { ok: true, obrisano: 0 }
  const batch = db.batch()
  for (const id of zaBrisanje) batch.delete(po[id].ref)
  await batch.commit()
  await adminLog(uid, 'pruneEmptyMatches', { tid, obrisano: zaBrisanje.length, ids: zaBrisanje })
  return { ok: true, obrisano: zaBrisanje.length, ids: zaBrisanje }
})

// Ručno proglašavanje pobjednika jednog meča (i prosljeđivanje dalje).
// Za slučaj žalbe, pokvarenog pitanja ili meča koji se zaglavio.
export const adminSetMatchWinner = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { tid, t } = await turnirZaAdmina()
  const matchId = String(request.data?.matchId || '')
  const winner = request.data?.winner ? String(request.data.winner) : null
  const mRef = db.doc(`tournaments/${tid}/matches/${matchId}`)
  const mSnap = await mRef.get()
  if (!mSnap.exists) throw new HttpsError('not-found', 'Taj meč ne postoji.')
  const m = mSnap.data()
  if (winner && winner !== m.p1 && winner !== m.p2) {
    throw new HttpsError('invalid-argument', 'Taj igrač nije u ovom meču.')
  }
  await mRef.update({ winner, status: 'done', rucnoOdlucen: true })
  if (m.round < (t.rounds || 0)) await propagate(tid, m.round, m.slot, winner)
  await adminLog(uid, 'setMatchWinner', { tid, matchId, winner })
  return { ok: true }
})

// Vraćanje igračevog duela na početak: briše sesiju i njegov skor u meču.
//
// Za slučaj kad duel padne na pola (mreža, pokvareno pitanje) pa igrač ostane s
// upisanim skorom koji nije odigrao. NE dira protivnika i NE dira mečeve koji
// su već zatvoreni.
export const adminResetDuel = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { tid } = await turnirZaAdmina()
  const igrac = String(request.data?.uid || '')
  const matchId = String(request.data?.matchId || '')
  if (!igrac || !matchId) throw new HttpsError('invalid-argument', 'Treba igrač i meč.')
  const mRef = db.doc(`tournaments/${tid}/matches/${matchId}`)
  const mSnap = await mRef.get()
  if (!mSnap.exists) throw new HttpsError('not-found', 'Taj meč ne postoji.')
  const m = mSnap.data()
  if (m.status === 'done') {
    throw new HttpsError('failed-precondition', 'Meč je zatvoren — prvo vrati pobjednika ili sačekaj novu rundu.')
  }
  const patch =
    m.p1 === igrac
      ? { p1Score: null, p1Played: false, p1FinishedAt: FieldValue.delete() }
      : m.p2 === igrac
        ? { p2Score: null, p2Played: false, p2FinishedAt: FieldValue.delete() }
        : null
  if (!patch) throw new HttpsError('invalid-argument', 'Taj igrač nije u ovom meču.')
  await mRef.update(patch)
  await db.doc(`duelSessions/${tid}_${igrac}`).delete().catch(() => {})
  await adminLog(uid, 'resetDuel', { tid, igrac, matchId })
  return { ok: true }
})

// Zatvaranje zaglavljenih duela: igraču kojem je vrijeme isteklo, a nije se
// vratio na ekran, upisuje se skor iz onoga što je stigao odgovoriti.
//
// Bez ovoga skor uđe u meč tek kad igrač ponovo otvori duel; ako to ne uradi do
// zatvaranja runde, prolazi kao da nije ni igrao.
export const adminZatvoriZaglavljene = onCall(async (request) => {
  const uid = requireAdmin(request)
  const { tid } = await turnirZaAdmina()
  const snap = await db.collection('duelSessions').get()
  const now = Date.now()
  let zatvoreno = 0
  for (const d of snap.docs) {
    const s = d.data()
    if (s.tid !== tid || s.finished) continue
    if ((now - (s.startedAt || now)) / 1000 <= DUEL_TOTAL_SECONDS + 300) continue
    await zavrsiDuel(s.uid, tid, d.ref, s, s.answers || [])
    zatvoreno++
  }
  await adminLog(uid, 'zatvoriZaglavljene', { tid, zatvoreno })
  return { ok: true, zatvoreno }
})

// Dodavanje i uklanjanje prijave. Radi samo dok bracket nije napravljen —
// poslije toga bi promjena sastava značila novi bracket (Napravi bracket nanovo).
export const adminSetParticipant = onCall(async (request) => {
  const admin = requireAdmin(request)
  const cfg = await getTournamentConfig()
  if (!cfg?.key) throw new HttpsError('failed-precondition', 'Nema aktivnog turnira.')
  const tid = cfg.key
  const igrac = String(request.data?.uid || '')
  const dodaj = request.data?.dodaj !== false
  if (!igrac) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')
  if ((await db.doc(`tournaments/${tid}`).get()).exists) {
    throw new HttpsError(
      'failed-precondition',
      'Bracket je već napravljen — promijeni sastav pa pokreni „Napravi bracket nanovo".'
    )
  }
  if (dodaj) {
    const us = await db.doc(`users/${igrac}`).get()
    if (!us.exists) throw new HttpsError('not-found', 'Taj igrač ne postoji.')
    const p = us.data()
    await db.doc(`tournaments/${tid}/participants/${igrac}`).set(
      { name: p.displayName || 'Farmaceut', avatar: p.avatar || 'a1', registeredAt: FieldValue.serverTimestamp(), dodaoAdmin: true },
      { merge: true }
    )
  } else {
    await db.doc(`tournaments/${tid}/participants/${igrac}`).delete()
  }
  await adminLog(admin, 'setParticipant', { tid, igrac, dodaj })
  return { ok: true }
})

// Podsjetnik igračima koji u tekućoj rundi još nisu odigrali.
//
// Namjerno nije obična objava: ide SAMO onima kojima meč istječe, i nosi rok u
// tekstu. Odjava od notifikacija se poštuje kao i svugdje.
export const adminPodsjetiNeodigrale = onCall(async (request) => {
  const admin = requireAdmin(request)
  const { tid, t } = await turnirZaAdmina()
  if (t.status !== 'active') throw new HttpsError('failed-precondition', 'Turnir nije aktivan.')
  const round = t.currentRound
  const snap = await db.collection(`tournaments/${tid}/matches`).where('round', '==', round).get()
  const kome = new Set()
  for (const d of snap.docs) {
    const m = d.data()
    if (m.status === 'done' || !m.p1 || !m.p2) continue
    if (!m.p1Played) kome.add(m.p1)
    if (!m.p2Played) kome.add(m.p2)
  }
  const rok = (t.roundDeadlines || [])[round - 1]
  const kada = rok
    ? new Intl.DateTimeFormat('bs-BA', { timeZone: 'Europe/Sarajevo', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(rok))
    : 'uskoro'
  const poruka = {
    title: `Tvoj duel čeka — runda ${round}`,
    body: `Odigraj do ${kada} ili prolazi protivnik.`,
    url: '/turnir',
    tip: 'turnir',
    tag: `duel-podsjetnik-${tid}-r${round}`,
  }

  let poslano = 0
  let bezUredjaja = 0
  let odjavljenih = 0
  for (const igrac of kome) {
    const us = await db.doc(`users/${igrac}`).get()
    if (!us.exists) continue
    const p = us.data()
    if (p.notifPrefs?.turnir === false) {
      odjavljenih++
      continue
    }
    const tokeni = p.fcmTokens || []
    if (tokeni.length === 0) {
      bezUredjaja++
      continue
    }
    if (await posaljiNotifikaciju(igrac, tokeni, poruka)) {
      poslano++
      await us.ref.update({ lastNotifAt: Date.now(), lastNotifTip: 'turnir' }).catch(() => {})
    }
  }
  await adminLog(admin, 'podsjetiNeodigrale', { tid, round, kome: kome.size, poslano })
  return { ok: true, kome: kome.size, poslano, bezUredjaja, odjavljenih }
})

// ---------------------------------------------------------------------------
// syncProfileToLeaderboard — svaka promjena profila (ime, avatar, XP...)
// osvježava globalni leaderboard unos. Klijent NE piše u leaderboard (pravila).
// ---------------------------------------------------------------------------
export const syncProfileToLeaderboard = onDocumentWritten('users/{uid}', async (event) => {
  const after = event.data?.after
  if (!after?.exists) return // profil obrisan — ništa
  const profile = after.data()

  // Filter: profil se piše mnogo češće nego što se ljestvica mijenja —
  // taskProgress, quizLimit, lastQuizAt, eventStatus, survivalChest i sve
  // ostalo okidaju ovaj trigger, a na ljestvici ne znače ništa. Bez ovoga je
  // to ~1.500 uzaludnih invokacija i isto toliko RTDB upisa dnevno.
  //
  // Poredi se SAMO ono od čega unos zavisi (vidi leaderboardEntry i isHidden).
  // Level se ne poredi jer je čista funkcija XP-a. AKO SE leaderboardEntry
  // IKAD PROŠIRI NOVIM POLJEM, DODATI GA I OVDJE — inače ljestvica tiho
  // zastari na tom polju.
  const naLjestvici = (p) =>
    JSON.stringify([
      p.displayName || 'Farmaceut',
      p.avatar || 'a1',
      p.streak || 0,
      p.xp || 0,
      p.hideFromBoards === true,
    ])
  const prije = event.data?.before?.exists ? event.data.before.data() : null
  if (prije && naLjestvici(prije) === naLjestvici(profile)) return
  // Skriveni igrač se ne upisuje, nego BRIŠE — inače bi zatečeni unos ostao
  // na ljestvici zauvijek poslije uključivanja skrivanja.
  if (isHidden(profile)) {
    await rtdb.ref(`leaderboard/global/${event.params.uid}`).remove()
    return
  }
  const cfg = await getLevelConfig()
  const totalXp = profile.xp || 0
  await rtdb.ref(`leaderboard/global/${event.params.uid}`).set({
    ...leaderboardEntry(profile, levelFromXp(totalXp, cfg)),
    xp: totalXp,
  })
})

// ===========================================================================
// PUSH NOTIFIKACIJE (Faza 2, F2.2)
//
// Cilj je povratak igrača, a ne obavještavanje po svaku cijenu. Zato su brane
// ugrađene u sam raspored, ne dopisane naknadno:
//
//   - tick ide SAMO dva puta dnevno po BiH vremenu (9 i 20h). Time nema
//     noćnih poruka po konstrukciji, i čitanja su 2x(broj pretplaćenih) dnevno
//     umjesto 48x svi igrači — inače bi ovaj posao pojeo uštede iz P1-P6.
//   - dakle najviše DVIJE poruke dnevno, i to samo igraču koji taj dan NIJE
//     igrao; ko je odigrao kviz ne dobija ništa (users.lastNotifAt + provjera
//     lastPlayDay u notif-odluka.js)
//   - svaki tip se može ugasiti zasebno (users.notifPrefs.<tip>)
//   - kad su dva razloga aktivna istovremeno, šalje se onaj višeg prioriteta
//
// Poruke su DATA-ONLY — notifikaciju sastavlja public/push-sw.js, pa je format
// pod našom kontrolom (vidi komentar u tom fajlu).
// ===========================================================================

// Pravila o tome KOME i KADA ide poruka žive u notif-odluka.js kao čiste
// funkcije — testiraju se bez emulatora i bez slanja ijedne prave notifikacije
// (scripts/test-notifikacije.mjs). Ovdje ostaje samo ono što dira Firebase.

// Pošalji na sve uređaje igrača i očisti tokene koje je FCM odbio.
// Vraća true ako je bar jedan uređaj primio poruku.
async function posaljiNotifikaciju(uid, tokeni, poruka) {
  if (!tokeni || tokeni.length === 0) return false

  const odgovor = await getMessaging().sendEachForMulticast({
    tokens: tokeni,
    data: {
      title: poruka.title,
      body: poruka.body,
      url: poruka.url || '/',
      tip: poruka.tip,
      // tag određuje hoće li nova poruka ZAMIJENITI staru na ekranu. Automatske
      // poruke dijele tag po tipu (nema smisla gomilati tri podsjetnika na
      // kviz), a objave dobiju svoj pa se ne brišu međusobno.
      tag: poruka.tag || poruka.tip,
    },
    webpush: { headers: { Urgency: 'normal', TTL: '86400' } },
  })

  // Mrtvi tokeni (deinstalirana aplikacija, obrisan keš) inače ostaju zauvijek
  // i svaki sljedeći tick pokušava slanje na njih.
  const mrtvi = []
  odgovor.responses.forEach((r, i) => {
    const kod = r.error?.code || ''
    if (
      kod.includes('registration-token-not-registered') ||
      kod.includes('invalid-argument') ||
      kod.includes('invalid-registration-token')
    ) {
      mrtvi.push(tokeni[i])
    }
  })
  if (mrtvi.length > 0) {
    const preostali = tokeni.filter((t) => !mrtvi.includes(t))
    await db
      .doc(`users/${uid}`)
      .update({
        fcmTokens: FieldValue.arrayRemove(...mrtvi),
        // Nestao zadnji uređaj → skini i zastavicu, da igrač ispadne iz upita
        // sljedećeg ticka umjesto da se čita zauvijek.
        ...(preostali.length === 0 ? { notifOn: false } : {}),
      })
      .catch(() => {})
  }

  return odgovor.successCount > 0
}

export const notifTick = onSchedule(
  { schedule: '0 9,20 * * *', timeZone: BIH_TZ },
  async () => {
    const { hh: sat } = bihParts()
    const sada = Date.now()
    const danas = utcDayKey()
    const danUSedmici = new Date().getUTCDay()

    const tcfg = await db.doc('config/tournament').get()
    const turnir = turnirskaPoruka(tcfg.exists ? tcfg.data() : null, sada, sat)

    // Samo igrači koji su uključili notifikacije. Filtrira se po BOOLEAN polju
    // notifOn, a ne nejednakošću nad fcmTokens: fcmTokens je niz, a nejednakost
    // nad nizom Firestore indeksira kao array-contains i ne ponaša se očekivano.
    // Ovako se čita 3 x (broj pretplaćenih) dokumenata dnevno.
    const snap = await db.collection('users').where('notifOn', '==', true).get()

    let poslano = 0
    for (const doc0 of snap.docs) {
      const profile = doc0.data()
      const tokeni = profile.fcmTokens || []
      if (tokeni.length === 0) continue
      if (!smijePrimiti(profile, sada)) continue

      // Već sortirano po prioritetu i filtrirano po postavkama igrača.
      const kandidati = kandidatiZaNotifikaciju(profile, {
        sat,
        sada,
        danas,
        danUSedmici,
        turnir,
      })
      if (kandidati.length === 0) continue

      const uspjeh = await posaljiNotifikaciju(doc0.id, tokeni, kandidati[0])
      if (uspjeh) {
        await doc0.ref.update({ lastNotifAt: sada, lastNotifTip: kandidati[0].tip })
        poslano++
      }
    }

    console.log(`notifTick ${sat}h: pregledano ${snap.size}, poslano ${poslano}`)
  }
)

// ===========================================================================
// KLANOVI
//
// Model:
//   clans/{clanId}              ime, tag, founderId, advisorIds, memberIds,
//                               pendingRequests, clanLevel, clanXP,
//                               founderLastActiveAt, disbandedAt
//   clanMembers/{uid}           { clanId, role, joinedAt } — denormalizovan
//                               lookup "u kojem sam klanu"; mjerodavan je ipak
//                               dokument klana, ovo je keš za brz upit
//   clanNames/{ime}             rezervacija jedinstvenog imena
//   clanCompetitions/{weekId}/registrations/{clanId}
//
// users/{uid}.clan i dalje drži IME klana, ne id — to polje postoji od Etape 1
// i Profil ga ispisuje direktno. Id je u clanMembers/{uid}.clanId.
//
// Sva pravila (level, limiti, uloge, prozori) provjeravaju se OVDJE: klijent po
// firestore.rules ne može pisati ni u jednu klansku kolekciju. Sama pravila su
// čiste funkcije u klan-pravila.js i testiraju se s `npm run test-klanovi`.
// ===========================================================================

const clanRef = (clanId) => db.doc(`clans/${clanId}`)
const clanMemberRef = (uid) => db.doc(`clanMembers/${uid}`)

function requireAuth(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijava je obavezna.')
  return uid
}

// Klan pozivaoca + njegova uloga. Baca ako igrač nije ni u jednom klanu.
async function mojKlan(uid) {
  const m = await clanMemberRef(uid).get()
  const clanId = m.exists ? m.data().clanId : null
  if (!clanId) throw new HttpsError('failed-precondition', 'Nisi član nijednog klana.')
  const snap = await clanRef(clanId).get()
  if (!snap.exists || snap.data().disbandedAt) throw new HttpsError('not-found', 'Klan ne postoji.')
  const clan = { id: snap.id, ...snap.data() }
  return { clan, uloga: ulogaU(clan, uid) }
}

// Javni podaci članova za ekran klana. Čita se najviše 10 profila.
async function clanoviSaProfilima(clan) {
  const ids = clan.memberIds || []
  if (ids.length === 0) return []
  const cfg = await getLevelConfig()
  const snaps = await db.getAll(...ids.map((id) => db.doc(`users/${id}`)))
  return snaps
    .filter((s) => s.exists)
    .map((s) => {
      const p = s.data()
      return {
        uid: s.id,
        ime: p.displayName || 'Farmaceut',
        avatar: p.avatar || 'a1',
        xp: p.xp || 0,
        level: levelFromXp(p.xp || 0, cfg),
        uloga: ulogaU(clan, s.id),
        lastPlayDay: p.lastPlayDay || null,
      }
    })
    .sort((a, b) => (b.xp || 0) - (a.xp || 0))
}

// In-app obavijest + push. Obavijest se upisuje na profil (clanNotice) jer push
// nestane s ekrana, a promjenu vodstva igrač mora vidjeti i kad je propustio
// notifikaciju. Push poštuje notifPrefs.klan — kao i svaka druga vrsta poruke.
async function obavijestiClan(clan, { naslov, tekst }, osimUid = null) {
  const ids = (clan.memberIds || []).filter((id) => id !== osimUid)
  if (ids.length === 0) return
  const snaps = await db.getAll(...ids.map((id) => db.doc(`users/${id}`)))
  const sada = Date.now()

  for (const s of snaps) {
    if (!s.exists) continue
    const p = s.data()
    await s.ref.update({ clanNotice: { naslov, tekst, at: sada } }).catch(() => {})
    const tokeni = p.fcmTokens || []
    if (tokeni.length === 0 || p.notifOn !== true) continue
    if (!notifUkljucen(p, 'klan')) continue
    const ok = await posaljiNotifikaciju(s.id, tokeni, {
      title: naslov,
      body: tekst,
      url: '/klan',
      tip: 'klan',
      tag: 'klan',
    })
    if (ok) await s.ref.update({ lastNotifAt: sada, lastNotifTip: 'klan' }).catch(() => {})
  }
}

// Osnivanje klana. Level se računa iz XP-a — polje users.level ne diraju sve
// putanje bodovanja, pa nije mjerodavno.
// Poruka o zabrani govori KOLIKO je ostalo, ne samo da je zabranjeno — igrač
// inače ne zna čeka li sat ili sedmicu.
function porukaZabrane(ostaloMs) {
  const sati = Math.ceil(ostaloMs / 3600000)
  if (sati >= 24) {
    const dana = Math.ceil(sati / 24)
    return `Napustio/la si klan — novom se možeš pridružiti za ${dana} ${dana === 1 ? 'dan' : 'dana'}.`
  }
  return `Napustio/la si klan — novom se možeš pridružiti za ${sati} ${sati === 1 ? 'sat' : 'sata'}.`
}

export const createClan = onCall(async (request) => {
  const uid = requireAuth(request)
  const { name, tag } = request.data || {}

  const imeCheck = validirajIme(name)
  if (!imeCheck.ok) throw new HttpsError('invalid-argument', imeCheck.greska)
  const tagCheck = validirajTag(tag)
  if (!tagCheck.ok) throw new HttpsError('invalid-argument', tagCheck.greska)

  const cfg = await getLevelConfig()
  const kljuc = kljucImena(imeCheck.vrijednost)
  const noviRef = db.collection('clans').doc()

  await db.runTransaction(async (tx) => {
    const [me, clanstvo, imeDoc] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(clanMemberRef(uid)),
      tx.get(db.doc(`clanNames/${kljuc}`)),
    ])
    if (!me.exists) throw new HttpsError('not-found', 'Profil ne postoji.')

    const level = levelFromXp(me.data().xp || 0, cfg)
    if (!mozeOsnovati(level))
      throw new HttpsError(
        'failed-precondition',
        `Klan može osnovati igrač od levela ${MIN_LEVEL_OSNIVANJE}. Ti si na levelu ${level}.`
      )
    if (clanstvo.exists && clanstvo.data().clanId)
      throw new HttpsError('failed-precondition', 'Već si član klana.')
    // Zabrana poslije izlaska pokriva i osnivanje — inače se zaobilazi u dva
    // dodira: osnuj svoj klan pa pozovi koga hoćeš.
    const ostaloOsn = zabranaOstalo(me.data())
    if (ostaloOsn > 0) throw new HttpsError('failed-precondition', porukaZabrane(ostaloOsn))
    if (imeDoc.exists) throw new HttpsError('already-exists', 'Klan s tim imenom već postoji.')

    tx.set(noviRef, {
      name: imeCheck.vrijednost,
      tag: tagCheck.vrijednost,
      founderId: uid,
      advisorIds: [],
      memberIds: [uid],
      pendingRequests: [],
      createdAt: FieldValue.serverTimestamp(),
      createdDay: utcDayKey(),
      clanLevel: 1,
      clanXP: 0,
      founderLastActiveAt: FieldValue.serverTimestamp(),
      disbandedAt: null,
    })
    tx.set(db.doc(`clanNames/${kljuc}`), {
      clanId: noviRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })
    tx.set(clanMemberRef(uid), {
      clanId: noviRef.id,
      role: 'founder',
      joinedAt: FieldValue.serverTimestamp(),
    })
    tx.update(db.doc(`users/${uid}`), { clan: imeCheck.vrijednost })
  })

  return { clanId: noviRef.id, name: imeCheck.vrijednost, tag: tagCheck.vrijednost }
})

// Zahtjev za ulazak. Bez ograničenja po levelu — pridruživanje je mehanizam
// povratka igrača, svaka prepreka tu radi protiv cilja.
export const requestJoinClan = onCall(async (request) => {
  const uid = requireAuth(request)
  const { clanId } = request.data || {}
  if (typeof clanId !== 'string' || !clanId)
    throw new HttpsError('invalid-argument', 'Nedostaje klan.')

  await db.runTransaction(async (tx) => {
    const [clanstvo, snap, me] = await Promise.all([
      tx.get(clanMemberRef(uid)),
      tx.get(clanRef(clanId)),
      tx.get(db.doc(`users/${uid}`)),
    ])
    if (clanstvo.exists && clanstvo.data().clanId)
      throw new HttpsError('failed-precondition', 'Već si član klana. Prvo izađi iz njega.')
    const ostalo = zabranaOstalo(me.exists ? me.data() : null)
    if (ostalo > 0) throw new HttpsError('failed-precondition', porukaZabrane(ostalo))
    if (!snap.exists || snap.data().disbandedAt)
      throw new HttpsError('not-found', 'Taj klan ne postoji.')

    const clan = snap.data()
    if ((clan.memberIds || []).includes(uid))
      throw new HttpsError('failed-precondition', 'Već si u tom klanu.')
    if ((clan.pendingRequests || []).includes(uid))
      throw new HttpsError('already-exists', 'Zahtjev je već poslan.')
    // Popunjen klan namjerno ne prima ni zahtjeve — inače se skupi red koji
    // niko ne može odobriti, a igrač čeka bez ikakvog znaka da nema šanse.
    if (!imaMjesta(clan)) throw new HttpsError('failed-precondition', 'Klan je popunjen.')

    tx.update(clanRef(clanId), { pendingRequests: FieldValue.arrayUnion(uid) })
  })

  return { ok: true }
})

// Odobravanje zahtjeva — osnivač i savjetnici.
export const approveJoinRequest = onCall(async (request) => {
  const odobrava = requireAuth(request)
  const { uid } = request.data || {}
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')

  const { clan } = await mojKlan(odobrava)
  let ime = 'Farmaceut'

  await db.runTransaction(async (tx) => {
    const [snap, kandidat, kandidatProfil] = await Promise.all([
      tx.get(clanRef(clan.id)),
      tx.get(clanMemberRef(uid)),
      tx.get(db.doc(`users/${uid}`)),
    ])
    if (!snap.exists || snap.data().disbandedAt) throw new HttpsError('not-found', 'Klan ne postoji.')
    const svjez = { id: snap.id, ...snap.data() }

    if (!smijeUpravljati(ulogaU(svjez, odobrava)))
      throw new HttpsError('permission-denied', 'Samo osnivač i savjetnici odobravaju zahtjeve.')
    if (!(svjez.pendingRequests || []).includes(uid))
      throw new HttpsError('not-found', 'Taj zahtjev više ne postoji.')
    // Limit se provjerava nad SVJEŽIM dokumentom unutar transakcije: dva
    // savjetnika mogu odobravati istovremeno, i bez ovoga bi klan prešao limit.
    if (!imaMjesta(svjez))
      throw new HttpsError('failed-precondition', `Klan je popunjen (${MAX_CLANOVA} članova).`)
    if (kandidat.exists && kandidat.data().clanId)
      throw new HttpsError('failed-precondition', 'Igrač je u međuvremenu ušao u drugi klan.')

    ime = kandidatProfil.exists ? kandidatProfil.data().displayName || 'Farmaceut' : 'Farmaceut'

    tx.update(clanRef(clan.id), {
      memberIds: FieldValue.arrayUnion(uid),
      pendingRequests: FieldValue.arrayRemove(uid),
    })
    tx.set(clanMemberRef(uid), {
      clanId: clan.id,
      role: 'member',
      joinedAt: FieldValue.serverTimestamp(),
    })
    if (kandidatProfil.exists) tx.update(db.doc(`users/${uid}`), { clan: svjez.name })
  })

  const svjez = await clanRef(clan.id).get()
  await obavijestiClan(
    { id: clan.id, ...svjez.data() },
    { naslov: 'Novi član klana', tekst: `${ime} se pridružio klanu ${clan.name}.` },
    odobrava
  )

  return { ok: true, ime }
})

export const rejectJoinRequest = onCall(async (request) => {
  const odbija = requireAuth(request)
  const { uid } = request.data || {}
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')

  const { clan, uloga } = await mojKlan(odbija)
  if (!smijeUpravljati(uloga))
    throw new HttpsError('permission-denied', 'Samo osnivač i savjetnici odbijaju zahtjeve.')

  await clanRef(clan.id).update({ pendingRequests: FieldValue.arrayRemove(uid) })
  return { ok: true }
})

// Skidanje igrača s članstva — zajednička putanja za "izađi sam" i "izbačen".
// Kad ode osnivač, vodstvo se prenosi ODMAH, a ne tek sljedećom dnevnom
// provjerom: klan bez osnivača ne može odobravati zahtjeve ni prijaviti se na
// takmičenje, pa bi čekanje do 24h bilo tiho gašenje klana.
async function ukloniClana(clanId, uid) {
  let ishod = { raspusten: false, noviFounder: null, ime: 'Farmaceut' }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clanRef(clanId))
    if (!snap.exists || snap.data().disbandedAt) throw new HttpsError('not-found', 'Klan ne postoji.')
    const clan = { id: snap.id, ...snap.data() }

    const profil = await tx.get(db.doc(`users/${uid}`))
    if (profil.exists) ishod.ime = profil.data().displayName || 'Farmaceut'

    const preostali = (clan.memberIds || []).filter((id) => id !== uid)
    const noviSavjetnici = (clan.advisorIds || []).filter((id) => id !== uid)

    // Zadnji član je otišao → klan se gasi. Dokument ostaje radi istorije, ali
    // se rezervacija imena BRIŠE — inače bi ime ostalo zauzeto zauvijek i niko
    // ga ne bi mogao ponovo uzeti.
    if (preostali.length === 0) {
      tx.update(clanRef(clanId), {
        memberIds: [],
        advisorIds: [],
        pendingRequests: [],
        disbandedAt: FieldValue.serverTimestamp(),
      })
      tx.delete(db.doc(`clanNames/${kljucImena(clan.name)}`))
      tx.set(clanMemberRef(uid), { clanId: null, role: null, joinedAt: null })
      if (profil.exists) tx.update(db.doc(`users/${uid}`), { clan: null })
      ishod.raspusten = true
      return
    }

    const izmjene = {
      memberIds: preostali,
      advisorIds: noviSavjetnici,
      pendingRequests: FieldValue.arrayRemove(uid),
    }

    if (clan.founderId === uid) {
      const profili = await tx.getAll(...preostali.map((id) => db.doc(`users/${id}`)))
      const nasljednik = izaberiNasljednika(
        profili.filter((p) => p.exists).map((p) => ({ uid: p.id, xp: p.data().xp || 0 }))
      )
      if (nasljednik) {
        izmjene.founderId = nasljednik
        // Novi osnivač prestaje biti savjetnik — inače bi držao dvije uloge i
        // zauzimao jedno od dva savjetnička mjesta bez potrebe.
        izmjene.advisorIds = noviSavjetnici.filter((id) => id !== nasljednik)
        izmjene.founderLastActiveAt = FieldValue.serverTimestamp()
        tx.set(
          clanMemberRef(nasljednik),
          { clanId, role: 'founder', joinedAt: FieldValue.serverTimestamp() },
          { merge: true }
        )
        ishod.noviFounder = nasljednik
      }
    }

    tx.update(clanRef(clanId), izmjene)
    tx.set(clanMemberRef(uid), { clanId: null, role: null, joinedAt: null })
    if (profil.exists) tx.update(db.doc(`users/${uid}`), { clan: null })
  })

  return ishod
}

export const leaveClan = onCall(async (request) => {
  const uid = requireAuth(request)
  const { clan } = await mojKlan(uid)

  const ishod = await ukloniClana(clan.id, uid)
  // Zabrana od 7 dana teče od DOBROVOLJNOG izlaska. Bez nje se u ratu skače
  // iz klana u klan i doprinos se seli tamo gdje se baš tog dana pobjeđuje.
  // Koga vođa izbaci (kickMember) NE dobija zabranu — za tuđu odluku se ne
  // kažnjava; zato oznaka stoji ovdje, a ne u ukloniClana.
  await db
    .doc(`users/${uid}`)
    .update({ clanCooldownUntil: Date.now() + KLAN_ZABRANA_MS })
    .catch(() => {})

  if (!ishod.raspusten) {
    const svjez = await clanRef(clan.id).get()
    const podaci = { id: clan.id, ...svjez.data() }
    if (ishod.noviFounder) {
      const novi = await db.doc(`users/${ishod.noviFounder}`).get()
      const imeNovog = novi.exists ? novi.data().displayName || 'Farmaceut' : 'Farmaceut'
      await obavijestiClan(podaci, {
        naslov: 'Novi vođa klana',
        tekst: `${ishod.ime} je napustio klan. Vodstvo preuzima ${imeNovog}.`,
      })
    } else {
      await obavijestiClan(podaci, {
        naslov: 'Član je napustio klan',
        tekst: `${ishod.ime} više nije u klanu ${clan.name}.`,
      })
    }
  }

  return { ok: true, raspusten: ishod.raspusten, noviFounder: ishod.noviFounder }
})

export const kickMember = onCall(async (request) => {
  const izvrsilac = requireAuth(request)
  const { uid } = request.data || {}
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')
  if (uid === izvrsilac) throw new HttpsError('invalid-argument', 'Sebe ne možeš izbaciti — koristi izlazak iz klana.')

  const { clan, uloga } = await mojKlan(izvrsilac)
  const ciljUloga = ulogaU(clan, uid)
  if (!ciljUloga) throw new HttpsError('not-found', 'Taj igrač nije u tvom klanu.')
  if (!smijeIzbaciti(uloga, ciljUloga))
    throw new HttpsError(
      'permission-denied',
      ciljUloga === 'founder'
        ? 'Osnivač se ne može izbaciti.'
        : 'Savjetnik ne može izbaciti drugog savjetnika.'
    )

  const ishod = await ukloniClana(clan.id, uid)
  const svjez = await clanRef(clan.id).get()
  if (!ishod.raspusten) {
    await obavijestiClan({ id: clan.id, ...svjez.data() }, {
      naslov: 'Član izbačen',
      tekst: `${ishod.ime} je uklonjen iz klana ${clan.name}.`,
    })
  }

  return { ok: true }
})

export const assignAdvisor = onCall(async (request) => {
  const izvrsilac = requireAuth(request)
  const { uid } = request.data || {}
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')

  const { clan } = await mojKlan(izvrsilac)
  let ime = 'Farmaceut'

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clanRef(clan.id))
    if (!snap.exists || snap.data().disbandedAt) throw new HttpsError('not-found', 'Klan ne postoji.')
    const svjez = { id: snap.id, ...snap.data() }

    if (!smijeMijenjatiSavjetnike(ulogaU(svjez, izvrsilac)))
      throw new HttpsError('permission-denied', 'Savjetnike imenuje samo osnivač.')
    const ciljUloga = ulogaU(svjez, uid)
    if (!ciljUloga) throw new HttpsError('not-found', 'Taj igrač nije u klanu.')
    if (ciljUloga !== 'member') throw new HttpsError('failed-precondition', 'Igrač već ima ulogu.')
    if (!mozeJosSavjetnika(svjez))
      throw new HttpsError('failed-precondition', `Klan već ima ${MAX_SAVJETNIKA} savjetnika.`)

    const profil = await tx.get(db.doc(`users/${uid}`))
    if (profil.exists) ime = profil.data().displayName || 'Farmaceut'

    tx.update(clanRef(clan.id), { advisorIds: FieldValue.arrayUnion(uid) })
    tx.set(clanMemberRef(uid), { role: 'advisor' }, { merge: true })
  })

  const svjez = await clanRef(clan.id).get()
  await obavijestiClan({ id: clan.id, ...svjez.data() }, {
    naslov: 'Novi savjetnik',
    tekst: `${ime} je postao savjetnik klana ${clan.name}.`,
  })

  return { ok: true }
})

export const removeAdvisor = onCall(async (request) => {
  const izvrsilac = requireAuth(request)
  const { uid } = request.data || {}
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')

  const { clan, uloga } = await mojKlan(izvrsilac)
  if (!smijeMijenjatiSavjetnike(uloga))
    throw new HttpsError('permission-denied', 'Savjetnike smjenjuje samo osnivač.')
  if (!(clan.advisorIds || []).includes(uid))
    throw new HttpsError('not-found', 'Taj igrač nije savjetnik.')

  await clanRef(clan.id).update({ advisorIds: FieldValue.arrayRemove(uid) })
  await clanMemberRef(uid).set({ role: 'member' }, { merge: true })
  return { ok: true }
})

// Raspuštanje — samo osnivač. Dokument klana OSTAJE (disbandedAt), da istorija
// takmičenja ne izgubi ime klana koji je učestvovao.
export const disbandClan = onCall(async (request) => {
  const uid = requireAuth(request)
  const { clan, uloga } = await mojKlan(uid)
  if (!smijeRaspustiti(uloga))
    throw new HttpsError('permission-denied', 'Klan može raspustiti samo osnivač.')

  const clanovi = clan.memberIds || []

  // Obavijest ide PRIJE brisanja članstva — poslije toga se više ne zna kome.
  await obavijestiClan(clan, {
    naslov: 'Klan je raspušten',
    tekst: `Klan ${clan.name} je raspustio osnivač.`,
  }, uid)

  const batch = db.batch()
  batch.update(clanRef(clan.id), {
    disbandedAt: FieldValue.serverTimestamp(),
    memberIds: [],
    advisorIds: [],
    pendingRequests: [],
  })
  for (const id of clanovi) {
    batch.set(clanMemberRef(id), { clanId: null, role: null, joinedAt: null })
    batch.update(db.doc(`users/${id}`), { clan: null })
  }
  batch.delete(db.doc(`clanNames/${kljucImena(clan.name)}`))
  await batch.commit()

  return { ok: true, oslobodjeno: clanovi.length }
})

// Prijava na sedmično takmičenje. Prozor: subota cijeli dan i nedjelja do
// 20:00 po BiH vremenu. UI dugme se gasi izvan prozora, ali provjera koja
// stvarno vrijedi je ova.
export const registerForCompetition = onCall(async (request) => {
  const uid = requireAuth(request)
  const { clan, uloga } = await mojKlan(uid)
  if (!smijePrijavitiNaTakmicenje(uloga))
    throw new HttpsError('permission-denied', 'Klan prijavljuje osnivač ili savjetnik.')

  const p = bihParts()
  if (!registracijaOtvorena(p))
    throw new HttpsError(
      'failed-precondition',
      'Prijave su otvorene subotom i nedjeljom do 20:00.'
    )

  const weekId = weekIdZaRegistraciju(p)
  const ref = db.doc(`clanCompetitions/${weekId}/registrations/${clan.id}`)
  const postoji = await ref.get()
  if (postoji.exists) throw new HttpsError('already-exists', 'Klan je već prijavljen za tu sedmicu.')

  await ref.set({
    clanId: clan.id,
    name: clan.name,
    tag: clan.tag || null,
    memberIds: clan.memberIds || [],
    memberCount: (clan.memberIds || []).length,
    registeredBy: uid,
    registeredAt: FieldValue.serverTimestamp(),
  })
  await db.doc(`clanCompetitions/${weekId}`).set(
    {
      weekId,
      pocetak: `${weekId}T08:00 Europe/Sarajevo`,
      kraj: 'petak 18:00 Europe/Sarajevo',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return { ok: true, weekId }
})

// Podaci klana za ekrane "Moj klan" i "Upravljanje klanom".
// Detalje o igračima (XP, level, najbolji rezultat u Preživljavanju) dobijaju
// SAMO osnivač i savjetnici — običnom članu se vraća lista imena i uloga.
export const getClanOverview = onCall(async (request) => {
  const uid = requireAuth(request)
  const m = await clanMemberRef(uid).get()
  const clanId = m.exists ? m.data().clanId : null
  if (!clanId) return { clan: null }

  const snap = await clanRef(clanId).get()
  if (!snap.exists || snap.data().disbandedAt) return { clan: null }
  const clan = { id: snap.id, ...snap.data() }
  const uloga = ulogaU(clan, uid)
  const clanovi = await clanoviSaProfilima(clan)

  let zahtjevi = []
  if (smijeUpravljati(uloga) && (clan.pendingRequests || []).length > 0) {
    const cfg = await getLevelConfig()
    const [snaps, stablo] = await Promise.all([
      db.getAll(...clan.pendingRequests.map((id) => db.doc(`users/${id}`))),
      survivalStablo(),
    ])
    zahtjevi = snaps
      .filter((s) => s.exists)
      .map((s) => {
        const p = s.data()
        return {
          uid: s.id,
          ime: p.displayName || 'Farmaceut',
          avatar: p.avatar || 'a1',
          xp: p.xp || 0,
          level: levelFromXp(p.xp || 0, cfg),
          survival: najboljiSurvivalIz(stablo, s.id),
        }
      })
  }

  const p = bihParts()
  const weekId = weekIdZaRegistraciju(p)
  return {
    clan: {
      id: clan.id,
      name: clan.name,
      tag: clan.tag || null,
      founderId: clan.founderId,
      advisorIds: clan.advisorIds || [],
      clanLevel: clan.clanLevel || 1,
      clanXP: clan.clanXP || 0,
      memberCount: (clan.memberIds || []).length,
      maxClanova: MAX_CLANOVA,
    },
    uloga,
    clanovi,
    zahtjevi,
    takmicenje: {
      registracijaOtvorena: registracijaOtvorena(p),
      weekId,
      prijavljen: await jePrijavljen(clan.id, weekId),
    },
  }
})

// Javni prikaz BILO KOJEG klana — otvoren svim prijavljenim igračima, i onima
// koji su već u nekom klanu.
//
// Sastav klana je glavni podatak pri odluci kojem se pridružiti, a ranije se
// nije mogao vidjeti ni prije ulaska (popis je nudio samo ime i broj članova)
// ni poslije (ekran "Pronađi klan" se skrivao članovima). Ovdje se vraća isto
// što i vlastiti klan vidi o sebi, MINUS ono što je unutrašnja stvar kluba:
// zahtjevi za učlanjenje i datum posljednje aktivnosti osnivača.
export const getClanDetails = onCall(async (request) => {
  const uid = requireAuth(request)
  const { clanId } = request.data || {}
  if (typeof clanId !== 'string') throw new HttpsError('invalid-argument', 'Nedostaje clanId.')

  const snap = await clanRef(clanId).get()
  if (!snap.exists || snap.data().disbandedAt) throw new HttpsError('not-found', 'Klan ne postoji.')
  const clan = { id: snap.id, ...snap.data() }

  return {
    clan: {
      id: clan.id,
      name: clan.name,
      tag: clan.tag || null,
      founderId: clan.founderId,
      advisorIds: clan.advisorIds || [],
      clanLevel: clan.clanLevel || 1,
      clanXP: clan.clanXP || 0,
      memberCount: (clan.memberIds || []).length,
      maxClanova: MAX_CLANOVA,
      createdAt: clan.createdAt?.toMillis?.() || null,
    },
    clanovi: await clanoviSaProfilima(clan),
    // Da ekran zna ponuditi pravo dugme: član gleda tuđi klan, svoj, ili je bez
    // klana. Zahtjev je već poslan ako stoji u pendingRequests.
    jaSam: {
      clan: (clan.memberIds || []).includes(uid),
      zahtjevPoslan: (clan.pendingRequests || []).includes(uid),
    },
  }
})

async function jePrijavljen(clanId, weekId) {
  const s = await db.doc(`clanCompetitions/${weekId}/registrations/${clanId}`).get()
  return s.exists
}

// Najbolji rezultat u Preživljavanju: niz i sedmica u kojoj je postignut.
// Čita se iz RTDB-a (survival/{week}/{uid}), gdje već stoji po sedmicama —
// profil taj podatak ne nosi, a dodavati ga na vrući put bodovanja zbog ekrana
// koji otvara osnivač ne bi bilo pošteno prema trošku.
//
// Stablo se čita JEDNOM po pozivu i pretražuje u memoriji: pozvati ovo po
// svakom igraču značilo bi isto stablo povučeno deset puta.
async function survivalStablo() {
  const snap = await rtdb.ref('survival').get()
  return snap.exists() ? snap.val() || {} : {}
}

function najboljiSurvivalIz(stablo, uid) {
  let najbolji = null
  for (const [week, igraci] of Object.entries(stablo)) {
    const zapis = igraci?.[uid]
    if (!zapis) continue
    const streak = zapis.streak || 0
    if (!najbolji || streak > najbolji.streak) najbolji = { week, streak }
  }
  return najbolji
}

// Detaljan profil jednog igrača — za ekran "Upravljanje klanom".
// Vidljiv osnivaču i savjetnicima, i to samo za igrače iz VLASTITOG klana ili
// one koji su poslali zahtjev; inače bi ovo bio otvoren pregled tuđih profila.
export const getClanPlayerDetails = onCall(async (request) => {
  const trazi = requireAuth(request)
  const { uid } = request.data || {}
  if (typeof uid !== 'string' || !uid) throw new HttpsError('invalid-argument', 'Nedostaje igrač.')

  const { clan, uloga } = await mojKlan(trazi)
  if (!smijeUpravljati(uloga))
    throw new HttpsError('permission-denied', 'Detalje vide osnivač i savjetnici.')
  const dozvoljen =
    (clan.memberIds || []).includes(uid) || (clan.pendingRequests || []).includes(uid)
  if (!dozvoljen) throw new HttpsError('permission-denied', 'Taj igrač nije vezan za tvoj klan.')

  const s = await db.doc(`users/${uid}`).get()
  if (!s.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
  const p = s.data()
  const cfg = await getLevelConfig()

  return {
    uid,
    ime: p.displayName || 'Farmaceut',
    avatar: p.avatar || 'a1',
    xp: p.xp || 0,
    level: levelFromXp(p.xp || 0, cfg),
    streak: p.streak || 0,
    lastPlayDay: p.lastPlayDay || null,
    uloga: ulogaU(clan, uid),
    survival: najboljiSurvivalIz(await survivalStablo(), uid),
  }
})

// Dnevna provjera neaktivnih osnivača.
//
// Neaktivnost se mjeri postojećim users.lastPlayDay — server ga već piše pri
// svakom kvizu, pa provjera ne košta nijedan dodatan upis. Kad osnivač nikad
// nije igrao, mjeri se od dana osnivanja klana.
export const checkFounderInactivity = onSchedule(
  { schedule: '0 5 * * *', timeZone: BIH_TZ },
  async () => {
    const danas = utcDayKey()
    const snap = await db.collection('clans').where('disbandedAt', '==', null).get()
    let promijenjeno = 0
    let raspusteno = 0

    for (const d of snap.docs) {
      const clan = { id: d.id, ...d.data() }
      const clanovi = clan.memberIds || []

      if (clanovi.length === 0) {
        await d.ref.update({ disbandedAt: FieldValue.serverTimestamp() })
        await db.doc(`clanNames/${kljucImena(clan.name)}`).delete().catch(() => {})
        raspusteno++
        continue
      }

      const founderUnutra = clanovi.includes(clan.founderId)
      let treba = !founderUnutra

      if (founderUnutra) {
        const f = await db.doc(`users/${clan.founderId}`).get()
        const lastPlayDay = f.exists ? f.data().lastPlayDay || null : null
        treba = jeNeaktivan(lastPlayDay, danas, clan.createdDay || null, NEAKTIVNOST_DANA)
      }
      if (!treba) continue

      const kandidati = clanovi.filter((id) => id !== clan.founderId)
      if (kandidati.length === 0) {
        // Osnivač je jedini član i neaktivan je — klan se ne dira. Raspuštanje
        // bi mu obrisalo klan dok je samo na godišnjem.
        continue
      }

      const profili = await db.getAll(...kandidati.map((id) => db.doc(`users/${id}`)))
      const nasljednik = izaberiNasljednika(
        profili.filter((p) => p.exists).map((p) => ({ uid: p.id, xp: p.data().xp || 0 }))
      )
      if (!nasljednik) continue

      await d.ref.update({
        founderId: nasljednik,
        advisorIds: (clan.advisorIds || []).filter((id) => id !== nasljednik),
        memberIds: founderUnutra ? clanovi : clanovi.filter((id) => id !== clan.founderId),
        founderLastActiveAt: FieldValue.serverTimestamp(),
      })
      await clanMemberRef(nasljednik).set({ clanId: clan.id, role: 'founder' }, { merge: true })
      if (!founderUnutra) {
        await clanMemberRef(clan.founderId)
          .set({ clanId: null, role: null, joinedAt: null })
          .catch(() => {})
      }

      const novi = await db.doc(`users/${nasljednik}`).get()
      const imeNovog = novi.exists ? novi.data().displayName || 'Farmaceut' : 'Farmaceut'
      const svjez = await d.ref.get()
      await obavijestiClan(
        { id: d.id, ...svjez.data() },
        {
          naslov: 'Novi vođa klana',
          tekst: founderUnutra
            ? `Osnivač je bio neaktivan ${NEAKTIVNOST_DANA} dana. Vodstvo preuzima ${imeNovog}.`
            : `Osnivač je napustio klan. Vodstvo preuzima ${imeNovog}.`,
        }
      )
      promijenjeno++
    }

    console.log(
      `checkFounderInactivity: pregledano ${snap.size}, novo vodstvo ${promijenjeno}, raspušteno ${raspusteno}`
    )
  }
)

// ===========================================================================
// KLANSKI RAT ("Zeleni Okrug")
//
// Ponedjeljak 08:00 → petak 20:00. Svaki XP koji igrač osvoji nosi 1 CP svom
// klanu, uz množioce (srijeda: kategorija ×1.5, petak 08–20: sve ×2) i bonus
// za dnevno učešće. U petak u 20:00 meč se zatvara: pobjednik nosi rating i
// zelene bodove kojima klan gradi Okrug.
//
// ARHITEKTURA — zašto je bodovanje u RTDB-u, a ne u Firestoreu:
// jedan XP događaj bi u Firestoreu bio 6. upis u lanac koji P2 iz
// optimizacijskog izvještaja tek treba sažeti. Zato CIJELO živo bodovanje
// (CP klana, CP člana, dnevna aktivnost, dnevni strop igrača) živi u RTDB-u uz
// transakcije — isti obrazac kao leaderboardi. Firestore drži samo metapodatke
// rata i konačan rezultat, tj. onoliko upisa koliko ima mečeva, jednom sedmično.
//
//   RTDB  clanWar/{warId}/{clanId}/cp                 živi skor klana
//                                 /meta               ime/tag za prikaz
//                                 /members/{uid}      { name, avatar, cp }
//                                 /days/{dan}/cp      dnevni skor
//                                 /days/{dan}/aktivni/{uid}
//                                 /days/{dan}/bonus   'ispunjeno' | 'stit' | 'nedovoljno'
//         clanWarDaily/{dan}/{uid}                    dnevni strop igrača (XP)
//
//   FS    config/clanWar                              prekidač i prozor
//         clanWars/{warId}                            sedmica
//         clanWars/{warId}/matches/{matchId}          parovi i konačan ishod
//         clans/{clanId}.clanRating, .trezor, .okrug
//         users/{uid}.clanGold, .hint
// ===========================================================================

let warConfigCache = null
let warConfigAt = 0
function invalidirajRatKes() {
  warConfigCache = null
  warConfigAt = 0
  klanBonusKes.clear()
}

async function getWarConfig() {
  if (warConfigCache && Date.now() - warConfigAt < 30000) return warConfigCache
  const snap = await db.doc('config/clanWar').get()
  warConfigCache = snap.exists ? snap.data() : null
  warConfigAt = Date.now()
  return warConfigCache
}

// Rat je "otvoren za bodovanje" samo unutar svog prozora i samo dok je aktivan.
function ratOtvoren(cfg, now = Date.now()) {
  if (!cfg || cfg.enabled === false || !cfg.warId) return false
  if (cfg.status !== 'active') return false
  if (cfg.startAt && now < cfg.startAt) return false
  if (cfg.endAt && now > cfg.endAt) return false
  return true
}

// ---------------------------------------------------------------------------
// Klan i bonusi igrača — keširano, jer se čita na SVAKI osvojeni XP
// ---------------------------------------------------------------------------
// Bez keša bi svaki završen kviz značio dva Firestore čitanja (clanMembers +
// clans). Članstvo i nivoi Okruga se mijenjaju rijetko, pa je 5 minuta zaostatka
// prihvatljivo.
//
// PAŽNJA: `invalidirajRatKes()` čisti keš SAMO one instance funkcije u kojoj se
// izvršio. Cloud Functions drži više instanci, pa je stvarna granica zastarjelosti
// TTL, ne poziv za brisanje. Praktično: nadograđen objekat počne djelovati svima
// najkasnije za 5 minuta. Ako to ikad postane problem, rješenje NIJE kraći TTL
// (to vraća čitanja na vrući put) nego verzija sadržaja u jednom dokumentu, kao
// config/content.version kod taskova.
const klanBonusKes = new Map() // uid → { at, clanId, clan, bonusi }
const KLAN_KES_TTL = 5 * 60 * 1000
// Vidi klanZaIgraca: "nema klan" se pamti kratko, da pridruživanje usred rata
// odmah počne nositi CP.
const KLAN_KES_TTL_BEZ_KLANA = 20 * 1000

async function klanZaIgraca(uid) {
  const zapisKes = klanBonusKes.get(uid)
  // Igrač BEZ klana se pamti kratko. Ko se pridruži klanu usred rata pa odmah
  // odigra kviz, njegov CP bi inače propao do 5 minuta — a upravo su ti prvi
  // bodovi razlog zbog kojeg se i pridružio. Igrač S klanom se i dalje drži
  // pun TTL: tu se mijenjaju samo nivoi Okruga, a to trpi zastoj.
  const ttl = zapisKes?.clanId ? KLAN_KES_TTL : KLAN_KES_TTL_BEZ_KLANA
  if (zapisKes && Date.now() - zapisKes.at < ttl) return zapisKes
  const m = await clanMemberRef(uid).get()
  const clanId = m.exists ? m.data().clanId : null
  let clan = null
  if (clanId) {
    const s = await clanRef(clanId).get()
    if (s.exists && !s.data().disbandedAt) clan = { id: s.id, ...s.data() }
  }
  const zapis = {
    at: Date.now(),
    clanId: clan ? clan.id : null,
    clan,
    bonusi: ratBonusi(clan?.okrug?.nivoi || {}),
  }
  klanBonusKes.set(uid, zapis)
  return zapis
}

// Bonusi Okruga za igrača — koriste ih kviz (tajmer, XP, combo, 50:50) i rat.
// Igrač bez klana dobija nule, ne grešku.
async function bonusiIgraca(uid) {
  try {
    return (await klanZaIgraca(uid)).bonusi
  } catch {
    return ratBonusi({})
  }
}

// ---------------------------------------------------------------------------
// Pripis CP-a — jedina ulazna tačka
// ---------------------------------------------------------------------------
// Zove se s TAČNO DVA mjesta: kraj kviza (submitAnswer) i tačan odgovor u
// Preživljavanju. Namjerno NE na svaki odgovor u kvizu — kviz se pripisuje
// jednom, na kraju, s poznatom raspodjelom po kategorijama.
//
// NAGRADE ZA QUESTOVE (dnevne, sedmične, mjesečne) NE ULAZE U RAT. To je
// pravilo igre, ne previd: rat mjeri koliko se igra, a questovi se pune iz
// istih kvizova pa bi se isti trud brojao dvaput. Ako ikad zatreba treće
// mjesto pripisa, provjeri da izvor nije nagrada nego odigrano.
//
// `xpPoKategoriji` je opcion: { interakcije: 30, astma: 10 }. Bez njega srijedni
// množilac ne zna koliko XP-a pripada izvučenoj kategoriji, pa ga i ne
// primjenjuje — nikad ne pretpostavlja u korist igrača.
//
// `izvor` ('kviz' | 'survival') odlučuje o dvije stvari (odluka od 30.07.2026):
//   - DNEVNI STROP od 1000 XP vrijedi samo za kviz. Preživljavanje je
//     neograničeno: ono je ionako ograničeno ljestvicom (najviše korak 100 u
//     danu), a strop bi kaznio baš onoga ko je odigrao savršen niz.
//   - PETKOVI 2× (rush) vrijedi samo za kviz. XP iz Preživljavanja se ne
//     udvostručuje ni na koji način.
// Srijedni boost na izvučenu kategoriju ostaje za oba izvora — on ne
// udvostručuje nego usmjerava šta se tog dana isplati igrati.
async function addClanWarCp(uid, xp, { xpPoKategoriji = null, izvor = 'kviz' } = {}) {
  if (!xp || xp <= 0) return null
  const cfg = await getWarConfig()
  if (!ratOtvoren(cfg)) return null

  const { clanId, clan, bonusi: bon } = await klanZaIgraca(uid)
  if (!clanId || !clan) return null

  const p = bihParts()
  const dan = ratDnevniKljuc(p)
  const jeKviz = izvor === 'kviz'

  // 1. Dnevni strop igrača — atomično u RTDB-u, prije bilo kakvog pripisa.
  // `priznato` je koliko je XP-a od ovog događaja stalo ispod stropa.
  // Preživljavanje strop NE troši i njime NIJE ograničeno.
  let priznato = xp
  if (jeKviz) {
    await rtdb.ref(`clanWarDaily/${dan}/${uid}`).transaction((cur) => {
      const iskoristeno = cur || 0
      priznato = Math.max(0, Math.min(xp, DNEVNI_CP_STROP - iskoristeno))
      return iskoristeno + priznato
    })
    if (priznato <= 0) return { priznato: 0, cp: 0, strop: true }
  }

  // 2. Množilac. Kad znamo raspodjelu po kategorijama, boostuje se samo onaj
  // dio XP-a koji stvarno pripada izvučenoj kategoriji.
  let dio = null
  if (xpPoKategoriji && cfg.boostKategorija) {
    const ukupno = Object.values(xpPoKategoriji).reduce((a, b) => a + (b || 0), 0)
    if (ukupno > 0) dio = (xpPoKategoriji[cfg.boostKategorija] || 0) / ukupno
  }
  const mnoz = ratMnozilac(p, {
    boostKategorija: cfg.boostKategorija || null,
    dio,
    rush: jeKviz, // petkovi 2× je nagrada za kviz, ne za Preživljavanje
  })
  const cp = ratCpZaXp(priznato, { mnoz, cpBonus: bon.cpBonus })
  if (cp <= 0) return { priznato, cp: 0 }

  // 3. Upis — sve RTDB transakcije, nijedan Firestore upis.
  const korijen = `clanWar/${cfg.warId}/${clanId}`
  const us = await db.doc(`users/${uid}`).get()
  const prof = us.exists ? us.data() : {}

  await rtdb.ref(`${korijen}/cp`).transaction((cur) => (cur || 0) + cp)
  await rtdb.ref(`${korijen}/days/${dan}/cp`).transaction((cur) => (cur || 0) + cp)
  await rtdb.ref(`${korijen}/members/${uid}`).transaction((cur) => ({
    name: prof.displayName || 'Farmaceut',
    avatar: prof.avatar || 'a1',
    cp: (cur?.cp || 0) + cp,
  }))
  // Oznaka dnevne aktivnosti — po njoj se računa bonus za učešće.
  await rtdb.ref(`${korijen}/days/${dan}/aktivni/${uid}`).set(true)
  await rtdb.ref(`${korijen}/meta`).update({
    name: clan.name || '',
    tag: clan.tag || null,
  })

  return { priznato, cp, mnoz }
}

// ---------------------------------------------------------------------------
// Dnevni bonus za učešće
// ---------------------------------------------------------------------------
// Obrađuje se tek kad dan PROĐE (ili kad rat završi), jednom po klanu i danu.
// Idempotentno: oznaka `days/{dan}/bonus` je i rezultat i brava.
async function obradiDanUcesca(warId, clanId, dan) {
  const korijen = `clanWar/${warId}/${clanId}`
  const vec = await rtdb.ref(`${korijen}/days/${dan}/bonus`).get()
  if (vec.exists()) return null // već obrađen

  const snap = await clanRef(clanId).get()
  if (!snap.exists) return null
  const clan = { id: snap.id, ...snap.data() }
  const clanova = (clan.memberIds || []).length
  const aktivniSnap = await rtdb.ref(`${korijen}/days/${dan}/aktivni`).get()
  const aktivnih = aktivniSnap.exists() ? Object.keys(aktivniSnap.val() || {}).length : 0

  const bon = ratBonusi(clan.okrug?.nivoi || {})
  const stitStanje = clan.okrug?.stit || {}
  const potroseno = stitStanje.week === warId ? stitStanje.potroseno || 0 : 0
  const ostalo = Math.max(0, bon.stitovi - potroseno)

  const odluka = ratOdlukaOBonusu({ aktivnih, clanova, stitovaOstalo: ostalo })
  if (!odluka.bonus) {
    await rtdb.ref(`${korijen}/days/${dan}/bonus`).set('nedovoljno')
    return { ...odluka, clanId, dan }
  }

  if (odluka.stit) {
    await clanRef(clanId).update({ 'okrug.stit': { week: warId, potroseno: potroseno + 1 } })
    klanBonusKes.clear()
  }
  await rtdb.ref(`${korijen}/cp`).transaction((cur) => (cur || 0) + UCESCE_BONUS)
  await rtdb.ref(`${korijen}/days/${dan}/cp`).transaction((cur) => (cur || 0) + UCESCE_BONUS)
  await rtdb.ref(`${korijen}/days/${dan}/bonus`).set(odluka.stit ? 'stit' : 'ispunjeno')
  return { ...odluka, clanId, dan }
}

// Dani rata koji su PROŠLI (nastupio je sljedeći BiH dan) ili su svi dani ako
// je rat gotov. Bonus se ne smije obračunati usred dana — igrač koji odigra
// popodne inače ne bi ušao u brojanje.
function daniZaObradu(cfg, now = Date.now()) {
  const dani = []
  if (!cfg?.startAt) return dani
  const kraj = Math.min(now, cfg.endAt || now)
  const gotov = !!(cfg.endAt && now > cfg.endAt)
  for (let t = cfg.startAt; t <= kraj; t += 86400000) {
    const kljuc = ratDnevniKljuc(bihParts(new Date(t)))
    if (dani.includes(kljuc)) continue
    const pocetakSutra = Date.parse(`${kljuc}T00:00:00Z`) + 86400000 - 2 * 3600000 // BiH = UTC+2
    if (gotov || now >= pocetakSutra) dani.push(kljuc)
  }
  return dani
}

async function obradiProsleDane(cfg) {
  const dani = daniZaObradu(cfg)
  if (dani.length === 0) return []
  const mecevi = await db.collection(`clanWars/${cfg.warId}/matches`).get()
  const rezultati = []
  for (const d of mecevi.docs) {
    for (const clanId of d.data().clanIds || []) {
      for (const dan of dani) {
        const r = await obradiDanUcesca(cfg.warId, clanId, dan)
        if (r) rezultati.push(r)
      }
    }
  }
  return rezultati
}

// ---------------------------------------------------------------------------
// Životni ciklus rata: uparivanje → start → zatvaranje
// ---------------------------------------------------------------------------

// Kategorija za srijedu se izvlači SAMO iz kategorija s dovoljno pitanja.
// Banka je neravnomjerna (interakcije 36 pitanja, kardiologija 2) — boost na
// kategoriju s dva pitanja bio bi nagrada koju niko ne može iskoristiti.
const BOOST_MIN_PITANJA = 20

async function izvuciBoostKategoriju() {
  const pitanja = await getActiveQuestions()
  const broj = {}
  for (const q of pitanja) {
    const k = (q.category || '').trim()
    if (!k) continue
    broj[k] = (broj[k] || 0) + 1
  }
  const kandidati = Object.entries(broj)
    .filter(([, n]) => n >= BOOST_MIN_PITANJA)
    .map(([k]) => k)
  if (kandidati.length === 0) return null
  return kandidati[Math.floor(Math.random() * kandidati.length)]
}

// Prozor rata za zadanu sedmicu (warId = datum ponedjeljka).
// BiH je UTC+2 ljeti; prozori se računaju iz ponoći UTC pa pomjeraju, isto kao
// survivalWindowFor() — dosljednost je ovdje važnija od preciznosti na zimsko
// računanje vremena, a admin ionako može upisati tačan trenutak.
function ratProzorZa(warId) {
  const ponoc = Date.parse(`${warId}T00:00:00Z`) - 2 * 3600000 // BiH ponoć
  return {
    startAt: ponoc + RAT_POCETAK_SAT * 3600000,
    endAt: ponoc + 4 * 86400000 + RAT_KRAJ_SAT * 3600000, // petak
  }
}

// Aktivni klanovi kao kandidati za uparivanje.
async function klanoviZaRat() {
  const snap = await db.collection('clans').where('disbandedAt', '==', null).get()
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => (c.memberIds || []).length > 0)
    .map((c) => ({
      id: c.id,
      rating: c.clanRating || 0,
      name: c.name,
      tag: c.tag || null,
      clanLevel: c.clanLevel || 1,
    }))
}

// Napravi rat: dokument sedmice + mečevi. `parovi` može doći izvana (admin
// ručno upario) ili se računa iz ratinga.
async function napraviRat(warId, { parovi = null, boostKategorija = null, startAt, endAt } = {}) {
  const klanovi = await klanoviZaRat()
  const konacniParovi = parovi || ratNapraviParove(klanovi)
  const imena = Object.fromEntries(klanovi.map((k) => [k.id, { name: k.name, tag: k.tag }]))
  const prozor = ratProzorZa(warId)
  const pocetak = startAt || prozor.startAt
  const kraj = endAt || prozor.endAt
  const kategorija = boostKategorija !== null ? boostKategorija : await izvuciBoostKategoriju()

  const batch = db.batch()
  batch.set(db.doc(`clanWars/${warId}`), {
    warId,
    startAt: pocetak,
    endAt: kraj,
    status: 'pending',
    boostKategorija: kategorija,
    brojMeceva: konacniParovi.length,
    brojKlanova: klanovi.length,
    createdAt: FieldValue.serverTimestamp(),
  })
  konacniParovi.forEach((par, i) => {
    batch.set(db.doc(`clanWars/${warId}/matches/m${i}`), {
      clanIds: par.clanIds,
      grupni: !!par.grupni,
      bye: !!par.bye,
      imena: Object.fromEntries(par.clanIds.map((id) => [id, imena[id] || { name: id }])),
      status: 'pending',
      scores: {},
      winner: null,
    })
  })
  await batch.commit()

  return { warId, parovi: konacniParovi, boostKategorija: kategorija, startAt: pocetak, endAt: kraj }
}

// Pokreni rat: config se prebacuje na 'active' i od tog trenutka CP kola.
async function pokreniRat(warId, { startAt, endAt } = {}) {
  const snap = await db.doc(`clanWars/${warId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', `Rat ${warId} ne postoji — prvo ga napravi.`)
  const rat = snap.data()
  const pocetak = startAt || rat.startAt
  const kraj = endAt || rat.endAt

  await db.doc(`clanWars/${warId}`).update({ status: 'active', startAt: pocetak, endAt: kraj })
  await db.doc('config/clanWar').set(
    {
      enabled: true,
      warId,
      status: 'active',
      startAt: pocetak,
      endAt: kraj,
      boostKategorija: rat.boostKategorija || null,
      label: 'Klanski rat',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  invalidirajRatKes()
  return { warId, startAt: pocetak, endAt: kraj }
}

// Zatvaranje rata: bonusi za zadnje dane, ishod svakog meča, nagrade.
// Idempotentno preko clanWars/{warId}.status — dvostruko pokretanje ne isplaćuje
// nagrade dvaput.
async function zavrsiRat(warId) {
  const ratRef = db.doc(`clanWars/${warId}`)
  const snap = await ratRef.get()
  if (!snap.exists) return { greska: 'Rat ne postoji.' }
  const rat = snap.data()
  if (rat.status === 'resolved') return { vec: true, warId }

  // Zadnji dani prije zaključenja — inače bi petak ostao bez bonusa za učešće.
  await obradiProsleDane({ warId, startAt: rat.startAt, endAt: rat.endAt })

  const mecevi = await db.collection(`clanWars/${warId}/matches`).get()
  const izvjestaj = []

  for (const d of mecevi.docs) {
    const m = d.data()
    if (m.status === 'done') continue
    const clanIds = m.clanIds || []

    // Živi skorovi iz RTDB-a → konačni rezultat u Firestore.
    const scores = {}
    for (const clanId of clanIds) {
      const s = await rtdb.ref(`clanWar/${warId}/${clanId}/cp`).get()
      scores[clanId] = s.exists() ? s.val() || 0 : 0
    }
    const ishod = m.bye ? { pobjednik: clanIds[0] || null, redoslijed: [], nerijeseno: false } : ratIshodMeca(scores)

    // Nagrade klanovima i članovima.
    for (let i = 0; i < ishod.redoslijed.length || i < clanIds.length; i++) {
      const clanId = ishod.redoslijed[i]?.clanId || clanIds[i]
      if (!clanId) continue
      const cp = scores[clanId] || 0
      const cSnap = await clanRef(clanId).get()
      if (!cSnap.exists) continue
      const clan = { id: cSnap.id, ...cSnap.data() }
      const bon = ratBonusi(clan.okrug?.nivoi || {})
      const nagrada = ratNagradaKlanu({
        mjesto: i,
        nerijeseno: ishod.nerijeseno && i <= 1,
        cp,
        goldBonus: bon.goldBonus,
        smanjenjeGubitka: bon.smanjenjeGubitka,
        ratingPoraz: rat.ratingPoraz ?? undefined,
      })

      await clanRef(clanId).update({
        clanRating: Math.max(0, (clan.clanRating || 0) + nagrada.rating),
        trezor: (clan.trezor || 0) + nagrada.gold,
        clanXP: (clan.clanXP || 0) + cp,
        zadnjiRat: { warId, cp, mjesto: i, pobjeda: ishod.pobjednik === clanId, rating: nagrada.rating, gold: nagrada.gold },
      })

      // Članovi: zeleni bodovi po vlastitom doprinosu.
      const clanoviSnap = await rtdb.ref(`clanWar/${warId}/${clanId}/members`).get()
      const clanovi = clanoviSnap.exists() ? clanoviSnap.val() || {} : {}
      for (const [uid, zapis] of Object.entries(clanovi)) {
        const gold = ratNagradaClanu({
          mojCp: zapis?.cp || 0,
          pobjednik: ishod.pobjednik === clanId,
          goldBonus: bon.goldBonus,
        })
        if (gold > 0) {
          await db
            .doc(`users/${uid}`)
            .update({ clanGold: FieldValue.increment(gold) })
            .catch(() => {}) // obrisan nalog ne smije srušiti zatvaranje rata
        }
      }

      izvjestaj.push({ clanId, cp, mjesto: i, ...nagrada })
    }

    await d.ref.update({
      status: 'done',
      scores,
      winner: ishod.pobjednik,
      nerijeseno: ishod.nerijeseno,
      zavrseno: FieldValue.serverTimestamp(),
    })
  }

  // `endAt` se pomjera na SADA, ne samo status.
  //
  // Config se kešira 30 s po instanci funkcije, a keš jedne instance se ne može
  // obrisati iz druge. Da se mijenja samo status, instanca sa zastarjelim kešom
  // bi do 30 s poslije zatvaranja i dalje pripisivala CP u rat kojem su nagrade
  // već isplaćene. Pomjeren `endAt` obara i takav keš — ratOtvoren() gleda sat,
  // a sat je isti na svim instancama.
  const zatvorenoU = Date.now()
  await ratRef.update({
    status: 'resolved',
    endAt: zatvorenoU,
    resolvedAt: FieldValue.serverTimestamp(),
  })
  await db
    .doc('config/clanWar')
    .set({ status: 'resolved', enabled: false, endAt: zatvorenoU }, { merge: true })
  invalidirajRatKes()

  // Obavijest klanovima — rezultat koji niko ne vidi nije rezultat.
  for (const red of izvjestaj) {
    const cSnap = await clanRef(red.clanId).get()
    if (!cSnap.exists) continue
    await obavijestiClan(
      { id: cSnap.id, ...cSnap.data() },
      {
        naslov: red.mjesto === 0 ? '🏆 Pobjeda u klanskom ratu!' : 'Klanski rat je završen',
        tekst: `Skupili ste ${red.cp} CP · +${red.rating} ratinga · +${red.gold} zelenih bodova za Okrug.`,
      }
    ).catch(() => {})
  }

  return { warId, mecevi: mecevi.size, izvjestaj }
}

// ---------------------------------------------------------------------------
// clanWarTick — JEDAN zakazani posao za cijeli rat
// ---------------------------------------------------------------------------
// Namjerno jedan, a ne četiri (nedjelja/ponedjeljak/dnevno/petak): Cloud
// Scheduler je besplatan do 3 posla, projekat ih već ima 3 (tournamentTick,
// notifTick, survivalWeeklyReset). Ovaj je ČETVRTI i košta ~$0.10 mjesečno;
// četiri odvojena bi koštala ~$0.40. Sat vremena granularnosti je dovoljno jer
// su svi prelomi na pun sat.
export const clanWarTick = onSchedule({ schedule: '5 * * * *', timeZone: BIH_TZ }, async () => {
  const cfg = await getWarConfig()
  const p = bihParts()
  const now = Date.now()
  const koraci = []

  // 1. Zatvaranje: prozor je istekao, a rat je još aktivan.
  if (cfg?.warId && cfg.status === 'active' && cfg.endAt && now > cfg.endAt) {
    const r = await zavrsiRat(cfg.warId)
    koraci.push(`zavrsen ${cfg.warId} (${r.mecevi ?? 0} meceva)`)
  }

  // 2. Dnevni bonusi za rat u toku.
  const svjez = await (async () => {
    invalidirajRatKes()
    return getWarConfig()
  })()
  if (svjez?.warId && svjez.status === 'active') {
    const obradjeni = await obradiProsleDane(svjez)
    if (obradjeni.length) koraci.push(`bonusi: ${obradjeni.length}`)
  }

  // 3. Uparivanje u nedjelju 00:00 — samo ako je automatika uključena.
  if (svjez?.autoUparivanje !== false && ratDanUSedmici(p) === UPARIVANJE_DAN && p.hh === UPARIVANJE_SAT) {
    const warId = ratWarIdZa(p)
    const postoji = await db.doc(`clanWars/${warId}`).get()
    if (!postoji.exists) {
      const r = await napraviRat(warId)
      koraci.push(`uparivanje ${warId}: ${r.parovi.length} meceva, boost ${r.boostKategorija || '—'}`)
    }
  }

  // 4. Start u ponedjeljak 08:00.
  if (ratDanUSedmici(p) === 1 && p.hh === RAT_POCETAK_SAT) {
    const warId = ratWarIdZa(p)
    const rat = await db.doc(`clanWars/${warId}`).get()
    if (rat.exists && rat.data().status === 'pending') {
      await pokreniRat(warId)
      koraci.push(`pokrenut ${warId}`)
    }
  }

  if (koraci.length) console.log(`clanWarTick: ${koraci.join(' | ')}`)
})

// ---------------------------------------------------------------------------
// Zeleni Okrug — gradnja preko zajedničkog uloga (crowdfund)
// ---------------------------------------------------------------------------
// Model: klan bira JEDAN cilj, članovi u njega ulažu svoje zelene bodove
// (users/{uid}.clanGold), vođa može dodati i iz trezora. Kad ulog dostigne
// cijenu, nivo se diže SAM i cilj se briše.
//
// Zašto jedan cilj: s ~16 igrača i ~600 bodova sedmično, dva paralelna cilja
// znače da nijedan ne bude gotov — a nedovršena gradnja ne daje nikakav bonus.

async function okrugStanje(clan) {
  const nivoi = clan.okrug?.nivoi || {}
  const gradnja = clan.okrug?.gradnja || null
  return {
    nivoi,
    gradnja,
    bonusi: ratBonusi(nivoi),
    trezor: clan.trezor || 0,
    rating: clan.clanRating || 0,
    stit: clan.okrug?.stit || null,
  }
}

// Vođa/savjetnik bira sljedeći cilj gradnje.
export const startBuild = onCall(async (request) => {
  const uid = requireAuth(request)
  const { objekatId } = request.data || {}
  const { clan, uloga } = await mojKlan(uid)
  if (!smijeUpravljati(uloga)) {
    throw new HttpsError('permission-denied', 'Cilj gradnje bira osnivač ili savjetnik.')
  }
  const o = ratObjekat(objekatId)
  if (!o) throw new HttpsError('invalid-argument', 'Nepoznat objekat.')
  if (clan.okrug?.gradnja) {
    throw new HttpsError('failed-precondition', 'Već gradite nešto — prvo završite ili otkažite.')
  }
  const trenutni = clan.okrug?.nivoi?.[objekatId] || 0
  if (trenutni >= RAT_MAX_NIVO) {
    throw new HttpsError('failed-precondition', 'Objekat je već na najvišem nivou.')
  }
  const nivo = trenutni + 1
  const cijena = ratCijenaNadogradnje(objekatId, nivo)

  await clanRef(clan.id).update({
    'okrug.gradnja': {
      objekatId,
      nivo,
      cijena,
      sakupljeno: 0,
      doprinosi: {},
      pokrenuo: uid,
      pokrenutoAt: Date.now(),
    },
  })
  invalidirajRatKes()
  return { objekatId, nivo, cijena }
})

// Ulaganje u tekući cilj. `izTrezora` smiju samo vođa i savjetnik.
export const contributeToBuild = onCall(async (request) => {
  const uid = requireAuth(request)
  const { iznos, izTrezora = false } = request.data || {}
  const kolicina = Math.floor(Number(iznos) || 0)
  if (kolicina <= 0) throw new HttpsError('invalid-argument', 'Iznos mora biti veći od nule.')

  const { clan, uloga } = await mojKlan(uid)
  if (izTrezora && !smijeUpravljati(uloga)) {
    throw new HttpsError('permission-denied', 'Iz trezora ulažu osnivač i savjetnici.')
  }

  const cRef = clanRef(clan.id)
  const uRef = db.doc(`users/${uid}`)
  let rezultat = null

  await db.runTransaction(async (tx) => {
    const [cs, us] = await Promise.all([tx.get(cRef), tx.get(uRef)])
    if (!cs.exists) throw new HttpsError('not-found', 'Klan ne postoji.')
    const c = cs.data()
    const g = c.okrug?.gradnja
    if (!g) throw new HttpsError('failed-precondition', 'Nema aktivnog cilja gradnje.')

    // Nikad ne primaj više nego što fali — ostatak bi bio nepovratno zaključan.
    const fali = Math.max(0, g.cijena - (g.sakupljeno || 0))
    if (fali === 0) throw new HttpsError('failed-precondition', 'Cilj je već sakupljen.')

    const izvor = izTrezora ? c.trezor || 0 : us.exists ? us.data().clanGold || 0 : 0
    const ulog = Math.min(kolicina, fali, izvor)
    if (ulog <= 0) {
      throw new HttpsError(
        'failed-precondition',
        izTrezora ? 'Trezor je prazan.' : 'Nemaš dovoljno zelenih bodova.'
      )
    }

    const sakupljeno = (g.sakupljeno || 0) + ulog
    const doprinosi = { ...(g.doprinosi || {}) }
    const kljuc = izTrezora ? 'trezor' : uid
    doprinosi[kljuc] = (doprinosi[kljuc] || 0) + ulog

    if (izTrezora) tx.update(cRef, { trezor: (c.trezor || 0) - ulog })
    else tx.update(uRef, { clanGold: (us.data().clanGold || 0) - ulog })

    if (sakupljeno >= g.cijena) {
      // Gotovo → nivo gore, cilj se briše. Doprinosi ostaju u historiji klana.
      tx.update(cRef, {
        [`okrug.nivoi.${g.objekatId}`]: g.nivo,
        'okrug.gradnja': FieldValue.delete(),
        'okrug.historija': FieldValue.arrayUnion({
          objekatId: g.objekatId,
          nivo: g.nivo,
          cijena: g.cijena,
          zavrseno: Date.now(),
        }),
      })
      rezultat = { ulozeno: ulog, sakupljeno, cijena: g.cijena, gotovo: true, objekatId: g.objekatId, nivo: g.nivo }
    } else {
      tx.update(cRef, { 'okrug.gradnja.sakupljeno': sakupljeno, 'okrug.gradnja.doprinosi': doprinosi })
      rezultat = { ulozeno: ulog, sakupljeno, cijena: g.cijena, gotovo: false }
    }
  })

  invalidirajRatKes()
  if (rezultat.gotovo) {
    const svjez = await clanRef(clan.id).get()
    const o = ratObjekat(rezultat.objekatId)
    await obavijestiClan(
      { id: svjez.id, ...svjez.data() },
      {
        naslov: `${o?.emoji || '🏗️'} ${o?.naziv || 'Objekat'} — nivo ${rezultat.nivo}!`,
        tekst: 'Zeleni Okrug je nadograđen. Bonus važi odmah za sve članove.',
      },
      uid
    ).catch(() => {})
  }
  return rezultat
})

// Otkazivanje cilja — ulozi se VRAĆAJU tačno onima koji su ih dali.
// Bez povrata bi otkazivanje bilo kazna za klan koji se predomislio, a vođa bi
// mogao nenamjerno spaliti tuđe bodove.
export const cancelBuild = onCall(async (request) => {
  const uid = requireAuth(request)
  const { clan, uloga } = await mojKlan(uid)
  if (!smijeUpravljati(uloga)) throw new HttpsError('permission-denied', 'Samo osnivač ili savjetnik.')
  const g = clan.okrug?.gradnja
  if (!g) throw new HttpsError('failed-precondition', 'Nema aktivnog cilja.')

  const doprinosi = g.doprinosi || {}
  let uTrezor = 0
  for (const [kljuc, iznos] of Object.entries(doprinosi)) {
    if (!iznos || iznos <= 0) continue
    if (kljuc === 'trezor') uTrezor += iznos
    else {
      await db
        .doc(`users/${kljuc}`)
        .update({ clanGold: FieldValue.increment(iznos) })
        .catch(() => {
          uTrezor += iznos // obrisan nalog → bodovi idu klanu, ne u prazno
        })
    }
  }
  await clanRef(clan.id).update({
    'okrug.gradnja': FieldValue.delete(),
    trezor: FieldValue.increment(uTrezor),
  })
  invalidirajRatKes()
  return { vraceno: Object.values(doprinosi).reduce((a, b) => a + (b || 0), 0), uTrezor }
})

// ---------------------------------------------------------------------------
// 50:50 (Klinička Apoteka)
// ---------------------------------------------------------------------------
// Server skriva dva netačna odgovora. Jedan hint po pitanju: bez toga bi se
// ponovnim pozivom moglo doći do potpunog otkrivanja tačnog odgovora.
export const useHint = onCall(async (request) => {
  const uid = requireAuth(request)
  const { sessionId } = request.data || {}
  if (typeof sessionId !== 'string') throw new HttpsError('invalid-argument', 'Nedostaje sessionId.')

  const bon = await bonusiIgraca(uid)
  if (bon.hintovi <= 0) {
    throw new HttpsError('failed-precondition', 'Klan još nema Kliničku Apoteku.')
  }

  const sRef = db.doc(`quizSessions/${sessionId}`)
  const sSnap = await sRef.get()
  if (!sSnap.exists) throw new HttpsError('not-found', 'Sesija ne postoji.')
  const session = sSnap.data()
  if (session.uid !== uid) throw new HttpsError('permission-denied', 'Ovo nije tvoja sesija.')
  if (session.finished) throw new HttpsError('failed-precondition', 'Kviz je završen.')

  // Isto pitanje → isti odgovor, bez novog trošenja.
  if (session.hintNa === session.current && Array.isArray(session.hintSkriveni)) {
    return { skriveni: session.hintSkriveni, ostalo: session.hintOstalo ?? 0, ponovljen: true }
  }

  const sedmica = ratWarIdZa(bihParts())
  const uRef = db.doc(`users/${uid}`)
  let ostalo = 0
  await db.runTransaction(async (tx) => {
    const us = await tx.get(uRef)
    const h = us.exists ? us.data().hint || {} : {}
    const iskoristeno = h.week === sedmica ? h.iskoristeno || 0 : 0
    if (iskoristeno >= bon.hintovi) {
      throw new HttpsError('resource-exhausted', 'Potrošio/la si sve 50:50 ove sedmice.')
    }
    ostalo = bon.hintovi - iskoristeno - 1
    tx.update(uRef, { hint: { week: sedmica, iskoristeno: iskoristeno + 1 } })
  })

  const q = session.questions[session.current]
  const secret = await getSecret(q.id)
  const pogresni = [0, 1, 2, 3].filter((i) => i !== secret.correctIndex)
  for (let i = pogresni.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pogresni[i], pogresni[j]] = [pogresni[j], pogresni[i]]
  }
  const skriveni = pogresni.slice(0, 2)
  await sRef.update({ hintNa: session.current, hintSkriveni: skriveni, hintOstalo: ostalo })
  return { skriveni, ostalo }
})

// ---------------------------------------------------------------------------
// Pregled rata za igrače
// ---------------------------------------------------------------------------
export const getClanWar = onCall(async (request) => {
  const uid = requireAuth(request)
  const cfg = await getWarConfig()
  const m = await clanMemberRef(uid).get()
  const clanId = m.exists ? m.data().clanId : null
  if (!clanId) return { clan: null, rat: cfg || null }

  const cSnap = await clanRef(clanId).get()
  if (!cSnap.exists) return { clan: null, rat: cfg || null }
  const clan = { id: cSnap.id, ...cSnap.data() }
  const okrug = await okrugStanje(clan)

  const osnovno = {
    clan: { id: clan.id, name: clan.name, tag: clan.tag || null, memberCount: (clan.memberIds || []).length },
    okrug,
    mojiBodovi: (await db.doc(`users/${uid}`).get()).data()?.clanGold || 0,
    objekti: RAT_OBJEKTI,
    cijene: Object.fromEntries(
      RAT_OBJEKTI.map((o) => [
        o.id,
        Array.from({ length: RAT_MAX_NIVO }, (_, i) => ratCijenaNadogradnje(o.id, i + 1)),
      ])
    ),
  }

  if (!cfg?.warId) return { ...osnovno, rat: null }

  // Meč mog klana + živi skorovi.
  const mecevi = await db.collection(`clanWars/${cfg.warId}/matches`).get()
  const moj = mecevi.docs.find((d) => (d.data().clanIds || []).includes(clanId))
  const skorovi = {}
  const clanIds = moj ? moj.data().clanIds || [] : [clanId]
  for (const id of clanIds) {
    const s = await rtdb.ref(`clanWar/${cfg.warId}/${id}`).get()
    const v = s.exists() ? s.val() || {} : {}
    skorovi[id] = { cp: v.cp || 0, name: v.meta?.name || moj?.data().imena?.[id]?.name || id, tag: v.meta?.tag || null }
  }
  const mojiClanovi = await rtdb.ref(`clanWar/${cfg.warId}/${clanId}/members`).get()
  const dani = await rtdb.ref(`clanWar/${cfg.warId}/${clanId}/days`).get()

  return {
    ...osnovno,
    rat: {
      warId: cfg.warId,
      status: cfg.status,
      startAt: cfg.startAt || null,
      endAt: cfg.endAt || null,
      boostKategorija: cfg.boostKategorija || null,
      mnozilacSada: ratMnozilac(bihParts(), { boostKategorija: cfg.boostKategorija || null, dio: 1 }),
    },
    mec: moj ? { id: moj.id, clanIds, grupni: !!moj.data().grupni, status: moj.data().status } : null,
    skorovi,
    doprinosi: mojiClanovi.exists() ? mojiClanovi.val() : {},
    dani: dani.exists() ? dani.val() : {},
    prag: ratPragUcesca((clan.memberIds || []).length),
  }
})

// ---------------------------------------------------------------------------
// ADMIN — kontrola rata
// ---------------------------------------------------------------------------
// Rat traje pet dana i dira bodovanje, pa svaka poluga koja bi inače tražila
// skriptu s računara mora biti i ovdje. Redoslijed poluga prati ono što može
// poći po zlu: napravi → provjeri upozorenja → pokreni → (pauza) → zatvori.

// Upozorenja koja admin treba vidjeti PRIJE nego pokrene rat. Svako od njih je
// nešto što je već negdje zapelo ili očito može zapeti.
async function ratUpozorenja(cfg, rat, mecevi, klanovi) {
  const u = []
  const now = Date.now()

  if (klanovi.length < 2) {
    u.push({ nivo: 'blok', tekst: `Samo ${klanovi.length} klan(ova) postoji — rat treba bar dva.` })
  }
  const uparen = new Set(mecevi.flatMap((m) => m.clanIds || []))
  const neupareni = klanovi.filter((k) => !uparen.has(k.id))
  if (rat && neupareni.length) {
    u.push({
      nivo: 'upozorenje',
      tekst: `Nije upareno: ${neupareni.map((k) => k.name).join(', ')}. Ti klanovi skupljaju CP koji nigdje ne ulazi.`,
    })
  }
  for (const k of klanovi) {
    const prag = ratPragUcesca(k.memberCount)
    if (k.memberCount > 0 && prag > k.memberCount) {
      u.push({ nivo: 'upozorenje', tekst: `${k.name}: prag učešća (${prag}) je veći od broja članova.` })
    }
    if (k.memberCount === 1) {
      u.push({ nivo: 'info', tekst: `${k.name} ima jednog člana — bonus za učešće mu je zagarantovan.` })
    }
  }
  if (cfg?.status === 'active' && cfg.endAt && now > cfg.endAt) {
    u.push({ nivo: 'blok', tekst: 'Rat je aktivan a prozor je istekao — zatvori ga ručno ili čekaj tick.' })
  }
  if (cfg?.status === 'active' && !cfg.boostKategorija) {
    u.push({ nivo: 'info', tekst: 'Nema izvučene kategorije za srijedu — boost neće raditi.' })
  }
  if (cfg?.startAt && cfg?.endAt && cfg.endAt <= cfg.startAt) {
    u.push({ nivo: 'blok', tekst: 'Kraj rata je prije početka.' })
  }
  const bezOkruga = klanovi.filter((k) => !k.imaOkrug)
  if (rat && bezOkruga.length === klanovi.length && klanovi.length > 0) {
    u.push({ nivo: 'info', tekst: 'Nijedan klan još nema nijednu nadogradnju — prvi nivo je 200 bodova.' })
  }
  return u
}

export const adminWarStatus = onCall(async (request) => {
  requireAdmin(request)
  // NAMJERNO bez keša: config se kešira 30 s po instanci, pa bi admin poslije
  // klika na "Pokreni" još pola minute gledao staro stanje i mislio da nije
  // prošlo. Ovaj poziv se dešava rijetko — jedno čitanje je jeftinije od
  // pogrešnog dojma da poluga ne radi.
  invalidirajRatKes()
  const cfgSnap = await db.doc('config/clanWar').get()
  const cfg = cfgSnap.exists ? cfgSnap.data() : null
  const p = bihParts()

  const clanSnap = await db.collection('clans').where('disbandedAt', '==', null).get()
  const klanovi = clanSnap.docs.map((d) => {
    const c = d.data()
    return {
      id: d.id,
      name: c.name,
      tag: c.tag || null,
      rating: c.clanRating || 0,
      trezor: c.trezor || 0,
      memberCount: (c.memberIds || []).length,
      nivoi: c.okrug?.nivoi || {},
      imaOkrug: Object.values(c.okrug?.nivoi || {}).some((n) => n > 0),
      gradnja: c.okrug?.gradnja || null,
    }
  })

  let rat = null
  let mecevi = []
  const warId = cfg?.warId || ratWarIdZa(p)
  const rSnap = await db.doc(`clanWars/${warId}`).get()
  if (rSnap.exists) {
    rat = { id: rSnap.id, ...rSnap.data() }
    const mSnap = await db.collection(`clanWars/${warId}/matches`).get()
    mecevi = await Promise.all(
      mSnap.docs.map(async (d) => {
        const m = d.data()
        const skorovi = {}
        for (const id of m.clanIds || []) {
          const s = await rtdb.ref(`clanWar/${warId}/${id}/cp`).get()
          skorovi[id] = s.exists() ? s.val() || 0 : 0
        }
        return { id: d.id, ...m, zivi: skorovi }
      })
    )
  }

  return {
    sada: Date.now(),
    bih: p,
    config: cfg || null,
    predlozeniWarId: ratWarIdZa(p),
    rat,
    mecevi,
    klanovi,
    upozorenja: await ratUpozorenja(cfg, rat, mecevi, klanovi),
    ocekivanoUToku: ratUToku(p),
  }
})

// Napravi rat. `parovi` se šalje kad admin ručno upari klanove:
//   [{ clanIds: ['a','b'] }, { clanIds: ['c','d','e'], grupni: true }]
// Bez njih se pari po ratingu.
export const adminWarCreate = onCall(async (request) => {
  requireAdmin(request)
  const { warId, parovi = null, boostKategorija = null, startAt = null, endAt = null, prepisi = false } =
    request.data || {}
  const id = warId || ratWarIdZa(bihParts())

  const postoji = await db.doc(`clanWars/${id}`).get()
  if (postoji.exists && !prepisi) {
    throw new HttpsError('already-exists', `Rat ${id} već postoji. Pošalji prepisi:true da ga zamijeniš.`)
  }
  if (postoji.exists && postoji.data().status === 'resolved') {
    throw new HttpsError('failed-precondition', `Rat ${id} je već zatvoren — nagrade su isplaćene.`)
  }
  if (postoji.exists) {
    // Prepis: stari mečevi se brišu da ne ostanu siročad s prošlim parovima.
    const stari = await db.collection(`clanWars/${id}/matches`).get()
    const batch = db.batch()
    stari.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  // Provjera ručnih parova: klan ne smije biti u dva meča.
  if (parovi) {
    const svi = parovi.flatMap((p) => p.clanIds || [])
    if (new Set(svi).size !== svi.length) {
      throw new HttpsError('invalid-argument', 'Isti klan je u dva meča.')
    }
    for (const cid of svi) {
      const s = await clanRef(cid).get()
      if (!s.exists || s.data().disbandedAt) {
        throw new HttpsError('invalid-argument', `Klan ${cid} ne postoji ili je raspušten.`)
      }
    }
  }

  const r = await napraviRat(id, { parovi, boostKategorija, startAt, endAt })
  invalidirajRatKes()
  return r
})

// Pokreni rat ODMAH, sa zadanim krajem. Ovo je poluga za "hoću da event krene
// danas": prozor ne mora biti ponedjeljak-petak.
export const adminWarStart = onCall(async (request) => {
  requireAdmin(request)
  const { warId, startAt = null, endAt = null } = request.data || {}
  const id = warId || ratWarIdZa(bihParts())

  const mecevi = await db.collection(`clanWars/${id}/matches`).get()
  if (mecevi.empty) {
    throw new HttpsError('failed-precondition', 'Rat nema nijedan meč — prvo napravi parove.')
  }
  const pocetak = startAt || Date.now()
  const rSnap = await db.doc(`clanWars/${id}`).get()
  const kraj = endAt || rSnap.data()?.endAt
  if (kraj && kraj <= pocetak) {
    throw new HttpsError('invalid-argument', 'Kraj rata mora biti poslije početka.')
  }
  const r = await pokreniRat(id, { startAt: pocetak, endAt: kraj })
  return r
})

// Zatvori rat i isplati nagrade odmah.
export const adminWarEnd = onCall(async (request) => {
  requireAdmin(request)
  const { warId } = request.data || {}
  const cfg = await getWarConfig()
  const id = warId || cfg?.warId
  if (!id) throw new HttpsError('failed-precondition', 'Nema rata za zatvaranje.')
  const r = await zavrsiRat(id)
  return r
})

// Prekidač bez posljedica: bodovanje staje, nagrade se NE isplaćuju.
// Prva stvar koju treba povući ako se u ratu pojavi greška.
export const adminWarPause = onCall(async (request) => {
  requireAdmin(request)
  const { enabled } = request.data || {}
  await db.doc('config/clanWar').set({ enabled: enabled === true }, { merge: true })
  invalidirajRatKes()
  return { enabled: enabled === true }
})

// Otkazivanje rata BEZ nagrada — briše mečeve i žive skorove.
export const adminWarCancel = onCall(async (request) => {
  requireAdmin(request)
  const { warId, potvrda } = request.data || {}
  const id = warId || (await getWarConfig())?.warId
  if (!id) throw new HttpsError('failed-precondition', 'Nema rata.')
  if (potvrda !== id) {
    throw new HttpsError('invalid-argument', 'Za otkazivanje pošalji potvrda = warId.')
  }
  const rSnap = await db.doc(`clanWars/${id}`).get()
  if (rSnap.exists && rSnap.data().status === 'resolved') {
    throw new HttpsError('failed-precondition', 'Rat je zatvoren i nagrade su isplaćene — ne otkazuje se.')
  }
  const mecevi = await db.collection(`clanWars/${id}/matches`).get()
  const batch = db.batch()
  mecevi.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(db.doc(`clanWars/${id}`))
  await batch.commit()
  await rtdb.ref(`clanWar/${id}`).remove()
  await db.doc('config/clanWar').set({ enabled: false, status: 'off', warId: null }, { merge: true })
  invalidirajRatKes()
  return { otkazan: id, obrisanoMeceva: mecevi.size }
})

// Podešavanja u letu: kategorija za srijedu, automatika, kraj prozora.
export const adminWarSetConfig = onCall(async (request) => {
  requireAdmin(request)
  const { boostKategorija, autoUparivanje, endAt, startAt } = request.data || {}
  const patch = { updatedAt: FieldValue.serverTimestamp() }
  if (boostKategorija !== undefined) patch.boostKategorija = boostKategorija || null
  if (autoUparivanje !== undefined) patch.autoUparivanje = autoUparivanje !== false
  if (endAt !== undefined) patch.endAt = endAt || null
  if (startAt !== undefined) patch.startAt = startAt || null
  await db.doc('config/clanWar').set(patch, { merge: true })

  const cfg = await (async () => {
    invalidirajRatKes()
    return getWarConfig()
  })()
  if (cfg?.warId) {
    const p = {}
    if (patch.boostKategorija !== undefined) p.boostKategorija = patch.boostKategorija
    if (patch.endAt !== undefined) p.endAt = patch.endAt
    if (patch.startAt !== undefined) p.startAt = patch.startAt
    if (Object.keys(p).length) await db.doc(`clanWars/${cfg.warId}`).update(p).catch(() => {})
  }
  return cfg
})

// Ponovni obračun dnevnog bonusa (briše oznaku pa obračuna iznova).
// Treba kad se ispravi članstvo ili kad tick padne.
export const adminWarRecomputeDay = onCall(async (request) => {
  requireAdmin(request)
  const { dan, warId } = request.data || {}
  const cfg = await getWarConfig()
  const id = warId || cfg?.warId
  if (!id || !dan) throw new HttpsError('invalid-argument', 'Nedostaje warId ili dan.')

  const mecevi = await db.collection(`clanWars/${id}/matches`).get()
  const rezultati = []
  for (const d of mecevi.docs) {
    for (const clanId of d.data().clanIds || []) {
      const oznaka = await rtdb.ref(`clanWar/${id}/${clanId}/days/${dan}/bonus`).get()
      // Već dodijeljen bonus se prvo skida, inače bi se sabrao dvaput.
      if (oznaka.exists() && oznaka.val() !== 'nedovoljno') {
        await rtdb.ref(`clanWar/${id}/${clanId}/cp`).transaction((c) => Math.max(0, (c || 0) - UCESCE_BONUS))
        await rtdb
          .ref(`clanWar/${id}/${clanId}/days/${dan}/cp`)
          .transaction((c) => Math.max(0, (c || 0) - UCESCE_BONUS))
      }
      await rtdb.ref(`clanWar/${id}/${clanId}/days/${dan}/bonus`).remove()
      const r = await obradiDanUcesca(id, clanId, dan)
      if (r) rezultati.push(r)
    }
  }
  return { dan, rezultati }
})

// Test alat: postavi nivo objekta i zelene bodove, bez čekanja pet dana rata.
export const adminWarSetOkrug = onCall(async (request) => {
  requireAdmin(request)
  const { clanId, objekatId, nivo, trezor, clanGoldUid, clanGold } = request.data || {}
  if (clanId && objekatId !== undefined) {
    const n = Math.max(0, Math.min(RAT_MAX_NIVO, Number(nivo) || 0))
    if (!ratObjekat(objekatId)) throw new HttpsError('invalid-argument', 'Nepoznat objekat.')
    await clanRef(clanId).update({ [`okrug.nivoi.${objekatId}`]: n })
  }
  if (clanId && trezor !== undefined) {
    await clanRef(clanId).update({ trezor: Math.max(0, Number(trezor) || 0) })
  }
  if (clanGoldUid && clanGold !== undefined) {
    await db.doc(`users/${clanGoldUid}`).update({ clanGold: Math.max(0, Number(clanGold) || 0) })
  }
  invalidirajRatKes()
  return { ok: true }
})
