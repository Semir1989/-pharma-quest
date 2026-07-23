import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

// Kviz preko Cloud Functions (Etapa 6) — server bira pitanja, provjerava
// odgovore, vodi tajmer i dodjeljuje XP. Klijent samo prikazuje.

const startQuizFn = httpsCallable(functions, 'startQuiz')
const submitAnswerFn = httpsCallable(functions, 'submitAnswer')
const claimTaskFn = httpsCallable(functions, 'claimTask')

// → { sessionId, total, question: { index, id, text, options, category, points, seconds } }
export async function startQuizSession() {
  return (await startQuizFn({})).data
}

// → { correct, correctIndex, explanation, finished, question? , summary? }
export async function submitQuizAnswer(sessionId, answerIndex) {
  return (await submitAnswerFn({ sessionId, answerIndex })).data
}

// → { reward }
export async function claimTaskReward(taskId) {
  return (await claimTaskFn({ taskId })).data
}
