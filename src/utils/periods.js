// Pomoćne funkcije za periode taskova (Modul 6).
// Ključ perioda se čuva uz napredak — kad se ključ promijeni (novi dan/
// sedmica/mjesec), napredak se tretira kao 0 ("lijeni reset" na klijentu).
// Pravi serverski reset dolazi u Etapi 6 (Cloud Functions).

const pad = (n) => String(n).padStart(2, '0')

// '2026-07-22' (lokalno vrijeme)
export function dailyKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// '2026-W30' (ISO sedmica, ponedjeljak je prvi dan)
export function weeklyKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day) // četvrtak određuje ISO godinu
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${pad(week)}`
}

// '2026-07'
export function monthlyKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function periodKey(type, d = new Date()) {
  if (type === 'daily') return dailyKey(d)
  if (type === 'weekly') return weeklyKey(d)
  return monthlyKey(d)
}

// Sekunde do ponoći (za odbrojavanje na dnevnoj kartici).
export function secondsUntilMidnight(d = new Date()) {
  const midnight = new Date(d)
  midnight.setHours(24, 0, 0, 0)
  return Math.max(0, Math.floor((midnight - d) / 1000))
}

// 'HH:MM:SS' format za tajmer.
export function formatCountdown(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Broj dana do kraja sedmice / mjeseca (za "Obnavlja se za X dana").
export function daysUntilWeekEnd(d = new Date()) {
  const day = d.getDay() || 7 // ponedjeljak=1 ... nedjelja=7
  return 8 - day
}

export function daysUntilMonthEnd(d = new Date()) {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return lastDay - d.getDate() + 1
}
