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
const GRACE_SECONDS = 6 // tolerancija za mrežno kašnjenje

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
  levelConfigCache = { baseXp: 100, stepXp: 25, maxLevel: 60, ...(snap.exists ? snap.data() : {}) }
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
function publicQuestion(id, data, index) {
  return {
    index,
    id,
    text: data.text,
    options: data.options,
    category: data.category,
    points: data.points,
    seconds: QUESTION_SECONDS,
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
      categoryStats: stats,
      accuracyByCategory,
      taskProgress,
      lastQuizAt: FieldValue.serverTimestamp(),
    })
  })

  await sessionRef.update({ answers, finished: true, finishedAt: FieldValue.serverTimestamp() })
  await syncLeaderboard(uid, profileAfter, totalXp, earnedXp, levelFromXp(totalXp, cfg))

  return {
    correct,
    correctIndex: secret.correctIndex,
    explanation: secret.explanation,
    finished: true,
    summary: { earnedXp, correctCount, total: answers.length },
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

  await syncLeaderboard(uid, profileAfter, totalXp, task.reward, levelFromXp(totalXp, cfg))

  return { reward: task.reward }
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
