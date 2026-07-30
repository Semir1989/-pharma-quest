// Ljestvica Preživljavanja: koraci niza 1 → 100, kovčeg na svakom 10.
// PAŽNJA: formula mora ostati identična serverskoj (functions/index.js,
// survivalChestReward). Server je taj koji XP isplaćuje — ovdje se isti iznos
// samo prikazuje na ljestvici i u animaciji otvaranja.
//
// Ovo NEMA veze s globalnim levelom igrača (utils/levels.js). Niz se resetuje
// srijedom, pa se i kovčezi mogu osvojiti iznova svake sedmice.

export const CHEST_STEP = 10
export const MAX_STEP = 100

// Svaki prag nosi FIKSNIH 300 XP (isto na 10 i na 100) — vidi
// SURVIVAL_CHEST_XP na serveru.
export const CHEST_XP = 300

export function chestReward() {
  return CHEST_XP
}

// Koliko kovčega sa žetonima nosi prag: 10 → 1, 20 → 2 … 100 → 10.
// Žetone izvlači server pri otvaranju (claimSurvivalChest), ovdje se samo
// prikazuje koliko ih čeka.
export function chestCount(step) {
  if (step % CHEST_STEP !== 0 || step <= 0 || step > MAX_STEP) return 0
  return step / CHEST_STEP
}

// Svi pragovi: [10, 20 … 100].
export function chestSteps() {
  const out = []
  for (let s = CHEST_STEP; s <= MAX_STEP; s += CHEST_STEP) out.push(s)
  return out
}

// Koliko kovčega je igrač te sedmice zaradio a još nije otvorio.
export function unopenedChests(streak = 0, opened = 0) {
  const earned = Math.floor(Math.min(streak, MAX_STEP) / CHEST_STEP)
  const seen = Math.floor(Math.min(Math.max(opened, 0), MAX_STEP) / CHEST_STEP)
  return Math.max(0, earned - seen)
}

// Prvi kovčeg na redu za otvaranje — 0 ako nema nijednog.
// Otvara se uvijek od najnižeg praga naviše, da oznaka (jedan broj) ostane
// konzistentna.
export function nextChest(streak = 0, opened = 0) {
  const next = (Math.floor(Math.max(opened, 0) / CHEST_STEP) + 1) * CHEST_STEP
  return next <= Math.min(streak, MAX_STEP) ? next : 0
}

// Koliko je kovčega igrač otvorio TE sedmice. Oznaka se pamti kao
// { week, opened }; kad sedmica istekne, kovčezi kreću ispočetka.
export function openedThisWeek(chest, week) {
  return chest?.week === week ? chest.opened || 0 : 0
}
