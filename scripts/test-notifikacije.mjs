// Test pravila za push notifikacije (F2.2) — čista logika iz
// functions/notif-odluka.js. Ne treba ni emulator ni FCM; ništa se ne šalje.
//
// Pokretanje:  node scripts/test-notifikacije.mjs

import {
  kandidatiZaNotifikaciju,
  turnirskaPoruka,
  smijePrimiti,
  NOTIF_RAZMAK,
} from '../functions/notif-odluka.js'

let pao = 0
const ok = (t) => console.log('  ✓ ' + t)
const provjeri = (uslov, t) => {
  if (uslov) ok(t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}

const SADA = Date.UTC(2026, 6, 27, 17, 0, 0) // pon 27.07.2026, 19h po BiH
const danKey = (pomak = 0) => new Date(SADA - pomak * 86400000).toISOString().slice(0, 10)
const DANAS = danKey(0)

const kontekst = (izmjene = {}) => ({
  sat: 19,
  sada: SADA,
  danas: DANAS,
  danUSedmici: 1, // ponedjeljak
  turnir: null,
  ...izmjene,
})

const igrac = (izmjene = {}) => ({ streak: 5, lastPlayDay: danKey(1), ...izmjene })

console.log('\n— NIZ U OPASNOSTI —')
provjeri(
  kandidatiZaNotifikaciju(igrac(), kontekst())[0]?.tip === 'streak',
  'niz 5, nije igrao danas, 19h → šalje se'
)
provjeri(
  kandidatiZaNotifikaciju(igrac({ lastPlayDay: DANAS }), kontekst()).length === 0,
  'ko je DANAS igrao ne dobija ništa'
)
provjeri(
  kandidatiZaNotifikaciju(igrac({ streak: 1 }), kontekst()).length === 0,
  'niz od 1 nije vrijedan poruke'
)
provjeri(
  kandidatiZaNotifikaciju(igrac({ streak: 0 }), kontekst()).length === 0,
  'bez niza nema poruke o nizu'
)
provjeri(
  kandidatiZaNotifikaciju(igrac(), kontekst({ sat: 9 })).length === 0,
  'u 9h se ne šalje upozorenje o nizu (samo uveče)'
)
provjeri(
  kandidatiZaNotifikaciju(igrac(), kontekst())[0]?.title.includes('5'),
  'poruka sadrži stvarnu dužinu niza'
)

console.log('\n— PREŽIVLJAVANJE (srijeda 9h) —')
provjeri(
  kandidatiZaNotifikaciju(igrac(), kontekst({ sat: 9, danUSedmici: 3 }))[0]?.tip === 'survival',
  'srijeda u 9h → poruka o Preživljavanju'
)
provjeri(
  kandidatiZaNotifikaciju(igrac(), kontekst({ sat: 9, danUSedmici: 4 })).length === 0,
  'četvrtak u 9h → ništa'
)

console.log('\n— PODSJETNIK (14h) —')
const bezIgre = (dana) => igrac({ streak: 0, lastPlayDay: danKey(dana) })
provjeri(
  kandidatiZaNotifikaciju(bezIgre(5), kontekst({ sat: 14 }))[0]?.tip === 'energija',
  '5 dana bez igre → podsjetnik'
)
provjeri(
  kandidatiZaNotifikaciju(bezIgre(2), kontekst({ sat: 14 })).length === 0,
  '2 dana bez igre → prerano, ništa'
)
provjeri(
  kandidatiZaNotifikaciju(bezIgre(30), kontekst({ sat: 14 })).length === 0,
  '30 dana bez igre → otišao je, ne dosađuj'
)
provjeri(
  kandidatiZaNotifikaciju(
    { streak: 0, lastPlayDay: null },
    kontekst({ sat: 14 })
  ).length === 0,
  'igrač bez ijednog odigranog dana ne dobija podsjetnik'
)

console.log('\n— PRIORITET —')
const dvaRazloga = kandidatiZaNotifikaciju(
  igrac(),
  kontekst({ turnir: { tip: 'turnir', title: 'T', body: 'B', url: '/turnir' } })
)
provjeri(dvaRazloga.length === 2, 'dva razloga aktivna istovremeno')
provjeri(dvaRazloga[0].tip === 'streak', 'niz ima prednost nad turnirom')

console.log('\n— POSTAVKE IGRAČA —')
provjeri(
  kandidatiZaNotifikaciju(igrac({ notifPrefs: { streak: false } }), kontekst()).length === 0,
  'ugašen tip se NE šalje'
)
provjeri(
  kandidatiZaNotifikaciju(
    igrac({ notifPrefs: { streak: false } }),
    kontekst({ turnir: { tip: 'turnir', title: 'T', body: 'B', url: '/turnir' } })
  )[0]?.tip === 'turnir',
  'gašenje jednog tipa ne gasi ostale'
)
provjeri(
  kandidatiZaNotifikaciju(igrac({ notifPrefs: {} }), kontekst())[0]?.tip === 'streak',
  'tip bez izričite postavke je UKLJUČEN'
)

console.log('\n— BRANA: JEDNA PORUKA DNEVNO —')
provjeri(smijePrimiti({ lastNotifAt: null }, SADA), 'prva poruka ikad prolazi')
provjeri(
  !smijePrimiti({ lastNotifAt: SADA - 3 * 3600 * 1000 }, SADA),
  'poruka prije 3h → blokirano'
)
provjeri(
  smijePrimiti({ lastNotifAt: SADA - NOTIF_RAZMAK - 1000 }, SADA),
  'poruka prije više od 20h → prolazi'
)

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
  turnirskaPoruka({ enabled: true, openAt: SADA }, SADA, 14)?.title.includes('počinje'),
  'početak turnira u 14h → poruka o početku'
)

console.log(
  pao === 0
    ? '\n══════════════════════════════════\nSVI TESTOVI NOTIFIKACIJA PROŠLI ✓'
    : `\n${pao} TEST(OVA) PALO ✗`
)
process.exit(pao === 0 ? 0 : 1)
