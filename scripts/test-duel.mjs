// Test pravila 1v1 duela — čista logika iz functions/duel-pravila.js.
// Ne treba ni emulator ni Firebase; ništa se ne upisuje.
//
// Pokretanje:  npm run test-duel

import {
  DUEL_QUESTIONS,
  DUEL_TOTAL_SECONDS,
  KVALIFIKACIJA_PRAG,
  duelPreostalo,
  jeKvalifikacija,
  kvalifikacijaProsla,
  resolveMatch,
} from '../functions/duel-pravila.js'

let pao = 0
const provjeri = (uslov, t) => {
  if (uslov) console.log('  ✓ ' + t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}
const naslov = (t) => console.log(`\n${t}`)

// Žrijeb se u testovima fiksira da ishod bude predvidiv.
const uvijekP1 = () => true
const uvijekP2 = () => false

// --- Format ---------------------------------------------------------------
naslov('Format duela')
provjeri(DUEL_QUESTIONS === 10, '10 pitanja po duelu')
provjeri(DUEL_TOTAL_SECONDS === 120, '120 sekundi za cijeli duel, ne po pitanju')

// --- Tajmer ---------------------------------------------------------------
naslov('Tajmer je zajednički za sva pitanja')
const t0 = 1_000_000
provjeri(duelPreostalo(t0, t0) === 120, 'na startu stoji punih 120 s')
provjeri(duelPreostalo(t0, t0 + 30_000) === 90, 'poslije 30 s ostaje 90 s')
provjeri(
  duelPreostalo(t0, t0 + 45_000) === 75,
  'vrijeme se ne resetuje po pitanju — poslije 45 s ostaje 75 s'
)
provjeri(duelPreostalo(t0, t0 + 120_000) === 0, 'na 120 s je nula')
provjeri(duelPreostalo(t0, t0 + 500_000) === 0, 'nikad ispod nule')

// --- Bye i walkover -------------------------------------------------------
naslov('Bye i walkover')
provjeri(resolveMatch({ p1: 'a', p2: null }) === 'a', 'prazan slot → protivnik prolazi')
provjeri(resolveMatch({ p1: null, p2: 'b' }) === 'b', 'prazan slot (obrnuto)')
provjeri(resolveMatch({ p1: null, p2: null }) === null, 'oba slota prazna → nema pobjednika')
provjeri(
  resolveMatch({ p1: 'a', p2: 'b', p1Played: true, p1Score: 0, p2Played: false }) === 'a',
  'protivnik nije odigrao → walkover, čak i sa 0 tačnih'
)
provjeri(
  resolveMatch({ p1: 'a', p2: 'b', p1Played: false, p2Played: true, p2Score: 3 }) === 'b',
  'walkover na drugu stranu'
)
provjeri(
  resolveMatch({ p1: 'a', p2: 'b', p1Played: false, p2Played: false }, uvijekP2) === 'b',
  'niko nije odigrao → žrijeb'
)

// --- Skor -----------------------------------------------------------------
naslov('Više tačnih pobjeđuje')
const odigrali = { p1: 'a', p2: 'b', p1Played: true, p2Played: true }
provjeri(resolveMatch({ ...odigrali, p1Score: 7, p2Score: 5 }) === 'a', '7:5 → p1')
provjeri(resolveMatch({ ...odigrali, p1Score: 2, p2Score: 9 }) === 'b', '2:9 → p2')

// --- Neriješeno: prolazi ko je prvi odigrao -------------------------------
naslov('Neriješeno rješava vrijeme završetka')
provjeri(
  resolveMatch(
    { ...odigrali, p1Score: 6, p2Score: 6, p1FinishedAt: 500, p2FinishedAt: 900 },
    uvijekP2
  ) === 'a',
  '6:6 → prolazi onaj ko je završio ranije (žrijeb se ne pita)'
)
provjeri(
  resolveMatch(
    { ...odigrali, p1Score: 6, p2Score: 6, p1FinishedAt: 900, p2FinishedAt: 500 },
    uvijekP1
  ) === 'b',
  '6:6 → obrnuto, raniji završetak opet pobjeđuje'
)
provjeri(
  resolveMatch({ ...odigrali, p1Score: 4, p2Score: 4, p1FinishedAt: 700, p2FinishedAt: 700 }) ===
    'a',
  'ista sekunda → p1 (deterministički, bez žrijeba)'
)
provjeri(
  resolveMatch({ ...odigrali, p1Score: 5, p2Score: 5, p1FinishedAt: 100 }, uvijekP2) === 'a',
  'samo jedan ima upisano vrijeme → on prolazi'
)
provjeri(
  resolveMatch({ ...odigrali, p1Score: 5, p2Score: 5, p2FinishedAt: 100 }, uvijekP1) === 'b',
  'samo drugi ima upisano vrijeme → on prolazi'
)
provjeri(
  resolveMatch({ ...odigrali, p1Score: 5, p2Score: 5 }, uvijekP2) === 'b',
  'zatečeni meč bez vremena (odigran prije izmjene) → žrijeb kao zadnja brana'
)

// --- Kvalifikacija (01.08.2026.) -----------------------------------------
naslov(`Kvalifikacija — bez protivnika treba ${KVALIFIKACIJA_PRAG}/${DUEL_QUESTIONS}`)
provjeri(KVALIFIKACIJA_PRAG === 6, 'prag je 6 tačnih')

const kval = { p1: 'a', p2: null, kvalifikacija: true }
provjeri(jeKvalifikacija(kval), 'označen meč s jednim igračem JESTE kvalifikacija')
provjeri(
  !jeKvalifikacija({ p1: 'a', p2: 'b', kvalifikacija: true }),
  'meč s oba igrača NIJE kvalifikacija ni kad oznaka zaluta'
)
provjeri(!jeKvalifikacija({ p1: 'a', p2: null }), 'neoznačen bye nije kvalifikacija (1. runda)')
provjeri(!jeKvalifikacija({ p1: null, p2: null, kvalifikacija: true }), 'prazna grana nije kvalifikacija')

provjeri(
  resolveMatch({ ...kval, p1Played: true, p1Score: 6 }) === 'a',
  'tačno na pragu (6/10) → prolazi'
)
provjeri(
  resolveMatch({ ...kval, p1Played: true, p1Score: 10 }) === 'a',
  'iznad praga → prolazi'
)
provjeri(
  resolveMatch({ ...kval, p1Played: true, p1Score: 5 }) === null,
  'jedan ispod praga (5/10) → ispada, grana ostaje prazna'
)
provjeri(resolveMatch({ ...kval, p1Played: false }) === null, 'nije ni izašao do roka → ispada')
provjeri(
  resolveMatch({ ...kval, p1Played: true, p1Score: 0 }) === null,
  'odigrao bez ijednog tačnog → ispada'
)
provjeri(
  resolveMatch({ p1: null, p2: 'b', kvalifikacija: true, p2Played: true, p2Score: 7 }) === 'b',
  'kvalifikant na drugom slotu se čita jednako'
)
provjeri(
  resolveMatch({ p1: null, p2: 'b', kvalifikacija: true, p2Played: true, p2Score: 3 }) === null,
  'kvalifikant na drugom slotu ispada ispod praga'
)

// Bye u PRVOJ rundi ostaje besplatan — oznaku tamo server ni ne postavlja.
provjeri(
  resolveMatch({ p1: 'a', p2: null, p1Played: false }) === 'a',
  'neoznačen bye i dalje prolazi bez borbe (1. runda)'
)
provjeri(kvalifikacijaProsla({ p1: 'a', p1Played: true, p1Score: 6 }), 'kvalifikacijaProsla: 6 prolazi')
provjeri(!kvalifikacijaProsla({ p1: 'a', p1Played: true, p1Score: 5 }), 'kvalifikacijaProsla: 5 ne prolazi')

console.log('\n══════════════════════════════════')
if (pao === 0) console.log('SVI TESTOVI DUELA PROŠLI ✓')
else {
  console.error(`PALO PROVJERA: ${pao}`)
  process.exitCode = 1
}
