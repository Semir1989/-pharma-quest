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
const DAILY_QUIZ_LIMIT = 3
const DAILY_QUIZ_XP_CAP = 300

// Preživljavanje (Etapa 8): endless mod, +3 XP po tačnom, kraj na prvu grešku.
const SURVIVAL_XP_PER_CORRECT = 3
const SURVIVAL_SECONDS = 20 // kraći tajmer — napetost; istek = kraj run-a

// Kovčezi na ljestvici niza: svaki 10. tačan odgovor zaredom nosi bonus
// (niz 10 → +100 XP, 20 → +200 … 100 → +1000). Nizovi se resetuju srijedom,
// pa se i nagrade mogu osvojiti iznova svake sedmice. Ne miješati s
// awardLevelMilestones — to je bonus za GLOBALNI level, sasvim druga stvar.
const SURVIVAL_CHEST_STEP = 10
const SURVIVAL_MAX_STEP = 100

function survivalChestReward(streak) {
  if (streak % SURVIVAL_CHEST_STEP !== 0) return 0
  if (streak > SURVIVAL_MAX_STEP) return 0
  return (streak / SURVIVAL_CHEST_STEP) * 100
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

function monthlyKey(d = new Date()) {
  const { y, m } = bihParts(d)
  return `${y}-${pad(m)}`
}

// Trenutak sljedeće ponoći po BiH vremenu (ms) — klijent iz ovoga crta odbrojavanje.
function nextDailyResetAt(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const midnightCivil = Date.UTC(y, m - 1, day + 1)
  const guess = midnightCivil - bihOffset(d)
  return midnightCivil - bihOffset(new Date(guess))
}

// Ključ sedmice Preživljavanja — sedmica POČINJE SRIJEDOM (reset srijedom).
// UTC-bazirano da klijent (čita leaderboard) i server (piše) uvijek dobiju isti
// ključ. Vraća datum posljednje srijede, npr. '2026-07-22'.
function survivalWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const diff = (date.getUTCDay() - 3 + 7) % 7 // srijeda = 3
  date.setUTCDate(date.getUTCDate() - diff)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
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
    const streak = p.lastPlayDay === yesterday ? (p.streak || 0) + 1 : 1
    tx.update(uRef, { streak, lastPlayDay: today })
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
// Rotacija dnevnih questova — svaki igrač dobije 3 zadatka iz bazena
// ---------------------------------------------------------------------------
// Izbor je determinističan po (uid, dan) i ZAMRZNE se u users/{uid}
// .taskProgress.daily.picked, pa se ne mijenja tokom dana. Ako je za igrača
// aktivan neki event (Preživljavanje / turnir), tačno jedan od tri zadatka je
// vezan za taj event. Igrač koji je ispao iz Preživljavanja NE dobija survival
// zadatak — a ako ispadne usred dana, zadatak mu se zamijeni običnim.
const DAILY_TASK_COUNT = 3

let tasksCache = null
let tasksCacheAt = 0
async function getActiveTasks() {
  if (tasksCache && Date.now() - tasksCacheAt < CONTENT_TTL) return tasksCache
  const snap = await db.collection('tasks').where('active', '==', true).get()
  tasksCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  tasksCacheAt = Date.now()
  return tasksCache
}

function seedFrom(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededPick(list, n, seed) {
  const rnd = mulberry32(seed)
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
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
  // Turnir: unutar prozora eventa.
  const t = await getTournamentConfig()
  const now = Date.now()
  if (t?.enabled && t.key && !(t.openAt && now < t.openAt) && !(t.closeAt && now > t.closeAt)) {
    events.push('tournament')
  }
  return events
}

// Status eventa se ogleda i na profilu (users/{uid}.eventStatus) — klijent je
// već pretplaćen na profil, pa zna da li je igrač još u igri bez ijednog
// dodatnog čitanja. survivalRuns klijent po pravilima ne smije čitati.
async function setEventStatus(uid, patch) {
  const updates = {}
  for (const [k, v] of Object.entries(patch)) updates[`eventStatus.${k}`] = v
  await db.doc(`users/${uid}`).update(updates).catch(() => {})
}

function pickDailyTaskIds(pool, uid, day, events) {
  const daily = pool.filter((t) => t.type === 'daily')
  const base = daily.filter((t) => !t.event)
  const eventTasks = daily.filter((t) => t.event && events.includes(t.event))
  const seed = seedFrom(`${uid}|${day}`)
  const chosen = eventTasks.length > 0 ? seededPick(eventTasks, 1, seed ^ 0x9e3779b9) : []
  chosen.push(...seededPick(base, DAILY_TASK_COUNT - chosen.length, seed))
  return chosen.sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => t.id)
}

// Vrati (i po potrebi zamrzni) današnji izbor dnevnih questova za igrača.
async function ensureDailyPicks(uid) {
  const day = dailyKey()
  const userRef = db.doc(`users/${uid}`)
  const snap = await userRef.get()
  if (!snap.exists) return []
  const existing = snap.data().taskProgress?.daily
  if (existing?.period === day && Array.isArray(existing.picked) && existing.picked.length > 0) {
    return existing.picked
  }
  // Izbor se pravi izvan transakcije (čita config i survivalRuns), pa se
  // transakcijom samo upisuje — i to tek ako ga u međuvremenu niko nije upisao.
  const [pool, events] = await Promise.all([getActiveTasks(), activeEventsFor(uid)])
  const picked = pickDailyTaskIds(pool, uid, day, events)
  await setEventStatus(uid, {
    survival: events.includes('survival'),
    tournament: events.includes('tournament'),
  })
  let final = picked
  await db.runTransaction(async (tx) => {
    const s = await tx.get(userRef)
    if (!s.exists) return
    const p = s.data()
    const cur = p.taskProgress?.daily
    if (cur?.period === day && Array.isArray(cur.picked) && cur.picked.length > 0) {
      final = cur.picked
      return
    }
    const base = cur?.period === day ? { ...emptyProgress(day), ...cur } : emptyProgress(day)
    tx.update(userRef, { 'taskProgress.daily': { ...base, period: day, picked } })
  })
  return final
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

// Klijent zove pri otvaranju Questova/Home-a ako današnji izbor još ne postoji.
export const ensureDailyQuests = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const picked = await ensureDailyPicks(uid)
  return { picked, day: dailyKey(), resetsAt: nextDailyResetAt() }
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
// Pomoćne funkcije: leaderboard (RTDB)
// ---------------------------------------------------------------------------
function leaderboardEntry(profile, level) {
  return {
    name: profile.displayName || 'Farmaceut',
    avatar: profile.avatar || 'a1',
    level,
    streak: profile.streak || 0,
  }
}

async function syncLeaderboard(uid, profile, totalXp, weeklyDelta, level) {
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
// Bez ovoga startQuiz i SVAKI survival odgovor skeniraju cijelu banku (302 reads).
// Keš se osvježi najviše jednom u CONTENT_TTL po instanci; admin izmjene se
// vide poslije isteka TTL-a (do 10 min).
// ---------------------------------------------------------------------------
const CONTENT_TTL = 10 * 60 * 1000 // 10 min
let questionsCache = null
let questionsCacheAt = 0
async function getActiveQuestions() {
  if (questionsCache && Date.now() - questionsCacheAt < CONTENT_TTL) return questionsCache
  const snap = await db.collection('questions').where('active', '==', true).get()
  questionsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  questionsCacheAt = Date.now()
  return questionsCache
}
async function getQuestionById(id) {
  return (await getActiveQuestions()).find((q) => q.id === id) || null
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
// Dnevni limit: 3 kviza po BiH danu. Stanje je u users/{uid}.quizLimit
// { day, started, xp, sessionId }. Broje se ZAPOČETI kvizovi — inače bi se
// odustajanjem moglo "rerollati" do lakših pitanja. Zato nedovršena sesija
// istog dana ne troši novi pokušaj nego se nastavlja.
// ---------------------------------------------------------------------------
function quizLimitState(profile, day = dailyKey()) {
  const l = profile?.quizLimit
  return l && l.day === day
    ? { day, started: l.started || 0, xp: l.xp || 0, sessionId: l.sessionId || null }
    : { day, started: 0, xp: 0, sessionId: null }
}

export const startQuiz = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se za igranje kviza.')

  const day = dailyKey()
  const userRef = db.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
  const limit = quizLimitState(userSnap.data(), day)
  const limitInfo = {
    used: limit.started,
    limit: DAILY_QUIZ_LIMIT,
    xpToday: limit.xp,
    xpCap: DAILY_QUIZ_XP_CAP,
    resetsAt: nextDailyResetAt(),
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
          question: publicQuestion(meta.id, qData, s.current),
        }
      }
    }
  }

  if (limit.started >= DAILY_QUIZ_LIMIT) return { limited: true, ...limitInfo }

  const pool = await getActiveQuestions()
  if (pool.length === 0) throw new HttpsError('failed-precondition', 'Banka pitanja je prazna.')

  // Fisher-Yates shuffle (kopije) pa uzmi prvih N.
  const all = [...pool]
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  const chosen = all.slice(0, QUESTIONS_PER_QUIZ)

  const session = {
    uid,
    questions: chosen.map((q) => ({ id: q.id, points: q.points, category: q.category })),
    answers: [],
    current: 0,
    finished: false,
    askedAt: Date.now(),
    startedAt: FieldValue.serverTimestamp(),
  }
  // Trošenje pokušaja ide transakcijom — dva paralelna starta ne smiju proći.
  // Sesija se upisuje tek kad je pokušaj rezervisan, da race ne ostavi siroče.
  const ref = db.collection('quizSessions').doc()
  let started = limit.started + 1
  await db.runTransaction(async (tx) => {
    const s = await tx.get(userRef)
    if (!s.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const cur = quizLimitState(s.data(), day)
    if (cur.started >= DAILY_QUIZ_LIMIT) {
      throw new HttpsError('resource-exhausted', 'Dnevni limit kvizova je iskorišten.')
    }
    started = cur.started + 1
    tx.update(userRef, { quizLimit: { ...cur, started, sessionId: ref.id } })
  })
  await ref.set(session)

  return {
    sessionId: ref.id,
    total: chosen.length,
    ...limitInfo,
    used: started,
    question: publicQuestion(chosen[0].id, chosen[0], 0),
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
  const elapsed = (Date.now() - session.askedAt) / 1000
  const effective = elapsed > QUESTION_SECONDS + GRACE_SECONDS ? null : answer

  const q = session.questions[session.current]
  const secret = await getSecret(q.id)
  const correct = effective !== null && effective === secret.correctIndex

  const answers = [
    ...session.answers,
    { id: q.id, category: q.category, points: q.points, selected: effective, correct },
  ]
  const isLast = session.current + 1 >= session.questions.length

  if (!isLast) {
    const nextMeta = session.questions[session.current + 1]
    const nextData = await getQuestionById(nextMeta.id)
    await sessionRef.update({ answers, current: session.current + 1, askedAt: Date.now() })
    return {
      correct,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: false,
      question: publicQuestion(nextMeta.id, nextData, session.current + 1),
    }
  }

  // Zadnje pitanje → finalizacija: XP, statistika, taskovi, leaderboard.
  const earnedXp = answers.reduce((s, a) => s + (a.correct ? a.points : 0), 0)
  const correctCount = answers.filter((a) => a.correct).length
  const correctByCategory = {}
  for (const a of answers) {
    if (a.correct) correctByCategory[a.category] = (correctByCategory[a.category] || 0) + 1
  }

  const userRef = db.doc(`users/${uid}`)
  const cfg = await getLevelConfig()
  const day = dailyKey()
  const perfect = correctCount === answers.length
  let profileAfter, totalXp
  let awardedXp = 0 // XP poslije dnevnog capa — sve dalje računa s ovim
  let xpToday = 0

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

    // Dnevni cap: iz kvizova se ne može osvojiti više od 300 XP dnevno.
    const limit = quizLimitState(profile, day)
    awardedXp = Math.min(earnedXp, Math.max(0, DAILY_QUIZ_XP_CAP - limit.xp))
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
  await bumpStreak(uid)

  return {
    correct,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: true,
    summary: {
      earnedXp: awardedXp,
      rawXp: earnedXp, // koliko bi bilo bez capa (za poruku na rezultatima)
      capped: awardedXp < earnedXp,
      correctCount,
      total: answers.length,
    },
    quizzesToday: quizLimitState(profileAfter, day).started,
    quizLimit: DAILY_QUIZ_LIMIT,
    xpToday,
    xpCap: DAILY_QUIZ_XP_CAP,
    resetsAt: nextDailyResetAt(),
    newLevel: levelFromXp(finalXp, cfg),
    levelBonus,
    newBadges,
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
  const task = taskSnap.data()

  // Dnevni questovi se rotiraju — nagradu nosi samo zadatak iz današnjeg izbora.
  if (task.type === 'daily') await ensureDailyPicks(uid)

  const userRef = db.doc(`users/${uid}`)
  const cfg = await getLevelConfig()
  let profileAfter, totalXp

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    const profile = userSnap.data()

    const stored = profile.taskProgress?.[task.type]
    if (!stored || stored.period !== periodKey(task.type)) {
      throw new HttpsError('failed-precondition', 'Task nije ispunjen u ovom periodu.')
    }
    if (task.type === 'daily' && !(stored.picked || []).includes(taskId)) {
      throw new HttpsError('failed-precondition', 'Ovaj quest danas nije među tvojim zadacima.')
    }
    const value =
      task.metric === 'correct' && task.category
        ? stored.byCategory?.[task.category] || 0
        : stored[task.metric] || 0
    if (value < task.goal) throw new HttpsError('failed-precondition', 'Task još nije ispunjen.')
    if (stored.claimed?.[taskId]) throw new HttpsError('already-exists', 'Nagrada je već preuzeta.')

    totalXp = (profile.xp || 0) + task.reward
    profileAfter = profile
    tx.update(userRef, {
      xp: totalXp,
      [`taskProgress.${task.type}.claimed.${taskId}`]: true,
    })
  })

  const levelBonus = await awardLevelMilestones(uid)
  const finalXp = levelBonus.totalXp || totalXp
  await syncLeaderboard(uid, profileAfter, finalXp, task.reward, levelFromXp(finalXp, cfg))
  const newBadges = await awardBadges(uid)
  await addWeekendXp(uid, task.reward)

  return { reward: task.reward, newLevel: levelFromXp(finalXp, cfg), levelBonus, newBadges }
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

// Dodaj osvojeni XP na turnirsku listu ako smo unutar prozora eventa.
async function addWeekendXp(uid, delta) {
  if (!delta || delta <= 0) return
  const cfg = await getTournamentConfig()
  if (!cfg || !cfg.enabled || !cfg.key) return
  const now = Date.now()
  if ((cfg.openAt && now < cfg.openAt) || (cfg.closeAt && now > cfg.closeAt)) return
  const us = await db.doc(`users/${uid}`).get()
  const p = us.exists ? us.data() : {}
  await rtdb.ref(`tournament/${cfg.key}/${uid}`).transaction((cur) => ({
    name: p.displayName || 'Farmaceut',
    avatar: p.avatar || 'a1',
    xp: (cur?.xp || 0) + delta,
  }))
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
  await db.doc(`xpRaces/${tid}`).set({ finalized: true, top, finalizedAt: FieldValue.serverTimestamp() })
}

// ---------------------------------------------------------------------------
// 1v1 DUEL TURNIR (Faza 2, korak C) — bracket single-elimination, async dueli
// Prijave [regOpenAt, regCloseAt] → bracket (nasumično) → runde s rokovima.
// tournamentTick (scheduled) zatvara runde: veći skor prolazi, walkover ako
// protivnik ne odigra. Skor protivnika je skriven do zatvaranja runde.
// ---------------------------------------------------------------------------
const DUEL_QUESTIONS = 10
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
  let size = 2
  while (size < participants.length) size *= 2
  const rounds = Math.round(Math.log2(size))
  const seats = [...participants, ...Array(size - participants.length).fill(null)]

  const qids = (await getActiveQuestions()).map((q) => q.id)
  const pickQs = () => shuffle(qids).slice(0, DUEL_QUESTIONS)

  const batch = db.batch()
  const mcol = db.collection(`tournaments/${tid}/matches`)
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r
    for (let s = 0; s < count; s++) {
      const p1 = r === 1 ? seats[s * 2] || null : null
      const p2 = r === 1 ? seats[s * 2 + 1] || null : null
      batch.set(mcol.doc(`r${r}s${s}`), {
        round: r, slot: s, p1, p2, questionIds: pickQs(),
        p1Score: null, p2Score: null, p1Played: false, p2Played: false,
        winner: null, status: 'pending',
      })
    }
  }
  const start = cfg.openAt || Date.now()
  const end = cfg.closeAt || Date.now() + 48 * 3600000
  const step = (end - start) / rounds
  const roundDeadlines = Array.from({ length: rounds }, (_, i) => Math.round(start + step * (i + 1)))
  batch.set(
    tRef,
    { status: 'active', key: tid, rounds, size, participantCount: participants.length, currentRound: 1, roundDeadlines, builtAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  await batch.commit()
  await resolveByes(tid, 1, rounds)
}

// Prosljeđivanje pobjednika u sljedeću rundu (fiksni bracket).
async function propagate(tid, round, slot, winner) {
  const field = slot % 2 === 0 ? 'p1' : 'p2'
  await db.doc(`tournaments/${tid}/matches/r${round + 1}s${Math.floor(slot / 2)}`).update({ [field]: winner })
}

// Odredi pobjednika meča (bye/walkover/skor; neriješeno → žrijeb).
function resolveMatch(m) {
  if (m.p1 && !m.p2) return m.p1
  if (m.p2 && !m.p1) return m.p2
  if (!m.p1 && !m.p2) return null
  if (m.p1Played && !m.p2Played) return m.p1
  if (m.p2Played && !m.p1Played) return m.p2
  if (!m.p1Played && !m.p2Played) return Math.random() < 0.5 ? m.p1 : m.p2
  if ((m.p1Score || 0) > (m.p2Score || 0)) return m.p1
  if ((m.p2Score || 0) > (m.p1Score || 0)) return m.p2
  return Math.random() < 0.5 ? m.p1 : m.p2
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
}

// Scheduled tick: gradi bracket i zatvara runde po rasporedu (svakih 30 min).
export const tournamentTick = onSchedule('every 30 minutes', async () => {
  const snap = await db.doc('config/tournament').get()
  const cfg = snap.exists ? snap.data() : null
  if (!cfg || !cfg.enabled || !cfg.key) return
  const tid = cfg.key
  const now = Date.now()

  // XP trka: finalizacija na kraju prozora (jednom, nezavisno od duela).
  if (cfg.closeAt && now >= cfg.closeAt) {
    const xr = await db.doc(`xpRaces/${tid}`).get()
    if (!xr.exists || !xr.data().finalized) await finalizeXpRace(tid)
  }

  // Duel bracket.
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

// Pokreni/nastavi svoj duel u tekućoj rundi.
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
    return { alreadyPlayed: true, score: isP1 ? m.p1Score : m.p2Score }
  }
  const sRef = db.doc(`duelSessions/${tid}_${uid}`)
  const sSnap = await sRef.get()
  let session
  if (sSnap.exists && sSnap.data().matchId === md.id && !sSnap.data().finished) {
    session = sSnap.data()
  } else {
    session = { tid, uid, matchId: md.id, questionIds: m.questionIds, answers: [], current: 0, finished: false, askedAt: Date.now() }
    await sRef.set(session)
  }
  const qid = session.questionIds[session.current]
  const qDoc = await getQuestionById(qid)
  return {
    matchId: md.id,
    total: session.questionIds.length,
    question: publicQuestion(qid, qDoc, session.current, QUESTION_SECONDS),
  }
})

// Odgovor u duelu; na zadnjem pitanju upisuje skor u meč (skriven protivniku).
export const submitDuelAnswer = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se.')
  const cfg = await getTournamentConfig()
  const tid = cfg?.key
  const { answerIndex } = request.data || {}
  const answer = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex <= 3 ? answerIndex : null
  const sRef = db.doc(`duelSessions/${tid}_${uid}`)
  const sSnap = await sRef.get()
  if (!sSnap.exists) throw new HttpsError('failed-precondition', 'Nema aktivnog duela.')
  const session = sSnap.data()
  if (session.finished) throw new HttpsError('failed-precondition', 'Duel je završen.')

  const elapsed = (Date.now() - (session.askedAt || Date.now())) / 1000
  const effective = elapsed > QUESTION_SECONDS + GRACE_SECONDS ? null : answer
  const qid = session.questionIds[session.current]
  const secret = await getSecret(qid)
  const correct = effective !== null && effective === secret.correctIndex
  const answers = [...session.answers, { correct }]
  const isLast = session.current + 1 >= session.questionIds.length

  if (!isLast) {
    const nextQid = session.questionIds[session.current + 1]
    const nextData = await getQuestionById(nextQid)
    await sRef.update({ answers, current: session.current + 1, askedAt: Date.now() })
    return {
      correct, correctIndex: secret.correctIndex, explanation: secret.explanation, finished: false,
      question: publicQuestion(nextQid, nextData, session.current + 1, QUESTION_SECONDS),
    }
  }

  const score = answers.filter((a) => a.correct).length
  await sRef.update({ answers, finished: true })
  const mRef = db.doc(`tournaments/${tid}/matches/${session.matchId}`)
  await db.runTransaction(async (tx) => {
    const ms = await tx.get(mRef)
    if (!ms.exists) return
    const m = ms.data()
    if (m.p1 === uid) tx.update(mRef, { p1Score: score, p1Played: true })
    else if (m.p2 === uid) tx.update(mRef, { p2Score: score, p2Played: true })
  })
  await applyProgress(uid, { duels: 1 }) // questovi tipa "odigraj duel"
  await bumpStreak(uid)
  return { correct, correctIndex: secret.correctIndex, explanation: secret.explanation, finished: true, myScore: score, total: session.questionIds.length }
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
async function pickSurvivalQuestion(seen) {
  const pool = (await getActiveQuestions()).filter((q) => !seen.includes(q.id))
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// Upis trenutnog niza u survival leaderboard (RTDB) — živo penjanje liste.
async function writeSurvivalLeaderboard(uid, week, streak) {
  const us = await db.doc(`users/${uid}`).get()
  const p = us.exists ? us.data() : {}
  await rtdb.ref(`survival/${week}/${uid}`).set({
    name: p.displayName || 'Farmaceut',
    avatar: p.avatar || 'a1',
    streak,
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
  if (run && run.week === week && !run.active) {
    return { locked: true, streak: run.streak || 0, week }
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
  }
})

// ---------------------------------------------------------------------------
// syncProfileToLeaderboard — svaka promjena profila (ime, avatar, XP...)
// osvježava globalni leaderboard unos. Klijent NE piše u leaderboard (pravila).
// ---------------------------------------------------------------------------
export const syncProfileToLeaderboard = onDocumentWritten('users/{uid}', async (event) => {
  const after = event.data?.after
  if (!after?.exists) return // profil obrisan — ništa
  const profile = after.data()
  const cfg = await getLevelConfig()
  const totalXp = profile.xp || 0
  await rtdb.ref(`leaderboard/global/${event.params.uid}`).set({
    ...leaderboardEntry(profile, levelFromXp(totalXp, cfg)),
    xp: totalXp,
  })
})
