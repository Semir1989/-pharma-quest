// Test pravila klanova — čista logika iz functions/klan-pravila.js.
// Ne treba ni emulator ni Firebase; ništa se ne upisuje.
//
// Pokretanje:  npm run test-klanovi

import {
  MAX_CLANOVA,
  MAX_SAVJETNIKA,
  MIN_LEVEL_OSNIVANJE,
  NEAKTIVNOST_DANA,
  KLAN_ZABRANA_MS,
  zabranaOstalo,
  kljucImena,
  validirajIme,
  validirajTag,
  ulogaU,
  smijeUpravljati,
  smijeRaspustiti,
  smijeMijenjatiSavjetnike,
  smijeIzbaciti,
  mozeOsnovati,
  imaMjesta,
  mozeJosSavjetnika,
  izaberiNasljednika,
  jeNeaktivan,
  danaIzmedju,
  registracijaOtvorena,
  takmicenjeUToku,
  weekIdZaRegistraciju,
  fazaTakmicenja,
} from '../functions/klan-pravila.js'

let pao = 0
const provjeri = (uslov, t) => {
  if (uslov) console.log('  ✓ ' + t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}
const naslov = (t) => console.log(`\n${t}`)

// Klan s 3 člana: osnivač f, savjetnik s1, obični član m1.
const klan = {
  id: 'c1',
  name: 'Farmaceuti',
  founderId: 'f',
  advisorIds: ['s1'],
  memberIds: ['f', 's1', 'm1'],
  pendingRequests: ['p1'],
}

// ---------------------------------------------------------------------------
naslov('Osnivanje — minimalni level')
// ---------------------------------------------------------------------------
provjeri(MIN_LEVEL_OSNIVANJE === 10, 'prag je level 10')
provjeri(!mozeOsnovati(9), 'level 9 NE može osnovati klan')
provjeri(!mozeOsnovati(0), 'level 0 NE može osnovati klan')
provjeri(!mozeOsnovati(undefined), 'nepoznat level NE može osnovati klan')
provjeri(mozeOsnovati(10), 'level 10 može osnovati klan')
provjeri(mozeOsnovati(42), 'level 42 može osnovati klan')

// ---------------------------------------------------------------------------
naslov('Ime i tag')
// ---------------------------------------------------------------------------
provjeri(!validirajIme('ab').ok, 'ime od 2 znaka je odbijeno')
provjeri(validirajIme('abc').ok, 'ime od 3 znaka prolazi')
provjeri(!validirajIme('x'.repeat(25)).ok, 'ime od 25 znakova je odbijeno')
provjeri(validirajIme('x'.repeat(24)).ok, 'ime od 24 znaka prolazi')
provjeri(validirajIme('  Farmaceuti  ').vrijednost === 'Farmaceuti', 'ime se trimuje')
provjeri(kljucImena('  FarmaCeuti ') === 'farmaceuti', 'ključ imena je mala slova bez razmaka okolo')
provjeri(kljucImena('Klan   Bosne') === 'klan bosne', 'višestruki razmaci se sažimaju u ključu')
provjeri(validirajTag('').ok && validirajTag('').vrijednost === null, 'tag je opcion')
provjeri(!validirajTag('a').ok, 'tag od 1 znaka je odbijen')
provjeri(!validirajTag('abcdef').ok, 'tag od 6 znakova je odbijen')
provjeri(validirajTag('rx').vrijednost === 'RX', 'tag se diže u velika slova')

// ---------------------------------------------------------------------------
naslov('Uloge')
// ---------------------------------------------------------------------------
provjeri(ulogaU(klan, 'f') === 'founder', 'osnivač je founder')
provjeri(ulogaU(klan, 's1') === 'advisor', 'savjetnik je advisor')
provjeri(ulogaU(klan, 'm1') === 'member', 'običan član je member')
provjeri(ulogaU(klan, 'p1') === null, 'onaj ko je samo poslao zahtjev nema ulogu')
provjeri(ulogaU(klan, 'niko') === null, 'stranac nema ulogu')

// ---------------------------------------------------------------------------
naslov('Dozvole — raspuštanje i savjetnici')
// ---------------------------------------------------------------------------
provjeri(smijeRaspustiti('founder'), 'osnivač smije raspustiti klan')
provjeri(!smijeRaspustiti('advisor'), 'SAVJETNIK NE SMIJE raspustiti klan')
provjeri(!smijeRaspustiti('member'), 'član ne smije raspustiti klan')
provjeri(smijeMijenjatiSavjetnike('founder'), 'osnivač imenuje savjetnike')
provjeri(!smijeMijenjatiSavjetnike('advisor'), 'savjetnik NE imenuje savjetnike')
provjeri(smijeUpravljati('advisor'), 'savjetnik smije upravljati zahtjevima')
provjeri(!smijeUpravljati('member'), 'član ne smije upravljati zahtjevima')

// ---------------------------------------------------------------------------
naslov('Dozvole — izbacivanje')
// ---------------------------------------------------------------------------
provjeri(smijeIzbaciti('founder', 'member'), 'osnivač izbacuje člana')
provjeri(smijeIzbaciti('founder', 'advisor'), 'osnivač izbacuje savjetnika')
provjeri(!smijeIzbaciti('founder', 'founder'), 'osnivač se ne može izbaciti')
provjeri(smijeIzbaciti('advisor', 'member'), 'savjetnik izbacuje člana')
provjeri(!smijeIzbaciti('advisor', 'advisor'), 'savjetnik NE izbacuje drugog savjetnika')
provjeri(!smijeIzbaciti('advisor', 'founder'), 'savjetnik NE izbacuje osnivača')
provjeri(!smijeIzbaciti('member', 'member'), 'član ne izbacuje nikoga')

// ---------------------------------------------------------------------------
naslov('Limiti — 10 članova i 2 savjetnika')
// ---------------------------------------------------------------------------
provjeri(MAX_CLANOVA === 10 && MAX_SAVJETNIKA === 2, 'limiti su 10 članova i 2 savjetnika')
const pun = { memberIds: Array.from({ length: 10 }, (_, i) => `u${i}`) }
const skoroPun = { memberIds: Array.from({ length: 9 }, (_, i) => `u${i}`) }
provjeri(!imaMjesta(pun), 'klan s 10 članova NE prima novog')
provjeri(imaMjesta(skoroPun), 'klan s 9 članova prima desetog')
provjeri(!imaMjesta({ memberIds: Array.from({ length: 11 }, (_, i) => `u${i}`) }), 'preko limita ostaje zatvoreno')
provjeri(mozeJosSavjetnika({ advisorIds: ['a'] }), 'klan s jednim savjetnikom može još jednog')
provjeri(!mozeJosSavjetnika({ advisorIds: ['a', 'b'] }), 'klan s dva savjetnika NE može trećeg')

// ---------------------------------------------------------------------------
naslov('Nasljeđivanje vodstva')
// ---------------------------------------------------------------------------
provjeri(
  izaberiNasljednika([
    { uid: 'a', xp: 100 },
    { uid: 'b', xp: 900 },
    { uid: 'c', xp: 500 },
  ]) === 'b',
  'nasljednik je član s najviše XP-a'
)
provjeri(
  izaberiNasljednika([
    { uid: 'zz', xp: 300 },
    { uid: 'aa', xp: 300 },
  ]) === 'aa',
  'kod izjednačenja odlučuje uid — izbor je determinističan'
)
provjeri(izaberiNasljednika([]) === null, 'bez kandidata nema nasljednika')
provjeri(izaberiNasljednika([{ uid: 'x' }]) === 'x', 'kandidat bez XP polja je i dalje kandidat')

// ---------------------------------------------------------------------------
naslov('Neaktivnost osnivača (15 dana)')
// ---------------------------------------------------------------------------
provjeri(NEAKTIVNOST_DANA === 15, 'prag neaktivnosti je 15 dana')
provjeri(danaIzmedju('2026-07-01', '2026-07-16') === 15, 'razlika u danima se računa tačno')
provjeri(jeNeaktivan('2026-07-13', '2026-07-28'), 'osnivač koji nije igrao 15 dana je neaktivan')
provjeri(!jeNeaktivan('2026-07-14', '2026-07-28'), 'osnivač koji je igrao prije 14 dana NIJE neaktivan')
provjeri(!jeNeaktivan('2026-07-28', '2026-07-28'), 'osnivač koji je igrao danas nije neaktivan')
provjeri(
  !jeNeaktivan(null, '2026-07-28', '2026-07-20'),
  'osnivač koji nikad nije igrao mjeri se od osnivanja klana (7 dana — još nije neaktivan)'
)
provjeri(
  jeNeaktivan(null, '2026-07-28', '2026-07-01'),
  'klan osnovan prije 27 dana bez ijednog kviza osnivača → neaktivan'
)
provjeri(!jeNeaktivan(null, '2026-07-28', null), 'bez ijednog podatka se ne smjenjuje niko')

// ---------------------------------------------------------------------------
naslov('Prozor registracije (subota – nedjelja 20:00)')
// ---------------------------------------------------------------------------
// 2026-07-25 je subota, 26. nedjelja, 27. ponedjeljak, 31. petak.
const t = (d, hh, mm = 0) => ({ y: 2026, m: 7, d, hh, mm })

provjeri(registracijaOtvorena(t(25, 0)), 'subota 00:00 — otvoreno')
provjeri(registracijaOtvorena(t(25, 23)), 'subota 23:00 — otvoreno')
provjeri(registracijaOtvorena(t(26, 19)), 'nedjelja 19:00 — otvoreno')
provjeri(!registracijaOtvorena(t(26, 20)), 'nedjelja 20:00 — ZATVORENO (granica)')
provjeri(!registracijaOtvorena(t(26, 21)), 'nedjelja 21:00 — zatvoreno')
provjeri(!registracijaOtvorena(t(27, 10)), 'ponedjeljak — zatvoreno')
provjeri(!registracijaOtvorena(t(24, 12)), 'petak — zatvoreno')

// ---------------------------------------------------------------------------
naslov('Prozor takmičenja (pon 08:00 – pet 18:00)')
// ---------------------------------------------------------------------------
provjeri(!takmicenjeUToku(t(27, 7)), 'ponedjeljak 07:00 — još nije počelo')
provjeri(takmicenjeUToku(t(27, 8)), 'ponedjeljak 08:00 — počelo (granica)')
provjeri(takmicenjeUToku(t(29, 3)), 'srijeda 03:00 — traje')
provjeri(takmicenjeUToku(t(31, 17)), 'petak 17:00 — traje')
provjeri(!takmicenjeUToku(t(31, 18)), 'petak 18:00 — GOTOVO (granica)')
provjeri(!takmicenjeUToku(t(25, 12)), 'subota — ne traje')
provjeri(fazaTakmicenja(t(25, 12)) === 'registracija', 'subota je faza registracije')
provjeri(fazaTakmicenja(t(29, 12)) === 'takmicenje', 'srijeda je faza takmičenja')
provjeri(fazaTakmicenja(t(31, 20)) === 'pauza', 'petak navečer je pauza')

// ---------------------------------------------------------------------------
naslov('ID takmičarske sedmice')
// ---------------------------------------------------------------------------
provjeri(weekIdZaRegistraciju(t(25, 12)) === '2026-07-27', 'subota gađa ponedjeljak koji dolazi')
provjeri(weekIdZaRegistraciju(t(26, 12)) === '2026-07-27', 'nedjelja gađa isti ponedjeljak')
provjeri(weekIdZaRegistraciju(t(27, 12)) === '2026-07-27', 'ponedjeljak gađa taj isti dan')
provjeri(weekIdZaRegistraciju(t(31, 12)) === '2026-07-27', 'petak gađa ponedjeljak te sedmice')
// Prelazak mjeseca: 2026-08-01 je subota → ponedjeljak 2026-08-03.
provjeri(
  weekIdZaRegistraciju({ y: 2026, m: 8, d: 1, hh: 12 }) === '2026-08-03',
  'prelazak mjeseca daje ispravan ponedjeljak'
)
// Prelazak godine: 2026-12-31 je četvrtak → ponedjeljak 2026-12-28.
provjeri(
  weekIdZaRegistraciju({ y: 2026, m: 12, d: 31, hh: 12 }) === '2026-12-28',
  'prelazak godine ne kvari ID sedmice'
)

// Zabrana od 7 dana poslije DOBROVOLJNOG izlaska iz klana (30.07.2026).
// Oznaku postavlja leaveClan; kickMember je namjerno ne postavlja.
{
  const sad = Date.parse('2026-08-01T12:00:00Z')
  provjeri(KLAN_ZABRANA_MS === 7 * 86400000, 'zabrana traje tačno 7 dana')
  provjeri(zabranaOstalo({}, sad) === 0, 'bez oznake nema zabrane')
  provjeri(zabranaOstalo(null, sad) === 0, 'prazan profil ne ruši provjeru')
  provjeri(zabranaOstalo({ clanCooldownUntil: sad - 1000 }, sad) === 0, 'istekla zabrana je 0')
  provjeri(
    zabranaOstalo({ clanCooldownUntil: sad + KLAN_ZABRANA_MS }, sad) === KLAN_ZABRANA_MS,
    'puna zabrana vraća punih 7 dana'
  )
}

console.log('\n══════════════════════════════════')
if (pao > 0) {
  console.error(`PALO PROVJERA: ${pao}`)
  process.exit(1)
}
console.log('SVI TESTOVI KLANOVA PROŠLI ✓')
