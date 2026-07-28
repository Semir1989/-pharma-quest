// Pravila klanova — ČISTE funkcije, bez Firebasea.
//
// Namjerno odvojeno od index.js, kao i notif-odluka.js: dozvole, limiti i
// vremenski prozori su ono što se najlakše pokvari, a ovako se testiraju bez
// emulatora i bez ijednog upisa u bazu (vidi scripts/test-klanovi.mjs).

export const MAX_CLANOVA = 10 // ukupno, uključujući osnivača i savjetnike
export const MAX_SAVJETNIKA = 2
export const MIN_LEVEL_OSNIVANJE = 10
export const NEAKTIVNOST_DANA = 15

export const IME_MIN = 3
export const IME_MAX = 24
export const TAG_MIN = 2
export const TAG_MAX = 5

// ---------------------------------------------------------------------------
// Ime i tag
// ---------------------------------------------------------------------------

// Ključ za rezervaciju imena (clanNames/{kljuc}). Firestore nema jedinstvenost
// polja, pa se ona pravi zasebnim dokumentom čiji je ID samo ime — a dva upisa
// istog ID-a ne mogu proći u istoj transakciji.
export function kljucImena(ime) {
  return String(ime || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function validirajIme(ime) {
  const t = String(ime || '').trim()
  if (t.length < IME_MIN) return { ok: false, greska: `Ime klana mora imati bar ${IME_MIN} znaka.` }
  if (t.length > IME_MAX) return { ok: false, greska: `Ime klana može imati najviše ${IME_MAX} znaka.` }
  return { ok: true, vrijednost: t }
}

// Tag je opcion. Prazan string i null znače "bez taga" — ne greška.
export function validirajTag(tag) {
  const t = String(tag || '').trim()
  if (!t) return { ok: true, vrijednost: null }
  if (t.length < TAG_MIN || t.length > TAG_MAX)
    return { ok: false, greska: `Tag mora imati ${TAG_MIN}–${TAG_MAX} znakova.` }
  return { ok: true, vrijednost: t.toUpperCase() }
}

// ---------------------------------------------------------------------------
// Uloge i dozvole
//
// Uloga se izvodi iz samog dokumenta klana, ne iz clanMembers/{uid}.role —
// clanMembers je denormalizovan keš za brz lookup, a mjerodavan je klan.
// ---------------------------------------------------------------------------

export function ulogaU(clan, uid) {
  if (!clan || !uid) return null
  if (!(clan.memberIds || []).includes(uid)) return null
  if (clan.founderId === uid) return 'founder'
  if ((clan.advisorIds || []).includes(uid)) return 'advisor'
  return 'member'
}

export const smijeUpravljati = (uloga) => uloga === 'founder' || uloga === 'advisor'
export const smijeRaspustiti = (uloga) => uloga === 'founder'
export const smijeMijenjatiSavjetnike = (uloga) => uloga === 'founder'
export const smijePrijavitiNaTakmicenje = (uloga) => smijeUpravljati(uloga)

// Savjetnik ne može izbaciti osnivača ni drugog savjetnika — inače bi dva
// savjetnika mogla izbaciti jedan drugog i preuzeti klan.
export function smijeIzbaciti(mojaUloga, ciljUloga) {
  if (!smijeUpravljati(mojaUloga)) return false
  if (ciljUloga === 'founder') return false // osnivač izlazi samo kroz prenos ili raspuštanje
  if (mojaUloga === 'advisor' && ciljUloga === 'advisor') return false
  return ciljUloga === 'member' || ciljUloga === 'advisor'
}

export function mozeOsnovati(level) {
  return (level || 0) >= MIN_LEVEL_OSNIVANJE
}

export function imaMjesta(clan) {
  return (clan?.memberIds || []).length < MAX_CLANOVA
}

export function mozeJosSavjetnika(clan) {
  return (clan?.advisorIds || []).length < MAX_SAVJETNIKA
}

// ---------------------------------------------------------------------------
// Nasljeđivanje vodstva
// ---------------------------------------------------------------------------

// Novi osnivač je član s najviše XP-a. Kod izjednačenja odlučuje uid, da izbor
// bude determinističan — inače bi dva uzastopna pokretanja mogla dati različit
// rezultat i klan bi mijenjao vodstvo bez razloga.
export function izaberiNasljednika(kandidati = []) {
  const sortirani = [...kandidati].sort((a, b) => (b.xp || 0) - (a.xp || 0) || (a.uid < b.uid ? -1 : 1))
  return sortirani[0]?.uid || null
}

// Razlika u danima između dva ključa 'YYYY-MM-DD'.
export function danaIzmedju(odKljuca, doKljuca) {
  const a = Date.parse(`${odKljuca}T00:00:00Z`)
  const b = Date.parse(`${doKljuca}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86400000)
}

// Neaktivan = nije igrao NEAKTIVNOST_DANA dana. Kad igrač nikad nije igrao,
// mjeri se od dana kad je klan osnovan — inače bi osnivač koji je napravio klan
// i nije odigrao nijedan kviz bio smijenjen već prvim pokretanjem provjere.
export function jeNeaktivan(lastPlayDay, danas, odKad = null, dana = NEAKTIVNOST_DANA) {
  const polaziste = lastPlayDay || odKad
  if (!polaziste) return false
  const razlika = danaIzmedju(polaziste, danas)
  return razlika !== null && razlika >= dana
}

// ---------------------------------------------------------------------------
// Vremenski prozori takmičenja (Europe/Sarajevo)
//
// Funkcije primaju već razložene dijelove lokalnog vremena ({y,m,d,hh,mm}) —
// isto kao notif-odluka.js. Tako u čistoj logici nema ni Date ni vremenskih
// zona, a poziv iz index.js koristi postojeći bihParts().
// ---------------------------------------------------------------------------

export const REG_ZATVARANJE_SAT = 20 // nedjelja 20:00
export const TAKMICENJE_POCETAK_SAT = 8 // ponedjeljak 08:00
export const TAKMICENJE_KRAJ_SAT = 18 // petak 18:00

export function danUSedmici({ y, m, d }) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = nedjelja
}

// Pomak od datuma u ključ 'YYYY-MM-DD'.
export function pomakniDan({ y, m, d }, pomak) {
  return new Date(Date.UTC(y, m - 1, d + pomak)).toISOString().slice(0, 10)
}

// Registracija: subota cijeli dan i nedjelja do 20:00.
export function registracijaOtvorena(p) {
  const dan = danUSedmici(p)
  if (dan === 6) return true
  if (dan === 0) return p.hh < REG_ZATVARANJE_SAT
  return false
}

// Takmičenje: ponedjeljak 08:00 → petak 18:00.
export function takmicenjeUToku(p) {
  const dan = danUSedmici(p)
  if (dan < 1 || dan > 5) return false
  if (dan === 1) return p.hh >= TAKMICENJE_POCETAK_SAT
  if (dan === 5) return p.hh < TAKMICENJE_KRAJ_SAT
  return true
}

// ID takmičarske sedmice = datum PONEDJELJKA na koji se odnosi ('YYYY-MM-DD').
// Registracija vikendom gađa ponedjeljak koji dolazi; unutar sedmice gađa
// ponedjeljak te sedmice. Datum je čitljiviji od broja sedmice i nema
// dvosmislenosti oko prelaska godine.
export function weekIdZaRegistraciju(p) {
  const dan = danUSedmici(p)
  if (dan === 6) return pomakniDan(p, 2)
  if (dan === 0) return pomakniDan(p, 1)
  return pomakniDan(p, 1 - dan)
}

// Koliko milisekundi do sljedeće promjene stanja — za odbrojavanje u UI.
// Vraća { faza, doKraja } gdje je faza 'registracija' | 'takmicenje' | 'pauza'.
export function fazaTakmicenja(p) {
  if (registracijaOtvorena(p)) return 'registracija'
  if (takmicenjeUToku(p)) return 'takmicenje'
  return 'pauza'
}
