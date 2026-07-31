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

// IZNIMKA (odluka 31.07.2026): mjesečni period jula je PRODUŽEN kroz august —
// jedan period traje 01.07. → 31.08.2026, kalendarska logika se vraća 01.09.
// Mapa je 'stvarni mjesec → ključ perioda'. IDENTIČNA kopija stoji u
// functions/index.js; ako se razidu, klijent i server bi različito računali
// kad questovi ističu.
const MJESECNI_SPOJENI = { '2026-08': '2026-07' }

// '2026-07' (BiH mjesec)
export function monthlyKey(d = new Date()) {
  const { y, m } = bihParts(d)
  const stvarni = `${y}-${pad(m)}`
  return MJESECNI_SPOJENI[stvarni] || stvarni
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

// Sat u srijedu (BiH vrijeme) kad počinje nova sedmica Preživljavanja —
// isti trenutak u kojem zakazani posao na serveru (survivalWeeklyReset)
// otvara novi prozor eventa.
export const SURVIVAL_RESET_HOUR = 8

// Ključ sedmice Preživljavanja — sedmica POČINJE SRIJEDOM U 08:00 po BiH
// vremenu. Identično serveru (functions/index.js) da putanja leaderboarda bude
// ista. Vraća datum posljednje srijede, npr. '2026-07-29'.
export function survivalWeekKey(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  // Pomak od 8 sati unazad: sve prije srijede u 08:00 još pripada prošloj sedmici.
  const date = new Date(Date.UTC(y, m - 1, day, hh - SURVIVAL_RESET_HOUR))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 3 + 7) % 7)) // srijeda = 3
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Trenutak sljedeće srijede u 08:00 po BiH vremenu (ms epoch). Dva prolaza zbog
// ljetnog/zimskog vremena — isti postupak kao nextDailyResetAt.
export function nextSurvivalResetAt(d = new Date()) {
  const { y, m, d: day, hh } = bihParts(d)
  let dana = (3 - new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 7) % 7
  if (dana === 0 && hh >= SURVIVAL_RESET_HOUR) dana = 7 // srijeda je, ali je 08:00 prošlo
  const civil = Date.UTC(y, m - 1, day + dana, SURVIVAL_RESET_HOUR)
  const guess = civil - bihOffset(d)
  return civil - bihOffset(new Date(guess))
}

// Sekunde do novog pokušaja (srijeda 08:00 po BiH vremenu).
export function secondsUntilSurvivalReset(d = new Date()) {
  return Math.max(0, Math.floor((nextSurvivalResetAt(d) - d.getTime()) / 1000))
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

// Spojeni period (vidi MJESECNI_SPOJENI) traje do kraja POSLJEDNJEG mjeseca
// koji dijeli isti ključ — bez ovoga bi kartica 31.07. javila "obnavlja se
// sutra", a questovi bi zapravo stajali još cijeli august.
export function daysUntilMonthEnd(d = new Date()) {
  const { y, m, d: day } = bihParts(d)
  const kljuc = monthlyKey(d)

  let gy = y
  let gm = m
  for (let i = 0; i < 12; i++) {
    const sy = gm === 12 ? gy + 1 : gy
    const sm = gm === 12 ? 1 : gm + 1
    const sKljuc = `${sy}-${pad(sm)}`
    if ((MJESECNI_SPOJENI[sKljuc] || sKljuc) !== kljuc) break
    gy = sy
    gm = sm
  }

  const zadnjiDan = new Date(Date.UTC(gy, gm, 0)).getUTCDate()
  const kraj = Date.UTC(gy, gm - 1, zadnjiDan)
  const danas = Date.UTC(y, m - 1, day)
  return Math.round((kraj - danas) / 86400000) + 1
}
