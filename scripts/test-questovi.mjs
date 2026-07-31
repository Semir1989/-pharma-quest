/* Testovi izbora questova — čista pravila, bez emulatora i bez mreže.
 * Pokretanje:  npm run test-questovi
 *
 * Provjerava se STVARNI bazen iz scripts/taskovi-lista.js, ne izmišljeni
 * fixture — najčešća greška pri dodavanju questa je da bazen padne ispod
 * TASK_COUNT, pa igrač tiho dobije manje zadataka nego što broj obećava.
 */

import {
  TASK_COUNT,
  pickTaskIds,
  dopuniIzbor,
  smijeSeZamijeniti,
} from '../functions/quest-izbor.js'
import { TASKS } from './taskovi-lista.js'

let prosao = 0
let pao = 0

function ok(uslov, opis) {
  if (uslov) {
    prosao++
  } else {
    pao++
    console.error(`  ✗ ${opis}`)
  }
}

function jednako(a, b, opis) {
  ok(a === b, `${opis} — očekivano ${b}, dobiveno ${a}`)
}

const TIPOVI = ['daily', 'weekly', 'monthly']
const UIDS = ['uid-a', 'uid-b', 'uid-c', 'uid-d', 'uid-e', 'uid-f', 'uid-g', 'uid-h']
const byId = new Map(TASKS.map((t) => [t.id, t]))

// ---------------------------------------------------------------------------
console.log('\n1. Bazen je dovoljno velik za TASK_COUNT')
// ---------------------------------------------------------------------------
// Najgori slučaj je period BEZ ijednog živog eventa: tada event zadaci ispadaju
// iz ponude i sve mora pokriti rotirajući bazen uz `always` zadatke.
for (const tip of TIPOVI) {
  const svi = TASKS.filter((t) => t.type === tip)
  const always = svi.filter((t) => t.always && !t.event).length
  const rotirajuci = svi.filter((t) => !t.event && !t.always).length
  ok(
    always + rotirajuci >= TASK_COUNT[tip],
    `${tip}: bez eventa bazen daje ${always + rotirajuci}, treba ${TASK_COUNT[tip]}`
  )
}

// ---------------------------------------------------------------------------
console.log('2. Svaki igrač dobija tačno TASK_COUNT zadataka')
// ---------------------------------------------------------------------------
for (const tip of TIPOVI) {
  for (const eventi of [[], ['survival'], ['survival', 'tournament']]) {
    for (const uid of UIDS) {
      const izbor = pickTaskIds(TASKS, uid, tip, '2026-W31', eventi)
      jednako(
        izbor.length,
        TASK_COUNT[tip],
        `${tip} / ${uid} / eventi=[${eventi}] broj zadataka`
      )
      jednako(new Set(izbor).size, izbor.length, `${tip} / ${uid} nema duplikata`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('3. Stalni (always) zadaci su UVIJEK u izboru')
// ---------------------------------------------------------------------------
for (const tip of TIPOVI) {
  const stalni = TASKS.filter((t) => t.type === tip && t.always).map((t) => t.id)
  if (stalni.length === 0) continue
  for (const eventi of [[], ['survival'], ['survival', 'tournament']]) {
    for (const uid of UIDS) {
      const izbor = pickTaskIds(TASKS, uid, tip, '2026-W31', eventi)
      for (const id of stalni) {
        ok(izbor.includes(id), `${tip} / ${uid} / eventi=[${eventi}] sadrži stalni ${id}`)
      }
    }
  }
}
// Konkretno: tri EPC zadatka koja su obećana igračima.
for (const [id, tip] of [
  ['weekly-epc-komentari-10', 'weekly'],
  ['weekly-epc-lajkovi-30', 'weekly'],
  ['monthly-epc-post-1', 'monthly'],
]) {
  ok(byId.get(id)?.always === true, `${id} je označen kao always`)
  ok(byId.get(id)?.metric === 'manual', `${id} se potvrđuje ručno`)
  ok(
    UIDS.every((uid) => pickTaskIds(TASKS, uid, tip, '2026-08', ['survival']).includes(id)),
    `${id} dobiju svi igrači`
  )
}

// ---------------------------------------------------------------------------
console.log('4. Najviše JEDAN event zadatak, i to samo dok event traje')
// ---------------------------------------------------------------------------
for (const tip of TIPOVI) {
  for (const uid of UIDS) {
    const bezEventa = pickTaskIds(TASKS, uid, tip, '2026-W31', [])
    ok(
      bezEventa.every((id) => !byId.get(id).event),
      `${tip} / ${uid}: bez živog eventa nema event zadataka`
    )

    const saEventom = pickTaskIds(TASKS, uid, tip, '2026-W31', ['survival', 'tournament'])
    const koliko = saEventom.filter((id) => byId.get(id).event).length
    ok(koliko <= 1, `${tip} / ${uid}: najviše 1 event zadatak (bilo ${koliko})`)
    ok(
      saEventom.every((id) => !byId.get(id).event || byId.get(id).event !== 'nepostojeci'),
      `${tip} / ${uid}: event zadatak je iz žive liste`
    )
  }
}

// ---------------------------------------------------------------------------
console.log('5. Izbor je determinističan i različit među igračima/periodima')
// ---------------------------------------------------------------------------
for (const tip of TIPOVI) {
  const prvi = pickTaskIds(TASKS, 'uid-a', tip, '2026-W31', ['survival'])
  const drugi = pickTaskIds(TASKS, 'uid-a', tip, '2026-W31', ['survival'])
  ok(prvi.join() === drugi.join(), `${tip}: isti (uid, period) daje isti izbor`)

  const sljedeci = pickTaskIds(TASKS, 'uid-a', tip, '2026-W32', ['survival'])
  const rotirajuci = TASKS.filter((t) => t.type === tip && !t.always && !t.event).length
  if (rotirajuci > TASK_COUNT[tip]) {
    ok(prvi.join() !== sljedeci.join(), `${tip}: novi period donosi drugačiji izbor`)
  }
}

// ---------------------------------------------------------------------------
console.log('6. Stalni zadaci se ne mogu zamijeniti žetonom')
// ---------------------------------------------------------------------------
for (const t of TASKS) {
  jednako(smijeSeZamijeniti(t), !t.always, `${t.id} zamjenjivost`)
}

// ---------------------------------------------------------------------------
console.log('7. Definicije nagrada su ispravne')
// ---------------------------------------------------------------------------
const DOZVOLJENI_ZETONI = [
  'quizRefill',
  'streakFreeze',
  'questReroll',
  'questRerollWeekly',
  'questRerollMonthly',
  'survivalRevive',
]
for (const t of TASKS) {
  ok(Number.isFinite(t.reward) && t.reward > 0, `${t.id}: reward je pozitivan broj`)
  ok(Number.isInteger(t.goal) && t.goal > 0, `${t.id}: goal je pozitivan cijeli broj`)
  for (const [kind, n] of Object.entries(t.tokens || {})) {
    ok(DOZVOLJENI_ZETONI.includes(kind), `${t.id}: '${kind}' je poznata vrsta žetona`)
    ok(Number.isInteger(n) && n > 0, `${t.id}: količina žetona '${kind}' je pozitivna`)
  }
  if (t.clanGold !== undefined) {
    ok(Number.isInteger(t.clanGold) && t.clanGold > 0, `${t.id}: clanGold je pozitivan cijeli broj`)
  }
  // Vanjski zadaci se NE smiju mjeriti automatski, i obrnuto.
  if (t.metric === 'manual') {
    ok(!t.category, `${t.id}: ručni zadatak nema kategoriju`)
    ok(!t.event, `${t.id}: ručni zadatak nije vezan za event`)
  }
}
jednako(new Set(TASKS.map((t) => t.id)).size, TASKS.length, 'svi ID-evi su jedinstveni')

// ---------------------------------------------------------------------------
console.log('8. Brojevi koje je korisnik zadao (31.07.2026.)')
// ---------------------------------------------------------------------------
jednako(TASK_COUNT.daily, 5, 'dnevnih po igraču')
jednako(TASK_COUNT.weekly, 6, 'sedmičnih po igraču')
jednako(TASK_COUNT.monthly, 7, 'mjesečnih po igraču')

const provjeraNagrada = [
  ['weekly-epc-komentari-10', { goal: 10, reward: 300, quizRefill: 3, clanGold: 5 }],
  ['weekly-epc-lajkovi-30', { goal: 30, reward: 500, quizRefill: 4, clanGold: 10 }],
  ['monthly-epc-post-1', { goal: 1, reward: 750, quizRefill: 5, clanGold: 15 }],
]
for (const [id, ocekivano] of provjeraNagrada) {
  const t = byId.get(id)
  ok(!!t, `${id} postoji`)
  if (!t) continue
  jednako(t.goal, ocekivano.goal, `${id} cilj`)
  jednako(t.reward, ocekivano.reward, `${id} XP`)
  jednako(t.tokens?.quizRefill, ocekivano.quizRefill, `${id} žetoni za kviz`)
  jednako(t.clanGold, ocekivano.clanGold, `${id} zeleni bodovi`)
}
jednako(
  byId.get('monthly-epc-post-1')?.tokens?.survivalRevive,
  1,
  'mjesečni post nosi žeton za oživljavanje'
)
ok(!!byId.get('daily-epc-razgovor'), 'dnevni EPC razgovor postoji')
jednako(byId.get('daily-epc-razgovor')?.always, undefined, 'dnevni EPC razgovor se rotira')

// ---------------------------------------------------------------------------
console.log('9. Dopuna zamrznutog izbora (migracija 31.07.2026.)')
// ---------------------------------------------------------------------------
// Ovo je scenarij pravog deploya: igrači u tekućem periodu imaju zamrznut stari
// izbor (3 dnevna / 5 sedmičnih / 4 mjesečna, bez EPC zadataka). Dopuna ih mora
// dovesti na nove brojeve i ubaciti stalne zadatke — bez uklanjanja ijednog.
const STARI = {
  daily: ['daily-kviz-1', 'daily-tacnih-12', 'daily-survival-3'],
  weekly: [
    'weekly-dana-4',
    'weekly-kvizovi-10',
    'weekly-tacnih-100',
    'weekly-xp-1000',
    'weekly-survival-15',
  ],
  monthly: ['monthly-dana-15', 'monthly-kvizovi-45', 'monthly-tacnih-430', 'monthly-survival-40'],
}

for (const tip of TIPOVI) {
  for (const uid of UIDS) {
    const dopunjen = dopuniIzbor(STARI[tip], TASKS, uid, tip, '2026-07')
    ok(!!dopunjen, `${tip} / ${uid}: dopuna je vratila novu listu`)
    if (!dopunjen) continue

    // Najmanje pun broj — a može i VIŠE. Sedmični je baš takav slučaj: zatečenih
    // 5 + 2 obavezna EPC zadatka = 7, iako je TASK_COUNT.weekly = 6. Namjerno:
    // izbacivanje petog zatečenog questa oduzelo bi igraču nešto na čemu je već
    // napredovao. Višak traje samo taj period; sljedeći kreće od 6.
    ok(
      dopunjen.length >= TASK_COUNT[tip],
      `${tip} / ${uid}: dopunjen na bar ${TASK_COUNT[tip]} (dobiveno ${dopunjen.length})`
    )
    for (const id of STARI[tip]) {
      ok(dopunjen.includes(id), `${tip} / ${uid}: zadržan zatečeni ${id}`)
    }
    for (const t of TASKS.filter((x) => x.type === tip && x.always)) {
      ok(dopunjen.includes(t.id), `${tip} / ${uid}: dodan stalni ${t.id}`)
    }
    jednako(new Set(dopunjen).size, dopunjen.length, `${tip} / ${uid}: bez duplikata`)
    // Dopuna ne smije ubaciti NOVI event quest usred perioda.
    const noviEventi = dopunjen
      .filter((id) => !STARI[tip].includes(id))
      .filter((id) => byId.get(id)?.event)
    jednako(noviEventi.length, 0, `${tip} / ${uid}: dopuna nije dodala event quest`)
  }
}

// Konkretni brojevi migracije, da se prelaz zna unaprijed i ne iznenadi:
jednako(dopuniIzbor(STARI.daily, TASKS, 'uid-a', 'daily', '2026-07-31').length, 5, 'dnevnih poslije dopune: 3 → 5')
jednako(dopuniIzbor(STARI.weekly, TASKS, 'uid-a', 'weekly', '2026-W31').length, 7, 'sedmičnih poslije dopune: 5 → 7 (privremeni višak)')
jednako(dopuniIzbor(STARI.monthly, TASKS, 'uid-a', 'monthly', '2026-07').length, 7, 'mjesečnih poslije dopune: 4 → 7')

// Već dopunjen izbor se ne dira — inače bi svaki poziv pisao u bazu.
for (const tip of TIPOVI) {
  const pun = pickTaskIds(TASKS, 'uid-a', tip, '2026-07', ['survival'])
  jednako(dopuniIzbor(pun, TASKS, 'uid-a', tip, '2026-07'), null, `${tip}: pun izbor ostaje netaknut`)
}

// Ugašen quest u zatečenom izboru se nadoknađuje, ali se ne briše iz liste.
const saUgasenim = ['nepostojeci-quest', 'weekly-dana-4']
const popravljen = dopuniIzbor(saUgasenim, TASKS, 'uid-a', 'weekly', '2026-W31')
ok(popravljen.includes('nepostojeci-quest'), 'ugašen quest se ne uklanja iz zatečenog izbora')
jednako(
  popravljen.filter((id) => byId.has(id)).length,
  TASK_COUNT.weekly,
  'ugašen quest se nadoknađuje važećim'
)

// ---------------------------------------------------------------------------
console.log(`\n${prosao} prošlo, ${pao} palo`)
process.exit(pao === 0 ? 0 : 1)
