// Test rasporeda rundi i parova prve runde — čista logika iz
// functions/turnir-raspored.js. Ne treba ni emulator ni Firebase.
//
// Pokretanje:  npm run test-raspored

import {
  TERMINI,
  bihUms,
  bihDijelovi,
  rasporedRundi,
  brojRundi,
  paroviPrveRunde,
  slotoviPoRundi,
} from '../functions/turnir-raspored.js'

let pao = 0
const provjeri = (uslov, t) => {
  if (uslov) console.log('  ✓ ' + t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}
// Za provjere u petlji preko svih veličina turnira: ispisuje se samo ono što
// PADNE, inače bi 63 veličine × 4 uslova zatrpalo izlaz.
let tihoPalo = 0
const provjeriTiho = (uslov, t) => {
  if (uslov) return
  console.error('  ✗ ' + t)
  tihoPalo++
}
const naslov = (t) => console.log(`\n${t}`)

const bih = (ms) =>
  new Intl.DateTimeFormat('bs-BA', {
    timeZone: 'Europe/Sarajevo',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))

// --- Pretvaranje BiH vremena ------------------------------------------------
naslov('BiH zidno vrijeme ↔ ms')
const ljeti = bihUms(2026, 7, 31, 18) // CEST = UTC+2
provjeri(ljeti === Date.UTC(2026, 6, 31, 16), 'ljeti je BiH UTC+2')
const zimi = bihUms(2026, 1, 15, 8) // CET = UTC+1
provjeri(zimi === Date.UTC(2026, 0, 15, 7), 'zimi je BiH UTC+1')
provjeri(bihDijelovi(ljeti).hh === 18, 'razlaganje vraća isti sat')

// --- Raspored rundi ---------------------------------------------------------
naslov('Raspored rundi za event koji počne u petak u 18:00')
const pocetak = bihUms(2026, 7, 31, 18) // petak 31.07.2026, 18:00
const rokovi = rasporedRundi(pocetak, 5)
rokovi.forEach((r, i) => console.log(`      runda ${i + 1}: ${bih(r)}`))

provjeri(rokovi[0] === bihUms(2026, 8, 1, 8), 'prva runda završava u 08:00 narednog dana (subota)')
provjeri(rokovi[1] === bihUms(2026, 8, 1, 14), 'druga runda traje od 08:00 do 14:00 subotom')
provjeri(rokovi[2] === bihUms(2026, 8, 1, 20), 'treća runda traje od 14:00 do 20:00')
provjeri(rokovi[3] === bihUms(2026, 8, 2, 8), 'četvrta ide na naredno jutro, ne u noć')
provjeri(rokovi[4] === bihUms(2026, 8, 2, 14), 'peta u 14:00 u nedjelju')

naslov('Nijedan rok ne pada u noćni ni ranojutarnji sat')
const dugacak = rasporedRundi(pocetak, 12)
provjeri(
  dugacak.every((r) => TERMINI.includes(bihDijelovi(r).hh)),
  'svih 12 rokova je u 08:00, 14:00 ili 20:00 po BiH vremenu'
)
provjeri(
  dugacak.every((r, i) => i === 0 || r > dugacak[i - 1]),
  'rokovi su strogo rastući'
)
provjeri(
  bihDijelovi(dugacak[11]).d === 4,
  'turnir s puno rundi se sam razvuče kroz sedmicu (12. runda u utorak uveče)'
)

naslov('Početak u druge sate')
provjeri(
  rasporedRundi(bihUms(2026, 7, 31, 3), 1)[0] === bihUms(2026, 8, 1, 8),
  'event pokrenut u 3 ujutru ne dobija rok isti dan u 8'
)
provjeri(
  rasporedRundi(bihUms(2026, 7, 31, 22), 1)[0] === bihUms(2026, 8, 1, 8),
  'event pokrenut u 22:00 takođe ide na sutrašnjih 08:00'
)

// --- Broj rundi -------------------------------------------------------------
naslov('Broj rundi po broju prijavljenih')
provjeri(brojRundi(1) === 0, 'jedan prijavljen — nema turnira')
provjeri(brojRundi(2) === 1, '2 igrača = 1 runda')
provjeri(brojRundi(8) === 3, '8 igrača = 3 runde')
provjeri(brojRundi(20) === 5, '20 igrača = 5 rundi')

// --- Parovi prve runde ------------------------------------------------------
naslov('Parovi prve runde: u prvoj rundi igraju SVI')
const igraci20 = Array.from({ length: 20 }, (_, i) => `p${i}`)
const p20 = paroviPrveRunde(igraci20)
provjeri(p20.length === 10, '20 igrača → 10 mečeva (ne 16 u stablu od 32)')
provjeri(p20.every(([a, b]) => a !== null && b !== null), '20 je paran broj — nijedan bye')
provjeri(
  new Set(p20.flat().filter(Boolean)).size === 20,
  'svih 20 igrača je raspoređeno, nijedan dvaput'
)

naslov('Rubni slučajevi parova')
provjeri(paroviPrveRunde(['a']).length === 0, 'jedan igrač — nema parova')
const p2 = paroviPrveRunde(['a', 'b'])
provjeri(p2.length === 1 && p2[0][0] === 'a' && p2[0][1] === 'b', '2 igrača = jedan meč')
const p8 = paroviPrveRunde(Array.from({ length: 8 }, (_, i) => `p${i}`))
provjeri(
  p8.length === 4 && p8.every(([, b]) => b !== null),
  'puna potencija dvojke — svi mečevi puni, nijedan bye'
)
const p3 = paroviPrveRunde(['a', 'b', 'c'])
provjeri(p3.length === 2 && p3.filter(([, b]) => b === null).length === 1, '3 igrača = meč + bye')
const p11 = paroviPrveRunde(Array.from({ length: 11 }, (_, i) => `p${i}`))
provjeri(
  p11.length === 6 && new Set(p11.flat().filter(Boolean)).size === 11,
  '11 igrača stane u 6 slotova bez gubitka'
)
provjeri(
  p11.filter(([, b]) => b === null).length === 1,
  'neparan broj → tačno JEDAN sam, ne više'
)

// --- Oblik bracketa ---------------------------------------------------------
naslov('Byevi se razlijevaju kroz stablo, ne gomilaju u prvoj rundi')
provjeri(
  slotoviPoRundi(20).join() === '10,5,3,2,1',
  `20 igrača: 10 → 5 → 3 → 2 → 1 (dobiveno ${slotoviPoRundi(20).join()})`
)
provjeri(slotoviPoRundi(8).join() === '4,2,1', '8 igrača: 4 → 2 → 1, nijedne kvalifikacije')
provjeri(slotoviPoRundi(2).join() === '1', '2 igrača: jedan meč i gotovo')
provjeri(slotoviPoRundi(1).length === 0, 'jedan igrač — nema rundi')
provjeri(slotoviPoRundi(5).join() === '3,2,1', '5 igrača: 3 → 2 → 1')
provjeri(slotoviPoRundi(11).join() === '6,3,2,1', '11 igrača: 6 → 3 → 2 → 1')

naslov('Oblik bracketa se slaže s brojem rundi i sam se sklapa do finala')
for (let n = 2; n <= 64; n++) {
  const s = slotoviPoRundi(n)
  provjeriTiho(s.length === brojRundi(n), `${n} igrača: broj rundi ${s.length} = brojRundi ${brojRundi(n)}`)
  provjeriTiho(s[s.length - 1] === 1, `${n} igrača: zadnja runda je jedan meč (finale)`)
  provjeriTiho(s[0] === Math.ceil(n / 2), `${n} igrača: prva runda ima ceil(n/2) mečeva`)
  // Pobjednik slota s ide u slot floor(s/2) sljedeće runde (propagate u
  // index.js). Za to svaka runda mora primiti tačno onoliko slotova koliko
  // prethodna ima pobjednika.
  for (let r = 1; r < s.length; r++) {
    provjeriTiho(s[r] === Math.ceil(s[r - 1] / 2), `${n} igrača: runda ${r + 1} prima pobjednike runde ${r}`)
  }
}
provjeri(tihoPalo === 0, `oblik bracketa ispravan za svih 2–64 učesnika (palo: ${tihoPalo})`)

// Koliko kvalifikacija turnir uopšte proizvede — neparan broj u rundi.
naslov('Kvalifikacije se javljaju baš tamo gdje je neparan broj')
const kvalifikacije = (n) => {
  const s = slotoviPoRundi(n)
  let ulazi = n
  const runde = []
  for (let r = 0; r < s.length; r++) {
    if (ulazi % 2 === 1) runde.push(r + 1)
    ulazi = s[r]
  }
  return runde
}
provjeri(kvalifikacije(20).join() === '3,4', '20 igrača: sam igrač u 3. i 4. rundi (ne u prvoj)')
provjeri(kvalifikacije(8).length === 0, '8 igrača: nijedna kvalifikacija')
provjeri(kvalifikacije(5).join() === '1,2', '5 igrača: bye u prvoj (besplatan) i kvalifikacija u drugoj')

console.log('\n══════════════════════════════════')
if (pao === 0) console.log('SVI TESTOVI RASPOREDA PROŠLI ✓')
else {
  console.error(`PALO PROVJERA: ${pao}`)
  process.exitCode = 1
}
