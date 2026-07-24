import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

// Kviz preko Cloud Functions (Etapa 6) — server bira pitanja, provjerava
// odgovore, vodi tajmer i dodjeljuje XP. Klijent samo prikazuje.

const startQuizFn = httpsCallable(functions, 'startQuiz')
const submitAnswerFn = httpsCallable(functions, 'submitAnswer')
const claimTaskFn = httpsCallable(functions, 'claimTask')
const startSurvivalFn = httpsCallable(functions, 'startSurvival')
const submitSurvivalFn = httpsCallable(functions, 'submitSurvivalAnswer')
const registerForDuelFn = httpsCallable(functions, 'registerForDuel')
const startDuelFn = httpsCallable(functions, 'startDuel')
const submitDuelFn = httpsCallable(functions, 'submitDuelAnswer')

// → { sessionId, total, question: { index, id, text, options, category, points, seconds } }
export async function startQuizSession() {
  return (await startQuizFn({})).data
}

// → { correct, correctIndex, explanation, finished, question?, summary?, newBadges? }
export async function submitQuizAnswer(sessionId, answerIndex) {
  return (await submitAnswerFn({ sessionId, answerIndex })).data
}

// → { reward, newBadges }
export async function claimTaskReward(taskId) {
  return (await claimTaskFn({ taskId })).data
}

// Preživljavanje (Etapa 8) — endless mod, jedan pokušaj sedmično.
// → { locked, streak, week, question? }  (locked=true ako je pokušaj potrošen)
export async function startSurvival() {
  return (await startSurvivalFn({})).data
}

// → { correct, correctIndex, explanation, finished, streak, question?, exhausted?, newBadges }
export async function submitSurvivalAnswer(answerIndex) {
  return (await submitSurvivalFn({ answerIndex })).data
}

// Duel turnir (Faza 2, korak C).
export async function registerForDuel() {
  return (await registerForDuelFn({})).data
}

// → { noMatch? , alreadyPlayed?, score?, matchId?, total?, question? }
export async function startDuel() {
  return (await startDuelFn({})).data
}

// → { correct, correctIndex, explanation, finished, question?, myScore?, total? }
export async function submitDuelAnswer(answerIndex) {
  return (await submitDuelFn({ answerIndex })).data
}
