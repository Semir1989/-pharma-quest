// Zabrana ulaska u klan poslije DOBROVOLJNOG izlaska (7 dana).
// Izvor istine je server (functions/klan-pravila.js, KLAN_ZABRANA_DANA) —
// ovdje se stanje samo čita s profila i prikazuje. Server svejedno odbija i
// pridruživanje i osnivanje dok zabrana traje, pa klijent ne mora ništa čuvati.
//
// Koga vođa izbaci NE dobija zabranu; polje se postavlja samo u leaveClan.

export const KLAN_ZABRANA_DANA = 7

// Koliko je zabrane ostalo u milisekundama (0 = igrač je slobodan).
export function klanZabranaOstalo(profile, now = Date.now()) {
  return Math.max(0, (profile?.clanCooldownUntil || 0) - now)
}

// Grubo odbrojavanje: '6d 23h', '23h 14m', '14m'. Namjerno BEZ sekundi —
// donja navigacija se inače mora ponovo iscrtavati svake sekunde, a za rok od
// sedam dana sekunde ionako ništa ne znače.
export function formatZabranu(ms) {
  const min = Math.ceil(ms / 60000)
  if (min <= 0) return ''
  if (min < 60) return `${min}m`
  const sati = Math.floor(min / 60)
  if (sati < 24) return `${sati}h ${min % 60}m`
  const dana = Math.floor(sati / 24)
  return `${dana}d ${sati % 24}h`
}

// Duža rečenica za ekran klana — objašnjava i zašto, ne samo koliko.
export function porukaZabrane(ms) {
  return `Napustio/la si klan, pa novom možeš pristupiti za ${formatZabranu(ms)}. Zabrana traje ${KLAN_ZABRANA_DANA} dana i vrijedi i za osnivanje novog klana.`
}
