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

// Istaknuti bedževi: koliko ih igrač smije pokazati na avataru.
// Mjesto na avataru je znak statusa, pa se otključava kroz levele — level 10
// donosi prvo, 20 drugo, 30 treće. Ispod levela 10 nema nijednog.
// PAŽNJA: firestore.rules drži tvrdu gornju granicu od 3; ako se ova lista
// produži, mora se produžiti i tamo.
export const FEATURED_SLOT_LEVELS = [10, 20, 30]
export const MAX_FEATURED_BADGES = FEATURED_SLOT_LEVELS.length

export function featuredBadgeSlots(level = 1) {
  return FEATURED_SLOT_LEVELS.filter((l) => level >= l).length
}

// Sljedeći level koji donosi novo mjesto — null kad su sva otključana.
export function nextFeaturedSlotLevel(level = 1) {
  return FEATURED_SLOT_LEVELS.find((l) => level < l) ?? null
}

// Rang (titula) na osnovu levela — prikazuje se na profilu.
export function rankFromLevel(level = 1) {
  if (level >= 40) return 'Legenda'
  if (level >= 25) return 'Specijalista'
  if (level >= 10) return 'Znalac'
  if (level >= 5) return 'Praktikant'
  return 'Početnik'
}
