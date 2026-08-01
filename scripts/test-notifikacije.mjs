// Test pravila za push notifikacije (F2.2) — čista logika iz
// functions/notif-odluka.js. Ne treba ni emulator ni FCM; ništa se ne šalje.
//
// Pokretanje:  npm run test-notifikacije
//
// Raspored: dva termina dnevno po BiH vremenu — 9h i 20h.

import {
  kandidatiZaNotifikaciju,
  turnirskaPoruka,
  smijePrimiti,
  NOTIF_RAZMAK,
  porukaNoveRunde,
  porukaRokRunde,
  trebaPodsjetnikRunde,
  porukaZahtjevaZaKlan,
  PODSJETNIK_PRIJE_MS,
} from '../functions/notif-odluka.js'

let pao = 0
const provjeri = (uslov, t) => {
  if (uslov) console.log('  ✓ ' + t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}

const SADA = Date.UTC(2026, 6, 27, 18, 0, 0) // ponedjeljak 27.07.2026, 20h po BiH
const danKey = (pomak = 0) => new Date(SADA - pomak * 86400000).toISOString().slice(0, 10)
const DANAS = danKey(0)

const kontekst = (izmjene = {}) => ({
  sat: 20,
  sada: SADA,
  danas: DANAS,
  danUSedmici: 1, // ponedjeljak
  turnir: null,
  ...izmjene,
})

// Podrazumijevani igrač: niz 5, zadnji put igrao juče.
const igrac = (izmjene = {}) => ({ streak: 5, lastPlayDay: danKey(1), ...izmjene })
const tipovi = (p, k) => kandidatiZaNotifikaciju(p, k).map((x) => x.tip)
const prvi = (p, k) => kandidatiZaNotifikaciju(p, k)[0] || null

console.log('\n— NAJVAŽNIJE PRAVILO: ko je danas igrao, ne dobija NIŠTA —')
for (const sat of [9, 20]) {
  provjeri(
    kandidatiZaNotifikaciju(igrac({ lastPlayDay: DANAS }), kontekst({ sat })).length === 0,
    `${sat}h: igrao danas → tišina`
  )
}
provjeri(
  kandidatiZaNotifikaciju(
    igrac({ lastPlayDay: DANAS, streak: 30 }),
    kontekst({ sat: 20 })
  ).length === 0,
  '20h: ni dug niz ne probija to pravilo'
)

console.log('\n— DNEVNI KVIZ (zamjenska poruka, oba termina) —')
const bezNiza = igrac({ streak: 0 })
provjeri(prvi(bezNiza, kontekst({ sat: 9 }))?.tip === 'dnevni', '9h → jutarnja poruka')
provjeri(
  prvi(bezNiza, kontekst({ sat: 9 }))?.title.includes('Energija'),
  '9h: tekst govori o punoj energiji'
)
provjeri(prvi(bezNiza, kontekst({ sat: 20 }))?.tip === 'dnevni', '20h → večernja poruka')
provjeri(
  prvi(bezNiza, kontekst({ sat: 20 }))?.body.includes('ponoći'),
  '20h: tekst podsjeća da vrijeme ističe'
)
provjeri(prvi(bezNiza, kontekst({ sat: 9 }))?.url === '/kviz', 'poruka vodi pravo na kviz')

console.log('\n— NIZ U OPASNOSTI (20h, ima prednost nad dnevnim) —')
provjeri(prvi(igrac(), kontekst())?.tip === 'streak', 'niz 5 u 20h → poruka o nizu')
provjeri(prvi(igrac(), kontekst())?.title.includes('5'), 'poruka sadrži stvarnu dužinu niza')
provjeri(
  tipovi(igrac(), kontekst()).join() === 'streak,dnevni',
  'niz je ispred dnevnog kviza, ne umjesto njega'
)
provjeri(prvi(igrac({ streak: 1 }), kontekst())?.tip === 'dnevni', 'niz od 1 → ostaje dnevni')
provjeri(prvi(igrac(), kontekst({ sat: 9 }))?.tip === 'dnevni', 'ujutro se ne plaši nizom')

console.log('\n— PREŽIVLJAVANJE (srijeda 9h) —')
provjeri(
  prvi(igrac(), kontekst({ sat: 9, danUSedmici: 3 }))?.tip === 'survival',
  'srijeda 9h → Preživljavanje ispred dnevnog'
)
provjeri(
  prvi(igrac(), kontekst({ sat: 9, danUSedmici: 4 }))?.tip === 'dnevni',
  'četvrtak 9h → obična dnevna poruka'
)

console.log('\n— POVRATAK poslije više dana (9h) —')
const odsutan = (dana) => igrac({ streak: 0, lastPlayDay: danKey(dana) })
provjeri(prvi(odsutan(5), kontekst({ sat: 9 }))?.tip === 'energija', '5 dana → poruka o povratku')
provjeri(prvi(odsutan(2), kontekst({ sat: 9 }))?.tip === 'dnevni', '2 dana → još je rano, dnevni')
provjeri(
  prvi(odsutan(30), kontekst({ sat: 9 }))?.tip === 'dnevni',
  '30 dana → otišao je, ne dosađuj posebnom porukom'
)
provjeri(
  prvi({ streak: 0, lastPlayDay: null }, kontekst({ sat: 9 }))?.tip === 'dnevni',
  'igrač bez ijednog odigranog dana ne dobija poruku o povratku'
)

console.log('\n— PRIORITET —')
const turnirPoruka = { tip: 'turnir', title: 'T', body: 'B', url: '/turnir' }
provjeri(
  tipovi(igrac(), kontekst({ turnir: turnirPoruka })).join() === 'streak,turnir,dnevni',
  'redoslijed: niz > turnir > dnevni'
)
provjeri(
  tipovi(odsutan(5), kontekst({ sat: 9, danUSedmici: 3, turnir: turnirPoruka })).join() ===
    'survival,turnir,energija,dnevni',
  'sva četiri razloga odjednom → ispravan redoslijed'
)

console.log('\n— POSTAVKE IGRAČA —')
provjeri(
  prvi(igrac({ notifPrefs: { streak: false } }), kontekst())?.tip === 'dnevni',
  'ugašen niz → propada na dnevni, ne gubi se sve'
)
provjeri(
  kandidatiZaNotifikaciju(
    igrac({ notifPrefs: { streak: false, dnevni: false } }),
    kontekst()
  ).length === 0,
  'ugašeno sve što je aktivno → ništa se ne šalje'
)
provjeri(
  prvi(igrac({ notifPrefs: {} }), kontekst())?.tip === 'streak',
  'tip bez izričite postavke je UKLJUČEN'
)

console.log('\n— BRANA OD PONOVLJENOG SLANJA —')
provjeri(smijePrimiti({ lastNotifAt: null }, SADA), 'prva poruka ikad prolazi')
provjeri(
  !smijePrimiti({ lastNotifAt: SADA - 3600 * 1000 }, SADA),
  'poruka prije sat vremena → blokirano (ponovljen tick)'
)
provjeri(
  smijePrimiti({ lastNotifAt: SADA - 11 * 3600 * 1000 }, SADA),
  'jutarnja u 9h ne blokira večernju u 20h (11h razmaka)'
)
provjeri(NOTIF_RAZMAK < 11 * 3600 * 1000, 'brana je kraća od razmaka između termina')

console.log('\n— TURNIR (iz configa) —')
provjeri(turnirskaPoruka(null, SADA, 9) === null, 'bez configa nema poruke')
provjeri(
  turnirskaPoruka({ enabled: false, regOpenAt: SADA }, SADA, 9) === null,
  'ugašen turnir → nema poruke'
)
provjeri(
  turnirskaPoruka({ enabled: true, regOpenAt: SADA }, SADA, 9)?.tip === 'turnir',
  'prijave tek otvorene u 9h → poruka'
)
provjeri(
  turnirskaPoruka({ enabled: true, regOpenAt: SADA - 3 * 86400000 }, SADA, 9) === null,
  'prijave otvorene prije 3 dana → NE šalje se ponovo'
)
provjeri(
  turnirskaPoruka({ enabled: true, openAt: SADA }, SADA, 20)?.title.includes('počinje'),
  'početak turnira u 20h → poruka o početku'
)

console.log('\n— 1v1: NOVA RUNDA —')
{
  const rok = SADA + 12 * 3600 * 1000
  const duel = porukaNoveRunde({ tid: 't1', round: 2, rounds: 4, rok, vrsta: 'duel' })
  const kval = porukaNoveRunde({ tid: 't1', round: 2, rounds: 4, rok, vrsta: 'kvalifikacija' })
  provjeri(duel.tip === 'turnir', 'nova runda ide pod tipom turnir (postojeći prekidač)')
  provjeri(duel.title.includes('Runda 2'), 'obična runda nosi svoj broj')
  provjeri(
    porukaNoveRunde({ tid: 't1', round: 4, rounds: 4, rok }).title.includes('Finale'),
    'zadnja runda se zove Finale, ne "Runda 4"'
  )
  provjeri(
    porukaNoveRunde({ tid: 't1', round: 3, rounds: 4, rok }).title.includes('Polufinale'),
    'pretposljednja runda je Polufinale'
  )
  provjeri(
    kval.body.includes('6') && kval.body.includes('10'),
    'kvalifikacija u tekstu nosi prag (6 od 10)'
  )
  provjeri(duel.body !== kval.body, 'duel i kvalifikacija NEMAJU isti tekst')
  provjeri(
    duel.tag !== porukaRokRunde({ tid: 't1', round: 2, rok }).tag,
    'početak runde i podsjetnik na rok imaju različit tag (ne brišu se međusobno)'
  )
  provjeri(
    porukaNoveRunde({ tid: 't1', round: 1, rounds: 4, rok: 0 }).body.includes('uskoro'),
    'bez roka poruka i dalje ima smisla'
  )
}

console.log('\n— 1v1: PODSJETNIK SAT PRIJE ROKA —')
{
  const rok = SADA + 12 * 3600 * 1000
  const t = (izmjene = {}) => ({
    status: 'active',
    currentRound: 2,
    roundDeadlines: [SADA - 86400000, rok],
    ...izmjene,
  })
  provjeri(trebaPodsjetnikRunde(t(), SADA) === null, 'daleko od roka → ništa')
  provjeri(
    trebaPodsjetnikRunde(t(), rok - 59 * 60 * 1000) === 2,
    '59 min prije roka → podsjetnik za tekuću rundu'
  )
  provjeri(
    trebaPodsjetnikRunde(t(), rok - 61 * 60 * 1000) === null,
    '61 min prije roka → još ne (prozor je 60 min)'
  )
  provjeri(trebaPodsjetnikRunde(t(), rok) === null, 'na rok → rundu zatvara tick, ne podsjetnik')
  provjeri(
    trebaPodsjetnikRunde(t({ podsjetnikRunda: 2 }), rok - 10 * 60 * 1000) === null,
    'već poslan za ovu rundu → ne šalje se drugi put'
  )
  provjeri(
    trebaPodsjetnikRunde(t({ podsjetnikRunda: 1 }), rok - 10 * 60 * 1000) === 2,
    'oznaka iz PRETHODNE runde ne blokira novu'
  )
  provjeri(
    trebaPodsjetnikRunde(t({ status: 'finished' }), rok - 10 * 60 * 1000) === null,
    'završen turnir → ništa'
  )
  provjeri(
    trebaPodsjetnikRunde(t({ roundDeadlines: [] }), rok - 10 * 60 * 1000) === null,
    'bez roka runde → ništa'
  )
  // Tick ide svakih 30 min, prozor je 60 — bar jedan prolaz mora upasti.
  provjeri(
    PODSJETNIK_PRIJE_MS >= 2 * 30 * 60 * 1000,
    'prozor je bar dva ciklusa ticka (30 min) — inače podsjetnik zna promašiti'
  )
  provjeri(
    porukaRokRunde({ tid: 't1', round: 2, rok }).title.includes('sat vremena'),
    'automatski podsjetnik kaže da je ostao sat'
  )
  provjeri(
    !porukaRokRunde({ tid: 't1', round: 2, rok, hitno: false }).title.includes('sat vremena'),
    'ručni (admin) podsjetnik NE tvrdi da je ostao sat'
  )
}

console.log('\n— KLAN: ZAHTJEV ZA ULAZAK —')
{
  const jedan = porukaZahtjevaZaKlan({ ime: 'Amra', klan: 'Mortari', ukupno: 1 })
  const vise = porukaZahtjevaZaKlan({ ime: 'Amra', klan: 'Mortari', ukupno: 3 })
  provjeri(jedan.tip === 'klan', 'zahtjev ide pod tipom klan (postojeći prekidač)')
  provjeri(jedan.body.includes('Amra') && jedan.body.includes('Mortari'), 'ime i klan u tekstu')
  provjeri(vise.body.includes('3'), 'kad ih je više, broj zahtjeva na čekanju je u tekstu')
  provjeri(jedan.url === '/klan', 'vodi na sekciju Klan')
}

console.log(
  pao === 0
    ? '\n══════════════════════════════════\nSVI TESTOVI NOTIFIKACIJA PROŠLI ✓'
    : `\n${pao} TEST(OVA) PALO ✗`
)
process.exit(pao === 0 ? 0 : 1)
