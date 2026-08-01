/* Izbor pitanja po TEŽINI RUNDE u 1v1 turniru — čista pravila, bez Firestorea.
 *
 * Isti obrazac kao duel-pravila.js i quest-izbor.js: sve što bira pitanja stoji
 * ovdje i testira se s `npm run test-tezina`, bez emulatora.
 *
 * ZAŠTO POSTOJI (Faza 1, 01.08.2026.)
 * Do sada je svaki meč — i prvi krug i finale — dobijao 10 nasumičnih pitanja
 * iz cijele banke. Finale time nije bilo teže od prve runde, pa prolaz kroz
 * bracket nije značio ništa osim sreće u parovima.
 *
 * KAKO SE MJERI TEŽINA — dva izvora, oba bez lične istorije igrača:
 *   1. `difficulty` (1–3) upisan uz pitanje pri uvozu — gruba, ali odmah
 *      dostupna podjela;
 *   2. GLOBALNI procenat tačnih odgovora iz stats/pitanja — koliko igrači to
 *      pitanje stvarno griješe. Unutar istog nivoa težine bira se ono što se
 *      najviše griješi.
 *
 * Lična istorija ("nije vidio", "griješi baš on") NAMJERNO nije u Fazi 1: ona
 * kažnjava one koji više igraju (manji bazen neviđenih) i stvara podsticaj da
 * se pred turnir NE igra kviz. Vidi Fazu 2 u ARENA-EVENTI.md.
 */

// Broj pitanja po nivou težine za svaku fazu turnira. Ključ je `preostalo` —
// koliko rundi ima DO FINALA (0 = finale). Tako ista ljestvica radi i za turnir
// od 2 runde i za onaj od 5, bez posebnog slučaja.
//
// `rezerva` je redoslijed posuđivanja kad nivo nema dovoljno pitanja: u kasnim
// rundama se posuđuje od težih, u ranim od lakših — da dopuna nikad ne obori
// karakter runde.
export const PROFILI = [
  { ime: 'finale', mix: { 3: 10 }, rezerva: [3, 2, 1] },
  { ime: 'polufinale', mix: { 3: 6, 2: 4 }, rezerva: [3, 2, 1] },
  { ime: 'četvrtfinale', mix: { 3: 3, 2: 7 }, rezerva: [2, 3, 1] },
  { ime: 'rane runde', mix: { 2: 6, 1: 4 }, rezerva: [2, 1, 3] },
]

// Ispod ovoliko odgovora procenat tačnosti je šum, pa se pitanje tretira kao
// "nepoznato" i ide u sredinu poretka — ni nagrađeno ni kažnjeno.
export const MIN_UZORAK = 5

// Iz koliko puta većeg kruga najtežih se bira. 1 bi značilo da finale UVIJEK
// nosi istih 10 pitanja; ovako je izbor iz najtežeg dijela, ali ne isti svaki
// put. Vrijednost je namjerno mala — širi krug razvodni "najteže".
export const SIRINA = 2.5

// Faza turnira za datu rundu. Turnir od 2 runde počinje od polufinala.
export function profilRunde(round, rounds) {
  const preostalo = Math.max(0, (rounds || 1) - (round || 1))
  return PROFILI[Math.min(preostalo, PROFILI.length - 1)]
}

// Nivo težine pitanja. Pitanja bez upisane težine (starija) idu u sredinu —
// izbaciti ih iz igre bilo bi gore nego pretpostaviti prosjek.
export function nivo(q) {
  const d = Math.round(Number(q?.difficulty))
  return d >= 1 && d <= 3 ? d : 2
}

// Empirijska težina: udio NETAČNIH odgovora (0 = svi pogode, 1 = niko).
// Vraća null dok uzorak nije dovoljan — to nije isto što i "lako".
export function empirijska(q) {
  const n = q?.n || 0
  if (n < MIN_UZORAK) return null
  return 1 - (q.t || 0) / n
}

// Poredak unutar nivoa: prvo ono što igrači stvarno griješe.
function poTezini(a, b) {
  return (empirijska(b) ?? 0.5) - (empirijska(a) ?? 0.5)
}

// Mix profila je zapisan na 10 pitanja (koliko duel i ima). Za bilo koji drugi
// broj se skalira, jer bi inače izbor uzeo punih 10 pa ih na kraju odsjekao na
// traženi broj — a tada bi odluka o tome ŠTA ostaje bila nasumična i cijela
// ljestvica bez učinka.
//
// Ostatak poslije zaokruživanja ide onome ko ga je "najviše zaslužio" (najveći
// decimalni dio), a kod izjednačenja težem nivou.
export function raspodjela(mix, koliko) {
  const ukupno = Object.values(mix).reduce((s, x) => s + x, 0) || 1
  const stavke = Object.entries(mix).map(([d, n]) => ({ d: Number(d), tacno: (n / ukupno) * koliko }))
  const out = new Map(stavke.map((x) => [x.d, Math.floor(x.tacno)]))
  let ostalo = koliko - [...out.values()].reduce((s, x) => s + x, 0)
  stavke.sort((a, b) => ((b.tacno % 1) - (a.tacno % 1)) || b.d - a.d)
  for (let i = 0; ostalo > 0 && stavke.length > 0; i = (i + 1) % stavke.length, ostalo--) {
    out.set(stavke[i].d, out.get(stavke[i].d) + 1)
  }
  return out
}

function promijesaj(list, rnd) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Pitanja za jedan meč date runde. Vraća niz ID-eva (najviše `koliko`).
//
// Pool su stavke iz bank/index (`{ id, difficulty, … }`), po mogućnosti spojene
// sa stats/pitanja (`{ n, t }`). Bez statistike sve i dalje radi — ostaje samo
// podjela po `difficulty`.
export function izaberiPitanjaZaRundu(pool, round, rounds, koliko = 10, rnd = Math.random) {
  const profil = profilRunde(round, rounds)
  const poNivou = new Map([
    [1, []],
    [2, []],
    [3, []],
  ])
  for (const q of pool || []) {
    if (q?.id) poNivou.get(nivo(q)).push(q)
  }
  for (const lista of poNivou.values()) lista.sort(poTezini)

  const uzeto = new Set()
  const uzmi = (nivoi, n) => {
    if (n <= 0) return
    const kandidati = nivoi
      .flatMap((d) => poNivou.get(d) || [])
      .filter((q) => !uzeto.has(q.id))
      .sort(poTezini)
    // Nasumično iz NAJTEŽEG kruga, a ne redom — inače bi svaki turnir imao
    // isto finale dok se statistika ne pomjeri.
    const krug = kandidati.slice(0, Math.max(n, Math.ceil(n * SIRINA)))
    for (const q of promijesaj(krug, rnd).slice(0, n)) uzeto.add(q.id)
  }

  // Od težeg ka lakšem: teži nivoi su uvijek uži, pa prvi biraju.
  const koliko_po_nivou = raspodjela(profil.mix, koliko)
  for (const d of [3, 2, 1]) uzmi([d], koliko_po_nivou.get(d) || 0)
  // Nivo nije imao dovoljno pitanja → posudi po redoslijedu rezerve.
  if (uzeto.size < koliko) uzmi(profil.rezerva, koliko - uzeto.size)

  return [...uzeto].slice(0, koliko)
}
