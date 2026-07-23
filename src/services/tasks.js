import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { periodKey } from '../utils/periods'
import { claimTaskReward } from './quizApi'

// Servis za task sistem (Modul 6).
// Definicije taskova žive u Firestore 'tasks' kolekciji (admin skripta),
// a napredak korisnika u users/{uid}.taskProgress po periodu (daily/weekly/monthly).

// Sve aktivne taskove grupisane po tipu: { daily: [...], weekly: [...], monthly: [...] }
export async function getTasks() {
  const snap = await getDocs(query(collection(db, 'tasks'), where('active', '==', true)))
  const grouped = { daily: [], weekly: [], monthly: [] }
  for (const d of snap.docs) {
    const task = { id: d.id, ...d.data() }
    if (grouped[task.type]) grouped[task.type].push(task)
  }
  for (const list of Object.values(grouped)) list.sort((a, b) => (a.order || 0) - (b.order || 0))
  return grouped
}

const EMPTY = { quizzes: 0, correct: 0, xp: 0, byCategory: {}, claimed: {} }

// Napredak za dati tip perioda — ako je period istekao, vraća prazan ("lijeni reset").
export function progressForType(profile, type) {
  const stored = profile?.taskProgress?.[type]
  if (!stored || stored.period !== periodKey(type)) return { ...EMPTY, period: periodKey(type) }
  return { ...EMPTY, ...stored, byCategory: stored.byCategory || {}, claimed: stored.claimed || {} }
}

// Koliko je korisnik napredovao na konkretnom tasku.
export function taskValue(progress, task) {
  if (task.metric === 'correct' && task.category) return progress.byCategory[task.category] || 0
  return progress[task.metric] || 0
}

// Preuzimanje nagrade (Etapa 6): server provjerava uslov i dodjeljuje XP —
// klijent više ništa ne upisuje sam.
export async function claimTask(task) {
  await claimTaskReward(task.id)
}
