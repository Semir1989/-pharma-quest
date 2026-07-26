import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

// Kviz preko Cloud Functions (Etapa 6) — server bira pitanja, provjerava
// odgovore, vodi tajmer i dodjeljuje XP. Klijent samo prikazuje.

const startQuizFn = httpsCallable(functions, 'startQuiz')
const submitAnswerFn = httpsCallable(functions, 'submitAnswer')
const claimTaskFn = httpsCallable(functions, 'claimTask')
const ensureDailyQuestsFn = httpsCallable(functions, 'ensureDailyQuests')
const startSurvivalFn = httpsCallable(functions, 'startSurvival')
const submitSurvivalFn = httpsCallable(functions, 'submitSurvivalAnswer')
const registerForDuelFn = httpsCallable(functions, 'registerForDuel')
const startDuelFn = httpsCallable(functions, 'startDuel')
const submitDuelFn = httpsCallable(functions, 'submitDuelAnswer')

// → { sessionId, total, question: {...}, used, limit, xpToday, xpCap, resetsAt }
//   ili { limited: true, used, limit, xpToday, xpCap, resetsAt } kad je
//   dnevni limit od 3 kviza potrošen.
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

// Zamrzava (ili vraća) današnji izbor dnevnih questova → { picked, day, resetsAt }
export async function ensureDailyQuests() {
  return (await ensureDailyQuestsFn({})).data
}

// Preživljavanje (Etapa 8) — endless mod, jedna sedmična "sudbina".
// Ista funkcija pokreće novi run, nastavlja pauzirani (poslije izlaska) i vraća
// sljedeće pitanje kad igrač odabere "Nastavi".
// → { locked, streak, week, resumed?, exhausted?, question? }
export async function startSurvival() {
  return (await startSurvivalFn({})).data
}

// → { correct, correctIndex, explanation, finished, canExit?, eliminated?, streak, newBadges }
//   Tačan odgovor NE vraća sljedeće pitanje — run se pauzira dok igrač ne
//   odabere "Nastavi" (tada se zove startSurvival). Tako izlazak nikad ne
//   ostavlja neodgovoreno pitanje otvorenim.
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

// --- Admin alati (Etapa 9) — server traži custom claim admin:true -----------
// Sve rade nad VLASTITIM nalogom; panel je alat za testiranje, ne za
// mijenjanje tuđih rezultata.
const adminResetSurvivalFn = httpsCallable(functions, 'adminResetSurvival')
const adminSetXpFn = httpsCallable(functions, 'adminSetXp')
const adminSetHiddenFn = httpsCallable(functions, 'adminSetHidden')
const adminSetCosmeticFn = httpsCallable(functions, 'adminSetCosmetic')
const adminGrantAllCosmeticsFn = httpsCallable(functions, 'adminGrantAllCosmetics')

export async function adminResetSurvival() {
  return (await adminResetSurvivalFn({})).data
}

export async function adminSetXp(xp) {
  return (await adminSetXpFn({ xp })).data
}

export async function adminSetHidden(hidden) {
  return (await adminSetHiddenFn({ hidden })).data
}

export async function adminSetCosmetic(frameId, grant = true) {
  return (await adminSetCosmeticFn({ frameId, grant })).data
}

export async function adminGrantAllCosmetics(ids) {
  return (await adminGrantAllCosmeticsFn({ ids })).data
}

export async function adminClearCosmetics() {
  return (await adminGrantAllCosmeticsFn({ clear: true })).data
}

// --- Admin: kontrola eventa (Prioritet 1) -----------------------------------
const adminEventStatusFn = httpsCallable(functions, 'adminEventStatus')
const adminSetTournamentConfigFn = httpsCallable(functions, 'adminSetTournamentConfig')
const adminSetSurvivalConfigFn = httpsCallable(functions, 'adminSetSurvivalConfig')
const adminForceResolveRoundFn = httpsCallable(functions, 'adminForceResolveRound')
const adminRebuildBracketFn = httpsCallable(functions, 'adminRebuildBracket')
const adminCancelTournamentFn = httpsCallable(functions, 'adminCancelTournament')
const adminFinalizeXpRaceNowFn = httpsCallable(functions, 'adminFinalizeXpRaceNow')
const adminUnfinalizeXpRaceFn = httpsCallable(functions, 'adminUnfinalizeXpRace')

// → { tournament, survival, turnir, prijava, xpTrka, now }
export async function adminEventStatus() {
  return (await adminEventStatusFn({})).data
}

export async function adminSetTournamentConfig(cfg) {
  return (await adminSetTournamentConfigFn(cfg)).data
}

export async function adminSetSurvivalConfig(cfg) {
  return (await adminSetSurvivalConfigFn(cfg)).data
}

export async function adminForceResolveRound() {
  return (await adminForceResolveRoundFn({})).data
}

export async function adminRebuildBracket() {
  return (await adminRebuildBracketFn({})).data
}

export async function adminCancelTournament(clearParticipants = false) {
  return (await adminCancelTournamentFn({ clearParticipants })).data
}

export async function adminFinalizeXpRaceNow() {
  return (await adminFinalizeXpRaceNowFn({})).data
}

export async function adminUnfinalizeXpRace() {
  return (await adminUnfinalizeXpRaceFn({ confirmDoublePay: true })).data
}
