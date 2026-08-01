// Raspored rundi 1v1 turnira — čiste funkcije, bez Firestorea.
//
// Isti obrazac kao duel-pravila.js: sve što određuje KADA se runda zatvara
// stoji ovdje i testira se s `npm run test-duel`, bez emulatora.
//
// Zašto uopšte postoji: raniji raspored je dijelio prozor eventa na jednake
// dijelove (`(closeAt - openAt) / rounds`). Za event koji počne u petak u 18:00
// i traje do nedjelje u 18:00 to je davalo rokove u 03:36 i 08:24 ujutru —
// termine u koje niko ne igra, pa je runda prolazila na walkover dok igrači
// spavaju. Rokovi sada padaju samo u ljudske termine po BiH vremenu.

const BIH_TZ = 'Europe/Sarajevo'

// Termini u koje runda smije završiti (sat po BiH vremenu). Jutro, poslijepodne
// i veče — tri prilike dnevno, nijedna noćna.
export const TERMINI = [8, 14, 20]

// Razlaganje trenutka na BiH zidno vrijeme (isto što i bihParts u index.js).
export function bihDijelovi(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: BIH_TZ,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  )
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute }
}

// Obrnuti smjer: BiH zidno vrijeme → ms epoch.
//
// Offset (+1h zimi, +2h ljeti) se ne smije pretpostaviti, pa se traži u dva
// koraka: prva procjena daje trenutak blizu cilja, iz njega se pročita stvarni
// offset i ispravi. Drugi prolaz hvata i prelazak na ljetno računanje vremena.
export function bihUms(y, m, d, hh, mm = 0) {
  const cilj = Date.UTC(y, m - 1, d, hh, mm)
  let t = cilj
  for (let i = 0; i < 3; i++) {
    const p = bihDijelovi(t)
    const offset = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - t
    const novo = cilj - offset
    if (novo === t) break
    t = novo
  }
  return t
}

// Prvi termin STROGO poslije zadanog trenutka. `odDana` pomjera traženje za
// toliko dana unaprijed (koristi se za prvu rundu, koja uvijek ide u sutra).
function sljedeciTermin(ms, odDana = 0) {
  const p = bihDijelovi(ms)
  const dan = Date.UTC(p.y, p.m - 1, p.d) + odDana * 86400000
  for (let pomak = 0; pomak < 14; pomak++) {
    const d = new Date(dan + pomak * 86400000)
    for (const sat of TERMINI) {
      const t = bihUms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), sat)
      if (t > ms) return t
    }
  }
  return ms + 86400000 // ne bi se smjelo desiti
}

// Rokovi svih rundi turnira.
//
// Pravilo koje je tražio admin:
//   • prva runda se zatvara u 08:00 NAREDNOG dana od početka eventa — igrači
//     koji su se prijavili u petak uveče imaju cijelo veče i jutro;
//   • svaka sljedeća runda ide na prvi naredni termin (14:00, 20:00, pa sutra
//     08:00 …), pa se turnir s malo prijavljenih sam razvuče kroz sedmicu, a
//     nijedna runda ne pada u noć.
//
// `pocetak` je openAt eventa. Vraća niz od `rundi` rastućih ms vrijednosti.
export function rasporedRundi(pocetak, rundi) {
  const rokovi = []
  // Prva runda: 08:00 sutra. `odDana: 1` znači "traži od sutrašnjeg dana", a
  // pošto je 08:00 prvi termin u danu, to je tačno traženo jutro. Event koji
  // počne u 3 ujutru time ne dobija rok za pet sati.
  let t = sljedeciTermin(pocetak, 1)
  for (let i = 0; i < rundi; i++) {
    rokovi.push(t)
    t = sljedeciTermin(t)
  }
  return rokovi
}

// Koliko rundi treba za dati broj učesnika (2 igrača = 1 runda, 20 = 5).
export function brojRundi(ucesnika) {
  if (ucesnika < 2) return 0
  return Math.ceil(Math.log2(ucesnika))
}

// Oblik bracketa: koliko mečeva ima svaka runda.
//
// Ranije je bracket bio puna potencija dvojke (20 igrača → stablo od 32), pa su
// SVI byevi padali u prvu rundu: 4 puna meča i 12 igrača koji prolaze dalje bez
// ijednog odgovorenog pitanja. Runde 2+ su time uvijek bile pune.
//
// Od 01.08.2026. se svaka runda samo prepolovi: igrači se pare redom, a kad ih
// je NEPARAN broj, zadnji ostaje sam i ide u kvalifikaciju (mora 6/10 — vidi
// KVALIFIKACIJA_PRAG u duel-pravila.js). Byevi se tako razlijevaju kroz stablo
// umjesto da se svi nagomilaju na početku, i u prvoj rundi svi igraju.
//
//   20 → 10 mečeva → 5 → 3 (2 meča + 1 sam) → 2 (1 meč + 1 sam) → 1  = 5 rundi
//
// Broj rundi je isti kao prije (`brojRundi`), jer je ceil(n/2) ponovljen do
// jedinice tačno ceil(log2 n) koraka.
//
// Vraća niz dužine `brojRundi(n)`: koliko mečeva (slotova) ima svaka runda.
export function slotoviPoRundi(ucesnika) {
  const slotovi = []
  let n = ucesnika
  while (n > 1) {
    n = Math.ceil(n / 2)
    slotovi.push(n)
  }
  return slotovi
}

// Raspored parova prve runde: igrači se pare redom (lista je već izmiješana).
//
// Kad je broj igrača neparan, zadnji slot ima samo jednog — u PRVOJ rundi to je
// besplatan bye, jer igrač nije imao s kim ni izaći. U kasnijim rundama isti
// oblik znači kvalifikaciju (resolveByes u index.js).
//
// Vraća niz parova [p1, p2] dužine ceil(n/2); p2 je null u samačkom slotu.
export function paroviPrveRunde(igraci) {
  const n = igraci.length
  if (n < 2) return []
  const parovi = []
  for (let i = 0; i < n; i += 2) parovi.push([igraci[i], igraci[i + 1] ?? null])
  return parovi
}
