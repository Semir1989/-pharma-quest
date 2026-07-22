import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { buildUpdatedTaskProgress } from './tasks'

// Upis rezultata kviza u profil korisnika (Modul 4).
// NAPOMENA: bodovanje je privremeno na klijentu — u Etapi 6 seli na server
// (Cloud Functions), gdje XP polja mijenja isključivo server.
//
// answers = [{ question, selected, correct }]
// Vraća osvojeni XP.
export async function saveQuizResult(uid, profile, answers) {
  const earnedXp = answers.reduce(
    (sum, a) => sum + (a.correct ? a.question.points : 0),
    0
  )

  // Statistika po kategorijama (broj tačnih / ukupno) → procenat tačnosti.
  const stats = structuredClone(profile.categoryStats || {})
  for (const a of answers) {
    const cat = a.question.category
    if (!stats[cat]) stats[cat] = { correct: 0, total: 0 }
    stats[cat].total += 1
    if (a.correct) stats[cat].correct += 1
  }
  const accuracyByCategory = Object.fromEntries(
    Object.entries(stats).map(([cat, s]) => [
      cat,
      Math.round((s.correct / s.total) * 100),
    ])
  )

  // Brojači za taskove (Modul 6): kvizovi, tačni odgovori, XP, tačni po kategoriji.
  const correctByCategory = {}
  for (const a of answers) {
    if (a.correct) {
      correctByCategory[a.question.category] = (correctByCategory[a.question.category] || 0) + 1
    }
  }
  const taskProgress = buildUpdatedTaskProgress(profile, {
    correctCount: answers.filter((a) => a.correct).length,
    earnedXp,
    correctByCategory,
  })

  await updateDoc(doc(db, 'users', uid), {
    xp: increment(earnedXp),
    categoryStats: stats,
    accuracyByCategory,
    taskProgress,
    lastQuizAt: serverTimestamp(),
  })

  return earnedXp
}
