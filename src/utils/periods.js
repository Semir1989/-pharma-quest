// Pomoćne funkcije za periode taskova (Modul 6).
// Ključ perioda se čuva uz napredak — kad se ključ promijeni (novi dan/
// sedmica/mjesec), napredak se tretira kao 0 ("lijeni reset"). Konačnu riječ
// ima server (Cloud Functions), klijent istu logiku koristi samo za prikaz.
//
// SVI ključevi se računaju po BiH vremenu (Europe/Sarajevo). Bez toga bi se
// dnevni reset razilazio: Cloud Functions rade u UTC-u, a telefon u CEST-u
// (+2h), pa bi limit od 3 kviza pucao dva sata poslije ponoći na ekranu.
// functions/index.js ima identičnu kopiju ovih funkcija.

const BIH_TZ = 'Europe/Sarajevo'
const pad = (n) => String(n).padStart(2, '0')

// Civilni datum i vrijeme u BiH za dati trenutak.
function bihParts(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BIH_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  // Neke ICU verzije vraćaju '24' za ponoć.
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second }
}

// Pomak BiH zone u odnosu na UTC u datom trenutku (ms) — hvata i ljetno vrijeme.
function bihOffset(d) {
  const p = bihParts(d)
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - Math.floor(d.getTime() / 1000) * 1000
}

// '2026-07-22' (BiH dan)
export function dailyKey(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  return `${y}-${pad(m)}-${pad(day)}`
}

// '2026-W30' (ISO sedmica po BiH danu, ponedjeljak je prvi dan)
export function weeklyKey(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const date = new Date(Date.UTC(y, m - 1, day))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow) // četvrtak određuje ISO godinu
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${pad(week)}`
}

// '2026-07' (BiH mjesec)
export function monthlyKey(d = new Date()) {
  const { y, m } = bihParts(d)
  return `${y}-${pad(m)}`
}

export function periodKey(type, d = new Date()) {
  if (type === 'daily') return dailyKey(d)
  if (type === 'weekly') return weeklyKey(d)
  return monthlyKey(d)
}

// Trenutak sljedeće ponoći po BiH vremenu (ms epoch). Dva prolaza zbog prelaska
// na ljetno/zimsko vrijeme — drugi prolaz koristi offset koji vrijedi u samoj ponoći.
export function nextDailyResetAt(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const midnightCivil = Date.UTC(y, m - 1, day + 1)
  const guess = midnightCivil - bihOffset(d)
  return midnightCivil - bihOffset(new Date(guess))
}

// Sekunde do dnevnog reseta (ponoć po BiH vremenu) — odbrojavanje na karticama.
export function secondsUntilDailyReset(d = new Date()) {
  return Math.max(0, Math.floor((nextDailyResetAt(d) - d.getTime()) / 1000))
}

// Ključ sedmice Preživljavanja — sedmica POČINJE SRIJEDOM (reset srijedom).
// UTC-bazirano, identično serveru (functions/index.js) da putanja leaderboarda
// bude ista. Vraća datum posljednje srijede, npr. '2026-07-22'.
export function survivalWeekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const diff = (date.getUTCDay() - 3 + 7) % 7 // srijeda = 3
  date.setUTCDate(date.getUTCDate() - diff)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Sekunde do sljedeće srijede 00:00 UTC (odbrojavanje do resetа Preživljavanja).
export function secondsUntilSurvivalReset(d = new Date()) {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const diff = (3 - next.getUTCDay() + 7) % 7 || 7 // dana do sljedeće srijede
  next.setUTCDate(next.getUTCDate() + diff)
  return Math.max(0, Math.floor((next - d) / 1000))
}

// 'HH:MM:SS' format za tajmer.
export function formatCountdown(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Odbrojavanje koje može trajati danima: '5d 19:51:10' ili '19:51:10'.
// formatCountdown bi za 5 dana ispisao '139:51:10', što se ne čita.
export function formatCountdownLong(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(s / 86400)
  return days > 0 ? `${days}d ${formatCountdown(s % 86400)}` : formatCountdown(s)
}

// Broj dana do kraja sedmice / mjeseca (za "Obnavlja se za X dana"), po BiH danu.
export function daysUntilWeekEnd(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay() || 7 // pon=1 ... ned=7
  return 8 - dow
}

export function daysUntilMonthEnd(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return lastDay - day + 1
}
