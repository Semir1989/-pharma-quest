import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { track } from './analytics'

// Kviz preko Cloud Functions (Etapa 6) — server bira pitanja, provjerava
// odgovore, vodi tajmer i dodjeljuje XP. Klijent samo prikazuje.

// ---------------------------------------------------------------------------
// Prolazne greške poziva (27.07.2026)
//
// Zabilježen slučaj: "Ne mogu pokrenuti izazov" na prvi pritisak, drugi prošao.
// U logovima Cloud Functions NEMA nijedne invokacije za taj prvi pokušaj —
// dakle zahtjev nikad nije ni poslan. Firebase SDK prvo dovuče ID token
// (getIdToken); ako to padne, baci grešku prije slanja i server ne vidi ništa.
//
// Zato dvije stvari:
//   1. kod greške se BILJEŽI (konzola + GA4) — ranije se gutao u catch {} pa
//      se ovakav slučaj nije mogao ni dijagnosticirati;
//   2. jedan tihi ponovni pokušaj, ali SAMO za pozive koji su ponovljivi.
//
// PAŽNJA: ne ponavljati submitAnswer/submitSurvivalAnswer/claimTask. Ako je
// prvi poziv uspio a odgovor se izgubio, ponavljanje bi odgovorilo na SLJEDEĆE
// pitanje istim indeksom ili tražilo nagradu dvaput.
// ---------------------------------------------------------------------------
const PROLAZNE = ['internal', 'unavailable', 'deadline-exceeded', 'aborted', 'cancelled']

function kodGreske(e) {
  return String(e?.code || 'nepoznato').replace(/^functions\//, '')
}

// Omotač: bilježi grešku i (opciono) jednom ponovi poziv.
function poziv(ime, fn, { ponovi = false } = {}) {
  return async (payload = {}) => {
    try {
      return (await fn(payload)).data
    } catch (e) {
      const kod = kodGreske(e)
      console.error(`[callable] ${ime} → ${kod}`, e?.message || '')
      track('callable_error', { fn: ime, code: kod, retried: ponovi && PROLAZNE.includes(kod) })
      if (!ponovi || !PROLAZNE.includes(kod)) throw e
      // Kratka pauza pa još jedan pokušaj — token se u međuvremenu osvježi.
      await new Promise((r) => setTimeout(r, 600))
      return (await fn(payload)).data
    }
  }
}

const startQuizFn = httpsCallable(functions, 'startQuiz')
const submitAnswerFn = httpsCallable(functions, 'submitAnswer')
const resumeQuizFn = httpsCallable(functions, 'resumeQuiz')
const pocniPitanjeFn = httpsCallable(functions, 'pocniPitanje')
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
// Ponovljiv: nedovršena sesija se nastavlja (limit.sessionId), pa drugi pokušaj
// ne troši novi kviz nego vraća isto pitanje.
const startQuizPoziv = poziv('startQuiz', startQuizFn, { ponovi: true })
export async function startQuizSession() {
  return startQuizPoziv({})
}

// → { correct, late, correctIndex, explanation, finished, question?, summary?, newBadges? }
//   late: true = igrač je odgovorio, ali je server odgovor poništio kao
//   zakašnjeli. Klijent to mora razlikovati od pogrešnog odgovora.
const submitAnswerPoziv = poziv('submitAnswer', submitAnswerFn)
export async function submitQuizAnswer(sessionId, answerIndex) {
  return submitAnswerPoziv({ sessionId, answerIndex })
}

// Javlja serveru da je pitanje iscrtano — tek tad kreće njegov rok. Bez ovoga
// rok teče od ocjene prethodnog pitanja, pa vrijeme čitanja objašnjenja jede
// sljedeće pitanje (greška od 30.07.2026.).
//
// Best effort: greška se namjerno guta jer server ima sigurnosnu mrežu
// (askedAt iz submitAnswer). Server je idempotentan — rok po pitanju pomjera
// najviše jednom, pa je i dupli poziv (StrictMode, retry) bezopasan.
const pocniPitanjePoziv = poziv('pocniPitanje', pocniPitanjeFn, { ponovi: true })
export async function pocniPitanjeKviza(sessionId, index) {
  try {
    return await pocniPitanjePoziv({ sessionId, index })
  } catch {
    return { pokrenuto: false }
  }
}

// Nastavak poslije pauze → { total, question }. Ne mijenja nijedan odgovor ni
// brojač pokušaja, samo pomjera rok pitanja, pa je bezopasno ponoviti.
const resumeQuizPoziv = poziv('resumeQuiz', resumeQuizFn, { ponovi: true })
export async function resumeQuizQuestion(sessionId) {
  return resumeQuizPoziv({ sessionId })
}

// → { reward, newBadges }
const claimTaskPoziv = poziv('claimTask', claimTaskFn)
export async function claimTaskReward(taskId) {
  return claimTaskPoziv({ taskId })
}

// Zamrzava (ili vraća) današnji izbor dnevnih questova → { picked, day, resetsAt }
const ensureDailyQuestsPoziv = poziv('ensureDailyQuests', ensureDailyQuestsFn, { ponovi: true })
export async function ensureDailyQuests() {
  return ensureDailyQuestsPoziv({})
}

// Preživljavanje (Etapa 8) — endless mod, jedna sedmična "sudbina".
// Ista funkcija pokreće novi run, nastavlja pauzirani (poslije izlaska) i vraća
// sljedeće pitanje kad igrač odabere "Nastavi".
// → { locked, streak, week, resumed?, exhausted?, question? }
// Ponovljiv: stanje run-a je u survivalRuns/{uid}, pa drugi pokušaj vraća isto
// pitanje sa svježim tajmerom — ovo je poziv koji je 27.07. pao na prvi pritisak.
const startSurvivalPoziv = poziv('startSurvival', startSurvivalFn, { ponovi: true })
export async function startSurvival() {
  return startSurvivalPoziv({})
}

// → { correct, correctIndex, explanation, finished, canExit?, eliminated?, streak, newBadges }
//   Tačan odgovor NE vraća sljedeće pitanje — run se pauzira dok igrač ne
//   odabere "Nastavi" (tada se zove startSurvival). Tako izlazak nikad ne
//   ostavlja neodgovoreno pitanje otvorenim.
const submitSurvivalPoziv = poziv('submitSurvivalAnswer', submitSurvivalFn)
export async function submitSurvivalAnswer(answerIndex) {
  return submitSurvivalPoziv({ answerIndex })
}

// Duel turnir (Faza 2, korak C).
const registerForDuelPoziv = poziv('registerForDuel', registerForDuelFn)
export async function registerForDuel() {
  return registerForDuelPoziv({})
}

// → { noMatch?, alreadyPlayed?, score?, matchId?, total?, index?, secondsLeft?,
//     totalSeconds?, question? }
// secondsLeft je ostatak JEDNOG sata za cijeli duel (120 s); ne resetuje se
// povratkom u aplikaciju.
const startDuelPoziv = poziv('startDuel', startDuelFn, { ponovi: true })
export async function startDuel() {
  return startDuelPoziv({})
}

// → { correct, correctIndex, explanation, finished, question?, secondsLeft?,
//     myScore?, total?, isteklo? }
// `kraj: true` zatvara duel na mjestu (klijentski tajmer je došao na nulu).
const submitDuelPoziv = poziv('submitDuelAnswer', submitDuelFn)
export async function submitDuelAnswer(answerIndex, { kraj = false } = {}) {
  return submitDuelPoziv({ answerIndex, kraj })
}

// Otvaranje kovčega za level → { level, preostalo }
const claimLevelChestFn = httpsCallable(functions, 'claimLevelChest')

export async function claimLevelChest() {
  return (await claimLevelChestFn({})).data
}

// Otvaranje kovčega za rekord Preživljavanja → { preostalo, reward }
const claimSurvivalRecordChestFn = httpsCallable(functions, 'claimSurvivalRecordChest')
export async function claimSurvivalRecordChest() {
  return (await claimSurvivalRecordChestFn({})).data
}

// Otvaranje kovčega na ljestvici Preživljavanja (prag 10, 20 … 100)
// → { step, xp, nagrade: [{ id, kind, amount, label }], preostalo }
// 300 XP je već isplaćeno pri dostizanju praga; ovim se izvlače žetoni.
const claimSurvivalChestFn = httpsCallable(functions, 'claimSurvivalChest')
export async function claimSurvivalChest(step) {
  return (await claimSurvivalChestFn({ step })).data
}

// Trošenje žetona za pokušaj kviza → { energy, preostaloZetona }
const spendQuizRefillFn = httpsCallable(functions, 'spendQuizRefill')
export async function spendQuizRefill() {
  return (await spendQuizRefillFn({})).data
}

// Žeton za oživljavanje u Preživljavanju (nagrada za mjesečni EPC post)
// → { streak, xp, chestReward, levelBonus, newBadges, newFrames }
// Pitanje na kojem je igrač pao broji se kao pređeno; nastavlja na sljedećem.
// NAMJERNO nije u retry omotaču `poziv()`: ponovljeni poziv bi potrošio drugi
// žeton, a server ga ne bi odbio jer bi run u međuvremenu već bio oživljen.
const spendSurvivalReviveFn = httpsCallable(functions, 'spendSurvivalRevive')
export async function spendSurvivalRevive() {
  return (await spendSurvivalReviveFn({})).data
}

// Zamjena jednog današnjeg questa → { noviTaskId, preostaloZetona }
const rerollDailyQuestFn = httpsCallable(functions, 'rerollDailyQuest')
export async function rerollDailyQuest(taskId) {
  return (await rerollDailyQuestFn({ taskId })).data
}

// --- Admin alati (Etapa 9) — server traži custom claim admin:true -----------
// Sve rade nad VLASTITIM nalogom; panel je alat za testiranje, ne za
// mijenjanje tuđih rezultata. Dva su izuzetka i oba su namjerna:
// adminBroadcast (objava) i adminSetQuestProgress (vanjski EPC zadaci).
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

// Objava svim igračima. NAMJERNO bez retryja iz omotača poziv(): ponovljena
// objava svima je tačno ona greška koju ne smijemo napraviti. Server dodatno
// odbija drugu objavu unutar 30 sekundi.
// `komu` (uid) šalje samo tom igraču; bez njega ide svima.
const adminBroadcastFn = httpsCallable(functions, 'adminBroadcast')
export async function adminBroadcast({ naslov, tekst, url, test = false, komu = null }) {
  return (await adminBroadcastFn({ naslov, tekst, url, test, komu })).data
}

// --- Admin: vanjski (EPC) zadaci --------------------------------------------
// Drugi izuzetak od "samo nad sobom": igrica ne vidi Circle platformu, pa
// komentare, lajkove i postove potvrđuje admin. Upisuje se SAMO napredak —
// XP, žetone i zelene bodove igrač preuzima sam kroz claimTask.
const adminQuestStanjeFn = httpsCallable(functions, 'adminQuestStanje')
const adminSetQuestProgressFn = httpsCallable(functions, 'adminSetQuestProgress')

// → { ime, zadaci: [{ id, type, title, goal, reward, tokens, clanGold,
//     vrijednost, preuzeto, period }] }
export async function adminQuestStanje(uid) {
  return (await adminQuestStanjeFn({ uid })).data
}

export async function adminSetQuestProgress(uid, taskId, value) {
  return (await adminSetQuestProgressFn({ uid, taskId, value })).data
}

// Popis igrača sa stanjem pretplate — za biranje primaoca objave, potvrdu
// vanjskih zadataka i izmjenu imena. Nosi i email (jedina veza s nalogom na
// Circle platformi), telefon i državu iz registracije.
const adminListPlayersFn = httpsCallable(functions, 'adminListPlayers')
export async function adminListPlayers() {
  return (await adminListPlayersFn({})).data
}

// Izmjena imena igrača. Treći alat koji dira tuđi profil (uz objavu i vanjske
// zadatke) — ime stoji na ljestvici i u bracketu, pa ga bez admina niko ne može
// ispraviti. Ljestvicu osvježava trigger syncProfileToLeaderboard sam.
const adminSetDisplayNameFn = httpsCallable(functions, 'adminSetDisplayName')
export async function adminSetDisplayName(uid, ime) {
  return (await adminSetDisplayNameFn({ uid, ime })).data
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

// --- Admin: XP trka kao zaseban event ---------------------------------------
const adminSetXpRaceConfigFn = httpsCallable(functions, 'adminSetXpRaceConfig')

export async function adminSetXpRaceConfig(cfg) {
  return (await adminSetXpRaceConfigFn(cfg)).data
}

// --- Admin: 1v1 turnir, poluge tokom eventa ---------------------------------
const adminTurnirPregledFn = httpsCallable(functions, 'adminTurnirPregled')
const adminSetRoundDeadlinesFn = httpsCallable(functions, 'adminSetRoundDeadlines')
const adminPruneEmptyMatchesFn = httpsCallable(functions, 'adminPruneEmptyMatches')
const adminSetMatchWinnerFn = httpsCallable(functions, 'adminSetMatchWinner')
const adminResetDuelFn = httpsCallable(functions, 'adminResetDuel')
const adminZatvoriZaglavljeneFn = httpsCallable(functions, 'adminZatvoriZaglavljene')
const adminSetParticipantFn = httpsCallable(functions, 'adminSetParticipant')
const adminPodsjetiNeodigraleFn = httpsCallable(functions, 'adminPodsjetiNeodigrale')

// → { tid, bracket, status, currentRound, rounds, roundDeadlines, ucesnici,
//     mecevi, zaglavljene, neodigrali, problemi, now }
export async function adminTurnirPregled() {
  return (await adminTurnirPregledFn({})).data
}

// `auto: true` iznova računa rokove po BiH terminima (08/14/20).
export async function adminSetRoundDeadlines(arg) {
  const data = arg === 'auto' ? { auto: true } : { roundDeadlines: arg }
  return (await adminSetRoundDeadlinesFn(data)).data
}

export async function adminPruneEmptyMatches() {
  return (await adminPruneEmptyMatchesFn({})).data
}

export async function adminSetMatchWinner(matchId, winner) {
  return (await adminSetMatchWinnerFn({ matchId, winner })).data
}

export async function adminResetDuel(uid, matchId) {
  return (await adminResetDuelFn({ uid, matchId })).data
}

export async function adminZatvoriZaglavljene() {
  return (await adminZatvoriZaglavljeneFn({})).data
}

export async function adminSetParticipant(uid, dodaj = true) {
  return (await adminSetParticipantFn({ uid, dodaj })).data
}

export async function adminPodsjetiNeodigrale() {
  return (await adminPodsjetiNeodigraleFn({})).data
}
