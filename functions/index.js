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

// Tajna pitanja žive u questionSecrets/{id}; fallback na staro polje u
// questions/{id} dok migracija banke ne prođe (prelazni period).
async function getSecret(questionId) {
  const secretSnap = await db.doc(`questionSecrets/${questionId}`).get()
  if (secretSnap.exists) return secretSnap.data()
  const qSnap = await db.doc(`questions/${questionId}`).get()
  const data = qSnap.exists ? qSnap.data() : {}
  if (typeof data.correctIndex !== 'number') {
    throw new HttpsError('internal', 'Pitanje nema definisan tačan odgovor.')
  }
  return { correctIndex: data.correctIndex, explanation: data.explanation || '' }
}

// ---------------------------------------------------------------------------
// startQuiz — server bira nasumičnih 10 pitanja i otvara sesiju
// ---------------------------------------------------------------------------
export const startQuiz = onCall(async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Prijavi se za igranje kviza.')

  const snap = await db.collection('questions').where('active', '==', true).get()
  if (snap.empty) throw new HttpsError('failed-precondition', 'Banka pitanja je prazna.')

  // Fisher-Yates shuffle pa uzmi prvih N.
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
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
    const nextSnap = await db.doc(`questions/${nextMeta.id}`).get()
    await sessionRef.update({ answers, current: session.current + 1, askedAt: Date.now() })
    return {
      correct,
      correctIndex: secret.correctIndex,
      explanation: secret.explanation,
      finished: false,
      question: publicQuestion(nextMeta.id, nextSnap.data(), session.current + 1),
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
  const snap = await db.collection('questions').where('active', '==', true).get()
  const pool = snap.docs.filter((d) => !seen.includes(d.id))
  if (pool.length === 0) return null
  const d = pool[Math.floor(Math.random() * pool.length)]
  return { id: d.id, ...d.data() }
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
    const qSnap = await db.doc(`questions/${run.currentQid}`).get()
    if (qSnap.exists) {
      return {
        locked: false,
        streak: run.streak || 0,
        week,
        question: publicQuestion(run.currentQid, qSnap.data(), run.streak || 0, SURVIVAL_SECONDS),
      }
    }
  }
  // Novi run.
  const q = await pickSurvivalQuestion([])
  if (!q) throw new HttpsError('failed-precondition', 'Banka pitanja je prazna.')
  await runRef.set({ week, streak: 0, active: true, currentQid: q.id, seen: [q.id], askedAt: Date.now() })
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
