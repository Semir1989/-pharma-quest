/* Izbor questova — čista pravila, bez Firestorea.
 *
 * Izdvojeno iz index.js 31.07.2026. da se može testirati bez emulatora
 * (`npm run test-questovi`), isti obrazac kao klan-pravila.js i notif-odluka.js.
 *
 * Model: svaki igrač u periodu dobija TASK_COUNT[tip] questova iz bazena.
 * Izbor je DETERMINISTIČAN po (uid, period) — isti igrač isti dan uvijek dobije
 * isto, pa server ne mora pamtiti odluku prije nego je zamrzne, a dva paralelna
 * poziva ne mogu proizvesti različite liste.
 *
 * Tri vrste questova u bazenu:
 *   - `always: true`  uvijek u izboru, ne rotiraju se i ne mogu se zamijeniti
 *                     žetonom (vanjski EPC zadaci — vidi postavi-taskove.js)
 *   - `event: '...'`  ulaze samo dok je taj event živ za igrača; najviše JEDAN
 *   - ostali          obični bazen iz kojeg se dopunjava do punog broja
 */

// Od 31.07.2026.: 5 / 6 / 7 (bilo 3 / 5 / 4).
export const TASK_COUNT = { daily: 5, weekly: 6, monthly: 7 }

export function seedFrom(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededPick(list, n, seed) {
  if (n <= 0) return []
  const rnd = mulberry32(seed)
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

// Izbor questova jednog tipa za jednog igrača u jednom periodu.
//
// Redoslijed popunjavanja je bitan i namjeran:
//   1. `always` questovi — oni su obećanje igraču ("uvijek je tu"), pa uzimaju
//      mjesta prvi. Ako ih ikad bude više od TASK_COUNT, višak otpada
//      deterministički (po `order`), a ne nasumično.
//   2. jedan event quest, ako je event živ
//   3. ostatak iz običnog bazena
//
// Vraća listu ID-eva sortiranu po `order`.
export function pickTaskIds(pool, uid, type, period, events, count = TASK_COUNT[type] || 3) {
  const svi = pool.filter((t) => t.type === type)
  const uvijek = svi
    .filter((t) => t.always && !t.event)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
  const base = svi.filter((t) => !t.event && !t.always)
  const eventTasks = svi.filter((t) => t.event && events.includes(t.event))

  // Sjeme je (uid, period) — periodi različitih tipova su različiti stringovi
  // ('2026-07-30', '2026-W31', '2026-07'), pa se izbori ne poklapaju.
  const seed = seedFrom(`${uid}|${period}`)

  const chosen = uvijek.slice(0, count)
  if (eventTasks.length > 0 && chosen.length < count) {
    chosen.push(...seededPick(eventTasks, 1, seed ^ 0x9e3779b9))
  }
  chosen.push(...seededPick(base, count - chosen.length, seed))

  return chosen.sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => t.id)
}

// Dopuna VEĆ ZAMRZNUTOG izbora — bez uklanjanja ijednog questa.
//
// Zašto postoji: izbor se zamrzne na početku perioda i ne dira se do kraja. Kad
// se usred perioda poveća TASK_COUNT ili doda novi `always` quest, igrači bi
// te promjene vidjeli tek na sljedeći period — mjesečni izbor bi čekao i po
// mjesec dana. Ovo ih dopuni odmah.
//
// Pravilo je jednosmjerno: SAMO DODAJE. Uklanjanje bi igraču pojelo quest na
// kojem je već napredovao (ili ga ispunio a nije preuzeo nagradu).
//
// Dopuna NAMJERNO ne ubacuje event questove: izbor ih već ima ako je event bio
// živ pri zamrzavanju, a naknadno dodavanje bi igraču usred sedmice donijelo
// zadatak koji možda ne stigne odigrati.
//
// Vraća novu listu, ili `null` ako nema šta dodati (pozivalac tada preskače upis).
export function dopuniIzbor(picked, pool, uid, type, period, count = TASK_COUNT[type] || 3) {
  const svi = pool.filter((t) => t.type === type)
  const uPoolu = new Set(svi.map((t) => t.id))
  const rezultat = [...picked]
  const imam = new Set(picked)

  // 1. Stalni questovi koji nedostaju — oni su obećanje, idu prvi.
  for (const t of svi.filter((x) => x.always && !x.event)) {
    if (!imam.has(t.id)) {
      rezultat.push(t.id)
      imam.add(t.id)
    }
  }

  // 2. Dopuna do punog broja. Broje se samo questovi koji STVARNO postoje u
  //    bazenu — tako se izbor sam zakrpi i kad je neki quest u međuvremenu
  //    ugašen.
  const vazecih = () => rezultat.filter((id) => uPoolu.has(id)).length
  if (vazecih() < count) {
    const kandidati = svi.filter((t) => !t.event && !t.always && !imam.has(t.id))
    // Drugo sjeme od početnog izbora: da dopuna ne bi ponovila redoslijed po
    // kojem su questovi već izabrani i time uvijek dodavala isti "sljedeći".
    const dodaci = seededPick(kandidati, count - vazecih(), seedFrom(`${uid}|${period}|dopuna`))
    for (const t of dodaci) {
      rezultat.push(t.id)
      imam.add(t.id)
    }
  }

  if (rezultat.length === picked.length) return null

  const redoslijed = new Map(svi.map((t) => [t.id, t.order || 0]))
  return rezultat.sort((a, b) => (redoslijed.get(a) ?? 0) - (redoslijed.get(b) ?? 0))
}

// Smije li se ovaj quest zamijeniti žetonom.
// `always` questovi ne smiju: zamjena bi ih uklonila do kraja perioda, a onda
// "uvijek prisutan" ne bi bio istinit. Isti razlog vrijedi i za kandidate —
// zamjenom se ne smije dobiti quest koji igrač ionako već ima.
export function smijeSeZamijeniti(task) {
  return !!task && task.always !== true
}
