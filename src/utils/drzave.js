// Države u izboru pri registraciji.
//
// Nije puna ISO lista od ~250 zemalja: u padajućem izborniku na telefonu je to
// skrol kroz stotinu nepotrebnih redova. Ovdje su BiH i region (odakle dolazi
// najveći dio igrača), pa zemlje dijaspore u kojima naši farmaceuti rade, i na
// kraju "Druga država" za sve ostalo — bolje jedan otvoren izbor nego da neko
// ne nađe svoju zemlju pa upiše bilo šta.
//
// Poredak je namjeran: BiH je prva jer je najčešći odgovor, ostalo abecedno.
// Čuva se PUN NAZIV (ne kod) — polje se čita u admin panelu i u izvještajima,
// gdje "BA" nikom ništa ne znači.
export const DRZAVE = [
  'Bosna i Hercegovina',
  'Austrija',
  'Crna Gora',
  'Hrvatska',
  'Italija',
  'Njemačka',
  'Sjeverna Makedonija',
  'Slovenija',
  'Srbija',
  'Švedska',
  'Švicarska',
  'Turska',
  'Druga država',
]

export const PODRAZUMIJEVANA_DRZAVA = DRZAVE[0]

// Pozivni broj se ne traži zasebno — igrači ga kucaju kako su navikli
// (+387…, 060…, 00387…). Provjerava se samo da ima dovoljno cifara da uopšte
// može biti broj; stroža validacija bi odbijala ispravne strane brojeve.
export function validanTelefon(broj) {
  const cifre = String(broj || '').replace(/\D/g, '')
  return cifre.length >= 8 && cifre.length <= 15
}

// Normalizacija za upis: višestruki razmaci i crtice se sažimaju, ostalo ostaje
// kako je korisnik unio.
export function ocistiTelefon(broj) {
  return String(broj || '').replace(/\s+/g, ' ').trim()
}
