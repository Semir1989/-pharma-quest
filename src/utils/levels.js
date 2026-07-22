// XP / level logika.
// Privremeno: ravna kriva od 1000 XP po levelu. Prava kriva iz plana
// konfiguriše se u Firestore u Modulu 5 (Level sistem).
const XP_PER_LEVEL = 1000

export function levelFromXp(xp = 0) {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function xpProgress(xp = 0) {
  const intoLevel = xp % XP_PER_LEVEL
  return {
    current: intoLevel,
    needed: XP_PER_LEVEL,
    percent: Math.round((intoLevel / XP_PER_LEVEL) * 100),
  }
}

// Rang (titula) na osnovu levela — prikazuje se na profilu.
export function rankFromLevel(level = 1) {
  if (level >= 40) return 'Legenda'
  if (level >= 25) return 'Specijalista'
  if (level >= 10) return 'Znalac'
  if (level >= 5) return 'Praktikant'
  return 'Početnik'
}
