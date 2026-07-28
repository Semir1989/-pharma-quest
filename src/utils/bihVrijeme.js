// Razlaganje trenutnog vremena po BiH zoni, isto kao bihParts() u
// functions/index.js. Postoji da bi UI mogao pozvati ISTE funkcije prozora iz
// functions/klan-pravila.js koje koristi i server — pravila o tome kad je
// registracija otvorena ne smiju postojati na dva mjesta, jer bi se razišla.
const BIH_TZ = 'Europe/Sarajevo'

export function bihParts(d = new Date()) {
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
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, ss: +p.second }
}

// Koliko je ostalo do zadanog trenutka (dan u sedmici + sat) po BiH vremenu,
// u milisekundama. Vraća 0 ako je trenutak prošao unutar tekuće sedmice.
export function doSljedecegTermina(ciljniDan, ciljniSat, sada = new Date()) {
  const p = bihParts(sada)
  const danas = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()
  let razlikaDana = (ciljniDan - danas + 7) % 7
  if (razlikaDana === 0 && p.hh >= ciljniSat) razlikaDana = 7
  const sekundiUDanu = p.hh * 3600 + p.mm * 60 + p.ss
  return (razlikaDana * 86400 + ciljniSat * 3600 - sekundiUDanu) * 1000
}

export function formatirajOdbrojavanje(ms) {
  if (ms <= 0) return '0h 0m'
  const ukupnoMin = Math.floor(ms / 60000)
  const dana = Math.floor(ukupnoMin / 1440)
  const sati = Math.floor((ukupnoMin % 1440) / 60)
  const min = ukupnoMin % 60
  if (dana > 0) return `${dana}d ${sati}h`
  return `${sati}h ${min}m`
}
