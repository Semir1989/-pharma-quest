// Test pravila klanskog rata — čista logika iz functions/klan-rat.js.
// Ne treba ni emulator ni Firebase; ništa se ne upisuje.
//
// Pokretanje:  npm run test-klanrat

import {
  OBJEKTI,
  MAX_NIVO,
  cijenaNadogradnje,
  ukupnaCijena,
  bonusi,
  mnozilac,
  cpZaXp,
  pragUcesca,
  odlukaOBonusu,
  napraviParove,
  ishodMeca,
  nagradaKlanu,
  nagradaClanu,
  warIdZa,
  ratUToku,
  DNEVNI_CP_STROP,
  UCESCE_BONUS,
} from '../functions/klan-rat.js'

let pao = 0
const provjeri = (u, t) => {
  if (u) console.log('  ✓ ' + t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}
const naslov = (t) => console.log(`\n${t}`)

// BiH vrijeme kao {y,m,d,hh,mm}. 2026-07-29 je SRIJEDA.
const dan = (d, hh = 12) => ({ y: 2026, m: 7, d, hh, mm: 0 })
const PON = dan(27)
const SRI = dan(29)
const PET = dan(31)
const SUB = dan(25)
const NED = dan(26)

// --- Objekti i cijene -----------------------------------------------------
naslov('Zeleni Okrug — 9 objekata')
provjeri(OBJEKTI.length === 9, 'tačno 9 objekata')
provjeri(new Set(OBJEKTI.map((o) => o.id)).size === 9, 'svi id-evi jedinstveni')
provjeri(MAX_NIVO === 5, 'maksimalan nivo je 5')

naslov('Cijene su skalirane za mali klan')
provjeri(cijenaNadogradnje('logisticki-centar', 1) === 200, 'jeftin objekat, nivo 1 = 200')
provjeri(cijenaNadogradnje('klinicka-apoteka', 1) === 400, 'skup objekat, nivo 1 = 400')
provjeri(cijenaNadogradnje('logisticki-centar', 5) === 1600, 'jeftin objekat, nivo 5 = 1600')
provjeri(ukupnaCijena('logisticki-centar') === 4000, 'pun jeftin objekat = 4000')
provjeri(ukupnaCijena('klinicka-apoteka') === 8000, 'pun skup objekat = 8000')
provjeri(cijenaNadogradnje('logisticki-centar', 6) === null, 'nema nivoa 6')
provjeri(cijenaNadogradnje('logisticki-centar', 0) === null, 'nema nivoa 0')
provjeri(cijenaNadogradnje('nepostojeci', 1) === null, 'nepoznat objekat → null')
// Prvi nivo mora pasti u prvoj sedmici pobjede (trezor ~400 + članovi ~240).
provjeri(cijenaNadogradnje('logisticki-centar', 1) <= 640, 'prvi nivo dostižan u prvoj sedmici')

// --- Efekti ---------------------------------------------------------------
naslov('Efekti objekata')
const b0 = bonusi({})
provjeri(b0.xpBonus === 0 && b0.sekunde === 0 && b0.stitovi === 0, 'prazan Okrug ne daje ništa')
const b = bonusi({
  'logisticki-centar': 3,
  'galenski-lab': 2,
  'rnd-centar': 4,
  'dezurna-apoteka': 4,
  'biljna-apoteka': 2,
  'djecija-apoteka': 3,
  'klinicka-apoteka': 5,
  inspekcija: 5,
})
provjeri(Math.abs(b.xpBonus - 0.15) < 1e-9, 'Logistički nivo 3 = +15% XP')
provjeri(b.sekunde === 2, 'Galenski nivo 2 = +2 s')
provjeri(Math.abs(b.cpBonus - 0.2) < 1e-9, 'R&D nivo 4 = +20% CP')
provjeri(b.stitovi === 1, 'Dežurna nivo 4 = 1 štit')
provjeri(bonusi({ 'dezurna-apoteka': 5 }).stitovi === 2, 'Dežurna nivo 5 = 2 štita')
provjeri(bonusi({ 'dezurna-apoteka': 2 }).stitovi === 0, 'Dežurna nivo 2 = još bez štita')
provjeri(Math.abs(b.goldBonus - 0.2) < 1e-9, 'Biljna nivo 2 = +20% zelenih bodova')
provjeri(b.hintovi === 3, 'Klinička nivo 5 = 3 hinta sedmično')
provjeri(b.smanjenjeGubitka === 0.5, 'Inspekcija nivo 5 = −50% gubitka')
provjeri(bonusi({ 'logisticki-centar': 99 }).xpBonus === 0.25, 'nivo iznad 5 se odsijeca na 5')

// --- Množioci -------------------------------------------------------------
naslov('Množioci: srijeda i petak')
provjeri(mnozilac(PON) === 1, 'ponedjeljak bez množioca')
provjeri(mnozilac(PET, {}) === 2, 'petak 12h = 2× (Final Shift)')
provjeri(mnozilac(dan(31, 7)) === 1, 'petak 07h je PRIJE rusha → 1×')
provjeri(mnozilac(dan(31, 20)) === 1, 'petak 20h je POSLIJE rusha → 1×')
provjeri(
  mnozilac(SRI, { boostKategorija: 'interakcije', kategorija: 'interakcije' }) === 1.5,
  'srijeda + tačna kategorija = 1.5×'
)
provjeri(
  mnozilac(SRI, { boostKategorija: 'interakcije', kategorija: 'astma' }) === 1,
  'srijeda + druga kategorija = 1×'
)
provjeri(
  mnozilac(SRI, { boostKategorija: 'interakcije', dio: 0.5 }) === 1.25,
  'srijeda, pola kviza iz kategorije = 1.25×'
)
provjeri(
  mnozilac(PON, { boostKategorija: 'interakcije', kategorija: 'interakcije' }) === 1,
  'kategorija van srijede ne nosi ništa'
)
// Ključna odluka: boost i rush se SABIRAJU, ne množe.
const petakBoost = mnozilac(
  { ...PET },
  { boostKategorija: 'interakcije', kategorija: 'interakcije' }
)
provjeri(petakBoost === 2, 'petak + kategorija ostaje 2× (boost je samo srijedom)')

naslov('CP iz XP-a')
provjeri(cpZaXp(100) === 100, 'bez množioca 1 XP = 1 CP')
provjeri(cpZaXp(100, { mnoz: 2 }) === 200, 'petak dupla')
provjeri(cpZaXp(100, { mnoz: 1, cpBonus: 0.2 }) === 120, 'R&D +20%')
provjeri(cpZaXp(100, { mnoz: 2, cpBonus: 0.2 }) === 240, 'množilac i R&D se kombinuju')
provjeri(cpZaXp(0) === 0 && cpZaXp(-5) === 0, 'nula i negativno ne daju CP')
provjeri(DNEVNI_CP_STROP === 1000, 'dnevni strop po igraču je 1000')

// --- Bonus za učešće ------------------------------------------------------
naslov('Dnevni bonus za učešće')
provjeri(pragUcesca(10) === 7, 'klan od 10 traži 7 aktivnih')
provjeri(pragUcesca(8) === 6, 'klan od 8 traži 6 (zaokruženo nagore)')
provjeri(pragUcesca(3) === 3, 'klan od 3 traži 3')
provjeri(pragUcesca(1) === 1, 'klan od 1 traži 1')
provjeri(odlukaOBonusu({ aktivnih: 6, clanova: 8 }).bonus === true, '6/8 → bonus')
const bezStita = odlukaOBonusu({ aktivnih: 5, clanova: 8 })
provjeri(bezStita.bonus === false && bezStita.razlog === 'nedovoljno', '5/8 bez štita → nema bonusa')
const saStitom = odlukaOBonusu({ aktivnih: 5, clanova: 8, stitovaOstalo: 1 })
provjeri(saStitom.bonus === true && saStitom.stit === true, '5/8 sa štitom → bonus, štit potrošen')
provjeri(
  odlukaOBonusu({ aktivnih: 8, clanova: 8, stitovaOstalo: 1 }).stit === false,
  'ispunjen prag NE troši štit'
)
provjeri(UCESCE_BONUS === 100, 'bonus je +100 CP')

// --- Uparivanje -----------------------------------------------------------
naslov('Uparivanje klanova')
const k = (id, rating) => ({ id, rating })
provjeri(napraviParove([]).length === 0, 'nula klanova → nema mečeva')
provjeri(napraviParove([k('a', 10)]).length === 0, 'jedan klan → nema rata')
const p2 = napraviParove([k('a', 10), k('b', 50)])
provjeri(p2.length === 1 && p2[0].clanIds.join() === 'b,a', 'dva klana → jedan meč, jači prvi')
const p4 = napraviParove([k('a', 10), k('b', 50), k('c', 30), k('d', 40)])
provjeri(p4.length === 2, 'četiri klana → dva meča')
provjeri(p4[0].clanIds.join() === 'b,d' && p4[1].clanIds.join() === 'c,a', 'pare se susjedi po ratingu')
const p3 = napraviParove([k('a', 10), k('b', 50), k('c', 30)])
provjeri(p3.length === 1 && p3[0].grupni === true, 'tri klana → jedan grupni meč')
provjeri(p3[0].clanIds.length === 3, 'grupni meč ima tri klana')
const p5 = napraviParove([k('a', 10), k('b', 50), k('c', 30), k('d', 40), k('e', 20)])
provjeri(p5.length === 2 && p5[1].grupni === true, 'pet klanova → par + grupa od tri')
provjeri(p5.every((m) => !m.bye), 'niko ne sjedi sedmicu (nema bye)')
// Determinizam: isti ulaz, isti izlaz.
const a1 = JSON.stringify(napraviParove([k('a', 30), k('b', 30), k('c', 30), k('d', 30)]))
const a2 = JSON.stringify(napraviParove([k('d', 30), k('c', 30), k('b', 30), k('a', 30)]))
provjeri(a1 === a2, 'isti rating → deterministični parovi bez obzira na redoslijed ulaza')

// --- Ishod i nagrade ------------------------------------------------------
naslov('Ishod meča')
const i1 = ishodMeca({ a: 500, b: 300 })
provjeri(i1.pobjednik === 'a' && !i1.nerijeseno, 'više CP-a pobjeđuje')
const i2 = ishodMeca({ a: 400, b: 400 })
provjeri(i2.pobjednik === null && i2.nerijeseno, 'izjednačeno → nerješeno, bez žrijeba')
const i3 = ishodMeca({ a: 100, b: 900, c: 500 })
provjeri(i3.redoslijed[0].clanId === 'b' && i3.redoslijed[2].clanId === 'a', 'grupni meč se rangira')

naslov('Nagrade')
const pob = nagradaKlanu({ mjesto: 0, nerijeseno: false, cp: 5000 })
provjeri(pob.rating === 30, 'pobjednik +30 ratinga')
provjeri(pob.gold === 400, 'pobjednik: 300 + 5000/50 = 400 zelenih bodova')
const gub = nagradaKlanu({ mjesto: 1, nerijeseno: false, cp: 3000 })
provjeri(gub.rating === 5, 'poraženi +5 ratinga (ne oduzima se)')
provjeri(gub.gold === 180, 'poraženi: 120 + 3000/50 = 180')
const nerij = nagradaKlanu({ mjesto: 0, nerijeseno: true, cp: 1000 })
provjeri(nerij.rating === 15, 'nerješeno +15 ratinga objema')
provjeri(
  nagradaKlanu({ mjesto: 0, nerijeseno: false, cp: 5000, goldBonus: 0.2 }).gold === 480,
  'Biljna Apoteka +20% na zelene bodove'
)
// Inspekcija radi tek ako gubitak ratinga uopšte postoji.
provjeri(
  nagradaKlanu({ mjesto: 1, nerijeseno: false, cp: 0, ratingPoraz: -20, smanjenjeGubitka: 0.5 })
    .rating === -10,
  'Inspekcija prepolovi gubitak (−20 → −10)'
)
provjeri(
  nagradaKlanu({ mjesto: 1, nerijeseno: false, cp: 0, smanjenjeGubitka: 0.5 }).rating === 5,
  'Inspekcija ne dira POZITIVAN rating'
)
provjeri(nagradaClanu({ mojCp: 0 }) === 0, 'neaktivan član ne dobija ništa')
provjeri(nagradaClanu({ mojCp: 300 }) === 23, 'član s 300 CP u poraženom klanu = 23')
provjeri(nagradaClanu({ mojCp: 300, pobjednik: true }) === 35, 'isti član u pobjedniku = 35')

// --- Ključevi i prozori ---------------------------------------------------
naslov('Ključevi i prozori')
provjeri(warIdZa(SRI) === '2026-07-27', 'srijeda pripada ratu od ponedjeljka 27.')
provjeri(warIdZa(PET) === '2026-07-27', 'petak pripada istoj sedmici')
provjeri(warIdZa(NED) === '2026-07-27', 'nedjelja gađa SUTRAŠNJI ponedjeljak')
provjeri(warIdZa(SUB) === '2026-07-20', 'subota još pripada ratu koji ističe')
provjeri(ratUToku(SRI) === true, 'srijeda: rat traje')
provjeri(ratUToku(dan(27, 7)) === false, 'ponedjeljak 07h: još nije počeo')
provjeri(ratUToku(dan(27, 8)) === true, 'ponedjeljak 08h: počeo')
provjeri(ratUToku(dan(31, 19)) === true, 'petak 19h: još traje')
provjeri(ratUToku(dan(31, 20)) === false, 'petak 20h: gotovo')
provjeri(ratUToku(SUB) === false && ratUToku(NED) === false, 'vikend je slobodan')

console.log('\n══════════════════════════════════')
if (pao === 0) console.log('SVI TESTOVI KLANSKOG RATA PROŠLI ✓')
else {
  console.error(`PALO PROVJERA: ${pao}`)
  process.exitCode = 1
}
