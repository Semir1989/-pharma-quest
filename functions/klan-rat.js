// Klanski rat i Zeleni Okrug — ČISTE funkcije, bez Firebasea.
//
// Isti obrazac kao klan-pravila.js, duel-pravila.js i notif-odluka.js: sve što
// odlučuje bodove, množioce, cijene i parove stoji ovdje i testira se s
// `npm run test-klanrat`, bez emulatora i bez ijednog upisa u bazu.
//
// Sve vremenske funkcije primaju već razložene dijelove BiH vremena
// ({y,m,d,hh,mm}) — isto kao klan-pravila.js. Tako u logici nema ni Date ni
// vremenskih zona, a poziv iz index.js koristi postojeći bihParts().

import { danUSedmici, pomakniDan } from './klan-pravila.js'

// ---------------------------------------------------------------------------
// Prozori rata
// ---------------------------------------------------------------------------
// Rat: ponedjeljak 08:00 → petak 20:00. Uparivanje: nedjelja 00:00.
//
// PAŽNJA: ovo je 20:00, a stari `TAKMICENJE_KRAJ_SAT` u klan-pravila.js je 18:00.
// Stara vrijednost se namjerno NE mijenja — nju koristi ekran prijava
// (TakmicenjeBanner) za onaj prvi, još nebodovani model takmičenja. Rat ima
// svoje prozore i svoju kontrolu, a stari model ostaje netaknut dok se ne ugasi.
export const RAT_POCETAK_SAT = 8 // ponedjeljak 08:00
export const RAT_KRAJ_SAT = 20 // petak 20:00
export const UPARIVANJE_DAN = 0 // nedjelja
export const UPARIVANJE_SAT = 0 // 00:00

// Petak "Final Shift": 08:00–20:00, dupli CP.
export const RUSH_DAN = 5
export const RUSH_OD_SAT = 8
export const RUSH_DO_SAT = 20
export const RUSH_MNOZILAC = 2

// Srijeda "Critical Diagnosis": 1.5× na jednu izvučenu kategoriju, cijeli dan.
export const BOOST_DAN = 3
export const BOOST_MNOZILAC = 1.5

// Dnevni bonus za učešće.
export const UCESCE_PRAG = 0.7 // ≥70% članova
export const UCESCE_BONUS = 100 // +100 CP klanu

// Koliko CP jedan igrač najviše može donijeti klanu u jednom danu.
//
// Ovo NIJE isto što i dnevni strop XP-a u igri: DAILY_QUIZ_XP_CAP (1000) važi
// samo za XP iz kvizova, dok questovi, Preživljavanje i turniri idu povrh njega.
// Rat zato ima svoju branu, inače bi jedan igrač koji cijeli dan melje
// Preživljavanje sam odlučio rat.
export const DNEVNI_CP_STROP = 1000

// ---------------------------------------------------------------------------
// Zeleni Okrug — 9 objekata
// ---------------------------------------------------------------------------
// `tier` određuje cijenu (vidi CIJENA_BAZA), `efekat` je čitljiv opis za UI.
// Nivo ide 0–5; nivo 0 znači "još nije izgrađeno".
export const MAX_NIVO = 5

export const OBJEKTI = [
  {
    id: 'logisticki-centar',
    naziv: 'Logistički Centar',
    emoji: '📦',
    tier: 'A',
    efekat: '+5% XP po nivou na sve kvizove',
    status: 'aktivno',
  },
  {
    id: 'galenski-lab',
    naziv: 'Galenski Laboratorij',
    emoji: '⚗️',
    tier: 'A',
    efekat: '+1 s na tajmer pitanja po nivou',
    status: 'aktivno',
  },
  {
    id: 'rnd-centar',
    naziv: 'Razvojno-Istraživački Centar',
    emoji: '🔬',
    tier: 'B',
    efekat: '+5% CP po nivou u klanskom ratu',
    status: 'aktivno',
  },
  {
    id: 'dezurna-apoteka',
    naziv: 'Dežurna Apoteka (24/7)',
    emoji: '🌙',
    tier: 'B',
    efekat: 'Štit smjene: prašta propušten dan bonusa za učešće',
    status: 'aktivno',
  },
  {
    id: 'biljna-apoteka',
    naziv: 'Biljna Apoteka',
    emoji: '🌿',
    tier: 'B',
    efekat: '+10% zelenih bodova po nivou članovima',
    status: 'aktivno',
  },
  {
    id: 'djecija-apoteka',
    naziv: 'Dječija Apoteka',
    emoji: '🧸',
    tier: 'B',
    efekat: 'Combo: +5% XP po nivou od 3. tačnog zaredom',
    status: 'aktivno',
  },
  {
    id: 'klinicka-apoteka',
    naziv: 'Klinička Apoteka',
    emoji: '🩺',
    tier: 'C',
    efekat: 'Besplatan 50:50 na težim pitanjima, sedmično',
    status: 'aktivno',
  },
  {
    id: 'muzej',
    naziv: 'Apotekarski Muzej',
    emoji: '🏛️',
    tier: 'C',
    efekat: 'Otključava klanske titule i ukrase',
    status: 'aktivno',
  },
  {
    id: 'inspekcija',
    naziv: 'Apotekarska Inspekcija',
    emoji: '📋',
    tier: 'C',
    efekat: 'Upola manji gubitak ratinga pri porazu',
    // Rating se pri porazu trenutno NE oduzima (config.ratingPoraz = 0), pa je
    // ovaj efekat spreman ali neaktivan dok se gubitak ne uključi.
    status: 'spremno',
  },
]

export const OBJEKAT_IDS = OBJEKTI.map((o) => o.id)
export const objekat = (id) => OBJEKTI.find((o) => o.id === id) || null

// ---------------------------------------------------------------------------
// Cijene nadogradnji (zeleni bodovi)
// ---------------------------------------------------------------------------
// Skalirano za MALU zajednicu (~16 aktivnih igrača, 2 klana po 8). Račun iza
// brojeva, po klanu koji dobije rat:
//
//   trezor sedmično  = 300 (pobjeda) + floor(CP/50) ≈ 300 + 100 = ~400
//   članovi sedmično = 8 × ~30       = ~240
//   ukupno u opticaju                ≈ 600–650 zelenih bodova sedmično
//
// Prvi nivo jeftinog objekta (200) padne već u prvoj sedmici — to je namjerno:
// klan mora vidjeti da se gradnja pomjera prije nego izgubi interes. Pun jeftin
// objekat (svih 5 nivoa, 4000) je posao od ~7 sedmica, a cijeli Okrug je cilj
// za nekoliko mjeseci. Ako broj igrača naraste, dizati CIJENA_BAZA, ne krivu.
export const CIJENA_BAZA = { A: 200, B: 300, C: 400 }
export const CIJENA_KRIVA = [1, 2, 3.5, 5.5, 8] // nivo 1..5

export function cijenaNadogradnje(objekatId, noviNivo) {
  const o = objekat(objekatId)
  if (!o) return null
  if (!Number.isInteger(noviNivo) || noviNivo < 1 || noviNivo > MAX_NIVO) return null
  return Math.round(CIJENA_BAZA[o.tier] * CIJENA_KRIVA[noviNivo - 1])
}

// Ukupan trošak objekta od nule do zadanog nivoa — za prikaz napretka.
export function ukupnaCijena(objekatId, doNivoa = MAX_NIVO) {
  let s = 0
  for (let n = 1; n <= doNivoa; n++) s += cijenaNadogradnje(objekatId, n) || 0
  return s
}

// ---------------------------------------------------------------------------
// Efekti — jedno mjesto koje čita cijela igra
// ---------------------------------------------------------------------------
// Štitovi i 50:50 ne rastu linearno nego po pragovima: tako niži nivoi imaju
// smisla i bez toga da odmah daju punu korist.
const STITOVI_PO_NIVOU = [0, 0, 0, 1, 1, 2] // indeks = nivo
const HINTOVI_PO_NIVOU = [0, 1, 1, 2, 2, 3]

export function bonusi(nivoi = {}) {
  const n = (id) => Math.max(0, Math.min(MAX_NIVO, nivoi[id] || 0))
  return {
    xpBonus: n('logisticki-centar') * 0.05, // udio, 0.15 = +15%
    sekunde: n('galenski-lab'), // dodatne sekunde na pitanje
    cpBonus: n('rnd-centar') * 0.05,
    stitovi: STITOVI_PO_NIVOU[n('dezurna-apoteka')],
    goldBonus: n('biljna-apoteka') * 0.1,
    comboBonus: n('djecija-apoteka') * 0.05,
    hintovi: HINTOVI_PO_NIVOU[n('klinicka-apoteka')],
    muzej: n('muzej'),
    smanjenjeGubitka: Math.min(0.5, n('inspekcija') * 0.1),
  }
}

// Combo se pali od TREĆEG tačnog odgovora zaredom.
export const COMBO_PRAG = 3

// ---------------------------------------------------------------------------
// Množioci CP-a
// ---------------------------------------------------------------------------
// Redoslijed je bitan i namjeran: boost i rush se SABIRAJU pa množe, ne množe
// jedan drugim. Petak s kategorijom ne smije dati 3× (2 × 1.5) — to bi značilo
// da se cijeli rat odlučuje u pet sati petka i da ponedjeljak nema smisla.
//
//   petak + kategorija = 1 + (2−1) + (1.5−1) = 2.5×, ne 3×
//
// `dio` je udio CP-a koji pripada boostovanoj kategoriji (0..1): kviz od 10
// pitanja rijetko je cijeli iz jedne kategorije.
export function mnozilac(p, { boostKategorija = null, kategorija = null, dio = null } = {}) {
  const dan = danUSedmici(p)
  let m = 1

  if (dan === RUSH_DAN && p.hh >= RUSH_OD_SAT && p.hh < RUSH_DO_SAT) {
    m += RUSH_MNOZILAC - 1
  }

  if (dan === BOOST_DAN && boostKategorija) {
    const udio = dio !== null ? Math.max(0, Math.min(1, dio)) : kategorija === boostKategorija ? 1 : 0
    m += (BOOST_MNOZILAC - 1) * udio
  }

  return m
}

// Koliko CP ide klanu za osvojeni XP. Zaokružuje se na cijeli broj tek na kraju,
// pa se sitni ostaci ne gube kroz sesiju.
export function cpZaXp(xp, { mnoz = 1, cpBonus = 0 } = {}) {
  if (!xp || xp <= 0) return 0
  return Math.round(xp * mnoz * (1 + cpBonus))
}

// ---------------------------------------------------------------------------
// Bonus za učešće
// ---------------------------------------------------------------------------
// Prag je ≥70% članova, ali zaokružen NAGORE: klan od 8 treba 6, ne 5,6.
export function pragUcesca(brojClanova) {
  return Math.max(1, Math.ceil((brojClanova || 0) * UCESCE_PRAG))
}

// Odluka o dnevnom bonusu. Vraća i razlog, da admin panel može objasniti zašto
// bonusa nema — "nije ispunjeno" bez broja je najgori mogući odgovor igraču.
export function odlukaOBonusu({ aktivnih, clanova, stitovaOstalo = 0 }) {
  const prag = pragUcesca(clanova)
  if (aktivnih >= prag) {
    return { bonus: true, stit: false, prag, aktivnih, razlog: 'ispunjeno' }
  }
  if (stitovaOstalo > 0) {
    return { bonus: true, stit: true, prag, aktivnih, razlog: 'stit' }
  }
  return { bonus: false, stit: false, prag, aktivnih, razlog: 'nedovoljno' }
}

// ---------------------------------------------------------------------------
// Uparivanje klanova
// ---------------------------------------------------------------------------
// Klanovi se sortiraju po ratingu i pare susjedno — najjači protiv drugog po
// jačini. Kod NEPARNOG broja zadnja TRI čine grupni meč (svi protiv svih po
// bodovima), umjesto da jedan klan sjedi cijelu sedmicu.
//
// Determinističko je: kod istog ratinga odlučuje id, pa dva pokretanja daju iste
// parove i admin ne dobija drukčiji raspored ako klikne dvaput.
export function napraviParove(klanovi = []) {
  const lista = [...klanovi].sort(
    (a, b) => (b.rating || 0) - (a.rating || 0) || (a.id < b.id ? -1 : 1)
  )
  if (lista.length < 2) return []

  const parovi = []
  let i = 0
  while (i < lista.length) {
    const ostalo = lista.length - i
    if (ostalo === 3) {
      parovi.push({ clanIds: [lista[i].id, lista[i + 1].id, lista[i + 2].id], grupni: true })
      i += 3
    } else if (ostalo >= 2) {
      parovi.push({ clanIds: [lista[i].id, lista[i + 1].id], grupni: false })
      i += 2
    } else {
      // Ostao jedan (moguće samo ako je lista neparna i kraća od 3) — bye.
      parovi.push({ clanIds: [lista[i].id], grupni: false, bye: true })
      i += 1
    }
  }
  return parovi
}

// ---------------------------------------------------------------------------
// Ishod meča i nagrade
// ---------------------------------------------------------------------------
// Pobjednik je klan s najviše CP-a. Kod izjednačenja NEMA pobjednika (nerješeno)
// — žrijeb bi ovdje bio gori nego u duelu, jer rat traje pet dana i klan bi
// izgubio sedmicu na bacanje novčića.
export function ishodMeca(scores = {}) {
  const redoslijed = Object.entries(scores)
    .map(([clanId, cp]) => ({ clanId, cp: cp || 0 }))
    .sort((a, b) => b.cp - a.cp || (a.clanId < b.clanId ? -1 : 1))
  if (redoslijed.length === 0) return { pobjednik: null, redoslijed, nerijeseno: false }
  if (redoslijed.length === 1) return { pobjednik: redoslijed[0].clanId, redoslijed, nerijeseno: false }
  const nerijeseno = redoslijed[0].cp === redoslijed[1].cp
  return { pobjednik: nerijeseno ? null : redoslijed[0].clanId, redoslijed, nerijeseno }
}

export const RATING_POBJEDA = 30
export const RATING_PORAZ = 5 // utješni, ne oduzima se
export const RATING_NERIJESENO = 15
export const GOLD_POBJEDA = 300
export const GOLD_PORAZ = 120
export const GOLD_NERIJESENO = 200
export const GOLD_PO_CP = 50 // trezor dobija +1 zeleni bod na svakih 50 CP
export const CLAN_GOLD_BAZA = 20 // član koji je bio aktivan
export const CLAN_GOLD_PO_CP = 100 // +1 na svakih 100 vlastitih CP

// Nagrada klanu. `mjesto` je 0 za pobjednika. Gubitak ratinga (ako se ikad
// uključi kroz config.ratingPoraz < 0) smanjuje Apotekarska Inspekcija.
export function nagradaKlanu({ mjesto, nerijeseno, cp = 0, goldBonus = 0, smanjenjeGubitka = 0, ratingPoraz = RATING_PORAZ }) {
  const pobjednik = mjesto === 0 && !nerijeseno
  let rating
  if (nerijeseno) rating = RATING_NERIJESENO
  else if (pobjednik) rating = RATING_POBJEDA
  else rating = ratingPoraz

  if (rating < 0 && smanjenjeGubitka > 0) {
    rating = Math.round(rating * (1 - smanjenjeGubitka))
  }

  const baza = nerijeseno ? GOLD_NERIJESENO : pobjednik ? GOLD_POBJEDA : GOLD_PORAZ
  const gold = Math.round((baza + Math.floor((cp || 0) / GOLD_PO_CP)) * (1 + goldBonus))
  return { rating, gold }
}

// Nagrada pojedinom članu koji je bio aktivan u ratu.
export function nagradaClanu({ mojCp = 0, pobjednik = false, goldBonus = 0 }) {
  if (mojCp <= 0) return 0
  const baza = CLAN_GOLD_BAZA + Math.floor(mojCp / CLAN_GOLD_PO_CP)
  return Math.round(baza * (pobjednik ? 1.5 : 1) * (1 + goldBonus))
}

// ---------------------------------------------------------------------------
// Ključevi
// ---------------------------------------------------------------------------
// ID rata = datum PONEDJELJKA sedmice na koju se odnosi ('YYYY-MM-DD'), isto
// kao weekIdZaRegistraciju u klan-pravila.js — dva ključa za istu sedmicu bi
// prije ili kasnije razišla podatke.
export function warIdZa(p) {
  const dan = danUSedmici(p)
  if (dan === 0) return pomakniDan(p, 1) // nedjelja gađa sutrašnji ponedjeljak
  return pomakniDan(p, 1 - dan)
}

export function dnevniKljuc(p) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

// Je li rat u toku po satu (bez obzira na config) — koristi se samo za prikaz
// očekivanog stanja; mjerodavni su startAt/endAt iz config/clanWar.
export function ratUToku(p) {
  const dan = danUSedmici(p)
  if (dan < 1 || dan > 5) return false
  if (dan === 1) return p.hh >= RAT_POCETAK_SAT
  if (dan === 5) return p.hh < RAT_KRAJ_SAT
  return true
}
