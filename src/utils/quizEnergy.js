import { dailyKey, nextDailyResetAt } from './periods'

// Energija za kvizove — klijentska KOPIJA serverske logike (functions/index.js,
// quizEnergyState). Služi samo prikazu; konačnu riječ uvijek ima server.
//
// Pravila: najviše 3 pokušaja odjednom, novi dan puni na 3, i po jedan se
// regeneriše svaka 4 sata do istog stropa. Nagrade iz kovčega ne dižu strop —
// one su žetoni (rewards.quizRefill) koji spremnik pune kad je prazan.
export const QUIZ_ENERGY_MAX = 3
export const QUIZ_REGEN_MS = 4 * 3600 * 1000

export function quizEnergy(profile, now = Date.now()) {
  const l = profile?.quizLimit
  const day = dailyKey()
  if (!l || l.day !== day) return { energy: QUIZ_ENERGY_MAX, regenAt: null }

  // Zatečeni profili nemaju `energy`, nego `started`.
  let energy = l.energy ?? Math.max(0, QUIZ_ENERGY_MAX - (l.started || 0))
  energy = Math.min(QUIZ_ENERGY_MAX, Math.max(0, energy))
  let regenAt = l.regenAt || null
  // Isto sidro kao na serveru: zapis od prije uvođenja energije nema tajmer,
  // pa bi igrač inače ostao zaključan do ponoći.
  if (!regenAt && energy < QUIZ_ENERGY_MAX) {
    regenAt = nextDailyResetAt() - 86400000 + QUIZ_REGEN_MS
  }
  while (regenAt && energy < QUIZ_ENERGY_MAX && now >= regenAt) {
    energy++
    regenAt += QUIZ_REGEN_MS
  }
  if (energy >= QUIZ_ENERGY_MAX) regenAt = null
  return { energy, regenAt }
}

// Žetoni s profila (nagrade iz kovčega).
export function rewardCounts(profile) {
  const r = profile?.rewards || {}
  return {
    quizRefill: r.quizRefill || 0,
    questReroll: r.questReroll || 0,
    // Zamjena sedmičnog/mjesečnog questa — zasebni žetoni, jer ti questovi nose
    // znatno veće nagrade od dnevnih (vidi CHEST_REWARDS na serveru).
    questRerollWeekly: r.questRerollWeekly || 0,
    questRerollMonthly: r.questRerollMonthly || 0,
    streakFreeze: r.streakFreeze || 0,
  }
}
