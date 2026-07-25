// XP / level logika (Modul 5).
// Rastuća kriva: za prelazak na sljedeći level treba sve više XP-a.
//   Level 2: 100 XP, Level 3: +125, Level 4: +150 ... (+25 po koraku)
// Parametri krive žive u Firestore (config/levels) — vidi services/levelConfig.js.
// Ovi defaulti se koriste dok se konfiguracija ne učita (ili ako je nema).

export const DEFAULT_LEVEL_CONFIG = {
  baseXp: 100, // XP za prelazak s levela 1 na 2
  stepXp: 25, // koliko svaki sljedeći prelazak poskupljuje
  maxLevel: 100,
}

let config = { ...DEFAULT_LEVEL_CONFIG }

export function setLevelConfig(partial) {
  config = { ...DEFAULT_LEVEL_CONFIG, ...partial }
}

// Ukupan (kumulativni) XP potreban da se DOSTIGNE dati level.
export function xpForLevel(level) {
  const k = Math.min(level, config.maxLevel) - 1
  return k * config.baseXp + (config.stepXp * k * (k - 1)) / 2
}

export function levelFromXp(xp = 0) {
  let level = 1
  while (level < config.maxLevel && xp >= xpForLevel(level + 1)) level++
  return level
}

// Napredak unutar trenutnog levela (za XP bar).
export function xpProgress(xp = 0) {
  const level = levelFromXp(xp)
  const start = xpForLevel(level)
  const next = level >= config.maxLevel ? start + 1 : xpForLevel(level + 1)
  const needed = next - start
  const current = Math.min(xp - start, needed)
  return {
    current,
    needed,
    percent: Math.min(100, Math.round((current / needed) * 100)),
  }
}

export function maxLevel() {
  return config.maxLevel
}

// ---------------------------------------------------------------------------
// Pragovi (kovčezi) — svaki 10. level nosi bonus XP
// ---------------------------------------------------------------------------
// PAŽNJA: formula mora ostati identična serverskoj (functions/index.js,
// awardLevelMilestones). Server je taj koji XP zaista isplaćuje — ovdje samo
// računamo isti iznos da bismo ga prikazali na ljestvici i u animaciji.

export const MILESTONE_STEP = 10

// Level 10 → 100 XP, level 20 → 200 XP, … level 100 → 1000 XP.
export function milestoneReward(level) {
  return (level / MILESTONE_STEP) * 100
}

// Svi pragovi do maksimalnog levela: [10, 20, 30 … 100].
export function milestoneLevels() {
  const out = []
  for (let l = MILESTONE_STEP; l <= config.maxLevel; l += MILESTONE_STEP) out.push(l)
  return out
}

// Koliko kovčega igrač ima zarađenih a još neotvorenih.
// `opened` = users/{uid}.levelRewardOpened (zadnji prag koji je igrač OTVORIO;
// nije isto što i levelRewardMilestone, koji pamti zadnji ISPLAĆENI prag).
export function unopenedChests(level = 1, opened = 0) {
  const earned = Math.floor(Math.min(level, config.maxLevel) / MILESTONE_STEP)
  const seen = Math.floor(Math.min(Math.max(opened, 0), config.maxLevel) / MILESTONE_STEP)
  return Math.max(0, earned - seen)
}

// Prvi kovčeg koji igrač smije otvoriti — 0 ako nema nijednog.
// Otvara se uvijek redom, od najnižeg praga naviše, da `levelRewardOpened`
// (jedan jedini broj) ostane konzistentan.
export function nextChest(level = 1, opened = 0) {
  const next = (Math.floor(Math.max(opened, 0) / MILESTONE_STEP) + 1) * MILESTONE_STEP
  return next <= Math.min(level, config.maxLevel) ? next : 0
}

// Rang (titula) na osnovu levela — prikazuje se na profilu.
export function rankFromLevel(level = 1) {
  if (level >= 40) return 'Legenda'
  if (level >= 25) return 'Specijalista'
  if (level >= 10) return 'Znalac'
  if (level >= 5) return 'Praktikant'
  return 'Početnik'
}
