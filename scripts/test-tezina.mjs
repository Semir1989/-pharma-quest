/* Testovi progresivne težine u 1v1 turniru — čista pravila, bez emulatora.
 * Pokretanje:  npm run test-tezina
 *
 * Provjerava se i STVARNA banka (scripts/pitanja-*.json), ne samo izmišljeni
 * pool: najveći rizik ove logike je da finale traži 10 pitanja težine 3, a
 * banka ih nema dovoljno — tada bi se tiho posudilo od lakših i finale ne bi
 * bilo teže od polufinala.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  PROFILI,
  MIN_UZORAK,
  profilRunde,
  nivo,
  empirijska,
  raspodjela,
  izaberiPitanjaZaRundu,
} from '../functions/pitanja-tezina.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let prosao = 0
let pao = 0
const ok = (uslov, opis) => {
  if (uslov) prosao++
  else {
    pao++
    console.error(`  ✗ ${opis}`)
  }
}
const jednako = (a, b, opis) => ok(a === b, `${opis} — očekivano ${b}, dobiveno ${a}`)
const naslov = (t) => console.log(`\n${t}`)

// Determinističan "slučajan" broj, da izbor u testu bude ponovljiv.
function sjeme(s) {
  let a = s
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Pool s poznatim brojem pitanja po nivou.
const pool = []
for (let d = 1; d <= 3; d++) {
  for (let i = 0; i < 40; i++) pool.push({ id: `d${d}-${i}`, difficulty: d })
}
const byId = new Map(pool.map((q) => [q.id, q]))
const nivoiIzbora = (ids) => ids.map((id) => nivo(byId.get(id) || {}))

// ---------------------------------------------------------------------------
naslov('1. Faza turnira se čita iz preostalih rundi, ne iz broja runde')
jednako(profilRunde(5, 5).ime, 'finale', 'zadnja runda je finale')
jednako(profilRunde(4, 5).ime, 'polufinale', 'pretposljednja je polufinale')
jednako(profilRunde(3, 5).ime, 'četvrtfinale', 'treća od pet je četvrtfinale')
jednako(profilRunde(1, 5).ime, 'rane runde', 'prva od pet je rana runda')
jednako(profilRunde(2, 5).ime, 'rane runde', 'druga od pet je rana runda')
// Mali turnir: ista ljestvica bez posebnog slučaja.
jednako(profilRunde(1, 1).ime, 'finale', 'turnir od jedne runde je odmah finale')
jednako(profilRunde(1, 2).ime, 'polufinale', 'turnir od dvije runde počinje polufinalom')
jednako(profilRunde(2, 2).ime, 'finale', '…i završava finalem')

// ---------------------------------------------------------------------------
naslov('2. Svaka runda daje tačno 10 pitanja, bez ponavljanja')
for (const rounds of [1, 2, 3, 4, 5]) {
  for (let r = 1; r <= rounds; r++) {
    const ids = izaberiPitanjaZaRundu(pool, r, rounds, 10, sjeme(r * 31 + rounds))
    jednako(ids.length, 10, `runda ${r}/${rounds}: broj pitanja`)
    jednako(new Set(ids).size, ids.length, `runda ${r}/${rounds}: bez duplikata`)
  }
}

// ---------------------------------------------------------------------------
naslov('3. Ljestvica: prosječna težina raste ka finalu')
const prosjek = (ids) => nivoiIzbora(ids).reduce((s, x) => s + x, 0) / ids.length
const rounds = 5
const prosjeci = []
for (let r = 1; r <= rounds; r++) {
  prosjeci.push(prosjek(izaberiPitanjaZaRundu(pool, r, rounds, 10, sjeme(7))))
}
ok(prosjeci[0] < prosjeci[2], `rana runda (${prosjeci[0]}) lakša od četvrtfinala (${prosjeci[2]})`)
ok(prosjeci[2] < prosjeci[3], `četvrtfinale (${prosjeci[2]}) lakše od polufinala (${prosjeci[3]})`)
ok(prosjeci[3] < prosjeci[4], `polufinale (${prosjeci[3]}) lakše od finala (${prosjeci[4]})`)
jednako(prosjeci[4], 3, 'finale je 10× težina 3')

// Konkretan sastav, da se ljestvica ne pomjeri neprimijećeno.
const broji = (ids, d) => nivoiIzbora(ids).filter((x) => x === d).length
const finale = izaberiPitanjaZaRundu(pool, 5, 5, 10, sjeme(1))
const polu = izaberiPitanjaZaRundu(pool, 4, 5, 10, sjeme(1))
const cetvrt = izaberiPitanjaZaRundu(pool, 3, 5, 10, sjeme(1))
const rana = izaberiPitanjaZaRundu(pool, 1, 5, 10, sjeme(1))
jednako(broji(finale, 3), 10, 'finale: 10 najtežih')
jednako(broji(polu, 3), 6, 'polufinale: 6 najtežih')
jednako(broji(polu, 2), 4, 'polufinale: 4 srednja')
jednako(broji(cetvrt, 3), 3, 'četvrtfinale: 3 najteža')
jednako(broji(cetvrt, 2), 7, 'četvrtfinale: 7 srednjih')
jednako(broji(rana, 2), 6, 'rane runde: 6 srednjih')
jednako(broji(rana, 1), 4, 'rane runde: 4 laka')

// ---------------------------------------------------------------------------
naslov('4. Unutar nivoa bira se ono što se najviše griješi')
// Isti nivo, različita statistika: pitanje koje svi pogađaju ne smije istisnuti
// ono koje svi griješe.
const saStatistikom = [
  { id: 'lako', difficulty: 3, n: 100, t: 95 }, // 5% grešaka
  { id: 'tesko', difficulty: 3, n: 100, t: 10 }, // 90% grešaka
  { id: 'srednje', difficulty: 3, n: 100, t: 50 },
]
jednako(empirijska(saStatistikom[0]).toFixed(2), '0.05', 'empirijska težina lakog')
jednako(empirijska(saStatistikom[1]).toFixed(2), '0.90', 'empirijska težina teškog')
jednako(empirijska({ n: MIN_UZORAK - 1, t: 0 }), null, 'ispod praga uzorka nema ocjene')
jednako(empirijska({ n: MIN_UZORAK, t: 0 }), 1, 'tačno na pragu uzorka ocjena postoji')

// Izbor NIJE "uzmi apsolutno najteže" — to bi svakom turniru dalo isto finale.
// Pravilo je: bira se iz kruga najtežih (SIRINA), pa lakša polovina nikad ne
// uđe. Provjerava se baš to, na bazenu gdje je krug stvarni podskup.
const gradirano = Array.from({ length: 10 }, (_, i) => ({
  id: `q${i}`, // q0 se najviše griješi, q9 najmanje
  difficulty: 3,
  n: 100,
  t: i * 10,
}))
const lakaPolovina = ['q5', 'q6', 'q7', 'q8', 'q9']
let upalaLaka = 0
for (let s = 0; s < 30; s++) {
  const izbor = izaberiPitanjaZaRundu(gradirano, 1, 1, 2, sjeme(s))
  if (izbor.some((id) => lakaPolovina.includes(id))) upalaLaka++
}
jednako(upalaLaka, 0, 'lakša polovina nikad ne uđe u izbor od 2')

// …a unutar kruga izbor varira, inače bi finale bilo uvijek isto.
const varijante = new Set()
for (let s = 0; s < 30; s++) {
  varijante.add(izaberiPitanjaZaRundu(gradirano, 1, 1, 2, sjeme(s)).join())
}
ok(varijante.size > 1, `izbor unutar kruga varira (različitih: ${varijante.size})`)

// Pitanje bez uzorka ide u SREDINU: ne ispada iz igre, ali ni ne preskače ono
// za koje se zna da se griješi. Bazen je krojen tako da krug (2 × SIRINA = 5)
// obuhvati tačno 4 poznato teška + nepoznato — poznato lako mora ostati vani.
const mjesano = [
  ...Array.from({ length: 4 }, (_, i) => ({ id: `tesko${i}`, difficulty: 3, n: 50, t: 5 })),
  { id: 'nepoznato', difficulty: 3 },
  ...Array.from({ length: 4 }, (_, i) => ({ id: `lako${i}`, difficulty: 3, n: 50, t: 48 })),
]
let upaloLako = 0
let upaloNepoznato = 0
for (let s = 0; s < 30; s++) {
  const izbor = izaberiPitanjaZaRundu(mjesano, 1, 1, 2, sjeme(s))
  if (izbor.some((id) => id.startsWith('lako'))) upaloLako++
  if (izbor.includes('nepoznato')) upaloNepoznato++
}
jednako(upaloLako, 0, 'poznato lako ne ulazi dok ima nepoznatih i poznato teških')
ok(upaloNepoznato > 0, `nepoznato pitanje se ipak nudi (${upaloNepoznato}/30) — ne ispada iz igre`)

// Skaliranje mixa na traženi broj (mix je zapisan na 10).
const r10 = raspodjela({ 3: 6, 2: 4 }, 10)
jednako(r10.get(3), 6, 'mix od 10 ostaje netaknut (težina 3)')
jednako(r10.get(2), 4, 'mix od 10 ostaje netaknut (težina 2)')
const r5 = raspodjela({ 3: 6, 2: 4 }, 5)
jednako(r5.get(3) + r5.get(2), 5, 'skalirano na 5 daje tačno 5')
jednako(r5.get(3), 3, 'skalirano na 5: 3 teža')
jednako(raspodjela({ 3: 10 }, 2).get(3), 2, 'finale skalirano na 2 uzima oba iz najtežih')
jednako(raspodjela({ 2: 6, 1: 4 }, 3).get(2) + raspodjela({ 2: 6, 1: 4 }, 3).get(1), 3, 'nema gubitka na zaokruživanju')

// ---------------------------------------------------------------------------
naslov('5. Finale nije uvijek isto — bira se iz kruga najtežih')
const razliciti = new Set()
for (let s = 0; s < 20; s++) {
  razliciti.add(izaberiPitanjaZaRundu(pool, 5, 5, 10, sjeme(s)).join())
}
ok(razliciti.size > 1, `20 turnira nije dalo isto finale (različitih: ${razliciti.size})`)

// ---------------------------------------------------------------------------
naslov('6. Uski bazen: posuđuje se, ali se uvijek vrati punih 10')
const malo = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `t${i}`, difficulty: 3 })),
  ...Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, difficulty: 2 })),
]
const finaleMalo = izaberiPitanjaZaRundu(malo, 2, 2, 10, sjeme(9))
jednako(finaleMalo.length, 10, 'finale iz uskog bazena i dalje ima 10 pitanja')
jednako(
  finaleMalo.filter((id) => malo.some((q) => q.id === id)).length,
  10,
  'svako izabrano pitanje stvarno postoji u bazenu'
)
jednako(finaleMalo.filter((id) => id.startsWith('t')).length, 3, 'sva 3 najteža su unutra')
ok(
  ['t0', 't1', 't2'].every((id) => finaleMalo.includes(id)),
  'sva raspoloživa najteža su iskorištena prije posudbe'
)

// Bazen manji od 10 → vrati koliko ima, bez pada.
jednako(izaberiPitanjaZaRundu(malo.slice(0, 4), 1, 3, 10, sjeme(2)).length, 4, 'bazen od 4 vraća 4')
jednako(izaberiPitanjaZaRundu([], 1, 3, 10, sjeme(2)).length, 0, 'prazan bazen ne ruši izbor')

// Pitanja bez upisane težine idu u sredinu, ne ispadaju.
jednako(nivo({}), 2, 'bez difficulty → srednja težina')
jednako(nivo({ difficulty: 0 }), 2, 'besmislena težina → srednja')
jednako(nivo({ difficulty: 7 }), 2, 'težina van opsega → srednja')
jednako(nivo({ difficulty: 3 }), 3, 'ispravna težina se poštuje')

// ---------------------------------------------------------------------------
naslov('7. Stvarna banka pitanja pokriva ljestvicu')
const stvarna = []
for (const f of readdirSync(__dirname).filter((x) => x.startsWith('pitanja-') && x.endsWith('.json'))) {
  for (const q of JSON.parse(readFileSync(join(__dirname, f), 'utf8'))) {
    stvarna.push({ id: `${f}:${stvarna.length}`, difficulty: q.difficulty })
  }
}
const poNivou = [1, 2, 3].map((d) => stvarna.filter((q) => nivo(q) === d).length)
console.log(`  (banka: ${stvarna.length} pitanja — lakih ${poNivou[0]}, srednjih ${poNivou[1]}, teških ${poNivou[2]})`)
for (const p of PROFILI) {
  for (const [d, n] of Object.entries(p.mix)) {
    ok(
      poNivou[Number(d) - 1] >= n,
      `${p.ime}: banka ima ${poNivou[Number(d) - 1]} pitanja težine ${d}, treba bar ${n}`
    )
  }
}
// Najoštriji uslov: finale traži 10 pitanja težine 3 iz kruga koji nije uzak.
ok(poNivou[2] >= 25, `za finale je poželjno bar 25 pitanja težine 3 (ima ih ${poNivou[2]})`)

console.log(`\n${prosao} prošlo, ${pao} palo`)
process.exit(pao === 0 ? 0 : 1)
