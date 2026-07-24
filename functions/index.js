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

// Preživljavanje (Etapa 8): endless mod, +3 XP po tačnom, kraj na prvu grešku.
const SURVIVAL_XP_PER_CORRECT = 3
const SURVIVAL_SECONDS = 20 // kraći tajmer — napetost; istek = kraj run-a

// ---------------------------------------------------------------------------
// Pomoćne funkcije: periodi (kopija logike iz src/utils/periods.js)
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0')

function dailyKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function weeklyKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${pad(week)}`
}

function monthlyKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
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
// ---------------------------------------------------------------------------
export const startQuiz = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se za igranje kviza.')

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
  const ref = await db.collection('quizSessions').add(session)

  return {
    sessionId: ref.id,
    total: chosen.length,
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
  let profileAfter, totalXp

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

    // Brojači taskova ("lijeni reset" po ključu perioda).
    const taskProgress = {}
    for (const type of ['daily', 'weekly', 'monthly']) {
      const stored = profile.taskProgress?.[type]
      const fresh = !stored || stored.period !== periodKey(type)
      const p = fresh
        ? { period: periodKey(type), quizzes: 0, correct: 0, xp: 0, byCategory: {}, claimed: {} }
        : { byCategory: {}, claimed: {}, ...stored }
      const byCategory = { ...p.byCategory }
      for (const [cat, n] of Object.entries(correctByCategory)) {
        byCategory[cat] = (byCategory[cat] || 0) + n
      }
      taskProgress[type] = {
        period: p.period,
        quizzes: (p.quizzes || 0) + 1,
        correct: (p.correct || 0) + correctCount,
        xp: (p.xp || 0) + earnedXp,
        byCategory,
        claimed: p.claimed,
      }
    }

    totalXp = (profile.xp || 0) + earnedXp
    profileAfter = profile
    tx.update(userRef, {
      xp: totalXp,
      quizCount: (profile.quizCount || 0) + 1,
      perfectQuizzes: (profile.perfectQuizzes || 0) + (correctCount === answers.length ? 1 : 0),
      categoryStats: stats,
      accuracyByCategory,
      taskProgress,
      lastQuizAt: FieldValue.serverTimestamp(),
    })
  })

  await sessionRef.update({ answers, finished: true, finishedAt: FieldValue.serverTimestamp() })
  const levelBonus = await awardLevelMilestones(uid) // { bonusXp, milestones, totalXp }
  const finalXp = levelBonus.totalXp || totalXp
  await syncLeaderboard(uid, profileAfter, finalXp, earnedXp, levelFromXp(finalXp, cfg))
  const newBadges = await awardBadges(uid)
  await addWeekendXp(uid, earnedXp)
  await bumpStreak(uid)

  return {
    correct,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: true,
    summary: { earnedXp, correctCount, total: answers.length },
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
}

// Finalizacija XP trke na kraju prozora: nagrade top 3 (bonus XP), jednokratno.
const XP_RACE_REWARDS = [500, 300, 150] // 1., 2., 3. mjesto
async function finalizeXpRace(tid) {
  const snap = await rtdb.ref(`tournament/${tid}`).orderByChild('xp').limitToLast(3).get()
  const rows = []
  snap.forEach((c) => rows.push({ uid: c.key, ...c.val() }))
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

// startSurvival — pokreni novi run, nastavi aktivni, ili javi da je iskorišten.
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

  // Pokušaj ove sedmice već potrošen (run završen) → zaključano do srijede.
  if (run && run.week === week && !run.active) {
    return { locked: true, streak: run.streak || 0, week }
  }
  // Aktivan run ove sedmice → nastavi s trenutnim pitanjem.
  if (run && run.week === week && run.active && run.currentQid) {
    const qData = await getQuestionById(run.currentQid)
    if (qData) {
      return {
        locked: false,
        streak: run.streak || 0,
        week,
        question: publicQuestion(run.currentQid, qData, run.streak || 0, SURVIVAL_SECONDS),
      }
    }
  }
  // Novi run.
  const q = await pickSurvivalQuestion([])
  if (!q) throw new HttpsError('failed-precondition', 'Banka pitanja je prazna.')
  await runRef.set({ week, streak: 0, active: true, currentQid: q.id, seen: [q.id], askedAt: Date.now() })
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

  const elapsed = (Date.now() - (run.askedAt || Date.now())) / 1000
  const timedOut = elapsed > SURVIVAL_SECONDS + GRACE_SECONDS
  const secret = await getSecret(run.currentQid)
  const correct = !timedOut && answer !== null && answer === secret.correctIndex

  // Greška ili istek → kraj run-a za ovu sedmicu.
  if (!correct) {
    await runRef.update({ active: false, endedAt: FieldValue.serverTimestamp() })
    await writeSurvivalLeaderboard(uid, week, run.streak || 0)
    const newBadges = await awardBadges(uid)
    return {
      correct: false,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: true,
      streak: run.streak || 0,
      newBadges,
    }
  }

  // Tačno → +3 XP i sljedeće pitanje.
  const newStreak = (run.streak || 0) + 1
  const userRef = db.doc(`users/${uid}`)
  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef)
    if (!us.exists) throw new HttpsError('not-found', 'Profil ne postoji.')
    tx.update(userRef, { xp: (us.data().xp || 0) + SURVIVAL_XP_PER_CORRECT })
  })
  const levelBonus = await awardLevelMilestones(uid)
  await addWeekendXp(uid, SURVIVAL_XP_PER_CORRECT)

  const seen = run.seen || []
  const next = await pickSurvivalQuestion(seen)
  if (!next) {
    // Banka iscrpljena — run se završava kao savršen (sva pitanja tačno).
    await runRef.update({ active: false, streak: newStreak, endedAt: FieldValue.serverTimestamp() })
    await writeSurvivalLeaderboard(uid, week, newStreak)
    const newBadges = await awardBadges(uid)
    return {
      correct: true,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: true,
      exhausted: true,
      streak: newStreak,
      levelBonus,
      newBadges,
    }
  }

  await runRef.update({ streak: newStreak, currentQid: next.id, seen: [...seen, next.id], askedAt: Date.now() })
  await writeSurvivalLeaderboard(uid, week, newStreak)
  const newBadges = await awardBadges(uid)
  return {
    correct: true,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: false,
    streak: newStreak,
    question: publicQuestion(next.id, next, newStreak, SURVIVAL_SECONDS),
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
