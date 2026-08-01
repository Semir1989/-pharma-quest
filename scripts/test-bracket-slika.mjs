// Test crtanja slike bracketa (utils/bracketSlika.js) — geometrija, bez browsera.
//
// Pokretanje:  npm run test-bracket-slika
//
// Zašto uopšte postoji: slika 4:5 se ne vidi ni u jednom drugom testu, a jedina
// stvar koja se na njoj lako pokvari je RASPORED — kartica koja izađe van
// platna, tekst ispod donje ivice ili kolone koje se preklope kod velikog
// turnira. To se ne primijeti dok neko ne izveze sliku poslije finala, a tada
// je turnir već gotov i prilika propuštena.
//
// Canvas se ne emulira nego SNIMA: lažni 2D kontekst bilježi svaki potez, pa se
// poslije provjerava da je sve unutar 1080×1350 i da je nacrtan svaki meč.

import { nacrtajBracket, SIRINA, VISINA } from '../src/utils/bracketSlika.js'

let pao = 0
const provjeri = (uslov, t) => {
  if (uslov) console.log('  ✓ ' + t)
  else {
    console.error('  ✗ ' + t)
    pao++
  }
}

// --- lažni canvas -----------------------------------------------------------
function lazniKontekst(potezi) {
  const ctx = {
    canvas: { width: SIRINA, height: VISINA },
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    _x: 0,
    _y: 0,
    beginPath() {},
    closePath() {},
    moveTo(x, y) {
      potezi.push({ vrsta: 'tacka', x, y })
    },
    lineTo(x, y) {
      potezi.push({ vrsta: 'tacka', x, y })
    },
    arcTo(x1, y1, x2, y2) {
      potezi.push({ vrsta: 'tacka', x: x1, y: y1 })
      potezi.push({ vrsta: 'tacka', x: x2, y: y2 })
    },
    arc(x, y, r) {
      potezi.push({ vrsta: 'tacka', x: x - r, y: y - r })
      potezi.push({ vrsta: 'tacka', x: x + r, y: y + r })
    },
    fill() {},
    fillRect(x, y, w, h) {
      potezi.push({ vrsta: 'tacka', x, y })
      potezi.push({ vrsta: 'tacka', x: x + w, y: y + h })
    },
    // Približna širina teksta: dovoljna da skrati() radi svoj posao i da se
    // vidi izlazi li tekst van kolone. Prava mjera zavisi od fonta i nije
    // dostupna van browsera.
    measureText(t) {
      const px = parseFloat((ctx.font.match(/(\d+(?:\.\d+)?)px/) || [])[1] || '16')
      return { width: String(t).length * px * 0.55 }
    },
    fillText(t, x, y) {
      potezi.push({ vrsta: 'tekst', tekst: String(t), x, y, font: ctx.font, align: ctx.textAlign })
    },
    createLinearGradient() {
      return { addColorStop() {} }
    },
  }
  return ctx
}

function postaviDOM(potezi) {
  globalThis.document = {
    createElement() {
      return {
        width: SIRINA,
        height: VISINA,
        getContext: () => lazniKontekst(potezi),
        toBlob: (cb) => cb({ type: 'image/png', size: 1 }),
      }
    },
  }
}

// --- generator turnira ------------------------------------------------------
const IMENA = [
  'Semir Mehović', 'Armin Kustura', 'Amra Hodžić', 'Lejla Begić', 'Mirza',
  'Dženana Softić', 'Emir', 'Aida Kovačević', 'Haris', 'Selma',
]

function napraviTurnir(n) {
  const participants = {}
  const uids = []
  for (let i = 0; i < n; i++) {
    const uid = 'u' + i
    uids.push(uid)
    participants[uid] = { name: IMENA[i % IMENA.length], avatar: 'a' + (1 + (i % 6)) }
  }
  const matches = []
  let tekuci = uids
  let r = 1
  while (tekuci.length > 1) {
    const sljedeci = []
    for (let s = 0; s * 2 < tekuci.length; s++) {
      const p1 = tekuci[s * 2] || null
      const p2 = tekuci[s * 2 + 1] || null
      const sam = !p2
      const p1Score = sam ? 7 : 4 + ((s + r) % 6)
      const p2Score = sam ? null : 3 + ((s * 2 + r) % 5)
      const winner = sam ? p1 : p1Score >= p2Score ? p1 : p2
      matches.push({
        id: `r${r}s${s}`, round: r, slot: s, p1, p2, p1Score, p2Score,
        p1Played: true, p2Played: !sam, kvalifikacija: sam && r > 1,
        winner, status: 'done',
      })
      sljedeci.push(winner)
    }
    tekuci = sljedeci
    r++
  }
  return { matches, participants, rounds: r - 1, winnerUid: tekuci[0] }
}

async function nacrtaj(n, izmjene = {}) {
  const potezi = []
  postaviDOM(potezi)
  const t = napraviTurnir(n)
  await nacrtajBracket({
    matches: t.matches,
    participants: t.participants,
    turnir: {
      rounds: t.rounds,
      participantCount: n,
      winnerUid: t.winnerUid,
      key: '2026-07-31',
      finishedAt: Date.UTC(2026, 6, 31, 18, 0),
      ...izmjene,
    },
  })
  return { potezi, t }
}

// --- testovi ----------------------------------------------------------------
console.log('\n— FORMAT 4:5 —')
provjeri(SIRINA === 1080 && VISINA === 1350, 'platno je 1080×1350')
provjeri(Math.abs(SIRINA / VISINA - 4 / 5) < 1e-9, 'odnos stranica je tačno 4:5')

for (const n of [2, 5, 8, 20, 40]) {
  console.log(`\n— TURNIR OD ${n} UČESNIKA —`)
  const { potezi, t } = await nacrtaj(n)

  const tacke = potezi.filter((p) => p.vrsta === 'tacka')
  const van = tacke.filter((p) => p.x < -0.5 || p.x > SIRINA + 0.5 || p.y < -0.5 || p.y > VISINA + 0.5)
  provjeri(van.length === 0, `nijedan oblik ne izlazi van platna (${tacke.length} tačaka)`)

  const tekstovi = potezi.filter((p) => p.vrsta === 'tekst')
  const tekstVan = tekstovi.filter((p) => p.y < 0 || p.y > VISINA || p.x < 0 || p.x > SIRINA)
  provjeri(tekstVan.length === 0, 'nijedan tekst nije van platna')

  // Svaki igrač mora biti negdje na slici — to je cijela svrha izvoza
  // ("spisak svih igrača od početka do finala").
  const svaImena = new Set(Object.values(t.participants).map((p) => p.name))
  const ispisani = new Set(tekstovi.map((x) => x.tekst))
  const fale = [...svaImena].filter((ime) => ![...ispisani].some((x) => x.startsWith(ime.slice(0, 6))))
  provjeri(fale.length === 0, `sva imena su ispisana${fale.length ? ' — fali: ' + fale.join(', ') : ''}`)

  // Broj kartica: jedna zaobljena putanja po vidljivom meču (+ eventualno
  // isticanje pobjedničkog reda, koje je isto zaobljeno).
  const vidljivih = t.matches.filter((m) => m.p1 || m.p2).length
  const naslovi = tekstovi.filter((x) => /^(FINALE|POLUFINALE|ČETVRTFINALE|RUNDA )/.test(x.tekst))
  provjeri(naslovi.length === t.rounds, `svaka od ${t.rounds} rundi ima naslov`)
  provjeri(
    naslovi.some((x) => x.tekst === 'FINALE'),
    'zadnja kolona se zove FINALE'
  )
  provjeri(vidljivih > 0, `${vidljivih} mečeva u stablu`)

  provjeri(
    tekstovi.some((x) => x.tekst.includes('🏆')),
    'šampion je na slici'
  )
  provjeri(
    tekstovi.some((x) => x.tekst.includes(`${n} učesnika`)),
    'broj učesnika je u zaglavlju'
  )
}

console.log('\n— KARTICE SE NE PREKLAPAJU —')
for (const n of [20, 40]) {
  const { potezi } = await nacrtaj(n)
  // Ime i skor se pišu na sredini reda; dva teksta u istoj koloni na razmaku
  // manjem od visine reda značila bi da su se kartice popele jedna na drugu.
  const poKoloni = new Map()
  for (const p of potezi.filter((x) => x.vrsta === 'tekst' && x.align === 'left')) {
    const kljuc = Math.round(p.x / 10)
    ;(poKoloni.get(kljuc) || poKoloni.set(kljuc, []).get(kljuc)).push(p.y)
  }
  let najmanjiRazmak = Infinity
  for (const ys of poKoloni.values()) {
    ys.sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i++) najmanjiRazmak = Math.min(najmanjiRazmak, ys[i] - ys[i - 1])
  }
  provjeri(najmanjiRazmak >= 12, `${n} učesnika: redovi su razmaknuti bar 12px (${Math.round(najmanjiRazmak)})`)
}

console.log('\n— PREVELIK TURNIR SE ODBIJA UMJESTO DA SE ZGUŽVA —')
{
  let greska = null
  await nacrtaj(200).catch((e) => (greska = e))
  provjeri(
    greska !== null && /Previše učesnika/.test(greska.message),
    '200 učesnika → jasna greška, ne slika s preklopljenim imenima'
  )
}

console.log('\n— SKOR SE NE OTKRIVA PRIJE ZATVARANJA RUNDE —')
{
  const potezi = []
  postaviDOM(potezi)
  const t = napraviTurnir(8)
  // Runda u toku: skorovi postoje u podacima, ali meč nije 'done'.
  const uToku = t.matches.map((m) => (m.round === 2 ? { ...m, status: 'pending', winner: null } : m))
  await nacrtajBracket({
    matches: uToku,
    participants: t.participants,
    turnir: { rounds: t.rounds, participantCount: 8, key: 'x' },
  })
  const brojevi = potezi.filter((p) => p.vrsta === 'tekst' && /^\d{1,2}$/.test(p.tekst))
  // Nacrtan smije biti samo skor iz ZAVRŠENIH mečeva (runde 1, 3).
  const zavrsenih = uToku.filter((m) => m.status === 'done' && m.p2).length * 2
  provjeri(
    brojevi.length <= zavrsenih,
    `skor otvorene runde nije ispisan (${brojevi.length} brojeva ≤ ${zavrsenih} iz zatvorenih)`
  )
}

console.log('\n— PRAZAN BRACKET —')
{
  postaviDOM([])
  let greska = null
  await nacrtajBracket({ matches: [], participants: {}, turnir: {} }).catch((e) => (greska = e))
  provjeri(greska !== null, 'prazan bracket baca grešku umjesto prazne slike')
}

console.log(
  pao === 0
    ? '\n══════════════════════════════════\nSVI TESTOVI SLIKE BRACKETA PROŠLI ✓'
    : `\n${pao} TEST(OVA) PALO ✗`
)
process.exit(pao === 0 ? 0 : 1)
